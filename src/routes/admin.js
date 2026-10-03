'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { q, tx, UPLOAD_DIR, getSettings, setSetting } = require('../db');
const A = require('../views/admin');
const { int, now, ymd, parseYmd, slugify, parseMoney, money, effPrice, hashPassword, checkPassword, STATUSES, PAYMENTS, UNITS, toCsv, parseCsv, validEmail, DAYS_SHORT, MONTHS, dtPL } = require('../util');
const { flash, logAction, slotsFor } = require('../core');
const { DEFAULT_SETTINGS } = require('../seed');

/* ---------- Autoryzacja ---------- */
function loadUser(req) {
  if (!req.session.uid) return null;
  const u = q.get('SELECT id,email,name,role,active FROM users WHERE id=?', req.session.uid);
  return u && u.active ? u : null;
}
function requireAuth(req, res) {
  const u = loadUser(req);
  if (!u) { if (req.wantsJson) return res.json({ error: 'auth' }, 401); req.session.returnTo = req.path; return res.redirect('/admin/logowanie'); }
  req.user = u;
  res.locals.user = u;
  res.locals.badges = {
    newOrders: q.get("SELECT COUNT(*) n FROM orders WHERE status='nowe'").n,
    todayPickups: q.get("SELECT COUNT(*) n FROM orders WHERE pickup_date=? AND status IN ('nowe','potwierdzone','gotowe')", ymd(new Date())).n,
    lowStock: q.get('SELECT COUNT(*) n FROM products WHERE active=1 AND stock<=?', int(getSettings().low_stock_threshold, 10)).n,
  };
}
function requireAdmin(req, res) {
  if (req.user.role !== 'admin') { flash(req, 'error', 'Brak uprawnień – ta sekcja jest dostępna tylko dla administratora.'); return res.redirect('/admin'); }
}

/* ---------- Upload zdjęć ---------- */
const IMG_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
function sniff(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.slice(0, 8).toString('hex') === '89504e470d0a1a0a') return 'image/png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.slice(0, 3).toString() === 'GIF') return 'image/gif';
  return null;
}
function saveImage(file) {
  if (!file || !file.data || !file.data.length) return null;
  if (file.data.length > 8 * 1024 * 1024) throw Object.assign(new Error('Plik jest za duży (maks. 8 MB).'), { userMsg: true });
  const type = sniff(file.data);
  if (!type) throw Object.assign(new Error(`Nieobsługiwany format pliku: ${file.filename}`), { userMsg: true });
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}${IMG_TYPES[type]}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), file.data);
  return `/uploads/${name}`;
}
function removeUpload(url) {
  if (!url || !url.startsWith('/uploads/') || url.includes('..')) return;
  const still = q.get('SELECT COUNT(*) n FROM products WHERE image=? OR gallery LIKE ?', url, `%"${url}"%`).n;
  if (still) return;
  try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(url))); } catch { /* */ }
}

/* ---------- Statusy i stany ---------- */
function changeStatus(req, o, status, note = '') {
  if (!STATUSES[status] || o.status === status) return { ok: o.status === status, msg: o.status === status ? 'Status bez zmian.' : 'Nieznany status.' };
  return tx(() => {
    const items = q.all('SELECT * FROM order_items WHERE order_id=?', o.id);
    const t = now();
    let stockReturned = o.stock_returned;
    if (status === 'anulowane' && !o.stock_returned) {
      for (const i of items) if (i.product_id) {
        q.run('UPDATE products SET stock=stock+? WHERE id=?', i.qty, i.product_id);
        q.run('INSERT INTO stock_moves(product_id,delta,reason,author,created_at) VALUES(?,?,?,?,?)', i.product_id, i.qty, `Anulowanie ${o.number}`, req.user.name, t);
      }
      stockReturned = 1;
    } else if (o.status === 'anulowane' && o.stock_returned) {
      for (const i of items) if (i.product_id) {
        const p = q.get('SELECT stock,name FROM products WHERE id=?', i.product_id);
        if (p && p.stock < i.qty) throw Object.assign(new Error('stock'), { userMsg: `Nie można przywrócić – brak stanu dla: ${p.name} (dostępne ${p.stock}).` });
      }
      for (const i of items) if (i.product_id) {
        q.run('UPDATE products SET stock=stock-? WHERE id=?', i.qty, i.product_id);
        q.run('INSERT INTO stock_moves(product_id,delta,reason,author,created_at) VALUES(?,?,?,?,?)', i.product_id, -i.qty, `Przywrócenie ${o.number}`, req.user.name, t);
      }
      stockReturned = 0;
    }
    q.run('UPDATE orders SET status=?, stock_returned=?, updated_at=?, picked_up_at=CASE WHEN ?=\'odebrane\' THEN ? ELSE picked_up_at END, paid=CASE WHEN ?=\'odebrane\' THEN 1 ELSE paid END WHERE id=?',
      status, stockReturned, t, status, t, status, o.id);
    q.run('INSERT INTO order_history(order_id,status,note,author,created_at) VALUES(?,?,?,?,?)', o.id, status, String(note).slice(0, 500), req.user.name, t);
    logAction(req, 'Zmiana statusu', `${o.number}: ${STATUSES[o.status]?.label || o.status} → ${STATUSES[status].label}`);
    return { ok: true, msg: `Zamówienie ${o.number}: ${STATUSES[status].label}` };
  });
}
function adjustStock(req, productId, delta, reason) {
  delta = int(delta);
  if (!delta) return false;
  q.run('UPDATE products SET stock=MAX(0, stock+?), updated_at=? WHERE id=?', delta, now(), productId);
  q.run('INSERT INTO stock_moves(product_id,delta,reason,author,created_at) VALUES(?,?,?,?,?)', productId, delta, String(reason || 'Korekta').slice(0, 200), req.user.name, now());
  return true;
}

/* ---------- Zapytania pomocnicze ---------- */
const ORDER_SELECT = 'SELECT o.*, l.name AS location_name FROM orders o LEFT JOIN locations l ON l.id=o.location_id';
function orderWhere(p) {
  const w = ['1=1'], a = [];
  if (p.status && STATUSES[p.status]) { w.push('o.status=?'); a.push(p.status); }
  if (p.q) {
    const l = `%${p.q}%`;
    w.push('(o.number LIKE ? OR o.customer_name LIKE ? OR o.email LIKE ? OR o.phone LIKE ? OR o.nip LIKE ? OR o.company LIKE ?)');
    a.push(l, l, l, l, l, l);
  }
  if (parseYmd(p.od)) { w.push('o.created_at>=?'); a.push(p.od + ' 00:00:00'); }
  if (parseYmd(p.do)) { w.push('o.created_at<=?'); a.push(p.do + ' 23:59:59'); }
  if (parseYmd(p.odbior)) { w.push('o.pickup_date=?'); a.push(p.odbior); }
  if (p.punkt) { w.push('o.location_id=?'); a.push(int(p.punkt)); }
  return { w: w.join(' AND '), a };
}
const pick = (src, keys) => { const o = {}; for (const k of keys) { const v = Array.isArray(src[k]) ? src[k][0] : src[k]; if (v != null && String(v).trim() !== '') o[k] = String(v).trim().slice(0, 120); } return o; };

