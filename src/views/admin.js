'use strict';
const { html, raw, icon, money, moneyInput, netOf, datePL, dtPL, qs, STATUSES, PAYMENTS, UNITS, plural, effPrice, esc } = require('../util');
const { head, flashes, VER } = require('./layout');

const NAV = [
  ['/admin', 'Pulpit', 'chart', null],
  ['/admin/zamowienia', 'Zamówienia', 'list', null, 'newOrders'],
  ['/admin/odbiory', 'Harmonogram odbiorów', 'calendar', null, 'todayPickups'],
  ['/admin/produkty', 'Produkty', 'box', null],
  ['/admin/magazyn', 'Magazyn', 'layers', null, 'lowStock'],
  ['/admin/kategorie', 'Kategorie', 'grid', 'admin'],
  ['/admin/punkty', 'Punkty odbioru', 'pin', 'admin'],
  ['/admin/raporty', 'Raporty', 'percent', 'admin'],
  ['/admin/uzytkownicy', 'Użytkownicy', 'users', 'admin'],
  ['/admin/ustawienia', 'Ustawienia', 'settings', 'admin'],
  ['/admin/dziennik', 'Dziennik zdarzeń', 'file', 'admin'],
];
const pill = (status) => { const s = STATUSES[status] || { label: status, cls: 'gray' }; return html`<span class="pill pill-${s.cls}">${s.label}</span>`; };
const csrfInput = (ctx) => html`<input type="hidden" name="_csrf" value="${ctx.csrf}">`;

function alayout(ctx, { title, body, actions = '' }) {
  const u = ctx.user;
  const path = ctx.path;
  return html`${head(ctx, { title: title + ' – Panel', extraCss: `<link rel="stylesheet" href="/static/css/admin.css?v=${VER}">` })}
<body class="admin">
<aside class="side" id="side">
  <a href="/admin" class="side-logo"><img src="/static/img/logo.webp" alt="PSB Fimal" width="130" height="36"><span>Panel administracyjny</span></a>
  <nav>${NAV.filter((n) => !n[3] || u.role === n[3]).map(([href, label, ic, , badgeKey]) => {
    const active = href === '/admin' ? path === '/admin' : path.startsWith(href);
    const b = badgeKey ? ctx.badges[badgeKey] : 0;
    return html`<a href="${href}" class="${active ? 'active' : ''}">${icon(ic, 19)}<span>${label}</span>${b ? html`<em class="nb nb-${badgeKey}">${b}</em>` : ''}</a>`;
  })}</nav>
  <div class="side-foot"><a href="/" target="_blank">${icon('external', 17)} Zobacz sklep</a></div>
</aside>
<div class="amain">
  <header class="atop">
    <button class="burger" type="button" data-toggle="side" aria-label="Menu">${icon('menu', 22)}</button>
    <form action="/admin/zamowienia" method="get" class="atop-search"><span>${icon('search', 18)}</span><input name="q" placeholder="Szukaj zamówienia: numer, klient, telefon…" value=""></form>
    <div class="atop-user">
      <div class="who"><strong>${u.name}</strong><small>${u.role === 'admin' ? 'Administrator' : 'Pracownik'}</small></div>
      <a href="/admin/konto" class="icon-btn" title="Moje konto">${icon('user', 19)}</a>
      <form action="/admin/wyloguj" method="post">${csrfInput(ctx)}<button class="icon-btn" title="Wyloguj">${icon('logout', 19)}</button></form>
    </div>
  </header>
  ${flashes(ctx.flash)}
  <div class="acontent">
    <div class="ahead"><h1>${title}</h1><div class="ahead-actions">${actions}</div></div>
    ${body}
  </div>
</div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script src="/static/js/admin.js?v=${VER}" defer></script>
</body></html>`;
}

function login(ctx, { error, email }) {
  return html`${head(ctx, { title: 'Logowanie – Panel', extraCss: `<link rel="stylesheet" href="/static/css/admin.css?v=${VER}">` })}
<body class="admin login-page">
<div class="login-wrap">
  <div class="login-art"><div><img src="/static/img/logo.webp" alt="PSB Fimal" class="login-logo-w"><h2>Panel zarządzania sklepem</h2><p>Zamówienia, odbiory osobiste, produkty i stany magazynowe w jednym miejscu.</p></div></div>
  <form class="login-card" method="post" action="/admin/logowanie">
    ${csrfInput(ctx)}
    <img src="/static/img/logo.webp" alt="PSB Fimal" class="login-logo">
    <h1>Zaloguj się</h1>
    ${error ? html`<div class="note note-error">${icon('alert', 18)} ${error}</div>` : ''}
    <label class="fld"><span>E-mail</span><input type="email" name="email" value="${email || ''}" required autofocus autocomplete="username"></label>
    <label class="fld"><span>Hasło</span><input type="password" name="password" required autocomplete="current-password"></label>
    <button class="btn btn-primary btn-lg btn-block" type="submit">Zaloguj</button>
    <a href="/" class="muted small center block">‹ Wróć do sklepu</a>
  </form>
</div></body></html>`;
}

