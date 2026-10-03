/* PSB Fimal – skrypty sklepu */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var csrf = ($('meta[name="csrf-token"]') || {}).content || '';
  var zl = function (g) { return (g / 100).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł'; };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  /* toast */
  var toastEl = $('#toast'), toastT;
  function toast(msg, err, link) {
    if (!toastEl) return;
    toastEl.innerHTML = '<span>' + esc(msg) + '</span>' + (link ? '<a href="' + link[0] + '">' + esc(link[1]) + '</a>' : '');
    toastEl.className = 'toast show' + (err ? ' err' : '');
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.className = 'toast'; }, 3800);
  }

  /* przełączniki (menu, filtry) */
  $$('[data-toggle]').forEach(function (b) {
    b.addEventListener('click', function () { var t = document.getElementById(b.getAttribute('data-toggle')); if (t) t.classList.toggle('open'); });
  });
  $$('.flash-x').forEach(function (b) { b.addEventListener('click', function () { b.parentNode.remove(); }); });
  setTimeout(function () { $$('.flash-success').forEach(function (f) { f.style.transition = '.4s'; f.style.opacity = '0'; setTimeout(function () { f.remove(); }, 400); }); }, 5000);
  $$('[data-autosubmit]').forEach(function (s) { s.addEventListener('change', function () { s.form.submit(); }); });
  $$('[data-confirm]').forEach(function (b) { b.addEventListener('click', function (e) { if (!confirm(b.getAttribute('data-confirm'))) e.preventDefault(); }); });

  /* licznik ilości */
  $$('.qty').forEach(function (q) {
    var input = $('input', q);
    $$('[data-step]', q).forEach(function (b) {
      b.addEventListener('click', function () {
        var v = (parseInt(input.value, 10) || 1) + parseInt(b.getAttribute('data-step'), 10);
        var max = parseInt(input.max, 10) || 9999;
        input.value = Math.max(1, Math.min(max, v));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  });

  /* dodawanie do koszyka (AJAX) */
  function setCount(n) {
    $$('[data-cart-count]').forEach(function (b) {
      b.textContent = n; b.hidden = !n;
      b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
    });
  }
  $$('form[data-add]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = $('button[type=submit]', f); btn.disabled = true;
      fetch(f.action, { method: 'POST', headers: { 'X-Requested-With': 'fetch', Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(new FormData(f)).toString(), credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.ok) { setCount(d.count); toast(d.message, false, ['/koszyk', 'Przejdź do koszyka (' + zl(d.total) + ')']); }
          else toast(d.message || 'Nie udało się dodać produktu.', true);
        })
        .catch(function () { f.submit(); })
        .finally(function () { btn.disabled = false; });
    });
  });

  /* zmiana ilości w koszyku */
  $$('form[data-cart-update]').forEach(function (f) {
    var t;
    $('input[name=qty]', f).addEventListener('change', function () { clearTimeout(t); t = setTimeout(function () { f.submit(); }, 450); });
  });

  /* podpowiedzi wyszukiwarki */
  var sInput = $('[data-suggest]');
  if (sInput) {
    var box = $('.suggest', sInput.form), timer, idx = -1;
    sInput.addEventListener('input', function () {
      clearTimeout(timer);
      var v = sInput.value.trim();
      if (v.length < 2) { box.hidden = true; return; }
      timer = setTimeout(function () {
        fetch('/api/szukaj?q=' + encodeURIComponent(v)).then(function (r) { return r.json(); }).then(function (list) {
          idx = -1;
          if (!list.length) { box.innerHTML = '<a class="all" href="/produkty?q=' + encodeURIComponent(v) + '">Brak podpowiedzi – szukaj „' + esc(v) + '”</a>'; box.hidden = false; return; }
          box.innerHTML = list.map(function (p) {
            return '<a href="' + p.url + '"><img src="' + esc(p.image) + '" alt=""><span>' + esc(p.name) + '<small>' + (p.stock > 0 ? 'Dostępny' : 'Niedostępny') + '</small></span><b>' + zl(p.price) + '</b></a>';
          }).join('') + '<a class="all" href="/produkty?q=' + encodeURIComponent(v) + '">Pokaż wszystkie wyniki</a>';
          box.hidden = false;
        });
      }, 200);
    });
    sInput.addEventListener('keydown', function (e) {
      var items = $$('a', box);
      if (box.hidden || !items.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items.forEach(function (a, i) { a.classList.toggle('on', i === idx); });
      } else if (e.key === 'Enter' && idx >= 0) { e.preventDefault(); location.href = items[idx].href; }
      else if (e.key === 'Escape') box.hidden = true;
    });
    document.addEventListener('click', function (e) { if (!sInput.form.contains(e.target)) box.hidden = true; });
  }

  /* galeria + zakładki produktu */
  $$('.pd-thumbs button').forEach(function (b) {
    b.addEventListener('click', function () {
      $('#pd-main').src = b.getAttribute('data-img');
      $$('.pd-thumbs button').forEach(function (x) { x.classList.toggle('active', x === b); });
    });
  });
  $$('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('.tabs button').forEach(function (x) { x.classList.toggle('active', x === b); });
      $$('.tab-pane').forEach(function (p) { p.classList.toggle('active', p.id === 'tab-' + b.getAttribute('data-tab')); });
    });
  });

  /* zamówienie: wybór terminu odbioru */
  var calEl = $('#calendars');
  if (calEl) {
    var calendars = JSON.parse(calEl.textContent);
    var daysEl = $('#days'), slotsEl = $('#slots'), dateIn = $('#pickup_date'), slotIn = $('#pickup_slot'), sum = $('#pick-summary');
    var MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
    var DAYS = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
    function locId() { var r = $('input[name=location_id]:checked'); return r ? r.value : null; }
    function cal() { return calendars[locId()] || []; }
    function fmtDate(v) { var p = v.split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2]); return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; }
    function updateSummary() {
      if (dateIn.value && slotIn.value) {
        sum.className = 'pick-summary ok';
        sum.innerHTML = '<span>Odbiór: <strong>' + esc(fmtDate(dateIn.value)) + '</strong>, godz. <strong>' + esc(slotIn.value) + '</strong></span>';
      } else { sum.className = 'pick-summary'; sum.innerHTML = '<span>Nie wybrano terminu odbioru</span>'; }
    }
    function renderSlots() {
      var day = cal().filter(function (d) { return d.value === dateIn.value; })[0];
      if (!day) { slotsEl.innerHTML = '<p class="muted">Wybierz dzień, aby zobaczyć dostępne godziny.</p>'; return; }
      if (!day.slots.length) { slotsEl.innerHTML = '<p class="muted">Brak godzin w tym dniu.</p>'; return; }
      slotsEl.innerHTML = day.slots.map(function (s) {
        return '<button type="button" class="slot' + (s.label === slotIn.value ? ' sel' : '') + '" data-slot="' + esc(s.label) + '"' + (s.full ? ' disabled' : '') + '>' + esc(s.label) + (s.free < 99 ? '<small>' + (s.full ? 'brak miejsc' : 'wolne: ' + s.free) + '</small>' : '') + '</button>';
      }).join('');
      $$('.slot', slotsEl).forEach(function (b) {
        b.addEventListener('click', function () { slotIn.value = b.getAttribute('data-slot'); renderSlots(); updateSummary(); });
      });
    }
    function renderDays() {
      var c = cal();
      if (!c.some(function (d) { return d.value === dateIn.value && d.open; })) { dateIn.value = ''; slotIn.value = ''; }
      if (!dateIn.value) { var first = c.filter(function (d) { return d.open; })[0]; if (first) dateIn.value = first.value; }
      daysEl.innerHTML = c.map(function (d) {
        return '<button type="button" class="day' + (d.value === dateIn.value ? ' sel' : '') + '" data-day="' + d.value + '"' + (d.open ? '' : ' disabled') + '>' + (d.today ? '<span class="t">dziś</span>' : '<small>' + d.dow + '</small>') + '<strong>' + d.day + '</strong><small>' + d.month + '</small></button>';
      }).join('');
      $$('.day', daysEl).forEach(function (b) {
        b.addEventListener('click', function () {
          if (dateIn.value !== b.getAttribute('data-day')) slotIn.value = '';
          dateIn.value = b.getAttribute('data-day'); renderDays();
        });
      });
      var sel = $('.day.sel', daysEl); if (sel && sel.scrollIntoView) daysEl.scrollLeft = Math.max(0, sel.offsetLeft - daysEl.offsetLeft - 8);
      renderSlots(); updateSummary();
    }
    $$('[data-location]').forEach(function (r) { r.addEventListener('change', function () { slotIn.value = ''; renderDays(); }); });
    renderDays();
    var inv = $('[data-invoice]');
    if (inv) inv.addEventListener('change', function () { $('#invoice').hidden = !inv.checked; });
    $('#checkout').addEventListener('submit', function (e) {
      if (!dateIn.value || !slotIn.value) { e.preventDefault(); toast('Wybierz dzień i godzinę odbioru.', true); slotsEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    });
  }
})();
