// Utilidades matemáticas e de geração procedural
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const inv = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const dist2 = (x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; };
export const dist = (x1, y1, x2, y2) => Math.sqrt(dist2(x1, y1, x2, y2));
export const angleTo = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1);
export const normAngle = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
export const angleDiff = (a, b) => normAngle(b - a);
export const angleLerp = (a, b, t) => a + normAngle(b - a) * t;
export const smooth = t => t * t * (3 - 2 * t);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}

export function noise2(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = smooth(x - xi), yf = smooth(y - yi);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, xf), lerp(c, d, xf), yf);
}

export function fbm(x, y, seed, octaves = 4) {
  let v = 0, amp = 0.5, f = 1, total = 0;
  for (let i = 0; i < octaves; i++) {
    v += noise2(x * f, y * f, seed + i * 97) * amp;
    total += amp; amp *= 0.5; f *= 2;
  }
  return v / total;
}

export function choose(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
export function randRange(rng, a, b) { return a + rng() * (b - a); }
export function randInt(rng, a, b) { return Math.floor(a + rng() * (b - a + 1)); }
export function chance(rng, p) { return rng() < p; }
export function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function pickWeighted(rng, entries) {
  let total = 0; for (const e of entries) total += e[1];
  let r = rng() * total;
  for (const e of entries) { r -= e[1]; if (r <= 0) return e[0]; }
  return entries[entries.length - 1][0];
}

export function pad2(n) { return String(Math.floor(n)).padStart(2, '0'); }

export function formatClock(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(Math.floor(m % 60))}`;
}

export function isNight(minutes) {
  const h = ((minutes % 1440) + 1440) % 1440 / 60;
  return h < 6 || h >= 20;
}

export function uid(prefix = 'e') {
  return prefix + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
}

export function b64FromBytes(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function bytesFromB64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function segIntersectsRect(x1, y1, x2, y2, rx, ry, rw, rh) {
  // Liang-Barsky
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - rx, rx + rw - x1, y1 - ry, ry + rh - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; }
    else {
      const r = q[i] / p[i];
      if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
  }
  return true;
}

export function roman(n) { return ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] || n; }