/* ---------- Pulpit ---------- */
function barChart(days) {
  const W = 760, H = 220, pad = 34;
  const max = Math.max(1, ...days.map((d) => d.total));
  const bw = (W - pad * 2) / days.length;
  const nice = Math.ceil(max / 100 / 500) * 500 * 100 || 100;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * nice);
  return raw(`<svg viewBox="0 0 ${W} ${H + 30}" class="chart" role="img" aria-label="Sprzedaż dzienna">
${ticks.map((t) => { const y = H - (t / nice) * (H - 20); return `<line x1="${pad}" x2="${W - 6}" y1="${y}" y2="${y}" class="grid-l"/><text x="${pad - 6}" y="${y + 4}" text-anchor="end" class="ax">${Math.round(t / 100 / 1000) ? Math.round(t / 100 / 100) / 10 + 'k' : Math.round(t / 100)}</text>`; }).join('')}
${days.map((d, i) => {
    const h = (d.total / nice) * (H - 20);
    const x = pad + i * bw + bw * 0.18;
    return `<g class="bar-g"><rect x="${x.toFixed(1)}" y="${(H - h).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${Math.max(h, d.total ? 2 : 0).toFixed(1)}" rx="3" class="bar ${d.today ? 'bar-today' : ''}"><title>${esc(d.label)}: ${esc(money(d.total))} (${d.count} zam.)</title></rect>${i % 2 === days.length % 2 || days.length < 16 ? `<text x="${(x + bw * 0.32).toFixed(1)}" y="${H + 18}" text-anchor="middle" class="ax">${esc(d.short)}</text>` : ''}</g>`;
  }).join('')}
</svg>`);
}
function dashboard(ctx, d) {
  const kpi = (label, value, sub, ic, cls = '') => html`<div class="kpi ${cls}"><div class="kpi-ico">${icon(ic, 22)}</div><div><small>${label}</small><strong>${value}</strong><span>${sub}</span></div></div>`;
  const totalStatus = Object.values(d.byStatus).reduce((a, b) => a + b, 0) || 1;
  const body = html`
<div class="kpis">
  ${kpi('Sprzedaż – ostatnie 30 dni', money(d.revenue30), `${d.orders30} zamówień · śr. ${money(d.avg30)}`, 'chart', 'kpi-red')}
  ${kpi('Zamówienia dzisiaj', d.ordersToday, `wartość ${money(d.revenueToday)}`, 'list')}
  ${kpi('Do obsłużenia', d.byStatus.nowe || 0, `nowe · ${d.byStatus.potwierdzone || 0} potwierdzonych`, 'alert', d.byStatus.nowe ? 'kpi-warn' : '')}
  ${kpi('Odbiory dzisiaj', d.pickupsToday.length, `${d.byStatus.gotowe || 0} gotowych do wydania`, 'store')}
</div>
<div class="agrid">
  <section class="panel span2">
    <div class="panel-head"><h2>Sprzedaż dzienna (30 dni)</h2><span class="muted small">bez zamówień anulowanych</span></div>
    ${barChart(d.days)}
  </section>
  <section class="panel">
    <div class="panel-head"><h2>Statusy zamówień</h2></div>
    <div class="status-bars">${Object.entries(STATUSES).map(([k, s]) => html`<a href="/admin/zamowienia?status=${k}" class="sbar"><span class="sbar-l">${pill(k)}</span><span class="sbar-track"><i class="bg-${s.cls}" style="width:${Math.round(((d.byStatus[k] || 0) / totalStatus) * 100)}%"></i></span><strong>${d.byStatus[k] || 0}</strong></a>`)}</div>
  </section>
  <section class="panel span2">
    <div class="panel-head"><h2>Dzisiejsze odbiory</h2><a href="/admin/odbiory" class="link">Harmonogram ${icon('chevron', 14)}</a></div>
    ${d.pickupsToday.length ? html`<table class="atbl"><thead><tr><th>Godzina</th><th>Zamówienie</th><th>Klient</th><th>Punkt</th><th class="r">Wartość</th><th>Status</th></tr></thead><tbody>
    ${d.pickupsToday.map((o) => html`<tr><td><strong>${o.pickup_slot}</strong></td><td><a href="/admin/zamowienia/${o.id}">${o.number}</a></td><td>${o.customer_name}<br><small class="muted">${o.phone}</small></td><td>${o.location_name}</td><td class="r">${money(o.total)}</td><td>${pill(o.status)}</td></tr>`)}
    </tbody></table>` : html`<p class="empty-s">Brak odbiorów zaplanowanych na dziś.</p>`}
  </section>
  <section class="panel">
    <div class="panel-head"><h2>Niskie stany</h2><a href="/admin/magazyn" class="link">Magazyn ${icon('chevron', 14)}</a></div>
    ${d.lowStock.length ? html`<ul class="lst">${d.lowStock.map((p) => html`<li><a href="/admin/produkty/${p.id}">${p.name}</a><span class="stock-n ${p.stock <= 0 ? 'out' : 'low'}">${p.stock} ${p.unit}</span></li>`)}</ul>` : html`<p class="empty-s">Wszystkie stany w normie.</p>`}
  </section>
  <section class="panel span2">
    <div class="panel-head"><h2>Ostatnie zamówienia</h2><a href="/admin/zamowienia" class="link">Wszystkie ${icon('chevron', 14)}</a></div>
    <table class="atbl"><thead><tr><th>Numer</th><th>Data</th><th>Klient</th><th>Odbiór</th><th class="r">Wartość</th><th>Status</th></tr></thead><tbody>
    ${d.recent.map((o) => html`<tr><td><a href="/admin/zamowienia/${o.id}"><strong>${o.number}</strong></a></td><td>${dtPL(o.created_at)}</td><td>${o.customer_name}</td><td>${datePL(o.pickup_date, false)}<br><small class="muted">${o.pickup_slot}</small></td><td class="r">${money(o.total)}</td><td>${pill(o.status)}</td></tr>`)}
    </tbody></table>
  </section>
  <section class="panel">
    <div class="panel-head"><h2>Bestsellery (30 dni)</h2></div>
    ${d.top.length ? html`<ol class="top">${d.top.map((p) => html`<li><span>${p.name}</span><small>${p.qty} ${p.unit} · ${money(p.value)}</small></li>`)}</ol>` : html`<p class="empty-s">Brak danych.</p>`}
  </section>
</div>`;
  return alayout(ctx, { title: 'Pulpit', body, actions: html`<a href="/admin/produkty/nowy" class="btn btn-ghost">${icon('plus', 16)} Dodaj produkt</a><a href="/admin/odbiory" class="btn btn-primary">${icon('calendar', 16)} Odbiory dziś</a>` });
}

/* ---------- Zamówienia ---------- */
function orders(ctx, { list, total, page, pages, params, counts, locations }) {
  const tabs = [['', 'Wszystkie', counts._all], ...Object.entries(STATUSES).map(([k, s]) => [k, s.label, counts[k] || 0])];
  const body = html`
<div class="tabs-a">${tabs.map(([k, l, n]) => html`<a href="${qs('/admin/zamowienia', params, { status: k, page: '' })}" class="${(params.status || '') === k ? 'active' : ''}">${l} <em>${n}</em></a>`)}</div>
<form class="filters-a" method="get">
  <input type="hidden" name="status" value="${params.status || ''}">
  <label><span>Szukaj</span><input name="q" value="${params.q || ''}" placeholder="numer, klient, e-mail, telefon, NIP"></label>
  <label><span>Złożone od</span><input type="date" name="od" value="${params.od || ''}"></label>
  <label><span>do</span><input type="date" name="do" value="${params.do || ''}"></label>
  <label><span>Dzień odbioru</span><input type="date" name="odbior" value="${params.odbior || ''}"></label>
  <label><span>Punkt</span><select name="punkt"><option value="">Wszystkie</option>${locations.map((l) => html`<option value="${l.id}" ${String(params.punkt) === String(l.id) ? 'selected' : ''}>${l.name}</option>`)}</select></label>
  <div class="fa-btns"><button class="btn btn-primary">Filtruj</button><a class="btn btn-ghost" href="/admin/zamowienia">Wyczyść</a></div>
</form>
<form method="post" action="/admin/zamowienia/zbiorczo" class="panel" data-bulk>
  ${csrfInput(ctx)}
  <div class="bulk-bar"><span><strong data-bulk-count>0</strong> zaznaczonych</span>
    <select name="status"><option value="">Zmień status na…</option>${Object.entries(STATUSES).map(([k, s]) => html`<option value="${k}">${s.label}</option>`)}</select>
    <button class="btn btn-sm btn-primary" data-confirm="Zmienić status zaznaczonych zamówień?">Zastosuj</button></div>
  <div class="tbl-wrap"><table class="atbl">
    <thead><tr><th class="cb"><input type="checkbox" data-check-all aria-label="Zaznacz wszystkie"></th><th>Numer</th><th>Złożone</th><th>Klient</th><th>Odbiór</th><th>Płatność</th><th class="r">Wartość</th><th>Status</th><th></th></tr></thead>
    <tbody>${list.length ? list.map((o) => html`<tr class="${o.status === 'nowe' ? 'row-new' : ''}">
      <td class="cb"><input type="checkbox" name="ids[]" value="${o.id}" data-check></td>
      <td><a href="/admin/zamowienia/${o.id}"><strong>${o.number}</strong></a>${o.customer_note ? html` <span title="${o.customer_note}">${icon('info', 14, 'muted')}</span>` : ''}</td>
      <td>${dtPL(o.created_at)}</td>
      <td>${o.customer_name}${o.want_invoice ? html` <span class="tag">FV</span>` : ''}<br><small class="muted">${o.phone}</small></td>
      <td>${datePL(o.pickup_date, false)}<br><small class="muted">${o.pickup_slot} · ${o.location_name || ''}</small></td>
      <td><small>${(PAYMENTS[o.payment_method] || '').split(' ')[0]}</small> ${o.paid ? html`<span class="tag tag-green">opłacone</span>` : ''}</td>
      <td class="r"><strong>${money(o.total)}</strong><br><small class="muted">${o.items_count} poz.</small></td>
      <td>${pill(o.status)}</td>
      <td class="r"><a href="/admin/zamowienia/${o.id}" class="icon-btn" title="Szczegóły">${icon('eye', 18)}</a></td>
    </tr>`) : html`<tr><td colspan="9" class="empty-s">Brak zamówień spełniających kryteria.</td></tr>`}</tbody>
  </table></div>
</form>
${pager('/admin/zamowienia', params, page, pages, total)}`;
  return alayout(ctx, { title: 'Zamówienia', body, actions: html`<a class="btn btn-ghost" href="${qs('/admin/zamowienia.csv', params)}">${icon('download', 16)} Eksport CSV</a>` });
}
function pager(base, params, page, pages, total) {
  if (pages <= 1) return html`<p class="muted small">Łącznie: ${total}</p>`;
  const nums = [];
  for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= 2) nums.push(i); else if (nums[nums.length - 1] !== '…') nums.push('…');
  return html`<nav class="apager"><span class="muted small">Łącznie: ${total}</span>${nums.map((n) => n === '…' ? html`<span>…</span>` : html`<a href="${qs(base, params, { page: n })}" class="${n === page ? 'active' : ''}">${n}</a>`)}</nav>`;
}

