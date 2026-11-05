import { TW, TH, HALF_W, HALF_H, isoX, isoY, clamp, lerp, smoothstep, hash2 } from './utils.js';
import { T } from './world.js';

const CHUNK = 8;
const CACHE_LIMIT = 44;
const PAD = 52;

const GRASS = ['#3c4a34', '#41503a', '#37452f', '#45533b', '#3b4935'];
const DIRT = ['#514734', '#584d39', '#4a412f', '#5b513c'];
const ASPHALT = ['#393d3c', '#343837', '#3d4140', '#383b3a'];
const SIDEWALK = ['#5a5b51', '#606157', '#55564c'];
const WOODF = ['#5c4934', '#634f39', '#574531'];
const TILEF = ['#55574e', '#5b5d54', '#50524a'];
const SAND = ['#84775b', '#8d8062', '#7b6f55'];
const CONCRETE = ['#4e4f4a', '#555650', '#494a45'];
const FARM = ['#4c5530', '#525b34', '#46502d'];
const WATER = ['#263f49', '#2a4550', '#223943'];

const ZED_SHIRTS = ['#5a5a48', '#4c5550', '#5e4b46', '#454f56', '#625a43', '#51453f'];
const ZED_PANTS = ['#3b3f3a', '#45443a', '#353b40', '#4a4137'];

function hexShade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = clamp(Math.round(r + amt), 0, 255);
  g = clamp(Math.round(g + amt), 0, 255);
  b = clamp(Math.round(b + amt), 0, 255);
  return `rgb(${r},${g},${b})`;
}
const pick = (arr, x, y, s = 0) => arr[Math.floor(rand(x, y, s) * arr.length) % arr.length];
const rand = (x, y, s = 0) => hash2(x, y, s);