function daysSeries(from, to) {
  const rows = q.all(`SELECT substr(created_at,1,10) d, SUM(total) total, COUNT(*) n FROM orders WHERE status!='anulowane' AND created_at>=? AND created_at<=? GROUP BY d`, from + ' 00:00:00', to + ' 23:59:59');
  const map = Object.fromEntries(rows.map((r) => [r.d, r]));
  const out = [];
  const d = parseYmd(from), end = parseYmd(to), today = ymd(new Date());
  let guard = 0;
  while (d <= end && guard++ < 400) {
    const k = ymd(d);
    out.push({ date: k, label: `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`, short: `${d.getDate()}.${d.getMonth() + 1}`, total: map[k]?.total || 0, count: map[k]?.n || 0, today: k === today });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

module.exports = function adminRoutes(app) {
  /* ----- Logowanie ----- */
  const attempts = new Map();
  app.get('/admin/logowanie', (req, res) => {
    if (loadUser(req)) return res.redirect('/admin');
    res.html(A.login(res.locals, {}));
  });
  app.post('/admin/logowanie', (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const key = req.ip;
    const a = attempts.get(key) || { n: 0, t: Date.now() };
    if (Date.now() - a.t > 15 * 60e3) { a.n = 0; a.t = Date.now(); }
    if (a.n >= 8) return res.html(A.login(res.locals, { error: 'Zbyt wiele nieudanych prób. Spróbuj ponownie za 15 minut.', email }), 429);
    const u = q.get('SELECT * FROM users WHERE email=?', email);
    if (!u || !u.active || !checkPassword(req.body.password, u.password_hash)) {
      a.n++; attempts.set(key, a);
      return res.html(A.login(res.locals, { error: 'Nieprawidłowy e-mail lub hasło.', email }), 401);
    }
    attempts.delete(key);
    const keep = { cart: req.session.cart };
    const back = req.session.returnTo;
    req.regenerateSession();
    req.session = { ...keep, uid: u.id, csrf: crypto.randomBytes(18).toString('hex') };
    q.run('UPDATE users SET last_login=? WHERE id=?', now(), u.id);
    req.user = u; logAction(req, 'Logowanie', u.email);
    res.redirect(back && back.startsWith('/admin') ? back : '/admin');
  });
  app.post('/admin/wyloguj', (req, res) => { req.destroySession(); res.redirect('/admin/logowanie'); });

  // wszystkie pozostałe trasy /admin wymagają zalogowania
  app.use((req, res) => {
    if (!req.path.startsWith('/admin') || req.path === '/admin/logowanie' || req.path === '/admin/wyloguj') return;
    return requireAuth(req, res);
  });

  app.get('/admin/api/licznik', (req, res) => res.json(res.locals.badges));

  /* ----- Pulpit ----- */
  app.get('/admin', (req, res) => {
    const today = ymd(new Date());
    const from = new Date(); from.setDate(from.getDate() - 29);
    const f = ymd(from);
    const r30 = q.get(`SELECT COALESCE(SUM(total),0) s, COUNT(*) n FROM orders WHERE status!='anulowane' AND created_at>=?`, f + ' 00:00:00');
    const rT = q.get(`SELECT COALESCE(SUM(total),0) s, COUNT(*) n FROM orders WHERE status!='anulowane' AND created_at>=?`, today + ' 00:00:00');
    const byStatus = Object.fromEntries(q.all('SELECT status, COUNT(*) n FROM orders GROUP BY status').map((r) => [r.status, r.n]));
    res.html(A.dashboard(res.locals, {
      revenue30: r30.s, orders30: r30.n, avg30: r30.n ? Math.round(r30.s / r30.n) : 0,
      ordersToday: rT.n, revenueToday: rT.s, byStatus,
      days: daysSeries(f, today),
      pickupsToday: q.all(`${ORDER_SELECT} WHERE o.pickup_date=? AND o.status!='anulowane' ORDER BY o.pickup_slot`, today),
      lowStock: q.all('SELECT id,name,stock,unit FROM products WHERE active=1 AND stock<=? ORDER BY stock ASC LIMIT 8', int(getSettings().low_stock_threshold, 10)),
      recent: q.all(`${ORDER_SELECT} ORDER BY o.id DESC LIMIT 8`),
      top: q.all(`SELECT i.name, i.unit, SUM(i.qty) qty, SUM(i.total) value FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.status!='anulowane' AND o.created_at>=? GROUP BY i.product_id ORDER BY value DESC LIMIT 6`, f + ' 00:00:00'),
    }));
  });

  /* ----- Zamówienia ----- */
  app.get('/admin/zamowienia', (req, res) => {
    const params = pick(req.query, ['status', 'q', 'od', 'do', 'odbior', 'punkt', 'page']);
    const { w, a } = orderWhere(params);
    const total = q.get(`SELECT COUNT(*) n FROM orders o WHERE ${w}`, ...a).n;
    const per = 25, pages = Math.max(1, Math.ceil(total / per)), page = Math.min(pages, Math.max(1, int(params.page, 1)));
    const list = q.all(`${ORDER_SELECT} WHERE ${w} ORDER BY o.id DESC LIMIT ? OFFSET ?`, ...a, per, (page - 1) * per);
    const { w: w2, a: a2 } = orderWhere({ ...params, status: '' });
    const counts = Object.fromEntries(q.all(`SELECT o.status, COUNT(*) n FROM orders o WHERE ${w2} GROUP BY o.status`, ...a2).map((r) => [r.status, r.n]));
    counts._all = Object.values(counts).reduce((x, y) => x + y, 0);
    delete params.page;
    res.html(A.orders(res.locals, { list, total, page, pages, params, counts, locations: q.all('SELECT * FROM locations ORDER BY sort') }));
  });
  app.get('/admin/zamowienia.csv', (req, res) => {
    const params = pick(req.query, ['status', 'q', 'od', 'do', 'odbior', 'punkt']);
    const { w, a } = orderWhere(params);
    const list = q.all(`${ORDER_SELECT} WHERE ${w} ORDER BY o.id DESC`, ...a);
    const rows = [['Numer', 'Data złożenia', 'Status', 'Klient', 'Telefon', 'E-mail', 'Firma', 'NIP', 'Punkt odbioru', 'Data odbioru', 'Godzina', 'Płatność', 'Opłacone', 'Pozycje', 'Wartość brutto']];
    for (const o of list) rows.push([o.number, o.created_at, STATUSES[o.status]?.label, o.customer_name, o.phone, o.email, o.company, o.nip, o.location_name, o.pickup_date, o.pickup_slot, PAYMENTS[o.payment_method], o.paid ? 'tak' : 'nie', o.items_count, (o.total / 100).toFixed(2).replace('.', ',')]);
    logAction(req, 'Eksport zamówień CSV', `${list.length} rekordów`);
    res.download(toCsv(rows), `zamowienia-${ymd(new Date())}.csv`, 'text/csv; charset=utf-8');
  });
  app.post('/admin/zamowienia/zbiorczo', (req, res) => {
    const ids = [].concat(req.body.ids || []).map(Number).filter(Boolean);
    const status = req.body.status;
    if (!ids.length || !STATUSES[status]) { flash(req, 'error', 'Zaznacz zamówienia i wybierz status.'); return res.redirect('/admin/zamowienia'); }
    let ok = 0; const errs = [];
    for (const id of ids) {
      const o = q.get('SELECT * FROM orders WHERE id=?', id);
      if (!o) continue;
      try { if (changeStatus(req, o, status, 'Zmiana zbiorcza').ok) ok++; } catch (e) { errs.push(e.userMsg || e.message); }
    }
    flash(req, errs.length ? 'error' : 'success', `Zmieniono status ${ok} zamówień.${errs.length ? ' ' + errs.join(' ') : ''}`);
    let back = '/admin/zamowienia';
    try { const u = new URL(req.headers.referer); if (u.pathname.startsWith('/admin/zamowienia')) back = u.pathname + u.search; } catch { /* */ }
    res.redirect(back);
  });
  function getOrder(req, res) {
    const o = q.get('SELECT * FROM orders WHERE id=?', int(req.params.id));
    if (!o) { flash(req, 'error', 'Nie znaleziono zamówienia.'); res.redirect('/admin/zamowienia'); return null; }
    return o;
  }
  app.get('/admin/zamowienia/:id', (req, res) => {
    const o = getOrder(req, res); if (!o) return;
    const items = q.all('SELECT i.*, p.stock AS cur_stock FROM order_items i LEFT JOIN products p ON p.id=i.product_id WHERE i.order_id=? ORDER BY i.id', o.id);
    const history = q.all('SELECT * FROM order_history WHERE order_id=? ORDER BY id DESC', o.id);
    const location = q.get('SELECT * FROM locations WHERE id=?', o.location_id || 0);
    const slots = location ? slotsFor(location, o.pickup_date, o.id) : [];
    res.html(A.orderDetail(res.locals, { o, items, history, location, locations: q.all('SELECT * FROM locations ORDER BY sort'), slots }));
  });
  app.get('/admin/zamowienia/:id/druk', (req, res) => {
    const o = getOrder(req, res); if (!o) return;
    res.html(A.orderPrint(res.locals, { o, items: q.all('SELECT * FROM order_items WHERE order_id=? ORDER BY id', o.id), location: q.get('SELECT * FROM locations WHERE id=?', o.location_id || 0) }));
  });
  app.post('/admin/zamowienia/:id/status', (req, res) => {
    const o = getOrder(req, res); if (!o) return;
    try {
      const r = changeStatus(req, o, String(req.body.status), req.body.note || '');
      flash(req, r.ok ? 'success' : 'error', r.msg);
    } catch (e) { if (!e.userMsg) throw e; flash(req, 'error', e.userMsg); }
    const back = String(req.body.back || '');
    res.redirect(back.startsWith('/admin/') ? back : `/admin/zamowienia/${o.id}`);
  });
  app.post('/admin/zamowienia/:id/platnosc', (req, res) => {
    const o = getOrder(req, res); if (!o) return;
    const paid = req.body.paid === '1' ? 1 : 0;
    q.run('UPDATE orders SET paid=?, updated_at=? WHERE id=?', paid, now(), o.id);
    q.run('INSERT INTO order_history(order_id,status,note,author,created_at) VALUES(?,?,?,?,?)', o.id, o.status, paid ? 'Oznaczono jako opłacone' : 'Oznaczono jako nieopłacone', req.user.name, now());
    logAction(req, 'Płatność', `${o.number}: ${paid ? 'opłacone' : 'nieopłacone'}`);
    flash(req, 'success', 'Zaktualizowano status płatności.');
    res.redirect(`/admin/zamowienia/${o.id}`);
  });
  app.post('/admin/zamowienia/:id/notatka', (req, res) => {
    const o = getOrder(req, res); if (!o) return;
    q.run('UPDATE orders SET admin_note=?, updated_at=? WHERE id=?', String(req.body.admin_note || '').slice(0, 2000), now(), o.id);
    flash(req, 'success', 'Zapisano notatkę.');
    res.redirect(`/admin/zamowienia/${o.id}`);
  });
  app.post('/admin/zamowienia/:id/termin', (req, res) => {
    const o = getOrder(req, res); if (!o) return;
    const loc = q.get('SELECT * FROM locations WHERE id=?', int(req.body.location_id));
    const date = String(req.body.pickup_date || '');
    const slot = String(req.body.pickup_slot || '').trim().replace('-', '–').slice(0, 30);
    if (!loc || !parseYmd(date) || !slot) { flash(req, 'error', 'Podaj poprawny punkt, datę i godzinę.'); return res.redirect(`/admin/zamowienia/${o.id}`); }
    q.run('UPDATE orders SET location_id=?, pickup_date=?, pickup_slot=?, updated_at=? WHERE id=?', loc.id, date, slot, now(), o.id);
    q.run('INSERT INTO order_history(order_id,status,note,author,created_at) VALUES(?,?,?,?,?)', o.id, o.status, `Zmiana terminu odbioru: ${date} ${slot}, ${loc.name}`, req.user.name, now());
    logAction(req, 'Zmiana terminu', `${o.number}: ${date} ${slot}`);
    flash(req, 'success', 'Zmieniono termin odbioru.');
    res.redirect(`/admin/zamowienia/${o.id}`);
  });

  /* ----- Harmonogram odbiorów ----- */
  app.get('/admin/odbiory', (req, res) => {
    const date = parseYmd(req.query.data) ? String(req.query.data) : ymd(new Date());
    const list = q.all(`${ORDER_SELECT} WHERE o.pickup_date=? AND o.status!='anulowane' ORDER BY l.sort, o.pickup_slot, o.id`, date);
    for (const o of list) {
      const its = q.all('SELECT name, qty, unit FROM order_items WHERE order_id=? ORDER BY id', o.id);
      o.items_summary = its.map((i) => `${i.qty} ${i.unit} ${i.name}`).join(' · ');
    }
    const groups = [];
    for (const o of list) {
      let g = groups.find((x) => x.location === (o.location_name || '—'));
      if (!g) groups.push(g = { location: o.location_name || '—', orders: [] });
      g.orders.push(o);
    }
    const start = new Date(); start.setDate(start.getDate() - 3);
    const end = new Date(); end.setDate(end.getDate() + 10);
    const cnt = Object.fromEntries(q.all(`SELECT pickup_date d, COUNT(*) n FROM orders WHERE status IN ('nowe','potwierdzone','gotowe') AND pickup_date BETWEEN ? AND ? GROUP BY d`, ymd(start), ymd(end)).map((r) => [r.d, r.n]));
    const days = [];
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const v = ymd(d);
      days.push({ value: v, dow: DAYS_SHORT[d.getDay()], day: d.getDate(), month: MONTHS[d.getMonth()].slice(0, 3), today: v === ymd(new Date()), count: cnt[v] || 0 });
    }
    res.html(A.pickups(res.locals, { date, groups, days, counts: { total: list.length, done: list.filter((o) => o.status === 'odebrane').length } }));
  });

  /* ----- Produkty ----- */
  function productWhere(p) {
    const w = ['1=1'], a = [];
    if (p.q) { const l = `%${p.q}%`; w.push('(p.name LIKE ? OR p.sku LIKE ? OR p.brand LIKE ?)'); a.push(l, l, l); }
    if (p.kat) { w.push('p.category_id=?'); a.push(int(p.kat)); }
    const low = int(getSettings().low_stock_threshold, 10);
    if (p.stan === 'brak') w.push('p.stock<=0');
    if (p.stan === 'niski') { w.push('p.stock>0 AND p.stock<=?'); a.push(low); }
    if (p.stan === 'dostepne') w.push('p.stock>0');
    if (p.aktywne === '1' || p.aktywne === '0') { w.push('p.active=?'); a.push(int(p.aktywne)); }
    return { w: w.join(' AND '), a };
  }
  app.get('/admin/produkty', (req, res) => {
    const params = pick(req.query, ['q', 'kat', 'stan', 'aktywne', 'page']);
    const { w, a } = productWhere(params);
    const total = q.get(`SELECT COUNT(*) n FROM products p WHERE ${w}`, ...a).n;
    const per = 30, pages = Math.max(1, Math.ceil(total / per)), page = Math.min(pages, Math.max(1, int(params.page, 1)));
    const list = q.all(`SELECT p.*, c.name category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE ${w} ORDER BY p.id DESC LIMIT ? OFFSET ?`, ...a, per, (page - 1) * per);
    delete params.page;
    res.html(A.products(res.locals, { list, total, page, pages, params, categories: q.all('SELECT * FROM categories ORDER BY sort, name') }));
  });
  app.get('/admin/produkty.csv', (req, res) => {
    const params = pick(req.query, ['q', 'kat', 'stan', 'aktywne']);
    const { w, a } = productWhere(params);
    const list = q.all(`SELECT p.*, c.name category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE ${w} ORDER BY p.id`, ...a);
    const rows = [['sku', 'nazwa', 'kategoria', 'producent', 'cena', 'cena_promocyjna', 'jednostka', 'stan', 'aktywny', 'polecany', 'url']];
    const m = (g) => (g == null ? '' : (g / 100).toFixed(2).replace('.', ','));
    for (const p of list) rows.push([p.sku, p.name, p.category_name || '', p.brand, m(p.price), m(p.promo_price), p.unit, p.stock, p.active, p.featured, `/produkt/${p.slug}`]);
    res.download(toCsv(rows), `produkty-${ymd(new Date())}.csv`, 'text/csv; charset=utf-8');
  });
  app.post('/admin/produkty/stan', (req, res) => {
    const p = q.get('SELECT * FROM products WHERE id=?', int(req.body.id));
    if (!p) return res.json({ ok: false, message: 'Brak produktu' }, 404);
    const val = Math.max(0, int(req.body.stock, p.stock));
    if (val !== p.stock) { adjustStock(req, p.id, val - p.stock, 'Szybka edycja stanu'); logAction(req, 'Stan magazynowy', `${p.sku}: ${p.stock} → ${val}`); }
    res.json({ ok: true, stock: val, message: `Stan „${p.name}”: ${val} ${p.unit}` });
  });
  app.post('/admin/produkty/zbiorczo', (req, res) => {
    const ids = [].concat(req.body.ids || []).map(Number).filter(Boolean);
    const action = req.body.action;
    const sqls = {
      activate: 'UPDATE products SET active=1 WHERE id=?', deactivate: 'UPDATE products SET active=0 WHERE id=?',
      feature: 'UPDATE products SET featured=1 WHERE id=?', unfeature: 'UPDATE products SET featured=0 WHERE id=?',
      clearpromo: 'UPDATE products SET promo_price=NULL WHERE id=?',
    };
    if (!ids.length || (!sqls[action] && action !== 'delete')) { flash(req, 'error', 'Zaznacz produkty i wybierz akcję.'); return res.redirect('/admin/produkty'); }
    if (action === 'delete') {
      if (req.user.role !== 'admin') return requireAdmin(req, res);
      for (const id of ids) {
        const p = q.get('SELECT * FROM products WHERE id=?', id);
        if (!p) continue;
        q.run('DELETE FROM products WHERE id=?', id);
        removeUpload(p.image); for (const g of JSON.parse(p.gallery || '[]')) removeUpload(g);
      }
    } else tx(() => { for (const id of ids) q.run(sqls[action], id); });
    logAction(req, 'Akcja zbiorcza produkty', `${action}: ${ids.length} szt.`);
    flash(req, 'success', `Wykonano akcję dla ${ids.length} produktów.`);
    res.redirect('/admin/produkty');
  });
  app.get('/admin/produkty/import', requireAdmin, (req, res) => res.html(A.importPage(res.locals, {})));
  app.post('/admin/produkty/import', requireAdmin, (req, res) => {
    const file = (req.files.file || [])[0];
    if (!file) { flash(req, 'error', 'Wybierz plik CSV.'); return res.redirect('/admin/produkty/import'); }
    const rows = parseCsv(file.data.toString('utf8'));
    const result = { updated: 0, created: 0, skipped: 0, errors: [] };
    if (rows.length < 2) { result.errors.push('Plik nie zawiera danych.'); return res.html(A.importPage(res.locals, { result })); }
    const head = rows[0].map((h) => slugify(h).replace(/-/g, '_'));
    const col = (r, k) => { const i = head.indexOf(k); return i >= 0 && r[i] !== undefined ? String(r[i]).trim() : undefined; };
    if (!head.includes('sku')) { result.errors.push('Brak kolumny „sku”.'); return res.html(A.importPage(res.locals, { result })); }
    const cats = q.all('SELECT id, name FROM categories');
    tx(() => {
      rows.slice(1).forEach((r, idx) => {
        const line = idx + 2;
        const sku = col(r, 'sku');
        if (!sku) { result.skipped++; return; }
        const p = q.get('SELECT * FROM products WHERE sku=?', sku);
        const upd = {};
        const nazwa = col(r, 'nazwa'); if (nazwa) upd.name = nazwa.slice(0, 200);
        const prod = col(r, 'producent'); if (prod !== undefined) upd.brand = prod.slice(0, 80);
        const cena = col(r, 'cena'); if (cena) { const v = parseMoney(cena); if (v == null || v < 0) { result.errors.push(`Wiersz ${line}: błędna cena`); result.skipped++; return; } upd.price = v; }
        const promo = col(r, 'cena_promocyjna'); if (promo !== undefined) upd.promo_price = promo === '' ? null : parseMoney(promo);
        const jedn = col(r, 'jednostka'); if (jedn) upd.unit = jedn.slice(0, 10);
        const stan = col(r, 'stan'); if (stan !== undefined && stan !== '') upd.stock = Math.max(0, int(stan));
        const akt = col(r, 'aktywny'); if (akt !== undefined && akt !== '') upd.active = /^(1|tak|true)$/i.test(akt) ? 1 : 0;
        const kat = col(r, 'kategoria'); if (kat) { const c = cats.find((x) => x.name.toLowerCase() === kat.toLowerCase()); if (c) upd.category_id = c.id; else result.errors.push(`Wiersz ${line}: nieznana kategoria „${kat}” – pominięto kategorię`); }
        if (p) {
          if ('stock' in upd && upd.stock !== p.stock) q.run('INSERT INTO stock_moves(product_id,delta,reason,author,created_at) VALUES(?,?,?,?,?)', p.id, upd.stock - p.stock, 'Import CSV', req.user.name, now());
          const keys = Object.keys(upd);
          if (!keys.length) { result.skipped++; return; }
          q.run(`UPDATE products SET ${keys.map((k) => `${k}=?`).join(',')}, updated_at=? WHERE id=?`, ...keys.map((k) => upd[k]), now(), p.id);
          result.updated++;
        } else if (req.body.create) {
          if (!upd.name || upd.price == null) { result.errors.push(`Wiersz ${line}: nowy produkt wymaga nazwy i ceny`); result.skipped++; return; }
          let slug = slugify(upd.name); if (q.get('SELECT id FROM products WHERE slug=?', slug)) slug += '-' + crypto.randomBytes(2).toString('hex');
          q.run(`INSERT INTO products(sku,name,slug,category_id,brand,price,promo_price,unit,stock,active,image,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            sku, upd.name, slug, upd.category_id ?? null, upd.brand || '', upd.price, upd.promo_price ?? null, upd.unit || 'szt.', upd.stock || 0, upd.active ?? 1, '', now(), now());
          result.created++;
        } else result.skipped++;
      });
    });
    logAction(req, 'Import CSV', `zaktualizowano ${result.updated}, dodano ${result.created}`);
    res.html(A.importPage(res.locals, { result }));
  });

  const blankProduct = () => ({ name: '', sku: '', slug: '', category_id: null, brand: '', short_desc: '', description: '', price: null, promo_price: null, unit: 'szt.', stock: 0, max_per_order: 0, weight: 0, active: 1, featured: 0, specs: '[]', gallery: '[]', image: '' });
  function readProductForm(req, existing) {
    const b = req.body;
    const e = {};
    const p = { ...(existing || blankProduct()) };
    p.name = String(b.name || '').trim().slice(0, 200);
    p.sku = String(b.sku || '').trim().slice(0, 60);
    p.slug = slugify(String(b.slug || '').trim() || p.name);
    p.category_id = int(b.category_id) || null;
    p.brand = String(b.brand || '').trim().slice(0, 80);
    p.short_desc = String(b.short_desc || '').trim().slice(0, 300);
    p.description = String(b.description || '').slice(0, 20000);
    p.price = parseMoney(b.price);
    p.promo_price = parseMoney(b.promo_price);
    p.unit = UNITS.includes(b.unit) ? b.unit : 'szt.';
    p.max_per_order = Math.max(0, int(b.max_per_order));
    p.weight = parseFloat(String(b.weight || '0').replace(',', '.')) || 0;
    p.active = b.active ? 1 : 0;
    p.featured = b.featured ? 1 : 0;
    const sn = [].concat(b.spec_n || []), sv = [].concat(b.spec_v || []);
    p.specs = JSON.stringify(sn.map((n, i) => ({ n: String(n).trim().slice(0, 80), v: String(sv[i] || '').trim().slice(0, 200) })).filter((x) => x.n && x.v));
    if (!existing) p.stock = Math.max(0, int(b.stock));
    if (p.name.length < 2) e.name = 'Podaj nazwę produktu.';
    if (!p.sku) e.sku = 'Podaj kod produktu.';
    else if (q.get('SELECT id FROM products WHERE sku=? AND id!=?', p.sku, existing ? existing.id : 0)) e.sku = 'Ten kod jest już używany.';
    if (q.get('SELECT id FROM products WHERE slug=? AND id!=?', p.slug, existing ? existing.id : 0)) {
      if (String(b.slug || '').trim()) e.slug = 'Ten adres URL jest zajęty.';
      else p.slug = `${p.slug}-${crypto.randomBytes(2).toString('hex')}`;
    }
    if (p.price == null || p.price < 0) e.price = 'Podaj poprawną cenę.';
    if (p.promo_price != null && (p.promo_price <= 0 || (p.price != null && p.promo_price >= p.price))) e.promo_price = 'Cena promocyjna musi być niższa od ceny regularnej.';
    // zdjęcia
    if (!Object.keys(e).length) {
      try {
        const img = saveImage((req.files.image || [])[0]);
        if (img) { p._oldImage = p.image; p.image = img; }
        let gallery = []; try { gallery = JSON.parse(p.gallery || '[]'); } catch { /* */ }
        const rm = [].concat(b.remove_gallery || []);
        p._removed = gallery.filter((g) => rm.includes(g));
        gallery = gallery.filter((g) => !rm.includes(g));
        for (const f of (req.files.gallery || []).slice(0, 10)) { const u = saveImage(f); if (u) gallery.push(u); }
        p.gallery = JSON.stringify(gallery.slice(0, 12));
      } catch (err) { if (!err.userMsg) throw err; e.image = err.message; }
    }
    return { p, e };
  }
  app.get('/admin/produkty/nowy', (req, res) => {
    res.html(A.productForm(res.locals, { p: blankProduct(), categories: q.all('SELECT * FROM categories ORDER BY sort, name'), isNew: true }));
  });
  app.post('/admin/produkty/nowy', (req, res) => {
    const { p, e } = readProductForm(req, null);
    if (Object.keys(e).length) {
      if (e.image) flash(req, 'error', e.image);
      res.locals.flash = [...(res.locals.flash || []), ...((req.session.flash || []).splice(0))];
      return res.html(A.productForm(res.locals, { p, categories: q.all('SELECT * FROM categories ORDER BY sort, name'), isNew: true, errors: e }), 422);
    }
    const t = now();
    const r = q.run(`INSERT INTO products(sku,name,slug,category_id,brand,short_desc,description,price,promo_price,unit,stock,max_per_order,image,gallery,specs,weight,active,featured,views,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`, p.sku, p.name, p.slug, p.category_id, p.brand, p.short_desc, p.description, p.price, p.promo_price, p.unit, p.stock, p.max_per_order, p.image, p.gallery, p.specs, p.weight, p.active, p.featured, t, t);
    const id = Number(r.lastInsertRowid);
    if (p.stock) q.run('INSERT INTO stock_moves(product_id,delta,reason,author,created_at) VALUES(?,?,?,?,?)', id, p.stock, 'Stan początkowy', req.user.name, t);
    logAction(req, 'Dodano produkt', `${p.sku} – ${p.name}`);
    flash(req, 'success', `Dodano produkt „${p.name}”.`);
    res.redirect(`/admin/produkty/${id}`);
  });
  app.get('/admin/produkty/:id', (req, res) => {
    const p = q.get('SELECT * FROM products WHERE id=?', int(req.params.id));
    if (!p) { flash(req, 'error', 'Nie znaleziono produktu.'); return res.redirect('/admin/produkty'); }
    const moves = q.all('SELECT * FROM stock_moves WHERE product_id=? ORDER BY id DESC LIMIT 8', p.id);
    res.html(A.productForm(res.locals, { p, categories: q.all('SELECT * FROM categories ORDER BY sort, name'), moves }));
  });
  app.post('/admin/produkty/:id', (req, res) => {
    const existing = q.get('SELECT * FROM products WHERE id=?', int(req.params.id));
    if (!existing) return res.redirect('/admin/produkty');
    const { p, e } = readProductForm(req, existing);
    if (Object.keys(e).length) {
      if (e.image) flash(req, 'error', e.image);
      res.locals.flash = [...(res.locals.flash || []), ...((req.session.flash || []).splice(0))];
      return res.html(A.productForm(res.locals, { p, categories: q.all('SELECT * FROM categories ORDER BY sort, name'), errors: e, moves: [] }), 422);
    }
    q.run(`UPDATE products SET sku=?,name=?,slug=?,category_id=?,brand=?,short_desc=?,description=?,price=?,promo_price=?,unit=?,max_per_order=?,image=?,gallery=?,specs=?,weight=?,active=?,featured=?,updated_at=? WHERE id=?`,
      p.sku, p.name, p.slug, p.category_id, p.brand, p.short_desc, p.description, p.price, p.promo_price, p.unit, p.max_per_order, p.image, p.gallery, p.specs, p.weight, p.active, p.featured, now(), existing.id);
    if (p._oldImage) removeUpload(p._oldImage);
    for (const g of p._removed || []) removeUpload(g);
    const delta = int(req.body.stock_delta);
    if (delta) adjustStock(req, existing.id, delta, req.body.stock_reason || 'Korekta ręczna');
    if (existing.price !== p.price) logAction(req, 'Zmiana ceny', `${p.sku}: ${money(existing.price)} → ${money(p.price)}`);
    logAction(req, 'Edycja produktu', `${p.sku} – ${p.name}${delta ? `, stan ${delta > 0 ? '+' : ''}${delta}` : ''}`);
    flash(req, 'success', 'Zapisano zmiany produktu.');
    res.redirect(`/admin/produkty/${existing.id}`);
  });
  app.post('/admin/produkty/:id/duplikuj', (req, res) => {
    const p = q.get('SELECT * FROM products WHERE id=?', int(req.params.id));
    if (!p) return res.redirect('/admin/produkty');
    const sfx = crypto.randomBytes(2).toString('hex');
    const t = now();
    const r = q.run(`INSERT INTO products(sku,name,slug,category_id,brand,short_desc,description,price,promo_price,unit,stock,max_per_order,image,gallery,specs,weight,active,featured,views,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,0,0,0,?,?)`, `${p.sku}-KOPIA-${sfx}`, `${p.name} (kopia)`, `${p.slug}-kopia-${sfx}`, p.category_id, p.brand, p.short_desc, p.description, p.price, p.promo_price, p.unit, p.max_per_order, p.image, p.gallery, p.specs, p.weight, t, t);
    logAction(req, 'Duplikacja produktu', p.sku);
    flash(req, 'success', 'Utworzono kopię produktu (ukrytą, stan 0). Uzupełnij kod i nazwę.');
    res.redirect(`/admin/produkty/${Number(r.lastInsertRowid)}`);
  });
  app.post('/admin/produkty/:id/usun', requireAdmin, (req, res) => {
    const p = q.get('SELECT * FROM products WHERE id=?', int(req.params.id));
    if (p) {
      q.run('DELETE FROM products WHERE id=?', p.id);
      removeUpload(p.image); for (const g of JSON.parse(p.gallery || '[]')) removeUpload(g);
      logAction(req, 'Usunięto produkt', `${p.sku} – ${p.name}`);
      flash(req, 'success', `Usunięto produkt „${p.name}”.`);
    }
    res.redirect('/admin/produkty');
  });

  /* ----- Magazyn ----- */
  app.get('/admin/magazyn', (req, res) => {
    const low = int(getSettings().low_stock_threshold, 10);
    const reserved = Object.fromEntries(q.all(`SELECT i.product_id id, SUM(i.qty) n FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.status IN ('nowe','potwierdzone','gotowe') GROUP BY i.product_id`).map((r) => [r.id, r.n]));
    res.html(A.stock(res.locals, {
      low: q.all('SELECT * FROM products WHERE active=1 AND stock<=? ORDER BY stock ASC, name', low),
      moves: q.all('SELECT m.*, p.name, p.sku FROM stock_moves m LEFT JOIN products p ON p.id=m.product_id ORDER BY m.id DESC LIMIT 100'),
      products: q.all('SELECT id, sku, name, stock, unit FROM products ORDER BY name'),
      reserved,
    }));
  });
  app.post('/admin/magazyn/korekta', (req, res) => {
    const p = q.get('SELECT * FROM products WHERE id=?', int(req.body.product_id));
    const delta = int(req.body.delta);
    if (!p || !delta) { flash(req, 'error', 'Wybierz produkt i podaj zmianę różną od zera.'); return res.redirect('/admin/magazyn'); }
    adjustStock(req, p.id, delta, `${req.body.reason || 'Korekta'}${req.body.note ? ': ' + String(req.body.note).slice(0, 150) : ''}`);
    logAction(req, 'Korekta magazynowa', `${p.sku}: ${delta > 0 ? '+' : ''}${delta}`);
    flash(req, 'success', `Stan „${p.name}”: ${Math.max(0, p.stock + delta)} ${p.unit}`);
    res.redirect('/admin/magazyn');
  });

  /* ----- Kategorie (admin) ----- */
  app.get('/admin/kategorie', requireAdmin, (req, res) => {
    res.html(A.categories(res.locals, { list: q.all('SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id) cnt FROM categories c ORDER BY c.sort, c.name') }));
  });
  function uniqueCatSlug(name, id = 0) {
    let s = slugify(name), n = 2;
    while (q.get('SELECT id FROM categories WHERE slug=? AND id!=?', s, id)) s = `${slugify(name)}-${n++}`;
    return s;
  }
  app.post('/admin/kategorie', requireAdmin, (req, res) => {
    const name = String(req.body.name || '').trim().slice(0, 80);
    if (!name) { flash(req, 'error', 'Podaj nazwę kategorii.'); return res.redirect('/admin/kategorie'); }
    q.run('INSERT INTO categories(name,slug,description,icon,sort,active) VALUES(?,?,?,?,?,1)', name, uniqueCatSlug(name), String(req.body.description || '').slice(0, 300), String(req.body.icon || 'box').slice(0, 20), int(req.body.sort));
    logAction(req, 'Dodano kategorię', name); flash(req, 'success', `Dodano kategorię „${name}”.`);
    res.redirect('/admin/kategorie');
  });
  app.post('/admin/kategorie/:id', requireAdmin, (req, res) => {
    const id = int(req.params.id);
    const name = String(req.body.name || '').trim().slice(0, 80);
    if (!name) { flash(req, 'error', 'Podaj nazwę kategorii.'); return res.redirect('/admin/kategorie'); }
    q.run('UPDATE categories SET name=?, slug=?, description=?, icon=?, sort=?, active=? WHERE id=?', name, uniqueCatSlug(name, id), String(req.body.description || '').slice(0, 300), String(req.body.icon || 'box').slice(0, 20), int(req.body.sort), req.body.active ? 1 : 0, id);
    logAction(req, 'Edycja kategorii', name); flash(req, 'success', `Zapisano kategorię „${name}”.`);
    res.redirect('/admin/kategorie');
  });
  app.post('/admin/kategorie/:id/usun', requireAdmin, (req, res) => {
    const c = q.get('SELECT * FROM categories WHERE id=?', int(req.params.id));
    if (c) { q.run('UPDATE products SET category_id=NULL WHERE category_id=?', c.id); q.run('DELETE FROM categories WHERE id=?', c.id); logAction(req, 'Usunięto kategorię', c.name); flash(req, 'success', `Usunięto kategorię „${c.name}”.`); }
    res.redirect('/admin/kategorie');
  });

  /* ----- Punkty odbioru (admin) ----- */
  const HOURS_RE = /^$|^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/;
  function locFields(b) {
    const f = {};
    for (const k of ['name', 'address', 'city', 'phone', 'hours_weekday', 'hours_saturday', 'hours_sunday', 'info', 'map_url']) f[k] = String(b[k] || '').trim().slice(0, k === 'info' ? 500 : 200);
    if (f.map_url && !/^https?:\/\//i.test(f.map_url)) f.map_url = '';
    f.sort = int(b.sort);
    const bad = ['hours_weekday', 'hours_saturday', 'hours_sunday'].filter((k) => !HOURS_RE.test(f[k]));
    return { f, bad };
  }
  app.get('/admin/punkty', requireAdmin, (req, res) => res.html(A.locations(res.locals, { list: q.all('SELECT * FROM locations ORDER BY sort, id') })));
  app.post('/admin/punkty', requireAdmin, (req, res) => {
    const { f, bad } = locFields(req.body);
    if (!f.name || bad.length) { flash(req, 'error', bad.length ? 'Godziny muszą mieć format GG:MM-GG:MM.' : 'Podaj nazwę punktu.'); return res.redirect('/admin/punkty'); }
    q.run('INSERT INTO locations(name,address,city,phone,hours_weekday,hours_saturday,hours_sunday,info,map_url,sort,active) VALUES(?,?,?,?,?,?,?,?,?,?,1)', f.name, f.address, f.city, f.phone, f.hours_weekday, f.hours_saturday, f.hours_sunday, f.info, f.map_url, f.sort);
    logAction(req, 'Dodano punkt odbioru', f.name); flash(req, 'success', 'Dodano punkt odbioru.');
    res.redirect('/admin/punkty');
  });
  app.post('/admin/punkty/:id', requireAdmin, (req, res) => {
    const { f, bad } = locFields(req.body);
    if (!f.name || bad.length) { flash(req, 'error', bad.length ? 'Godziny muszą mieć format GG:MM-GG:MM.' : 'Podaj nazwę punktu.'); return res.redirect('/admin/punkty'); }
    q.run('UPDATE locations SET name=?,address=?,city=?,phone=?,hours_weekday=?,hours_saturday=?,hours_sunday=?,info=?,map_url=?,sort=?,active=? WHERE id=?', f.name, f.address, f.city, f.phone, f.hours_weekday, f.hours_saturday, f.hours_sunday, f.info, f.map_url, f.sort, req.body.active ? 1 : 0, int(req.params.id));
    logAction(req, 'Edycja punktu odbioru', f.name); flash(req, 'success', 'Zapisano punkt odbioru.');
    res.redirect('/admin/punkty');
  });
  app.post('/admin/punkty/:id/usun', requireAdmin, (req, res) => {
    const l = q.get('SELECT * FROM locations WHERE id=?', int(req.params.id));
    if (l) {
      if (q.get('SELECT COUNT(*) n FROM orders WHERE location_id=?', l.id).n) { q.run('UPDATE locations SET active=0 WHERE id=?', l.id); flash(req, 'success', 'Punkt ma zamówienia – został dezaktywowany.'); }
      else { q.run('DELETE FROM locations WHERE id=?', l.id); flash(req, 'success', 'Usunięto punkt odbioru.'); }
      logAction(req, 'Usunięcie punktu odbioru', l.name);
    }
    res.redirect('/admin/punkty');
  });

  /* ----- Raporty (admin) ----- */
  function reportRange(qr) {
    const today = new Date();
    let from, to = ymd(today);
    if (qr.zakres === '7') { const d = new Date(); d.setDate(d.getDate() - 6); from = ymd(d); }
    else if (qr.zakres === 'mies') from = ymd(new Date(today.getFullYear(), today.getMonth(), 1));
    else if (parseYmd(qr.od) && parseYmd(qr.do) && qr.od <= qr.do) { from = qr.od; to = qr.do; }
    else { const d = new Date(); d.setDate(d.getDate() - 29); from = ymd(d); }
    if ((parseYmd(to) - parseYmd(from)) / 864e5 > 366) { const d = parseYmd(to); d.setDate(d.getDate() - 366); from = ymd(d); }
    return { from, to };
  }
  function reportData(from, to) {
    const range = [from + ' 00:00:00', to + ' 23:59:59'];
    const W = "o.status!='anulowane' AND o.created_at BETWEEN ? AND ?";
    return {
      from, to,
      sum: q.get(`SELECT COALESCE(SUM(total),0) total, COUNT(*) n FROM orders o WHERE ${W}`, ...range),
      cancelled: q.get("SELECT COUNT(*) n FROM orders o WHERE o.status='anulowane' AND o.created_at BETWEEN ? AND ?", ...range).n,
      pickedUp: q.get("SELECT COUNT(*) n FROM orders o WHERE o.status='odebrane' AND o.created_at BETWEEN ? AND ?", ...range).n,
      days: daysSeries(from, to),
      top: q.all(`SELECT i.name, i.sku, i.unit, SUM(i.qty) qty, SUM(i.total) value FROM order_items i JOIN orders o ON o.id=i.order_id WHERE ${W} GROUP BY i.sku ORDER BY value DESC LIMIT 15`, ...range),
      byCat: q.all(`SELECT c.name, SUM(i.total) value FROM order_items i JOIN orders o ON o.id=i.order_id LEFT JOIN products p ON p.id=i.product_id LEFT JOIN categories c ON c.id=p.category_id WHERE ${W} GROUP BY c.id ORDER BY value DESC`, ...range),
      byPay: q.all(`SELECT payment_method, COUNT(*) n, SUM(total) value FROM orders o WHERE ${W} GROUP BY payment_method ORDER BY value DESC`, ...range),
      byLoc: q.all(`SELECT l.name, COUNT(*) n, SUM(o.total) value FROM orders o LEFT JOIN locations l ON l.id=o.location_id WHERE ${W} GROUP BY o.location_id ORDER BY value DESC`, ...range),
    };
  }
  app.get('/admin/raporty', requireAdmin, (req, res) => { const { from, to } = reportRange(req.query); res.html(A.reports(res.locals, reportData(from, to))); });
  app.get('/admin/raporty.csv', requireAdmin, (req, res) => {
    const { from, to } = reportRange(req.query);
    const r = reportData(from, to);
    const rows = [['Raport sprzedaży', `${from} – ${to}`], [], ['Dzień', 'Liczba zamówień', 'Wartość brutto']];
    for (const d of r.days) rows.push([d.date, d.count, (d.total / 100).toFixed(2).replace('.', ',')]);
    rows.push([], ['Produkt', 'SKU', 'Ilość', 'Wartość brutto']);
    for (const p of r.top) rows.push([p.name, p.sku, p.qty, (p.value / 100).toFixed(2).replace('.', ',')]);
    res.download(toCsv(rows), `raport-${from}-${to}.csv`, 'text/csv; charset=utf-8');
  });

  /* ----- Użytkownicy (admin) ----- */
  app.get('/admin/uzytkownicy', requireAdmin, (req, res) => res.html(A.users(res.locals, { list: q.all('SELECT * FROM users ORDER BY role, name') })));
  app.post('/admin/uzytkownicy', requireAdmin, (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const name = String(req.body.name || '').trim().slice(0, 80);
    const pw = String(req.body.password || '');
    const role = req.body.role === 'admin' ? 'admin' : 'pracownik';
    if (!validEmail(email) || !name || pw.length < 8) { flash(req, 'error', 'Podaj imię, poprawny e-mail i hasło (min. 8 znaków).'); return res.redirect('/admin/uzytkownicy'); }
    if (q.get('SELECT id FROM users WHERE email=?', email)) { flash(req, 'error', 'Konto z tym e-mailem już istnieje.'); return res.redirect('/admin/uzytkownicy'); }
    q.run('INSERT INTO users(email,name,password_hash,role,active,created_at) VALUES(?,?,?,?,1,?)', email, name, hashPassword(pw), role, now());
    logAction(req, 'Dodano użytkownika', `${email} (${role})`); flash(req, 'success', `Utworzono konto ${email}.`);
    res.redirect('/admin/uzytkownicy');
  });
  app.post('/admin/uzytkownicy/:id', requireAdmin, (req, res) => {
    const u = q.get('SELECT * FROM users WHERE id=?', int(req.params.id));
    if (!u || u.id === req.user.id) return res.redirect('/admin/uzytkownicy');
    const role = req.body.role === 'admin' ? 'admin' : 'pracownik';
    q.run('UPDATE users SET role=? WHERE id=?', role, u.id);
    const pw = String(req.body.password || '');
    if (pw) {
      if (pw.length < 8) { flash(req, 'error', 'Hasło musi mieć min. 8 znaków.'); return res.redirect('/admin/uzytkownicy'); }
      q.run('UPDATE users SET password_hash=? WHERE id=?', hashPassword(pw), u.id);
      q.run('DELETE FROM sessions WHERE data LIKE ? OR data LIKE ?', `%"uid":${u.id},%`, `%"uid":${u.id}}%`);
    }
    logAction(req, 'Edycja użytkownika', `${u.email}: rola ${role}${pw ? ', nowe hasło' : ''}`); flash(req, 'success', 'Zapisano zmiany konta.');
    res.redirect('/admin/uzytkownicy');
  });
  app.post('/admin/uzytkownicy/:id/przelacz', requireAdmin, (req, res) => {
    const u = q.get('SELECT * FROM users WHERE id=?', int(req.params.id));
    if (u && u.id !== req.user.id) { q.run('UPDATE users SET active=? WHERE id=?', u.active ? 0 : 1, u.id); logAction(req, u.active ? 'Zablokowano konto' : 'Odblokowano konto', u.email); flash(req, 'success', 'Zmieniono status konta.'); }
    res.redirect('/admin/uzytkownicy');
  });
  app.post('/admin/uzytkownicy/:id/usun', requireAdmin, (req, res) => {
    const u = q.get('SELECT * FROM users WHERE id=?', int(req.params.id));
    if (u && u.id !== req.user.id) { q.run('DELETE FROM users WHERE id=?', u.id); logAction(req, 'Usunięto konto', u.email); flash(req, 'success', `Usunięto konto ${u.email}.`); }
    res.redirect('/admin/uzytkownicy');
  });

  /* ----- Moje konto ----- */
  app.get('/admin/konto', (req, res) => res.html(A.account(res.locals)));
  app.post('/admin/konto', (req, res) => {
    const u = q.get('SELECT * FROM users WHERE id=?', req.user.id);
    const { current, password, password2 } = req.body;
    if (!checkPassword(current, u.password_hash)) flash(req, 'error', 'Obecne hasło jest nieprawidłowe.');
    else if (String(password || '').length < 8) flash(req, 'error', 'Nowe hasło musi mieć min. 8 znaków.');
    else if (password !== password2) flash(req, 'error', 'Hasła nie są identyczne.');
    else { q.run('UPDATE users SET password_hash=? WHERE id=?', hashPassword(password), u.id); logAction(req, 'Zmiana hasła', u.email); flash(req, 'success', 'Hasło zostało zmienione.'); }
    res.redirect('/admin/konto');
  });

  /* ----- Ustawienia (admin) ----- */
  app.get('/admin/ustawienia', requireAdmin, (req, res) => res.html(A.settings(res.locals)));
  app.post('/admin/ustawienia', requireAdmin, (req, res) => {
    for (const k of Object.keys(DEFAULT_SETTINGS)) if (k in req.body) setSetting(k, String(req.body[k]).slice(0, 5000));
    logAction(req, 'Zmiana ustawień', '');
    flash(req, 'success', 'Zapisano ustawienia.');
    res.redirect('/admin/ustawienia');
  });

  /* ----- Dziennik (admin) ----- */
  app.get('/admin/dziennik', requireAdmin, (req, res) => {
    const total = q.get('SELECT COUNT(*) n FROM activity_log').n;
    const per = 50, pages = Math.max(1, Math.ceil(total / per)), page = Math.min(pages, Math.max(1, int(req.query.page, 1)));
    res.html(A.log(res.locals, { list: q.all('SELECT * FROM activity_log ORDER BY id DESC LIMIT ? OFFSET ?', per, (page - 1) * per), page, pages, total, params: {} }));
  });
};
