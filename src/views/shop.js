'use strict';
const { html, raw, icon, money, netOf, effPrice, datePL, dtPL, qs, nl2br, STATUSES, PAYMENTS, plural } = require('../util');
const { layout } = require('./layout');

/* ---------- Komponenty ---------- */
function stockBadge(p, s) {
  const low = +s.low_stock_threshold || 10;
  if (p.stock <= 0) return html`<span class="stock out">Niedostępny</span>`;
  if (p.stock <= low) return html`<span class="stock low">Ostatnie sztuki (${p.stock} ${p.unit})</span>`;
  return html`<span class="stock in">Dostępny – ${p.stock > 99 ? '99+' : p.stock} ${p.unit}</span>`;
}
function priceBlock(p, big = false) {
  const eff = effPrice(p);
  const promo = eff < p.price;
  return html`<div class="price ${big ? 'price-big' : ''}">
    ${promo ? html`<s>${money(p.price)}</s>` : ''}
    <strong class="${promo ? 'is-promo' : ''}">${money(eff)}</strong><span class="unit">/ ${p.unit}</span>
  </div>`;
}
function addForm(ctx, p, compact = true) {
  if (p.stock <= 0) return html`<button class="btn btn-ghost btn-block" disabled>Brak w magazynie</button>`;
  return html`<form class="add-form ${compact ? 'compact' : ''}" action="/koszyk/dodaj" method="post" data-add>
    <input type="hidden" name="_csrf" value="${ctx.csrf}"><input type="hidden" name="product_id" value="${p.id}">
    ${compact ? html`<input type="hidden" name="qty" value="1">` : html`<div class="qty">
      <button type="button" data-step="-1" aria-label="Mniej">${icon('minus', 16)}</button>
      <input type="number" name="qty" value="1" min="1" max="${p.max_per_order > 0 ? Math.min(p.stock, p.max_per_order) : p.stock}" inputmode="numeric" aria-label="Ilość">
      <button type="button" data-step="1" aria-label="Więcej">${icon('plus', 16)}</button></div>`}
    <button class="btn btn-primary ${compact ? 'btn-icon-text' : 'btn-lg'}" type="submit">${icon('cart', 18)}<span>${compact ? 'Do koszyka' : 'Dodaj do koszyka'}</span></button>
  </form>`;
}
function productCard(ctx, p) {
  const eff = effPrice(p);
  const pct = eff < p.price ? Math.round((1 - eff / p.price) * 100) : 0;
  return html`<article class="pcard ${p.stock <= 0 ? 'is-out' : ''}">
    <a href="/produkt/${p.slug}" class="pcard-img">
      <img src="${p.image || '/static/img/placeholder.svg'}" alt="${p.name}" loading="lazy" width="300" height="300">
      <div class="badges">${pct ? html`<span class="badge badge-red">-${pct}%</span>` : ''}${p.featured ? html`<span class="badge badge-dark">Polecany</span>` : ''}</div>
    </a>
    <div class="pcard-body">
      <div class="pcard-meta">${p.brand || p.category_name || ''}</div>
      <h3 class="pcard-title"><a href="/produkt/${p.slug}">${p.name}</a></h3>
      ${stockBadge(p, ctx.settings)}
      <div class="pcard-foot">${priceBlock(p)}${addForm(ctx, p)}</div>
    </div>
  </article>`;
}
const grid = (ctx, list) => html`<div class="pgrid">${list.map((p) => productCard(ctx, p))}</div>`;
function crumbs(list) {
  return html`<nav class="crumbs" aria-label="Okruszki"><a href="/">${icon('home', 15)}</a>${list.map(([t, h]) => html`${icon('chevron', 14)}${h ? html`<a href="${h}">${t}</a>` : html`<span>${t}</span>`}`)}</nav>`;
}
function hoursList(l) {
  return html`<ul class="hours">
    <li><span>Poniedziałek – piątek</span><strong>${l.hours_weekday || 'nieczynne'}</strong></li>
    <li><span>Sobota</span><strong>${l.hours_saturday || 'nieczynne'}</strong></li>
    <li><span>Niedziela</span><strong>${l.hours_sunday || 'nieczynne'}</strong></li></ul>`;
}

