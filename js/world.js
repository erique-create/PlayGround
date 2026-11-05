import { RNG, clamp, hash2, lineOfSight, dist } from './utils.js';
import { ITEMS, LOOT, CONTAINERS, BUILDINGS } from './config.js';

export const WORLD_SIZE = 128;

export const T = {
  GRASS: 0, DIRT: 1, ASPHALT: 2, SIDEWALK: 3, WOOD: 4, TILE: 5,
  WATER: 6, SAND: 7, FARM: 8, CONCRETE: 9, GRAVEL: 10,
};

export const ROADS = [
  { axis: 'h', at: 62, w: 4, from: 0, to: 128, name: 'Main Street', type: 'asphalt', sidewalk: true },
  { axis: 'v', at: 64, w: 4, from: 0, to: 128, name: 'Main Street', type: 'asphalt', sidewalk: true },
  { axis: 'h', at: 36, w: 3, from: 14, to: 112, name: 'Ash Street', type: 'asphalt', sidewalk: true },
  { axis: 'h', at: 88, w: 3, from: 14, to: 112, name: 'Willow Lane', type: 'asphalt', sidewalk: true },
  { axis: 'v', at: 36, w: 3, from: 14, to: 112, name: 'Cedar Avenue', type: 'asphalt', sidewalk: true },
  { axis: 'v', at: 90, w: 3, from: 14, to: 112, name: 'Foundry Road', type: 'asphalt', sidewalk: true },
  { axis: 'h', at: 20, w: 2, from: 6, to: 106, name: 'Ridge Track', type: 'dirt' },
  { axis: 'v', at: 112, w: 2, from: 18, to: 120, name: 'Quarry Track', type: 'dirt' },
  { axis: 'h', at: 108, w: 2, from: 20, to: 122, name: 'Old Mill Track', type: 'dirt' },
];

// Hand-authored town layout. Every building has a south-facing door.
const BUILDING_SPECS = [
  // Central commercial block
  ['store', 69, 41], ['pharmacy', 81, 41], ['diner', 69, 52], ['police', 80, 52],
  // Central residential blocks
  ['house', 41, 41], ['house', 50, 41], ['house', 41, 50], ['house', 51, 50],
  ['school', 40, 67], ['house', 54, 68], ['house', 54, 76], ['store', 40, 78],
  // Industrial east block
  ['warehouse', 69, 67], ['garage', 81, 68], ['warehouse', 69, 77],
  // East side
  ['gas', 94, 41], ['house', 94, 51], ['hospital', 94, 67], ['house', 94, 79],
  // Farms and outskirts
  ['farmhouse', 69, 94], ['warehouse', 77, 95], ['farmhouse', 42, 94], ['cabin', 52, 96],
  ['farmhouse', 96, 95], ['cabin', 44, 24], ['cabin', 52, 26],
  ['house', 70, 24], ['house', 79, 24], ['farmhouse', 96, 24],
  ['house', 23, 40], ['cabin', 23, 50], ['store', 23, 68], ['house', 23, 78], ['cabin', 23, 25],
];

const PROP_SOLID = {
  bed: true, stove: true, table: true, sofa: true, crate_prop: true, well: true,
  tree: true, car: true, streetlight: true, bench: true, trashcan: true, fence: true,
  chair: false, plant: false, bush: false, sign: false, rug: false,
};

const PROP_PREF = {
  bed: [[1, 1], [1, 2], [2, 1]],
  stove: [[7, 1], [6, 1], [1, 3]],
  table: [[3, 3], [4, 3], [3, 2]],
  chair: [[3, 4], [4, 4], [2, 3]],
  sofa: [[2, 1], [3, 1], [4, 1]],
  plant: [[1, 5], [5, 1], [1, 1]],
  crate_prop: [[1, 1], [5, 1], [1, 4]],
  rug: [[3, 3], [2, 2]],
};

const FLOOR_TERRAIN = { wood: T.WOOD, tile: T.TILE, concrete: T.CONCRETE };

