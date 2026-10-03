'use strict';
const fs = require('fs');
const path = require('path');
const { q, tx, UPLOAD_DIR, setSetting, getSettings } = require('./db');
const { slugify, now, hashPassword, token, ymd, pad } = require('./util');
const { productSvg } = require('./svg');

const DEFAULT_SETTINGS = {
  store_name: 'PSB Fimal',
  store_tagline: 'Materiały budowlane – zamów online, odbierz w składzie',
  phone: '+48 000 000 000',
  email: 'sklep@fimal.pl',
  company_info: 'PSB Fimal\nul. Przykładowa 1\n00-000 Miejscowość\nNIP: 000-000-00-00',
  announcement: 'Sprzedaż internetowa wyłącznie z odbiorem osobistym w naszym składzie',
  hero_title: 'Materiały budowlane z odbiorem osobistym',
  hero_subtitle: 'Zamów online w kilka minut, wybierz dzień i godzinę – przygotujemy towar, a Ty odbierzesz go bez czekania w kolejce.',
  meta_description: 'PSB Fimal – sklep z materiałami budowlanymi. Płyty OSB, cement, izolacje, chemia budowlana. Zamów online i odbierz osobiście.',
  vat_rate: '23',
  pickup_lead_hours: '2',
  slot_minutes: '60',
  slot_capacity: '6',
  pickup_max_days: '14',
  reservation_days: '3',
  low_stock_threshold: '10',
  closed_dates: '2026-11-01,2026-11-11,2026-12-25,2026-12-26,2027-01-01,2027-01-06',
  min_order_value: '0',
  order_terms: 'Zamówienie jest rezerwacją towaru. Płatność następuje przy odbiorze w składzie (gotówka lub karta) albo przelewem na podstawie faktury proforma. Niezrealizowane zamówienia są anulowane po upływie terminu rezerwacji.',
  checkout_info: 'Przy odbiorze podaj numer zamówienia. Towar wydajemy na placu – w przypadku dużych ilości zadbaj o odpowiedni środek transportu.',
};

const CATEGORIES = [
  ['Płyty budowlane', 'layers', 'Płyty OSB, gipsowo-kartonowe i ogniochronne do konstrukcji i wykończeń.'],
  ['Cementy i zaprawy', 'box', 'Cementy, zaprawy murarskie, tynki, kleje i wylewki.'],
  ['Murowanie', 'grid', 'Bloczki, pustaki, cegły i beton komórkowy.'],
  ['Izolacje', 'shield', 'Styropian, wełna mineralna, folie i membrany.'],
  ['Drewno konstrukcyjne', 'tag', 'Łaty, krawędziaki i deski.'],
  ['Chemia budowlana', 'percent', 'Pianki, silikony, grunty i farby.'],
  ['Mocowania', 'settings', 'Wkręty, kołki, kątowniki i złącza.'],
  ['Narzędzia', 'hand', 'Narzędzia ręczne i sprzęt budowlany.'],
];