/* ---------- Strona główna ---------- */
function home(ctx, { featured, promos, categories, locations, nextSlot, newest }) {
  const s = ctx.settings;
  const plyty = categories.find((c) => /plyty/.test(c.slug)) || categories[0];
  const body = html`
<section class="hero"><div class="wrap hero-in">
  <div class="hero-copy">
    <span class="eyebrow">${icon('store', 16)} Zamów online · Odbierz osobiście</span>
    <h1>${s.hero_title}</h1>
    <p>${s.hero_subtitle}</p>
    <div class="hero-cta">
      <a class="btn btn-white btn-lg" href="/produkty">${icon('grid', 20)} Przejdź do sklepu</a>
      <a class="btn btn-outline-white btn-lg" href="/odbior-osobisty">Jak to działa?</a>
    </div>
  </div>
  <div class="hero-art"><img src="/static/img/hero.svg" alt="" width="640" height="520"></div>
</div></section>

<section class="hero-bar"><div class="wrap"><div class="hb">
  <div class="hb-slot">
    <span class="hb-ico">${icon('calendar', 26)}</span>
    <div><small>Najbliższy wolny termin odbioru</small>
    ${nextSlot ? html`<strong>${nextSlot.today ? 'Dziś' : datePL(nextSlot.date, true).replace(/ \d{4}$/, '')}, ${nextSlot.slot}</strong><span>${nextSlot.location}</span>`
      : html`<strong>Brak wolnych terminów</strong><span>Zadzwoń: ${s.phone}</span>`}</div>
  </div>
  <div class="hb-steps">
    <div><b>1</b><span>Wybierz<br>produkty</span></div>
    <div><b>2</b><span>Wskaż dzień<br>i godzinę</span></div>
    <div><b>3</b><span>Odbierz<br>i zapłać</span></div>
  </div>
  <a href="/produkty" class="btn btn-primary btn-lg hb-cta">Zacznij zakupy ${icon('chevron', 18)}</a>
</div></div></section>

<section class="section"><div class="wrap">
  <div class="sec-head"><div><span class="kicker">Asortyment</span><h2>Kategorie produktów</h2></div><a href="/produkty" class="link-more">Wszystkie produkty ${icon('chevron', 16)}</a></div>
  <div class="cat-grid">${categories.map((c, i) => html`<a class="cat-tile ${i === 0 ? 'cat-tile-red' : ''}" href="/kategoria/${c.slug}">
    <span class="cat-ico">${icon(c.icon, 30)}</span><strong>${c.name}</strong><small>${c.cnt} ${plural(c.cnt, 'produkt', 'produkty', 'produktów')}</small><span class="cat-arrow">${icon('chevron', 18)}</span></a>`)}</div>
</div></section>

<section class="banners"><div class="wrap banners-in">
  <a class="bnr bnr-dark" href="${plyty ? '/kategoria/' + plyty.slug : '/produkty'}">
    <div><span class="kicker kicker-w">Na budowę i remont</span><h3>Płyty OSB i&nbsp;gipsowo-kartonowe</h3><span class="bnr-link">Zobacz ofertę ${icon('chevron', 16)}</span></div>
    <svg viewBox="0 0 200 140" class="bnr-art" aria-hidden="true"><rect x="20" y="70" width="160" height="22" fill="#d9a35b"/><rect x="34" y="48" width="150" height="22" fill="#e2b06b"/><rect x="10" y="92" width="170" height="22" fill="#c9924a"/><rect x="40" y="56" width="20" height="5" fill="#b9853f"/><rect x="90" y="78" width="30" height="5" fill="#a87634"/><rect x="130" y="100" width="24" height="5" fill="#a87634"/><rect x="0" y="114" width="200" height="6" fill="#e30613"/></svg>
  </a>
  <a class="bnr bnr-red" href="/produkty?promocje=1">
    <div><span class="kicker kicker-w">Tylko teraz</span><h3>Promocje tygodnia do&nbsp;-17%</h3><span class="bnr-link">Sprawdź promocje ${icon('chevron', 16)}</span></div>
    <span class="bnr-pct">%</span>
  </a>
  <a class="bnr bnr-light" href="/odbior-osobisty">
    <div><span class="kicker">Bez kosztów dostawy</span><h3>Odbiór osobisty w&nbsp;naszym składzie</h3><span class="bnr-link">Godziny otwarcia ${icon('chevron', 16)}</span></div>
    <span class="bnr-ico">${icon('store', 54)}</span>
  </a>
</div></section>

${promos.length ? html`<section class="section"><div class="wrap">
  <div class="sec-head"><div><span class="kicker">Okazje</span><h2>Promocje tygodnia</h2></div><a href="/produkty?promocje=1" class="link-more">Zobacz wszystkie ${icon('chevron', 16)}</a></div>
  ${grid(ctx, promos)}
</div></section>` : ''}

<section class="section section-gray"><div class="wrap">
  <div class="sec-head"><div><span class="kicker">Wybór klientów</span><h2>Polecane produkty</h2></div><a href="/produkty" class="link-more">Więcej ${icon('chevron', 16)}</a></div>
  ${grid(ctx, featured)}
</div></section>

<section class="section how-sec"><div class="wrap">
  <div class="sec-head center-head"><div><span class="kicker">Prosto i szybko</span><h2>Jak kupować w ${s.store_name}?</h2></div></div>
  <div class="how">
    <div class="how-step"><b>01</b>${icon('cart', 32)}<h3>Skompletuj koszyk</h3><p>Wybierz produkty i ilości – stany magazynowe widzisz na bieżąco.</p></div>
    <div class="how-step"><b>02</b>${icon('calendar', 32)}<h3>Wybierz termin</h3><p>Wskaż punkt odbioru oraz dzień i godzinę przyjazdu.</p></div>
    <div class="how-step"><b>03</b>${icon('box', 32)}<h3>Przygotujemy towar</h3><p>Rezerwujemy produkty i kompletujemy je przed Twoim przyjazdem.</p></div>
    <div class="how-step"><b>04</b>${icon('store', 32)}<h3>Odbierz i zapłać</h3><p>Podaj numer zamówienia, zapłać gotówką lub kartą i jedź budować.</p></div>
  </div>
</div></section>

<section class="section section-gray"><div class="wrap">
  <div class="sec-head"><div><span class="kicker">Świeżo w ofercie</span><h2>Nowości</h2></div></div>
  ${grid(ctx, newest)}
</div></section>

<section class="section"><div class="wrap">
  <div class="sec-head"><div><span class="kicker">Gdzie nas znaleźć</span><h2>Punkty odbioru</h2></div><a href="/odbior-osobisty" class="link-more">Szczegóły ${icon('chevron', 16)}</a></div>
  <div class="loc-grid">${locations.map((l) => html`<div class="loc-card">
    <div class="loc-head"><span class="loc-ico">${icon('pin', 22)}</span><div><strong>${l.name}</strong><span>${l.address}, ${l.city}</span></div></div>
    ${hoursList(l)}${l.info ? html`<p class="muted small">${l.info}</p>` : ''}
    ${l.phone ? html`<a class="loc-phone" href="tel:${l.phone.replace(/\s/g, '')}">${icon('phone', 16)} ${l.phone}</a>` : ''}
  </div>`)}</div>
</div></section>

<section class="cta-band"><div class="wrap cta-in">
  <div><h2>Potrzebujesz większej ilości materiałów?</h2><p>Zadzwoń – przygotujemy indywidualną ofertę dla firm i wykonawców.</p></div>
  <a class="btn btn-white btn-lg" href="tel:${s.phone.replace(/\s/g, '')}">${icon('phone', 20)} ${s.phone}</a>
</div></section>`;
  return layout(ctx, { body, bodyClass: 'page-home' });
}