function orderDetail(ctx, { o, items, history, location, locations, slots }) {
  const next = { nowe: ['potwierdzone', 'Potwierdź zamówienie'], potwierdzone: ['gotowe', 'Oznacz jako gotowe do odbioru'], gotowe: ['odebrane', 'Wydano klientowi – odebrane'] }[o.status];
  const s = ctx.settings;
  const body = html`
<div class="od-top">
  <div class="od-status">${pill(o.status)} <span class="muted">Złożone ${dtPL(o.created_at)}${o.updated_at !== o.created_at ? ` · zmiana ${dtPL(o.updated_at)}` : ''}</span></div>
  <div class="od-actions">
    ${next ? html`<form method="post" action="/admin/zamowienia/${o.id}/status">${csrfInput(ctx)}<input type="hidden" name="status" value="${next[0]}"><button class="btn btn-primary">${icon('check', 16)} ${next[1]}</button></form>` : ''}
    <a href="/admin/zamowienia/${o.id}/druk" target="_blank" class="btn btn-ghost">${icon('print', 16)} Drukuj listę kompletacyjną</a>
  </div>
</div>
<div class="agrid od-grid">
  <section class="panel span2">
    <div class="panel-head"><h2>Pozycje zamówienia</h2><span class="muted small">${items.length} ${plural(items.length, 'pozycja', 'pozycje', 'pozycji')}</span></div>
    <table class="atbl"><thead><tr><th>Produkt</th><th>Kod</th><th class="r">Cena</th><th class="r">Ilość</th><th class="r">Wartość</th><th class="r">Stan obecny</th></tr></thead><tbody>
    ${items.map((i) => html`<tr><td>${i.product_id && i.cur_stock != null ? html`<a href="/admin/produkty/${i.product_id}">${i.name}</a>` : i.name}</td><td><code>${i.sku}</code></td><td class="r">${money(i.price)}</td><td class="r"><strong>${i.qty}</strong> ${i.unit}</td><td class="r">${money(i.total)}</td><td class="r">${i.cur_stock != null ? `${i.cur_stock} ${i.unit}` : '—'}</td></tr>`)}
    </tbody><tfoot>
      <tr><td colspan="4" class="r muted">Netto</td><td class="r muted">${money(netOf(o.total, +s.vat_rate || 23))}</td><td></td></tr>
      <tr><td colspan="4" class="r muted">VAT ${s.vat_rate}%</td><td class="r muted">${money(o.total - netOf(o.total, +s.vat_rate || 23))}</td><td></td></tr>
      <tr><td colspan="4" class="r"><strong>Razem brutto</strong></td><td class="r"><strong class="big">${money(o.total)}</strong></td><td></td></tr></tfoot></table>
    ${o.customer_note ? html`<div class="note note-info">${icon('info', 18)} <div><strong>Uwagi klienta:</strong> ${o.customer_note}</div></div>` : ''}
  </section>
  <section class="panel">
    <div class="panel-head"><h2>Klient</h2></div>
    <dl class="dl"><dt>Imię i nazwisko</dt><dd><strong>${o.customer_name}</strong></dd>
    <dt>Telefon</dt><dd><a href="tel:${o.phone}">${o.phone}</a></dd>
    <dt>E-mail</dt><dd><a href="mailto:${o.email}">${o.email}</a></dd>
    ${o.want_invoice ? html`<dt>Faktura VAT</dt><dd><strong>${o.company}</strong><br>NIP: ${o.nip}${o.invoice_address ? html`<br>${o.invoice_address}` : ''}</dd>` : html`<dt>Dokument</dt><dd>Paragon</dd>`}
    </dl>
  </section>
  <section class="panel">
    <div class="panel-head"><h2>Odbiór osobisty</h2></div>
    <dl class="dl"><dt>Punkt</dt><dd><strong>${location ? location.name : '—'}</strong>${location ? html`<br><small class="muted">${location.address}, ${location.city}</small>` : ''}</dd>
    <dt>Termin</dt><dd><strong>${datePL(o.pickup_date)}</strong><br>godz. ${o.pickup_slot}</dd>
    ${o.picked_up_at ? html`<dt>Wydano</dt><dd>${dtPL(o.picked_up_at)}</dd>` : ''}</dl>
    <details class="det"><summary>${icon('edit', 15)} Zmień termin lub punkt</summary>
      <form method="post" action="/admin/zamowienia/${o.id}/termin" class="stack">${csrfInput(ctx)}
        <label class="fld"><span>Punkt</span><select name="location_id">${locations.map((l) => html`<option value="${l.id}" ${l.id === o.location_id ? 'selected' : ''}>${l.name}</option>`)}</select></label>
        <label class="fld"><span>Data</span><input type="date" name="pickup_date" value="${o.pickup_date}" required></label>
        <label class="fld"><span>Godzina (np. 10:00–11:00)</span><input name="pickup_slot" value="${o.pickup_slot}" list="slots-list" required><datalist id="slots-list">${slots.map((x) => html`<option value="${x.label}">`)}</datalist></label>
        <button class="btn btn-sm btn-primary">Zapisz termin</button></form></details>
  </section>
  <section class="panel">
    <div class="panel-head"><h2>Płatność</h2></div>
    <dl class="dl"><dt>Forma</dt><dd>${PAYMENTS[o.payment_method] || o.payment_method}</dd><dt>Status</dt><dd>${o.paid ? html`<span class="tag tag-green">Opłacone</span>` : html`<span class="tag tag-amber">Nieopłacone</span>`}</dd></dl>
    <form method="post" action="/admin/zamowienia/${o.id}/platnosc">${csrfInput(ctx)}<input type="hidden" name="paid" value="${o.paid ? 0 : 1}"><button class="btn btn-sm btn-ghost btn-block">${o.paid ? 'Oznacz jako nieopłacone' : html`${icon('check', 15)} Oznacz jako opłacone`}</button></form>
  </section>
  <section class="panel">
    <div class="panel-head"><h2>Zmiana statusu</h2></div>
    <form method="post" action="/admin/zamowienia/${o.id}/status" class="stack">${csrfInput(ctx)}
      <select name="status">${Object.entries(STATUSES).map(([k, st]) => html`<option value="${k}" ${o.status === k ? 'selected' : ''}>${st.label}</option>`)}</select>
      <textarea name="note" rows="2" placeholder="Komentarz do zmiany (opcjonalnie)"></textarea>
      <button class="btn btn-sm btn-primary" data-confirm-if-cancel>Zapisz status</button>
      <p class="muted small">Anulowanie zwraca towar na stan magazynowy. Przywrócenie anulowanego zamówienia ponownie rezerwuje towar.</p>
    </form>
  </section>
  <section class="panel">
    <div class="panel-head"><h2>Notatka wewnętrzna</h2></div>
    <form method="post" action="/admin/zamowienia/${o.id}/notatka" class="stack">${csrfInput(ctx)}
      <textarea name="admin_note" rows="3" placeholder="Widoczna tylko dla obsługi">${o.admin_note}</textarea>
      <button class="btn btn-sm btn-ghost">Zapisz notatkę</button></form>
  </section>
  <section class="panel span2">
    <div class="panel-head"><h2>Historia zamówienia</h2></div>
    <ul class="timeline">${history.map((h) => html`<li><span class="dot bg-${(STATUSES[h.status] || {}).cls || 'gray'}"></span><div><strong>${(STATUSES[h.status] || { label: h.status || 'Zmiana' }).label}</strong> <small class="muted">${dtPL(h.created_at)} · ${h.author}</small>${h.note ? html`<p>${h.note}</p>` : ''}</div></li>`)}</ul>
  </section>
</div>`;
  return alayout(ctx, { title: `Zamówienie ${o.number}`, body, actions: html`<a href="/admin/zamowienia" class="btn btn-ghost">‹ Lista zamówień</a>` });
}