// [kategoria, nazwa, marka, cena, promo, jednostka, stan, wyróżniony, kształt, kolor, krótki opis, specyfikacja]
const PRODUCTS = [
  [0, 'Płyta OSB/3 12 mm 2500×1250 mm', 'Kronospan', 54.99, null, 'szt.', 120, 1, 'board', '#d9a35b', 'Uniwersalna płyta OSB/3 do zastosowań konstrukcyjnych w warunkach wilgotnych.', [['Grubość', '12 mm'], ['Wymiary', '2500 × 1250 mm'], ['Klasa', 'OSB/3'], ['Krawędź', 'prosta'], ['Powierzchnia', '3,125 m²']]],
  [0, 'Płyta OSB/3 18 mm P+W 2500×675 mm', 'Kronospan', 59.9, null, 'szt.', 80, 0, 'board', '#d5a052', 'Płyta na pióro-wpust do podłóg i stropów.', [['Grubość', '18 mm'], ['Wymiary', '2500 × 675 mm'], ['Klasa', 'OSB/3'], ['Krawędź', 'pióro-wpust (4 str.)']]],
  [0, 'Płyta OSB/3 22 mm P+W 2500×675 mm', 'Swiss Krono', 72.5, null, 'szt.', 0, 0, 'board', '#cf9a4f', 'Wzmocniona płyta podłogowa na pióro-wpust.', [['Grubość', '22 mm'], ['Wymiary', '2500 × 675 mm'], ['Klasa', 'OSB/3']]],
  [0, 'Płyta gipsowo-kartonowa GKB 12,5 mm 1200×2600', 'Norgips', 27.99, 24.99, 'szt.', 300, 1, 'board', '#e9ecef', 'Standardowa płyta g-k do ścian działowych i sufitów.', [['Typ', 'GKB (A)'], ['Grubość', '12,5 mm'], ['Wymiary', '1200 × 2600 mm']]],
  [0, 'Płyta g-k impregnowana GKBI 12,5 mm', 'Norgips', 36.9, null, 'szt.', 150, 0, 'board', '#b8dbb0', 'Płyta o zwiększonej odporności na wilgoć – łazienki, kuchnie.', [['Typ', 'GKBI (H2)'], ['Grubość', '12,5 mm'], ['Wymiary', '1200 × 2600 mm']]],
  [0, 'Płyta g-k ogniochronna GKF 12,5 mm', 'Siniat', 38.5, null, 'szt.', 0, 0, 'board', '#f2b8b8', 'Płyta o podwyższonej odporności ogniowej.', [['Typ', 'GKF (DF)'], ['Grubość', '12,5 mm']]],
  [1, 'Cement portlandzki CEM II/B-S 42,5 R 25 kg', 'Górażdże', 23.49, null, 'worek', 400, 1, 'bag', '#9aa0a6', 'Cement do betonów konstrukcyjnych, zapraw i jastrychów.', [['Klasa', '42,5 R'], ['Typ', 'CEM II/B-S'], ['Waga', '25 kg']]],
  [1, 'Cement CEM I 42,5 R 25 kg', 'Ożarów', 26.99, null, 'worek', 200, 0, 'bag', '#8a9097', 'Cement o szybkim przyroście wytrzymałości.', [['Klasa', '42,5 R'], ['Typ', 'CEM I'], ['Waga', '25 kg']]],
  [1, 'Zaprawa murarska M10 25 kg', 'Atlas', 16.9, null, 'worek', 260, 0, 'bag', '#c5c9ce', 'Zaprawa cementowo-wapienna do murowania.', [['Klasa', 'M10'], ['Waga', '25 kg']]],
  [1, 'Tynk gipsowy maszynowy 30 kg', 'Knauf', 32.9, null, 'worek', 90, 0, 'bag', '#eeeeee', 'Jednowarstwowy tynk do wnętrz.', [['Waga', '30 kg'], ['Zużycie', 'ok. 10 kg/m²/cm']]],
  [1, 'Klej do płytek C2TE 25 kg', 'Atlas', 44.9, 39.9, 'worek', 140, 1, 'bag', '#d4d7db', 'Elastyczny klej do płytek ceramicznych i gresu.', [['Klasa', 'C2TE'], ['Waga', '25 kg']]],
  [1, 'Wylewka samopoziomująca 25 kg', 'Ceresit', 49.9, null, 'worek', 0, 0, 'bag', '#b9bec4', 'Masa samopoziomująca 2–15 mm.', [['Grubość warstwy', '2–15 mm'], ['Waga', '25 kg']]],
  [2, 'Bloczek betonowy 38×24×12 cm', 'Bruk-Bet', 4.79, null, 'szt.', 2000, 0, 'block', '#a7abb0', 'Bloczek fundamentowy z betonu zwykłego.', [['Wymiary', '38 × 24 × 12 cm'], ['Klasa betonu', 'B15']]],
  [2, 'Pustak ceramiczny 25 P+W', 'Wienerberger', 9.89, null, 'szt.', 1200, 1, 'block', '#c4572e', 'Pustak do ścian zewnętrznych i nośnych.', [['Szerokość muru', '25 cm'], ['System', 'pióro-wpust']]],
  [2, 'Cegła pełna ceramiczna 25×12×6,5 cm', 'CRH', 1.99, null, 'szt.', 0, 0, 'block', '#b84a2a', 'Klasyczna cegła pełna do murów i kominów.', [['Wymiary', '25 × 12 × 6,5 cm']]],
  [2, 'Bloczek z betonu komórkowego 24 cm', 'Solbet', 14.5, null, 'szt.', 600, 0, 'block', '#f0f0ee', 'Lekki bloczek o dobrej izolacyjności.', [['Szerokość', '24 cm'], ['Odmiana', '600']]],
  [3, 'Styropian EPS 100 fasadowy 10 cm (paczka 3 m²)', 'Termo Organika', 79.9, null, 'opak.', 85, 1, 'pack', '#fafafa', 'Styropian do ocieplania ścian i podłóg.', [['Grubość', '10 cm'], ['Lambda', '0,036 W/mK'], ['W paczce', '3 m²']]],
  [3, 'Wełna mineralna 15 cm (rolka 5 m²)', 'Isover', 89, null, 'rolka', 60, 0, 'roll', '#e8c547', 'Wełna szklana do ocieplenia poddaszy.', [['Grubość', '15 cm'], ['Lambda', '0,039 W/mK'], ['W rolce', '5 m²']]],
  [3, 'Folia paroizolacyjna 0,2 mm 2×50 m', 'Marma', 119, null, 'rolka', 25, 0, 'roll', '#cfd8dc', 'Folia budowlana do izolacji przeciwwilgociowej.', [['Grubość', '0,2 mm'], ['Wymiary rolki', '2 × 50 m']]],
  [3, 'Membrana dachowa 160 g/m² 75 m²', 'Corotop', 239, null, 'rolka', 8, 0, 'roll', '#4a6b8a', 'Wysokoparoprzepuszczalna membrana dachowa.', [['Gramatura', '160 g/m²'], ['W rolce', '75 m²']]],
  [4, 'Łata dachowa 40×60 mm, 4 m', 'Tartak lokalny', 15.9, null, 'szt.', 500, 0, 'beam', '#dcb27a', 'Łata impregnowana do konstrukcji dachowych.', [['Przekrój', '40 × 60 mm'], ['Długość', '4 m']]],
  [4, 'Krawędziak C24 100×100 mm, 4 m', 'Tartak lokalny', 119, null, 'szt.', 40, 0, 'beam', '#d6a868', 'Drewno konstrukcyjne suszone komorowo, klasa C24.', [['Przekrój', '100 × 100 mm'], ['Długość', '4 m'], ['Klasa', 'C24']]],
  [4, 'Deska szalunkowa 25×150 mm, 4 m', 'Tartak lokalny', 22.9, null, 'szt.', 0, 0, 'beam', '#e1bd8b', 'Deska nieheblowana do szalunków.', [['Przekrój', '25 × 150 mm'], ['Długość', '4 m']]],
  [5, 'Pianka montażowa pistoletowa 750 ml', 'Soudal', 29.9, 24.9, 'szt.', 150, 1, 'tube', '#f2c94c', 'Pianka poliuretanowa do montażu stolarki.', [['Pojemność', '750 ml'], ['Wydajność', 'do 45 l']]],
  [5, 'Silikon sanitarny biały 280 ml', 'Soudal', 19.9, null, 'szt.', 210, 0, 'tube', '#f5f5f5', 'Silikon grzybobójczy do łazienek i kuchni.', [['Pojemność', '280 ml'], ['Kolor', 'biały']]],
  [5, 'Grunt głęboko penetrujący 5 l', 'Atlas', 34.9, null, 'szt.', 70, 0, 'bucket', '#f5f5f5', 'Grunt wzmacniający podłoża chłonne.', [['Pojemność', '5 l']]],
  [5, 'Farba lateksowa biała 10 l', 'Śnieżka', 149, 129, 'szt.', 30, 0, 'bucket', '#ffffff', 'Matowa farba do ścian i sufitów, odporna na szorowanie.', [['Pojemność', '10 l'], ['Wykończenie', 'mat']]],
  [6, 'Wkręty do drewna 4×40 mm (500 szt.)', 'Rawlplug', 32.9, null, 'opak.', 90, 0, 'hardware', '#e30613', 'Wkręty ocynkowane z łbem stożkowym.', [['Wymiar', '4 × 40 mm'], ['Ilość', '500 szt.']]],
  [6, 'Kołki rozporowe 8×50 mm (100 szt.)', 'Rawlplug', 18.5, null, 'opak.', 120, 0, 'hardware', '#1f6feb', 'Uniwersalne kołki nylonowe.', [['Wymiar', '8 × 50 mm'], ['Ilość', '100 szt.']]],
  [6, 'Kątownik ciesielski 90×90×65 mm', 'Domax', 3.2, null, 'szt.', 0, 0, 'hardware', '#9aa0a6', 'Złącze ocynkowane do konstrukcji drewnianych.', [['Wymiar', '90 × 90 × 65 mm']]],
  [7, 'Taczka budowlana 100 l', 'Altrad', 289, null, 'szt.', 12, 1, 'barrow', '#e30613', 'Wzmocniona taczka z kołem pompowanym.', [['Pojemność', '100 l'], ['Koło', 'pompowane']]],
  [7, 'Poziomica aluminiowa 100 cm', 'Stanley', 59.9, null, 'szt.', 25, 0, 'tool', '#f2c94c', 'Poziomica z trzema libellami.', [['Długość', '100 cm']]],
  [7, 'Kielnia murarska 200 mm', 'Topex', 24.9, null, 'szt.', 40, 0, 'tool', '#9aa0a6', 'Kielnia ze stali hartowanej.', [['Długość ostrza', '200 mm']]],
  [7, 'Wiadro budowlane 20 l', 'Prosperplast', 14.9, null, 'szt.', 6, 0, 'bucket', '#2b2b2b', 'Wytrzymałe wiadro z podziałką.', [['Pojemność', '20 l']]],
];

