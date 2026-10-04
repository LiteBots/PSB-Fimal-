'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'fimal.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, description TEXT DEFAULT '',
  icon TEXT DEFAULT 'box', sort INTEGER DEFAULT 0, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY, sku TEXT UNIQUE, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL, brand TEXT DEFAULT '',
  short_desc TEXT DEFAULT '', description TEXT DEFAULT '', price INTEGER NOT NULL DEFAULT 0, promo_price INTEGER,
  unit TEXT DEFAULT 'szt.', stock INTEGER DEFAULT 0, max_per_order INTEGER DEFAULT 0, image TEXT DEFAULT '',
  gallery TEXT DEFAULT '[]', specs TEXT DEFAULT '[]', weight REAL DEFAULT 0, active INTEGER DEFAULT 1,
  featured INTEGER DEFAULT 0, views INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id);
CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, address TEXT DEFAULT '', city TEXT DEFAULT '', phone TEXT DEFAULT '',
  hours_weekday TEXT DEFAULT '07:00-17:00', hours_saturday TEXT DEFAULT '08:00-13:00', hours_sunday TEXT DEFAULT '',
  info TEXT DEFAULT '', map_url TEXT DEFAULT '', sort INTEGER DEFAULT 0, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY, number TEXT UNIQUE, token TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'nowe',
  customer_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, company TEXT DEFAULT '', nip TEXT DEFAULT '',
  invoice_address TEXT DEFAULT '', want_invoice INTEGER DEFAULT 0, customer_note TEXT DEFAULT '', admin_note TEXT DEFAULT '',
  location_id INTEGER REFERENCES locations(id), pickup_date TEXT, pickup_slot TEXT,
  payment_method TEXT DEFAULT 'gotowka', paid INTEGER DEFAULT 0, items_count INTEGER DEFAULT 0, total INTEGER DEFAULT 0,
  stock_returned INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT, picked_up_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_pickup ON orders(pickup_date);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE, product_id INTEGER,
  sku TEXT, name TEXT, unit TEXT, price INTEGER, qty INTEGER, total INTEGER
);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
CREATE TABLE IF NOT EXISTS order_history (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT, note TEXT DEFAULT '', author TEXT DEFAULT '', created_at TEXT
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'pracownik', active INTEGER DEFAULT 1, created_at TEXT, last_login TEXT
);
CREATE TABLE IF NOT EXISTS stock_moves (
  id INTEGER PRIMARY KEY, product_id INTEGER REFERENCES products(id) ON DELETE CASCADE, delta INTEGER,
  reason TEXT, author TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY, user_name TEXT, action TEXT, details TEXT, ip TEXT, created_at TEXT
);
`);

/* Prosty helper transakcji */
function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}
const q = {
  get: (sql, ...a) => { const r = db.prepare(sql).get(...a); return r ? { ...r } : undefined; },
  all: (sql, ...a) => db.prepare(sql).all(...a).map((r) => ({ ...r })),
  run: (sql, ...a) => db.prepare(sql).run(...a),
};

let settingsCache = null;
function getSettings() {
  if (!settingsCache) {
    settingsCache = {};
    for (const r of q.all('SELECT key, value FROM settings')) settingsCache[r.key] = r.value;
  }
  return settingsCache;
}
function setSetting(key, value) {
  q.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, String(value ?? ''));
  settingsCache = null;
}

module.exports = { db, q, tx, DATA_DIR, UPLOAD_DIR, getSettings, setSetting };