/* ---------- Lista produktów ---------- */
function listing(ctx, { title, category, products, total, page, pages, params, categories, priceRange, brands }) {
  const base = category ? `/kategoria/${category.slug}` : '/produkty';
  const sorts = [['', 'Domyślnie'], ['cena-rosnaco', 'Cena: od najniższej'], ['cena-malejaco', 'Cena: od najwyższej'], ['nazwa', 'Nazwa A–Z'], ['popularne', 'Najpopularniejsze'], ['nowosci', 'Najnowsze']];
  const body = html`<div class="wrap page">
  ${crumbs(category ? [['Produkty', '/produkty'], [category.name]] : [['Produkty']])}
  <div class="list-head">
    <div><h1>${title}</h1>${category && category.description ? html`<p class="muted">${category.description}</p>` : ''}</div>
    <div class="list-count">${total} ${plural(total, 'produkt', 'produkty', 'produktów')}</div>
  </div>
  <div class="list-layout">
    <aside class="filters" id="filters">
      <form method="get" action="${base}" class="filter-form">
        ${params.q ? html`<input type="hidden" name="q" value="${params.q}">` : ''}
        ${params.sort ? html`<input type="hidden" name="sort" value="${params.sort}">` : ''}
        <div class="f-block"><h3>Kategorie</h3>
          <a href="${qs('/produkty', params, { page: '' })}" class="f-cat ${!category ? 'active' : ''}">Wszystkie</a>
          ${categories.map((c) => html`<a href="${qs('/kategoria/' + c.slug, params, { page: '' })}" class="f-cat ${category && category.id === c.id ? 'active' : ''}"><span>${c.name}</span><small>${c.cnt}</small></a>`)}
        </div>
        <div class="f-block"><h3>Cena (zł)</h3>
          <div class="f-range"><input type="number" name="cena_od" min="0" step="1" placeholder="od ${Math.floor(priceRange.min / 100)}" value="${params.cena_od || ''}">
          <span>–</span><input type="number" name="cena_do" min="0" step="1" placeholder="do ${Math.ceil(priceRange.max / 100)}" value="${params.cena_do || ''}"></div>
        </div>
        ${brands.length ? html`<div class="f-block"><h3>Producent</h3><select name="marka"><option value="">Wszyscy producenci</option>
          ${brands.map((b) => html`<option value="${b}" ${params.marka === b ? 'selected' : ''}>${b}</option>`)}</select></div>` : ''}
        <div class="f-block">
          <label class="check"><input type="checkbox" name="dostepne" value="1" ${params.dostepne ? 'checked' : ''}> <span>Tylko dostępne</span></label>
          <label class="check"><input type="checkbox" name="promocje" value="1" ${params.promocje ? 'checked' : ''}> <span>Tylko promocje</span></label>
        </div>
        <button class="btn btn-primary btn-block" type="submit">Filtruj</button>
        <a class="btn btn-ghost btn-block" href="${base}">Wyczyść filtry</a>
      </form>
    </aside>
    <div class="list-main">
      <div class="toolbar">
        <button class="btn btn-ghost btn-sm show-filters" type="button" data-toggle="filters">${icon('settings', 16)} Filtry</button>
        ${params.q ? html`<div class="search-tag">Wyniki dla: <strong>„${params.q}”</strong> <a href="${qs(base, params, { q: '', page: '' })}" aria-label="Usuń">${icon('x', 14)}</a></div>` : html`<span></span>`}
        <form method="get" action="${base}" class="sort-form">
          ${Object.entries(params).filter(([k]) => k !== 'sort' && k !== 'page').map(([k, v]) => html`<input type="hidden" name="${k}" value="${v}">`)}
          <label>Sortuj: <select name="sort" data-autosubmit>${sorts.map(([v, l]) => html`<option value="${v}" ${(params.sort || '') === v ? 'selected' : ''}>${l}</option>`)}</select></label>
        </form>
      </div>
      ${products.length ? grid(ctx, products) : html`<div class="empty">${icon('search', 40)}<h3>Nie znaleźliśmy produktów</h3><p>Zmień kryteria wyszukiwania lub wyczyść filtry.</p><a class="btn btn-primary" href="/produkty">Pokaż wszystkie</a></div>`}
      ${pages > 1 ? html`<nav class="pager">
        ${page > 1 ? html`<a href="${qs(base, params, { page: page - 1 })}">‹ Poprzednia</a>` : ''}
        ${Array.from({ length: pages }, (_, i) => i + 1).map((n) => html`<a href="${qs(base, params, { page: n })}" class="${n === page ? 'active' : ''}">${n}</a>`)}
        ${page < pages ? html`<a href="${qs(base, params, { page: page + 1 })}">Następna ›</a>` : ''}
      </nav>` : ''}
    </div>
  </div>
</div>`;
  return layout(ctx, { title, body });
}

