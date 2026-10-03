'use strict';
/* Generator ilustracji produktów testowych (SVG, izometria). */
const { esc } = require('./util');

function rng(seed) {
  let h = 2166136261;
  for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, '0')).join('');
}
const pts = (arr) => arr.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');

function isoBox(w, d, h, color, extra = () => '') {
  const a = Math.cos(Math.PI / 6), b = 0.5;
  const minX = -d * a, maxX = w * a, minY = -h, maxY = (w + d) * b;
  const cx = 300 - (minX + maxX) / 2, cy = 270 - (minY + maxY) / 2;
  const p = (x, y, z) => [cx + (x - y) * a, cy + (x + y) * b - z];
  const top = [p(0, 0, h), p(w, 0, h), p(w, d, h), p(0, d, h)];
  const right = [p(w, 0, h), p(w, d, h), p(w, d, 0), p(w, 0, 0)];
  const left = [p(0, d, h), p(w, d, h), p(w, d, 0), p(0, d, 0)];
  const shadow = `<ellipse cx="${(cx + (w - d) * a / 2).toFixed(1)}" cy="${(cy + (w + d) * b + 18).toFixed(1)}" rx="${((w + d) * a / 1.7).toFixed(1)}" ry="22" fill="#000" opacity=".08"/>`;
  return shadow +
    `<polygon points="${pts(left)}" fill="${shade(color, -0.22)}"/>` +
    `<polygon points="${pts(right)}" fill="${shade(color, -0.1)}"/>` +
    `<polygon points="${pts(top)}" fill="${color}"/>` + extra(p, w, d, h);
}

