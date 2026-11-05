import {
  mulberry32, hash2, fbm, choose, chance, randInt, randRange, shuffle, dist, clamp, TAU,
  uid, hashString, bytesFromB64,
} from './util.js';
import { ITEMS, LOOT_TABLES, BUILDINGS, CONTAINER_INFO, NOTES, DIFFICULTIES } from './data.js';

export const T = {
  GRASS: 0, DIRT: 1, ROAD: 2, SIDEWALK: 3, FOREST: 4, WATER: 5, FARM: 6,
  WOOD: 7, TILE: 8, WALL: 9, DOOR: 10, WINDOW: 11, CONCRETE: 12, RUBBLE: 13,
  SAND: 14, GRAVEL: 15, TALLGRASS: 16,
};

export const TILE = 32;
export const WORLD_SIZE = 320;

const TOWN_NAMES = [
  'Vale Sereno', 'Nova Esperança', 'Santa Cruz', 'Rio das Pedras', 'Morro Alto',
  'Boa Vista', 'Campo Belo', 'Vila Nova', 'Serra Azul', 'Lagoa Seca',
  'Porto Seco', 'Refúgio Norte', 'Vale das Cinzas',
];

// Assentamentos do vale. O mundo é grande de propósito: cada região tem uma
// identidade própria e exige preparação para ser atravessada.
export const SETTLEMENTS = [
  { id: 'vale', name: 'Vale Sereno', cx: 160, cy: 160, w: 96, h: 84, cols: 5, rows: 4, profile: 'metropole', main: true,
    kind: 'metrópole', desc: 'A grande cidade do vale. Hospital, quartel, universidade e bairros que não dormem.' },
  { id: 'nova', name: 'Nova Esperança', cx: 72, cy: 108, w: 64, h: 54, cols: 4, rows: 3, profile: 'industrial',
    kind: 'cidade industrial', desc: 'Fábricas, galpões e o cheiro de ferrugem. O trabalho acabou, as máquinas ficaram.' },
  { id: 'santa', name: 'Santa Cruz', cx: 252, cy: 96, w: 60, h: 50, cols: 4, rows: 3, profile: 'comercial',
    kind: 'cidade comercial', desc: 'Lojas, restaurantes e um centro que já foi movimentado.' },
  { id: 'vilanova', name: 'Vila Nova', cx: 252, cy: 244, w: 54, h: 46, cols: 3, rows: 3, profile: 'residencial',
    kind: 'cidade residencial', desc: 'Casas, escolas e ruas tranquilas demais para o que aconteceu.' },
  { id: 'boavista', name: 'Boa Vista', cx: 72, cy: 248, w: 48, h: 40, cols: 3, rows: 3, profile: 'rural',
    kind: 'vila rural', desc: 'Uma comunidade agrícola onde todo mundo conhecia todo mundo.' },
  { id: 'porto', name: 'Porto Seco', cx: 116, cy: 52, w: 50, h: 40, cols: 3, rows: 3, profile: 'industrial',
    kind: 'distrito industrial', desc: 'Armazéns, trilhos e o rio que trouxe a carga e levou a esperança.' },
  { id: 'serra', name: 'Serra Azul', cx: 244, cy: 176, w: 42, h: 36, cols: 3, rows: 2, profile: 'rico',
    kind: 'bairro nobre', desc: 'Mansões, condomínios e muros altos. Dinheiro não comprou imunidade.' },
  { id: 'lagoa', name: 'Lagoa Seca', cx: 140, cy: 274, w: 40, h: 34, cols: 3, rows: 2, profile: 'lago',
    kind: 'vila lacustre', desc: 'Casas de pescador e um lago que ainda pode alimentar quem souber pescar.' },
  { id: 'refugio', name: 'Refúgio Norte', cx: 184, cy: 42, w: 34, h: 28, cols: 2, rows: 2, profile: 'militar',
    kind: 'posto militar', desc: 'Um posto de controle que virou última linha de defesa — e depois silêncio.' },
  { id: 'cinzas', name: 'Vale das Cinzas', cx: 290, cy: 300, w: 36, h: 30, cols: 3, rows: 2, profile: 'abandonado',
    kind: 'zona abandonada', desc: 'Uma cidade que queimou antes dos mortos andarem.' },
];

const TOWN_PROFILES = {
  metropole: {
    keyTypes: ['hospital', 'mercado', 'delegacia', 'escola', 'quartel', 'posto', 'oficina', 'universidade', 'prefeitura', 'shopping', 'bombeiros', 'biblioteca', 'hotel', 'apartamento'],
    center: ['mercado', 'loja_roupas', 'restaurante', 'lanchonete', 'farmacia', 'eletronicos', 'livraria', 'correios', 'clinica', 'prefeitura'],
    residential: ['casa', 'casa_pequena', 'casa_familiar', 'sobrado', 'casa_moderna', 'apartamento', 'predio', 'condominio', 'casa_antiga'],
    industrial: ['oficina', 'deposito', 'galpao', 'armazem', 'ferrovelho', 'fabrica'],
    outskirts: ['casa_pequena', 'ruina', 'casa_antiga', 'mercearia', 'oficina', 'posto'],
  },
  industrial: {
    keyTypes: ['fabrica', 'galpao', 'armazem', 'oficina', 'posto', 'deposito', 'ferrovelho', 'usina', 'estacao_trem', 'mercado', 'delegacia'],
    center: ['mercado', 'mercearia', 'farmacia', 'lanchonete', 'loja_ferramentas', 'posto', 'correios'],
    residential: ['casa_pequena', 'casa', 'casa_antiga', 'apartamento', 'ruina', 'predio'],
    industrial: ['fabrica', 'galpao', 'armazem', 'deposito', 'ferrovelho', 'usina', 'oficina', 'estacao_trem'],
    outskirts: ['casa_pequena', 'ruina', 'deposito', 'galpao', 'mercearia'],
  },
  comercial: {
    keyTypes: ['mercado', 'shopping', 'loja_roupas', 'restaurante', 'farmacia', 'eletronicos', 'livraria', 'hotel', 'prefeitura', 'correios', 'delegacia', 'clinica'],
    center: ['mercado', 'loja_roupas', 'restaurante', 'lanchonete', 'farmacia', 'eletronicos', 'livraria', 'hotel', 'motel', 'correios', 'clinica'],
    residential: ['casa', 'casa_familiar', 'apartamento', 'sobrado', 'predio', 'condominio', 'casa_moderna'],
    industrial: ['oficina', 'deposito', 'armazem', 'galpao'],
    outskirts: ['casa_pequena', 'mercearia', 'ruina', 'posto'],
  },
  residencial: {
    keyTypes: ['escola', 'farmacia', 'mercado', 'delegacia', 'igreja', 'biblioteca', 'clinica', 'condominio'],
    center: ['mercearia', 'farmacia', 'lanchonete', 'escola', 'biblioteca', 'correios', 'clinica'],
    residential: ['casa', 'casa_familiar', 'sobrado', 'apartamento', 'condominio', 'casa_moderna', 'predio', 'casa_pequena'],
    industrial: ['oficina', 'deposito', 'armazem'],
    outskirts: ['casa_pequena', 'ruina', 'sitio', 'mercearia'],
  },
  rural: {
    keyTypes: ['fazenda', 'celeiro', 'sitio', 'estufa', 'moinho', 'igreja', 'mercearia', 'posto_controle'],
    center: ['mercearia', 'igreja', 'posto', 'oficina', 'clinica'],
    residential: ['casa', 'cabana', 'chale', 'casa_antiga', 'sitio'],
    industrial: ['celeiro', 'fazenda', 'moinho', 'deposito'],
    outskirts: ['cabana', 'chale', 'sitio', 'ruina', 'estufa'],
  },
  rico: {
    keyTypes: ['mansao', 'casa_moderna', 'condominio', 'clinica', 'hotel', 'igreja', 'restaurante', 'loja_roupas'],
    center: ['restaurante', 'loja_roupas', 'clinica', 'farmacia', 'livraria', 'eletronicos'],
    residential: ['mansao', 'casa_moderna', 'condominio', 'casa_familiar', 'sobrado'],
    industrial: ['oficina', 'deposito'],
    outskirts: ['casa_moderna', 'mansao', 'cabana'],
  },
  militar: {
    keyTypes: ['base_militar', 'quartel', 'posto_controle', 'prisao', 'aeroporto', 'deposito', 'clinica'],
    center: ['posto_controle', 'clinica', 'deposito', 'quartel'],
    residential: ['casa_pequena', 'casa_antiga', 'apartamento'],
    industrial: ['deposito', 'galpao', 'armazem', 'oficina'],
    outskirts: ['posto_controle', 'ruina', 'casa_pequena'],
  },
  abandonado: {
    keyTypes: ['ruina', 'casa_antiga', 'fabrica', 'galpao', 'deposito', 'oficina', 'igreja'],
    center: ['ruina', 'casa_antiga', 'mercearia', 'oficina'],
    residential: ['ruina', 'casa_antiga', 'casa_pequena', 'cabana'],
    industrial: ['fabrica', 'galpao', 'deposito', 'ferrovelho'],
    outskirts: ['ruina', 'casa_antiga', 'cabana'],
  },
  lago: {
    keyTypes: ['fazenda', 'sitio', 'estufa', 'mercado', 'igreja', 'clinica', 'posto'],
    center: ['mercearia', 'igreja', 'lanchonete', 'farmacia'],
    residential: ['casa', 'cabana', 'chale', 'casa_pequena', 'sitio'],
    industrial: ['celeiro', 'fazenda', 'deposito'],
    outskirts: ['cabana', 'chale', 'estufa', 'ruina'],
  },
};

