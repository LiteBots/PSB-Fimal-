'use strict';
/* Usuwa bazę danych i wgrywa dane testowe od nowa. UWAGA: kasuje zamówienia! */
process.env.TZ = process.env.TZ || 'Europe/Warsaw';
const fs = require('fs');
const path = require('path');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
for (const f of ['fimal.db', 'fimal.db-wal', 'fimal.db-shm']) { try { fs.unlinkSync(path.join(DATA_DIR, f)); } catch { /* */ } }
require('../src/seed').run();
console.log('Baza danych została zresetowana.');