const SHAPES = {
  board(color, r) {
    return isoBox(300, 190, 18, color, (p, w, d, h) => {
      if (!/^#d|^#c/i.test(color)) return '';
      let s = '';
      for (let i = 0; i < 70; i++) {
        const x = 12 + r() * (w - 40), y = 8 + r() * (d - 24), l = 10 + r() * 24;
        const [x1, y1] = p(x, y, h), [x2, y2] = p(x + l, y + r() * 6, h);
        s += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${shade(color, r() > 0.5 ? -0.25 : 0.25)}" stroke-width="${(2 + r() * 4).toFixed(1)}" stroke-linecap="round" opacity=".75"/>`;
      }
      return s;
    }) + isoBoxStack(color);
  },
  block(color) {
    return isoBox(170, 110, 120, color, (p, w, d, h) => {
      let s = '';
      for (const fx of [0.25, 0.75]) {
        const c = [p(w * fx - 22, d * 0.3, h), p(w * fx + 22, d * 0.3, h), p(w * fx + 22, d * 0.7, h), p(w * fx - 22, d * 0.7, h)];
        s += `<polygon points="${pts(c)}" fill="${shade(color, -0.35)}"/>`;
      }
      return s;
    });
  },
  beam(color, r) {
    return isoBox(380, 60, 60, color, (p, w, d, h) => {
      let s = '';
      for (let i = 0; i < 6; i++) {
        const y = 8 + i * 9;
        const [x1, y1] = p(10 + r() * 30, y, h), [x2, y2] = p(w - 10 - r() * 30, y + 2, h);
        s += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${shade(color, -0.2)}" stroke-width="1.5" opacity=".7"/>`;
      }
      return s;
    });
  },
  pack(color) {
    return isoBox(230, 150, 150, color, (p, w, d, h) => {
      const band = [p(w * 0.45, 0, h), p(w * 0.58, 0, h), p(w * 0.58, d, h), p(w * 0.45, d, h)];
      const bandL = [p(w * 0.45, d, h), p(w * 0.58, d, h), p(w * 0.58, d, 0), p(w * 0.45, d, 0)];
      return `<polygon points="${pts(band)}" fill="#e30613" opacity=".85"/><polygon points="${pts(bandL)}" fill="#b5000f" opacity=".85"/>`;
    });
  },
  bag(color) {
    const dark = shade(color, -0.2);
    return `<ellipse cx="300" cy="455" rx="150" ry="22" fill="#000" opacity=".08"/>
<path d="M175 120 Q300 95 425 120 L445 430 Q300 470 155 430 Z" fill="${color}"/>
<path d="M175 120 Q300 95 425 120 L428 160 Q300 140 172 160 Z" fill="${dark}"/>
<path d="M162 250 Q300 230 438 250 L441 340 Q300 322 159 340 Z" fill="#e30613"/>
<text x="300" y="305" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="40" font-weight="800" fill="#fff">25 kg</text>
<path d="M175 120 L155 430" stroke="${dark}" stroke-width="4" opacity=".4"/>`;
  },
  roll(color) {
    const dark = shade(color, -0.2), light = shade(color, 0.25);
    return `<ellipse cx="300" cy="445" rx="140" ry="24" fill="#000" opacity=".08"/>
<rect x="185" y="130" width="230" height="300" fill="${color}"/>
<ellipse cx="300" cy="430" rx="115" ry="34" fill="${dark}"/>
<rect x="185" y="130" width="230" height="300" fill="${color}"/>
<path d="M185 130 v300" stroke="${dark}" stroke-width="6"/><path d="M415 130 v300" stroke="${dark}" stroke-width="6"/>
<rect x="185" y="250" width="230" height="60" fill="#e30613" opacity=".9"/>
<ellipse cx="300" cy="130" rx="115" ry="34" fill="${light}"/>
<ellipse cx="300" cy="130" rx="70" ry="20" fill="none" stroke="${dark}" stroke-width="3"/>
<ellipse cx="300" cy="130" rx="32" ry="9" fill="${dark}"/>`;
  },
  bucket(color) {
    const dark = shade(color, -0.2);
    return `<ellipse cx="300" cy="450" rx="140" ry="22" fill="#000" opacity=".08"/>
<path d="M190 170 Q300 120 410 170" fill="none" stroke="#555" stroke-width="7"/>
<path d="M180 175 L210 435 Q300 460 390 435 L420 175 Z" fill="${color}"/>
<ellipse cx="300" cy="175" rx="120" ry="28" fill="${dark}"/>
<ellipse cx="300" cy="172" rx="108" ry="22" fill="${shade(color, 0.3)}"/>
<rect x="196" y="260" width="208" height="80" fill="#e30613" transform="skewY(0)"/>
<text x="300" y="312" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="30" font-weight="800" fill="#fff">PSB</text>`;
  },
  tube(color) {
    return `<ellipse cx="300" cy="455" rx="90" ry="16" fill="#000" opacity=".08"/>
<rect x="245" y="160" width="110" height="290" rx="14" fill="${color}"/>
<rect x="245" y="250" width="110" height="110" fill="#e30613"/>
<path d="M270 160 L300 70 L330 160 Z" fill="${shade(color, -0.25)}"/>
<rect x="245" y="420" width="110" height="30" rx="6" fill="${shade(color, -0.15)}"/>`;
  },
  tool(color) {
    return `<ellipse cx="300" cy="440" rx="200" ry="20" fill="#000" opacity=".08"/>
<rect x="90" y="250" width="420" height="70" rx="10" fill="${color}"/>
<rect x="90" y="250" width="420" height="16" rx="8" fill="${shade(color, 0.3)}"/>
<rect x="255" y="262" width="90" height="46" rx="8" fill="#fff" stroke="#333" stroke-width="3"/>
<ellipse cx="300" cy="285" rx="22" ry="12" fill="#7ed957" stroke="#333" stroke-width="2"/>
<line x1="300" y1="266" x2="300" y2="304" stroke="#333" stroke-width="2"/>
<rect x="130" y="270" width="60" height="30" rx="15" fill="${shade(color, -0.3)}"/>
<rect x="410" y="270" width="60" height="30" rx="15" fill="${shade(color, -0.3)}"/>`;
  },
  barrow(color) {
    return `<ellipse cx="300" cy="455" rx="210" ry="20" fill="#000" opacity=".08"/>
<path d="M120 200 L470 200 L420 330 L180 330 Z" fill="${color}"/>
<path d="M120 200 L470 200 L462 222 L128 222 Z" fill="${shade(color, -0.2)}"/>
<path d="M420 330 L520 250" stroke="#555" stroke-width="10" stroke-linecap="round"/>
<path d="M200 330 L230 430 M380 330 L350 430" stroke="#555" stroke-width="10" stroke-linecap="round"/>
<circle cx="170" cy="400" r="46" fill="#222"/><circle cx="170" cy="400" r="18" fill="#888"/>
<path d="M170 400 L240 330" stroke="#555" stroke-width="10"/>`;
  },
  hardware(color) {
    return isoBox(200, 140, 110, '#e9d7b6', (p, w, d, h) => {
      const lbl = [p(w * 0.2, d, h * 0.75), p(w * 0.8, d, h * 0.75), p(w * 0.8, d, h * 0.25), p(w * 0.2, d, h * 0.25)];
      return `<polygon points="${pts(lbl)}" fill="${color}"/>`;
    }) + `<g transform="translate(410 120) rotate(35)"><rect x="-8" y="0" width="16" height="120" rx="3" fill="#9aa0a6"/><rect x="-20" y="-14" width="40" height="18" rx="4" fill="#80868b"/>${Array.from({ length: 9 }, (_, i) => `<line x1="-9" y1="${14 + i * 11}" x2="9" y2="${20 + i * 11}" stroke="#5f6368" stroke-width="3"/>`).join('')}</g>`;
  },
};
function isoBoxStack() { return ''; }

function productSvg(shape, color, label) {
  const r = rng(label + shape);
  const body = (SHAPES[shape] || SHAPES.pack)(color, r);
  const short = String(label).length > 34 ? String(label).slice(0, 33) + '…' : String(label);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#f1f2f4"/></linearGradient></defs>
<rect width="600" height="600" fill="url(#bg)"/>
<circle cx="520" cy="80" r="160" fill="#e30613" opacity=".05"/>
${body}
<rect x="0" y="530" width="600" height="70" fill="#fff"/>
<rect x="0" y="530" width="8" height="70" fill="#e30613"/>
<text x="30" y="574" font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="700" fill="#222">${esc(short)}</text>
<text x="570" y="40" text-anchor="end" font-family="Arial,Helvetica,sans-serif" font-size="16" font-weight="700" fill="#e30613" opacity=".7">ZDJĘCIE POGLĄDOWE</text>
</svg>`;
}

module.exports = { productSvg };