/* ---------- Karta produktu ---------- */
function product(ctx, { p, related, gallery, specs, locations }) {
  const s = ctx.settings;
  const eff = effPrice(p);
  const vat = +s.vat_rate || 23;
  const imgs = [p.image, ...gallery].filter(Boolean);
  const body = html`<div class="wrap page">
  ${crumbs([['Produkty', '/produkty'], ...(p.category_slug ? [[p.category_name, '/kategoria/' + p.category_slug]] : []), [p.name]])}
  <div class="pd">
    <div class="pd-gallery">
      <div class="pd-main"><img src="${imgs[0] || '/static/img/placeholder.svg'}" alt="${p.name}" id="pd-main" width="600" height="600">
        ${eff < p.price ? html`<span class="badge badge-red badge-lg">-${Math.round((1 - eff / p.price) * 100)}%</span>` : ''}</div>
      ${imgs.length > 1 ? html`<div class="pd-thumbs">${imgs.map((src, i) => html`<button type="button" class="${i === 0 ? 'active' : ''}" data-img="${src}"><img src="${src}" alt="" loading="lazy"></button>`)}</div>` : ''}
    </div>
    <div class="pd-info">
      <div class="pd-meta">${p.brand ? html`<span>Producent: <strong>${p.brand}</strong></span>` : ''}<span>Kod: <strong>${p.sku}</strong></span></div>
      <h1>${p.name}</h1>
      <p class="pd-short">${p.short_desc}</p>
      <div class="pd-buy">
        ${priceBlock(p, true)}
        <div class="pd-net">${money(netOf(eff, vat))} netto + ${vat}% VAT</div>
        ${stockBadge(p, s)}
        ${addForm(ctx, p, false)}
        ${p.max_per_order > 0 ? html`<p class="muted small">Maksymalnie ${p.max_per_order} ${p.unit} w jednym zamówieniu.</p>` : ''}
      </div>
      <div class="pd-pickup">
        <div class="pd-pickup-head">${icon('store', 22)}<div><strong>Wyłącznie odbiór osobisty</strong><span>Zamówiony towar zarezerwujemy na ${s.reservation_days} ${plural(+s.reservation_days, 'dzień', 'dni', 'dni')}.</span></div></div>
        <ul>${locations.map((l) => html`<li>${icon('pin', 16)} <span><strong>${l.name}</strong> – ${l.address}, ${l.city}</span></li>`)}</ul>
      </div>
    </div>
  </div>
  <div class="pd-tabs">
    <div class="tabs" role="tablist"><button class="active" data-tab="opis" role="tab">Opis</button><button data-tab="spec" role="tab">Specyfikacja</button><button data-tab="odbior" role="tab">Odbiór i płatność</button></div>
    <div class="tab-pane active" id="tab-opis"><div class="prose">${nl2br(p.description)}</div></div>
    <div class="tab-pane" id="tab-spec">${specs.length ? html`<table class="spec">${specs.map((x) => html`<tr><th>${x.n}</th><td>${x.v}</td></tr>`)}<tr><th>Jednostka sprzedaży</th><td>${p.unit}</td></tr>${p.weight ? html`<tr><th>Waga</th><td>${String(p.weight).replace('.', ',')} kg</td></tr>` : ''}</table>` : html`<p class="muted">Brak specyfikacji.</p>`}</div>
    <div class="tab-pane" id="tab-odbior"><div class="prose"><p>${s.order_terms}</p><p>${s.checkout_info}</p><p>Formy płatności: ${Object.values(PAYMENTS).join(', ')}.</p></div></div>
  </div>
  ${related.length ? html`<section class="section-tight"><div class="sec-head"><h2>Podobne produkty</h2></div>${grid(ctx, related)}</section>` : ''}
</div>`;
  return layout(ctx, { title: p.name, metaDesc: p.short_desc, body });
}