function orderPrint(ctx, { o, items, location }) {
  const s = ctx.settings;
  return html`<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Kompletacja ${o.number}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:32px;font-size:13px}h1{font-size:22px;margin:0}table{width:100%;border-collapse:collapse;margin:18px 0}th,td{border:1px solid #bbb;padding:7px 8px;text-align:left}th{background:#f2f2f2}.r{text-align:right}.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:4px solid #e30613;padding-bottom:12px}.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:16px}.box{border:1px solid #ccc;padding:10px;border-radius:6px}.box small{display:block;color:#666;text-transform:uppercase;font-size:10px;margin-bottom:3px}.sig{display:flex;justify-content:space-between;margin-top:50px}.sig div{width:40%;border-top:1px solid #333;padding-top:6px;text-align:center;color:#555}.no{font-size:28px;font-weight:800;letter-spacing:1px}@media print{body{margin:10mm}.np{display:none}}</style></head>
<body><button class="np" onclick="print()" style="float:right;padding:8px 14px">Drukuj</button>
<div class="top"><div><img src="/static/img/logo.webp" alt="" style="height:38px"><div style="margin-top:6px;color:#555">${s.store_name} · ${s.phone}</div></div>
<div style="text-align:right"><div>Lista kompletacyjna / wydanie towaru</div><div class="no">${o.number}</div><div>${(STATUSES[o.status] || {}).label || o.status}</div></div></div>
<div class="grid"><div class="box"><small>Klient</small><strong>${o.customer_name}</strong><br>${o.phone}<br>${o.email}${o.want_invoice ? html`<br><b>FV:</b> ${o.company}, NIP ${o.nip}` : ''}</div>
<div class="box"><small>Odbiór</small><strong>${datePL(o.pickup_date)}</strong><br>godz. ${o.pickup_slot}<br>${location ? location.name : ''}</div>
<div class="box"><small>Płatność</small>${PAYMENTS[o.payment_method] || ''}<br><strong>${o.paid ? 'OPŁACONE' : 'DO ZAPŁATY: ' + money(o.total)}</strong></div></div>
${o.customer_note ? html`<p><b>Uwagi klienta:</b> ${o.customer_note}</p>` : ''}${o.admin_note ? html`<p><b>Notatka:</b> ${o.admin_note}</p>` : ''}
<table><thead><tr><th style="width:30px">✓</th><th>Kod</th><th>Produkt</th><th class="r">Ilość</th><th class="r">Cena</th><th class="r">Wartość</th></tr></thead><tbody>
${items.map((i) => html`<tr><td>☐</td><td>${i.sku}</td><td>${i.name}</td><td class="r"><b>${i.qty} ${i.unit}</b></td><td class="r">${money(i.price)}</td><td class="r">${money(i.total)}</td></tr>`)}
</tbody><tfoot><tr><td colspan="5" class="r"><b>Razem brutto</b></td><td class="r"><b>${money(o.total)}</b></td></tr></tfoot></table>
<div class="sig"><div>Wydał (podpis pracownika)</div><div>Odebrał (podpis klienta)</div></div>
<script>setTimeout(()=>print(),300)</script></body></html>`;
}

/* ---------- Harmonogram odbiorów ---------- */
function pickups(ctx, { date, groups, days, counts }) {
  const body = html`
<div class="day-strip">${days.map((d) => html`<a href="/admin/odbiory?data=${d.value}" class="${d.value === date ? 'active' : ''} ${d.today ? 'today' : ''}"><small>${d.dow}</small><strong>${d.day}</strong><small>${d.month}</small>${d.count ? html`<em>${d.count}</em>` : ''}</a>`)}</div>
<div class="pk-head"><h2>${datePL(date)}</h2><span class="muted">${counts.total} ${plural(counts.total, 'odbiór', 'odbiory', 'odbiorów')} · ${counts.done} wydanych</span>
<form method="get" class="inline"><input type="date" name="data" value="${date}" data-autosubmit></form></div>
${groups.length ? groups.map((g) => html`<section class="panel">
  <div class="panel-head"><h2>${icon('pin', 18)} ${g.location}</h2><span class="muted small">${g.orders.length} zam.</span></div>
  <div class="pk-list">${g.orders.map((o) => html`<div class="pk ${o.status}">
    <div class="pk-time">${o.pickup_slot}</div>
    <div class="pk-main"><a href="/admin/zamowienia/${o.id}"><strong>${o.number}</strong></a> ${pill(o.status)}<div>${o.customer_name} · <a href="tel:${o.phone}">${o.phone}</a></div>
      <small class="muted">${o.items_summary}</small></div>
    <div class="pk-val"><strong>${money(o.total)}</strong><small>${o.paid ? 'opłacone' : (PAYMENTS[o.payment_method] || '').split(' ')[0]}</small></div>
    <div class="pk-act">
      ${o.status === 'nowe' || o.status === 'potwierdzone' ? html`<form method="post" action="/admin/zamowienia/${o.id}/status">${csrfInput(ctx)}<input type="hidden" name="status" value="gotowe"><input type="hidden" name="back" value="/admin/odbiory?data=${date}"><button class="btn btn-sm btn-ghost">Gotowe</button></form>` : ''}
      ${o.status !== 'odebrane' && o.status !== 'anulowane' ? html`<form method="post" action="/admin/zamowienia/${o.id}/status">${csrfInput(ctx)}<input type="hidden" name="status" value="odebrane"><input type="hidden" name="back" value="/admin/odbiory?data=${date}"><button class="btn btn-sm btn-primary">${icon('check', 14)} Wydano</button></form>` : ''}
      <a href="/admin/zamowienia/${o.id}/druk" target="_blank" class="icon-btn" title="Drukuj">${icon('print', 17)}</a>
    </div></div>`)}</div>
</section>`) : html`<div class="panel"><p class="empty-s">${icon('calendar', 28)}<br>Brak zaplanowanych odbiorów w tym dniu.</p></div>`}`;
  return alayout(ctx, { title: 'Harmonogram odbiorów', body });
}

