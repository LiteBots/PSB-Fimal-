'use strict';
const { q, tx, getSettings } = require('../db');
const V = require('../views/shop');
const { html, raw, int, effPrice, now, token, validEmail, validPhone, validNip, PAYMENTS, ymd, nl2br } = require('../util');
const { cartDetails, flash, slotsFor, pickupCalendar, logAction } = require('../core');

const EFF = 'CASE WHEN p.promo_price>0 AND p.promo_price<p.price THEN p.promo_price ELSE p.price END';
const BASE_SELECT = `SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p LEFT JOIN categories c ON c.id=p.category_id`;
const VISIBLE = `p.active=1 AND (c.id IS NULL OR c.active=1)`;

function activeLocations() { return q.all('SELECT * FROM locations WHERE active=1 ORDER BY sort, id'); }
function categoriesWithCounts() {
  return q.all(`SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id AND p.active=1) AS cnt FROM categories c WHERE c.active=1 ORDER BY c.sort, c.name`);
}

function listProducts(params, catId) {
  const where = [VISIBLE], args = [];
  if (catId) { where.push('p.category_id=?'); args.push(catId); }
  if (params.q) {
    const words = String(params.q).trim().split(/\s+/).slice(0, 6);
    for (const w of words) { where.push('(p.name LIKE ? OR p.sku LIKE ? OR p.brand LIKE ? OR p.short_desc LIKE ?)'); const l = `%${w}%`; args.push(l, l, l, l); }
  }
  if (params.cena_od) { where.push(`${EFF}>=?`); args.push(int(params.cena_od) * 100); }
  if (params.cena_do) { where.push(`${EFF}<=?`); args.push(int(params.cena_do) * 100); }
  if (params.marka) { where.push('p.brand=?'); args.push(String(params.marka)); }
  if (params.dostepne) where.push('p.stock>0');
  if (params.promocje) where.push('p.promo_price>0 AND p.promo_price<p.price');
  const order = {
    'cena-rosnaco': `${EFF} ASC`, 'cena-malejaco': `${EFF} DESC`, nazwa: 'p.name COLLATE NOCASE ASC',
    popularne: 'p.views DESC', nowosci: 'p.id DESC',
  }[params.sort] || '(p.stock>0) DESC, p.featured DESC, p.views DESC';
  const w = where.join(' AND ');
  const total = q.get(`SELECT COUNT(*) AS n FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE ${w}`, ...args).n;
  const per = 12;
  const pages = Math.max(1, Math.ceil(total / per));
  const page = Math.min(pages, Math.max(1, int(params.page, 1)));
  const products = q.all(`${BASE_SELECT} WHERE ${w} ORDER BY ${order} LIMIT ? OFFSET ?`, ...args, per, (page - 1) * per);
  return { products, total, page, pages };
}
function cleanParams(query) {
  const out = {};
  for (const k of ['q', 'sort', 'cena_od', 'cena_do', 'marka', 'dostepne', 'promocje']) {
    const v = Array.isArray(query[k]) ? query[k][query[k].length - 1] : query[k];
    if (v != null && String(v).trim() !== '') out[k] = String(v).trim().slice(0, 100);
  }
  return out;
}

function nextFreeSlot(locs) {
  for (let i = 0; i < 15; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    const ds = ymd(d);
    for (const l of locs) {
      const s = slotsFor(l, ds).find((x) => !x.full);
      if (s) return { date: ds, slot: s.label, location: l.name, today: i === 0 };
    }
  }
  return null;
}