/* ---------- Koszyk ---------- */
function cart(ctx, { cart }) {
  const s = ctx.settings;
  const minVal = Math.round((+String(s.min_order_value).replace(',', '.') || 0) * 100);
  const body = html`<div class="wrap page">
  ${crumbs([['Koszyk']])}
  ${steps(1)}
  <h1>Twój koszyk</h1>
  ${!cart.items.length ? html`<div class="empty">${icon('cart', 44)}<h3>Koszyk jest pusty</h3><p>Dodaj produkty, aby złożyć zamówienie z odbiorem osobistym.</p><a href="/produkty" class="btn btn-primary">Przejdź do sklepu</a></div>` : html`
  <div class="cart-layout">
    <div class="cart-items">
      ${cart.items.map((it) => html`<div class="cart-row ${it.problem ? 'has-problem' : ''}">
        <a href="/produkt/${it.p.slug}" class="cart-img"><img src="${it.p.image}" alt="" width="90" height="90"></a>
        <div class="cart-info"><a href="/produkt/${it.p.slug}" class="cart-name">${it.p.name}</a><span class="muted small">Kod: ${it.p.sku} · ${money(it.price)} / ${it.p.unit}</span>
          ${it.problem ? html`<span class="cart-problem">${icon('alert', 15)} ${it.problem}</span>` : ''}</div>
        <form action="/koszyk/zmien" method="post" class="cart-qty" data-cart-update>
          <input type="hidden" name="_csrf" value="${ctx.csrf}"><input type="hidden" name="product_id" value="${it.p.id}">
          <div class="qty"><button type="button" data-step="-1" aria-label="Mniej">${icon('minus', 16)}</button>
          <input type="number" name="qty" value="${it.qty}" min="1" max="${Math.max(1, it.maxQty)}" aria-label="Ilość">
          <button type="button" data-step="1" aria-label="Więcej">${icon('plus', 16)}</button></div>
          <noscript><button class="btn btn-sm btn-ghost">Zmień</button></noscript>
        </form>
        <div class="cart-total"><strong>${money(it.lineTotal)}</strong></div>
        <form action="/koszyk/usun" method="post"><input type="hidden" name="_csrf" value="${ctx.csrf}"><input type="hidden" name="product_id" value="${it.p.id}">
          <button class="icon-btn" type="submit" aria-label="Usuń">${icon('trash', 18)}</button></form>
      </div>`)}
      <div class="cart-actions"><a href="/produkty" class="btn btn-ghost">‹ Kontynuuj zakupy</a>
        <form action="/koszyk/wyczysc" method="post"><input type="hidden" name="_csrf" value="${ctx.csrf}"><button class="btn btn-ghost" data-confirm="Wyczyścić cały koszyk?">${icon('trash', 16)} Wyczyść koszyk</button></form></div>
    </div>
    <aside class="summary">
      <h3>Podsumowanie</h3>
      <div class="sum-row"><span>Produkty (${cart.count})</span><strong>${money(cart.total)}</strong></div>
      <div class="sum-row"><span>Dostawa</span><strong class="green">Odbiór osobisty – 0,00 zł</strong></div>
      <div class="sum-row muted"><span>W tym VAT</span><span>${money(cart.total - netOf(cart.total, +s.vat_rate || 23))}</span></div>
      <div class="sum-total"><span>Do zapłaty</span><strong>${money(cart.total)}</strong></div>
      ${cart.problems ? html`<div class="note note-warn">${icon('alert', 18)} Popraw ilości oznaczonych produktów, aby kontynuować.</div>` : ''}
      ${minVal && cart.total < minVal ? html`<div class="note note-warn">${icon('alert', 18)} Minimalna wartość zamówienia to ${money(minVal)}.</div>` : ''}
      <a href="/zamowienie" class="btn btn-primary btn-lg btn-block ${cart.problems || (minVal && cart.total < minVal) ? 'disabled' : ''}">Przejdź do odbioru ${icon('chevron', 18)}</a>
      <p class="muted small center">${icon('shield', 14)} Płatność dopiero przy odbiorze</p>
    </aside>
  </div>`}
</div>`;
  return layout(ctx, { title: 'Koszyk', body });
}
function steps(n) {
  const list = ['Koszyk', 'Odbiór i dane', 'Potwierdzenie'];
  return html`<ol class="steps">${list.map((t, i) => html`<li class="${i + 1 < n ? 'done' : i + 1 === n ? 'current' : ''}"><b>${i + 1 < n ? icon('check', 14) : i + 1}</b><span>${t}</span></li>`)}</ol>`;
}