/* ---------- Produkty ---------- */
function products(ctx, { list, total, page, pages, params, categories }) {
  const low = +ctx.settings.low_stock_threshold || 10;
  const body = html`
<form class="filters-a" method="get">
  <label><span>Szukaj</span><input name="q" value="${params.q || ''}" placeholder="nazwa, kod, producent"></label>
  <label><span>Kategoria</span><select name="kat"><option value="">Wszystkie</option>${categories.map((c) => html`<option value="${c.id}" ${String(params.kat) === String(c.id) ? 'selected' : ''}>${c.name}</option>`)}</select></label>
  <label><span>Stan</span><select name="stan"><option value="">Dowolny</option><option value="brak" ${params.stan === 'brak' ? 'selected' : ''}>Niedostępne (0)</option><option value="niski" ${params.stan === 'niski' ? 'selected' : ''}>Niski stan (≤ ${low})</option><option value="dostepne" ${params.stan === 'dostepne' ? 'selected' : ''}>Dostępne</option></select></label>
  <label><span>Widoczność</span><select name="aktywne"><option value="">Wszystkie</option><option value="1" ${params.aktywne === '1' ? 'selected' : ''}>Aktywne</option><option value="0" ${params.aktywne === '0' ? 'selected' : ''}>Ukryte</option></select></label>
  <div class="fa-btns"><button class="btn btn-primary">Filtruj</button><a class="btn btn-ghost" href="/admin/produkty">Wyczyść</a></div>
</form>
<form method="post" action="/admin/produkty/zbiorczo" class="panel" data-bulk>
  ${csrfInput(ctx)}
  <div class="bulk-bar"><span><strong data-bulk-count>0</strong> zaznaczonych</span>
    <select name="action"><option value="">Akcja zbiorcza…</option><option value="activate">Pokaż w sklepie</option><option value="deactivate">Ukryj w sklepie</option><option value="feature">Oznacz jako polecane</option><option value="unfeature">Usuń z polecanych</option><option value="clearpromo">Usuń cenę promocyjną</option>${ctx.user.role === 'admin' ? html`<option value="delete">Usuń produkty</option>` : ''}</select>
    <button class="btn btn-sm btn-primary" data-confirm="Wykonać akcję dla zaznaczonych produktów?">Zastosuj</button></div>
  <div class="tbl-wrap"><table class="atbl prod-tbl">
  <thead><tr><th class="cb"><input type="checkbox" data-check-all aria-label="Zaznacz wszystkie"></th><th></th><th>Produkt</th><th>Kategoria</th><th class="r">Cena brutto</th><th>Stan</th><th>Status</th><th></th></tr></thead>
  <tbody>${list.length ? list.map((p) => html`<tr class="${p.active ? '' : 'row-off'}">
    <td class="cb"><input type="checkbox" name="ids[]" value="${p.id}" data-check></td>
    <td><img src="${p.image || '/static/img/placeholder.svg'}" alt="" class="thumb"></td>
    <td><a href="/admin/produkty/${p.id}"><strong>${p.name}</strong></a><br><small class="muted"><code>${p.sku}</code> · ${p.brand || '—'} · ${p.views} wyśw.</small></td>
    <td>${p.category_name || html`<span class="muted">—</span>`}</td>
    <td class="r">${effPrice(p) < p.price ? html`<s class="muted small">${money(p.price)}</s><br><strong class="red">${money(effPrice(p))}</strong>` : html`<strong>${money(p.price)}</strong>`}<br><small class="muted">/ ${p.unit}</small></td>
    <td><div class="stock-edit" data-stock-edit="${p.id}"><input type="number" value="${p.stock}" step="1" aria-label="Stan"><button type="button" class="icon-btn" title="Zapisz stan">${icon('check', 16)}</button></div>
      <span class="stock-n ${p.stock <= 0 ? 'out' : p.stock <= low ? 'low' : 'ok'}">${p.stock <= 0 ? 'brak' : p.stock <= low ? 'niski' : 'ok'}</span></td>
    <td>${p.active ? html`<span class="tag tag-green">widoczny</span>` : html`<span class="tag">ukryty</span>`}${p.featured ? html` <span class="tag tag-red">polecany</span>` : ''}</td>
    <td class="r nowrap"><a href="/produkt/${p.slug}" target="_blank" class="icon-btn" title="Podgląd w sklepie">${icon('eye', 17)}</a><a href="/admin/produkty/${p.id}" class="icon-btn" title="Edytuj">${icon('edit', 17)}</a></td>
  </tr>`) : html`<tr><td colspan="8" class="empty-s">Brak produktów.</td></tr>`}</tbody></table></div>
</form>
${pager('/admin/produkty', params, page, pages, total)}`;
  return alayout(ctx, { title: 'Produkty', body, actions: html`
    <a class="btn btn-ghost" href="${qs('/admin/produkty.csv', params)}">${icon('download', 16)} Eksport CSV</a>
    ${ctx.user.role === 'admin' ? html`<a class="btn btn-ghost" href="/admin/produkty/import">${icon('upload', 16)} Import CSV</a>` : ''}
    <a class="btn btn-primary" href="/admin/produkty/nowy">${icon('plus', 16)} Dodaj produkt</a>` });
}

function productForm(ctx, { p, categories, errors, isNew, moves }) {
  const e = errors || {};
  const err = (k) => (e[k] ? html`<span class="err">${e[k]}</span>` : '');
  let specs = [], gallery = [];
  try { specs = typeof p.specs === 'string' ? JSON.parse(p.specs || '[]') : p.specs || []; } catch { /* */ }
  try { gallery = typeof p.gallery === 'string' ? JSON.parse(p.gallery || '[]') : p.gallery || []; } catch { /* */ }
  if (!specs.length) specs = [{ n: '', v: '' }];
  const isAdmin = ctx.user.role === 'admin';
  const body = html`
${Object.keys(e).length ? html`<div class="note note-error">${icon('alert', 18)} Popraw błędy w formularzu.</div>` : ''}
<form method="post" action="${isNew ? '/admin/produkty/nowy' : `/admin/produkty/${p.id}`}" enctype="multipart/form-data" class="pform">
  ${csrfInput(ctx)}
  <div class="pform-main">
    <section class="panel"><div class="panel-head"><h2>Informacje podstawowe</h2></div>
      <div class="fgrid">
        <label class="fld full ${e.name ? 'has-err' : ''}"><span>Nazwa produktu *</span><input name="name" value="${p.name || ''}" required maxlength="200" data-slug-src>${err('name')}</label>
        <label class="fld ${e.sku ? 'has-err' : ''}"><span>Kod (SKU) *</span><input name="sku" value="${p.sku || ''}" required maxlength="60">${err('sku')}</label>
        <label class="fld ${e.slug ? 'has-err' : ''}"><span>Adres URL (slug)</span><input name="slug" value="${p.slug || ''}" placeholder="generowany automatycznie" data-slug>${err('slug')}</label>
        <label class="fld"><span>Kategoria</span><select name="category_id"><option value="">— brak —</option>${categories.map((c) => html`<option value="${c.id}" ${p.category_id === c.id ? 'selected' : ''}>${c.name}</option>`)}</select></label>
        <label class="fld"><span>Producent / marka</span><input name="brand" value="${p.brand || ''}" maxlength="80"></label>
        <label class="fld full"><span>Krótki opis (lista produktów, SEO)</span><input name="short_desc" value="${p.short_desc || ''}" maxlength="300"></label>
        <label class="fld full"><span>Pełny opis</span><textarea name="description" rows="8">${p.description || ''}</textarea></label>
      </div>
    </section>
    <section class="panel"><div class="panel-head"><h2>Specyfikacja techniczna</h2><button type="button" class="btn btn-sm btn-ghost" data-add-spec>${icon('plus', 14)} Dodaj parametr</button></div>
      <div class="specs" id="specs">${specs.map((s) => html`<div class="spec-row"><input name="spec_n[]" value="${s.n}" placeholder="Parametr, np. Grubość"><input name="spec_v[]" value="${s.v}" placeholder="Wartość, np. 12 mm"><button type="button" class="icon-btn" data-del-spec title="Usuń">${icon('trash', 16)}</button></div>`)}</div>
    </section>
    <section class="panel"><div class="panel-head"><h2>Zdjęcia</h2></div>
      <div class="img-edit">
        <div class="img-main"><img src="${p.image || '/static/img/placeholder.svg'}" alt="" id="img-preview"><label class="btn btn-sm btn-ghost">${icon('upload', 14)} Zmień zdjęcie główne<input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/gif" hidden data-preview="img-preview"></label></div>
        <div class="gal">
          ${gallery.map((g) => html`<label class="gal-item"><img src="${g}" alt=""><span><input type="checkbox" name="remove_gallery[]" value="${g}"> usuń</span></label>`)}
          <label class="gal-add">${icon('plus', 22)}<span>Dodaj zdjęcia do galerii</span><input type="file" name="gallery" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden data-count></label>
        </div>
      </div>
      <p class="muted small">JPG, PNG, WEBP lub GIF, maks. 8 MB na plik. Zalecany format kwadratowy (min. 800×800 px).</p>
    </section>
  </div>
  <div class="pform-side">
    <section class="panel"><div class="panel-head"><h2>Publikacja</h2></div>
      <label class="switch"><input type="checkbox" name="active" value="1" ${p.active ? 'checked' : ''}><i></i><span>Widoczny w sklepie</span></label>
      <label class="switch"><input type="checkbox" name="featured" value="1" ${p.featured ? 'checked' : ''}><i></i><span>Produkt polecany (strona główna)</span></label>
      <button class="btn btn-primary btn-block btn-lg" type="submit">${icon('check', 18)} ${isNew ? 'Dodaj produkt' : 'Zapisz zmiany'}</button>
      ${!isNew ? html`<a href="/produkt/${p.slug}" target="_blank" class="btn btn-ghost btn-block">${icon('eye', 16)} Zobacz w sklepie</a>` : ''}
    </section>
    <section class="panel"><div class="panel-head"><h2>Cena i sprzedaż</h2></div>
      <label class="fld ${e.price ? 'has-err' : ''}"><span>Cena brutto (zł) *</span><input name="price" value="${moneyInput(p.price)}" inputmode="decimal" required data-price>${err('price')}<small class="muted" data-net></small></label>
      <label class="fld ${e.promo_price ? 'has-err' : ''}"><span>Cena promocyjna brutto (zł)</span><input name="promo_price" value="${moneyInput(p.promo_price)}" inputmode="decimal" placeholder="brak promocji">${err('promo_price')}</label>
      <label class="fld"><span>Jednostka sprzedaży</span><select name="unit">${UNITS.map((u) => html`<option ${p.unit === u ? 'selected' : ''}>${u}</option>`)}</select></label>
      <label class="fld"><span>Maks. ilość w zamówieniu</span><input type="number" name="max_per_order" min="0" value="${p.max_per_order || 0}"><small class="muted">0 = bez limitu</small></label>
      <label class="fld"><span>Waga jednostki (kg)</span><input name="weight" value="${p.weight ? String(p.weight).replace('.', ',') : ''}" inputmode="decimal"></label>
    </section>
    <section class="panel"><div class="panel-head"><h2>Magazyn</h2></div>
      ${isNew ? html`<label class="fld"><span>Stan początkowy</span><input type="number" name="stock" value="${p.stock || 0}" min="0"></label>` : html`
      <div class="stock-big"><small>Aktualny stan</small><strong>${p.stock} ${p.unit}</strong></div>
      <div class="fgrid2"><label class="fld"><span>Korekta (+/-)</span><input type="number" name="stock_delta" value="" placeholder="np. 50 lub -3"></label>
      <label class="fld"><span>Powód</span><input name="stock_reason" placeholder="np. dostawa"></label></div>
      ${moves && moves.length ? html`<ul class="moves">${moves.map((m) => html`<li><span class="${m.delta > 0 ? 'green' : 'red'}">${m.delta > 0 ? '+' : ''}${m.delta}</span><span>${m.reason}</span><small>${dtPL(m.created_at)}</small></li>`)}</ul>` : ''}`}
    </section>
    ${!isNew ? html`<section class="panel"><div class="panel-head"><h2>Inne akcje</h2></div>
      <button class="btn btn-ghost btn-block" type="submit" formaction="/admin/produkty/${p.id}/duplikuj" formnovalidate>${icon('copy', 16)} Duplikuj produkt</button>
      ${isAdmin ? html`<button class="btn btn-danger btn-block" type="submit" formaction="/admin/produkty/${p.id}/usun" formnovalidate data-confirm="Usunąć produkt na stałe? Historia zamówień pozostanie.">${icon('trash', 16)} Usuń produkt</button>` : ''}
    </section>` : ''}
  </div>
</form>`;
  return alayout(ctx, { title: isNew ? 'Nowy produkt' : `Edycja: ${p.name}`, body, actions: html`<a href="/admin/produkty" class="btn btn-ghost">‹ Lista produktów</a>` });
}