export class World {
  constructor(seed, difficulty = { loot: 1 }, size = WORLD_SIZE) {
    this.seed = seed >>> 0;
    this.size = size;
    this.difficulty = difficulty;
    this.rng = new RNG(this.seed ^ 0x9e3779b9);
    this.terrain = new Uint8Array(size * size);
    this.solid = new Uint8Array(size * size);
    this.wall = new Uint8Array(size * size);
    this.roadLine = new Uint8Array(size * size);
    this.roadGrid = new Uint8Array(size * size);
    this.wallOwner = new Int16Array(size * size).fill(-1);
    this.explored = new Uint8Array(size * size);
    this.reserved = new Uint8Array(size * size);
    this.buildingAt = new Int16Array(size * size).fill(-1);
    this.buildings = [];
    this.containers = [];
    this.props = [];
    this.structures = [];
    this.fields = [];
    this.roads = ROADS.map(r => ({ ...r }));
    this.waypoint = null;
    this.spawn = { x: 48.5, y: 58.2 };
    this.generate();
  }

  idx(x, y) { return (y | 0) * this.size + (x | 0); }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.size && y < this.size; }
  terrainAt(x, y) {
    if (!this.inBounds(x, y)) return T.WATER;
    return this.terrain[this.idx(x, y)];
  }
  solidAt(x, y) {
    if (!this.inBounds(x, y)) return true;
    return this.solid[this.idx(x, y)] === 1;
  }
  walkable(x, y) {
    if (!this.inBounds(x, y)) return false;
    const i = this.idx(x, y);
    return this.solid[i] === 0 && this.terrain[i] !== T.WATER;
  }

  generate() {
    this.fillTerrain();
    this.carveLake();
    this.carveRoads();
    this.placeBuildings();
    this.placeFields();
    this.placeTrees();
    this.placeRoadProps();
    this.placeExtraProps();
    this.spawn = this.findSpawn();
    this.markExplored(this.spawn.x, this.spawn.y, 13);
    this.discoverBuildings(this.spawn.x, this.spawn.y, 20);
    this.mapImage = this.buildMapImage();
  }

  fillTerrain() {
    const { size, rng } = this;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let t = T.GRASS;
      const n = hash2(x >> 2, y >> 2, this.seed);
      if (n > 0.82) t = T.DIRT;
      this.terrain[this.idx(x, y)] = t;
      this.roadLine[this.idx(x, y)] = 0;
    }
  }

  carveLake() {
    const { size } = this;
    const cx = 18, cy = 46, rx = 10.5, ry = 7.5;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      const wobble = (hash2(x, y, this.seed + 3) - 0.5) * 0.22;
      if (d + wobble < 1) {
        const i = this.idx(x, y);
        this.terrain[i] = T.WATER;
        this.solid[i] = 1;
      } else if (d + wobble < 1.3) {
        this.terrain[this.idx(x, y)] = T.SAND;
      }
    }
  }

  carveRoads() {
    for (const r of this.roads) {
      const start = Math.min(r.from, r.to), end = Math.max(r.from, r.to);
      if (r.axis === 'h') {
        for (let x = start; x < end; x++) for (let w = 0; w < r.w; w++) {
          const y = r.at + w;
          if (!this.inBounds(x, y)) continue;
          const i = this.idx(x, y);
          this.terrain[i] = r.type === 'dirt' ? T.DIRT : T.ASPHALT;
          this.roadGrid[i] = 1;
          this.solid[i] = 0;
          if (r.type === 'asphalt' && w === Math.floor(r.w / 2)) this.roadLine[i] = 1;
        }
      } else {
        for (let y = start; y < end; y++) for (let w = 0; w < r.w; w++) {
          const x = r.at + w;
          if (!this.inBounds(x, y)) continue;
          const i = this.idx(x, y);
          this.terrain[i] = r.type === 'dirt' ? T.DIRT : T.ASPHALT;
          this.roadGrid[i] = 1;
          this.solid[i] = 0;
          if (r.type === 'asphalt' && w === Math.floor(r.w / 2)) this.roadLine[i] = 2;
        }
      }
    }
    // sidewalks on grass shoulders of paved city streets
    for (const r of this.roads) {
      if (!r.sidewalk) continue;
      const start = Math.min(r.from, r.to), end = Math.max(r.from, r.to);
      const paint = (x, y) => {
        if (!this.inBounds(x, y)) return;
        const i = this.idx(x, y);
        if (this.terrain[i] === T.GRASS || this.terrain[i] === T.DIRT) {
          this.terrain[i] = T.SIDEWALK;
          this.solid[i] = 0;
        }
      };
      if (r.axis === 'h') {
        for (let x = start; x < end; x++) { paint(x, r.at - 1); paint(x, r.at + r.w); }
      } else {
        for (let y = start; y < end; y++) { paint(r.at - 1, y); paint(r.at + r.w, y); }
      }
    }
    // Intersections lose their centre line.
    for (const r of this.roads) {
      if (r.type !== 'asphalt') continue;
      const start = Math.min(r.from, r.to), end = Math.max(r.from, r.to);
      for (const q of this.roads) {
        if (q === r || q.type !== 'asphalt') continue;
        const qs = Math.min(q.from, q.to), qe = Math.max(q.from, q.to);
        if (r.axis === q.axis) continue;
        if (r.axis === 'h') {
          const y0 = Math.max(r.at, q.at), y1 = Math.min(r.at + r.w, q.at + q.w);
          const x0 = Math.max(start, qs), x1 = Math.min(end, qe);
          for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) this.roadLine[this.idx(x, y)] = 0;
        }
      }
    }
  }

  footprintFree(x, y, w, h) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      if (!this.inBounds(xx, yy)) return false;
      const t = this.terrain[this.idx(xx, yy)];
      if (t === T.WATER || t === T.ASPHALT || t === T.SIDEWALK) return false;
      if (this.roadGrid[this.idx(xx, yy)]) return false;
      if (this.buildingAt[this.idx(xx, yy)] >= 0) return false;
    }
    // one clear tile in front of the door
    const doorX = x + Math.floor(w / 2);
    if (!this.walkable(doorX, y + h)) return false;
    return true;
  }

  placeBuildings() {
    for (const [type, x, y] of BUILDING_SPECS) {
      const a = BUILDINGS[type];
      if (!a) continue;
      if (!this.footprintFree(x, y, a.w, a.h)) {
        // Nudge once to keep authored content resilient if roads change.
        if (this.footprintFree(x + 1, y, a.w, a.h)) this.addBuilding(type, x + 1, y, a);
        else continue;
      } else {
        this.addBuilding(type, x, y, a);
      }
    }
    // A handful of unreserved houses make the outskirts feel lived in.
    const extras = [
      ['house', 50, 97], ['cabin', 25, 96], ['house', 75, 108], ['cabin', 35, 28], ['house', 108, 44],
    ];
    for (const [type, x, y] of extras) {
      const a = BUILDINGS[type];
      if (a && this.footprintFree(x, y, a.w, a.h)) this.addBuilding(type, x, y, a);
    }
  }

  addBuilding(type, x, y, a) {
    const w = a.w, h = a.h;
    const id = this.buildings.length;
    const rng = this.rng;
    // The school is the authored extraction landmark used by the objective UI.
    const name = type === 'school' ? 'Havenwood High' : rng.pick(a.names);
    const b = {
      id, type, name, x, y, w, h, wall: a.wall, trim: a.trim, floor: a.floor,
      doorX: x + Math.floor(w / 2), doorY: y + h - 1,
      discovered: false, containers: [],
    };
    this.buildings.push(b);
    const floor = FLOOR_TERRAIN[a.floor] ?? T.WOOD;
    // interior floor
    for (let yy = y + 1; yy < y + h - 1; yy++) for (let xx = x + 1; xx < x + w - 1; xx++) {
      const i = this.idx(xx, yy);
      this.terrain[i] = floor;
      this.buildingAt[i] = id;
      this.solid[i] = 0;
    }
    for (let xx = x; xx < x + w; xx++) this.buildingAt[this.idx(xx, y + h - 1)] = id;
    // perimeter walls, windows, door
    for (let xx = x; xx < x + w; xx++) {
      for (const yy of [y, y + h - 1]) {
        if (yy === y + h - 1 && xx === b.doorX) {
          this.wall[this.idx(xx, yy)] = 0;
          this.solid[this.idx(xx, yy)] = 0;
          this.terrain[this.idx(xx, yy)] = floor;
          continue;
        }
        const corner = xx === x || xx === x + w - 1;
        const window = !corner && hash2(xx, yy, this.seed + id) > 0.62;
        this.wall[this.idx(xx, yy)] = window ? 2 : 1;
        this.wallOwner[this.idx(xx, yy)] = id;
        this.solid[this.idx(xx, yy)] = 1;
        this.terrain[this.idx(xx, yy)] = floor;
      }
    }
    for (let yy = y + 1; yy < y + h - 1; yy++) {
      for (const xx of [x, x + w - 1]) {
        const window = hash2(xx, yy, this.seed + id) > 0.6;
        this.wall[this.idx(xx, yy)] = window ? 2 : 1;
        this.wallOwner[this.idx(xx, yy)] = id;
        this.solid[this.idx(xx, yy)] = 1;
        this.terrain[this.idx(xx, yy)] = floor;
      }
    }
    // interior partition for larger buildings, with a gap by the entrance
    if (w >= 10) {
      const px = x + Math.floor(w / 2);
      for (let yy = y + 1; yy <= y + h - 3; yy++) {
        if (yy === y + h - 2) continue;
        const i = this.idx(px, yy);
        if (this.wall[i] === 0) {
          this.wall[i] = 3;
          this.wallOwner[i] = id;
          this.solid[i] = 1;
        }
      }
    }
    // reserved ring + door approach
    for (let yy = y - 1; yy <= y + h + 1; yy++) for (let xx = x - 1; xx <= x + w + 1; xx++) {
      if (this.inBounds(xx, yy)) this.reserved[this.idx(xx, yy)] = 1;
    }
    for (let yy = y + h; yy <= y + h + 2; yy++) {
      if (this.inBounds(b.doorX, yy)) this.reserved[this.idx(b.doorX, yy)] = 1;
    }
    this.populateInterior(b, a, rng);
  }

  populateInterior(b, a, rng) {
    const x1 = b.x + 1, y1 = b.y + 1, x2 = b.x + b.w - 2, y2 = b.y + b.h - 2;
    const corridor = (x, y) => (x === b.doorX && y >= y1 && y <= y2) || (y === y2 && Math.abs(x - b.doorX) <= 1);
    const slots = [];
    for (let x = x1; x <= x2; x++) slots.push({ x, y: y1 });
    for (let y = y1 + 1; y <= y2; y++) slots.push({ x: x1, y });
    for (let y = y1 + 1; y <= y2; y++) slots.push({ x: x2, y });
    for (let x = x1; x <= x2; x++) slots.push({ x, y: y2 });
    // Also allow a second interior ring on big rooms.
    if (b.w >= 9 || b.h >= 9) {
      for (let x = x1 + 1; x <= x2 - 1; x++) slots.push({ x, y: y1 + 1 });
      for (let x = x1 + 1; x <= x2 - 1; x++) slots.push({ x, y: y2 - 1 });
    }
    rng.shuffle(slots);
    const used = new Set();
    for (const ctype of a.containers) {
      const def = CONTAINERS[ctype];
      if (!def) continue;
      let slot = null;
      for (const s of slots) {
        if (used.has(s.x + ',' + s.y)) continue;
        if (corridor(s.x, s.y)) continue;
        const i = this.idx(s.x, s.y);
        if (this.solid[i] || this.wall[i]) continue;
        slot = s; break;
      }
      if (!slot) continue;
      const i = this.idx(slot.x, slot.y);
      this.solid[i] = 1;
      used.add(slot.x + ',' + slot.y);
      const container = this.makeContainer(ctype, slot.x, slot.y, b);
      b.containers.push(container.id);
    }
    for (const ptype of a.props || []) {
      if (!PROP_PREF[ptype]) continue;
      let pos = null;
      const prefs = PROP_PREF[ptype] || [];
      for (const [dx, dy] of prefs) {
        const x = x1 + dx, y = y1 + dy;
        if (x < x1 || x > x2 || y < y1 || y > y2) continue;
        if (corridor(x, y)) continue;
        const i = this.idx(x, y);
        if (this.solid[i] || this.wall[i]) continue;
        pos = { x, y };
        break;
      }
      if (!pos) {
        for (const s of slots) {
          if (corridor(s.x, s.y) || used.has(s.x + ',' + s.y)) continue;
          const i = this.idx(s.x, s.y);
          if (this.solid[i] || this.wall[i]) continue;
          pos = { x: s.x, y: s.y }; break;
        }
      }
      if (!pos) continue;
      if (PROP_SOLID[ptype]) this.solid[this.idx(pos.x, pos.y)] = 1;
      used.add(pos.x + ',' + pos.y);
      this.props.push({ type: ptype, x: pos.x, y: pos.y, variant: rng.int(0, 3), inside: b.id, solid: !!PROP_SOLID[ptype] });
    }
  }

  makeContainer(type, x, y, b) {
    const def = CONTAINERS[type] || CONTAINERS.crate;
    const rng = this.rng;
    const items = [];
    const table = LOOT[def.loot] || LOOT.household;
    const draws = rng.int(2, 4) + (this.difficulty.loot > 1.2 ? 1 : 0);
    for (let k = 0; k < draws; k++) {
      if (rng.chance(0.08)) continue;
      const e = rng.weighted(table);
      let qty = rng.int(e.q[0], e.q[1]);
      const item = ITEMS[e.id];
      if (!item) continue;
      if (!item.stack) qty = 1;
      qty = Math.max(1, Math.round(qty * (this.difficulty.loot || 1)));
      const existing = items.find(it => it.id === e.id && !it.dur);
      if (existing) existing.qty = Math.min(item.stack, existing.qty + qty);
      else {
        const entry = { id: e.id, qty };
        if (item.dur) entry.dur = Math.round(item.dur * rng.float(0.45, 1));
        items.push(entry);
      }
    }
    if (rng.chance(0.06 * (this.difficulty.loot || 1))) {
      items.push({ id: rng.pick(['bandage', 'battery', 'ammo', 'map_item']), qty: 1 });
    }
    const id = 'c' + this.containers.length;
    const c = {
      id, type, name: def.name, color: def.color, icon: def.icon || '', x, y,
      items, searched: false, building: b ? b.name : '',
    };
    this.containers.push(c);
    return c;
  }

  placeFields() {
    const fields = [
      { x: 40, y: 102, w: 10, h: 5 }, { x: 50, y: 92, w: 10, h: 3 },
      { x: 68, y: 105, w: 9, h: 2 }, { x: 94, y: 104, w: 12, h: 3 },
      { x: 96, y: 32, w: 10, h: 2 }, { x: 29, y: 30, w: 4, h: 3 },
    ];
    for (const f of fields) {
      let ok = true;
      for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) {
        if (!this.inBounds(x, y)) { ok = false; break; }
        if (this.buildingAt[this.idx(x, y)] >= 0 || this.roadGrid[this.idx(x, y)]) { ok = false; break; }
        const t = this.terrainAt(x, y);
        if (t !== T.GRASS && t !== T.DIRT) { ok = false; break; }
      }
      if (!ok) continue;
      for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) {
        this.terrain[this.idx(x, y)] = T.FARM;
        this.reserved[this.idx(x, y)] = 1;
      }
      this.fields.push(f);
    }
  }

  placeTrees() {
    const { size, rng } = this;
    let planted = 0;
    for (let attempt = 0; attempt < 5200 && planted < 900; attempt++) {
      const x = rng.int(1, size - 2), y = rng.int(1, size - 2);
      let p = 0.02;
      if (x < 13 || y < 14 || x > size - 13 || y > size - 14) p = 0.34;
      else if (x < 32 || y < 34 || x > 101 || y > 105) p = 0.12;
      if (x > 6 && x < 32 && y > 36 && y < 58) p = 0.2; // lake shore
      if (rng.next() > p) continue;
      if (this.reserved[this.idx(x, y)] || !this.walkable(x, y)) continue;
      const t = this.terrainAt(x, y);
      if (t !== T.GRASS && t !== T.DIRT) continue;
      if (dist(x, y, this.spawn.x, this.spawn.y) < 9) continue;
      // Keep road shoulders clear and avoid solid walls.
      let nearRoad = false;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (this.terrainAt(x + ox, y + oy) === T.ASPHALT || this.terrainAt(x + ox, y + oy) === T.SIDEWALK) nearRoad = true;
      }
      if (nearRoad && rng.chance(0.7)) continue;
      if (this.solidAt(x, y)) continue;
      this.solid[this.idx(x, y)] = 1;
      this.props.push({ type: 'tree', x, y, variant: rng.int(0, 5), solid: true });
      planted++;
    }
    // low bushes are pure decoration
    for (let i = 0; i < 260; i++) {
      const x = rng.int(2, size - 3), y = rng.int(2, size - 3);
      if (this.solidAt(x, y) || !this.walkable(x, y)) continue;
      const t = this.terrainAt(x, y);
      if (t !== T.GRASS && t !== T.DIRT) continue;
      if (dist(x, y, this.spawn.x, this.spawn.y) < 4) continue;
      this.props.push({ type: 'bush', x, y, variant: rng.int(0, 4), solid: false });
    }
  }

  placeRoadProps() {
    const { rng } = this;
    // Street lights along paved roads, placed on sidewalks.
    let count = 0;
    for (const r of this.roads) {
      if (r.type !== 'asphalt') continue;
      const start = Math.min(r.from, r.to), end = Math.max(r.from, r.to);
      for (let p = start + 8; p < end - 4; p += 19) {
        const x = r.axis === 'h' ? p : r.at - 1;
        const y = r.axis === 'h' ? r.at - 1 : p;
        if (!this.walkable(x, y) || this.solidAt(x, y)) continue;
        const t = this.terrainAt(x, y);
        if (t !== T.SIDEWALK && t !== T.GRASS && t !== T.DIRT) continue;
        if (this.reserved[this.idx(x, y)]) continue;
        if (dist(x, y, this.spawn.x, this.spawn.y) < 3) continue;
        this.solid[this.idx(x, y)] = 1;
        this.props.push({ type: 'streetlight', x, y, variant: rng.int(0, 2), solid: true, light: 6.5 });
        count++;
        if (count > 40) break;
      }
    }
    // abandoned cars + lootable trunks
    const carSpots = [
      [56, 63, 'h'], [72, 64, 'h'], [95, 63, 'h'], [17, 64, 'h'],
      [36, 74, 'v'], [38, 46, 'v'], [91, 55, 'v'], [26, 37, 'h'],
      [48, 88, 'h'], [106, 85, 'v'],
    ];
    const colors = ['#7a4438', '#445d64', '#6b6a55', '#3f4a42', '#74624a'];
    for (const [x, y] of carSpots) {
      if (!this.walkable(x, y) || this.solidAt(x, y)) continue;
      const t = this.terrainAt(x, y);
      if (t !== T.ASPHALT) continue;
      if (this.reserved[this.idx(x, y)]) continue;
      this.solid[this.idx(x, y)] = 1;
      const container = this.makeContainer('trunk', x, y, null);
      this.props.push({
        type: 'car', x, y, variant: rng.int(0, 4), solid: true,
        color: rng.pick(colors), containerId: container.id,
      });
    }
    // Dumpsters behind commercial buildings
    for (const b of this.buildings) {
      if (!['store', 'diner', 'pharmacy', 'school', 'hospital'].includes(b.type)) continue;
      const x = b.x + b.w + 1, y = b.y + b.h - 2;
      if (!this.walkable(x, y) || this.solidAt(x, y) || this.reserved[this.idx(x, y)]) continue;
      this.solid[this.idx(x, y)] = 1;
      const container = this.makeContainer('dumpster', x, y, b);
      this.props.push({ type: 'dumpster', x, y, variant: 0, solid: true, containerId: container.id, color: container.color });
    }
  }

  placeExtraProps() {
    const rng = this.rng;
    const spots = [
      ['bench', 46, 60], ['bench', 47, 60], ['trashcan', 45, 60],
      ['well', 38, 92], ['sign', 67, 60], ['sign', 60, 35], ['bench', 70, 60],
      ['trashcan', 87, 48], ['trashcan', 68, 48], ['sign', 93, 62],
    ];
    for (const [type, x, y] of spots) {
      if (!this.walkable(x, y) || this.solidAt(x, y)) continue;
      if (this.reserved[this.idx(x, y)]) continue;
      if (PROP_SOLID[type]) this.solid[this.idx(x, y)] = 1;
      this.props.push({ type, x, y, variant: rng.int(0, 3), solid: !!PROP_SOLID[type] });
    }
    // Farm fences and porch clutter
    for (const b of this.buildings) {
      if (!['farmhouse', 'cabin'].includes(b.type)) continue;
      for (let k = 0; k < 5; k++) {
        const x = b.x + b.w + 2 + k, y = b.y + 2;
        if (this.walkable(x, y) && !this.solidAt(x, y) && !this.reserved[this.idx(x, y)]) {
          this.solid[this.idx(x, y)] = 1;
          this.props.push({ type: 'fence', x, y, variant: k, solid: true });
        }
      }
    }
  }

  findSpawn() {
    // Prefer the authored clearing between the central houses.
    const candidates = [
      [48.5, 58.2], [48.5, 59.0], [49.5, 58.5], [50.5, 58.4], [46.5, 58.6],
      [44.5, 59.0], [52.5, 58.6], [58.5, 58.6],
    ];
    for (const [x, y] of candidates) {
      if (this.walkable(x, y) && this.walkable(x + 0.3, y) && this.walkable(x, y + 0.3)) return { x, y };
    }
    // fallback: nearest open tile to town center
    for (let r = 1; r < 40; r++) {
      for (let y = 64 - r; y <= 64 + r; y++) for (let x = 64 - r; x <= 64 + r; x++) {
        if (this.walkable(x + 0.5, y + 0.5)) return { x: x + 0.5, y: y + 0.5 };
      }
    }
    return { x: 64, y: 60 };
  }

  markExplored(cx, cy, radius = 10) {
    this.exploredDirty = true;
    const r2 = radius * radius;
    for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(this.size - 1, Math.ceil(cy + radius)); y++) {
      for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(this.size - 1, Math.ceil(cx + radius)); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) this.explored[this.idx(x, y)] = 1;
      }
    }
  }

  discoverBuildings(cx, cy, radius = 14) {
    for (const b of this.buildings) {
      if (b.discovered) continue;
      const bx = b.x + b.w / 2, by = b.y + b.h / 2;
      if ((bx - cx) ** 2 + (by - cy) ** 2 < radius ** 2) b.discovered = true;
      else if (this.hasLineOfSight(cx, cy, bx, by) && dist(cx, cy, bx, by) < radius * 1.6) b.discovered = true;
    }
  }

  hasLineOfSight(x0, y0, x1, y1) {
    return lineOfSight(this.solid, this.size, this.size, x0, y0, x1, y1);
  }

  buildingInside(x, y) {
    if (!this.inBounds(x, y)) return null;
    const id = this.buildingAt[this.idx(x, y)];
    return id >= 0 ? this.buildings[id] : null;
  }

  locationName(x, y) {
    const b = this.buildingInside(x, y);
    if (b) return b.name;
    if (this.terrainAt(x, y) === T.WATER) return 'Lake Mira';
    if (dist(x, y, 18, 46) < 17) return 'Lake Mira Shore';
    if (y < 34) return 'Blackpine Forest';
    if (x > 101) return 'Foundry District';
    if (y > 101) return 'Old Fields';
    if (x < 32) return 'Cedar Farms';
    const road = this.nearRoadName(x, y);
    if (road) return road;
    return 'Havenwood';
  }

  nearRoadName(x, y) {
    for (const r of this.roads) {
      if (r.axis === 'h' && Math.abs(y - (r.at + r.w / 2)) < r.w / 2 + 1.5 && x >= Math.min(r.from, r.to) && x <= Math.max(r.from, r.to)) return r.name;
      if (r.axis === 'v' && Math.abs(x - (r.at + r.w / 2)) < r.w / 2 + 1.5 && y >= Math.min(r.from, r.to) && y <= Math.max(r.from, r.to)) return r.name;
    }
    return '';
  }

  getContainer(id) { return this.containers.find(c => c.id === id); }

  nearestContainer(x, y, radius = 1.7) {
    let best = null, bd = radius * radius;
    for (const c of this.containers) {
      const d = (c.x + 0.5 - x) ** 2 + (c.y + 0.5 - y) ** 2;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  nearestProp(x, y, radius = 1.7, types = null) {
    let best = null, bd = radius * radius;
    for (const p of this.props) {
      if (types && !types.includes(p.type)) continue;
      const d = (p.x + 0.5 - x) ** 2 + (p.y + 0.5 - y) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  buildingContainers(b) {
    return b.containers.map(id => this.getContainer(id)).filter(Boolean);
  }

  buildMapImage() {
    const scale = 2;
    const size = this.size * scale;
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const colors = {
      [T.GRASS]: '#3b4935', [T.DIRT]: '#514735', [T.ASPHALT]: '#373b3a', [T.SIDEWALK]: '#5a5b50',
      [T.WOOD]: '#5a4732', [T.TILE]: '#56574e', [T.WATER]: '#243d47', [T.SAND]: '#80745a',
      [T.FARM]: '#4b532f', [T.CONCRETE]: '#4b4c47', [T.GRAVEL]: '#5a5446',
    };
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) {
      ctx.fillStyle = colors[this.terrain[this.idx(x, y)]] || '#3b4935';
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
    // building footprints
    for (const b of this.buildings) {
      ctx.fillStyle = '#6d6556';
      ctx.fillRect(b.x * scale, b.y * scale, b.w * scale, b.h * scale);
      ctx.fillStyle = '#2e2c25';
      ctx.fillRect((b.x + 1) * scale, (b.y + 1) * scale, (b.w - 2) * scale, (b.h - 2) * scale);
      ctx.fillStyle = '#7d6f57';
      ctx.fillRect(b.doorX * scale, (b.doorY) * scale, scale, scale);
    }
    ctx.strokeStyle = 'rgba(230,220,190,0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= this.size; i += 16) {
      ctx.beginPath(); ctx.moveTo(i * scale, 0); ctx.lineTo(i * scale, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * scale); ctx.lineTo(size, i * scale); ctx.stroke();
    }
    return c;
  }

  exploredCount() {
    let n = 0;
    for (let i = 0; i < this.explored.length; i++) if (this.explored[i]) n++;
    return n;
  }

  serialize() {
    return {
      seed: this.seed,
      explored: Array.from(this.explored).join(''),
      containers: this.containers.map(c => ({ id: c.id, items: c.items, searched: c.searched })),
      buildings: this.buildings.map(b => ({ id: b.id, discovered: b.discovered })),
      waypoint: this.waypoint,
    };
  }

  applySave(data) {
    if (!data) return;
    this.exploredDirty = true;
    if (data.explored && data.explored.length === this.explored.length) {
      for (let i = 0; i < data.explored.length; i++) this.explored[i] = data.explored[i] === '1' ? 1 : 0;
    }
    if (data.containers) {
      for (const sc of data.containers) {
        const c = this.getContainer(sc.id);
        if (!c) continue;
        c.items = sc.items || [];
        c.searched = !!sc.searched;
      }
    }
    if (data.buildings) {
      for (const sb of data.buildings) {
        const b = this.buildings[sb.id];
        if (b) b.discovered = !!sb.discovered;
      }
    }
    this.waypoint = data.waypoint || null;
  }
}