/* ---------- Zamówienie (checkout) ---------- */
function checkout(ctx, { cart, locations, form, errors, calendars }) {
  const s = ctx.settings;
  const f = form || {};
  const e = errors || {};
  const err = (k) => (e[k] ? html`<span class="err">${e[k]}</span>` : '');
  const selLoc = +f.location_id || (locations[0] && locations[0].id);
  const body = html`<div class="wrap page">
  ${crumbs([['Koszyk', '/koszyk'], ['Odbiór i dane']])}
  ${steps(2)}
  <h1>Odbiór osobisty i dane zamawiającego</h1>
  ${Object.keys(e).length ? html`<div class="note note-error">${icon('alert', 18)} Popraw zaznaczone pola formularza.${e._global ? html` ${e._global}` : ''}</div>` : ''}
  <form method="post" action="/zamowienie" class="checkout" id="checkout" novalidate>
    <input type="hidden" name="_csrf" value="${ctx.csrf}">
    <div class="co-main">
      <section class="card"><h2><b>1</b> Wybierz punkt odbioru</h2>
        <div class="loc-options">${locations.map((l) => html`<label class="opt-card">
          <input type="radio" name="location_id" value="${l.id}" ${selLoc === l.id ? 'checked' : ''} data-location>
          <span class="opt-body"><strong>${l.name}</strong><span>${l.address}, ${l.city}</span>
          <small>pn–pt ${l.hours_weekday || '—'} · sob ${l.hours_saturday || 'nieczynne'} · nd ${l.hours_sunday || 'nieczynne'}</small></span></label>`)}</div>
        ${err('location_id')}
      </section>
      <section class="card"><h2><b>2</b> Wybierz dzień i godzinę odbioru</h2>
        <script type="application/json" id="calendars">${raw(JSON.stringify(calendars).replace(/</g, '\\u003c'))}</script>
        <input type="hidden" name="pickup_date" id="pickup_date" value="${f.pickup_date || ''}">
        <input type="hidden" name="pickup_slot" id="pickup_slot" value="${f.pickup_slot || ''}">
        <div class="days" id="days" aria-label="Dzień odbioru"></div>
        <div class="slots" id="slots" aria-label="Godzina odbioru"><p class="muted">Wybierz dzień, aby zobaczyć dostępne godziny.</p></div>
        ${err('pickup_date')}${err('pickup_slot')}
        <p class="muted small">${icon('info', 14)} Towar będzie na Ciebie czekał do ${s.reservation_days} dni od wybranego terminu.</p>
      </section>
      <section class="card"><h2><b>3</b> Dane kontaktowe</h2>
        <div class="fgrid">
          <label class="fld ${e.customer_name ? 'has-err' : ''}"><span>Imię i nazwisko *</span><input name="customer_name" value="${f.customer_name || ''}" required autocomplete="name">${err('customer_name')}</label>
          <label class="fld ${e.phone ? 'has-err' : ''}"><span>Telefon *</span><input name="phone" type="tel" value="${f.phone || ''}" required autocomplete="tel" placeholder="np. 600 100 200">${err('phone')}</label>
          <label class="fld full ${e.email ? 'has-err' : ''}"><span>E-mail *</span><input name="email" type="email" value="${f.email || ''}" required autocomplete="email">${err('email')}</label>
        </div>
        <label class="check"><input type="checkbox" name="want_invoice" value="1" ${f.want_invoice ? 'checked' : ''} data-invoice> <span>Chcę otrzymać fakturę VAT na firmę</span></label>
        <div class="fgrid invoice" ${f.want_invoice ? '' : 'hidden'} id="invoice">
          <label class="fld ${e.company ? 'has-err' : ''}"><span>Nazwa firmy *</span><input name="company" value="${f.company || ''}" autocomplete="organization">${err('company')}</label>
          <label class="fld ${e.nip ? 'has-err' : ''}"><span>NIP *</span><input name="nip" value="${f.nip || ''}" inputmode="numeric" placeholder="0000000000">${err('nip')}</label>
          <label class="fld full"><span>Adres firmy</span><input name="invoice_address" value="${f.invoice_address || ''}" autocomplete="street-address"></label>
        </div>
        <label class="fld full"><span>Uwagi do zamówienia</span><textarea name="customer_note" rows="3" maxlength="1000" placeholder="np. proszę przygotować towar na palecie">${f.customer_note || ''}</textarea></label>
      </section>
      <section class="card"><h2><b>4</b> Forma płatności</h2>
        <div class="pay-options">${Object.entries(PAYMENTS).map(([k, l], i) => html`<label class="opt-card small">
          <input type="radio" name="payment_method" value="${k}" ${(f.payment_method || 'gotowka') === k ? 'checked' : ''}>
          <span class="opt-body">${icon(k === 'karta' ? 'card' : k === 'przelew' ? 'file' : 'hand', 22)}<strong>${l}</strong></span></label>`)}</div>
      </section>
    </div>
    <aside class="summary co-summary">
      <h3>Twoje zamówienie</h3>
      <ul class="mini-items">${cart.items.map((it) => html`<li><img src="${it.p.image}" alt="" width="48" height="48"><span>${it.p.name}<small>${it.qty} × ${money(it.price)}</small></span><strong>${money(it.lineTotal)}</strong></li>`)}</ul>
      <div class="sum-row"><span>Wartość produktów</span><strong>${money(cart.total)}</strong></div>
      <div class="sum-row"><span>Odbiór osobisty</span><strong class="green">0,00 zł</strong></div>
      <div class="sum-total"><span>Do zapłaty przy odbiorze</span><strong>${money(cart.total)}</strong></div>
      <div class="pick-summary" id="pick-summary">${icon('calendar', 18)} <span>Nie wybrano terminu odbioru</span></div>
      <label class="check terms ${e.terms ? 'has-err' : ''}"><input type="checkbox" name="terms" value="1" ${f.terms ? 'checked' : ''}> <span>Akceptuję <a href="/regulamin" target="_blank">regulamin</a> i wiem, że zamówienie realizowane jest wyłącznie z odbiorem osobistym. *</span></label>
      ${err('terms')}
      <button class="btn btn-primary btn-lg btn-block" type="submit">${icon('check', 20)} Zamawiam z odbiorem osobistym</button>
      <p class="muted small center">Zamówienie nie wymaga przedpłaty.</p>
    </aside>
  </form>
</div>`;
  return layout(ctx, { title: 'Zamówienie', body });
}

