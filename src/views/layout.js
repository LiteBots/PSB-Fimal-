'use strict';
const { html, raw, icon, money, esc } = require('../util');

const VER = '2.0.0';

function head(ctx, { title, metaDesc, extraCss = '' }) {
  const s = ctx.settings;
  return html`<!doctype html>
<html lang="pl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title ? title + ' | ' : ''}${s.store_name}</title>
<meta name="description" content="${metaDesc || s.meta_description}">
<meta name="theme-color" content="#e30613">
<meta name="csrf-token" content="${ctx.csrf}">
<link rel="icon" href="/static/img/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/static/css/style.css?v=${VER}">${extraCss ? raw(extraCss) : ''}
</head>`;
}

function flashes(list) {
  if (!list || !list.length) return '';
  return html`<div class="flash-wrap">${list.map((f) => html`<div class="flash flash-${f.type}">${icon(f.type === 'error' ? 'alert' : 'check', 18)}<span>${f.msg}</span><button class="flash-x" type="button" aria-label="Zamknij">${icon('x', 16)}</button></div>`)}</div>`;
}

function layout(ctx, { title, metaDesc, body, bodyClass = '' }) {
  const s = ctx.settings;
  const cats = ctx.navCategories || [];
  const loc = (ctx.locations || [])[0];
  return html`${head(ctx, { title, metaDesc })}
<body class="${bodyClass}">
<a class="skip" href="#main">Przejdź do treści</a>
<div class="topbar"><div class="wrap topbar-in">
  <div class="topbar-msg">${icon('store', 16)}<span>${s.announcement}</span></div>
  <div class="topbar-links">
    <a href="tel:${s.phone.replace(/\s/g, '')}">${icon('phone', 15)} ${s.phone}</a>
    <a href="/odbior-osobisty">${icon('clock', 15)} Godziny odbioru</a>
    <a href="/sledzenie">${icon('box', 15)} Śledź zamówienie</a>
  </div>
</div></div>
<header class="header"><div class="wrap header-in">
  <button class="burger" type="button" aria-label="Menu" data-toggle="nav">${icon('menu', 24)}</button>
  <a class="logo" href="/" aria-label="${s.store_name} – strona główna"><img src="/static/img/logo.webp" alt="${s.store_name}" width="160" height="44"></a>
  <form class="search" action="/produkty" method="get" role="search" autocomplete="off">
    <input type="search" name="q" value="${ctx.q || ''}" placeholder="Szukaj: płyta OSB, cement, styropian…" aria-label="Szukaj produktów" data-suggest>
    <button type="submit" aria-label="Szukaj">${icon('search', 20)}</button>
    <div class="suggest" hidden></div>
  </form>
  <a class="header-pickup" href="/odbior-osobisty"><span class="hp-ico">${icon('store', 22)}</span><div><strong>Odbiór osobisty</strong><span>${loc ? loc.city : 'w naszym składzie'}</span></div></a>
  <a class="header-track" href="/sledzenie" title="Śledź zamówienie"><span class="hp-ico">${icon('box', 22)}</span><div><strong>Moje zamówienie</strong><span>sprawdź status</span></div></a>
  <a class="cart-btn" href="/koszyk" aria-label="Koszyk">
    ${icon('cart', 24)}<span class="cart-badge" data-cart-count ${ctx.cartCount ? '' : 'hidden'}>${ctx.cartCount}</span>
    <span class="cart-label">Koszyk</span>
  </a>
</div></header>
<nav class="nav" id="nav"><div class="wrap nav-in">
  <a href="/produkty" class="nav-all">${icon('grid', 18)} Wszystkie produkty</a>
  ${cats.map((c) => html`<a href="/kategoria/${c.slug}" class="${ctx.activeCat === c.slug ? 'active' : ''}">${c.name}</a>`)}
  <a href="/produkty?promocje=1" class="nav-promo">${icon('percent', 16)} Promocje</a>
</div></nav>
${flashes(ctx.flash)}
<main id="main">${body}</main>
<section class="perks"><div class="wrap perks-in">
  <div class="perk">${icon('store', 30)}<div><strong>Odbiór osobisty</strong><span>Wybierasz dzień i godzinę odbioru</span></div></div>
  <div class="perk">${icon('shield', 30)}<div><strong>Rezerwacja towaru</strong><span>Produkty czekają na Ciebie ${s.reservation_days} dni</span></div></div>
  <div class="perk">${icon('card', 30)}<div><strong>Płatność przy odbiorze</strong><span>Gotówka, karta lub przelew</span></div></div>
  <div class="perk">${icon('file', 30)}<div><strong>Faktura VAT</strong><span>Dla firm i klientów indywidualnych</span></div></div>
</div></section>
<footer class="footer"><div class="wrap footer-in">
  <div class="f-col f-brand">
    <img src="/static/img/logo.webp" alt="${s.store_name}" class="f-logo" width="150" height="41">
    <p>${s.store_tagline}</p>
    <p class="f-company">${raw(esc(s.company_info).replace(/\n/g, '<br>'))}</p>
  </div>
  <div class="f-col"><h4>Kategorie</h4>${cats.slice(0, 8).map((c) => html`<a href="/kategoria/${c.slug}">${c.name}</a>`)}</div>
  <div class="f-col"><h4>Informacje</h4>
    <a href="/odbior-osobisty">Jak kupować i odebrać</a><a href="/sledzenie">Śledzenie zamówienia</a>
    <a href="/regulamin">Regulamin</a><a href="/kontakt">Kontakt</a></div>
  <div class="f-col"><h4>Kontakt</h4>
    <a href="tel:${s.phone.replace(/\s/g, '')}">${icon('phone', 16)} ${s.phone}</a>
    <a href="mailto:${s.email}">${icon('mail', 16)} ${s.email}</a>
    ${loc ? html`<span>${icon('pin', 16)} ${loc.address}, ${loc.city}</span>
    <span>${icon('clock', 16)} pn–pt ${loc.hours_weekday || 'nieczynne'}${loc.hours_saturday ? html`, sob ${loc.hours_saturday}` : ''}</span>` : ''}
  </div>
</div>
<div class="footer-bottom"><div class="wrap footer-bottom-in"><span>© ${new Date().getFullYear()} ${s.store_name}. Ceny brutto (zawierają VAT ${s.vat_rate}%). Sprzedaż wyłącznie z odbiorem osobistym.</span><a href="/admin" class="f-admin">Panel</a></div></div>
</footer>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script src="/static/js/app.js?v=${VER}" defer></script>
</body></html>`;
}

module.exports = { layout, head, flashes, VER };