const ROAD_COLORS = {
  [T.ROAD]: '#3a3b38', [T.SIDEWALK]: '#66665f', [T.DIRT]: '#5a4a34', [T.GRAVEL]: '#5d5c55',
};

export const MINIMAP_COLORS = {
  [T.GRASS]: '#33402c', [T.DIRT]: '#4a3d2c', [T.ROAD]: '#2c2d2b', [T.SIDEWALK]: '#55554d',
  [T.FOREST]: '#1f3324', [T.WATER]: '#1d3a48', [T.FARM]: '#4e4a28', [T.WOOD]: '#4d3b2a',
  [T.TILE]: '#555a55', [T.WALL]: '#6d6a60', [T.DOOR]: '#8a6238', [T.WINDOW]: '#5b7d88',
  [T.CONCRETE]: '#4a4c46', [T.RUBBLE]: '#4c4940', [T.SAND]: '#6b5e43', [T.GRAVEL]: '#4e4d47',
  [T.TALLGRASS]: '#3c4b2d',
};

export class World {
  constructor(seed, difficulty = 'sobrevivente') {
    this.seed = typeof seed === 'number' ? seed : hashString(String(seed || 'abrigo'));
    this.rng = mulberry32(this.seed);
    this.difficulty = difficulty;
    this.difficultyLoot = (DIFFICULTIES[difficulty] || DIFFICULTIES.sobrevivente).loot;
    this.w = WORLD_SIZE;
    this.h = WORLD_SIZE;
    this.tiles = new Uint8Array(this.w * this.h);
    this.buildings = [];
    this.zones = [];
    this.containers = [];
    this.beds = [];
    this.decor = [];
    this.doors = new Map();
    this.windows = new Map();
    this.trees = [];
    this.rocks = [];
    this.structures = [];
    this.portalStructures = new Map();
    this.vehicles = [];
    this.pois = [];
    this.spawnPoints = [];
    this.npcPoints = [];
    this.objGrid = new Map();
    this.containerId = 0;
    this.buildingId = 0;
    this.notes = [];
    this.mainTown = null;
    this.start = { x: 0, y: 0, angle: Math.PI / 2 };
    this.explored = new Uint8Array(this.w * this.h);
    this.generate();
  }