/* ---------- Podgląd zamówienia ---------- */
function orderView(ctx, { order, items, location, justPlaced }) {
  const st = STATUSES[order.status] || { label: order.status, cls: 'gray' };
  const flow = ['nowe', 'potwierdzone', 'gotowe', 'odebrane'];
  const idx = flow.indexOf(order.status);
  const body = html`<div class="wrap page narrow">
  ${justPlaced ? steps(3) : crumbs([['Śledzenie zamówienia', '/sledzenie'], [order.number]])}
  ${justPlaced ? html`<div class="success-box">
    <div class="success-ico">${icon('check', 40)}</div>
    <h1>Dziękujemy! Zamówienie zostało przyjęte.</h1>
    <p>Numer zamówienia: <strong class="order-no">${order.number}</strong></p>
    <p class="muted">Zachowaj ten numer – podaj go przy odbiorze. Status możesz sprawdzić w zakładce <a href="/sledzenie">Śledź zamówienie</a>.</p>
  </div>` : html`<h1>Zamówienie ${order.number}</h1>`}
  <div class="card">
    <div class="ov-head"><span class="pill pill-${st.cls}">${st.label}</span><span class="muted">Złożone ${dtPL(order.created_at)}</span></div>
    ${order.status !== 'anulowane' ? html`<ol class="track">${flow.map((k, i) => html`<li class="${i <= idx ? 'done' : ''} ${i === idx ? 'current' : ''}"><b>${i < idx || (i === idx && k === 'odebrane') ? icon('check', 14) : i + 1}</b><span>${STATUSES[k].label}</span></li>`)}</ol>` : html`<div class="note note-error">${icon('x', 18)} Zamówienie zostało anulowane.</div>`}
    <div class="ov-grid">
      <div class="ov-box">${icon('calendar', 22)}<div><small>Termin odbioru</small><strong>${datePL(order.pickup_date)}</strong><span>godz. ${order.pickup_slot}</span></div></div>
      <div class="ov-box">${icon('pin', 22)}<div><small>Punkt odbioru</small><strong>${location ? location.name : '—'}</strong><span>${location ? `${location.address}, ${location.city}` : ''}</span></div></div>
      <div class="ov-box">${icon('card', 22)}<div><small>Płatność</small><strong>${PAYMENTS[order.payment_method] || order.payment_method}</strong><span>${order.paid ? 'Opłacone' : 'Do zapłaty przy odbiorze'}</span></div></div>
    </div>
    <table class="tbl">
      <thead><tr><th>Produkt</th><th class="r">Cena</th><th class="r">Ilość</th><th class="r">Wartość</th></tr></thead>
      <tbody>${items.map((i) => html`<tr><td>${i.name}<br><small class="muted">${i.sku}</small></td><td class="r">${money(i.price)}</td><td class="r">${i.qty} ${i.unit}</td><td class="r"><strong>${money(i.total)}</strong></td></tr>`)}</tbody>
      <tfoot><tr><td colspan="3" class="r">Razem do zapłaty</td><td class="r"><strong class="big">${money(order.total)}</strong></td></tr></tfoot>
    </table>
    <div class="ov-cust"><div><small>Zamawiający</small><strong>${order.customer_name}</strong><span>${order.phone} · ${order.email}</span></div>
      ${order.want_invoice ? html`<div><small>Faktura VAT</small><strong>${order.company}</strong><span>NIP ${order.nip}${order.invoice_address ? ' · ' + order.invoice_address : ''}</span></div>` : ''}</div>
  </div>
  <div class="center gap"><a href="/produkty" class="btn btn-ghost">Wróć do sklepu</a> <button class="btn btn-ghost" type="button" onclick="window.print()">${icon('print', 16)} Drukuj</button></div>
</div>`;
  return layout(ctx, { title: `Zamówienie ${order.number}`, body });
}