function importPage(ctx, { result }) {
  const body = html`<div class="agrid">
  <section class="panel span2"><div class="panel-head"><h2>Import / aktualizacja produktów z CSV</h2></div>
    ${result ? html`<div class="note ${result.errors.length ? 'note-warn' : 'note-success'}">${icon('check', 18)} <div>Zaktualizowano: <b>${result.updated}</b>, dodano: <b>${result.created}</b>, pominięto: <b>${result.skipped}</b>.${result.errors.length ? html`<ul>${result.errors.slice(0, 20).map((x) => html`<li>${x}</li>`)}</ul>` : ''}</div></div>` : ''}
    <form method="post" action="/admin/produkty/import" enctype="multipart/form-data" class="stack">${csrfInput(ctx)}
      <label class="fld"><span>Plik CSV (separator ; lub ,)</span><input type="file" name="file" accept=".csv,text/csv" required></label>
      <label class="check"><input type="checkbox" name="create" value="1"> <span>Dodawaj nowe produkty, jeśli kod SKU nie istnieje</span></label>
      <button class="btn btn-primary">${icon('upload', 16)} Importuj</button>
    </form>
  </section>
  <section class="panel"><div class="panel-head"><h2>Format pliku</h2></div>
    <p class="small">Pierwszy wiersz to nagłówki. Wymagana kolumna <code>sku</code>. Pozostałe są opcjonalne – aktualizowane są tylko podane kolumny:</p>
    <p class="small"><code>sku; nazwa; kategoria; producent; cena; cena_promocyjna; jednostka; stan; aktywny</code></p>
    <p class="small muted">Ceny brutto w zł (np. 54,99). <code>aktywny</code>: 1/0. Najprościej: wyeksportuj produkty do CSV, zmień w Excelu i zaimportuj ponownie.</p>
    <a href="/admin/produkty.csv" class="btn btn-sm btn-ghost">${icon('download', 14)} Pobierz aktualny CSV</a>
  </section></div>`;
  return alayout(ctx, { title: 'Import produktów', body, actions: html`<a href="/admin/produkty" class="btn btn-ghost">‹ Produkty</a>` });
}

/* ---------- Magazyn ---------- */
function stock(ctx, { low, moves, products, reserved }) {
  const body = html`<div class="agrid">
  <section class="panel"><div class="panel-head"><h2>Szybka korekta stanu</h2></div>
    <form method="post" action="/admin/magazyn/korekta" class="stack">${csrfInput(ctx)}
      <label class="fld"><span>Produkt</span><select name="product_id" required><option value="">Wybierz…</option>${products.map((p) => html`<option value="${p.id}">${p.sku} – ${p.name} (${p.stock} ${p.unit})</option>`)}</select></label>
      <div class="fgrid2"><label class="fld"><span>Zmiana (+/-)</span><input type="number" name="delta" required placeholder="np. 100"></label>
      <label class="fld"><span>Powód</span><select name="reason"><option>Dostawa</option><option>Inwentaryzacja</option><option>Uszkodzenie</option><option>Zwrot</option><option>Sprzedaż stacjonarna</option><option>Inne</option></select></label></div>
      <label class="fld"><span>Uwagi</span><input name="note" maxlength="200"></label>
      <button class="btn btn-primary">Zapisz korektę</button></form>
  </section>
  <section class="panel span2"><div class="panel-head"><h2>Produkty z niskim stanem lub niedostępne</h2><span class="muted small">próg: ${ctx.settings.low_stock_threshold}</span></div>
    ${low.length ? html`<table class="atbl"><thead><tr><th>Produkt</th><th class="r">Stan</th><th class="r">Zarezerwowane*</th><th></th></tr></thead><tbody>
    ${low.map((p) => html`<tr><td><a href="/admin/produkty/${p.id}">${p.name}</a><br><small class="muted">${p.sku}</small></td><td class="r"><span class="stock-n ${p.stock <= 0 ? 'out' : 'low'}">${p.stock} ${p.unit}</span></td><td class="r">${reserved[p.id] || 0}</td><td class="r"><a href="/admin/produkty/${p.id}" class="icon-btn">${icon('edit', 16)}</a></td></tr>`)}
    </tbody></table><p class="muted small">* ilość w aktywnych (nieodebranych) zamówieniach – już odjęta od stanu.</p>` : html`<p class="empty-s">Brak produktów z niskim stanem.</p>`}
  </section>
  <section class="panel span3"><div class="panel-head"><h2>Historia ruchów magazynowych</h2><span class="muted small">ostatnie 100</span></div>
    <div class="tbl-wrap"><table class="atbl"><thead><tr><th>Data</th><th>Produkt</th><th class="r">Zmiana</th><th>Powód</th><th>Kto</th></tr></thead><tbody>
    ${moves.length ? moves.map((m) => html`<tr><td>${dtPL(m.created_at)}</td><td>${m.name || '(usunięty)'} <small class="muted">${m.sku || ''}</small></td><td class="r"><strong class="${m.delta > 0 ? 'green' : 'red'}">${m.delta > 0 ? '+' : ''}${m.delta}</strong></td><td>${m.reason}</td><td>${m.author}</td></tr>`) : html`<tr><td colspan="5" class="empty-s">Brak ruchów.</td></tr>`}
    </tbody></table></div>
  </section></div>`;
  return alayout(ctx, { title: 'Magazyn', body });
}