function run({ force = false } = {}) {
  // ustawienia – uzupełnia brakujące klucze przy każdym starcie
  const cur = getSettings();
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) if (!(k in cur)) setSetting(k, v);

  // administrator
  if (!q.get('SELECT id FROM users LIMIT 1')) {
    const email = (process.env.ADMIN_EMAIL || 'admin@fimal.pl').toLowerCase();
    const pass = process.env.ADMIN_PASSWORD || 'Fimal2026!';
    q.run('INSERT INTO users(email,name,password_hash,role,active,created_at) VALUES(?,?,?,?,1,?)', email, 'Administrator', hashPassword(pass), 'admin', now());
    console.log(`[seed] Utworzono konto administratora: ${email}${process.env.ADMIN_PASSWORD ? '' : ' / Fimal2026! (ZMIEŃ HASŁO!)'}`);
  }

  if (q.get('SELECT id FROM categories LIMIT 1') && !force) return;
  console.log('[seed] Wgrywanie danych testowych…');
  tx(() => {
    const t = now();
    const catIds = CATEGORIES.map(([name, icon, desc], i) =>
      Number(q.run('INSERT INTO categories(name,slug,description,icon,sort,active) VALUES(?,?,?,?,?,1)', name, slugify(name), desc, icon, i).lastInsertRowid));
    PRODUCTS.forEach(([ci, name, brand, price, promo, unit, stock, feat, shape, color, short, specs], i) => {
      const slug = slugify(name);
      const file = `demo-${slug}.svg`;
      fs.writeFileSync(path.join(UPLOAD_DIR, file), productSvg(shape, color, name));
      const desc = `${short}\n\nProdukt testowy – opis przykładowy. Treść, cenę i zdjęcia możesz edytować w panelu administratora (Produkty → Edytuj).\n\nTowar dostępny wyłącznie z odbiorem osobistym w składzie PSB Fimal.`;
      q.run(`INSERT INTO products(sku,name,slug,category_id,brand,short_desc,description,price,promo_price,unit,stock,max_per_order,image,gallery,specs,active,featured,views,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,1,?,?,?,?)`,
      `FM-${String(1001 + i)}`, name, slug, catIds[ci], brand, short, desc, Math.round(price * 100), promo ? Math.round(promo * 100) : null,
      unit, stock, `/uploads/${file}`, '[]', JSON.stringify(specs.map(([n, v]) => ({ n, v }))), feat, Math.floor(Math.random() * 400), t, t);
    });
    q.run(`INSERT INTO locations(name,address,city,phone,hours_weekday,hours_saturday,hours_sunday,info,sort,active) VALUES(?,?,?,?,?,?,?,?,0,1)`,
      'Skład budowlany PSB Fimal', 'ul. Przykładowa 1', '00-000 Miejscowość', '+48 000 000 000', '07:00-17:00', '08:00-13:00', '',
      'Wjazd od strony placu. Wydawanie towaru przy biurze obsługi klienta.');
    q.run(`INSERT INTO locations(name,address,city,phone,hours_weekday,hours_saturday,hours_sunday,info,sort,active) VALUES(?,?,?,?,?,?,?,?,1,1)`,
      'Plac składowy – materiały wielkogabarytowe', 'ul. Magazynowa 5', '00-000 Miejscowość', '+48 000 000 001', '07:00-16:00', '', '',
      'Płyty, drewno, bloczki i palety. Możliwy załadunek wózkiem widłowym.');
    seedDemoOrders();
  });
}