function diamondPath(ctx, sx, sy, w = TW, h = TH) {
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + w / 2, sy + h / 2);
  ctx.lineTo(sx, sy + h);
  ctx.lineTo(sx - w / 2, sy + h / 2);
  ctx.closePath();
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.game = game;
    this.chunks = new Map();
    this.cam = { px: 0, py: 0 };
    this.zoom = 1;
    this.w = 1; this.h = 1; this.dpr = 1;
    this.overlay = document.createElement('canvas');
    this.octx = this.overlay.getContext('2d');
    this.rain = [];
    this.minimapCache = { t: 0, fogKey: -1 };
    this.fogCanvas = null;
    this.time = 0;
    this.lastMapTransform = null;
    this.snapCamera = true;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  applyQuality() {
    const q = this.game.settings?.quality || 'auto';
    if (q === 'low') {
      this.qualityCap = 1;
      this.lowDetail = true;
    } else if (q === 'high') {
      this.qualityCap = 2;
      this.lowDetail = false;
    } else {
      this.qualityCap = this.game.isTouch ? 1.5 : 2;
      this.lowDetail = false;
    }
    this.rain = [];
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.w = w; this.h = h;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.qualityCap || 2);
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.overlay.width = Math.max(1, Math.floor(w * 0.75));
    this.overlay.height = Math.max(1, Math.floor(h * 0.75));
    this.zoom = clamp(Math.min(w / 1280, h / 760) * 1.1, 0.62, 1.22);
    if (w < 700) this.zoom = clamp(w / 610, 0.6, 0.82);
  }

  ground(x, y) { return { x: isoX(x, y), y: isoY(x, y) }; }

  screen(x, y) {
    const g = this.ground(x, y);
    return {
      x: (g.x - this.cam.px) * this.zoom + this.w / 2,
      y: (g.y - this.cam.py) * this.zoom + this.h / 2,
    };
  }

  screenToWorld(sx, sy) {
    const wx = (sx - this.w / 2) / this.zoom + this.cam.px;
    const wy = (sy - this.h / 2) / this.zoom + this.cam.py;
    return {
      x: wx / (2 * HALF_W) + wy / (2 * HALF_H),
      y: wy / (2 * HALF_H) - wx / (2 * HALF_W),
    };
  }

  worldToTile(sx, sy) { return this.screenToWorld(sx, sy); }

  updateCamera(dt) {
    const p = this.game.player;
    if (!p) return;
    const target = this.ground(p.x, p.y);
    if (this.snapCamera) {
      this.cam.px = target.x; this.cam.py = target.y;
      this.snapCamera = false;
    } else {
      const k = 1 - Math.pow(0.002, dt);
      this.cam.px = lerp(this.cam.px, target.x, k);
      this.cam.py = lerp(this.cam.py, target.y, k);
    }
  }

  render(dt) {
    this.time += dt;
    const ctx = this.ctx;
    const g = this.game;
    this.updateCamera(dt);
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#131a16';
    ctx.fillRect(0, 0, this.w, this.h);

    const shake = g.shake || 0;
    const shx = shake ? Math.sin(this.time * 93) * shake * 9 : 0;
    const shy = shake ? Math.cos(this.time * 71) * shake * 7 : 0;
    ctx.save();
    ctx.translate(this.w / 2 + shx, this.h / 2 + shy);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.cam.px, -this.cam.py);

    this.drawTerrain(ctx);
    this.drawGroundDecals(ctx);
    this.drawWaterShimmer(ctx);

    const drawables = [];
    this.collectWorldDrawables(drawables);
    this.drawShadows(ctx, drawables);
    drawables.sort((a, b) => a.depth - b.depth);
    for (const d of drawables) this.drawThing(ctx, d);

    this.drawEffects(ctx);
    this.drawParticles(ctx);
    this.drawBuildGhost(ctx);
    this.drawBuildingLabels(ctx);
    this.drawAim(ctx);
    ctx.restore();

    this.drawLighting(ctx);
    this.drawWeather(ctx, dt);
    this.drawGlows(ctx);
    this.drawScreenFx(ctx);
  }

  // ---------------------------------------------------------------- terrain
  terrainColor(t, x, y) {
    switch (t) {
      case T.GRASS: return pick(GRASS, x, y, 1);
      case T.DIRT: return pick(DIRT, x, y, 2);
      case T.ASPHALT: return pick(ASPHALT, x, y, 3);
      case T.SIDEWALK: return pick(SIDEWALK, x, y, 4);
      case T.WOOD: return pick(WOODF, x, y, 5);
      case T.TILE: return pick(TILEF, x, y, 6);
      case T.WATER: return pick(WATER, x, y, 7);
      case T.SAND: return pick(SAND, x, y, 8);
      case T.FARM: return pick(FARM, x, y, 9);
      case T.CONCRETE: return pick(CONCRETE, x, y, 10);
      default: return '#3c4a34';
    }
  }

  getChunk(cx, cy) {
    const key = cx + ',' + cy;
    let c = this.chunks.get(key);
    if (c) { c.used = this.time; return c; }
    c = this.buildChunk(cx, cy);
    c.used = this.time;
    this.chunks.set(key, c);
    if (this.chunks.size > CACHE_LIMIT) {
      let oldestKey = null, oldest = Infinity;
      for (const [k, v] of this.chunks) if (v.used < oldest) { oldest = v.used; oldestKey = k; }
      if (oldestKey) this.chunks.delete(oldestKey);
    }
    return c;
  }

  buildChunk(cx, cy) {
    const world = this.game.world;
    const c = document.createElement('canvas');
    c.width = CHUNK * TW + PAD * 2;
    c.height = CHUNK * TH + PAD * 2;
    const ctx = c.getContext('2d');
    ctx.textAlign = 'center';
    const ox = isoX(cx * CHUNK, cy * CHUNK);
    const oy = isoY(cx * CHUNK, cy * CHUNK);
    // The first tile of a chunk is the north corner of the iso diamond. Its
    // center sits half a chunk width in from the left and half a tile down
    // from the top, so leave room for the tiles that extend up-left.
    const baseX = PAD + (CHUNK * TW) / 2;
    const baseY = PAD + TH / 2;
    for (let ty = cy * CHUNK; ty < (cy + 1) * CHUNK; ty++) {
      for (let tx = cx * CHUNK; tx < (cx + 1) * CHUNK; tx++) {
        if (!world.inBounds(tx, ty)) continue;
        const t = world.terrainAt(tx, ty);
        const sx = isoX(tx, ty) - ox + baseX;
        const sy = isoY(tx, ty) - oy + baseY;
        const col = this.terrainColor(t, tx, ty);
        diamondPath(ctx, sx, sy + 1);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.stroke();
        this.tileDetail(ctx, tx, ty, t, sx, sy, col);
        this.tileMarking(ctx, tx, ty, sx, sy);
      }
    }
    return { canvas: c, ox, oy, px: baseX, py: baseY, used: this.time };
  }

  tileDetail(ctx, tx, ty, t, sx, sy, col) {
    const h = rand(tx, ty, 11);
    const cx = sx, cy = sy + TH / 2;
    if (t === T.GRASS) {
      for (let i = 0; i < 2; i++) {
        const r1 = rand(tx, ty, 20 + i), r2 = rand(tx, ty, 30 + i);
        const px = cx + (r1 - 0.5) * 40, py = cy + (r2 - 0.5) * 18;
        ctx.fillStyle = r1 > 0.5 ? 'rgba(110,130,82,0.28)' : 'rgba(28,38,24,0.32)';
        ctx.fillRect(px, py, 2, 1.5);
      }
      if (h > 0.94) {
        ctx.fillStyle = 'rgba(194,168,96,0.35)';
        ctx.fillRect(cx - 2, cy - 1, 2, 2);
      }
    } else if (t === T.DIRT) {
      ctx.fillStyle = 'rgba(35,30,22,0.3)';
      for (let i = 0; i < 2; i++) {
        const px = cx + (rand(tx, ty, 40 + i) - 0.5) * 34, py = cy + (rand(tx, ty, 50 + i) - 0.5) * 14;
        ctx.fillRect(px, py, 2.5, 2);
      }
    } else if (t === T.ASPHALT) {
      if (h > 0.82) {
        ctx.strokeStyle = 'rgba(15,17,17,0.33)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 12, cy - 4);
        ctx.lineTo(cx + 4, cy + 3);
        ctx.lineTo(cx + 9, cy + 1);
        ctx.stroke();
      }
      if (h < 0.1) {
        ctx.fillStyle = 'rgba(120,115,95,0.16)';
        ctx.fillRect(cx - 3, cy - 2, 5, 4);
      }
    } else if (t === T.SIDEWALK) {
      ctx.strokeStyle = 'rgba(40,40,35,0.36)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 16, cy - 8); ctx.lineTo(cx + 16, cy + 8);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(40,40,35,0.2)';
      ctx.beginPath();
      ctx.moveTo(cx + 16, cy - 8); ctx.lineTo(cx - 16, cy + 8);
      ctx.stroke();
    } else if (t === T.WOOD) {
      ctx.strokeStyle = 'rgba(36,27,18,0.45)';
      ctx.lineWidth = 1;
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.moveTo(cx - 26, cy + 4 + k * 6);
        ctx.lineTo(cx + 26, cy - 8 + k * 6);
        ctx.stroke();
      }
    } else if (t === T.TILE) {
      ctx.strokeStyle = 'rgba(25,27,25,0.36)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 18, cy - 9); ctx.lineTo(cx + 18, cy + 9);
      ctx.moveTo(cx + 18, cy - 9); ctx.lineTo(cx - 18, cy + 9);
      ctx.stroke();
      if (h > 0.8) {
        ctx.fillStyle = 'rgba(40,44,38,0.28)';
        ctx.fillRect(cx + (h - 0.8) * 80, cy - 2, 3, 3);
      }
    } else if (t === T.WATER) {
      ctx.strokeStyle = 'rgba(145,180,176,0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 16, cy + 2);
      ctx.quadraticCurveTo(cx, cy - 3, cx + 16, cy + 1);
      ctx.stroke();
    } else if (t === T.SAND) {
      ctx.fillStyle = 'rgba(60,52,38,0.22)';
      ctx.fillRect(cx - 6, cy - 3, 2, 1.5);
    } else if (t === T.FARM) {
      ctx.strokeStyle = 'rgba(40,42,24,0.4)';
      ctx.lineWidth = 1;
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.moveTo(cx - 24, cy + 2 + k * 5);
        ctx.lineTo(cx + 24, cy - 10 + k * 5);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(124,145,74,0.55)';
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(cx - 16 + i * 12, cy - 4 + (i % 2) * 3, 2, 2);
      }
    } else if (t === T.CONCRETE) {
      ctx.fillStyle = 'rgba(30,32,30,0.28)';
      if (h > 0.7) ctx.fillRect(cx + (h - 0.7) * 40, cy, 3, 2);
      ctx.strokeStyle = 'rgba(30,32,30,0.24)';
      ctx.beginPath();
      ctx.moveTo(cx - 20, cy - 2 + h * 8);
      ctx.lineTo(cx + 20, cy + 8);
      ctx.stroke();
    }
  }

  tileMarking(ctx, tx, ty, sx, sy) {
    const line = this.game.world.roadLine[ty * this.game.world.size + tx];
    if (!line) return;
    if ((tx + ty) % 2 !== 0) return;
    const cx = sx, cy = sy + TH / 2;
    ctx.strokeStyle = line === 2 ? 'rgba(218,202,150,0.42)' : 'rgba(218,202,150,0.42)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (line === 1) {
      ctx.moveTo(cx - 10, cy - 5);
      ctx.lineTo(cx + 10, cy + 5);
    } else {
      ctx.moveTo(cx + 10, cy + 5);
      ctx.lineTo(cx - 10, cy - 5);
    }
    ctx.stroke();
  }

  drawTerrain(ctx) {
    const world = this.game.world;
    const cx = Math.floor(this.game.player.x / CHUNK);
    const cy = Math.floor(this.game.player.y / CHUNK);
    // Chunks are wide iso diamonds. Expand the grid enough to cover the
    // viewport, then cull chunks that fall outside the visible rectangle.
    const halfW = this.w / 2 / this.zoom;
    const halfH = this.h / 2 / this.zoom;
    const rx = Math.ceil(halfW / (CHUNK * TW / 2)) + 1;
    const ry = Math.ceil(halfH / (CHUNK * TH)) + 1;
    const baseX = PAD + (CHUNK * TW) / 2;
    const baseY = PAD + TH / 2;
    const sw = (CHUNK * TW + PAD * 2) * this.zoom;
    const sh = (CHUNK * TH + PAD * 2) * this.zoom;
    for (let y = cy - ry; y <= cy + ry; y++) {
      for (let x = cx - rx; x <= cx + rx; x++) {
        if (x < 0 || y < 0 || x * CHUNK >= world.size || y * CHUNK >= world.size) continue;
        // Cull before asking for the chunk so off-screen chunks are never
        // built (and never evict the visible set from the cache).
        const ox = isoX(x * CHUNK, y * CHUNK);
        const oy = isoY(x * CHUNK, y * CHUNK);
        const sx = (ox - baseX - this.cam.px) * this.zoom + this.w / 2;
        const sy = (oy - baseY - this.cam.py) * this.zoom + this.h / 2;
        if (sx > this.w + 8 || sy > this.h + 8 || sx + sw < -8 || sy + sh < -8) continue;
        const c = this.getChunk(x, y);
        ctx.drawImage(c.canvas, c.ox - c.px, c.oy - c.py);
      }
    }
  }

  drawWaterShimmer(ctx) {
    const world = this.game.world;
    const p = this.game.player;
    const t = this.time;
    const x0 = Math.floor(p.x) - 12, x1 = Math.floor(p.x) + 12;
    const y0 = Math.floor(p.y) - 12, y1 = Math.floor(p.y) + 12;
    for (let y = Math.max(0, y0); y <= Math.min(world.size - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(world.size - 1, x1); x++) {
        if (world.terrainAt(x, y) !== T.WATER) continue;
        const phase = Math.sin(t * 0.8 + rand(x, y, 99) * 6.28);
        if (phase < 0.55) continue;
        const sx = isoX(x, y) + (rand(x, y, 2) - 0.5) * 30;
        const sy = isoY(x, y) + TH / 2 + (rand(x, y, 3) - 0.5) * 10;
        ctx.strokeStyle = `rgba(160,196,190,${0.05 + phase * 0.12})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(sx - 7, sy);
        ctx.lineTo(sx + 7, sy);
        ctx.stroke();
      }
    }
  }

  drawGroundDecals(ctx) {
    const g = this.game;
    for (const d of g.decals) {
      const p = this.ground(d.x, d.y);
      if (d.type === 'blood') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(1, 0.5);
        ctx.fillStyle = `rgba(72,18,18,${0.28 * (d.alpha ?? 1)})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, d.size, d.size, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(52,12,12,${0.28 * (d.alpha ?? 1)})`;
        ctx.beginPath();
        ctx.ellipse(d.size * 0.45, d.size * 0.2, d.size * 0.4, d.size * 0.4, 0, 0, 6.3);
        ctx.fill();
        ctx.restore();
      } else if (d.type === 'corpse') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(d.rot || 0);
        ctx.scale(1, 0.52);
        ctx.fillStyle = 'rgba(28,30,26,0.55)';
        ctx.beginPath(); ctx.ellipse(0, 4, 14, 8, 0, 0, 6.3); ctx.fill();
        ctx.fillStyle = d.color || '#586050';
        ctx.beginPath(); ctx.ellipse(0, 0, 11, 5, 0.2, 0, 6.3); ctx.fill();
        ctx.fillStyle = '#8a957c';
        ctx.beginPath(); ctx.arc(10, -2, 4, 0, 6.3); ctx.fill();
        ctx.restore();
      }
    }
  }

  drawShadows(ctx, list) {
    ctx.fillStyle = 'rgba(8,12,9,0.26)';
    for (const d of list) {
      if (!d.shadow) continue;
      const p = this.ground(d.x, d.y);
      ctx.beginPath();
      ctx.ellipse(p.x + 3, p.y + 2, d.shadow, d.shadow * 0.42, 0, 0, 6.3);
      ctx.fill();
    }
  }

  // -------------------------------------------------------------- drawing
  collectWorldDrawables(list) {
    const g = this.game;
    const world = g.world;
    const p = g.player;
    const viewRadius = 34;
    const minX = Math.max(0, Math.floor(p.x) - viewRadius);
    const maxX = Math.min(world.size - 1, Math.floor(p.x) + viewRadius);
    const minY = Math.max(0, Math.floor(p.y) - viewRadius);
    const maxY = Math.min(world.size - 1, Math.floor(p.y) + viewRadius);
    const playerBuilding = world.buildingInside(p.x, p.y);
    this.playerBuilding = playerBuilding;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const wv = world.wall[y * world.size + x];
        if (!wv) continue;
        const b = world.wallOwner ? world.buildings[world.wallOwner[y * world.size + x]] : null;
        list.push({
          kind: 'wall', x: x + 0.5, y: y + 0.5, tx: x, ty: y, wv, depth: x + y + 1.1,
          owner: b, fade: playerBuilding && b && (playerBuilding.id === b.id || this.nearBuilding(p, b, 2)) ? 0.48 : 1,
        });
        if (b && b.id === playerBuilding?.id) this.playerBuilding = b;
      }
    }
    for (const prop of world.props) {
      if (prop.x < minX - 2 || prop.x > maxX + 2 || prop.y < minY - 2 || prop.y > maxY + 2) continue;
      list.push({ kind: 'prop', prop, x: prop.x + 0.5, y: prop.y + 0.5, depth: prop.x + prop.y + 0.55, shadow: prop.type === 'tree' ? 13 : 8 });
    }
    for (const c of world.containers) {
      if (c.x < minX - 2 || c.x > maxX + 2 || c.y < minY - 2 || c.y > maxY + 2) continue;
      list.push({ kind: 'container', c, x: c.x + 0.5, y: c.y + 0.5, depth: c.x + c.y + 0.7, shadow: 7 });
    }
    for (const b of world.buildings) {
      if (b.doorX < minX - 2 || b.doorX > maxX + 2 || b.doorY < minY - 2 || b.doorY > maxY + 2) continue;
      list.push({ kind: 'door', b, x: b.doorX + 0.5, y: b.doorY + 0.5, depth: b.doorX + b.doorY + 1.05 });
    }
    for (const s of world.structures || []) {
      if (s.x < minX - 2 || s.x > maxX + 2 || s.y < minY - 2 || s.y > maxY + 2) continue;
      list.push({ kind: 'structure', s, x: s.x + 0.5, y: s.y + 0.5, depth: s.x + s.y + 0.6, shadow: s.type === 'barricade' ? 8 : 6 });
    }
    for (const z of g.zombies) {
      if (z.dead) continue;
      if (z.x < minX - 2 || z.x > maxX + 2 || z.y < minY - 2 || z.y > maxY + 2) continue;
      list.push({ kind: 'zombie', z, x: z.x, y: z.y, depth: z.x + z.y + 0.3, shadow: 8 });
    }
    if (p && !g.dead) list.push({ kind: 'player', x: p.x, y: p.y, depth: p.x + p.y + 0.35, shadow: 8 });
    for (const gi of g.groundItems) {
      if (gi.x < minX - 2 || gi.x > maxX + 2 || gi.y < minY - 2 || gi.y > maxY + 2) continue;
      list.push({ kind: 'grounditem', gi, x: gi.x, y: gi.y, depth: gi.x + gi.y + 0.4 });
    }
  }

  nearBuilding(p, b, r) {
    return p.x > b.x - r && p.x < b.x + b.w + r && p.y > b.y - r && p.y < b.y + b.h + r;
  }

  drawThing(ctx, d) {
    switch (d.kind) {
      case 'wall': this.drawWall(ctx, d); break;
      case 'door': this.drawDoor(ctx, d); break;
      case 'prop': this.drawProp(ctx, d.prop); break;
      case 'container': this.drawContainer(ctx, d.c); break;
      case 'structure': this.drawStructure(ctx, d.s); break;
      case 'zombie': this.drawZombie(ctx, d.z); break;
      case 'player': this.drawPlayer(ctx); break;
      case 'grounditem': this.drawGroundItem(ctx, d.gi); break;
    }
  }

  // draw helpers used by many prop types
  box(ctx, cx, cy, w, h, height, top, left, right) {
    const hw = w / 2, hh = h / 2;
    const gL = [cx - hw, cy], gB = [cx, cy + hh], gR = [cx + hw, cy];
    // left / front face
    ctx.fillStyle = left;
    ctx.beginPath();
    ctx.moveTo(gL[0], gL[1]);
    ctx.lineTo(gB[0], gB[1]);
    ctx.lineTo(gB[0], gB[1] - height);
    ctx.lineTo(gL[0], gL[1] - height);
    ctx.closePath(); ctx.fill();
    // right / front face
    ctx.fillStyle = right;
    ctx.beginPath();
    ctx.moveTo(gB[0], gB[1]);
    ctx.lineTo(gR[0], gR[1]);
    ctx.lineTo(gR[0], gR[1] - height);
    ctx.lineTo(gB[0], gB[1] - height);
    ctx.closePath(); ctx.fill();
    // top
    ctx.fillStyle = top;
    diamondPath(ctx, cx, cy - hh - height, w, h);
    ctx.fill();
    ctx.strokeStyle = 'rgba(12,14,10,0.28)';
    ctx.lineWidth = 1;
    diamondPath(ctx, cx, cy - hh - height, w, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(gL[0], gL[1] - height);
    ctx.lineTo(gB[0], gB[1] - height);
    ctx.lineTo(gR[0], gR[1] - height);
    ctx.stroke();
  }

  drawWall(ctx, d) {
    const p = this.ground(d.x, d.y);
    const world = this.game.world;
    const b = d.owner;
    const interior = d.wv === 3;
    const height = interior ? 28 : 37;
    const alpha = d.fade;
    const base = b ? b.wall : '#8a7560';
    const trim = b ? b.trim : '#6b5947';
    const top = hexShade(interior ? trim : base, 24);
    const left = hexShade(interior ? trim : base, -16);
    const right = hexShade(interior ? trim : base, 4);
    const rightBlocked = world.wall[d.ty * world.size + (d.tx + 1)] > 0;
    const leftBlocked = world.wall[(d.ty + 1) * world.size + d.tx] > 0;
    ctx.save();
    ctx.globalAlpha = alpha;
    const hw = TW / 2 - 1, hh = TH / 2 - 1;
    const gL = [p.x - hw, p.y], gB = [p.x, p.y + hh], gR = [p.x + hw, p.y];
    if (!leftBlocked) {
      ctx.fillStyle = left;
      ctx.beginPath();
      ctx.moveTo(gL[0], gL[1]); ctx.lineTo(gB[0], gB[1]);
      ctx.lineTo(gB[0], gB[1] - height); ctx.lineTo(gL[0], gL[1] - height);
      ctx.closePath(); ctx.fill();
      if (d.wv === 2) this.windowFace(ctx, gL, gB, height, 'left');
    }
    if (!rightBlocked) {
      ctx.fillStyle = right;
      ctx.beginPath();
      ctx.moveTo(gB[0], gB[1]); ctx.lineTo(gR[0], gR[1]);
      ctx.lineTo(gR[0], gR[1] - height); ctx.lineTo(gB[0], gB[1] - height);
      ctx.closePath(); ctx.fill();
      if (d.wv === 2) this.windowFace(ctx, gB, gR, height, 'right');
    }
    ctx.fillStyle = top;
    diamondPath(ctx, p.x, p.y - hh - height, TW - 2, TH - 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,22,17,0.4)';
    ctx.lineWidth = 1;
    diamondPath(ctx, p.x, p.y - hh - height, TW - 2, TH - 2);
    ctx.stroke();
    // base trim
    ctx.strokeStyle = 'rgba(20,22,17,0.25)';
    ctx.beginPath();
    if (!leftBlocked) { ctx.moveTo(gL[0], gL[1]); ctx.lineTo(gB[0], gB[1]); }
    if (!rightBlocked) { ctx.moveTo(gB[0], gB[1]); ctx.lineTo(gR[0], gR[1]); }
    ctx.stroke();
    ctx.restore();
  }

  windowFace(ctx, a, b, height, side) {
    const lerpP = (t, up) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - up];
    const t1 = 0.3, t2 = 0.7;
    const y0 = height * 0.34, y1 = height * 0.78;
    const p1 = lerpP(t1, y1), p2 = lerpP(t2, y1), p3 = lerpP(t2, y0), p4 = lerpP(t1, y0);
    ctx.fillStyle = 'rgba(118,145,143,0.65)';
    ctx.beginPath();
    ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]);
    ctx.lineTo(p3[0], p3[1]); ctx.lineTo(p4[0], p4[1]);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(30,34,28,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(210,225,212,0.25)';
    ctx.beginPath();
    ctx.moveTo((p1[0] + p4[0]) / 2, (p1[1] + p4[1]) / 2);
    ctx.lineTo((p2[0] + p3[0]) / 2, (p2[1] + p3[1]) / 2);
    ctx.stroke();
  }

  // ------------------------------------------------------------- props
  drawProp(ctx, prop) {
    const p = this.ground(prop.x + 0.5, prop.y + 0.5);
    switch (prop.type) {
      case 'tree': return this.drawTree(ctx, p, prop);
      case 'bush': return this.drawBush(ctx, p, prop);
      case 'car': return this.drawCar(ctx, p, prop);
      case 'streetlight': return this.drawStreetlight(ctx, p, prop);
      case 'bed': return this.drawBed(ctx, p);
      case 'stove': return this.drawStove(ctx, p);
      case 'table': return this.drawTable(ctx, p);
      case 'chair': return this.drawChair(ctx, p);
      case 'sofa': return this.drawSofa(ctx, p);
      case 'plant': return this.drawPlant(ctx, p);
      case 'crate_prop': return this.drawCrateProp(ctx, p);
      case 'rug': return this.drawRug(ctx, p);
      case 'well': return this.drawWell(ctx, p);
      case 'bench': return this.drawBench(ctx, p);
      case 'trashcan': return this.drawTrashcan(ctx, p);
      case 'sign': return this.drawSign(ctx, p, prop);
      case 'fence': return this.drawFence(ctx, p, prop);
      case 'dumpster': return;
      default: return;
    }
  }

  drawTree(ctx, p, prop) {
    const v = prop.variant % 6;
    const sway = Math.sin(this.time * 0.7 + prop.x * 1.7) * 1.6;
    const pine = v >= 4;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (pine) {
      ctx.fillStyle = '#4a3a29';
      ctx.fillRect(-2, -22, 4, 22);
      const greens = ['#2f4530', '#375038', '#3f5b3e'];
      for (let i = 0; i < 3; i++) {
        const y = -22 - i * 12;
        const w = 20 - i * 4;
        ctx.fillStyle = greens[i];
        ctx.beginPath();
        ctx.moveTo(sway * (i + 1) / 3, y - 24);
        ctx.lineTo(sway + w, y + 6);
        ctx.lineTo(-w + sway, y + 6);
        ctx.closePath(); ctx.fill();
      }
    } else {
      ctx.fillStyle = '#5a4530';
      ctx.beginPath();
      ctx.moveTo(-3, 0); ctx.lineTo(3, 0); ctx.lineTo(2, -20); ctx.lineTo(-2, -20);
      ctx.closePath(); ctx.fill();
      const greens = ['#33482f', '#3d5436', '#47613d', '#526b44'];
      const blobs = [
        [-8, -26, 15, 11], [8, -28, 16, 12], [0, -38, 19, 15], [-13, -36, 12, 10],
        [12, -40, 12, 10],
      ];
      for (let i = 0; i < blobs.length; i++) {
        const [bx, by, rx, ry] = blobs[i];
        ctx.fillStyle = greens[(i + v) % greens.length];
        ctx.beginPath();
        ctx.ellipse(bx + sway * (i / 3), by, rx, ry, 0, 0, 6.3);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(132,156,95,0.55)';
      ctx.beginPath(); ctx.ellipse(-4 + sway, -42, 8, 5, 0, 0, 6.3); ctx.fill();
      if (v === 1) {
        ctx.fillStyle = 'rgba(164,120,64,0.5)';
        ctx.beginPath(); ctx.arc(9 + sway, -27, 2, 0, 6.3); ctx.fill();
      }
    }
    ctx.restore();
  }

  drawBush(ctx, p, prop) {
    const v = prop.variant;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = v % 2 ? '#39492f' : '#405437';
    ctx.beginPath(); ctx.ellipse(-6, -5, 9, 7, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = v % 2 ? '#425736' : '#4a603d';
    ctx.beginPath(); ctx.ellipse(5, -6, 8, 6, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = 'rgba(140,164,100,0.4)';
    ctx.beginPath(); ctx.ellipse(-3, -9, 4, 3, 0, 0, 6.3); ctx.fill();
    ctx.restore();
  }

  drawCar(ctx, p, prop) {
    const axis = prop.axis || 'h';
    const color = prop.color || '#6a4a3a';
    ctx.save();
    ctx.translate(p.x, p.y - 3);
    ctx.rotate(axis === 'h' ? Math.atan2(16, 32) : Math.atan2(16, -32));
    // shadow and body
    ctx.fillStyle = 'rgba(10,12,9,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 7, 26, 9, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = hexShade(color, -18);
    roundRect(ctx, -25, -8, 50, 17, 5); ctx.fill();
    ctx.fillStyle = color;
    roundRect(ctx, -23, -11, 46, 16, 5); ctx.fill();
    ctx.fillStyle = hexShade(color, 22);
    roundRect(ctx, -12, -14, 23, 11, 4); ctx.fill();
    ctx.fillStyle = 'rgba(150,178,178,0.6)';
    roundRect(ctx, -9, -12, 17, 6, 2); ctx.fill();
    ctx.fillStyle = 'rgba(26,28,24,0.7)';
    ctx.fillRect(-18, -12, 4, 3);
    ctx.fillRect(-18, 7, 4, 3);
    ctx.fillRect(15, -12, 4, 3);
    ctx.fillRect(15, 7, 4, 3);
    ctx.fillStyle = 'rgba(220,208,170,0.35)';
    ctx.fillRect(-25, 6, 3, 3);
    ctx.fillRect(21, 6, 3, 3);
    if (prop.containerId) {
      const c = this.game.world.getContainer(prop.containerId);
      if (c && c.items.length && !c.searched) this.glint(ctx, 0, -18, 0.7);
    }
    ctx.restore();
  }

  drawStreetlight(ctx, p, prop) {
    ctx.save();
    ctx.strokeStyle = '#3f4742';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - 58); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x + 7, p.y - 54, 9, Math.PI * 0.9, 0.5); ctx.stroke();
    const night = this.darkness() > 0.25;
    ctx.fillStyle = night ? 'rgba(247,197,112,0.95)' : 'rgba(165,167,150,0.7)';
    roundRect(ctx, p.x + 10, p.y - 58, 8, 4, 2); ctx.fill();
    ctx.fillStyle = '#343b37';
    roundRect(ctx, p.x - 6, p.y - 3, 12, 5, 2); ctx.fill();
    ctx.restore();
  }

  drawBed(ctx, p) {
    this.box(ctx, p.x, p.y - 6, 46, 24, 7, '#8a6a4c', '#6e4e37', '#7e5c41');
    ctx.fillStyle = '#b7b0a0';
    roundRect(ctx, p.x - 18, p.y - 21, 36, 13, 4); ctx.fill();
    ctx.fillStyle = '#8e897c';
    ctx.fillRect(p.x - 16, p.y - 14, 32, 3);
    ctx.fillStyle = '#d3ccb8';
    roundRect(ctx, p.x - 16, p.y - 20, 11, 8, 3); ctx.fill();
    ctx.fillStyle = '#7f4338';
    roundRect(ctx, p.x + 3, p.y - 19, 15, 10, 3); ctx.fill();
  }

  drawStove(ctx, p) {
    this.box(ctx, p.x, p.y, 40, 22, 20, '#4b4c46', '#30322d', '#3b3d37');
    ctx.fillStyle = '#22241f';
    ctx.beginPath(); ctx.ellipse(p.x - 8, p.y - 18, 6, 3, 0, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.ellipse(p.x + 8, p.y - 18, 6, 3, 0, 0, 6.3); ctx.fill();
    ctx.strokeStyle = 'rgba(210,160,80,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(196,190,168,0.4)';
    ctx.fillRect(p.x - 12, p.y - 8, 24, 2);
  }

  drawTable(ctx, p) {
    this.box(ctx, p.x, p.y - 2, 44, 24, 6, '#7b5a3f', '#5e412e', '#6d4d36');
    ctx.fillStyle = '#4a3425';
    ctx.fillRect(p.x - 16, p.y + 4, 3, 10);
    ctx.fillRect(p.x + 13, p.y + 4, 3, 10);
    ctx.fillStyle = 'rgba(220,200,160,0.25)';
    ctx.fillRect(p.x - 10, p.y - 11, 14, 2);
  }

  drawChair(ctx, p) {
    ctx.fillStyle = '#604630';
    roundRect(ctx, p.x - 8, p.y - 18, 16, 8, 2); ctx.fill();
    ctx.fillStyle = '#4d3625';
    ctx.fillRect(p.x - 6, p.y - 16, 2, 14);
    ctx.fillRect(p.x + 4, p.y - 16, 2, 14);
    ctx.fillStyle = '#6e5038';
    ctx.fillRect(p.x - 7, p.y - 27, 14, 10);
  }

  drawSofa(ctx, p) {
    this.box(ctx, p.x, p.y, 48, 24, 12, '#5e685c', '#414a41', '#525c51');
    ctx.fillStyle = '#6e7869';
    roundRect(ctx, p.x - 18, p.y - 16, 16, 9, 3); ctx.fill();
    roundRect(ctx, p.x + 2, p.y - 16, 16, 9, 3); ctx.fill();
    ctx.fillStyle = '#3c443c';
    roundRect(ctx, p.x - 21, p.y - 24, 42, 8, 3); ctx.fill();
  }

  drawPlant(ctx, p) {
    ctx.fillStyle = '#7a5a3d';
    ctx.beginPath();
    ctx.moveTo(p.x - 7, p.y - 8); ctx.lineTo(p.x + 7, p.y - 8); ctx.lineTo(p.x + 5, p.y); ctx.lineTo(p.x - 5, p.y);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3f5d3a';
    for (let i = 0; i < 4; i++) {
      const a = i * 1.6;
      ctx.beginPath();
      ctx.ellipse(p.x + Math.cos(a) * 6, p.y - 16 + Math.sin(a) * 3, 6, 3, a, 0, 6.3);
      ctx.fill();
    }
    ctx.fillStyle = '#507444';
    ctx.beginPath(); ctx.ellipse(p.x, p.y - 20, 5, 7, 0, 0, 6.3); ctx.fill();
  }

  drawCrateProp(ctx, p) {
    this.box(ctx, p.x, p.y, 40, 22, 18, '#8b6d47', '#664d33', '#7a5c3d');
    ctx.strokeStyle = 'rgba(42,30,18,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x - 18, p.y - 7); ctx.lineTo(p.x + 18, p.y + 7);
    ctx.moveTo(p.x - 18, p.y + 7); ctx.lineTo(p.x + 18, p.y - 7);
    ctx.stroke();
  }

  drawRug(ctx, p) {
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = '#6d4639';
    diamondPath(ctx, p.x, p.y - 26, 54, 27); ctx.fill();
    ctx.strokeStyle = 'rgba(212,186,140,0.3)';
    ctx.lineWidth = 1;
    diamondPath(ctx, p.x, p.y - 26, 44, 22); ctx.stroke();
    ctx.restore();
  }

  drawWell(ctx, p) {
    ctx.fillStyle = '#5e5c50';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 15, 8, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#2d3a3b';
    ctx.beginPath(); ctx.ellipse(p.x, p.y - 1, 10, 5, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#6d5b41';
    ctx.fillRect(p.x - 13, p.y - 22, 3, 22);
    ctx.fillRect(p.x + 10, p.y - 22, 3, 22);
    ctx.fillStyle = '#52432f';
    ctx.beginPath();
    ctx.moveTo(p.x - 18, p.y - 20); ctx.lineTo(p.x, p.y - 30); ctx.lineTo(p.x + 18, p.y - 20); ctx.lineTo(p.x, p.y - 14);
    ctx.closePath(); ctx.fill();
  }

  drawBench(ctx, p) {
    ctx.fillStyle = '#5c4732';
    ctx.fillRect(p.x - 18, p.y - 12, 36, 3);
    ctx.fillRect(p.x - 18, p.y - 6, 36, 3);
    ctx.fillStyle = '#3f3122';
    ctx.fillRect(p.x - 15, p.y - 6, 2, 9);
    ctx.fillRect(p.x + 13, p.y - 6, 2, 9);
  }

  drawTrashcan(ctx, p) {
    ctx.fillStyle = '#45504a';
    ctx.beginPath();
    ctx.moveTo(p.x - 7, p.y - 13); ctx.lineTo(p.x + 7, p.y - 13);
    ctx.lineTo(p.x + 5, p.y); ctx.lineTo(p.x - 5, p.y);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5a655d';
    ctx.beginPath(); ctx.ellipse(p.x, p.y - 13, 7, 3, 0, 0, 6.3); ctx.fill();
  }

  drawSign(ctx, p, prop) {
    const name = this.game.world.nearRoadName(prop.x, prop.y) || 'HAVENWOOD';
    ctx.save();
    ctx.fillStyle = '#4a4438';
    ctx.fillRect(p.x - 1, p.y - 34, 3, 34);
    ctx.fillStyle = '#6f6a57';
    roundRect(ctx, p.x - 24, p.y - 44, 48, 14, 2); ctx.fill();
    ctx.strokeStyle = 'rgba(230,222,195,0.35)';
    ctx.strokeRect(p.x - 23, p.y - 43, 46, 12);
    ctx.fillStyle = 'rgba(235,226,200,0.78)';
    ctx.font = '600 5px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(name.toUpperCase().slice(0, 14), p.x, p.y - 35.5);
    ctx.restore();
  }

  drawFence(ctx, p, prop) {
    ctx.strokeStyle = '#6a5238';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(p.x - 14, p.y - 4); ctx.lineTo(p.x + 14, p.y + 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p.x - 14, p.y - 10); ctx.lineTo(p.x + 14, p.y - 3); ctx.stroke();
    ctx.fillStyle = '#58432d';
    ctx.fillRect(p.x - 15, p.y - 14, 3, 15);
    ctx.fillRect(p.x + 12, p.y - 8, 3, 15);
  }

  glint(ctx, x, y, scale = 1) {
    const bob = Math.sin(this.time * 3 + x * 0.1) * 2;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = 'rgba(232,178,78,0.9)';
    ctx.fillRect(-2.5 * scale, -2.5 * scale, 5 * scale, 5 * scale);
    ctx.globalAlpha = 0.28;
    ctx.beginPath(); ctx.arc(0, 0, 7 * scale, 0, 6.3); ctx.fill();
    ctx.restore();
  }

  drawContainer(ctx, c) {
    const p = this.ground(c.x + 0.5, c.y + 0.5);
    const t = c.type;
    const base = c.color || '#8a7560';
    let h = 22, w = 38;
    if (t === 'fridge' || t === 'locker' || t === 'medcab' || t === 'supply') h = 34;
    if (t === 'freezer') { h = 17; w = 44; }
    if (t === 'shelf' || t === 'display') h = 38;
    if (t === 'dumpster') { h = 23; w = 46; }
    const top = hexShade(base, 24), left = hexShade(base, -26), right = hexShade(base, -6);
    ctx.save();
    if (t === 'shelf' || t === 'display') {
      this.box(ctx, p.x, p.y, w, 20, h, '#6d6656', '#4c463a', '#5d574a');
      ctx.fillStyle = 'rgba(34,30,24,0.55)';
      ctx.fillRect(p.x - 14, p.y - h + 6, 28, 5);
      ctx.fillRect(p.x - 14, p.y - h + 16, 28, 5);
      ctx.fillStyle = 'rgba(196,176,130,0.5)';
      ctx.fillRect(p.x - 12, p.y - h + 8, 3, 2);
      ctx.fillRect(p.x + 2, p.y - h + 18, 4, 2);
    } else if (t === 'dumpster') {
      this.box(ctx, p.x, p.y, w, 22, 20, '#3f5246', '#28362d', '#344439');
      ctx.fillStyle = '#2b3a30';
      roundRect(ctx, p.x - 20, p.y - 30, 40, 8, 3); ctx.fill();
      ctx.fillStyle = 'rgba(194,206,182,0.3)';
      ctx.fillRect(p.x - 10, p.y - 12, 20, 2);
    } else {
      this.box(ctx, p.x, p.y, w, 20, h, top, left, right);
      // door / slats depending on type
      if (t === 'crate') {
        ctx.strokeStyle = 'rgba(40,28,16,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x - 15, p.y - 4); ctx.lineTo(p.x + 15, p.y + 4);
        ctx.moveTo(p.x - 15, p.y + 4); ctx.lineTo(p.x + 15, p.y - 4);
        ctx.stroke();
      } else if (t === 'locker' || t === 'medcab' || t === 'supply') {
        ctx.fillStyle = 'rgba(35,40,38,0.35)';
        ctx.fillRect(p.x - 11, p.y - h + 7, 22, 1.5);
        ctx.fillStyle = t === 'locker' ? 'rgba(210,220,205,0.35)' : 'rgba(170,45,38,0.85)';
        if (t === 'locker') {
          ctx.fillRect(p.x - 2, p.y - h + 18, 4, 6);
        } else {
          ctx.fillRect(p.x - 2, p.y - h + 15, 4, 12);
          ctx.fillRect(p.x - 7, p.y - h + 20, 14, 4);
        }
      } else if (t === 'fridge' || t === 'freezer') {
        ctx.fillStyle = 'rgba(40,44,42,0.3)';
        ctx.fillRect(p.x - 12, p.y - h + 5, 24, 1.5);
        ctx.fillStyle = 'rgba(50,55,52,0.55)';
        ctx.fillRect(p.x + 10, p.y - h + 12, 2, 8);
      } else {
        ctx.fillStyle = 'rgba(35,28,20,0.35)';
        ctx.fillRect(p.x - 12, p.y - h + 6, 24, 1.5);
        ctx.fillStyle = 'rgba(220,200,160,0.4)';
        ctx.fillRect(p.x + 11, p.y - h + 12, 2, 5);
      }
    }
    if (c.items.length && !c.searched) this.glint(ctx, p.x, p.y - h - 15, 0.8);
    ctx.restore();
  }

  drawStructure(ctx, s) {
    const p = this.ground(s.x + 0.5, s.y + 0.5);
    if (s.type === 'campfire') {
      ctx.fillStyle = '#575146';
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * 6.28;
        ctx.beginPath(); ctx.ellipse(p.x + Math.cos(a) * 13, p.y + Math.sin(a) * 6, 4, 2.4, 0, 0, 6.3); ctx.fill();
      }
      ctx.strokeStyle = '#4c3522';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(p.x - 8, p.y + 3); ctx.lineTo(p.x + 8, p.y - 3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x - 8, p.y - 3); ctx.lineTo(p.x + 8, p.y + 3); ctx.stroke();
      const f = Math.sin(this.time * 8 + s.x) * 2;
      ctx.fillStyle = 'rgba(240,140,48,0.9)';
      ctx.beginPath();
      ctx.moveTo(p.x - 5, p.y - 2); ctx.quadraticCurveTo(p.x - 8, p.y - 16, p.x, p.y - 25 - f);
      ctx.quadraticCurveTo(p.x + 8, p.y - 15, p.x + 4, p.y - 2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,221,132,0.95)';
      ctx.beginPath();
      ctx.moveTo(p.x - 2, p.y - 2); ctx.quadraticCurveTo(p.x - 4, p.y - 11, p.x + 1, p.y - 16 - f);
      ctx.quadraticCurveTo(p.x + 5, p.y - 9, p.x + 3, p.y - 2);
      ctx.closePath(); ctx.fill();
    } else if (s.type === 'crate') {
      this.box(ctx, p.x, p.y, 40, 22, 19, '#8b6d47', '#664d33', '#7a5c3d');
      ctx.strokeStyle = 'rgba(42,30,18,0.55)';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x - 13, p.y - 20, 26, 11);
      if (s.storage && s.storage.length) this.glint(ctx, p.x, p.y - 34, 0.55);
    } else if (s.type === 'barricade') {
      ctx.fillStyle = '#4a3421';
      ctx.fillRect(p.x - 5, p.y - 8, 4, 16);
      ctx.fillRect(p.x + 4, p.y - 8, 4, 16);
      ctx.fillStyle = '#7a583a';
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(-0.45);
      ctx.fillRect(-22, -4, 44, 8);
      ctx.rotate(0.9);
      ctx.fillRect(-22, -4, 44, 8);
      ctx.restore();
      ctx.fillStyle = 'rgba(200,190,160,0.35)';
      ctx.fillRect(p.x - 4, p.y - 8, 2, 2);
    } else if (s.type === 'farm_plot') {
      ctx.fillStyle = '#3f3524';
      diamondPath(ctx, p.x, p.y - 16, 58, 29); ctx.fill();
      ctx.strokeStyle = 'rgba(28,24,16,0.6)';
      ctx.lineWidth = 1;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(p.x - 24, p.y - i * 5);
        ctx.lineTo(p.x + 24, p.y - i * 5 - 8);
        ctx.stroke();
      }
      if (s.planted) {
        const growth = s.growth || 0;
        ctx.fillStyle = growth > 0.75 ? '#8a9c54' : '#5f7a42';
        const n = growth > 0.75 ? 5 : 3;
        for (let i = 0; i < n; i++) {
          const px = p.x - 14 + i * 7;
          const hh = 4 + growth * 10;
          ctx.fillRect(px, p.y - 8 - hh, 2, hh);
          ctx.beginPath(); ctx.ellipse(px + 1, p.y - 8 - hh, 3, 2, 0, 0, 6.3); ctx.fill();
        }
        if (growth >= 0.99) this.glint(ctx, p.x, p.y - 34, 0.7);
      }
    } else if (s.type === 'rain_collector') {
      this.box(ctx, p.x, p.y, 30, 18, 28, '#4e5a5a', '#34403f', '#414c4b');
      ctx.fillStyle = 'rgba(70,115,126,0.68)';
      ctx.fillRect(p.x - 8, p.y - 30, 16, 5 + (s.water || 0) * 9);
      ctx.strokeStyle = 'rgba(190,210,200,0.35)';
      ctx.strokeRect(p.x - 8, p.y - 30, 16, 14);
    } else if (s.type === 'bedroll') {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#55624f';
      diamondPath(ctx, p.x, p.y - 22, 48, 24); ctx.fill();
      ctx.fillStyle = '#8a8068';
      diamondPath(ctx, p.x, p.y - 30, 34, 17); ctx.fill();
      ctx.fillStyle = '#b4a685';
      ctx.beginPath(); ctx.ellipse(p.x - 9, p.y - 23, 5, 3, 0, 0, 6.3); ctx.fill();
      ctx.restore();
    }
  }

  drawGroundItem(ctx, gi) {
    const p = this.ground(gi.x, gi.y);
    ctx.save();
    ctx.fillStyle = 'rgba(226,172,72,0.18)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 8, 4, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#7d6848';
    roundRect(ctx, p.x - 4, p.y - 6, 8, 6, 2); ctx.fill();
    ctx.fillStyle = '#c8a85e';
    ctx.fillRect(p.x - 1, p.y - 5, 2, 2);
    this.glint(ctx, p.x, p.y - 12, 0.55);
    ctx.restore();
  }

  drawDoor(ctx, d) {
    const p = this.ground(d.b.doorX + 0.5, d.b.doorY + 0.5);
    ctx.save();
    ctx.fillStyle = 'rgba(46,34,23,0.62)';
    diamondPath(ctx, p.x, p.y - TH / 2 + 2, TW - 8, TH - 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(210,190,150,0.16)';
    ctx.lineWidth = 1;
    diamondPath(ctx, p.x, p.y - TH / 2 + 2, TW - 8, TH - 7);
    ctx.stroke();
    const px = p.x - 15, py = p.y - 4;
    ctx.fillStyle = 'rgba(92,64,39,0.95)';
    ctx.beginPath();
    ctx.moveTo(px, py); ctx.lineTo(px + 11, py - 7);
    ctx.lineTo(px + 19, py - 36); ctx.lineTo(px + 8, py - 30);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(30,22,14,0.6)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(214,187,121,0.8)';
    ctx.fillRect(px + 12, py - 19, 2, 2);
    ctx.restore();
  }

  // ------------------------------------------------------------ characters
  drawPlayer(ctx) {
    const p = this.game.player;
    if (!p) return;
    const s = this.ground(p.x, p.y);
    const walk = p.moving ? Math.sin(p.movePhase * 9) : 0;
    const bob = p.moving ? Math.abs(Math.sin(p.movePhase * 9)) * 1.6 : Math.sin(this.time * 1.8) * 0.4;
    const crouch = p.crouch ? 0.84 : 1;
    const sf = this.screenFacing(p.facing);
    const dir = Math.atan2(sf.y, sf.x);
    const swing = p.swing > 0 ? Math.sin((1 - p.swing / p.swingTime) * Math.PI) : 0;
    const moving = p.moving;
    ctx.save();
    ctx.translate(s.x, s.y);
    // legs
    ctx.fillStyle = '#343b34';
    const legSwing = moving ? walk * 4 : 0;
    ctx.save();
    ctx.translate(-3, 0);
    ctx.rotate(legSwing * 0.09);
    ctx.fillRect(-3, -15 * crouch, 6, 15 * crouch);
    ctx.restore();
    ctx.save();
    ctx.translate(3, 0);
    ctx.rotate(-legSwing * 0.09);
    ctx.fillRect(-3, -15 * crouch, 6, 15 * crouch);
    ctx.restore();
    // backpack
    if (p.backpackItem) {
      ctx.fillStyle = '#5b4931';
      roundRect(ctx, -9 - sf.x * 3, -37 * crouch, 18, 22, 5);
      ctx.fill();
      ctx.fillStyle = 'rgba(190,160,110,0.35)';
      ctx.fillRect(-6 - sf.x * 3, -33 * crouch, 12, 2);
    }
    // torso
    ctx.fillStyle = p.jacketItem ? '#3f4c45' : '#5e6b5c';
    roundRect(ctx, -9, -38 * crouch - bob, 18, 24 * crouch, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,24,19,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(198,177,128,0.5)';
    ctx.fillRect(-7, -32 * crouch - bob, 4, 10);
    // head
    const hx = sf.x * 1.5;
    ctx.fillStyle = '#c59a73';
    ctx.beginPath(); ctx.arc(hx, -45 * crouch - bob, 6.6, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#3a2e25';
    ctx.beginPath(); ctx.arc(hx - sf.x * 1.2, -48 * crouch - bob, 6.6, Math.PI, 6.3); ctx.fill();
    ctx.fillStyle = '#2c231c';
    ctx.beginPath(); ctx.arc(hx + sf.x * 3.2, -44.5 * crouch - bob, 1.1, 0, 6.3); ctx.fill();
    // arm + weapon
    const handX = hx + sf.x * 6;
    const handY = -29 * crouch - bob + sf.y * 3;
    ctx.fillStyle = '#c59a73';
    ctx.beginPath(); ctx.arc(handX, handY, 2.6, 0, 6.3); ctx.fill();
    const weapon = this.game.getWeapon();
    if (weapon) {
      const angle = dir + (swing - 0.5) * 1.5;
      const len = weapon.weapon.ranged ? 15 : weapon.weapon.range * 24;
      ctx.save();
      ctx.translate(handX, handY);
      ctx.rotate(angle);
      if (weapon.id === 'pistol') {
        ctx.fillStyle = '#2d3031';
        ctx.fillRect(0, -2, 14, 4);
        ctx.fillRect(3, 2, 4, 6);
      } else if (weapon.id === 'bat' || weapon.id === 'crowbar' || weapon.id === 'axe' || weapon.id === 'spear' || weapon.id === 'torch') {
        ctx.strokeStyle = weapon.id === 'torch' ? '#5c4128' : weapon.id === 'spear' ? '#80603d' : '#6b563c';
        ctx.lineWidth = weapon.id === 'bat' ? 4 : weapon.id === 'spear' ? 2.5 : 3;
        ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(len, 0); ctx.stroke();
        if (weapon.id === 'axe' || weapon.id === 'crowbar') {
          ctx.fillStyle = '#8c8e88';
          ctx.fillRect(len - 2, -5, 5, 10);
        }
        if (weapon.id === 'torch') {
          ctx.fillStyle = 'rgba(240,150,50,0.95)';
          ctx.beginPath(); ctx.arc(len, 0, 5 + Math.sin(this.time * 9) * 1.4, 0, 6.3); ctx.fill();
        }
      } else {
        ctx.fillStyle = '#a9aca2';
        ctx.beginPath();
        ctx.moveTo(0, -2); ctx.lineTo(10, -1); ctx.lineTo(12, 0); ctx.lineTo(10, 1.4); ctx.lineTo(0, 2);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#4a3a2a';
        ctx.fillRect(-4, -1.6, 5, 3.2);
      }
      ctx.restore();
      if (swing > 0.15) {
        ctx.strokeStyle = `rgba(236,224,190,${0.55 * swing})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, -25, 28 + len * 0.3, dir - 0.8, dir + 0.8);
        ctx.stroke();
      }
    }
    // flashlight glow at hand
    if (p.flashlightOn && p.lightItem) {
      ctx.fillStyle = 'rgba(255,239,184,0.9)';
      ctx.beginPath(); ctx.arc(handX, handY, 2, 0, 6.3); ctx.fill();
    }
    ctx.restore();
    if (p.crouch) {
      ctx.fillStyle = 'rgba(220,210,180,0.55)';
      ctx.font = '600 8px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('HIDDEN', s.x, s.y - 58);
    }
  }

  screenFacing(f) {
    if (!f) return { x: 1, y: 0 };
    const x = (f.x - f.y) * HALF_W;
    const y = (f.x + f.y) * HALF_H;
    const l = Math.hypot(x, y) || 1;
    return { x: x / l, y: y / l };
  }

  drawZombie(ctx, z) {
    const s = this.ground(z.x, z.y);
    const wob = Math.sin(z.phase + this.time * 2.1) * 1.8;
    const sf = this.screenFacing(z.facing || { x: 1, y: 0 });
    const dir = Math.atan2(sf.y, sf.x);
    ctx.save();
    ctx.translate(s.x, s.y);
    // legs
    ctx.strokeStyle = z.pants || '#3c3f38';
    ctx.lineWidth = 5;
    const walk = Math.sin(z.phase + this.time * 6) * 4;
    ctx.beginPath(); ctx.moveTo(-2, -16); ctx.lineTo(-3 + walk * 0.4, -2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, -16); ctx.lineTo(4 - walk * 0.4, -2); ctx.stroke();
    // torso
    ctx.fillStyle = z.shirt || ZED_SHIRTS[z.variant % ZED_SHIRTS.length];
    roundRect(ctx, -9, -36 + wob * 0.2, 18, 22, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,22,18,0.5)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(74,28,24,0.5)';
    ctx.beginPath(); ctx.ellipse(-2, -26, 4, 2, 0.4, 0, 6.3); ctx.fill();
    // arms out
    ctx.strokeStyle = z.skin || '#8c967a';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(-7, -30); ctx.lineTo(-7 + sf.x * 14, -27 + sf.y * 7);
    ctx.moveTo(7, -30); ctx.lineTo(7 + sf.x * 15, -25 + sf.y * 8);
    ctx.stroke();
    // head
    ctx.fillStyle = z.skin || '#8c967a';
    ctx.beginPath(); ctx.arc(sf.x * 2, -42 + wob * 0.3, 6.2, 0, 6.3); ctx.fill();
    ctx.fillStyle = 'rgba(42,44,35,0.85)';
    ctx.beginPath(); ctx.arc(sf.x * 2 - 2, -45, 6, Math.PI, 6.3); ctx.fill();
    ctx.fillStyle = '#ba2e2a';
    ctx.beginPath(); ctx.arc(sf.x * 2 + 2.5, -41 + wob * 0.3, 1.2, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.arc(sf.x * 2 - 1.5, -41 + wob * 0.3, 1.1, 0, 6.3); ctx.fill();
    // blood on face
    if (z.variant % 3 === 0) {
      ctx.fillStyle = 'rgba(96,24,20,0.6)';
      ctx.fillRect(sf.x * 2 - 2, -38, 3, 4);
    }
    ctx.restore();
    if (z.health < z.maxHealth) {
      const w = 24;
      ctx.fillStyle = 'rgba(16,18,14,0.65)';
      ctx.fillRect(s.x - w / 2, s.y - 58, w, 3);
      ctx.fillStyle = '#b64b3b';
      ctx.fillRect(s.x - w / 2, s.y - 58, w * (z.health / z.maxHealth), 3);
    }
    if (z.alert > 0) {
      ctx.fillStyle = 'rgba(232,178,78,0.95)';
      ctx.font = '700 13px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('!', s.x, s.y - 64);
    }
    const dark = this.darkness();
    if (dark > 0.3) {
      ctx.fillStyle = `rgba(220,70,50,${0.55 * Math.min(1, dark)})`;
      ctx.beginPath(); ctx.arc(s.x + 2, s.y - 41, 1.6, 0, 6.3); ctx.fill();
    }
  }

  drawBuildGhost(ctx) {
    const b = this.game.buildMode;
    if (!b || b.x == null || b.y == null) return;
    const p = this.ground(b.x + 0.5, b.y + 0.5);
    const ok = b.valid;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = ok ? 'rgba(142,214,150,0.9)' : 'rgba(226,96,78,0.9)';
    ctx.fillStyle = ok ? 'rgba(120,196,126,0.18)' : 'rgba(214,80,64,0.2)';
    ctx.lineWidth = 2;
    diamondPath(ctx, p.x, p.y - TH / 2, TW - 4, TH - 3);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - TH / 2);
    ctx.lineTo(p.x, p.y + TH / 2);
    ctx.moveTo(p.x - TW / 2, p.y);
    ctx.lineTo(p.x + TW / 2, p.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const icon = b.recipe?.icon || '?';
    ctx.font = '700 16px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = ok ? '#d8f0d4' : '#f0bdb4';
    ctx.fillText(icon, p.x, p.y - 12);
    ctx.restore();
    if (!ok) {
      ctx.save();
      ctx.fillStyle = 'rgba(240,150,132,0.85)';
      ctx.font = '600 9px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('BLOCKED', p.x, p.y - 34);
      ctx.restore();
    }
  }

  drawBuildingLabels(ctx) {
    const g = this.game;
    const major = ['store', 'pharmacy', 'diner', 'police', 'school', 'hospital', 'warehouse', 'garage', 'gas', 'farmhouse'];
    for (const b of g.world.buildings) {
      if (!b.discovered) continue;
      const d = Math.hypot(b.x + b.w / 2 - g.player.x, b.y + b.h / 2 - g.player.y);
      if (d > (major.includes(b.type) ? 23 : 8)) continue;
      const p = this.ground(b.x + b.w / 2 + 0.5, b.y + b.h / 2 + 0.5);
      const sx = p.x, sy = p.y - 48;
      const alpha = clamp(1.15 - d / 26, 0.25, 0.85);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = '600 9px ui-monospace, monospace';
      ctx.textAlign = 'center';
      const text = b.name.toUpperCase();
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(12,16,13,0.62)';
      roundRect(ctx, sx - tw / 2 - 5, sy - 9, tw + 10, 13, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(231,221,194,0.88)';
      ctx.fillText(text, sx, sy);
      ctx.restore();
    }
  }

  drawAim(ctx) {
    const g = this.game;
    if (g.isTouch || !g.mouse.active) return;
    const wx = (g.mouse.x - this.w / 2) / this.zoom + this.cam.px;
    const wy = (g.mouse.y - this.h / 2) / this.zoom + this.cam.py;
    ctx.save();
    ctx.translate(wx, wy);
    ctx.rotate(Math.PI / 4);
    ctx.strokeStyle = 'rgba(236,205,144,0.75)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-5, -5, 10, 10);
    ctx.fillStyle = 'rgba(236,205,144,0.7)';
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }

  drawEffects(ctx) {
    for (const e of this.game.effects) {
      const q = this.ground(e.x, e.y);
      if (e.type === 'slash') {
        const ang = Math.atan2(this.screenFacing(e.facing).y, this.screenFacing(e.facing).x);
        const life = e.life / e.max;
        ctx.strokeStyle = `rgba(244,232,200,${0.55 * life})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(q.x, q.y - 18, (e.range || 1) * 30, ang - 0.8, ang + 0.8);
        ctx.stroke();
      } else if (e.type === 'ring') {
        const life = 1 - e.life / e.max;
        const r = 8 + life * (e.r || 40);
        ctx.strokeStyle = `rgba(226,175,90,${0.4 * (1 - life)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(q.x, q.y, r, r * 0.45, 0, 0, 6.3);
        ctx.stroke();
      } else if (e.type === 'muzzle') {
        const life = e.life / e.max;
        ctx.fillStyle = `rgba(255,208,120,${life})`;
        ctx.beginPath(); ctx.arc(q.x, q.y - 28, 5 + life * 5, 0, 6.3); ctx.fill();
      }
    }
    for (const t of this.game.floaters) {
      const q = this.ground(t.x, t.y);
      const a = clamp(t.life / t.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = '700 11px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = t.color || '#e8c78a';
      ctx.fillText(t.text, q.x, q.y - 44 - (1 - a) * 22);
      ctx.globalAlpha = 1;
    }
    const inter = this.game.nearestInteract;
    if (inter) {
      const ix = inter.kind === 'container' ? inter.target.x + 0.5 : inter.target.x + 0.5;
      const iy = inter.kind === 'container' ? inter.target.y + 0.5 : inter.target.y + 0.5;
      const q = this.ground(ix, iy);
      const pulse = 0.6 + Math.sin(this.time * 4) * 0.25;
      ctx.strokeStyle = `rgba(232,178,78,${pulse * 0.6})`;
      ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.ellipse(q.x, q.y, 17, 8, 0, 0, 6.3); ctx.stroke();
    }
  }

  drawParticles(ctx) {
    for (const p of this.game.particles) {
      const q = this.ground(p.x, p.y);
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.kind === 'spark') {
        ctx.fillRect(q.x + p.ox, q.y - p.z + p.oy, p.size, p.size);
      } else {
        ctx.beginPath();
        ctx.arc(q.x + p.ox, q.y - p.z + p.oy, p.size * (0.5 + a * 0.5), 0, 6.3);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // -------------------------------------------------------------- light
  darkness() {
    const g = this.game;
    const h = g.hour ?? 8;
    let d;
    if (h < 5) d = 0.72;
    else if (h < 7.5) d = lerp(0.72, 0.06, (h - 5) / 2.5);
    else if (h < 18.5) d = 0.06;
    else if (h < 21) d = lerp(0.06, 0.72, (h - 18.5) / 2.5);
    else d = 0.72;
    if (g.weather) {
      if (g.weather.type === 'rain') d += 0.09 * g.weather.intensity;
      if (g.weather.type === 'storm') d += 0.18 * g.weather.intensity;
      if (g.weather.type === 'fog') d += 0.08;
    }
    return clamp(d, 0, 0.86);
  }

  lightSources() {
    const g = this.game;
    const out = [];
    const p = g.player;
    if (!p) return out;
    out.push({ x: p.x, y: p.y, r: p.flashlightOn ? 4.4 : 2.5, warm: 0, strength: 0.8 });
    if (p.flashlightOn) {
      out.push({ x: p.x, y: p.y, r: 10.5, dir: p.facing, cone: true, warm: 0.2 });
    }
    const wep = g.getWeapon();
    if (wep && wep.id === 'torch') out.push({ x: p.x, y: p.y, r: 5.6, warm: 1, strength: 0.9 });
    for (const s of g.world.structures || []) {
      if (s.type !== 'campfire') continue;
      if (Math.abs(s.x - p.x) > 30 || Math.abs(s.y - p.y) > 30) continue;
      out.push({ x: s.x + 0.5, y: s.y + 0.5, r: 5.4, warm: 1, strength: 1 });
    }
    for (const pr of g.world.props) {
      if (pr.type !== 'streetlight') continue;
      if (Math.abs(pr.x - p.x) > 34 || Math.abs(pr.y - p.y) > 34) continue;
      out.push({ x: pr.x + 0.5, y: pr.y + 0.5, r: 5.2, warm: 0.9, strength: 0.9 });
    }
    return out;
  }

  drawLighting(ctx) {
    const dark = this.darkness();
    const flash = this.game.weather?.flash || 0;
    if (dark < 0.03 && flash < 0.02) return;
    const o = this.octx;
    const ow = this.overlay.width, oh = this.overlay.height;
    const scale = ow / this.w;
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.globalCompositeOperation = 'source-over';
    o.clearRect(0, 0, ow, oh);
    const alpha = clamp(dark + flash * 0.9, 0, 0.9);
    o.fillStyle = `rgba(7,12,24,${alpha})`;
    o.fillRect(0, 0, ow, oh);
    if (dark > 0.05) {
      o.globalCompositeOperation = 'destination-out';
      for (const l of this.lightSources()) {
        const s = this.screen(l.x, l.y);
        const x = s.x * scale, y = (s.y - 8) * scale;
        const r = l.r * 54 * this.zoom * scale;
        if (x < -r || y < -r || x > ow + r || y > oh + r) continue;
        if (l.cone) {
          const sf = this.screenFacing(l.dir);
          const ang = Math.atan2(sf.y, sf.x);
          o.save();
          o.translate(x, y);
          o.rotate(ang);
          const g = o.createLinearGradient(0, 0, r, 0);
          g.addColorStop(0, 'rgba(0,0,0,0.92)');
          g.addColorStop(0.65, 'rgba(0,0,0,0.55)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          o.fillStyle = g;
          o.beginPath();
          o.moveTo(0, -6 * scale);
          o.lineTo(r, -r * 0.28);
          o.lineTo(r, r * 0.28);
          o.lineTo(0, 6 * scale);
          o.closePath();
          o.fill();
          o.restore();
        } else {
          const g = o.createRadialGradient(x, y, 0, x, y, r);
          const st = l.strength ?? 0.8;
          g.addColorStop(0, `rgba(0,0,0,${0.92 * st})`);
          g.addColorStop(0.45, `rgba(0,0,0,${0.62 * st})`);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          o.fillStyle = g;
          o.beginPath(); o.arc(x, y, r, 0, 6.3); o.fill();
        }
      }
      o.globalCompositeOperation = 'source-over';
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.drawImage(this.overlay, 0, 0, this.w, this.h);
  }

  drawGlows(ctx) {
    const g = this.game;
    const dark = this.darkness();
    if (dark < 0.08 && !g.muzzleFlash) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const l of this.lightSources()) {
      if (!l.warm) continue;
      const s = this.screen(l.x, l.y);
      const r = l.r * 54 * this.zoom;
      if (s.x < -r || s.y < -r || s.x > this.w + r || s.y > this.h + r) continue;
      const grad = ctx.createRadialGradient(s.x, s.y - 8, 0, s.x, s.y - 8, r);
      grad.addColorStop(0, `rgba(255,176,82,${0.16 * dark})`);
      grad.addColorStop(0.5, `rgba(235,130,55,${0.06 * dark})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(s.x, s.y - 8, r, 0, 6.3); ctx.fill();
    }
    if (g.muzzleFlash > 0) {
      const s = this.screen(g.player.x, g.player.y);
      const r = 110;
      const grad = ctx.createRadialGradient(s.x, s.y - 30, 0, s.x, s.y - 30, r);
      grad.addColorStop(0, `rgba(255,220,140,${0.5 * g.muzzleFlash})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(s.x, s.y - 30, r, 0, 6.3); ctx.fill();
    }
    ctx.restore();
  }

  drawWeather(ctx, dt) {
    const w = this.game.weather;
    if (!w) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (w.type === 'rain' || w.type === 'storm') {
      const count = Math.round((w.type === 'storm' ? 210 : 130) * (this.lowDetail ? 0.55 : 1));
      while (this.rain.length < count) {
        this.rain.push({
          x: Math.random() * this.w, y: Math.random() * this.h,
          len: 9 + Math.random() * 14, sp: 520 + Math.random() * 340, a: 0.14 + Math.random() * 0.24,
        });
      }
      ctx.strokeStyle = 'rgba(184,205,208,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const r = this.rain[i];
        r.y += r.sp * dt;
        r.x -= r.sp * 0.18 * dt;
        if (r.y > this.h + 20) { r.y = -20; r.x = Math.random() * this.w; }
        if (r.x < -20) r.x = this.w + 20;
        ctx.moveTo(r.x, r.y);
        ctx.lineTo(r.x + r.len * 0.25, r.y + r.len);
      }
      ctx.stroke();
      const cloudy = w.type === 'storm' ? 0.28 : 0.18;
      ctx.fillStyle = `rgba(30,43,48,${cloudy * w.intensity})`;
      ctx.fillRect(0, 0, this.w, this.h);
    } else if (w.type === 'fog') {
      const t = this.time * 0.02;
      for (let i = 0; i < 3; i++) {
        const x = ((t * (30 + i * 15) + i * 300) % (this.w + 500)) - 250;
        const g = ctx.createRadialGradient(x, this.h * (0.35 + i * 0.18), 10, x, this.h * 0.5, 300);
        g.addColorStop(0, 'rgba(196,204,196,0.10)');
        g.addColorStop(1, 'rgba(196,204,196,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, this.w, this.h);
      }
    }
    if (w.flash > 0) {
      ctx.fillStyle = `rgba(220,232,238,${w.flash * 0.4})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  drawScreenFx(ctx) {
    const g = this.game;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // vignette
    const vg = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.28, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.7, 'rgba(4,7,6,0.18)');
    vg.addColorStop(1, 'rgba(2,4,3,0.62)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, this.w, this.h);
    if (g.damageFlash > 0) {
      const v = ctx.createRadialGradient(this.w / 2, this.h / 2, this.h * 0.25, this.w / 2, this.h / 2, this.h * 0.75);
      v.addColorStop(0, 'rgba(120,20,14,0)');
      v.addColorStop(1, `rgba(150,26,18,${0.45 * g.damageFlash})`);
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    if (g.player && g.player.health < 30 && !g.dead) {
      const pulse = 0.12 + Math.sin(this.time * 4) * 0.05;
      const v = ctx.createRadialGradient(this.w / 2, this.h / 2, this.h * 0.2, this.w / 2, this.h / 2, this.h * 0.7);
      v.addColorStop(0, 'rgba(120,16,12,0)');
      v.addColorStop(1, `rgba(140,20,16,${pulse})`);
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    if (g.fade > 0.001) {
      ctx.fillStyle = `rgba(4,6,5,${clamp(g.fade, 0, 1)})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  // ---------------------------------------------------------------- maps
  ensureFog() {
    const world = this.game.world;
    if (!this.fogCanvas) {
      this.fogCanvas = document.createElement('canvas');
      this.fogCanvas.width = world.size * 2;
      this.fogCanvas.height = world.size * 2;
    }
    const now = this.time;
    if (!world.exploredDirty && now - this.minimapCache.t < 2) return this.fogCanvas;
    if (now - this.minimapCache.t < 0.8) return this.fogCanvas;
    this.minimapCache.t = now;
    world.exploredDirty = false;
    const f = this.fogCanvas.getContext('2d');
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.globalCompositeOperation = 'source-over';
    f.clearRect(0, 0, world.size * 2, world.size * 2);
    f.fillStyle = 'rgba(7,10,8,0.90)';
    f.fillRect(0, 0, world.size * 2, world.size * 2);
    f.globalCompositeOperation = 'destination-out';
    f.fillStyle = '#fff';
    for (let y = 0; y < world.size; y++) {
      for (let x = 0; x < world.size; x++) {
        if (world.explored[y * world.size + x]) f.fillRect(x * 2, y * 2, 2, 2);
      }
    }
    f.globalCompositeOperation = 'source-over';
    return this.fogCanvas;
  }

  drawMinimap(canvas, game) {
    const c = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const world = game.world;
    const p = game.player;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#1b211b';
    c.fillRect(0, 0, w, h);
    if (!world.mapImage) return;
    // A local window is far more useful on a small screen than the whole map.
    const win = 38; // tiles across
    const scale2 = world.mapImage.width / world.size; // 2 px per tile
    const mapW = world.mapImage.width, mapH = world.mapImage.height;
    const srcW = Math.min(win * scale2, mapW);
    const srcH = Math.min(win * scale2, mapH);
    // Clamp the crop so the source rectangle never leaves the map. Near an
    // edge the player marker slides toward the border instead of vanishing.
    const sx = clamp((p.x - win / 2) * scale2, 0, Math.max(0, mapW - srcW));
    const sy = clamp((p.y - win / 2) * scale2, 0, Math.max(0, mapH - srcH));
    c.drawImage(world.mapImage, sx, sy, srcW, srcH, 0, 0, w, h);
    const fog = this.ensureFog();
    c.drawImage(fog, sx, sy, srcW, srcH, 0, 0, w, h);
    // local player marker, centered unless the crop was clamped at an edge
    const px = ((p.x * scale2) - sx) * (w / srcW);
    const py = ((p.y * scale2) - sy) * (h / srcH);
    const sf = this.screenFacing(p.facing);
    const ang = Math.atan2(sf.y, sf.x);
    c.save();
    c.translate(px, py);
    c.rotate(ang + Math.PI / 2);
    c.fillStyle = '#f5d28a';
    c.strokeStyle = 'rgba(18,22,16,0.9)';
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(0, -6.5); c.lineTo(4.2, 5); c.lineTo(0, 3); c.lineTo(-4.2, 5); c.closePath();
    c.fill(); c.stroke();
    c.restore();
    if (world.waypoint) {
      const wx = ((world.waypoint.x * scale2) - sx) * (w / srcW);
      const wy = ((world.waypoint.y * scale2) - sy) * (h / srcH);
      c.strokeStyle = '#e8a33d';
      c.lineWidth = 1.5;
      c.beginPath(); c.arc(wx, wy, 4, 0, 6.3); c.stroke();
    }
    c.fillStyle = 'rgba(238,230,206,0.6)';
    c.font = '600 8px ui-monospace, monospace';
    c.textAlign = 'center';
    c.fillText('N', w / 2, 10);
  }

  drawWorldMap(canvas, game) {
    const world = game.world;
    const S = 900;
    if (canvas.width !== S) { canvas.width = S; canvas.height = S; }
    const c = canvas.getContext('2d');
    const margin = 34;
    const size = S - margin * 2;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#111610';
    c.fillRect(0, 0, S, S);
    c.drawImage(world.mapImage, margin, margin, size, size);
    c.drawImage(this.ensureFog(), margin, margin, size, size);
    c.strokeStyle = 'rgba(230,214,170,0.18)';
    c.lineWidth = 1;
    c.strokeRect(margin, margin, size, size);
    // street grid subtle lines omitted; map image already has them
    const major = ['police', 'hospital', 'school', 'store', 'gas', 'warehouse', 'pharmacy', 'diner'];
    c.textAlign = 'center';
    for (const b of world.buildings) {
      if (!b.discovered) continue;
      const x = margin + ((b.x + b.w / 2) / world.size) * size;
      const y = margin + ((b.y + b.h / 2) / world.size) * size;
      if (!major.includes(b.type)) {
        c.fillStyle = 'rgba(224,208,170,0.30)';
        c.fillRect(x - 1.5, y - 1.5, 3, 3);
        continue;
      }
      c.fillStyle = b.type === 'police' ? '#9db7c8' : b.type === 'hospital' ? '#d9b3a4' : '#e0c58a';
      c.beginPath(); c.arc(x, y, 3.6, 0, 6.3); c.fill();
      c.font = '600 12px ui-monospace, monospace';
      const label = b.name.toUpperCase();
      const tw = c.measureText(label).width;
      c.fillStyle = 'rgba(10,13,10,0.7)';
      roundRect(c, x - tw / 2 - 5, y - 23, tw + 10, 15, 3);
      c.fill();
      c.fillStyle = 'rgba(238,229,204,0.86)';
      c.fillText(label, x, y - 12);
    }
    // lake label
    const lx = margin + (18 / world.size) * size, ly = margin + (46 / world.size) * size;
    c.font = 'italic 13px Georgia, serif';
    c.fillStyle = 'rgba(160,196,200,0.6)';
    c.fillText('Lake Mira', lx, ly);
    // player
    const px = margin + (game.player.x / world.size) * size;
    const py = margin + (game.player.y / world.size) * size;
    const sf = this.screenFacing(game.player.facing);
    const ang = Math.atan2(sf.y, sf.x);
    c.save();
    c.translate(px, py);
    c.rotate(ang + Math.PI / 2);
    c.fillStyle = '#f4ce80';
    c.strokeStyle = 'rgba(20,24,18,0.9)';
    c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(0, -9); c.lineTo(6, 6); c.lineTo(0, 3); c.lineTo(-6, 6); c.closePath();
    c.fill(); c.stroke();
    c.restore();
    if (world.waypoint) {
      const wx = margin + (world.waypoint.x / world.size) * size;
      const wy = margin + (world.waypoint.y / world.size) * size;
      c.strokeStyle = '#e8a33d';
      c.lineWidth = 2;
      c.beginPath(); c.arc(wx, wy, 6, 0, 6.3); c.stroke();
      c.beginPath(); c.moveTo(wx - 9, wy); c.lineTo(wx + 9, wy); c.moveTo(wx, wy - 9); c.lineTo(wx, wy + 9); c.stroke();
    }
    c.fillStyle = 'rgba(238,230,206,0.55)';
    c.font = '600 13px ui-monospace, monospace';
    c.fillText('N', S / 2, 22);
    this.lastMapTransform = { ox: margin, oy: margin, size };
  }

  mapClickToWorld(mx, my) {
    const t = this.lastMapTransform;
    if (!t) return null;
    const world = this.game.world;
    const x = ((mx - t.ox) / t.size) * world.size;
    const y = ((my - t.oy) / t.size) * world.size;
    if (x < 0 || y < 0 || x >= world.size || y >= world.size) return null;
    return { x, y };
  }
}