/* ---------- Kategorie ---------- */
const ICONS = ['box', 'layers', 'grid', 'shield', 'tag', 'percent', 'settings', 'hand', 'home', 'truck', 'star', 'store'];
function categories(ctx, { list }) {
  const iconSel = (cur) => html`<select name="icon">${ICONS.map((i) => html`<option value="${i}" ${cur === i ? 'selected' : ''}>${i}</option>`)}</select>`;
  const body = html`
<section class="panel"><div class="panel-head"><h2>Dodaj kategorię</h2></div>
  <form method="post" action="/admin/kategorie" class="row-form">${csrfInput(ctx)}
    <input name="name" placeholder="Nazwa kategorii" required><input name="description" placeholder="Opis (opcjonalnie)">${iconSel('box')}<input type="number" name="sort" value="${list.length}" title="Kolejność" class="w80">
    <button class="btn btn-primary">${icon('plus', 16)} Dodaj</button></form>
</section>
<section class="panel"><div class="panel-head"><h2>Kategorie (${list.length})</h2><span class="muted small">Edytuj bezpośrednio w wierszu i kliknij zapisz</span></div>
  <div class="cat-rows">${list.map((c) => html`<form method="post" action="/admin/kategorie/${c.id}" class="row-form cat-row">${csrfInput(ctx)}
    <span class="cat-ic">${icon(c.icon, 20)}</span>
    <input name="name" value="${c.name}" required><input name="description" value="${c.description}" placeholder="Opis">${iconSel(c.icon)}
    <input type="number" name="sort" value="${c.sort}" class="w80" title="Kolejność">
    <label class="switch sm"><input type="checkbox" name="active" value="1" ${c.active ? 'checked' : ''}><i></i><span>aktywna</span></label>
    <span class="muted small nowrap">${c.cnt} prod.</span>
    <button class="btn btn-sm btn-primary">Zapisz</button>
    <button class="icon-btn" formaction="/admin/kategorie/${c.id}/usun" data-confirm="Usunąć kategorię? Produkty pozostaną bez kategorii.">${icon('trash', 17)}</button>
  </form>`)}</div>
</section>`;
  return alayout(ctx, { title: 'Kategorie', body });
}

/* ---------- Punkty odbioru ---------- */
function locations(ctx, { list }) {
  const form = (l, isNew) => html`<form method="post" action="${isNew ? '/admin/punkty' : `/admin/punkty/${l.id}`}" class="panel loc-form">${csrfInput(ctx)}
    <div class="panel-head"><h2>${isNew ? html`${icon('plus', 18)} Nowy punkt odbioru` : html`${icon('pin', 18)} ${l.name}`}</h2>${!isNew ? html`<label class="switch sm"><input type="checkbox" name="active" value="1" ${l.active ? 'checked' : ''}><i></i><span>aktywny</span></label>` : ''}</div>
    <div class="fgrid">
      <label class="fld full"><span>Nazwa *</span><input name="name" value="${l.name || ''}" required></label>
      <label class="fld"><span>Adres</span><input name="address" value="${l.address || ''}"></label>
      <label class="fld"><span>Kod i miejscowość</span><input name="city" value="${l.city || ''}"></label>
      <label class="fld"><span>Telefon</span><input name="phone" value="${l.phone || ''}"></label>
      <label class="fld"><span>Link do mapy</span><input name="map_url" value="${l.map_url || ''}" placeholder="https://maps.google.com/…"></label>
      <label class="fld"><span>Godziny pn–pt</span><input name="hours_weekday" value="${l.hours_weekday ?? '07:00-17:00'}" placeholder="07:00-17:00"></label>
      <label class="fld"><span>Godziny sobota</span><input name="hours_saturday" value="${l.hours_saturday ?? ''}" placeholder="puste = nieczynne"></label>
      <label class="fld"><span>Godziny niedziela</span><input name="hours_sunday" value="${l.hours_sunday ?? ''}" placeholder="puste = nieczynne"></label>
      <label class="fld"><span>Kolejność</span><input type="number" name="sort" value="${l.sort || 0}"></label>
      <label class="fld full"><span>Informacje dla klienta</span><textarea name="info" rows="2">${l.info || ''}</textarea></label>
    </div>
    <div class="row-end">${!isNew ? html`<button class="btn btn-ghost" formaction="/admin/punkty/${l.id}/usun" data-confirm="Usunąć punkt odbioru? Jeśli ma zamówienia, zostanie tylko dezaktywowany.">${icon('trash', 16)} Usuń</button>` : ''}<button class="btn btn-primary">${isNew ? 'Dodaj punkt' : 'Zapisz'}</button></div>
  </form>`;
  const body = html`<p class="muted">Godziny w formacie <code>GG:MM-GG:MM</code>. Z godzin otwarcia, długości przedziału i limitu zamówień (Ustawienia) generowane są terminy odbioru dostępne dla klientów.</p>
  <div class="loc-forms">${list.map((l) => form(l, false))}${form({}, true)}</div>`;
  return alayout(ctx, { title: 'Punkty odbioru', body });
}

/* ---------- Raporty ---------- */
function reports(ctx, r) {
  const body = html`
<form class="filters-a" method="get">
  <label><span>Od</span><input type="date" name="od" value="${r.from}"></label>
  <label><span>Do</span><input type="date" name="do" value="${r.to}"></label>
  <div class="fa-btns"><button class="btn btn-primary">Pokaż</button>
  <a class="btn btn-ghost" href="/admin/raporty?zakres=7">7 dni</a><a class="btn btn-ghost" href="/admin/raporty?zakres=30">30 dni</a><a class="btn btn-ghost" href="/admin/raporty?zakres=mies">Bieżący miesiąc</a></div>
</form>
<div class="kpis">
  <div class="kpi kpi-red"><div class="kpi-ico">${icon('chart', 22)}</div><div><small>Sprzedaż brutto</small><strong>${money(r.sum.total)}</strong><span>netto ${money(netOf(r.sum.total, +ctx.settings.vat_rate || 23))}</span></div></div>
  <div class="kpi"><div class="kpi-ico">${icon('list', 22)}</div><div><small>Zamówienia</small><strong>${r.sum.n}</strong><span>${r.cancelled} anulowanych</span></div></div>
  <div class="kpi"><div class="kpi-ico">${icon('tag', 22)}</div><div><small>Średnia wartość</small><strong>${money(r.sum.n ? Math.round(r.sum.total / r.sum.n) : 0)}</strong><span>na zamówienie</span></div></div>
  <div class="kpi"><div class="kpi-ico">${icon('check', 22)}</div><div><small>Odebrane</small><strong>${r.pickedUp}</strong><span>${r.sum.n ? Math.round((r.pickedUp / r.sum.n) * 100) : 0}% realizacji</span></div></div>
</div>
<div class="agrid">
  <section class="panel span3"><div class="panel-head"><h2>Sprzedaż dzienna</h2></div>${barChart(r.days)}</section>
  <section class="panel span2"><div class="panel-head"><h2>Najlepiej sprzedające się produkty</h2></div>
    <table class="atbl"><thead><tr><th>#</th><th>Produkt</th><th class="r">Ilość</th><th class="r">Wartość</th><th>Udział</th></tr></thead><tbody>
    ${r.top.map((p, i) => html`<tr><td>${i + 1}</td><td>${p.name}<br><small class="muted">${p.sku}</small></td><td class="r">${p.qty} ${p.unit}</td><td class="r"><strong>${money(p.value)}</strong></td><td><span class="share"><i style="width:${r.sum.total ? Math.round((p.value / r.sum.total) * 100) : 0}%"></i></span></td></tr>`)}
    </tbody></table></section>
  <section class="panel"><div class="panel-head"><h2>Wg kategorii</h2></div>
    <ul class="lst">${r.byCat.map((c) => html`<li><span>${c.name || 'Bez kategorii'}</span><strong>${money(c.value)}</strong></li>`)}</ul>
    <div class="panel-head mt"><h2>Wg formy płatności</h2></div>
    <ul class="lst">${r.byPay.map((c) => html`<li><span>${PAYMENTS[c.payment_method] || c.payment_method}</span><strong>${c.n} · ${money(c.value)}</strong></li>`)}</ul>
    <div class="panel-head mt"><h2>Wg punktu odbioru</h2></div>
    <ul class="lst">${r.byLoc.map((c) => html`<li><span>${c.name || '—'}</span><strong>${c.n} · ${money(c.value)}</strong></li>`)}</ul>
  </section>
</div>`;
  return alayout(ctx, { title: 'Raporty sprzedaży', body, actions: html`<a class="btn btn-ghost" href="/admin/raporty.csv?od=${r.from}&do=${r.to}">${icon('download', 16)} Eksport CSV</a>` });
}

