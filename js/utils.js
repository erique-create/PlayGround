// Small shared helpers. Everything here is dependency-free.
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
export const dist2 = (x1, y1, x2, y2) => (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
export const angleDiff = (a, b) => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export class RNG {
  constructor(seed) { this.s = (seed >>> 0) || 1; }
  next() {
    let t = this.s += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  float(a = 0, b = 1) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.float(a, b + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  weighted(entries) {
    let total = 0;
    for (const e of entries) total += e.w || 1;
    let r = this.next() * total;
    for (const e of entries) {
      r -= e.w || 1;
      if (r <= 0) return e;
    }
    return entries[entries.length - 1];
  }
}

export function hash2(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const TW = 64;
export const TH = 32;
export const HALF_W = TW / 2;
export const HALF_H = TH / 2;

// Continuous world coords -> screen coords (top corner of the tile lattice).
export const isoX = (x, y) => (x - y) * HALF_W;
export const isoY = (x, y) => (x + y) * HALF_H;
export const screenToWorldDir = (sx, sy) => {
  const x = sx / (2 * HALF_W) + sy / (2 * HALF_H);
  const y = sy / (2 * HALF_H) - sx / (2 * HALF_W);
  return { x, y };
};

export function lineOfSight(solid, w, h, x0, y0, x1, y1) {
  let ax = Math.floor(x0), ay = Math.floor(y0);
  const bx = Math.floor(x1), by = Math.floor(y1);
  const dx = Math.abs(bx - ax), dy = Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1;
  let err = dx - dy, guard = 0;
  while (guard++ < 200) {
    if (ax === bx && ay === by) return true;
    const e2 = err * 2;
    if (e2 > -dy) { err -= dy; ax += sx; }
    if (e2 < dx) { err += dx; ay += sy; }
    if (ax < 0 || ay < 0 || ax >= w || ay >= h) return false;
    if (ax === bx && ay === by) return true;
    if (solid[ay * w + ax]) return false;
  }
  return false;
}

export function formatClock(hour, day) {
  const hh = Math.floor(hour) % 24;
  const mm = Math.floor((hour % 1) * 60);
  return { time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, day };
}

export function timeOfDayName(hour) {
  if (hour < 5) return 'Night';
  if (hour < 8) return 'Dawn';
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  if (hour < 20) return 'Dusk';
  return 'Night';
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(node) {
    const a = this.a;
    a.push(node);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

// A* on the tile grid. Returns world-space waypoints.
export function findPath(world, sx, sy, tx, ty, maxNodes = 700) {
  const W = world.size;
  const solid = world.solid;
  let ax = Math.floor(sx), ay = Math.floor(sy);
  let bx = Math.floor(tx), by = Math.floor(ty);
  bx = clamp(bx, 0, W - 1); by = clamp(by, 0, W - 1);
  if (ax < 0 || ay < 0 || ax >= W || ay >= W) return null;
  const start = ay * W + ax, goal = by * W + bx;
  if (start === goal) return [{ x: tx, y: ty }];
  if (solid[goal]) {
    // find closest open neighbour
    let best = null, bd = 1e9;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const nx = bx + ox, ny = by + oy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= W || solid[ny * W + nx]) continue;
      const d = (nx - bx) ** 2 + (ny - by) ** 2;
      if (d < bd) { bd = d; best = ny * W + nx; }
    }
    if (best == null) return null;
    return findPath(world, sx, sy, best % W, Math.floor(best / W), maxNodes);
  }
  const open = new MinHeap();
  const came = new Map();
  const g = new Map();
  const closed = new Set();
  g.set(start, 0);
  open.push({ i: start, f: 0 });
  const heuristic = (i) => {
    const x = i % W, y = (i / W) | 0;
    const dx = Math.abs(x - bx), dy = Math.abs(y - by);
    return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };
  let nodes = 0;
  while (open.size && nodes++ < maxNodes) {
    const cur = open.pop();
    const ci = cur.i;
    if (closed.has(ci)) continue;
    if (ci === goal) {
      const path = [];
      let k = ci;
      while (k !== start) {
        const px = k % W, py = (k / W) | 0;
        path.push({ x: px + 0.5, y: py + 0.5 });
        k = came.get(k);
        if (k == null) break;
      }
      path.reverse();
      if (path.length) path[path.length - 1] = { x: tx, y: ty };
      return path;
    }
    closed.add(ci);
    const cx = ci % W, cy = (ci / W) | 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oy) continue;
      const nx = cx + ox, ny = cy + oy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue;
      const ni = ny * W + nx;
      if (closed.has(ni) || solid[ni]) continue;
      if (ox && oy && (solid[cy * W + nx] || solid[ny * W + cx])) continue;
      const ng = g.get(ci) + (ox && oy ? Math.SQRT2 : 1);
      if (ng >= (g.get(ni) ?? 1e9)) continue;
      g.set(ni, ng);
      came.set(ni, ci);
      open.push({ i: ni, f: ng + heuristic(ni) });
    }
  }
  return null;
}