module.exports = function shopRoutes(app) {
  app.get('/', (req, res) => {
    const featured = q.all(`${BASE_SELECT} WHERE ${VISIBLE} AND p.featured=1 ORDER BY (p.stock>0) DESC, p.views DESC LIMIT 8`);
    const promos = q.all(`${BASE_SELECT} WHERE ${VISIBLE} AND p.promo_price>0 AND p.promo_price<p.price AND p.stock>0 ORDER BY p.views DESC LIMIT 4`);
    const newest = q.all(`${BASE_SELECT} WHERE ${VISIBLE} AND p.stock>0 ORDER BY p.id DESC LIMIT 4`);
    const locations = res.locals.locations;
    res.html(V.home(res.locals, { featured, promos, newest, categories: categoriesWithCounts(), locations, nextSlot: nextFreeSlot(locations) }));
  });

  function renderList(req, res, category) {
    const params = cleanParams(req.query);
    const r = listProducts(params, category && category.id);
    const scope = category ? 'AND p.category_id=' + Number(category.id) : '';
    const pr = q.get(`SELECT MIN(${EFF}) AS min, MAX(${EFF}) AS max FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE ${VISIBLE} ${scope}`) || {};
    const brands = q.all(`SELECT DISTINCT p.brand FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE ${VISIBLE} AND p.brand!='' ${scope} ORDER BY p.brand`).map((x) => x.brand);
    res.locals.q = params.q || '';
    res.locals.activeCat = category && category.slug;
    const title = category ? category.name : params.promocje ? 'Promocje' : params.q ? 'Wyniki wyszukiwania' : 'Wszystkie produkty';
    res.html(V.listing(res.locals, { title, category, ...r, params, categories: categoriesWithCounts(), priceRange: { min: pr.min || 0, max: pr.max || 0 }, brands }));
  }
  app.get('/produkty', (req, res) => renderList(req, res, null));
  app.get('/kategoria/:slug', (req, res) => {
    const c = q.get('SELECT * FROM categories WHERE slug=? AND active=1', req.params.slug);
    if (!c) return app.notFound(req, res);
    renderList(req, res, c);
  });

  app.get('/produkt/:slug', (req, res) => {
    const p = q.get(`${BASE_SELECT} WHERE p.slug=? AND ${VISIBLE}`, req.params.slug);
    if (!p) return app.notFound(req, res);
    q.run('UPDATE products SET views=views+1 WHERE id=?', p.id);
    let gallery = [], specs = [];
    try { gallery = JSON.parse(p.gallery || '[]'); } catch { /* */ }
    try { specs = JSON.parse(p.specs || '[]'); } catch { /* */ }
    const related = q.all(`${BASE_SELECT} WHERE ${VISIBLE} AND p.category_id=? AND p.id!=? ORDER BY (p.stock>0) DESC, p.views DESC LIMIT 4`, p.category_id || 0, p.id);
    res.locals.activeCat = p.category_slug;
    res.html(V.product(res.locals, { p, related, gallery, specs, locations: res.locals.locations }));
  });

  /* ----- API: podpowiedzi wyszukiwania ----- */
  app.get('/api/szukaj', (req, res) => {
    const term = String(req.query.q || '').trim();
    if (term.length < 2) return res.json([]);
    const l = `%${term}%`;
    const rows = q.all(`${BASE_SELECT} WHERE ${VISIBLE} AND (p.name LIKE ? OR p.sku LIKE ? OR p.brand LIKE ?) ORDER BY (p.stock>0) DESC, p.views DESC LIMIT 6`, l, l, l);
    res.json(rows.map((p) => ({ name: p.name, url: `/produkt/${p.slug}`, image: p.image, price: effPrice(p), unit: p.unit, stock: p.stock })));
  });
  app.get('/api/terminy', (req, res) => {
    const loc = q.get('SELECT * FROM locations WHERE id=? AND active=1', int(req.query.punkt));
    if (!loc) return res.json({ error: 'Nieznany punkt' }, 404);
    res.json(pickupCalendar(loc));
  });

  /* ----- Koszyk ----- */
  function cartReply(req, res, ok, msg) {
    if (req.wantsJson) {
      const c = cartDetails(req);
      return res.json({ ok, message: msg, count: Object.keys(req.session.cart || {}).length, items: c.count, total: c.total });
    }
    flash(req, ok ? 'success' : 'error', msg);
    const back = req.headers.referer && /^https?:\/\/[^/]+(\/[^\s]*)$/.exec(req.headers.referer);
    res.redirect(back ? back[1] : '/koszyk');
  }
  app.post('/koszyk/dodaj', (req, res) => {
    const p = q.get('SELECT * FROM products WHERE id=? AND active=1', int(req.body.product_id));
    if (!p) return cartReply(req, res, false, 'Produkt nie istnieje.');
    if (p.stock <= 0) return cartReply(req, res, false, 'Produkt jest obecnie niedostępny.');
    const cart = req.session.cart = req.session.cart || {};
    const max = p.max_per_order > 0 ? Math.min(p.stock, p.max_per_order) : p.stock;
    const want = (cart[p.id] || 0) + Math.max(1, int(req.body.qty, 1));
    cart[p.id] = Math.min(want, max);
    const limited = want > max;
    cartReply(req, res, true, limited ? `Dodano – maksymalna dostępna ilość to ${max} ${p.unit}.` : `Dodano do koszyka: ${p.name}`);
  });
  app.post('/koszyk/zmien', (req, res) => {
    const cart = req.session.cart = req.session.cart || {};
    const id = int(req.body.product_id);
    const p = q.get('SELECT * FROM products WHERE id=? AND active=1', id);
    if (!p || !cart[id]) return cartReply(req, res, false, 'Brak produktu w koszyku.');
    const qty = int(req.body.qty, 1);
    if (qty <= 0) delete cart[id];
    else {
      const max = p.max_per_order > 0 ? Math.min(p.stock, p.max_per_order) : p.stock;
      cart[id] = Math.max(1, Math.min(qty, Math.max(1, max)));
    }
    cartReply(req, res, true, 'Zaktualizowano koszyk.');
  });
  app.post('/koszyk/usun', (req, res) => {
    if (req.session.cart) delete req.session.cart[int(req.body.product_id)];
    cartReply(req, res, true, 'Usunięto produkt z koszyka.');
  });
  app.post('/koszyk/wyczysc', (req, res) => { req.session.cart = {}; flash(req, 'success', 'Koszyk został wyczyszczony.'); res.redirect('/koszyk'); });
  app.get('/koszyk', (req, res) => res.html(V.cart(res.locals, { cart: cartDetails(req) })));
  app.get('/api/koszyk', (req, res) => {
    const c = cartDetails(req);
    res.json({ count: c.lines, items: c.count, total: c.total });
  });

  /* ----- Zamówienie ----- */
  function checkoutGuard(req, res) {
    const cart = cartDetails(req);
    if (!cart.items.length) { flash(req, 'error', 'Twój koszyk jest pusty.'); res.redirect('/koszyk'); return null; }
    if (cart.problems) { flash(req, 'error', 'Niektóre produkty w koszyku wymagają korekty ilości.'); res.redirect('/koszyk'); return null; }
    const s = getSettings();
    const minVal = Math.round((+String(s.min_order_value).replace(',', '.') || 0) * 100);
    if (minVal && cart.total < minVal) { res.redirect('/koszyk'); return null; }
    return cart;
  }
  function renderCheckout(req, res, form, errors, status = 200) {
    const cart = checkoutGuard(req, res);
    if (!cart) return;
    const locations = res.locals.locations;
    if (!locations.length) return res.html(V.errorPage(res.locals, 'Brak aktywnych punktów odbioru. Skontaktuj się ze sklepem.'), 503);
    const calendars = {};
    for (const l of locations) calendars[l.id] = pickupCalendar(l);
    res.html(V.checkout(res.locals, { cart, locations, form: form || req.session.lastCustomer || {}, errors, calendars }), status);
  }
  app.get('/zamowienie', (req, res) => renderCheckout(req, res));
  app.post('/zamowienie', (req, res) => {
    const b = req.body;
    const f = {};
    for (const k of ['location_id', 'pickup_date', 'pickup_slot', 'customer_name', 'phone', 'email', 'company', 'nip', 'invoice_address', 'customer_note', 'payment_method', 'want_invoice', 'terms']) f[k] = String(b[k] || '').trim();
    const e = {};
    const loc = q.get('SELECT * FROM locations WHERE id=? AND active=1', int(f.location_id));
    if (!loc) e.location_id = 'Wybierz punkt odbioru.';
    if (!f.pickup_date) e.pickup_date = 'Wybierz dzień odbioru.';
    else if (loc) {
      const slot = slotsFor(loc, f.pickup_date).find((x) => x.label === f.pickup_slot);
      if (!f.pickup_slot) e.pickup_slot = 'Wybierz godzinę odbioru.';
      else if (!slot) e.pickup_slot = 'Wybrany termin jest niedostępny – wybierz inny.';
      else if (slot.full) e.pickup_slot = 'Wybrany przedział godzinowy jest już pełny – wybierz inny.';
    }
    if (f.customer_name.length < 3) e.customer_name = 'Podaj imię i nazwisko.';
    if (!validPhone(f.phone)) e.phone = 'Podaj poprawny numer telefonu.';
    if (!validEmail(f.email)) e.email = 'Podaj poprawny adres e-mail.';
    if (f.want_invoice) {
      if (f.company.length < 2) e.company = 'Podaj nazwę firmy.';
      if (!validNip(f.nip)) e.nip = 'Nieprawidłowy NIP.';
    }
    if (!PAYMENTS[f.payment_method]) f.payment_method = 'gotowka';
    if (!f.terms) e.terms = 'Wymagana akceptacja regulaminu.';
    if (Object.keys(e).length) return renderCheckout(req, res, f, e, 422);

    const cart = checkoutGuard(req, res);
    if (!cart) return;
    let order;
    try {
      order = tx(() => {
        // ponowna weryfikacja stanów w transakcji
        for (const it of cart.items) {
          const cur = q.get('SELECT stock, active FROM products WHERE id=?', it.p.id);
          if (!cur || !cur.active || cur.stock < it.qty) throw Object.assign(new Error('stock'), { userMsg: `Niewystarczający stan produktu: ${it.p.name}. Zaktualizuj koszyk.` });
        }
        const t = now();
        const r = q.run(`INSERT INTO orders(number,token,status,customer_name,email,phone,company,nip,invoice_address,want_invoice,customer_note,location_id,pickup_date,pickup_slot,payment_method,paid,items_count,total,created_at,updated_at)
          VALUES('',?,'nowe',?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?)`,
        token(), f.customer_name.slice(0, 120), f.email.toLowerCase().slice(0, 160), f.phone.slice(0, 40),
        f.want_invoice ? f.company.slice(0, 200) : '', f.want_invoice ? f.nip.replace(/[^0-9]/g, '') : '', f.want_invoice ? f.invoice_address.slice(0, 250) : '',
        f.want_invoice ? 1 : 0, f.customer_note.slice(0, 1000), loc.id, f.pickup_date, f.pickup_slot, f.payment_method, cart.lines, cart.total, t, t);
        const id = Number(r.lastInsertRowid);
        const d = new Date();
        const number = `FM${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(id).padStart(4, '0')}`;
        q.run('UPDATE orders SET number=? WHERE id=?', number, id);
        for (const it of cart.items) {
          q.run('INSERT INTO order_items(order_id,product_id,sku,name,unit,price,qty,total) VALUES(?,?,?,?,?,?,?,?)', id, it.p.id, it.p.sku, it.p.name, it.p.unit, it.price, it.qty, it.lineTotal);
          q.run('UPDATE products SET stock=stock-? WHERE id=?', it.qty, it.p.id);
          q.run('INSERT INTO stock_moves(product_id,delta,reason,author,created_at) VALUES(?,?,?,?,?)', it.p.id, -it.qty, `Zamówienie ${number}`, 'Sklep', t);
        }
        q.run('INSERT INTO order_history(order_id,status,note,author,created_at) VALUES(?,?,?,?,?)', id, 'nowe', 'Zamówienie złożone w sklepie internetowym', 'Klient', t);
        return q.get('SELECT * FROM orders WHERE id=?', id);
      });
    } catch (err) {
      if (err.userMsg) { flash(req, 'error', err.userMsg); return res.redirect('/koszyk'); }
      throw err;
    }
    req.session.cart = {};
    req.session.lastCustomer = { customer_name: f.customer_name, phone: f.phone, email: f.email, company: f.company, nip: f.nip, invoice_address: f.invoice_address, want_invoice: f.want_invoice, location_id: f.location_id };
    req.session.orders = [...(req.session.orders || []).slice(-9), order.number];
    logAction(req, 'Nowe zamówienie', `${order.number} – ${f.customer_name}`);
    res.redirect(`/zamowienie/${order.number}?t=${order.token}&nowe=1`);
  });
  app.get('/zamowienie/:number', (req, res) => {
    const o = q.get('SELECT * FROM orders WHERE number=?', req.params.number);
    if (!o || (o.token !== req.query.t && !(req.session.trackOk || []).includes(o.number))) return app.notFound(req, res);
    const items = q.all('SELECT * FROM order_items WHERE order_id=? ORDER BY id', o.id);
    const location = q.get('SELECT * FROM locations WHERE id=?', o.location_id || 0);
    res.html(V.orderView(res.locals, { order: o, items, location, justPlaced: !!req.query.nowe }));
  });

  /* ----- Śledzenie ----- */
  const trackAttempts = new Map();
  app.get('/sledzenie', (req, res) => res.html(V.track(res.locals, {})));
  app.post('/sledzenie', (req, res) => {
    const key = req.ip;
    const a = trackAttempts.get(key) || { n: 0, t: Date.now() };
    if (Date.now() - a.t > 15 * 60e3) { a.n = 0; a.t = Date.now(); }
    a.n++; trackAttempts.set(key, a);
    const form = { number: String(req.body.number || '').trim().toUpperCase(), contact: String(req.body.contact || '').trim() };
    if (a.n > 20) return res.html(V.track(res.locals, { error: 'Zbyt wiele prób. Spróbuj ponownie za kilkanaście minut.', form }), 429);
    const o = q.get('SELECT * FROM orders WHERE number=?', form.number);
    const digits = (s) => String(s).replace(/[^0-9]/g, '').slice(-9);
    const ok = o && (o.email.toLowerCase() === form.contact.toLowerCase() || (digits(form.contact).length >= 9 && digits(o.phone) === digits(form.contact)));
    if (!ok) return res.html(V.track(res.locals, { error: 'Nie znaleziono zamówienia o podanych danych.', form }), 404);
    req.session.trackOk = [...(req.session.trackOk || []).slice(-9), o.number];
    res.redirect(`/zamowienie/${o.number}`);
  });

  /* ----- Strony informacyjne ----- */
  app.get('/odbior-osobisty', (req, res) => res.html(V.pickupInfo(res.locals, { locations: res.locals.locations })));
  app.get('/regulamin', (req, res) => {
    const s = res.locals.settings;
    res.html(V.textPage(res.locals, { title: 'Regulamin sklepu', content: html`
      <h3>§1. Postanowienia ogólne</h3><p>Sklep internetowy prowadzony jest przez:</p><p>${nl2br(s.company_info)}</p>
      <h3>§2. Zamówienia</h3><p>${s.order_terms}</p>
      <h3>§3. Odbiór osobisty</h3><p>Sklep nie realizuje wysyłek. Wszystkie zamówienia odbierane są osobiście w wybranym punkcie, w terminie wskazanym w zamówieniu. ${s.checkout_info}</p>
      <h3>§4. Płatności</h3><p>Dostępne formy płatności: ${Object.values(PAYMENTS).join('; ')}. Ceny podane w sklepie są cenami brutto.</p>
      <h3>§5. Kontakt</h3><p>Telefon: ${s.phone}, e-mail: ${s.email}.</p>
      <p class="muted small">Treść regulaminu jest przykładowa – przed uruchomieniem sprzedaży uzupełnij ją o pełne zapisy prawne (prawo odstąpienia, reklamacje, RODO).</p>` }));
  });
  app.get('/kontakt', (req, res) => {
    const s = res.locals.settings;
    res.html(V.textPage(res.locals, { title: 'Kontakt', content: html`
      <p><strong>${s.store_name}</strong></p><p>${nl2br(s.company_info)}</p>
      <p>Telefon: <a href="tel:${s.phone.replace(/\s/g, '')}">${s.phone}</a><br>E-mail: <a href="mailto:${s.email}">${s.email}</a></p>
      <h3>Punkty odbioru</h3>${res.locals.locations.map((l) => html`<p><strong>${l.name}</strong><br>${l.address}, ${l.city}<br>pn–pt ${l.hours_weekday || 'nieczynne'}, sob ${l.hours_saturday || 'nieczynne'}</p>`)}` }));
  });

  app.get('/health', (req, res) => res.json({ ok: true, time: now() }));
  app.get('/robots.txt', (req, res) => res.send('User-agent: *\nDisallow: /admin\nDisallow: /koszyk\nDisallow: /zamowienie\n', 200, 'text/plain; charset=utf-8'));
};
