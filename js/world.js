import { LOOT_TABLES, ITEMS, rollLoot } from './data.js';

export const T = {
  GRASS: 0, GRASS2: 1, ROAD: 2, SIDEWALK: 3, DIRT: 4, WATER: 5,
  WOOD: 6, TILE: 7, CONCRETE: 8, FIELD: 9, SAND: 10, BRIDGE: 11,
  PARK: 12, GRAVEL: 13, CROSSWALK: 14
};

export const TILE_W = 56;
export const TILE_H = 28;
export const WALL_H = 28;

function mulberry32(a) {
  return function () {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const key = (x, y) => x + ',' + y;

const ROOF_COLORS = ['#4d4b48', '#5a4a3d', '#3f4d4e', '#554840', '#47413c', '#5b5148'];
const WALL_COLORS = ['#8c7a63', '#9a8065', '#7d7468', '#a08b71', '#786f62'];

export function createWorld(seed = 20261105, difficulty = 'normal', lootMultiplier = 1) {
  const rng = mulberry32(seed);
  const size = 140;
  const ground = new Uint8Array(size * size);
  const solid = new Uint8Array(size * size);
  const wallType = new Uint8Array(size * size); // 1 wall, 2 window, 3 door
  const wallInfo = new Map();
  const buildings = [];
  const props = [];
  const containers = [];
  const vehicles = [];
  const locations = [];
  const streetLights = [];
  let nextId = 1;

  const idx = (x, y) => y * size + x;
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < size && y < size;
  const get = (x, y) => inBounds(x, y) ? ground[idx(x, y)] : T.WATER;
  const set = (x, y, t) => { if (inBounds(x, y)) ground[idx(x, y)] = t; };
  const isSolid = (x, y) => !inBounds(x, y) || solid[idx(x, y)] === 1;

  // ---- base terrain -------------------------------------------------------
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = Math.sin(x * 0.21) * Math.cos(y * 0.17) + Math.sin((x + y) * 0.07) * 0.6;
      set(x, y, n > 0.35 ? T.GRASS2 : T.GRASS);
    }
  }

  // Forest floor patches
  const forestFloors = [
    [0, 0, 30, 60], [0, 78, 30, 62], [107, 0, 33, 56], [108, 76, 32, 64], [0, 0, 140, 8], [0, 132, 140, 8]
  ];
  for (const [fx, fy, fw, fh] of forestFloors) {
    for (let y = fy; y < Math.min(size, fy + fh); y++) {
      for (let x = fx; x < Math.min(size, fx + fw); x++) {
        if (rng() < 0.7) set(x, y, T.GRASS2);
      }
    }
  }

  // ---- water: two lakes and a connecting river ---------------------------
  const waterMask = new Uint8Array(size * size);
  function ellipse(cx, cy, rx, ry) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        if (!inBounds(x, y)) continue;
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d <= 1) {
          set(x, y, T.WATER);
          solid[idx(x, y)] = 1;
          waterMask[idx(x, y)] = 1;
        }
      }
    }
  }
  ellipse(119, 31, 14, 13);
  ellipse(120, 112, 14, 12);
  for (let y = 40; y <= 102; y++) {
    const cx = 110 + Math.sin(y * 0.14) * 2.2;
    for (let x = Math.floor(cx - 2); x <= Math.ceil(cx + 2); x++) {
      if (!inBounds(x, y)) continue;
      set(x, y, T.WATER);
      solid[idx(x, y)] = 1;
      waterMask[idx(x, y)] = 1;
    }
  }
  // Sand shore
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      if (waterMask[idx(x, y)]) continue;
      if (waterMask[idx(x - 1, y)] || waterMask[idx(x + 1, y)] || waterMask[idx(x, y - 1)] || waterMask[idx(x, y + 1)]) {
        set(x, y, T.SAND);
      }
    }
  }

  // ---- roads -------------------------------------------------------------
  function roadRect(x0, y0, x1, y1, wide = true) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const onWater = waterMask[idx(x, y)] === 1;
        set(x, y, onWater ? T.BRIDGE : T.ROAD);
        solid[idx(x, y)] = 0;
      }
    }
    // sidewalks
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      for (const y of [y0 - 1, y1 + 1]) {
        if (!inBounds(x, y) || waterMask[idx(x, y)]) continue;
        if (get(x, y) !== T.ROAD && get(x, y) !== T.BRIDGE) set(x, y, T.SIDEWALK);
      }
    }
    for (let y = y0 - 1; y <= y1 + 1; y++) {
      for (const x of [x0 - 1, x1 + 1]) {
        if (!inBounds(x, y) || waterMask[idx(x, y)]) continue;
        if (get(x, y) !== T.ROAD && get(x, y) !== T.BRIDGE) set(x, y, T.SIDEWALK);
      }
    }
  }
  // Main avenues
  roadRect(0, 68, size - 1, 72);
  roadRect(68, 0, 72, size - 1);
  // Secondary roads
  roadRect(0, 34, size - 1, 36);
  roadRect(0, 104, size - 1, 106);
  roadRect(34, 0, 36, size - 1);
  roadRect(105, 0, 107, size - 1);
  // Country lanes
  roadRect(12, 88, 33, 89);
  roadRect(14, 92, 14, 116);

  // Crosswalks at central intersection
  for (let i = 0; i < 5; i++) {
    set(68 + i, 67, T.CROSSWALK);
    set(68 + i, 73, T.CROSSWALK);
    set(67, 68 + i, T.CROSSWALK);
    set(73, 68 + i, T.CROSSWALK);
  }

  // Parking lots / plazas
  function fillRect(x0, y0, x1, y1, t) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inBounds(x, y) && !isSolid(x, y)) set(x, y, t);
  }
  fillRect(76, 49, 99, 56, T.CONCRETE);
  fillRect(74, 83, 102, 88, T.CONCRETE);
  fillRect(58, 74, 66, 84, T.GRAVEL);
  fillRect(109, 61, 129, 67, T.CONCRETE);
  fillRect(55, 42, 66, 65, T.PARK);

  // Farm soil
  for (let y = 79; y <= 100; y++) {
    for (let x = 24; x <= 32; x++) {
      if (rng() < 0.9) set(x, y, T.FIELD);
    }
  }
  for (let x = 24; x <= 32; x += 4) {
    for (let y = 79; y <= 100; y++) set(x, y, T.DIRT);
  }
  for (let y = 79; y <= 100; y += 5) {
    for (let x = 24; x <= 32; x++) set(x, y, T.DIRT);
  }

  // ---- building helpers --------------------------------------------------
  function addProp(kind, x, y, opts = {}) {
    const w = opts.w || 1, h = opts.h || 1;
    const pr = {
      id: nextId++, kind, x, y, w, h,
      color: opts.color || '#8a7b68',
      rotation: opts.rotation || 0,
      buildingId: opts.buildingId || null,
      containerId: opts.containerId || null,
      light: opts.light || false,
      label: opts.label || '',
      solid: opts.solid !== false
    };
    props.push(pr);
    if (pr.solid) {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
        if (inBounds(xx, yy)) solid[idx(xx, yy)] = 1;
      }
    }
    return pr;
  }

  function addContainer(building, kind, x, y, opts = {}) {
    const defs = {
      fridge: ['Geladeira', 'house_kitchen'], cabinet: [opts.name || 'Armário', opts.table || 'house_bedroom'],
      shelf: [opts.name || 'Prateleira', opts.table || 'store_food'], crate: [opts.name || 'Caixa', opts.table || 'crate'],
      locker: [opts.name || 'Armário', opts.table || 'police'], dumpster: ['Caixa de lixo', 'crate'],
      desk: [opts.name || 'Gavetas', opts.table || 'police'], counter: [opts.name || 'Balcão', opts.table || 'restaurant'],
      locker_med: ['Armário médico', 'clinic'], toolbox: ['Caixa de ferramentas', 'industrial'],
      trunk: ['Porta-malas', 'vehicle']
    };
    const [name, table] = defs[kind] || ['Recipiente', 'crate'];
    const c = {
      id: nextId++, x, y, kind, name,
      table: opts.table || table,
      buildingId: building?.id || null,
      items: [],
      searched: false,
      label: opts.label || name
    };
    c.items = rollLoot(c.table, rng, lootMultiplier);
    containers.push(c);
    const pr = addProp(kind === 'shelf' ? 'shelf' : kind, x, y, {
      w: 1, h: 1, buildingId: building?.id, containerId: c.id, label: name,
      color: opts.color || ({ fridge: '#b8c2c2', cabinet: '#7d5c3d', shelf: '#8a6f4b', crate: '#9b784c', locker: '#6b7980', dumpster: '#4d5c4b', desk: '#7a5a3d', counter: '#8e6f4e', locker_med: '#aebfc4', toolbox: '#9c3f32' }[kind] || '#7a6a55')
    });
    c.propId = pr.id;
    return c;
  }

  function addBuilding(cfg) {
    const { x, y, w, h, name, type, door, roof = true, wallColor, roofColor } = cfg;
    const b = {
      id: nextId++, name, type, x, y, w, h, door, roof,
      wallColor: wallColor || WALL_COLORS[Math.floor(rng() * WALL_COLORS.length)],
      roofColor: roofColor || ROOF_COLORS[Math.floor(rng() * ROOF_COLORS.length)],
      discovered: false,
      windows: [],
      doors: []
    };
    // Floor
    for (let yy = y + 1; yy < y + h - 1; yy++) {
      for (let xx = x + 1; xx < x + w - 1; xx++) {
        set(xx, yy, type === 'warehouse' || type === 'workshop' || type === 'gas' ? T.CONCRETE : (type === 'house' || type === 'cabin' ? T.WOOD : T.TILE));
      }
    }
    // Walls + windows
    const sides = [
      { name: 'n', tiles: [] }, { name: 's', tiles: [] }, { name: 'w', tiles: [] }, { name: 'e', tiles: [] }
    ];
    for (let xx = x; xx < x + w; xx++) {
      sides[0].tiles.push([xx, y]);
      sides[1].tiles.push([xx, y + h - 1]);
    }
    for (let yy = y + 1; yy < y + h - 1; yy++) {
      sides[2].tiles.push([x, yy]);
      sides[3].tiles.push([x + w - 1, yy]);
    }
    for (const side of sides) {
      for (const [xx, yy] of side.tiles) {
        const isDoor = xx === door.x && yy === door.y;
        let isWindow = false;
        if (!isDoor) {
          const along = side.name === 'n' || side.name === 's' ? xx - x : yy - y;
          const length = side.name === 'n' || side.name === 's' ? w : h;
          if (along > 0 && along < length - 1 && along % 3 === 2) isWindow = true;
        }
        wallType[idx(xx, yy)] = isDoor ? 3 : (isWindow ? 2 : 1);
        wallInfo.set(key(xx, yy), { buildingId: b.id, kind: isDoor ? 'door' : (isWindow ? 'window' : 'wall') });
        solid[idx(xx, yy)] = 1;
        if (isWindow) b.windows.push({ x: xx, y: yy });
        if (isDoor) {
          b.doorTile = { x: xx, y: yy };
          b.doorOpen = true;
          solid[idx(xx, yy)] = 0;
          b.doors.push({ x: xx, y: yy, open: true });
        }
      }
    }
    buildings.push(b);
    furnish(b, cfg);
    // Entry step / path
    const dx = door.x, dy = door.y;
    const out = { x: dx + (dx === x ? -1 : dx === x + w - 1 ? 1 : 0), y: dy + (dy === y ? -1 : dy === y + h - 1 ? 1 : 0) };
    if (inBounds(out.x, out.y) && !isSolid(out.x, out.y)) set(out.x, out.y, T.SIDEWALK);
    locations.push({ x: x + w / 2, y: y + h / 2, name, type, buildingId: b.id, discovered: false });
    return b;
  }

  function furnish(b, cfg) {
    const { x, y, w, h, type } = b;
    const iw = w - 2, ih = h - 2;
    const ix = x + 1, iy = y + 1;
    const door = b.doorTile;
    const occupied = new Set();
    const mark = (px, py, pw = 1, ph = 1) => {
      for (let yy = py; yy < py + ph; yy++) for (let xx = px; xx < px + pw; xx++) occupied.add(key(xx, yy));
    };
    const can = (px, py, pw = 1, ph = 1) => {
      if (px < ix || py < iy || px + pw > ix + iw || py + ph > iy + ih) return false;
      for (let yy = py; yy < py + ph; yy++) for (let xx = px; xx < px + pw; xx++) {
        if (occupied.has(key(xx, yy)) || isSolid(xx, yy)) return false;
        if (door && Math.abs(xx - door.x) + Math.abs(yy - door.y) < 2) return false;
      }
      return true;
    };
    const place = (kind, px, py, pw = 1, ph = 1, opts = {}) => {
      if (!can(px, py, pw, ph)) return null;
      mark(px, py, pw, ph);
      return addProp(kind, px, py, { w: pw, h: ph, buildingId: b.id, ...opts });
    };
    const cont = (kind, px, py, opts = {}) => {
      if (!can(px, py, 1, 1)) return null;
      mark(px, py);
      return addContainer(b, kind, px, py, opts);
    };

    if (type === 'house' || type === 'cabin' || type === 'farmhouse') {
      place('bed', ix, iy, 1, 2, { color: '#8a5b50' });
      cont('fridge', ix + 2, iy, { table: 'house_kitchen' });
      cont('cabinet', ix + 3, iy, { table: 'house_kitchen', name: 'Armário de cozinha' });
      place('counter', ix + 4, iy, 1, 1, { color: '#7c6347' });
      if (iw >= 6) cont('cabinet', ix + iw - 1, iy, { name: 'Guarda-roupa', table: 'house_bedroom' });
      place('table', ix + Math.floor(iw / 2), iy + Math.min(2, ih - 1), 1, 1, { color: '#75563a' });
      if (ih >= 5) place('sofa', ix + 1, iy + ih - 1, 2, 1, { color: '#5e6152' });
      if (ih >= 5 && iw >= 5) cont('cabinet', ix + iw - 1, iy + ih - 1, { name: 'Gaveteiro', table: 'house_bathroom' });
      if (iw >= 4) place('sink', ix + iw - 2, iy + 1, 1, 1);
      place('chair', ix + Math.floor(iw / 2) + 1, iy + Math.min(2, ih - 1), 1, 1, { solid: false });
      place('rug', ix + Math.floor(iw / 2) - 1, iy + Math.min(3, ih - 1), 2, 2, { solid: false, color: '#77504a' });
    } else if (type === 'store' || type === 'pharmacy') {
      const table = type === 'pharmacy' ? 'pharmacy' : 'store_food';
      const name = type === 'pharmacy' ? 'Prateleira de remédios' : 'Prateleira';
      const rows = Math.max(1, Math.floor((ih - 2) / 2));
      for (let r = 0; r < rows; r++) {
        const py = iy + 1 + r * 2;
        for (let px = ix + 1; px < ix + iw - 1; px += 2) {
          cont('shelf', px, py, { table, name, color: type === 'pharmacy' ? '#a8b7b0' : '#8a6f4b' });
        }
      }
      cont('counter', ix + iw - 2, iy, { table, name: 'Balcão' });
      place('counter', ix + iw - 3, iy, 1, 1, { color: '#75563a' });
    } else if (type === 'warehouse' || type === 'barn' || type === 'workshop') {
      const table = type === 'barn' ? 'barn' : 'industrial';
      for (let i = 0; i < 5; i++) {
        const px = ix + 1 + (i % 3) * 3;
        const py = iy + 1 + Math.floor(i / 3) * 3;
        cont(i % 2 ? 'crate' : 'toolbox', px, py, { table, name: i % 2 ? 'Caixa de suprimentos' : 'Caixa de ferramentas' });
      }
      place('workbench', ix + iw - 2, iy + ih - 2, 2, 1, { color: '#6e5338' });
      place('hay', ix + 1, iy + ih - 1, 2, 1, { color: type === 'barn' ? '#b49b58' : '#77715f' });
      if (type === 'barn') cont('crate', ix + iw - 2, iy + 1, { table: 'barn', name: 'Sacos de sementes' });
      if (type === 'workshop') cont('toolbox', ix + 1, iy + 1, { table: 'hardware' });
    } else if (type === 'police' || type === 'clinic' || type === 'school') {
      const table = type === 'clinic' ? 'clinic' : type === 'police' ? 'police' : 'house_bedroom';
      cont('desk', ix + 1, iy + 1, { table, name: 'Mesa' });
      cont('locker', ix + iw - 1, iy + 1, { table, name: type === 'clinic' ? 'Armário de remédios' : 'Armário' });
      cont('locker', ix + iw - 1, iy + 2, { table, name: 'Armário' });
      place('desk', ix + Math.floor(iw / 2), iy + Math.floor(ih / 2), 2, 1, { color: '#6b5138' });
      if (type === 'clinic') {
        place('bed', ix + 1, iy + 3, 1, 2, { color: '#c9d6d2' });
        place('bed', ix + 3, iy + 3, 1, 2, { color: '#c9d6d2' });
      }
      if (type === 'school') {
        for (let i = 0; i < 4; i++) place('desk', ix + 1 + (i % 2) * 3, iy + 3 + Math.floor(i / 2) * 2, 1, 1, { color: '#8a6a44' });
      }
    } else if (type === 'restaurant') {
      place('counter', ix + 1, iy, 3, 1, { color: '#76563a' });
      cont('fridge', ix + iw - 1, iy, { table: 'restaurant' });
      cont('cabinet', ix + iw - 1, iy + 1, { table: 'restaurant', name: 'Despensa' });
      place('table', ix + 2, iy + 3, 2, 1, { color: '#7f5f3f' });
      place('table', ix + iw - 3, iy + 3, 2, 1, { color: '#7f5f3f' });
      place('chair', ix + 2, iy + 4, 1, 1, { solid: false });
      place('chair', ix + iw - 3, iy + 4, 1, 1, { solid: false });
      place('rug', ix + Math.floor(iw / 2) - 1, iy + ih - 2, 2, 1, { solid: false, color: '#5c3d38' });
    } else if (type === 'gas') {
      place('counter', ix + 1, iy, 2, 1, { color: '#74614b' });
      cont('shelf', ix + 3, iy, { table: 'gas', name: 'Prateleira da loja' });
      cont('shelf', ix + 4, iy, { table: 'gas', name: 'Prateleira da loja' });
      cont('toolbox', ix + iw - 1, iy + 1, { table: 'gas', name: 'Armário de ferramentas' });
      place('crate', ix + 1, iy + ih - 1, 1, 1, { color: '#7c5b3c' });
      place('crate', ix + 2, iy + ih - 1, 1, 1, { color: '#7c5b3c' });
    }
  }

  // ---- town buildings ----------------------------------------------------
  // Residential northwest
  addBuilding({ x: 39, y: 39, w: 9, h: 8, name: 'Casa dos Almeida', type: 'house', door: { x: 43, y: 46 } });
  addBuilding({ x: 51, y: 39, w: 9, h: 8, name: 'Casa da Rua das Acácias', type: 'house', door: { x: 55, y: 46 }, roofColor: '#5c4438' });
  addBuilding({ x: 39, y: 51, w: 9, h: 8, name: 'Casa do Poço', type: 'house', door: { x: 43, y: 51 }, roofColor: '#46504b' });
  addBuilding({ x: 51, y: 51, w: 9, h: 8, name: 'Casa Verde', type: 'house', door: { x: 59, y: 55 } });

  // Commercial northeast
  addBuilding({ x: 75, y: 38, w: 14, h: 11, name: 'Mercado Aurora', type: 'store', door: { x: 82, y: 48 }, roofColor: '#53595b' });
  addBuilding({ x: 92, y: 38, w: 8, h: 7, name: 'Farmácia Vida', type: 'pharmacy', door: { x: 95, y: 44 }, roofColor: '#4c5b58' });
  addBuilding({ x: 75, y: 52, w: 9, h: 8, name: 'Cantina da Praça', type: 'restaurant', door: { x: 79, y: 59 }, roofColor: '#5b4337' });
  addBuilding({ x: 87, y: 52, w: 12, h: 9, name: 'Clínica Santa Clara', type: 'clinic', door: { x: 93, y: 60 }, roofColor: '#5d6868' });

  // Residential southeast
  addBuilding({ x: 75, y: 75, w: 13, h: 11, name: 'Armazém Ferro & Pó', type: 'warehouse', door: { x: 75, y: 81 }, roofColor: '#4b4a46' });
  addBuilding({ x: 91, y: 75, w: 9, h: 8, name: 'Oficina do Zé', type: 'workshop', door: { x: 95, y: 82 }, roofColor: '#59493c' });
  addBuilding({ x: 75, y: 90, w: 10, h: 8, name: 'Ferragens Aurora', type: 'store', door: { x: 79, y: 90 }, roofColor: '#544a3e' });
  addBuilding({ x: 89, y: 90, w: 9, h: 8, name: 'Casa do Bloco Sul', type: 'house', door: { x: 93, y: 97 }, roofColor: '#4b4240' });

  // Civic southwest
  addBuilding({ x: 39, y: 75, w: 11, h: 9, name: 'Delegacia de Aurora', type: 'police', door: { x: 44, y: 83 }, roofColor: '#414b52' });
  addBuilding({ x: 39, y: 89, w: 14, h: 11, name: 'Escola Municipal', type: 'school', door: { x: 52, y: 94 }, roofColor: '#565044' });
  addBuilding({ x: 55, y: 75, w: 9, h: 8, name: 'Casa Amarela', type: 'house', door: { x: 55, y: 79 }, roofColor: '#5f513c' });
  addBuilding({ x: 55, y: 89, w: 9, h: 8, name: 'Casa do Jardim', type: 'house', door: { x: 55, y: 93 }, roofColor: '#4b5144' });

  // Rural northwest
  addBuilding({ x: 19, y: 18, w: 7, h: 6, name: 'Cabana do Lenhador', type: 'cabin', door: { x: 22, y: 23 }, roofColor: '#4c3c31' });
  addBuilding({ x: 20, y: 47, w: 8, h: 7, name: 'Posto de Vigia', type: 'cabin', door: { x: 24, y: 53 }, roofColor: '#3f4a43' });

  // Rural southwest farm
  addBuilding({ x: 15, y: 79, w: 9, h: 7, name: 'Casa da Fazenda', type: 'farmhouse', door: { x: 19, y: 85 }, roofColor: '#634a39' });
  addBuilding({ x: 13, y: 92, w: 10, h: 10, name: 'Celeiro Boa Esperança', type: 'barn', door: { x: 17, y: 101 }, roofColor: '#6b4b34' });

  // Northeast lake and gas station
  addBuilding({ x: 110, y: 57, w: 10, h: 8, name: 'Posto Aurora', type: 'gas', door: { x: 114, y: 64 }, roofColor: '#505a5b' });
  addBuilding({ x: 121, y: 56, w: 8, h: 7, name: 'Pousada do Lago', type: 'cabin', door: { x: 121, y: 59 }, roofColor: '#4d443a' });

  // Southeast lake cabin
  addBuilding({ x: 111, y: 83, w: 8, h: 7, name: 'Cabana do Pescador', type: 'cabin', door: { x: 115, y: 89 }, roofColor: '#44504a' });

  // ---- exterior details --------------------------------------------------
  // Vehicles
  function addVehicle(x, y, angle, type, color, fuel = 40, trunkTable = 'vehicle') {
    const v = {
      id: nextId++, x, y, angle, type, color, fuel,
      maxFuel: 55, hp: 100, maxHp: 100, speed: 0, trunk: [], trunkTable,
      occupied: false, discovered: true
    };
    v.trunk = rollLoot(trunkTable, rng, lootMultiplier).slice(0, 4);
    vehicles.push(v);
    return v;
  }
  addVehicle(70.2, 63.4, Math.PI / 2, 'sedan', '#8a3d33', 44);
  addVehicle(87.5, 71.2, 0, 'pickup', '#59656c', 28);
  addVehicle(31.5, 87.4, 0.2, 'pickup', '#6e5e43', 16);
  addVehicle(63.2, 86.4, Math.PI, 'sedan', '#445b62', 8);
  addVehicle(111.8, 67.1, -0.4, 'van', '#7a7259', 52);

  // Streetlights alongside main roads
  for (let i = 10; i < size - 6; i += 16) {
    for (const [lx, ly] of [[66.6, i], [73.4, i + 4], [i, 66.6], [i + 5, 73.4]]) {
      if (!inBounds(Math.round(lx), Math.round(ly))) continue;
      if (isSolid(Math.round(lx), Math.round(ly))) continue;
      const pr = addProp('streetlight', Math.floor(lx), Math.floor(ly), { solid: false, light: true, color: '#5b6266' });
      streetLights.push(pr);
    }
  }

  // trees and bushes
  function addTree(x, y) {
    if (!inBounds(x, y) || isSolid(x, y)) return;
    const t = get(x, y);
    if (t === T.ROAD || t === T.SIDEWALK || t === T.BRIDGE || t === T.CROSSWALK || t === T.WATER) return;
    if (isInsideBuilding(x, y)) return;
    addProp(rng() < 0.7 ? 'tree' : 'pine', x, y, {
      solid: true, color: rng() < 0.5 ? '#2f4a34' : '#3c5537', label: 'Árvore'
    });
  }
  function isInsideBuilding(x, y) {
    return buildings.some(b => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
  }
  // dense forest patches
  for (let i = 0; i < 460; i++) {
    const zones = [
      [2, 2, 30, 64], [2, 76, 30, 61], [108, 2, 29, 54], [108, 114, 29, 24], [2, 2, 136, 6],
      [2, 132, 136, 6], [116, 76, 20, 35]
    ];
    const z = zones[Math.floor(rng() * zones.length)];
    const x = z[0] + Math.floor(rng() * (z[2] - z[0] + 1));
    const y = z[1] + Math.floor(rng() * (z[3] - z[1] + 1));
    if (Math.hypot(x - 67, y - 67) < 26) continue;
    addTree(x, y);
  }
  // yard trees / park trees / roadside
  for (let i = 0; i < 70; i++) {
    const x = 8 + Math.floor(rng() * 124);
    const y = 8 + Math.floor(rng() * 124);
    if (Math.hypot(x - 67, y - 67) < 16) continue;
    if (rng() < 0.6) addTree(x, y);
  }
  for (let i = 0; i < 26; i++) addTree(Math.floor(39 + rng() * 25), Math.floor(39 + rng() * 24));
  for (let i = 0; i < 18; i++) addTree(Math.floor(40 + rng() * 26), Math.floor(76 + rng() * 24));
  for (let i = 0; i < 18; i++) addTree(Math.floor(75 + rng() * 26), Math.floor(75 + rng() * 24));
  for (let i = 0; i < 20; i++) addTree(Math.floor(56 + rng() * 10), Math.floor(42 + rng() * 22));

  // bushes and stones
  for (let i = 0; i < 130; i++) {
    const x = 4 + Math.floor(rng() * 132), y = 4 + Math.floor(rng() * 132);
    if (isSolid(x, y) || isInsideBuilding(x, y)) continue;
    const t = get(x, y);
    if ([T.ROAD, T.SIDEWALK, T.BRIDGE, T.WATER, T.CROSSWALK].includes(t)) continue;
    addProp(rng() < 0.7 ? 'bush' : 'rock', x, y, {
      solid: rng() < 0.35, color: rng() < 0.5 ? '#48603c' : '#5a6d45', label: rng() < 0.7 ? 'Arbusto' : 'Pedra'
    });
  }

  // Farms: hay, fence pieces, water pump
  for (let i = 0; i < 12; i++) {
    const x = 24 + Math.floor(rng() * 9), y = 79 + Math.floor(rng() * 22);
    if (!isSolid(x, y)) addProp('hay', x, y, { solid: true, color: '#b49b58' });
  }
  for (let x = 24; x <= 33; x++) {
    addProp('fence', x, 77, { solid: true, color: '#826b4a' });
    addProp('fence', x, 102, { solid: true, color: '#826b4a' });
  }
  addProp('well', 23, 86, { solid: true, color: '#6f6a5d', label: 'Poço' });

  // Docks
  for (const [dx, dy] of [[110, 36], [110, 39], [110, 42], [111, 100], [111, 103], [111, 106]]) {
    if (inBounds(dx, dy)) {
      set(dx, dy, T.BRIDGE);
      solid[idx(dx, dy)] = 0;
      addProp('dockpost', dx, dy, { solid: false, color: '#6f5a40' });
    }
  }

  // Dumpsters behind stores
  addContainer(null, 'dumpster', 90, 49, { table: 'crate', name: 'Contêiner de lixo' });
  addContainer(null, 'dumpster', 89, 57, { table: 'crate', name: 'Contêiner de lixo' });
  addContainer(null, 'dumpster', 101, 82, { table: 'industrial', name: 'Contêiner de lixo' });
  addContainer(null, 'dumpster', 84, 96, { table: 'crate', name: 'Contêiner de lixo' });

  // Outdoor benches and picnic tables
  for (const [bx, by] of [[58, 46], [60, 54], [58, 61], [100, 69], [20, 87]]) {
    if (!isSolid(bx, by)) addProp('bench', bx, by, { solid: true, color: '#755c40' });
  }

  // Traffic lights
  for (const [tx, ty] of [[66, 66], [74, 66], [66, 74], [74, 74]]) {
    if (!isSolid(tx, ty)) addProp('trafficlight', tx, ty, { solid: false, color: '#3d4549' });
  }

  // Small props: mailboxes, barrels, crates outside
  for (const b of buildings) {
    if (b.type === 'house' || b.type === 'farmhouse' || b.type === 'cabin') {
      const mx = b.doorTile.x + 1, my = b.doorTile.y + (b.doorTile.y === b.y ? -1 : 1);
      if (!isSolid(mx, my) && !isInsideBuilding(mx, my)) addProp('mailbox', mx, my, { solid: false, color: '#7a4d3e' });
    }
  }
  for (const [ox, oy] of [[88, 50], [100, 54], [78, 86], [96, 88], [117, 63], [26, 95]]) {
    if (!isSolid(ox, oy)) addProp('barrel', ox, oy, { solid: true, color: rng() < .5 ? '#5e6b58' : '#7d4e3d' });
  }

  // Street names / POIs
  locations.push(
    { x: 70, y: 70, name: 'Cruzamento Central', type: 'crossing', discovered: true },
    { x: 70, y: 26, name: 'Rua das Acácias', type: 'street', discovered: false },
    { x: 119, y: 31, name: 'Lago Norte', type: 'water', discovered: false },
    { x: 119, y: 112, name: 'Lago Sul', type: 'water', discovered: false },
    { x: 23, y: 90, name: 'Fazenda Boa Esperança', type: 'farm', discovered: false },
    { x: 118, y: 100, name: 'Floresta Cinzenta', type: 'forest', discovered: false },
    { x: 34, y: 34, name: 'Vila das Acácias', type: 'district', discovered: false },
    { x: 86, y: 50, name: 'Distrito Comercial', type: 'district', discovered: false },
    { x: 86, y: 84, name: 'Zona Industrial', type: 'district', discovered: false }
  );

  // ---- spawn safe check ---------------------------------------------------
  // Make sure there is an opening near the starting corner.
  const spawn = { x: 66.4, y: 66.4 };
  for (let y = 64; y <= 66; y++) for (let x = 64; x <= 67; x++) {
    if (get(x, y) === T.WATER) set(x, y, T.SIDEWALK);
  }

  // ---- zombies -----------------------------------------------------------
  const diffScale = difficulty === 'calm' ? 0.65 : difficulty === 'nightmare' ? 1.55 : 1;
  const zombieCount = Math.round(62 * diffScale);
  const zombies = [];
  const hotspots = [
    [70, 70, 1.0], [70, 60, .7], [70, 82, .7], [82, 44, .9], [82, 70, .6],
    [45, 44, .8], [45, 55, .6], [60, 80, .7], [45, 95, .5], [86, 82, .8],
    [118, 60, .35], [20, 84, .35], [66, 30, .35], [66, 110, .3], [115, 90, .3]
  ];
  const walkables = [];
  for (let y = 2; y < size - 2; y++) for (let x = 2; x < size - 2; x++) {
    if (!isSolid(x, y) && get(x, y) !== T.WATER) walkables.push([x, y]);
  }
  let placementTries = 0;
  while (zombies.length < zombieCount && placementTries < zombieCount * 40) {
    placementTries++;
    let wx, wy;
    if (rng() < 0.8) {
      const h = hotspots[Math.floor(rng() * hotspots.length)];
      const a = rng() * Math.PI * 2, r = 2 + rng() * 12;
      wx = Math.round(h[0] + Math.cos(a) * r);
      wy = Math.round(h[1] + Math.sin(a) * r);
    } else {
      [wx, wy] = walkables[Math.floor(rng() * walkables.length)];
    }
    if (!inBounds(wx, wy) || isSolid(wx, wy)) continue;
    if (Math.hypot(wx - spawn.x, wy - spawn.y) < 10) continue;
    if (rng() > (hotspots.find(h => Math.hypot(h[0] - wx, h[1] - wy) < 14)?.[2] || .25)) continue;
    zombies.push({
      id: nextId++, x: wx + rng() * .6, y: wy + rng() * .6,
      hp: 30 + Math.floor(rng() * 24), maxHp: 54,
      speed: .65 + rng() * .55,
      variant: Math.floor(rng() * 6),
      state: 'idle', dir: rng() * Math.PI * 2,
      wander: rng() * 4, attackCd: 0, notice: 0, targetX: 0, targetY: 0,
      facing: rng() * Math.PI * 2, anim: rng() * 10, dead: false
    });
  }

  // A couple of guaranteed zombies near the first houses so the world feels alive.
  for (const [x, y] of [[60, 44], [64, 58], [77, 68], [46, 48]]) {
    if (!isSolid(x, y)) {
      zombies.push({
        id: nextId++, x, y, hp: 42, maxHp: 54, speed: .85, variant: Math.floor(rng() * 6),
        state: 'idle', dir: rng() * 6.28, wander: rng() * 4, attackCd: 0, notice: 0,
        targetX: 0, targetY: 0, facing: rng() * 6.28, anim: rng() * 10, dead: false
      });
    }
  }

  return {
    size, ground, solid, wallType, wallInfo, buildings, props, containers, vehicles,
    zombies, locations, streetLights, spawn, seed,
    get, set, isSolid, idx, inBounds,
    isInsideBuilding, nextId: () => nextId++,
    difficulty
  };
}