  // ---------- acesso básico ----------
  idx(tx, ty) { return ty * this.w + tx; }
  inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h; }
  tile(tx, ty) { return this.inBounds(tx, ty) ? this.tiles[ty * this.w + tx] : T.WALL; }
  setTile(tx, ty, v) { if (this.inBounds(tx, ty)) this.tiles[ty * this.w + tx] = v; }
  fill(tx, ty, w, h, v) {
    for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) this.setTile(x, y, v);
  }
  isRoadTile(t) { return t === T.ROAD || t === T.DIRT || t === T.GRAVEL; }

  // ---------- geração ----------
  generate() {
    this.generateTerrain();
    this.generateHighways();
    this.generateRoadNetwork();
    this.generateTowns();
    this.generateRural();
    this.generateLandmarks();
    this.placeTrees();
    this.placeVehicles();
    this.buildSpawnPoints();
    this.buildStaticGrid();
    this.chooseStart();
  }

  generateTerrain() {
    const rng = this.rng;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const n = fbm(x / 30, y / 30, this.seed);
        const n2 = fbm(x / 11 + 41, y / 11 - 17, this.seed + 9);
        const n3 = fbm(x / 62 + 7, y / 62 - 3, this.seed + 21);
        let t = T.GRASS;
        if (n > 0.60 + n2 * 0.09) t = T.FOREST;
        else if (n2 > 0.67) t = T.TALLGRASS;
        else if (n3 > 0.73) t = T.GRAVEL;
        this.tiles[y * this.w + x] = t;
      }
    }
    // Lagos e áreas alagadas
    const lakes = [
      { x: 48, y: 58, rx: 26, ry: 18 },
      { x: 276, y: 250, rx: 18, ry: 14 },
      { x: 44, y: 296, rx: 12, ry: 8 },
      { x: 296, y: 42, rx: 10, ry: 7 },
      { x: 198, y: 292, rx: 13, ry: 9 },
    ];
    for (const lake of lakes) {
      for (let y = lake.y - lake.ry; y <= lake.y + lake.ry; y++) {
        for (let x = lake.x - lake.rx; x <= lake.x + lake.rx; x++) {
          if (!this.inBounds(x, y)) continue;
          const d = ((x - lake.x) / lake.rx) ** 2 + ((y - lake.y) / lake.ry) ** 2;
          if (d < 0.72) this.setTile(x, y, T.WATER);
          else if (d < 1.05) this.setTile(x, y, T.SAND);
        }
      }
    }
    // Rio sinuoso cortando o vale de norte a sul. As estradas criam pontes.
    let rx = 206;
    for (let y = 0; y < this.h; y++) {
      rx += Math.sin(y / 15) * 0.55 + (rng() - 0.5) * 0.35;
      rx = clamp(rx, 176, 226);
      const width = y > 150 ? 3 : 2;
      for (let k = -width; k <= width; k++) {
        const x = Math.round(rx + k);
        if (this.inBounds(x, y)) this.setTile(x, y, T.WATER);
      }
      if (y % 17 === 0) {
        for (let k = -width - 1; k <= width + 1; k++) {
          const x = Math.round(rx + k);
          if (this.inBounds(x, y + 1)) this.setTile(x, y + 1, T.SAND);
        }
      }
    }
    // Pequenas lagoas e clareiras
    for (let i = 0; i < 9; i++) {
      const cx = randInt(rng, 20, this.w - 20), cy = randInt(rng, 20, this.h - 20);
      if (dist(cx, cy, 160, 160) < 70) continue;
      const rx2 = randInt(rng, 3, 8), ry2 = randInt(rng, 3, 7);
      for (let y = cy - ry2; y <= cy + ry2; y++) for (let x = cx - rx2; x <= cx + rx2; x++) {
        if (!this.inBounds(x, y)) continue;
        const d = ((x - cx) / rx2) ** 2 + ((y - cy) / ry2) ** 2;
        if (d < 0.8) this.setTile(x, y, T.WATER);
        else if (d < 1.1) this.setTile(x, y, T.SAND);
      }
    }
  }

  generateHighways() {
    // Eixos principais da metrópole
    this.fill(0, 158, this.w, 3, T.ROAD);
    this.fill(158, 0, 3, this.h, T.ROAD);
    // acostamentos e faixas
    for (let x = 4; x < this.w; x += 9) {
      this.setTile(x, 157, T.GRAVEL);
      this.setTile(x, 161, T.GRAVEL);
    }
    for (let y = 4; y < this.h; y += 9) {
      this.setTile(157, y, T.GRAVEL);
      this.setTile(161, y, T.GRAVEL);
    }
  }

  carveRoad(x1, y1, x2, y2, width = 3, tile = T.ROAD) {
    const half = Math.floor(width / 2);
    const drawH = (xa, xb, y) => {
      const from = Math.min(xa, xb), to = Math.max(xa, xb);
      for (let x = from; x <= to; x++) for (let w = -half; w <= half; w++) {
        const yy = y + w;
        if (!this.inBounds(x, yy)) continue;
        const t = this.tile(x, yy);
        if (t === T.WALL) continue;
        this.setTile(x, yy, t === T.WATER ? T.ROAD : tile);
      }
    };
    const drawV = (ya, yb, x) => {
      const from = Math.min(ya, yb), to = Math.max(ya, yb);
      for (let y = from; y <= to; y++) for (let w = -half; w <= half; w++) {
        const xx = x + w;
        if (!this.inBounds(xx, y)) continue;
        const t = this.tile(xx, y);
        if (t === T.WALL) continue;
        this.setTile(xx, y, t === T.WATER ? T.ROAD : tile);
      }
    };
    // Caminho em L com trecho diagonal suave
    if (Math.abs(x2 - x1) > Math.abs(y2 - y1)) {
      drawH(x1, x2, y1);
      drawV(y1, y2, x2);
    } else {
      drawV(y1, y2, x1);
      drawH(x1, x2, y2);
    }
  }

  generateRoadNetwork() {
    const main = SETTLEMENTS.find(s => s.main) || SETTLEMENTS[0];
    // Estradas radiais ligando cada assentamento ao centro do vale.
    for (const st of SETTLEMENTS) {
      if (st.main) continue;
      const rural = ['rural', 'lago', 'abandonado'].includes(st.profile);
      this.carveRoad(main.cx, main.cy, st.cx, st.cy, rural ? 2 : 3, rural ? T.DIRT : T.ROAD);
    }
    // Anel viário externo: conecta as cidades menores entre si.
    const ring = SETTLEMENTS.filter(s => !s.main).sort((a, b) => Math.atan2(a.cy - main.cy, a.cx - main.cx) - Math.atan2(b.cy - main.cy, b.cx - main.cx));
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      this.carveRoad(a.cx, a.cy, b.cx, b.cy, 2, T.DIRT);
    }
    // Estradas vicinais extras para fazendas e áreas rurais.
    this.carveRoad(60, 170, 96, 190, 2, T.DIRT);
    this.carveRoad(236, 224, 270, 200, 2, T.DIRT);
    this.carveRoad(108, 72, 132, 100, 2, T.DIRT);
    this.carveRoad(190, 96, 224, 112, 2, T.DIRT);
  }

  generateTowns() {
    const rng = this.rng;
    const townDefs = [
      { cx: 100, cy: 100, w: 78, h: 66, main: true, name: 'Vale Sereno' },
      { cx: 38, cy: 148, w: 54, h: 46, main: false, name: 'Boa Vista' },
      { cx: 160, cy: 44, w: 54, h: 46, main: false, name: 'Santa Cruz' },
      { cx: 156, cy: 156, w: 50, h: 44, main: false, name: 'Vila Nova' },
    ];
    this.mainTown = townDefs[0];
    for (const def of townDefs) this.generateTown(def);

    // Estradas de terra conectando as cidades
    for (let i = 1; i < townDefs.length; i++) {
      const a = townDefs[0], b = townDefs[i];
      const midY = Math.round((a.cy + b.cy) / 2);
      this.dirtRoad(a.cx, a.cy + 20, b.cx, b.cy, 2);
    }
    this.dirtRoad(100, 135, 38, 148, 2);
  }

  dirtRoad(x1, y1, x2, y2, width = 2) {
    // caminho em L com leve irregularidade
    const stepX = x1 < x2 ? 1 : -1;
    const stepY = y1 < y2 ? 1 : -1;
    const midX = Math.round((x1 + x2) / 2);
    for (let x = x1; x !== midX + stepX; x += stepX) {
      for (let w = 0; w < width; w++) {
        const y = y1 + w;
        const t = this.tile(x, y);
        if (t !== T.ROAD && t !== T.WATER && t !== T.WALL) this.setTile(x, y, T.DIRT);
      }
    }
    for (let y = y1; y !== y2 + stepY; y += stepY) {
      for (let w = 0; w < width; w++) {
        const x = midX + w;
        const t = this.tile(x, y);
        if (t !== T.ROAD && t !== T.WATER && t !== T.WALL) this.setTile(x, y, T.DIRT);
      }
    }
  }

  generateTown(def) {
    const rng = this.rng;
    const profile = TOWN_PROFILES[def.profile] || TOWN_PROFILES.residencial;
    const { cx, cy, w, h, main, name } = def;
    const x0 = Math.round(cx - w / 2), y0 = Math.round(cy - h / 2);
    const cols = def.cols || 3, rows = def.rows || 3;
    const cellW = Math.max(13, Math.floor((w - 6) / cols));
    const cellH = Math.max(11, Math.floor((h - 6) / rows));
    const vStreets = [], hStreets = [];
    for (let i = 0; i <= cols; i++) vStreets.push(x0 + 3 + i * cellW);
    for (let j = 0; j <= rows; j++) hStreets.push(y0 + 3 + j * cellH);

    // Limpa vegetação densa para a mancha urbana.
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const t = this.tile(x, y);
      if (t === T.WATER || t === T.WALL) continue;
      if (t === T.FOREST || t === T.TALLGRASS) this.setTile(x, y, T.GRASS);
    }
    // Ruas e calçadas
    for (const sx of vStreets) {
      this.fill(sx - 1, y0, 3, h, T.ROAD);
      for (let y = y0; y < y0 + h; y++) {
        if (this.tile(sx - 2, y) !== T.ROAD && this.tile(sx - 2, y) !== T.WATER) this.setTile(sx - 2, y, T.SIDEWALK);
        if (this.tile(sx + 2, y) !== T.ROAD && this.tile(sx + 2, y) !== T.WATER) this.setTile(sx + 2, y, T.SIDEWALK);
      }
    }
    for (const sy of hStreets) {
      this.fill(x0, sy - 1, w, 3, T.ROAD);
      for (let x = x0; x < x0 + w; x++) {
        if (this.tile(x, sy - 2) !== T.ROAD && this.tile(x, sy - 2) !== T.WATER) this.setTile(x, sy - 2, T.SIDEWALK);
        if (this.tile(x, sy + 2) !== T.ROAD && this.tile(x, sy + 2) !== T.WATER) this.setTile(x, sy + 2, T.SIDEWALK);
      }
    }
    // Faixas centrais
    for (const sx of vStreets) for (let y = y0; y < y0 + h; y += 6) this.setTile(sx, y, T.GRAVEL);
    for (const sy of hStreets) for (let x = x0; x < x0 + w; x += 6) this.setTile(x, sy, T.GRAVEL);

    const zone = { id: uid('z'), name, x: x0, y: y0, w, h, main, kind: def.kind || 'cidade', profile: def.profile, desc: def.desc || '' };
    this.zones.push(zone);
    // Zonas de bairro (usadas pelo HUD e pelo mapa)
    if (w >= 42 && h >= 34) {
      const innerW = Math.max(12, cellW * Math.max(1, cols - 2));
      const innerH = Math.max(10, cellH * Math.max(1, rows - 2));
      this.zones.push({ id: uid('z'), name: 'Centro de ' + name, x: x0 + cellW, y: y0 + cellH, w: innerW, h: innerH, kind: 'centro', parent: name });
      this.zones.push({ id: uid('z'), name: 'Bairro residencial · ' + name, x: x0, y: y0 + h - cellH * 2, w: w, h: cellH * 2, kind: 'residencial', parent: name });
      this.zones.push({ id: uid('z'), name: 'Distrito industrial · ' + name, x: x0, y: y0, w: cellW * 2, h: h, kind: 'industrial', parent: name });
    }

    const lots = [];
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const lx = vStreets[i] + 3, lw = vStreets[i + 1] - lx - 3;
        const ly = hStreets[j] + 3, lh = hStreets[j + 1] - ly - 3;
        if (lw >= 6 && lh >= 5) lots.push({ x: lx, y: ly, w: lw, h: lh, i, j });
      }
    }
    const ordered = shuffle(rng, lots);
    ordered.sort((a, b) => (b.w * b.h) - (a.w * a.h));

    let keyIndex = 0;
    for (const lot of ordered) {
      const district = this.pickDistrict(def, lot, cols, rows);
      let type = null;
      if (keyIndex < profile.keyTypes.length && lot.w >= 8 && lot.h >= 7) {
        type = profile.keyTypes[keyIndex++];
      } else {
        const pool = profile[district] || profile.residential || ['casa'];
        type = choose(rng, pool);
      }
      const defB = BUILDINGS[type] || BUILDINGS.casa;
      const targetW = Math.min(defB.size[0], lot.w);
      const targetH = Math.min(defB.size[1], lot.h);
      let bw = Math.max(6, Math.min(lot.w, targetW - (chance(rng, 0.3) ? 1 : 0)));
      let bh = Math.max(5, Math.min(lot.h, targetH - (chance(rng, 0.3) ? 1 : 0)));
      if (bw > lot.w || bh > lot.h) continue;
      const bx = lot.x + randInt(rng, 0, Math.max(0, lot.w - bw));
      const by = lot.y + randInt(rng, 0, Math.max(0, lot.h - bh));
      if (this.buildingOverlap(bx, by, bw, bh)) continue;
      const isKey = keyIndex > 0 && type === profile.keyTypes[keyIndex - 1];
      this.addBuilding(type, bx, by, bw, bh, {
        mainTown: main, key: isKey, town: name, district, profile: def.profile,
        name: isKey ? this.buildingName(type, defB, { key: true, town: name }) : null,
      });
    }

    // Pequenas praças, estacionamentos e áreas de serviço
    const featureCount = main ? 4 : 2;
    for (let f = 0; f < featureCount; f++) {
      const fx = randInt(rng, x0 + 4, x0 + w - 10), fy = randInt(rng, y0 + 4, y0 + h - 10);
      if (this.nearBuilding(fx, fy, 3) || this.tile(fx, fy) === T.WATER) continue;
      const kind = choose(rng, ['praca', 'estacionamento', 'terreno']);
      if (kind === 'praca') {
        for (let yy = fy; yy < fy + 4; yy++) for (let xx = fx; xx < fx + 5; xx++) if (this.tile(xx, yy) !== T.WATER) this.setTile(xx, yy, T.SIDEWALK);
        this.decor.push({ type: 'campfire_dead', x: fx + 2, y: fy + 2, rot: 0 });
        if (chance(rng, 0.6)) this.addContainer('caixa', fx + 1, fy + 1, { id: 0 }, 0.7);
      } else if (kind === 'estacionamento') {
        for (let yy = fy; yy < fy + 5; yy++) for (let xx = fx; xx < fx + 6; xx++) if (this.tile(xx, yy) !== T.WATER) this.setTile(xx, yy, T.GRAVEL);
      } else {
        for (let yy = fy; yy < fy + 3; yy++) for (let xx = fx; xx < fx + 4; xx++) if (this.tile(xx, yy) !== T.WATER) this.setTile(xx, yy, T.DIRT);
      }
    }

    // Pontos de spawn e NPCs proporcionais ao tamanho da cidade
    for (let k = 0; k < (main ? 42 : 18); k++) {
      const sx = randInt(rng, x0 + 3, x0 + w - 4), sy = randInt(rng, y0 + 3, y0 + h - 4);
      this.spawnPoints.push({ x: sx * TILE + 16, y: sy * TILE + 16, town: name });
    }
    for (let k = 0; k < (main ? 16 : 6); k++) {
      this.npcPoints.push({ x: randInt(rng, x0 + 4, x0 + w - 5) * TILE + 16, y: randInt(rng, y0 + 4, y0 + h - 5) * TILE + 16, town: name });
    }
  }

  pickDistrict(def, lot, cols, rows) {
    const { i, j } = lot;
    if (def.profile === 'metropole' || def.profile === 'comercial') {
      if (j >= 1 && j <= rows - 2 && i >= 1 && i <= cols - 2) return 'center';
      if (i === 0 || j === rows - 1) return 'outskirts';
      return 'residential';
    }
    if (def.profile === 'industrial') return (i % 2 === 0 || j === 0) ? 'industrial' : 'residential';
    if (def.profile === 'rural' || def.profile === 'lago') return j === 0 ? 'industrial' : 'residential';
    if (def.profile === 'militar') return j === 0 ? 'industrial' : 'residential';
    if (def.profile === 'abandonado') return i === 0 ? 'outskirts' : 'residential';
    return 'residential';
  }

  buildingOverlap(x, y, w, h) {
    for (const b of this.buildings) {
      if (x < b.x + b.w + 1 && x + w + 1 > b.x && y < b.y + b.h + 1 && y + h + 1 > b.y) return true;
    }
    return false;
  }

  // ---------- construção de prédios ----------
  addBuilding(type, x, y, w, h, opts = {}) {
    const def = BUILDINGS[type] || BUILDINGS.casa;
    const rng = this.rng;
    const id = ++this.buildingId;
    const b = {
      id, type, x, y, w, h, name: opts.name || this.buildingName(type, def, opts),
      town: opts.town || '', key: !!opts.key, discovered: false,
    };
    this.buildings.push(b);

    // piso
    const floor = type === 'quartel' || type === 'posto' || type === 'oficina' ? T.CONCRETE : def.floor;
    this.fill(x, y, w, h, floor);

    // paredes externas
    for (let xx = x; xx < x + w; xx++) { this.setTile(xx, y, T.WALL); this.setTile(xx, y + h - 1, T.WALL); }
    for (let yy = y; yy < y + h; yy++) { this.setTile(x, y + yy - y, T.WALL); this.setTile(x + w - 1, yy, T.WALL); }

    // escolher lado da porta: o mais próximo de uma rua
    const sides = this.chooseDoorSides(b);
    const doorSide = sides[0];
    const doorPositions = [];
    if (doorSide === 'south' || doorSide === 'north') {
      const yy = doorSide === 'south' ? y + h - 1 : y;
      const dx = x + Math.floor(w / 2) - (type === 'mercado' || type === 'hospital' ? 1 : 0);
      doorPositions.push(dx, dx + 1);
      if (type === 'mercado' || type === 'hospital' || type === 'quartel' || type === 'escola') doorPositions.push(dx + 2);
      for (const dxx of doorPositions) if (dxx > x && dxx < x + w - 1) this.makeDoor(dxx, yy, b, doorSide);
    } else {
      const xx = doorSide === 'east' ? x + w - 1 : x;
      const dy = y + Math.floor(h / 2);
      doorPositions.push(dy);
      if (type === 'mercado' || type === 'hospital') doorPositions.push(dy + 1);
      for (const dyy of doorPositions) if (dyy > y && dyy < y + h - 1) this.makeDoor(xx, dyy, b, doorSide);
    }

    // janelas
    for (const side of ['north', 'south', 'east', 'west']) {
      if (side === doorSide && side === sides[0]) continue;
      if (side === 'north' || side === 'south') {
        const yy = side === 'south' ? y + h - 1 : y;
        for (let xx = x + 2; xx < x + w - 2; xx += 3) {
          if (this.tile(xx, yy) !== T.WALL) continue;
          if (chance(rng, 0.45)) this.makeWindow(xx, yy, b);
        }
      } else {
        const xx = side === 'east' ? x + w - 1 : x;
        for (let yy = y + 2; yy < y + h - 2; yy += 3) {
          if (this.tile(xx, yy) !== T.WALL) continue;
          if (chance(rng, 0.4)) this.makeWindow(xx, yy, b);
        }
      }
    }

    // divisórias internas
    const partitionCount = def.partitions || 0;
    if (w >= 10 && partitionCount > 0) {
      const px = x + Math.floor(w / 2);
      const gap = y + Math.floor(h / 2);
      for (let yy = y + 1; yy < y + h - 1; yy++) {
        if (yy === gap || yy === gap + 1) continue;
        if (this.tile(px, yy) === floor) this.setTile(px, yy, T.WALL);
      }
    }
    if (h >= 9 && partitionCount > 1) {
      const py = y + Math.floor(h / 2);
      const gap = x + Math.floor(w / 3);
      for (let xx = x + 1; xx < x + w - 1; xx++) {
        if (xx === gap || xx === gap + 1) continue;
        if (this.tile(xx, py) === floor) this.setTile(xx, py, T.WALL);
      }
    }

    // camas
    let beds = def.beds || 0;
    for (let i = 0; i < beds; i++) {
      const spot = this.findFloorSpot(b, { needWall: true });
      if (spot) {
        this.beds.push({ x: spot.x, y: spot.y, building: id });
        this.decor.push({ type: 'bed', x: spot.x, y: spot.y, rot: chance(rng, 0.5) ? 0 : 1 });
      }
    }

    // contêineres
    const mult = def.loot || 1;
    for (const [ctype, count] of def.containers) {
      let n = count;
      if (n < 1) { if (!chance(rng, n)) continue; n = 1; }
      for (let i = 0; i < n; i++) {
        const spot = this.findFloorSpot(b, { needWall: true });
        if (!spot) continue;
        this.addContainer(ctype, spot.x, spot.y, b, mult);
      }
    }

    // mobília decorativa
    const decorTypes = type === 'mercado' ? ['shelf', 'counter'] : type === 'hospital' ? ['desk', 'chair'] :
      type === 'escola' ? ['desk', 'chair'] : type === 'oficina' ? ['toolbench', 'tire'] : ['table', 'chair', 'sofa'];
    for (let i = 0; i < Math.floor((w * h) / 28); i++) {
      const spot = this.findFloorSpot(b);
      if (spot) this.decor.push({ type: choose(rng, decorTypes), x: spot.x, y: spot.y, rot: randInt(rng, 0, 3) });
    }
    // bilhete ocasional
    if (chance(rng, 0.16)) {
      const spot = this.findFloorSpot(b);
      if (spot) this.notes.push({ x: spot.x, y: spot.y, text: choose(rng, NOTES) });
    }

    // POI
    this.pois.push({
      x: x + w / 2, y: y + h / 2, name: b.name, type,
      icon: type === 'hospital' ? '🏥' : type === 'mercado' ? '🛒' : type === 'delegacia' ? '🚔' :
        type === 'quartel' ? '🪖' : type === 'escola' ? '🏫' : type === 'posto' ? '⛽' :
          type === 'oficina' ? '🔧' : type === 'igreja' ? '⛪' : type === 'fazenda' ? '🌾' : '🏠',
      building: b.id,
    });
    this.zones.push({ id: uid('z'), name: b.name, x, y, w, h, kind: type, main: false });
    return b;
  }

  chooseDoorSides(b) {
    const sides = [];
    const check = (side, x, y) => {
      let d = 0;
      for (let k = 0; k < 6; k++) {
        let tx = x, ty = y;
        if (side === 'north') ty = b.y - 1 - k;
        if (side === 'south') ty = b.y + b.h + k;
        if (side === 'west') tx = b.x - 1 - k;
        if (side === 'east') tx = b.x + b.w + k;
        if (!this.inBounds(tx, ty)) break;
        const t = this.tile(tx, ty);
        if (t === T.ROAD || t === T.DIRT || t === T.SIDEWALK) { d = k; break; }
        d = k + 1;
      }
      sides.push({ side, d });
    };
    check('south', 0, 0); check('north', 0, 0); check('east', 0, 0); check('west', 0, 0);
    sides.sort((a, b2) => a.d - b2.d);
    return sides.map(s => s.side);
  }

  makeDoor(tx, ty, building, side) {
    this.setTile(tx, ty, T.DOOR);
    const key = tx + ',' + ty;
    this.doors.set(key, { x: tx, y: ty, open: false, hp: 100, maxHp: 100, building: building.id, side });
  }

  makeWindow(tx, ty, building) {
    this.setTile(tx, ty, T.WINDOW);
    this.windows.set(tx + ',' + ty, { x: tx, y: ty, hp: 60, maxHp: 60, broken: false, building: building.id });
  }

  findFloorSpot(b, opts = {}) {
    const rng = this.rng;
    const candidates = [];
    for (let y = b.y + 1; y < b.y + b.h - 1; y++) {
      for (let x = b.x + 1; x < b.x + b.w - 1; x++) {
        const t = this.tile(x, y);
        if (t === T.WALL || t === T.DOOR || t === T.WINDOW || t === T.WATER) continue;
        if (this.containerAtTile(x, y)) continue;
        if (this.beds.some(bd => bd.x === x && bd.y === y)) continue;
        if (this.decor.some(dd => dd.x === x && dd.y === y)) continue;
        // não bloquear portas
        let nearDoor = false;
        for (const key of this.doors.keys()) {
          const [dx, dy] = key.split(',').map(Number);
          if (Math.abs(dx - x) + Math.abs(dy - y) <= 2) { nearDoor = true; break; }
        }
        if (nearDoor) continue;
        let score = rng() * 10;
        if (opts.needWall) {
          const adjacentWall = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([ax, ay]) => this.tile(ax, ay) === T.WALL);
          if (!adjacentWall) continue;
          score -= 6;
        }
        candidates.push({ x, y, score });
      }
    }
    if (!candidates.length) return null;
    candidates.sort((a, c) => a.score - c.score);
    return candidates[Math.floor(rng() * Math.min(candidates.length, 5))];
  }

  containerAtTile(x, y) {
    return this.containers.find(c => c.x === x && c.y === y);
  }

  addContainer(type, tx, ty, building, mult = 1) {
    const info = CONTAINER_INFO[type];
    if (!info) return null;
    const id = 'ct' + (++this.containerId);
    const items = this.rollLoot(info.table, mult);
    const c = { id, type, x: tx, y: ty, building: building.id, searched: false, items, icon: info.icon, name: info.name, solid: info.solid };
    this.containers.push(c);
    return c;
  }

  rollLoot(tableId, mult = 1) {
    const table = LOOT_TABLES[tableId] || [];
    const out = [];
    for (const [itemId, p, min, max] of table) {
      if (!ITEMS[itemId]) continue;
      const prob = p * mult * (this.difficultyLoot || 1);
      if (chance(this.rng, Math.min(0.96, prob))) {
        const qty = randInt(this.rng, min, max);
        const it = { id: itemId, qty, condition: 1 };
        if (ITEMS[itemId].durability || ITEMS[itemId].type === 'clothing') {
          it.condition = Math.round(randRange(this.rng, 0.38, 1) * 100) / 100;
        }
        if (ITEMS[itemId].stack > 1 || ITEMS[itemId].type === 'material') it.qty = qty;
        out.push(it);
      }
    }
    return out;
  }

  buildingName(type, def, opts) {
    const rng = this.rng;
    const base = choose(rng, def.label);
    if (opts.key) {
      const special = {
        hospital: ['Hospital São Rafael', 'Hospital Central'], mercado: ['Mercado Bom Preço', 'Supermercado Vale'],
        delegacia: ['Delegacia Central', 'Posto Policial 04'], escola: ['Escola Municipal', 'Colégio Estadual'],
        quartel: ['Quartel da Guarda', 'Base do Exército'], posto: ['Posto Central', 'Auto Posto Rodovia'],
        oficina: ['Oficina do Zé', 'Auto Center'], igreja: ['Igreja da Sagrada Família', 'Capela São Jorge'],
        apartamento: ['Edifício Aurora', 'Bloco Residencial'], casa: ['Casa', 'Residência'],
      };
      return choose(rng, special[type] || [base]);
    }
    return base;
  }

  // ---------- zona rural ----------
  generateRural() {
    const rng = this.rng;
    const farms = [
      { cx: 52, cy: 84 }, { cx: 148, cy: 94 }, { cx: 70, cy: 168 },
      { cx: 168, cy: 120 }, { cx: 48, cy: 116 },
    ];
    for (const f of farms) {
      const x = f.cx, y = f.cy;
      if (this.nearBuilding(x, y, 10)) continue;
      const fw = randInt(rng, 9, 13), fh = randInt(rng, 7, 10);
      for (let yy = y; yy < y + fh; yy++) for (let xx = x; xx < x + fw; xx++) {
        if (this.tile(xx, yy) !== T.WATER && this.tile(xx, yy) !== T.ROAD) {
          this.setTile(xx, yy, (xx - x) % 3 === 0 ? T.DIRT : T.FARM);
        }
      }
      // celeiro
      const bg = this.findRuralSpot(x + fw + 2, y + 1, 9, 7);
      if (bg) this.addBuilding('fazenda', bg.x, bg.y, bg.w, bg.h, { town: 'Zona rural', name: choose(rng, ['Celeiro', 'Fazenda Santa Rita', 'Galpão da Fazenda']) });
      // cabana
      const cg = this.findRuralSpot(x - 5, y + 3, 7, 6);
      if (cg) this.addBuilding('cabana', cg.x, cg.y, cg.w, cg.h, { town: 'Zona rural' });
      // poço / caixa
      const spot = this.findRuralSpot(x + 2, y + fh + 2, 3, 3);
      if (spot) this.addContainer('caixa', spot.x, spot.y, { id: 0 }, 1.2);
      this.spawnPoints.push({ x: (x + 4) * TILE, y: (y + 3) * TILE, town: 'Zona rural' });
      this.pois.push({ x, y, name: choose(rng, ['Fazenda Boa Esperança', 'Plantação Abandonada', 'Sítio Recanto']), type: 'fazenda', icon: '🌾' });
      this.zones.push({ id: uid('z'), name: 'Zona rural', x: x - 4, y: y - 4, w: fw + 16, h: fh + 12, kind: 'rural' });
    }

    // cabanas isoladas e acampamentos
    for (let i = 0; i < 7; i++) {
      let px, py, tries = 0;
      do { px = randInt(rng, 8, this.w - 16); py = randInt(rng, 8, this.h - 16); tries++; } while (this.nearBuilding(px, py, 9) && tries < 40);
      const g = this.findRuralSpot(px, py, 7, 6);
      if (g) {
        this.addBuilding('cabana', g.x, g.y, g.w, g.h, { town: 'Zona rural' });
        this.pois.push({ x: g.x + 3, y: g.y + 3, name: 'Cabana isolada', type: 'cabana', icon: '🏚️' });
        this.spawnPoints.push({ x: (g.x + 3) * TILE, y: (g.y + 8) * TILE, town: 'Zona rural' });
      }
    }
    // acampamento
    for (const [sx, sy] of [[120, 66], [74, 140], [175, 74]]) {
      if (this.tile(sx, sy) === T.WATER) continue;
      this.decor.push({ type: 'tent', x: sx, y: sy, rot: 0 });
      this.decor.push({ type: 'tent', x: sx + 2, y: sy + 1, rot: 1 });
      this.decor.push({ type: 'campfire_dead', x: sx + 1, y: sy + 2, rot: 0 });
      this.addContainer('caixa', sx + 3, sy + 2, { id: 0 }, 1.1);
      this.spawnPoints.push({ x: (sx + 1) * TILE, y: (sy) * TILE, town: 'Zona rural' });
    }
  }

  nearBuilding(x, y, pad = 4) {
    return this.buildings.some(b => x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad);
  }

  findRuralSpot(x, y, w, h) {
    for (let attempt = 0; attempt < 24; attempt++) {
      const xx = x + randInt(this.rng, -4, 4), yy = y + randInt(this.rng, -4, 4);
      let ok = true;
      for (let ty = yy; ty < yy + h; ty++) for (let tx = xx; tx < xx + w; tx++) {
        const t = this.tile(tx, ty);
        if (!this.inBounds(tx, ty) || t === T.WATER || t === T.ROAD || t === T.WALL || t === T.FOREST) { ok = false; break; }
        if (this.nearBuilding(tx, ty, 2)) { ok = false; break; }
      }
      if (ok) return { x: xx, y: yy, w, h };
    }
    return null;
  }

  // ---------- natureza ----------
  placeTrees() {
    const rng = this.rng;
    for (let y = 1; y < this.h - 1; y++) {
      for (let x = 1; x < this.w - 1; x++) {
        const t = this.tile(x, y);
        if (t !== T.FOREST && !(t === T.GRASS && chance(rng, 0.012)) && !(t === T.TALLGRASS && chance(rng, 0.05))) continue;
        if (this.nearBuilding(x, y, 2)) continue;
        if (t === T.FOREST && !chance(rng, 0.5)) continue;
        const px = x * TILE + randInt(rng, 8, 24), py = y * TILE + randInt(rng, 8, 24);
        if (this.nearStartArea(px, py)) continue;
        const r = randInt(rng, 12, 21);
        this.trees.push({ x: px, y: py, r: r / 32, variant: randInt(rng, 0, 2), sway: rng() * TAU });
      }
    }
    for (let i = 0; i < 70; i++) {
      const x = randInt(rng, 2, this.w - 3), y = randInt(rng, 2, this.h - 3);
      const t = this.tile(x, y);
      if (t !== T.GRASS && t !== T.DIRT && t !== T.FOREST) continue;
      if (this.nearBuilding(x, y, 2)) continue;
      this.rocks.push({ x: x * TILE + 16, y: y * TILE + 16, r: randRange(rng, 0.3, 0.55) });
    }
  }

  nearStartArea(px, py) {
    if (!this.mainTown) return false;
    return dist(px, py, this.mainTown.cx * TILE, this.mainTown.cy * TILE) < 120;
  }

  // ---------- veículos ----------
  placeVehicles() {
    const rng = this.rng;
    const types = [
      { type: 'carro', w: 40, h: 20, weight: 50, fuel: [10, 60] },
      { type: 'caminhonete', w: 48, h: 23, weight: 25, fuel: [5, 45] },
      { type: 'van', w: 52, h: 25, weight: 15, fuel: [8, 50] },
      { type: 'fusca', w: 37, h: 19, weight: 20, fuel: [0, 30] },
    ];
    const colors = ['#7a3f36', '#3f4f66', '#6a6a5a', '#85664a', '#44543f', '#6d5f78', '#9a8f77', '#4a4a4a'];
    for (let i = 0; i < 18; i++) {
      let px, py, horizontal = chance(rng, 0.5), tries = 0;
      do {
        px = randInt(rng, 6, this.w - 7); py = randInt(rng, 6, this.h - 7);
        tries++;
      } while (this.tile(px, py) !== T.ROAD && this.tile(px, py) !== T.DIRT);
      if (tries > 100) continue;
      if (this.buildings.some(b => px > b.x - 2 && px < b.x + b.w + 2 && py > b.y - 2 && py < b.y + b.h + 2)) continue;
      if (this.vehicles.some(v => dist(v.x, v.y, px * TILE, py * TILE) < 90)) continue;
      let total = types.reduce((s, t) => s + t.weight, 0), r = rng() * total, def = types[0];
      for (const t of types) { r -= t.weight; if (r <= 0) { def = t; break; } }
      const along = this.tile(px + 1, py) === T.ROAD || this.tile(px - 1, py) === T.ROAD;
      const angle = along ? 0 : Math.PI / 2;
      const v = {
        id: uid('v'), type: def.type, x: px * TILE + 16, y: py * TILE + 16, angle,
        w: def.w, h: def.h, color: choose(rng, colors),
        fuel: randRange(rng, def.fuel[0], def.fuel[1]),
        maxFuel: 60, condition: randRange(rng, 25, 100), maxCondition: 100,
        trunk: this.rollLoot('porta_malas', 0.8), trunkOpen: false,
        speed: 0, occupied: false, engineOn: false, noise: 0, hp: 100,
      };
      if (this.vehicles.some(other => dist(v.x, v.y, other.x, other.y) < 80)) continue;
      this.vehicles.push(v);
    }
    // um veículo garantido perto do início
    if (this.mainTown) {
      const tx = this.mainTown.cx + 12, ty = this.mainTown.cy + 4;
      if (this.tile(tx, ty) === T.ROAD) {
        this.vehicles.push({
          id: uid('v'), type: 'caminhonete', x: tx * TILE + 16, y: ty * TILE + 16, angle: 0,
          w: 48, h: 23, color: '#6a6a5a', fuel: 24, maxFuel: 60, condition: 62, maxCondition: 100,
          trunk: this.rollLoot('porta_malas', 1.1), trunkOpen: false, speed: 0, occupied: false, engineOn: false, noise: 0, hp: 100,
        });
      }
    }
  }

  buildSpawnPoints() {
    for (const b of this.buildings) {
      this.spawnPoints.push({ x: (b.x + b.w / 2) * TILE, y: (b.y + b.h / 2) * TILE, town: b.town });
      if (chance(this.rng, 0.5)) this.spawnPoints.push({ x: (b.x + b.w / 2 + 3) * TILE, y: (b.y + b.h + 1) * TILE, town: b.town });
    }
    for (let i = 0; i < 50; i++) {
      const x = randInt(this.rng, 4, this.w - 5), y = randInt(this.rng, 4, this.h - 5);
      if (this.tile(x, y) === T.WATER || this.tile(x, y) === T.WALL) continue;
      this.spawnPoints.push({ x: x * TILE + 16, y: y * TILE + 16, town: '' });
    }
    // ordena por distância ao centro para ter densidade urbana
    this.spawnPoints = shuffle(this.rng, this.spawnPoints);
  }

  chooseStart() {
    const main = this.mainTown;
    const houses = this.buildings.filter(b => b.town === 'Vale Sereno');
    const house = houses.find(b => b.type === 'casa') || houses[0];
    if (!house) {
      this.start.x = main.cx * TILE; this.start.y = main.cy * TILE;
      return;
    }
    // porta sul
    let door = [...this.doors.values()].find(d => d.building === house.id && d.side === 'south');
    if (!door) door = [...this.doors.values()].find(d => d.building === house.id);
    if (door) {
      // começa dentro, um tile à frente da porta
      let sx = door.x * TILE + 16, sy = door.y * TILE + 16;
      if (door.side === 'south') sy -= TILE;
      else if (door.side === 'north') sy += TILE;
      else if (door.side === 'east') sx -= TILE;
      else if (door.side === 'west') sx += TILE;
      if (this.solidTile(Math.floor(sx / TILE), Math.floor(sy / TILE))) { sx = door.x * TILE + 16; sy = door.y * TILE + 16; }
      this.start.x = sx; this.start.y = sy; this.start.angle = -Math.PI / 2;
      house.discovered = true;
    } else {
      this.start.x = (house.x + house.w / 2) * TILE;
      this.start.y = (house.y + house.h + 2) * TILE;
    }
    this.startHouse = house.id;
    // limpa zumbis/spawns muito próximos do início
    this.spawnPoints = this.spawnPoints.filter(p => dist(p.x, p.y, this.start.x, this.start.y) > 340);
    // garante uma caixa de suprimentos inicial
    const spot = this.findFloorSpot(house, { needWall: true });
    if (spot) this.addContainer('cozinha', spot.x, spot.y, house, 1.3);
    this.startBuilding = house;
  }

  // ---------- colisão ----------
  solidTile(tx, ty) {
    const t = this.tile(tx, ty);
    if (t === T.WALL || t === T.WATER) return true;
    if (t === T.DOOR) {
      const d = this.doors.get(tx + ',' + ty);
      if (!d) return false;
      if (this.portalStructures.has(tx + ',' + ty)) return true;
      return !d.open;
    }
    if (t === T.WINDOW) {
      const w = this.windows.get(tx + ',' + ty);
      if (!w) return false;
      return !w.broken || this.portalStructures.has(tx + ',' + ty);
    }
    return false;
  }

  structureAt(x, y) { return this.structures.find(s => s.x === x && s.y === y); }

  addStructure(s) {
    this.structures.push(s);
    if (s.portal) {
      this.portalStructures.set(s.x + ',' + s.y, s);
      const d = this.doors.get(s.x + ',' + s.y);
      if (d) d.barricaded = true;
      const w = this.windows.get(s.x + ',' + s.y);
      if (w) w.barricaded = true;
    }
    this.gridAdd({ kind: 'structure', x: s.x, y: s.y, ref: s, solid: true });
  }

  removeStructure(s) {
    const i = this.structures.indexOf(s);
    if (i >= 0) this.structures.splice(i, 1);
    if (s.portal) {
      this.portalStructures.delete(s.x + ',' + s.y);
      const d = this.doors.get(s.x + ',' + s.y); if (d) d.barricaded = false;
      const w = this.windows.get(s.x + ',' + s.y); if (w) w.barricaded = false;
    }
    this.gridRemove('structure', s.x, s.y, s);
  }

  buildStaticGrid() {
    this.objGrid.clear();
    for (const c of this.containers) this.gridAdd({ kind: 'container', x: c.x, y: c.y, ref: c, solid: c.solid });
    for (const t of this.trees) this.gridAdd({ kind: 'tree', x: Math.floor(t.x / TILE), y: Math.floor(t.y / TILE), ref: t, solid: true });
    for (const r of this.rocks) this.gridAdd({ kind: 'rock', x: Math.floor(r.x / TILE), y: Math.floor(r.y / TILE), ref: r, solid: true });
    for (const s of this.structures) this.gridAdd({ kind: 'structure', x: s.x, y: s.y, ref: s, solid: true });
  }

  gridKey(x, y) { return x + ',' + y; }
  gridAdd(o) {
    const k = this.gridKey(o.x, o.y);
    if (!this.objGrid.has(k)) this.objGrid.set(k, []);
    this.objGrid.get(k).push(o);
  }
  gridRemove(kind, x, y, ref) {
    const k = this.gridKey(x, y);
    const arr = this.objGrid.get(k);
    if (!arr) return;
    const idx = arr.findIndex(o => o.kind === kind && o.ref === ref);
    if (idx >= 0) arr.splice(idx, 1);
  }

  objectsNear(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    const out = [];
    for (let yy = ty - 1; yy <= ty + 1; yy++) for (let xx = tx - 1; xx <= tx + 1; xx++) {
      const arr = this.objGrid.get(this.gridKey(xx, yy));
      if (arr) for (const o of arr) out.push(o);
    }
    return out;
  }

  circleHitsRect(cx, cy, r, rx, ry, rw, rh) {
    const nx = clamp(cx, rx, rx + rw), ny = clamp(cy, ry, ry + rh);
    return dist(cx, cy, nx, ny) < r;
  }

  collidesCircle(x, y, r = 10, ignoreVehicle = null) {
    const minX = Math.floor((x - r) / TILE), maxX = Math.floor((x + r) / TILE);
    const minY = Math.floor((y - r) / TILE), maxY = Math.floor((y + r) / TILE);
    for (let ty = minY; ty <= maxY; ty++) for (let tx = minX; tx <= maxX; tx++) {
      if (this.solidTile(tx, ty) && this.circleHitsRect(x, y, r, tx * TILE, ty * TILE, TILE, TILE)) return true;
    }
    for (const o of this.objectsNear(x, y)) {
      if (!o.solid) continue;
      if (o.kind === 'tree') {
        if (dist(x, y, o.ref.x, o.ref.y) < r + o.ref.r * 8) return true;
      } else if (o.kind === 'rock') {
        if (dist(x, y, o.ref.x, o.ref.y) < r + o.ref.r * 13) return true;
      } else {
        const rx = o.x * TILE + 3, ry = o.y * TILE + 3, rw = TILE - 6, rh = TILE - 6;
        if (this.circleHitsRect(x, y, r, rx, ry, rw, rh)) return true;
      }
    }
    for (const v of this.vehicles) {
      if (v === ignoreVehicle || v.occupied) continue;
      if (this.collidesRotRect(x, y, r, v)) return true;
    }
    return false;
  }

  collidesRotRect(x, y, r, rect) {
    const dx = x - rect.x, dy = y - rect.y;
    const c = Math.cos(-rect.angle), s = Math.sin(-rect.angle);
    const lx = dx * c - dy * s, ly = dx * s + dy * c;
    const hw = rect.w / 2 + r, hh = rect.h / 2 + r;
    if (Math.abs(lx) > hw || Math.abs(ly) > hh) return false;
    // aproximação de canto arredondado
    const cx = clamp(lx, -rect.w / 2, rect.w / 2), cy = clamp(ly, -rect.h / 2, rect.h / 2);
    return dist(lx, ly, cx, cy) < r;
  }

  lineOfSight(x1, y1, x2, y2) {
    const d = dist(x1, y1, x2, y2);
    const steps = Math.ceil(d / 12);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t;
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      const tile = this.tile(tx, ty);
      if (tile === T.WALL) return false;
      if (tile === T.DOOR) {
        const door = this.doors.get(tx + ',' + ty);
        if (door && !door.open) return false;
      }
      if (tile === T.WINDOW) {
        const win = this.windows.get(tx + ',' + ty);
        if (win && win.barricaded) return false;
      }
    }
    return true;
  }

  isSolidAtPoint(x, y) { return this.collidesCircle(x, y, 6); }

  // ---------- helpers de jogo ----------
  doorAt(x, y) { return this.doors.get(x + ',' + y); }
  windowAt(x, y) { return this.windows.get(x + ',' + y); }

  buildingAt(px, py) {
    const tx = px / TILE, ty = py / TILE;
    return this.buildings.find(b => tx >= b.x && tx < b.x + b.w && ty >= b.y && ty < b.y + b.h);
  }

  zoneAt(px, py) {
    const tx = px / TILE, ty = py / TILE;
    return this.zones.find(z => tx >= z.x && tx < z.x + z.w && ty >= z.y && ty < z.y + z.h);
  }

  containerNear(px, py, radius = 46) {
    let best = null, bd = radius;
    for (const c of this.containers) {
      const d = dist(px, py, c.x * TILE + 16, c.y * TILE + 16);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  doorNear(px, py, radius = 48) {
    let best = null, bd = radius;
    for (const d of this.doors.values()) {
      const dd = dist(px, py, d.x * TILE + 16, d.y * TILE + 16);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }

  windowNear(px, py, radius = 60) {
    let best = null, bd = radius;
    for (const w of this.windows.values()) {
      if (w.broken) continue;
      const dd = dist(px, py, w.x * TILE + 16, w.y * TILE + 16);
      if (dd < bd) { bd = dd; best = w; }
    }
    return best;
  }

  bedNear(px, py, radius = 50) {
    let best = null, bd = radius;
    for (const b of this.beds) {
      const d = dist(px, py, b.x * TILE + 16, b.y * TILE + 16);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  noteNear(px, py, radius = 45) {
    let best = null, bd = radius;
    for (const n of this.notes) {
      const d = dist(px, py, n.x * TILE + 16, n.y * TILE + 16);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  structureNear(px, py, radius = 46) {
    let best = null, bd = radius;
    for (const s of this.structures) {
      const d = dist(px, py, s.x * TILE + 16, s.y * TILE + 16);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  vehicleNear(px, py, radius = 70) {
    let best = null, bd = radius;
    for (const v of this.vehicles) {
      if (v.occupied) continue;
      const d = dist(px, py, v.x, v.y);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  reveal(tx, ty, radius = 9) {
    for (let y = ty - radius; y <= ty + radius; y++) for (let x = tx - radius; x <= tx + radius; x++) {
      if (!this.inBounds(x, y)) continue;
      if ((x - tx) ** 2 + (y - ty) ** 2 <= radius * radius) this.explored[y * this.w + x] = 1;
    }
    for (const b of this.buildings) {
      if (!b.discovered && dist(b.x + b.w / 2, b.y + b.h / 2, tx, ty) < radius + 5) b.discovered = true;
    }
  }

  randomWalkableNear(x, y, radius = 300) {
    for (let i = 0; i < 40; i++) {
      const a = this.rng() * TAU, r = randRange(this.rng, 30, radius);
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (!this.collidesCircle(px, py, 11)) return { x: px, y: py };
    }
    return { x, y };
  }

  getMinimapColor(tx, ty) {
    const t = this.tile(tx, ty);
    if (t === T.DOOR) return '#8a6238';
    if (t === T.WINDOW) return '#5b7d88';
    return MINIMAP_COLORS[t] || '#333';
  }

  serialize() {
    return {
      seed: this.seed,
      doors: [...this.doors.values()].map(d => ({ k: d.x + ',' + d.y, open: d.open, hp: d.hp })),
      windows: [...this.windows.values()].map(w => ({ k: w.x + ',' + w.y, broken: w.broken, hp: w.hp })),
      containers: this.containers.map(c => ({ id: c.id, searched: c.searched, items: c.items })),
      vehicles: this.vehicles.map(v => ({ id: v.id, fuel: v.fuel, condition: v.condition, trunk: v.trunk, x: v.x, y: v.y, angle: v.angle })),
      structures: this.structures.map(s => ({ ...s })),
      explored: this.explored,
      notesRead: this.notesRead || [],
    };
  }

  applySave(sv) {
    if (!sv) return;
    if (sv.doors) for (const d of sv.doors) { const door = this.doors.get(d.k); if (door) { door.open = d.open; door.hp = d.hp; } }
    if (sv.windows) for (const w of sv.windows) { const win = this.windows.get(w.k); if (win) { win.broken = w.broken; win.hp = w.hp; } }
    if (sv.containers) for (const c of sv.containers) {
      const cont = this.containers.find(x => x.id === c.id);
      if (cont) { cont.searched = c.searched; cont.items = c.items || []; }
    }
    if (sv.vehicles) for (const v of sv.vehicles) {
      const veh = this.vehicles.find(x => x.id === v.id);
      if (veh) { veh.fuel = v.fuel; veh.condition = v.condition; veh.trunk = v.trunk || []; veh.x = v.x; veh.y = v.y; veh.angle = v.angle; }
    }
    if (sv.structures) {
      this.structures = [];
      this.portalStructures.clear();
      for (const s of sv.structures) this.addStructure({ ...s });
    }
    if (sv.explored) {
      this.explored = typeof sv.explored === 'string'
        ? bytesFromB64(sv.explored)
        : new Uint8Array(sv.explored);
    }
    if (sv.notesRead) this.notesRead = sv.notesRead;
    for (const b of this.buildings) {
      const tx = Math.floor((b.x + b.w / 2)), ty = Math.floor((b.y + b.h / 2));
      if (this.explored[ty * this.w + tx]) b.discovered = true;
    }
  }

  countNearbyBuildings(px, py, radius) {
    return this.buildings.filter(b => dist(px, py, (b.x + b.w / 2) * TILE, (b.y + b.h / 2) * TILE) < radius).length;
  }
}

export { TOWN_NAMES, ROAD_COLORS };