function seedDemoOrders() {
  const prods = q.all('SELECT id,sku,name,unit,price,promo_price FROM products WHERE stock>0');
  const names = ['Jan Kowalski', 'Anna Nowak', 'Piotr Wiśniewski', 'Firma Budrem Sp. z o.o.', 'Katarzyna Wójcik', 'Tomasz Kamiński', 'Marek Lewandowski', 'Ewa Zielińska', 'Usługi Remontowe Dom-Bud', 'Paweł Szymański'];
  const statuses = ['odebrane', 'odebrane', 'odebrane', 'odebrane', 'anulowane', 'gotowe', 'potwierdzone', 'nowe'];
  const slots = ['08:00–09:00', '09:00–10:00', '10:00–11:00', '12:00–13:00', '14:00–15:00'];
  let n = 0;
  for (let back = 20; back >= -2; back--) {
    const perDay = back < 0 ? 1 : 1 + Math.floor(Math.random() * 3);
    for (let k = 0; k < perDay; k++) {
      const created = new Date(); created.setDate(created.getDate() - Math.max(back, 0)); created.setHours(7 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 60));
      const pickup = new Date(created); pickup.setDate(pickup.getDate() + 1 + (back < 0 ? -back : 0));
      if (pickup.getDay() === 0) pickup.setDate(pickup.getDate() + 1);
      let status = back > 2 ? statuses[Math.floor(Math.random() * 5)] : statuses[5 + Math.floor(Math.random() * 3)];
      if (back < 0) status = 'nowe';
      const cts = `${ymd(created)} ${pad(created.getHours())}:${pad(created.getMinutes())}:00`;
      const items = [];
      const cnt = 1 + Math.floor(Math.random() * 4);
      for (let j = 0; j < cnt; j++) {
        const p = prods[Math.floor(Math.random() * prods.length)];
        if (items.find((x) => x.id === p.id)) continue;
        const price = p.promo_price && p.promo_price < p.price ? p.promo_price : p.price;
        const qty = 1 + Math.floor(Math.random() * (price < 3000 ? 20 : 4));
        items.push({ ...p, price, qty });
      }
      const total = items.reduce((s, i) => s + i.price * i.qty, 0);
      const name = names[(n * 7 + back) % names.length];
      const isCo = /Firma|Usługi/.test(name);
      const r = q.run(`INSERT INTO orders(number,token,status,customer_name,email,phone,company,nip,want_invoice,customer_note,location_id,pickup_date,pickup_slot,payment_method,paid,items_count,total,stock_returned,created_at,updated_at,picked_up_at)
        VALUES('',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      token(), status, name, `klient${n}@example.com`, `+48 600 ${100 + n} ${200 + n}`, isCo ? name : '', isCo ? '5260250995' : '', isCo ? 1 : 0,
      n % 4 === 0 ? 'Proszę o przygotowanie towaru na palecie.' : '', 1 + (n % 2), ymd(pickup), slots[n % slots.length],
      ['gotowka', 'karta', 'przelew'][n % 3], status === 'odebrane' ? 1 : 0, items.length, total, status === 'anulowane' ? 1 : 0, cts, cts,
      status === 'odebrane' ? `${ymd(pickup)} 10:15:00` : null);
      const id = Number(r.lastInsertRowid);
      const d = cts.slice(2, 10).replace(/-/g, '');
      q.run('UPDATE orders SET number=? WHERE id=?', `FM${d}-${String(id).padStart(4, '0')}`, id);
      for (const i of items) q.run('INSERT INTO order_items(order_id,product_id,sku,name,unit,price,qty,total) VALUES(?,?,?,?,?,?,?,?)', id, i.id, i.sku, i.name, i.unit, i.price, i.qty, i.price * i.qty);
      q.run('INSERT INTO order_history(order_id,status,note,author,created_at) VALUES(?,?,?,?,?)', id, 'nowe', 'Zamówienie złożone przez sklep internetowy (dane testowe)', 'Klient', cts);
      if (status !== 'nowe') q.run('INSERT INTO order_history(order_id,status,note,author,created_at) VALUES(?,?,?,?,?)', id, status, '', 'Administrator', cts);
      n++;
    }
  }
}

module.exports = { run, DEFAULT_SETTINGS };
