'use strict';
/* Lekki framework HTTP bez zależności: routing, parsowanie body (urlencoded/json/multipart),
   ciasteczka, pliki statyczne z ETag oraz gzip. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Raw } = require('./util');

const MIME = {
  '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};
const MAX_BODY = 25 * 1024 * 1024;

function addField(obj, key, val) {
  if (key == null) return;
  if (key.endsWith('[]')) { key = key.slice(0, -2); (obj[key] = Array.isArray(obj[key]) ? obj[key] : []).push(val); return; }
  if (key in obj) obj[key] = Array.isArray(obj[key]) ? [...obj[key], val] : [obj[key], val];
  else obj[key] = val;
}
function parseMultipart(buf, boundary) {
  const fields = {}, files = {};
  const delim = Buffer.from('--' + boundary);
  let pos = buf.indexOf(delim);
  while (pos !== -1) {
    let start = pos + delim.length;
    if (buf[start] === 45 && buf[start + 1] === 45) break; // "--"
    start += 2;
    const headEnd = buf.indexOf('\r\n\r\n', start);
    if (headEnd < 0) break;
    const head = buf.slice(start, headEnd).toString('utf8');
    const next = buf.indexOf(delim, headEnd + 4);
    if (next < 0) break;
    const data = buf.slice(headEnd + 4, next - 2);
    const name = (/\bname="([^"]*)"/i.exec(head) || [])[1];
    const fn = /filename="([^"]*)"/i.exec(head);
    const ct = (/content-type:\s*([^\r\n;]+)/i.exec(head) || [])[1];
    if (fn) {
      if (fn[1] && data.length) {
        const k = name.endsWith('[]') ? name.slice(0, -2) : name;
        (files[k] = files[k] || []).push({ filename: fn[1], mime: (ct || '').trim().toLowerCase(), data });
      }
    } else addField(fields, name, data.toString('utf8'));
    pos = next;
  }
  return { fields, files };
}
function parseCookies(h) {
  const out = {};
  String(h || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) { try { out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch { /* ignoruj */ } }
  });
  return out;
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('Za duże żądanie'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

class App {
  constructor() { this.routes = []; this.mw = []; this.statics = []; this.beforeSend = []; this.notFound = null; this.onError = null; }
  use(fn) { this.mw.push(fn); }
  static(prefix, dir, maxAge = 0) { this.statics.push({ prefix, dir: path.resolve(dir), maxAge }); }
  add(method, pattern, handlers) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\/:([a-zA-Z_]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
    this.routes.push({ method, re, keys, handlers });
  }
  get(p, ...h) { this.add('GET', p, h); }
  post(p, ...h) { this.add('POST', p, h); }

  augment(req, res) {
    const u = new URL(req.url, 'http://x');
    req.path = decodeURIComponent(u.pathname).replace(/\/{2,}/g, '/');
    req.query = {};
    for (const [k, v] of u.searchParams) addField(req.query, k, v);
    req.cookies = parseCookies(req.headers.cookie);
    req.ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    req.secure = req.headers['x-forwarded-proto'] === 'https' || !!req.socket.encrypted;
    req.body = {}; req.files = {};
    req.wantsJson = /json/.test(req.headers.accept || '') || req.headers['x-requested-with'] === 'fetch';
    const app = this;
    res.locals = {};
    res.cookies = [];
    res.setCookie = (name, val, o = {}) => {
      let c = `${name}=${encodeURIComponent(val)}; Path=${o.path || '/'}; SameSite=${o.sameSite || 'Lax'}`;
      if (o.maxAge != null) c += `; Max-Age=${Math.floor(o.maxAge)}`;
      if (o.httpOnly !== false) c += '; HttpOnly';
      if (o.secure) c += '; Secure';
      res.cookies.push(c);
    };
    res.send = (body, status = 200, type = 'text/html; charset=utf-8', extra = {}) => {
      if (res.writableEnded || res.headersSent) return;
      for (const fn of app.beforeSend) fn(req, res);
      if (body instanceof Raw) body = body.s;
      let buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body == null ? '' : body));
      const headers = { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', ...extra };
      if (res.cookies.length) headers['Set-Cookie'] = res.cookies;
      if (buf.length > 1024 && /text|json|javascript|svg/.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
        buf = zlib.gzipSync(buf); headers['Content-Encoding'] = 'gzip'; headers.Vary = 'Accept-Encoding';
      }
      headers['Content-Length'] = buf.length;
      res.writeHead(status, headers);
      res.end(req.method === 'HEAD' ? undefined : buf);
    };
    res.html = (body, status = 200) => res.send(body, status, 'text/html; charset=utf-8', { 'X-Frame-Options': 'SAMEORIGIN', 'Cache-Control': 'no-store' });
    res.json = (obj, status = 200) => res.send(JSON.stringify(obj), status, 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });
    res.redirect = (loc, status = 303) => res.send('', status, 'text/plain', { Location: loc });
    res.download = (content, filename, type) => res.send(content, 200, type, { 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' });
  }

  serveStatic(req, res) {
    for (const s of this.statics) {
      if (!req.path.startsWith(s.prefix + '/')) continue;
      const file = path.resolve(s.dir, '.' + req.path.slice(s.prefix.length));
      if (!file.startsWith(s.dir + path.sep)) return false;
      let st; try { st = fs.statSync(file); } catch { return false; }
      if (!st.isFile()) return false;
      const etag = `W/"${st.size.toString(16)}-${st.mtimeMs.toString(16)}"`;
      const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      const headers = { ETag: etag, 'Cache-Control': `public, max-age=${s.maxAge}`, 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' };
      if (type === 'image/svg+xml') headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'";
      if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return true; }
      let buf = fs.readFileSync(file);
      if (buf.length > 1024 && /text|javascript|svg/.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
        buf = zlib.gzipSync(buf); headers['Content-Encoding'] = 'gzip'; headers.Vary = 'Accept-Encoding';
      }
      headers['Content-Length'] = buf.length;
      res.writeHead(200, headers); res.end(req.method === 'HEAD' ? undefined : buf);
      return true;
    }
    return false;
  }

  async handle(req, res) {
    try {
      this.augment(req, res);
      const method = req.method === 'HEAD' ? 'GET' : req.method;
      if (method === 'GET' && this.serveStatic(req, res)) return;
      if (method === 'POST') {
        const buf = await readBody(req);
        const ct = req.headers['content-type'] || '';
        if (ct.startsWith('application/x-www-form-urlencoded')) {
          for (const [k, v] of new URLSearchParams(buf.toString('utf8'))) addField(req.body, k, v);
        } else if (ct.startsWith('application/json')) {
          try { req.body = JSON.parse(buf.toString('utf8') || '{}'); } catch { req.body = {}; }
        } else if (ct.startsWith('multipart/form-data')) {
          const b = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(ct);
          if (b) { const r = parseMultipart(buf, b[1] || b[2]); req.body = r.fields; req.files = r.files; }
        }
      }
      for (const fn of this.mw) { await fn(req, res); if (res.writableEnded) return; }
      for (const r of this.routes) {
        if (r.method !== method) continue;
        const m = r.re.exec(req.path);
        if (!m) continue;
        req.params = {};
        r.keys.forEach((k, i) => { req.params[k] = m[i + 1]; });
        for (const h of r.handlers) { await h(req, res); if (res.writableEnded) return; }
        if (res.writableEnded) return;
      }
      if (this.notFound) return this.notFound(req, res);
      res.send('Nie znaleziono', 404, 'text/plain; charset=utf-8');
    } catch (err) {
      if (!err.status || err.status >= 500) console.error(err);
      if (res.headersSent) { try { res.end(); } catch { /* */ } return; }
      if (this.onError) return this.onError(err, req, res);
      res.send('Błąd serwera', err.status || 500, 'text/plain; charset=utf-8');
    }
  }

  listen(port, cb) {
    const server = http.createServer((req, res) => this.handle(req, res));
    server.listen(port, cb);
    return server;
  }
}

module.exports = { App };