/* ---------- Użytkownicy ---------- */
function users(ctx, { list }) {
  const body = html`<div class="agrid">
  <section class="panel span2"><div class="panel-head"><h2>Konta (${list.length})</h2></div>
    <table class="atbl"><thead><tr><th>Użytkownik</th><th>Rola</th><th>Ostatnie logowanie</th><th>Status</th><th></th></tr></thead><tbody>
    ${list.map((u) => html`<tr><td><strong>${u.name}</strong><br><small class="muted">${u.email}</small></td><td>${u.role === 'admin' ? html`<span class="tag tag-red">Administrator</span>` : html`<span class="tag">Pracownik</span>`}</td>
      <td>${u.last_login ? dtPL(u.last_login) : html`<span class="muted">nigdy</span>`}</td><td>${u.active ? html`<span class="tag tag-green">aktywne</span>` : html`<span class="tag">zablokowane</span>`}</td>
      <td class="r nowrap">${u.id !== ctx.user.id ? html`
        <form method="post" action="/admin/uzytkownicy/${u.id}/przelacz" class="inline">${csrfInput(ctx)}<button class="btn btn-sm btn-ghost">${u.active ? 'Zablokuj' : 'Odblokuj'}</button></form>
        <form method="post" action="/admin/uzytkownicy/${u.id}/usun" class="inline">${csrfInput(ctx)}<button class="icon-btn" data-confirm="Usunąć konto ${u.email}?">${icon('trash', 16)}</button></form>` : html`<span class="muted small">to Ty</span>`}</td></tr>
      ${u.id !== ctx.user.id ? html`<tr class="sub-row"><td colspan="5"><details><summary class="small">Zmień rolę / ustaw nowe hasło</summary>
        <form method="post" action="/admin/uzytkownicy/${u.id}" class="row-form">${csrfInput(ctx)}
        <select name="role"><option value="pracownik" ${u.role === 'pracownik' ? 'selected' : ''}>Pracownik</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrator</option></select>
        <input type="password" name="password" placeholder="Nowe hasło (opcjonalnie)" minlength="8" autocomplete="new-password"><button class="btn btn-sm btn-primary">Zapisz</button></form></details></td></tr>` : ''}`)}
    </tbody></table></section>
  <section class="panel"><div class="panel-head"><h2>Dodaj użytkownika</h2></div>
    <form method="post" action="/admin/uzytkownicy" class="stack">${csrfInput(ctx)}
      <label class="fld"><span>Imię i nazwisko</span><input name="name" required></label>
      <label class="fld"><span>E-mail (login)</span><input type="email" name="email" required></label>
      <label class="fld"><span>Hasło (min. 8 znaków)</span><input type="password" name="password" minlength="8" required autocomplete="new-password"></label>
      <label class="fld"><span>Rola</span><select name="role"><option value="pracownik">Pracownik – zamówienia, odbiory, produkty, magazyn</option><option value="admin">Administrator – pełny dostęp</option></select></label>
      <button class="btn btn-primary">${icon('plus', 16)} Utwórz konto</button></form>
  </section></div>`;
  return alayout(ctx, { title: 'Użytkownicy', body });
}

function account(ctx) {
  const body = html`<section class="panel narrow-p"><div class="panel-head"><h2>Zmiana hasła</h2></div>
    <form method="post" action="/admin/konto" class="stack">${csrfInput(ctx)}
      <label class="fld"><span>Obecne hasło</span><input type="password" name="current" required autocomplete="current-password"></label>
      <label class="fld"><span>Nowe hasło (min. 8 znaków)</span><input type="password" name="password" minlength="8" required autocomplete="new-password"></label>
      <label class="fld"><span>Powtórz nowe hasło</span><input type="password" name="password2" minlength="8" required autocomplete="new-password"></label>
      <button class="btn btn-primary">Zmień hasło</button></form></section>`;
  return alayout(ctx, { title: 'Moje konto', body });
}

/* ---------- Ustawienia ---------- */
function settings(ctx) {
  const s = ctx.settings;
  const f = (k, label, type = 'text', help = '') => html`<label class="fld"><span>${label}</span><input type="${type}" name="${k}" value="${s[k] || ''}">${help ? html`<small class="muted">${help}</small>` : ''}</label>`;
  const t = (k, label, rows = 3, help = '') => html`<label class="fld full"><span>${label}</span><textarea name="${k}" rows="${rows}">${s[k] || ''}</textarea>${help ? html`<small class="muted">${help}</small>` : ''}</label>`;
  const body = html`<form method="post" action="/admin/ustawienia" class="settings-form">${csrfInput(ctx)}
  <div class="agrid">
    <section class="panel span2"><div class="panel-head"><h2>Dane sklepu</h2></div><div class="fgrid">
      ${f('store_name', 'Nazwa sklepu')}${f('store_tagline', 'Hasło (stopka)')}${f('phone', 'Telefon')}${f('email', 'E-mail', 'email')}
      ${t('company_info', 'Dane firmy (stopka, regulamin)', 4)}${f('announcement', 'Komunikat w górnym pasku')}${f('meta_description', 'Opis SEO (meta description)')}
    </div></section>
    <section class="panel"><div class="panel-head"><h2>Strona główna</h2></div><div class="stack">
      ${f('hero_title', 'Tytuł banera')}${t('hero_subtitle', 'Podtytuł banera', 3)}</div></section>
    <section class="panel span2"><div class="panel-head"><h2>Odbiór osobisty – terminy</h2></div><div class="fgrid">
      ${f('pickup_lead_hours', 'Minimalny czas przygotowania (godz.)', 'number', 'Ile godzin od złożenia zamówienia najwcześniej można odebrać towar.')}
      ${f('slot_minutes', 'Długość przedziału odbioru (min)', 'number', 'Np. 60 = przedziały godzinowe.')}
      ${f('slot_capacity', 'Limit zamówień na przedział', 'number', '0 = bez limitu.')}
      ${f('pickup_max_days', 'Ile dni do przodu można rezerwować', 'number')}
      ${f('reservation_days', 'Czas rezerwacji towaru (dni)', 'number')}
      ${f('min_order_value', 'Minimalna wartość zamówienia (zł)', 'text', '0 = brak minimum.')}
      ${t('closed_dates', 'Dni zamknięte (święta, inwentaryzacja)', 2, 'Daty RRRR-MM-DD oddzielone przecinkami.')}
    </div></section>
    <section class="panel"><div class="panel-head"><h2>Sprzedaż</h2></div><div class="stack">
      ${f('vat_rate', 'Stawka VAT (%)', 'number')}${f('low_stock_threshold', 'Próg niskiego stanu', 'number')}</div></section>
    <section class="panel span3"><div class="panel-head"><h2>Treści dla klienta</h2></div><div class="fgrid">
      ${t('order_terms', 'Zasady zamówień (regulamin, karta produktu)', 4)}${t('checkout_info', 'Informacja przy odbiorze', 3)}</div></section>
  </div>
  <div class="sticky-save"><button class="btn btn-primary btn-lg">${icon('check', 18)} Zapisz ustawienia</button></div>
</form>`;
  return alayout(ctx, { title: 'Ustawienia', body });
}

function log(ctx, { list, page, pages, total, params }) {
  const body = html`<section class="panel"><div class="tbl-wrap"><table class="atbl"><thead><tr><th>Data</th><th>Użytkownik</th><th>Akcja</th><th>Szczegóły</th><th>IP</th></tr></thead><tbody>
  ${list.map((l) => html`<tr><td class="nowrap">${dtPL(l.created_at)}</td><td>${l.user_name}</td><td><strong>${l.action}</strong></td><td>${l.details}</td><td><small class="muted">${l.ip}</small></td></tr>`)}
  </tbody></table></div></section>${pager('/admin/dziennik', params, page, pages, total)}`;
  return alayout(ctx, { title: 'Dziennik zdarzeń', body });
}

module.exports = { alayout, login, dashboard, orders, orderDetail, orderPrint, pickups, products, productForm, importPage, stock, categories, locations, reports, users, account, settings, log };
