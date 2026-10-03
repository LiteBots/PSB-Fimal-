'use strict';
/* Sesje, CSRF, koszyk, terminy odbioru, dziennik zdarzeń. */
const crypto = require('crypto');
const { q, getSettings } = require('./db');
const { ymd, parseYmd, pad, DAYS_SHORT, MONTHS, effPrice, now, int } = require('./util');

/* ---------- Sesje w SQLite ---------- */
const SESSION_DAYS = 30;
function sessionMiddleware(app) {
  return (req, res) => {
    let sid = req.cookies.fsid;
    let data = null;
    if (sid && /^[a-f0-9]{48}$/.test(sid)) {
      const row = q.get('SELECT data, expires FROM sessions WHERE id=?', sid);
      if (row && row.expires > Date.now()) { try { data = JSON.parse(row.data); } catch { data = null; } }
    }
    if (!data) { sid = null; data = {}; }
    req.session = data;
    req._sid = sid;
    req._sessionInitial = JSON.stringify(data);
    req.regenerateSession = () => { if (req._sid) q.run('DELETE FROM sessions WHERE id=?', req._sid); req._sid = null; };
    req.destroySession = () => { if (req._sid) q.run('DELETE FROM sessions WHERE id=?', req._sid); req._sid = null; req.session = {}; req._destroyed = true; };
  };
}
function saveSession(req, res) {
  if (!req.session) return;
  const json = JSON.stringify(req.session);
  const empty = json === '{}';
  if (req._destroyed && empty) { res.setCookie('fsid', '', { maxAge: 0, secure: req.secure }); return; }
  if (empty && !req._sid) return;
  if (!req._sid) req._sid = crypto.randomBytes(24).toString('hex');
  else if (json === req._sessionInitial && !req._touch) return;
  q.run('INSERT INTO sessions(id,data,expires) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, expires=excluded.expires',
    req._sid, json, Date.now() + SESSION_DAYS * 864e5);
  res.setCookie('fsid', req._sid, { maxAge: SESSION_DAYS * 86400, secure: req.secure });
}
setInterval(() => { try { q.run('DELETE FROM sessions WHERE expires < ?', Date.now()); } catch { /* */ } }, 3600e3).unref();

/* ---------- CSRF ---------- */
function csrfToken(req) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(18).toString('hex');
  return req.session.csrf;
}
function checkCsrf(req) {
  const t = (req.body && req.body._csrf) || req.headers['x-csrf-token'];
  return !!t && !!req.session.csrf && t.length === req.session.csrf.length &&
    crypto.timingSafeEqual(Buffer.from(String(t)), Buffer.from(req.session.csrf));
}

/* ---------- Flash ---------- */
function flash(req, type, msg) { (req.session.flash = req.session.flash || []).push({ type, msg }); }
function takeFlash(req) { const f = req.session.flash || []; delete req.session.flash; return f; }

/* ---------- Koszyk ---------- */
function cartDetails(req) {
  const cart = req.session.cart || {};
  const ids = Object.keys(cart).map(Number).filter(Boolean);
  if (!ids.length) return { items: [], total: 0, count: 0, lines: 0, problems: 0 };
  const rows = q.all(`SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id
    WHERE p.id IN (${ids.map(() => '?').join(',')}) AND p.active=1`, ...ids);
  const items = []; let total = 0, count = 0, problems = 0;
  for (const p of rows) {
    const qty = Math.max(1, int(cart[p.id], 1));
    const price = effPrice(p);
    const maxQty = p.max_per_order > 0 ? Math.min(p.stock, p.max_per_order) : p.stock;
    const problem = p.stock <= 0 ? 'Produkt jest obecnie niedostępny' : qty > maxQty ? `Dostępne maksymalnie ${maxQty} ${p.unit}` : '';
    if (problem) problems++;
    items.push({ p, qty, price, lineTotal: price * qty, maxQty, problem });
    total += price * qty; count += qty;
  }
  // usuń z sesji pozycje, które zniknęły
  for (const id of ids) if (!rows.find((r) => r.id === id)) delete cart[id];
  return { items, total, count, lines: items.length, problems };
}
const cartCount = (req) => Object.keys(req.session.cart || {}).length;

/* ---------- Terminy odbioru ---------- */
function parseRange(r) {
  const m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(String(r || '').trim());
  if (!m) return null;
  const a = +m[1] * 60 + +m[2], b = +m[3] * 60 + +m[4];
  return b > a ? [a, b] : null;
}
const hm = (t) => `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
function hoursFor(loc, d) {
  const dow = d.getDay();
  return parseRange(dow === 0 ? loc.hours_sunday : dow === 6 ? loc.hours_saturday : loc.hours_weekday);
}
function slotsFor(loc, dateStr, excludeOrderId = 0) {
  const s = getSettings();
  const d = parseYmd(dateStr);
  if (!d || !loc) return [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const maxDays = int(s.pickup_max_days, 14);
  const diff = Math.round((d - today) / 864e5);
  if (diff < 0 || diff > maxDays) return [];
  const closed = String(s.closed_dates || '').split(/[\s,;]+/).filter(Boolean);
  if (closed.includes(dateStr)) return [];
  const r = hoursFor(loc, d);
  if (!r) return [];
  const len = Math.max(15, int(s.slot_minutes, 60));
  const cap = int(s.slot_capacity, 0);
  const lead = Math.max(0, Number(String(s.pickup_lead_hours).replace(',', '.')) || 0);
  const nowD = new Date();
  const minStart = diff === 0 ? nowD.getHours() * 60 + nowD.getMinutes() + lead * 60 : -1;
  const taken = {};
  if (cap > 0) {
    for (const row of q.all(`SELECT pickup_slot, COUNT(*) AS n FROM orders WHERE location_id=? AND pickup_date=? AND status!='anulowane' AND id!=? GROUP BY pickup_slot`, loc.id, dateStr, excludeOrderId)) taken[row.pickup_slot] = row.n;
  }
  const out = [];
  for (let t = r[0]; t + len <= r[1]; t += len) {
    if (t < minStart) continue;
    const label = `${hm(t)}–${hm(t + len)}`;
    const used = taken[label] || 0;
    out.push({ label, free: cap > 0 ? Math.max(0, cap - used) : 99, full: cap > 0 && used >= cap });
  }
  return out;
}
function pickupCalendar(loc) {
  const s = getSettings();
  const days = [];
  const maxDays = int(s.pickup_max_days, 14);
  for (let i = 0; i <= maxDays; i++) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i);
    const value = ymd(d);
    const slots = slotsFor(loc, value);
    const open = slots.some((x) => !x.full);
    days.push({ value, dow: DAYS_SHORT[d.getDay()], day: d.getDate(), month: MONTHS[d.getMonth()].slice(0, 3), today: i === 0, open, slots });
  }
  return days;
}

/* ---------- Dziennik zdarzeń ---------- */
function logAction(req, action, details = '') {
  try {
    q.run('INSERT INTO activity_log(user_name,action,details,ip,created_at) VALUES(?,?,?,?,?)',
      req.user ? req.user.name : 'system', action, String(details).slice(0, 500), req.ip || '', now());
  } catch (e) { console.error(e); }
}

module.exports = { sessionMiddleware, saveSession, csrfToken, checkCsrf, flash, takeFlash, cartDetails, cartCount, slotsFor, pickupCalendar, hoursFor, parseRange, logAction };
