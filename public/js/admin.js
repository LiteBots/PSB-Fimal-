/* PSB Fimal – skrypty panelu administratora */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var csrf = ($('meta[name="csrf-token"]') || {}).content || '';
  var toastEl = $('#toast'), tt;
  function toast(msg, err) {
    if (!toastEl) return;
    toastEl.textContent = msg; toastEl.className = 'toast show' + (err ? ' err' : '');
    clearTimeout(tt); tt = setTimeout(function () { toastEl.className = 'toast'; }, 3000);
  }

  $$('[data-toggle]').forEach(function (b) { b.addEventListener('click', function () { var t = document.getElementById(b.getAttribute('data-toggle')); if (t) t.classList.toggle('open'); }); });
  document.addEventListener('click', function (e) {
    var side = $('#side');
    if (side && side.classList.contains('open') && !side.contains(e.target) && !e.target.closest('[data-toggle=side]')) side.classList.remove('open');
  });
  $$('.flash-x').forEach(function (b) { b.addEventListener('click', function () { b.parentNode.remove(); }); });
  setTimeout(function () { $$('.flash-success').forEach(function (f) { f.style.transition = '.4s'; f.style.opacity = '0'; setTimeout(function () { f.remove(); }, 400); }); }, 4500);
  $$('[data-autosubmit]').forEach(function (s) { s.addEventListener('change', function () { s.form.submit(); }); });
  $$('[data-confirm]').forEach(function (b) { b.addEventListener('click', function (e) { if (!confirm(b.getAttribute('data-confirm'))) e.preventDefault(); }); });
  $$('[data-confirm-if-cancel]').forEach(function (b) {
    b.addEventListener('click', function (e) {
      var sel = $('select[name=status]', b.form);
      if (sel && sel.value === 'anulowane' && !confirm('Anulować zamówienie? Towar wróci na stan magazynowy.')) e.preventDefault();
    });
  });

  /* zaznaczanie zbiorcze */
  $$('form[data-bulk]').forEach(function (f) {
    var all = $('[data-check-all]', f), count = $('[data-bulk-count]', f);
    var boxes = $$('[data-check]', f);
    function upd() { count.textContent = boxes.filter(function (b) { return b.checked; }).length; }
    if (all) all.addEventListener('change', function () { boxes.forEach(function (b) { b.checked = all.checked; }); upd(); });
    boxes.forEach(function (b) { b.addEventListener('change', upd); });
    f.addEventListener('submit', function (e) {
      if (!boxes.some(function (b) { return b.checked; })) { e.preventDefault(); toast('Zaznacz co najmniej jedną pozycję.', true); }
    });
  });

  /* szybka edycja stanu */
  $$('[data-stock-edit]').forEach(function (w) {
    var input = $('input', w), btn = $('button', w), orig = input.value;
    function save() {
      if (input.value === orig) return;
      btn.disabled = true;
      fetch('/admin/produkty/stan', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, 'X-Requested-With': 'fetch', Accept: 'application/json' },
        body: JSON.stringify({ id: w.getAttribute('data-stock-edit'), stock: input.value })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.ok) { orig = input.value = String(d.stock); w.classList.remove('dirty'); w.classList.add('saved'); toast(d.message); setTimeout(function () { w.classList.remove('saved'); }, 1500); }
        else toast(d.message || 'Błąd zapisu', true);
      }).catch(function () { toast('Błąd połączenia', true); }).finally(function () { btn.disabled = false; });
    }
    input.addEventListener('input', function () { w.classList.toggle('dirty', input.value !== orig); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    btn.addEventListener('click', save);
  });

  /* formularz produktu */
  var specs = $('#specs');
  if (specs) {
    $('[data-add-spec]').addEventListener('click', function () {
      var row = specs.querySelector('.spec-row').cloneNode(true);
      $$('input', row).forEach(function (i) { i.value = ''; });
      specs.appendChild(row); $('input', row).focus();
    });
    specs.addEventListener('click', function (e) {
      var b = e.target.closest('[data-del-spec]');
      if (!b) return;
      var rows = $$('.spec-row', specs);
      if (rows.length > 1) b.closest('.spec-row').remove(); else $$('input', rows[0]).forEach(function (i) { i.value = ''; });
    });
  }
  $$('input[data-preview]').forEach(function (inp) {
    inp.addEventListener('change', function () {
      var f = inp.files[0]; if (!f) return;
      var img = document.getElementById(inp.getAttribute('data-preview'));
      var r = new FileReader(); r.onload = function () { img.src = r.result; }; r.readAsDataURL(f);
    });
  });
  $$('input[data-count]').forEach(function (inp) {
    inp.addEventListener('change', function () { var s = inp.parentNode.querySelector('span'); if (s) s.textContent = inp.files.length ? 'Wybrano: ' + inp.files.length + ' plik(i)' : 'Dodaj zdjęcia do galerii'; });
  });
  var slugSrc = $('[data-slug-src]'), slug = $('[data-slug]');
  if (slugSrc && slug) slug.placeholder = 'generowany automatycznie';
  var price = $('[data-price]'), net = $('[data-net]');
  if (price && net) {
    var calc = function () { var v = parseFloat(price.value.replace(',', '.')); net.textContent = isNaN(v) ? '' : 'Netto: ' + (v / 1.23).toFixed(2).replace('.', ',') + ' zł'; };
    price.addEventListener('input', calc); calc();
  }

  /* skrót klawiszowy: / = wyszukiwarka */
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { var s = $('.atop-search input'); if (s) { e.preventDefault(); s.focus(); } }
  });

  /* automatyczne odświeżanie licznika nowych zamówień */
  var badge = $('.nb-newOrders');
  setInterval(function () {
    fetch('/admin/api/licznik', { headers: { Accept: 'application/json' }, credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (d) {
      if (typeof d.newOrders !== 'number') return;
      var link = $('.side nav a[href="/admin/zamowienia"]');
      if (!link) return;
      var b = $('.nb', link);
      if (d.newOrders && !b) { b = document.createElement('em'); b.className = 'nb nb-newOrders'; link.appendChild(b); }
      if (b) { if (+b.textContent < d.newOrders) toast('Nowe zamówienie w sklepie!'); b.textContent = d.newOrders; b.hidden = !d.newOrders; }
      document.title = (d.newOrders ? '(' + d.newOrders + ') ' : '') + document.title.replace(/^\(\d+\)\s/, '');
    }).catch(function () {});
  }, 60000);
  void badge;
})();
