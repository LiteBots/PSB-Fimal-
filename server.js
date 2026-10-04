'use strict';
/* PSB Fimal – sklep internetowy z odbiorem osobistym. Start: npm start */
process.env.TZ = process.env.TZ || 'Europe/Warsaw';

const path = require('path');
const { App } = require('./src/http');
const { q, UPLOAD_DIR, DATA_DIR, getSettings } = require('./src/db');
const seed = require('./src/seed');
const core = require('./src/core');
const shopViews = require('./src/views/shop');

seed.run();

const app = new App();
app.static('/static', path.join(__dirname, 'public'), 7 * 86400);
app.static('/uploads', UPLOAD_DIR, 30 * 86400);
app.beforeSend.push(core.saveSession);

// sesja + wspólne dane widoków
app.use(core.sessionMiddleware(app));
app.use((req, res) => {
  res.locals.settings = getSettings();
  res.locals.path = req.path;
  res.locals.csrf = core.csrfToken(req);
  res.locals.flash = core.takeFlash(req);
  if (!req.path.startsWith('/admin') && !req.path.startsWith('/api/')) {
    res.locals.navCategories = q.all('SELECT id,name,slug FROM categories WHERE active=1 ORDER BY sort, name');
    res.locals.locations = q.all('SELECT * FROM locations WHERE active=1 ORDER BY sort, id');
    res.locals.cartCount = core.cartCount(req);
  }
});
// ochrona CSRF dla wszystkich formularzy POST
app.use((req, res) => {
  if (req.method !== 'POST') return;
  if (!core.checkCsrf(req)) {
    if (req.wantsJson) return res.json({ ok: false, message: 'Sesja wygasła – odśwież stronę.' }, 403);
    core.flash(req, 'error', 'Sesja formularza wygasła. Spróbuj ponownie.');
    let back = '/';
    try { const u = new URL(req.headers.referer); back = u.pathname + u.search; } catch { /* */ }
    return res.redirect(back);
  }
});

require('./src/routes/admin')(app);
require('./src/routes/shop')(app);

app.notFound = (req, res) => {
  if (req.path.startsWith('/api/')) return res.json({ error: 'Nie znaleziono' }, 404);
  if (!res.locals.navCategories) {
    res.locals.navCategories = q.all('SELECT id,name,slug FROM categories WHERE active=1 ORDER BY sort, name');
    res.locals.locations = q.all('SELECT * FROM locations WHERE active=1 ORDER BY sort, id');
    res.locals.cartCount = 0;
  }
  res.html(shopViews.notFound(res.locals), 404);
};
app.onError = (err, req, res) => {
  const status = err.status || 500;
  if (req.wantsJson) return res.json({ error: 'Błąd serwera' }, status);
  try {
    res.locals.settings = res.locals.settings || getSettings();
    res.locals.navCategories = res.locals.navCategories || [];
    res.locals.locations = res.locals.locations || [];
    res.locals.csrf = res.locals.csrf || '';
    res.html(shopViews.errorPage(res.locals, status === 413 ? 'Przesłany plik jest za duży.' : 'Coś poszło nie tak. Spróbuj ponownie za chwilę.'), status);
  } catch {
    res.send('Błąd serwera', status, 'text/plain; charset=utf-8');
  }
};

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`PSB Fimal – sklep działa na porcie ${PORT}`);
  console.log(`Dane: ${DATA_DIR}`);
  console.log(`Panel administratora: /admin`);
});