function track(ctx, { error, form }) {
  const body = html`<div class="wrap page narrow">
  ${crumbs([['Śledzenie zamówienia']])}
  <div class="card track-card">
    <div class="center">${icon('box', 44, 'red')}<h1>Sprawdź status zamówienia</h1><p class="muted">Podaj numer zamówienia oraz adres e-mail lub telefon użyty przy zamówieniu.</p></div>
    ${error ? html`<div class="note note-error">${icon('alert', 18)} ${error}</div>` : ''}
    <form method="post" action="/sledzenie" class="fgrid">
      <input type="hidden" name="_csrf" value="${ctx.csrf}">
      <label class="fld full"><span>Numer zamówienia</span><input name="number" value="${(form && form.number) || ''}" placeholder="np. FM261003-0042" required></label>
      <label class="fld full"><span>E-mail lub telefon</span><input name="contact" value="${(form && form.contact) || ''}" required></label>
      <button class="btn btn-primary btn-lg btn-block full" type="submit">Sprawdź status</button>
    </form>
  </div>
</div>`;
  return layout(ctx, { title: 'Śledzenie zamówienia', body });
}

function pickupInfo(ctx, { locations }) {
  const s = ctx.settings;
  const body = html`<div class="wrap page">
  ${crumbs([['Odbiór osobisty']])}
  <h1>Jak kupować w ${s.store_name}?</h1>
  <p class="lead">${s.hero_subtitle}</p>
  <div class="how">
    <div class="how-step"><b>1</b>${icon('cart', 30)}<h3>Skompletuj koszyk</h3><p>Wybierz produkty i ilości. Na bieżąco widzisz stany magazynowe.</p></div>
    <div class="how-step"><b>2</b>${icon('calendar', 30)}<h3>Wybierz termin</h3><p>Wskaż punkt odbioru oraz dzień i godzinę, w której przyjedziesz.</p></div>
    <div class="how-step"><b>3</b>${icon('box', 30)}<h3>Kompletujemy towar</h3><p>Rezerwujemy produkty i przygotowujemy je do wydania.</p></div>
    <div class="how-step"><b>4</b>${icon('store', 30)}<h3>Odbierz i zapłać</h3><p>Podaj numer zamówienia, zapłać gotówką lub kartą i odbierz towar.</p></div>
  </div>
  <h2>Punkty odbioru i godziny otwarcia</h2>
  <div class="loc-grid">${locations.map((l) => html`<div class="loc-card">
    <div class="loc-head">${icon('pin', 22)}<div><strong>${l.name}</strong><span>${l.address}, ${l.city}</span></div></div>
    ${hoursList(l)}${l.info ? html`<p class="muted">${l.info}</p>` : ''}
    ${l.phone ? html`<a class="loc-phone" href="tel:${l.phone.replace(/\s/g, '')}">${icon('phone', 16)} ${l.phone}</a>` : ''}
    ${l.map_url ? html`<a class="loc-phone" href="${l.map_url}" target="_blank" rel="noopener">${icon('external', 16)} Pokaż na mapie</a>` : ''}
  </div>`)}</div>
  <div class="card prose"><h3>Ważne informacje</h3><p>${s.order_terms}</p><p>${s.checkout_info}</p></div>
</div>`;
  return layout(ctx, { title: 'Odbiór osobisty', body });
}

function textPage(ctx, { title, content }) {
  const body = html`<div class="wrap page narrow">${crumbs([[title]])}<h1>${title}</h1><div class="card prose">${content}</div></div>`;
  return layout(ctx, { title, body });
}

function notFound(ctx) {
  const body = html`<div class="wrap page narrow center"><div class="empty">
    <div class="big-404">404</div><h1>Nie znaleziono strony</h1><p class="muted">Strona mogła zostać przeniesiona lub produkt nie jest już dostępny.</p>
    <a class="btn btn-primary" href="/">Strona główna</a> <a class="btn btn-ghost" href="/produkty">Wszystkie produkty</a></div></div>`;
  return layout(ctx, { title: 'Nie znaleziono', body });
}
function errorPage(ctx, msg) {
  const body = html`<div class="wrap page narrow center"><div class="empty">${icon('alert', 44)}<h1>Wystąpił błąd</h1><p class="muted">${msg}</p><a class="btn btn-primary" href="/">Strona główna</a></div></div>`;
  return layout(ctx, { title: 'Błąd', body });
}

module.exports = { home, listing, product, cart, checkout, orderView, track, pickupInfo, textPage, notFound, errorPage };
