/* ==========================================================================
   CINZAS DE AURORA — an isometric survival sandbox.
   Procedural world, characters, weather, UI and audio. No external assets.
   ========================================================================== */
import {
  PROFESSIONS, DIFFICULTIES, ITEMS, RECIPES, BUILDABLES, CROPS, SKILLS,
  SKILL_LEVEL_XP, SAVE_KEY
} from './data.js';
import { createWorld, T, TILE_W, TILE_H, WALL_H } from './world.js';

const $ = (sel) => document.querySelector(sel);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const TAU = Math.PI * 2;
const MIN_PER_SEC = 1.18;
const rnd = (a = 1) => Math.random() * a;
const rndi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = (minutes) => `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(Math.floor(minutes % 60)).padStart(2, '0')}`;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

const canvas = $('#game');
const ctx = canvas.getContext('2d', { alpha: false });

const G = {
  mode: 'menu', dead: false, started: false, paused: false,
  time: 0, last: 0, W: 0, H: 0, dpr: 1,
  zoom: 1.1, baseZoom: 1.1,
  cam: { x: 0, y: 0 },
  shake: 0, flash: 0, flashCooldown: 0,
  player: null, world: null,
  zombies: [], vehicles: [], structures: [], pickups: [],
  decals: [], corpses: [], particles: [], floats: [], rain: [],
  discovered: null, foundLocations: new Set(), containers: new Map(),
  objectiveFlags: {}, stats: {},
  target: null, fishing: null, placing: null, buildTarget: null,
  selectedProfession: 'survivor', selectedDifficulty: 'normal', playerName: 'Aurora',
  timeOfDay: { day: 1, minutes: 16 * 60 + 40 },
  weather: { type: 'clear', label: 'Limpo', temp: 19, targetTemp: 19, wind: 2, next: 0, intensity: 0 },
  settings: { volume: 0.6, quality: 'medium', gore: true, autosave: true },
  ui: { panel: null, tab: 'craft', selected: null, container: null, farmPlot: null },
  uid: 1, saveTimer: 0, hudTimer: 0, discoverTimer: 0, spawnTimer: 0, ambientTimer: 0,
  noiseTimer: 0, footTimer: 0, frame: 0, lastSave: 0,
  noises: [], hudQuickSig: '', lastNightState: null, lastWeatherType: null,
  audioReady: false, trail: []
};

/* Input state is shared by the keyboard, the virtual joystick and the touch pad. */
const input = {
  keys: new Set(), joy: { x: 0, y: 0, active: false }, sprint: false, crouch: false
};

const DIFF = () => DIFFICULTIES[G.selectedDifficulty] || DIFFICULTIES.normal;
const IN_BAG = (id) => G.player?.inventory.some(e => e.id === id);
const entryOf = (id) => G.player?.inventory.find(e => e.id === id);
const countOf = (id) => G.player ? G.player.inventory.filter(e => e.id === id).reduce((n, e) => n + e.qty, 0) : 0;

/* ---------------------------------------------------------------- audio */
const AudioFX = {
  ctx: null, master: null, rainGain: null, rainSrc: null, noiseBuf: null,
  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = G.settings.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      const src = this.ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 900;
      const gain = this.ctx.createGain(); gain.gain.value = 0;
      src.connect(filt); filt.connect(gain); gain.connect(this.master);
      src.start();
      this.rainGain = gain; this.rainSrc = src;
      G.audioReady = true;
    } catch (e) { /* audio is a bonus */ }
  },
  setVolume(v) { if (this.master) this.master.gain.value = v; },
  tone(freq = 440, dur = .08, vol = .12, type = 'sine', slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + .02);
  },
  noise(dur = .1, vol = .1, freq = 1000, q = 1) {
    if (!this.ctx || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + .02);
  },
  ui() { this.tone(620, .04, .05, 'square', -80); },
  pickup() { this.tone(760, .06, .07, 'sine', 260); },
  hit() { this.noise(.12, .2, 420, .7); this.tone(75, .12, .13, 'sine', -30); },
  swing() { this.noise(.09, .07, 1800, .8); },
  hurt() { this.noise(.16, .18, 280, .6); this.tone(95, .18, .1, 'sawtooth', -40); },
  zombie(volume = .1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(90 + rnd(40), t); o.frequency.exponentialRampToValueAtTime(48, t + .55);
    f.type = 'lowpass'; f.frequency.value = 380;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(volume, t + .04); g.gain.exponentialRampToValueAtTime(.001, t + .6);
    o.connect(f); f.connect(g); g.connect(this.master); o.start(t); o.stop(t + .62);
  },
  eat() { this.tone(230, .08, .08, 'sine', 90); },
  drink() { [0, .09, .18].forEach((d, i) => setTimeout(() => this.tone(420 + i * 110, .06, .05, 'sine', -30), d * 1000)); },
  thunder() {
    if (!this.ctx) return;
    this.noise(1.8, .24, 100, .4);
    this.tone(42, 1.5, .12, 'sine', -18);
  },
  setRain(amount) {
    if (this.rainGain) this.rainGain.gain.setTargetAtTime(amount * .07, this.ctx.currentTime, 1.5);
  }
};

/* ---------------------------------------------------------------- helpers */
function itemDef(id) { return ITEMS[id] || { name: id, cat: 'junk', weight: 0, desc: '', icon: 'box', color: '#999' }; }
function iconFor(kind) {
  const P = {
    can: '<rect x="8" y="5" width="8" height="15" rx="1"/><path d="M8 8h8M8 17h8"/><ellipse cx="12" cy="5" rx="4" ry="1.5"/>',
    bread: '<path d="M4 9c0-3 3-5 8-5s8 2 8 5c0 5-3 9-8 9s-8-4-8-9Z"/><path d="M8 7c1 3 1 5 0 8M13 6c1 4 1 7 0 10M17 8c-1 2-1 4 0 6"/>',
    bag: '<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2M9 12h6"/>',
    apple: '<path d="M12 7c-4-3-8 0-7 5 1 5 4 9 7 9s6-4 7-9c1-5-3-8-7-5Z"/><path d="M12 7c0-2 1-4 3-4M12 7c-1-2-2-3-4-3"/>',
    fish: '<path d="M3 12c4-5 10-6 15-3l3-3-1 5 1 5-3-3c-5 3-11 2-15-1Z"/><circle cx="9" cy="11" r="1"/><path d="M15 7c2 2 2 5 0 7"/>',
    pot: '<path d="M4 9h16v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z"/><path d="M7 9V6M17 9V6M2 12H4M20 12h2"/>',
    bottle: '<path d="M10 3h4v4l2 3v10H8V10l2-3V3Z"/><path d="M8 12h8M10 3h4"/>',
    bandage: '<rect x="4" y="9" width="16" height="6" rx="3" transform="rotate(-20 12 12)"/><path d="m9 9 1 6M14 8l1 6"/>',
    medkit: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M8 6V4h8v2M12 10v6M9 13h6"/>',
    pills: '<rect x="4" y="8" width="16" height="8" rx="4" transform="rotate(-25 12 12)"/><path d="m10 7 4 10"/>',
    cloth: '<path d="M4 6c3 2 5-2 8 0s5-2 8 0v12c-3-2-5 2-8 0s-5 2-8 0V6Z"/><path d="M8 8v8M16 8v8"/>',
    knife: '<path d="M4 20 16 8l4-4-1 6-7 8-6 4-2-2Z"/><path d="m14 10 3 3"/>',
    crowbar: '<path d="m4 20 12-12c2-2 3-4 2-5l3 3c-1-1-3 0-5 2L8 20H4Z"/><path d="m4 16 4 4"/>',
    axe: '<path d="m6 20 9-15 5 3-9 15-5-3Z"/><path d="M14 4c3-1 6 0 7 3-1 2-4 3-7 2"/>',
    bat: '<path d="m5 20 3-1 11-13a2 2 0 0 0-3-3L5 15l-1 4 1 1Z"/>',
    spear: '<path d="M4 20 18 6M16 4l4 4M17 3l4 4-5 1-3-3 1-5Z"/>',
    hammer: '<path d="m5 20 9-9M12 5l7 7M15 2l7 7-3 3-7-7 3-3Z"/>',
    wrench: '<path d="M14 4a4 4 0 0 0-4 6L4 16l4 4 6-6a4 4 0 0 0 6-4l-3 3-3-3 3-3a4 4 0 0 0-3-3Z"/>',
    flashlight: '<rect x="7" y="8" width="10" height="12" rx="2"/><path d="M8 8V6h8v2M9 4h6M12 2v2M6 20l-2 2M18 20l2 2"/>',
    battery: '<rect x="8" y="3" width="8" height="18" rx="2"/><path d="M10 3V2h4v1M11 7h2M11 11h2M11 15h2"/>',
    plank: '<path d="m4 17 12-12 4 4L8 21l-4-4Z"/><path d="m6 17 2 2M10 13l2 2M14 9l2 2"/>',
    nail: '<path d="M12 3v14M9 17h6l-3 4-3-4ZM9 6h6"/>',
    scrap: '<path d="m4 15 3-7 5 2 4-5 4 6-2 6-4 3-6-1-4-4Z"/><path d="m8 8 3 6M11 10l5 6"/>',
    rope: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="m5 17 3-3M16 10l3-3"/>',
    tape: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M15 15l5 5"/>',
    fuel: '<rect x="5" y="5" width="13" height="16" rx="1"/><path d="M8 5V3h5v2M18 8h2v5h-2M9 10h5M9 14h5"/>',
    matches: '<rect x="6" y="9" width="12" height="11" rx="1"/><path d="M9 9V6M12 9V4M15 9V6M9 13h6"/>',
    seed: '<path d="M12 4c5 3 6 8 4 12-3 3-7 2-9-1-2-4 0-8 5-11Z"/><path d="M12 8v8M9 12l3 3 3-3"/>',
    carrot: '<path d="M12 8c4 4 5 10 2 13-3-3-9-4-13-2 2-4 7-8 11-11Z"/><path d="M13 8c0-3 2-5 5-5M13 8c2-2 5-2 6 0"/>',
    potato: '<path d="M6 12c-1-5 3-8 8-7 6 1 7 7 4 11-3 4-9 3-11 0-1-1-1-2-1-4Z"/><path d="M9 10h.1M14 13h.1M11 16h.1"/>',
    jacket: '<path d="M8 3 4 7l2 4 2-1v10h8V10l2 1 2-4-4-4-4 3-4-3Z"/><path d="M12 6v14M8 3l4 5 4-5"/>',
    boots: '<path d="M7 3h4v10l6 4v4H7V3Z"/><path d="M7 14h5M11 13v8"/>',
    book: '<path d="M4 5c3-1 5-1 8 1 3-2 5-2 8-1v14c-3-1-5-1-8 1-3-2-5-2-8-1V5Z"/><path d="M12 6v14"/>',
    map: '<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2V6Z"/><path d="M9 4v14M15 6v14"/>',
    box: '<path d="m4 7 8-4 8 4v10l-8 4-8-4V7Z"/><path d="m4 7 8 4 8-4M12 11v10"/>'
  };
  return `<svg viewBox="0 0 24 24">${P[kind] || P.box}</svg>`;
}
function itemCardHTML(entry, selected) {
  const d = itemDef(entry.id);
  const durability = entry.durability != null && d.durability ? `<span class="item-tag">${Math.round(entry.durability)}%</span>` : `<span class="item-tag">${d.cat}</span>`;
  return `<button class="item-card ${selected ? 'selected' : ''}" data-uid="${entry.uid}" style="--ic:${d.color}">
    ${entry.qty > 1 ? `<span class="item-qty">${entry.qty}</span>` : ''}
    <span class="item-ico">${iconFor(d.icon)}</span>
    <span class="item-name">${esc(d.name)}</span>${durability}
  </button>`;
}
function weightCap() {
  const p = G.player; if (!p) return 20;
  return 20 + (p.clothing.backpack ? 7 : 0) + (p.clothing.coat ? 2 : 0);
}
function carriedWeight() {
  const p = G.player; if (!p) return 0;
  let w = 0;
  for (const e of p.inventory) w += (ITEMS[e.id]?.weight || 0) * e.qty;
  if (p.weapon) w += ITEMS[p.weapon.id]?.weight || 0;
  if (p.clothing.jacket) w += 1.2;
  if (p.clothing.boots) w += 1;
  if (p.clothing.backpack) w += .9;
  return w;
}
function makeEntry(id, qty = 1, durability) {
  const d = itemDef(id);
  const e = { uid: G.uid++, id, qty };
  if (durability != null) e.durability = durability;
  else if (d.durability) e.durability = d.durability;
  return e;
}
function addItem(id, qty = 1, durability, silent = false) {
  const p = G.player; if (!p) return 0;
  const d = itemDef(id);
  let added = 0;
  const cap = weightCap();
  let current = carriedWeight();
  const per = d.weight || 0;
  if (per > 0 && current >= cap) {
    if (!silent) toast('Mochila cheia. Solte algo ou vista outra mochila.', 'bad');
    return 0;
  }
  if (per > 0) qty = Math.min(qty, Math.max(1, Math.floor((cap - current) / per)));
  if (d.stack || d.cat === 'material' || d.cat === 'food' || d.cat === 'drink' || d.cat === 'medical') {
    const same = p.inventory.find(e => e.id === id && (e.durability == null || durability == null));
    if (same) {
      const max = d.stack || 20;
      const room = max - same.qty;
      const move = Math.min(room, qty);
      same.qty += move; added += move; qty -= move;
      if (qty <= 0) { if (!silent) { AudioFX.pickup(); } return added; }
    }
  }
  while (qty > 0) {
    const d2 = itemDef(id);
    const stackable = ['material', 'food', 'drink', 'medical', 'seed'].includes(d2.cat);
    const chunk = Math.min(qty, d2.stack || (stackable ? 20 : 1));
    p.inventory.push(makeEntry(id, chunk, durability));
    added += chunk; qty -= chunk;
  }
  if (added && !silent) AudioFX.pickup();
  return added;
}
function removeItem(id, qty = 1) {
  const p = G.player; if (!p) return 0;
  let left = qty;
  for (let i = p.inventory.length - 1; i >= 0 && left > 0; i--) {
    const e = p.inventory[i];
    if (e.id !== id) continue;
    const take = Math.min(e.qty, left);
    e.qty -= take; left -= take;
    if (e.qty <= 0) p.inventory.splice(i, 1);
  }
  return qty - left;
}
function dropItemEntry(entry) {
  const p = G.player;
  p.inventory = p.inventory.filter(e => e.uid !== entry.uid);
  G.pickups.push({ id: entry.id, qty: entry.qty, durability: entry.durability, x: p.x + rnd(.5) - .25, y: p.y + rnd(.5) - .25, born: G.time });
  toast(`${itemDef(entry.id).name} deixado no chão.`);
  closePanel();
}
function toast(text, type = '', ms = 4000) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = text;
  box.appendChild(el);
  while (box.children.length > 5) box.firstChild.remove();
  setTimeout(() => el.remove(), ms + 280);
}
function floatText(text, x, y, color = '#f0c16c') {
  G.floats.push({ text, x, y, color, life: 1.25, max: 1.25 });
}
function shake(amount = 6) { G.shake = Math.max(G.shake, amount); }
function emitNoise(x, y, radius) {
  const p = G.player;
  for (const z of G.zombies) {
    if (z.dead) continue;
    const d = dist(x, y, z.x, z.y);
    if (d > radius) continue;
    if (z.state === 'hunt') continue;
    z.state = 'investigate';
    z.timer = 6 + rnd(5);
    z.tx = x + rnd(1.5) - .75;
    z.ty = y + rnd(1.5) - .75;
  }
  G.noises.push({ x, y, radius, life: .7 });
}

/* ---------------------------------------------------------------- new game */
function createPlayer(professionId) {
  const prof = PROFESSIONS.find(p => p.id === professionId) || PROFESSIONS[0];
  const skills = {};
  for (const id of Object.keys(SKILLS)) skills[id] = 0;
  Object.assign(skills, prof.skills || {});
  const xp = {};
  for (const id of Object.keys(SKILLS)) xp[id] = SKILL_LEVEL_XP[Math.min(skills[id] || 0, SKILL_LEVEL_XP.length - 1)];
  const p = {
    x: 66.3, y: 66.1, facing: 0.8, radius: .29,
    health: 100, maxHealth: 100,
    hunger: 86, thirst: 81, sleep: 78, stamina: 100,
    hygiene: 76, stress: 10, pain: 0, bodyTemp: 36.6, wet: 0,
    bleed: 0, infection: 0, infected: false, sickness: 0,
    weapon: null, clothing: { backpack: false, jacket: false, boots: false },
    flashlightOn: false, battery: 100,
    inventory: [], skills, xp,
    crouch: false, sprint: false, moving: false,
    attackCd: 0, attackAnim: 0, hurtFlash: 0, walkPhase: 0,
    distance: 0, inVehicle: null,
    name: G.playerName || 'Aurora', profession: prof.id, professionName: prof.name,
    dead: false, cause: ''
  };
  // The character starts with a little history in their pockets.
  for (const [id, qty] of Object.entries(prof.items || {})) {
    const d = itemDef(id);
    addItemTo(p, id, d.durability ? 1 : qty, d.durability ? Math.round(d.durability * (.72 + rnd(.24))) : undefined);
  }
  // Basic clothes and a bag for everyone. They are equipped, not carried.
  addItemTo(p, 'cloth', 1);
  for (const id of ['backpack_small', 'jacket', 'boots']) {
    if (!p.inventory.some(e => e.id === id)) addItemTo(p, id, 1);
  }
  equipStarting(p, 'backpack_small');
  equipStarting(p, 'jacket');
  equipStarting(p, 'boots');
  // Auto-equip the best starting weapon so the first encounter is fair.
  const weapon = p.inventory.find(e => itemDef(e.id).weapon);
  if (weapon) equipWeapon(p, weapon, true);
  return p;
}
function addItemTo(p, id, qty = 1, durability) {
  const d = itemDef(id);
  if (d.stack || ['material', 'food', 'drink', 'medical', 'seed'].includes(d.cat)) {
    const same = p.inventory.find(e => e.id === id && e.durability == null);
    if (same && durability == null) { same.qty += qty; return; }
  }
  p.inventory.push({ uid: G.uid++, id, qty, ...(durability != null ? { durability } : d.durability ? { durability: d.durability } : {}) });
}
function equipStarting(p, id) {
  const e = p.inventory.find(x => x.id === id);
  if (!e) return;
  if (id === 'backpack_small') p.clothing.backpack = true;
  else if (id === 'jacket') p.clothing.jacket = true;
  else if (id === 'boots') p.clothing.boots = true;
  p.inventory = p.inventory.filter(x => x !== e);
}
function equipWeapon(p, entry, silent = false) {
  if (!entry) { p.weapon = null; return; }
  const d = itemDef(entry.id);
  if (!d.weapon) return;
  const old = p.weapon;
  p.inventory = p.inventory.filter(e => e.uid !== entry.uid);
  p.weapon = { id: entry.id, durability: entry.durability ?? d.durability };
  if (old) p.inventory.push(makeEntry(old.id, 1, old.durability));
  if (!silent) { AudioFX.pickup(); toast(`${d.name} equipado.`); }
  G.objectiveFlags.equip = true;
}
function newGame() {
  const diff = DIFF();
  const seed = (Date.now() ^ (Math.random() * 999999)) >>> 0;
  const world = createWorld(seed, diff.id, diff.loot);
  G.world = world;
  G.zombies = world.zombies;
  G.vehicles = world.vehicles;
  G.containers = new Map(world.containers.map(c => [c.id, c]));
  G.structures = [];
  G.pickups = [];
  G.decals = [];
  G.corpses = [];
  G.particles = [];
  G.floats = [];
  G.rain = [];
  G.noises = [];
  G.discovered = new Uint8Array(world.size * world.size);
  G.foundLocations = new Set(['Cruzamento Central']);
  G.objectiveFlags = {};
  G.stats = {
    zombiesKilled: 0, looted: 0, built: 0, harvested: 0, fish: 0,
    distance: 0, ate: 0, drank: 0, bandaged: 0, days: 1, startedAt: Date.now()
  };
  G.player = createPlayer(G.selectedProfession);
  G.timeOfDay = { day: 1, minutes: 16 * 60 + 25 };
  G.weather = { type: 'clear', label: 'Limpo', temp: 21, targetTemp: 21, wind: 2, next: (16 * 60 + 25) + 45, intensity: 0 };
  G.mode = 'playing';
  G.started = true;
  G.dead = false;
  G.saveTimer = 0;
  G.fishing = null;
  G.placing = null;
  G.selectedDifficulty = diff.id;
  G.discoverTimer = 0;
  G.spawnTimer = 0;
  G.ambientTimer = 8;
  centerCamera(true);
  discoverAround();
  applyWeatherVisual();
  $('#menu').classList.add('hidden');
  $('#death').classList.add('hidden');
  $('#overlay').classList.add('hidden');
  $('#hud').classList.remove('hidden');
  updateHUD(true);
  if (G.settings.volume > 0) AudioFX.init();
  setTimeout(() => toast(`<b>Dia 1 · ${G.player.name}</b><br>Você chegou a Aurora com o que restou. Encontre comida, água e um abrigo antes da noite.`, '', 6500), 350);
  setTimeout(() => toast('Dica: use o joystick ou <b>WASD</b>. Aproxime-se de portas e caixas para interagir.', '', 5200), 2200);
  saveGame(true);
}
function centerCamera(instant = false) {
  const p = G.player; if (!p) return;
  const px = (p.x - p.y) * (TILE_W / 2);
  const py = (p.x + p.y) * (TILE_H / 2);
  if (instant) { G.cam.x = px; G.cam.y = py; }
  else { G.cam.x = lerp(G.cam.x, px, .18); G.cam.y = lerp(G.cam.y, py, .18); }
}

/* ---------------------------------------------------------------- menu */
function setupMenuWorld() {
  const seed = 884211;
  const world = createWorld(seed, 'normal', 1);
  G.world = world;
  G.zombies = world.zombies;
  G.vehicles = world.vehicles;
  G.containers = new Map(world.containers.map(c => [c.id, c]));
  G.structures = [];
  G.player = {
    x: 66.3, y: 66.1, facing: .8, radius: .29, health: 100, maxHealth: 100,
    hunger: 86, thirst: 81, sleep: 78, stamina: 100, hygiene: 76, stress: 10,
    pain: 0, bodyTemp: 36.6, wet: 0, bleed: 0, infection: 0, infected: false,
    weapon: null, clothing: {}, inventory: [], skills: {}, xp: {},
    crouch: false, sprint: false, moving: false, attackCd: 0, attackAnim: 0,
    hurtFlash: 0, walkPhase: 0, distance: 0, inVehicle: null,
    name: 'Aurora', profession: 'survivor', professionName: 'Sobrevivente',
    dead: false, flashlightOn: false
  };
  G.discovered = new Uint8Array(world.size * world.size);
  for (let y = 0; y < world.size; y++) for (let x = 0; x < world.size; x++) {
    if (Math.hypot(x - 67, y - 66) < 22) G.discovered[y * world.size + x] = 1;
  }
  G.foundLocations = new Set(['Cruzamento Central']);
  G.timeOfDay = { day: 1, minutes: 18 * 60 + 12 };
  G.weather = { type: 'clear', label: 'Limpo', temp: 18, targetTemp: 18, wind: 3, next: 999, intensity: 0 };
  G.mode = 'menu';
  G.dead = false;
  G.cam.x = (66 - 66) * 28;
  G.cam.y = (66 + 66) * 14;
}
function refreshContinue() {
  const row = $('#continueRow');
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) { row.classList.add('hidden'); return; }
  try {
    const data = JSON.parse(raw);
    row.classList.remove('hidden');
    $('#continueInfo').textContent = `Dia ${data.time?.day || 1} · ${fmtTime(data.time?.minutes || 0)} · ${data.player?.professionName || 'Sobrevivente'}`;
  } catch { row.classList.add('hidden'); }
}
function showMenu() {
  G.mode = 'menu';
  G.dead = false;
  G.started = false;
  G.fishing = null;
  G.placing = null;
  $('#menu').classList.remove('hidden');
  $('#death').classList.add('hidden');
  $('#overlay').classList.add('hidden');
  $('#hud').classList.add('hidden');
  refreshContinue();
  if (!G.world) setupMenuWorld();
}
function renderProfessions() {
  const box = $('#professions');
  box.innerHTML = PROFESSIONS.map(p => `
    <button class="prof-btn ${p.id === G.selectedProfession ? 'selected' : ''}" data-prof="${p.id}" aria-pressed="${p.id === G.selectedProfession}">
      <span class="p-glyph">${p.glyph}</span>
      <span class="p-name">${esc(p.name)}</span>
      <span class="p-sub">${esc(p.short)}</span>
    </button>`).join('');
  const prof = PROFESSIONS.find(p => p.id === G.selectedProfession);
  $('#professionDesc').textContent = prof.desc + ' ' + prof.trait + '.';
  box.querySelectorAll('[data-prof]').forEach(b => b.addEventListener('click', () => {
    G.selectedProfession = b.dataset.prof;
    AudioFX.init(); AudioFX.ui();
    renderProfessions();
  }));
}
function renderDifficulties() {
  const box = $('#difficultyChips');
  box.innerHTML = Object.values(DIFFICULTIES).map(d => `
    <button class="chip ${d.id === G.selectedDifficulty ? 'selected' : ''}" data-diff="${d.id}" title="${esc(d.desc)}">${esc(d.name)}</button>`).join('');
  box.querySelectorAll('[data-diff]').forEach(b => b.addEventListener('click', () => {
    G.selectedDifficulty = b.dataset.diff;
    AudioFX.ui();
    renderDifficulties();
  }));
}

/* ---------------------------------------------------------------- save/load */
function saveGame(manual = false) {
  if (!G.started || G.dead || !G.player || !G.world) return;
  try {
    const world = G.world;
    const save = {
      v: 1, savedAt: Date.now(), seed: world.seed, difficulty: G.selectedDifficulty,
      player: {
        x: G.player.x, y: G.player.y, facing: G.player.facing,
        health: G.player.health, hunger: G.player.hunger, thirst: G.player.thirst,
        sleep: G.player.sleep, stamina: G.player.stamina, hygiene: G.player.hygiene,
        stress: G.player.stress, pain: G.player.pain, bodyTemp: G.player.bodyTemp,
        wet: G.player.wet, bleed: G.player.bleed, infection: G.player.infection,
        infected: G.player.infected, sickness: G.player.sickness,
        weapon: G.player.weapon, clothing: G.player.clothing,
        flashlightOn: G.player.flashlightOn, battery: G.player.battery,
        inventory: G.player.inventory, skills: G.player.skills, xp: G.player.xp,
        crouch: G.player.crouch, distance: G.player.distance,
        name: G.player.name, profession: G.player.profession,
        professionName: G.player.professionName
      },
      time: G.timeOfDay, weather: G.weather,
      containers: [...G.containers.values()].map(c => ({ id: c.id, items: c.items, searched: c.searched })),
      buildings: world.buildings.map(b => ({ id: b.id, doorOpen: b.doorOpen, discovered: b.discovered })),
      vehicles: G.vehicles.map(v => ({ id: v.id, x: v.x, y: v.y, angle: v.angle, fuel: v.fuel, hp: v.hp, trunk: v.trunk })),
      zombies: G.zombies.filter(z => !z.dead).map(z => ({
        id: z.id, x: z.x, y: z.y, hp: z.hp, state: z.state, facing: z.facing,
        variant: z.variant, speed: z.speed, dir: z.dir, dead: false
      })),
      structures: G.structures, pickups: G.pickups,
      discovered: Array.from(G.discovered).join(''),
      foundLocations: [...G.foundLocations],
      objectiveFlags: G.objectiveFlags, stats: G.stats,
      settings: G.settings
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    G.lastSave = Date.now();
    if (manual) toast('Partida salva.', 'good');
    refreshContinue();
  } catch (e) {
    if (manual) toast('Não foi possível salvar neste navegador.', 'bad');
  }
}
function loadGame() {
  let data;
  try { data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { data = null; }
  if (!data || !data.player) { toast('Nenhum salvamento encontrado.', 'bad'); return; }
  const diff = DIFFICULTIES[data.difficulty] || DIFFICULTIES.normal;
  G.selectedDifficulty = diff.id;
  const world = createWorld(data.seed, diff.id, diff.loot);
  G.world = world;
  G.zombies = data.zombies?.length ? data.zombies : world.zombies;
  for (const z of G.zombies) { z.maxHp = z.maxHp || 54; z.anim = z.anim || rnd(10); z.attackCd = 0; z.dead = !!z.dead; }
  G.vehicles = world.vehicles;
  for (const sv of data.vehicles || []) {
    const v = G.vehicles.find(x => x.id === sv.id);
    if (v) Object.assign(v, { x: sv.x, y: sv.y, angle: sv.angle, fuel: sv.fuel, hp: sv.hp, trunk: sv.trunk || v.trunk });
  }
  G.containers = new Map(world.containers.map(c => [c.id, c]));
  for (const sc of data.containers || []) {
    const c = G.containers.get(sc.id);
    if (c) { c.items = sc.items || []; c.searched = !!sc.searched; }
  }
  for (const sb of data.buildings || []) {
    const b = world.buildings.find(x => x.id === sb.id);
    if (b) { b.doorOpen = sb.doorOpen; b.discovered = sb.discovered; world.solid[world.idx(b.doorTile.x, b.doorTile.y)] = b.doorOpen ? 0 : 1; }
  }
  G.structures = data.structures || [];
  for (const s of G.structures) if (['barricade', 'campfire', 'crate', 'raincollector'].includes(s.kind)) {
    world.solid[world.idx(Math.floor(s.x), Math.floor(s.y))] = 1;
  }
  G.pickups = data.pickups || [];
  const p = data.player;
  G.player = {
    ...p, radius: .29, moving: false, sprint: false, attackCd: 0, attackAnim: 0,
    hurtFlash: 0, walkPhase: 0, inVehicle: null,
    skills: { ...p.skills }, xp: { ...p.xp },
    inventory: (p.inventory || []).map(e => ({ ...e, uid: e.uid || G.uid++ })),
    clothing: { backpack: false, jacket: false, boots: false, ...(p.clothing || {}) }
  };
  G.player.weapon = p.weapon || null;
  G.player.name = p.name || 'Aurora';
  G.player.professionName = p.professionName || 'Sobrevivente';
  G.timeOfDay = data.time || { day: 1, minutes: 8 * 60 };
  G.weather = data.weather || { type: 'clear', label: 'Limpo', temp: 18, targetTemp: 18, wind: 2, next: 30, intensity: 0 };
  G.discovered = new Uint8Array(world.size * world.size);
  if (data.discovered) {
    for (let i = 0; i < Math.min(data.discovered.length, G.discovered.length); i++) {
      if (data.discovered[i] === '1') G.discovered[i] = 1;
    }
  }
  G.foundLocations = new Set(data.foundLocations || ['Cruzamento Central']);
  G.objectiveFlags = data.objectiveFlags || {};
  G.stats = data.stats || { zombiesKilled: 0, looted: 0, built: 0, harvested: 0, fish: 0, distance: 0, days: 1 };
  G.settings = { ...G.settings, ...(data.settings || {}) };
  G.mode = 'playing'; G.started = true; G.dead = false; G.fishing = null; G.placing = null;
  G.decals = []; G.corpses = []; G.particles = []; G.floats = []; G.rain = []; G.noises = [];
  centerCamera(true);
  discoverAround();
  applyWeatherVisual();
  $('#menu').classList.add('hidden');
  $('#death').classList.add('hidden');
  $('#overlay').classList.add('hidden');
  $('#hud').classList.remove('hidden');
  updateHUD(true);
  toast('<b>Partida carregada.</b> O mundo continuou sem você.', 'good', 4500);
}
function hasSave() { return !!localStorage.getItem(SAVE_KEY); }

/* ---------------------------------------------------------------- discovery */
function discoverAround() {
  const p = G.player; if (!p || !G.world) return;
  const size = G.world.size, R = 7;
  const cx = Math.floor(p.x), cy = Math.floor(p.y);
  for (let y = cy - R; y <= cy + R; y++) {
    for (let x = cx - R; x <= cx + R; x++) {
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      if (Math.hypot(x - cx, y - cy) <= R) G.discovered[y * size + x] = 1;
    }
  }
  for (const loc of G.world.locations) {
    if (loc.discovered) continue;
    if (dist(p.x, p.y, loc.x, loc.y) < 13) {
      loc.discovered = true;
      if (!G.foundLocations.has(loc.name)) {
        G.foundLocations.add(loc.name);
        toast(`<b>Local descoberto:</b> ${esc(loc.name)}`, 'good');
        addSkillXP('survival', 4);
      }
    }
  }
  let count = 0;
  for (let i = 0; i < G.discovered.length; i += 11) count += G.discovered[i];
  G.stats.explored = Math.min(100, Math.round(count / (G.discovered.length / 11) * 100));
}
function locationName() {
  const p = G.player; if (!p || !G.world) return 'Aurora';
  let best = null, bd = 16;
  for (const loc of G.world.locations) {
    if (!loc.discovered && !G.foundLocations.has(loc.name)) continue;
    const d = dist(p.x, p.y, loc.x, loc.y);
    if (d < bd) { bd = d; best = loc; }
  }
  if (best) return best.name;
  const b = buildingAt(p.x, p.y);
  if (b) return b.name;
  if (p.y < 65 && p.x < 65) return 'Vila das Acácias';
  if (p.y < 65) return 'Distrito Comercial';
  if (p.x > 74 && p.y > 74) return 'Zona Industrial';
  if (p.x < 34) return 'Estrada da Fazenda';
  if (p.x > 108) return 'Margem do Lago';
  return 'Aurora';
}
function buildingAt(x, y) {
  if (!G.world) return null;
  return G.world.buildings.find(b => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) || null;
}
function playerInsideBuilding() {
  const p = G.player; if (!p) return null;
  return buildingAt(p.x, p.y);
}

/* ---------------------------------------------------------------- skills & objectives */
function addSkillXP(skill, amount) {
  const p = G.player; if (!p || !skill || !SKILLS[skill]) return;
  const prof = PROFESSIONS.find(x => x.id === p.profession);
  const bonus = prof?.id === 'survivor' ? 1.12 : 1;
  p.xp[skill] = (p.xp[skill] || SKILL_LEVEL_XP[p.skills[skill] || 0] || 0) + amount * bonus;
  while (p.skills[skill] < 9 && p.xp[skill] >= SKILL_LEVEL_XP[p.skills[skill] + 1]) {
    p.skills[skill]++;
    toast(`<b>${SKILLS[skill].name}</b> subiu para o nível ${p.skills[skill]}.`, 'good');
    addSkillXP('survival', 2);
  }
}
const OBJECTIVES = [
  { id: 'loot', title: 'Vasculhe três recipientes', hint: 'Casas, lojas e armários guardam o que você precisa.', check: () => G.stats.looted >= 3 },
  { id: 'eat', title: 'Encontre e coma algo', hint: 'A fome enfraquece você. Comida enlatada é um bom começo.', check: () => G.stats.ate > 0 },
  { id: 'drink', title: 'Beba água limpa', hint: 'Pias, garrafas e o coletor de chuva podem salvar sua vida.', check: () => G.stats.drank > 0 },
  { id: 'weapon', title: 'Equipe uma arma', hint: 'Até um canivete é melhor que os punhos.', check: () => !!G.objectiveFlags.equip || !!G.player?.weapon },
  { id: 'wound', title: 'Estanque um ferimento', hint: 'Use bandagens antes que a hemorragia o derrube.', check: () => G.stats.bandaged > 0 },
  { id: 'home', title: 'Construa uma barricada', hint: 'Abra o menu de construção e proteja uma passagem.', check: () => G.stats.built > 0 },
  { id: 'farm', title: 'Plante uma horta', hint: 'Sementes e madeira podem virar comida no futuro.', check: () => G.stats.planted > 0 },
  { id: 'night', title: 'Sobreviva à primeira noite', hint: 'A escuridão traz mais olhos. Encontre um teto.', check: () => G.timeOfDay.day >= 2 }
];
function completedObjectives() { return OBJECTIVES.filter(o => o.check()).length; }
function checkObjectives() {
  if (!G.started) return;
  for (const o of OBJECTIVES) {
    if (!o.check()) continue;
    if (!G.objectiveFlags['done_' + o.id]) {
      G.objectiveFlags['done_' + o.id] = true;
      toast(`<b>Objetivo concluído:</b> ${o.title}`, 'good');
      addSkillXP('survival', 10);
      saveGame(true);
    }
  }
}

/* ---------------------------------------------------------------- items */
function useEntry(entry) {
  const p = G.player; if (!p || !entry) return;
  const d = itemDef(entry.id);
  if (d.cat === 'food' || d.cat === 'drink') {
    if (d.id === 'dirty_water' && Math.random() < (d.risk || 0) - p.skills.firstaid * .015) {
      p.sickness = Math.max(p.sickness, 45);
      toast('A água estava contaminada. Você sente o estômago revirar.', 'bad');
    }
    p.hunger = clamp(p.hunger + (d.hunger || 0) * (p.profession === 'cook' ? 1.25 : 1), 0, 100);
    p.thirst = clamp(p.thirst + (d.thirst || 0), 0, 100);
    p.health = clamp(p.health + (d.health || 0), 0, p.maxHealth);
    removeItem(entry.id, 1);
    if (d.container) addItem(d.container, 1, null, true);
    if (d.cat === 'food') { G.stats.ate++; if (d.raw) { p.sickness = Math.max(p.sickness, 18); toast('Comida crua. Não foi uma boa ideia.', 'bad'); } }
    if (d.cat === 'drink') G.stats.drank++;
    d.cat === 'drink' ? AudioFX.drink() : AudioFX.eat();
    floatText(d.cat === 'drink' ? '+Sede' : '+Fome', p.x, p.y);
    toast(`${d.name} consumido.`);
    closePanel();
    updateHUD(true);
    return;
  }
  if (d.cat === 'medical') {
    if (d.stopBleed && p.bleed > 0) { p.bleed = 0; G.stats.bandaged++; G.objectiveFlags.bandaged = true; toast('Hemorragia estancada.', 'good'); }
    else if (d.stopBleed) { toast('Você não está sangrando.'); }
    p.health = clamp(p.health + (d.heal || 0), 0, p.maxHealth);
    if (d.pain) p.pain = clamp(p.pain + d.pain, 0, 100);
    if (d.id === 'medkit' || d.id === 'vitamins') p.infection = Math.max(0, p.infection - 12);
    if (p.sickness > 0 && d.id !== 'bandage') p.sickness = Math.max(0, p.sickness - 20);
    if (d.id === 'bandage' && p.bleed === 0 && p.health >= p.maxHealth) { toast('Nada a tratar agora.'); return; }
    removeItem(entry.id, 1);
    addSkillXP('firstaid', 8);
    AudioFX.pickup();
    toast(`${d.name} usado.`);
    if (G.dead) return;
    closePanel(); updateHUD(true);
    return;
  }
  if (d.cat === 'clothing' || (d.weapon && d.cat !== 'book')) {
    if (d.weapon) { equipWeapon(p, entry); closePanel(); updateHUD(true); return; }
    equipClothing(entry);
    closePanel(); updateHUD(true);
    return;
  }
  if (d.read) {
    if (entry.id === 'map_item') {
      for (const loc of G.world.locations) loc.discovered = true;
      for (let i = 0; i < G.discovered.length; i++) G.discovered[i] = 1;
      toast('<b>Mapa de Aurora:</b> todos os pontos de interesse revelados.', 'good');
      addSkillXP('survival', 12);
    } else {
      addSkillXP('carpentry', 22);
      addSkillXP('survival', 6);
      toast('Você estudou a revista. Conhecimento de carpintaria aumentou.', 'good');
    }
    removeItem(entry.id, 1);
    closePanel(); updateHUD(true);
    return;
  }
  if (d.light) { toggleFlashlight(); closePanel(); return; }
  if (d.fuel) { refuelNearestVehicle(); closePanel(); return; }
  toast(`${d.name}: ${d.desc}`, '', 3600);
}
function equipClothing(entry) {
  const p = G.player, d = itemDef(entry.id);
  if (entry.id === 'backpack_small') {
    if (p.clothing.backpack) { toast('Você já está usando uma mochila.'); return; }
    p.clothing.backpack = true;
  } else if (entry.id === 'jacket') {
    if (p.clothing.jacket) { toast('Você já está usando uma jaqueta.'); return; }
    p.clothing.jacket = true;
  } else if (entry.id === 'boots') {
    if (p.clothing.boots) { toast('Você já está usando botas.'); return; }
    p.clothing.boots = true;
  } else {
    toast('Você não sabe como vestir isso.', 'bad'); return;
  }
  p.inventory = p.inventory.filter(e => e.uid !== entry.uid);
  AudioFX.pickup();
  toast(`${d.name} equipado.`);
}
function toggleFlashlight() {
  const p = G.player;
  if (!IN_BAG('flashlight')) { toast('Você não tem uma lanterna.', 'bad'); return; }
  if (p.battery <= 0) { toast('A bateria da lanterna acabou.', 'bad'); return; }
  p.flashlightOn = !p.flashlightOn;
  AudioFX.ui();
  toast(p.flashlightOn ? 'Lanterna ligada.' : 'Lanterna desligada.');
}
function refuelNearestVehicle() {
  const p = G.player;
  let best = null, bd = 2.4;
  for (const v of G.vehicles) { const d = dist(p.x, p.y, v.x, v.y); if (d < bd) { bd = d; best = v; } }
  if (!best) { toast('Aproxime-se de um veículo para abastecer.', 'bad'); return; }
  if (best.fuel >= best.maxFuel - .5) { toast('O tanque já está cheio.'); return; }
  if (countOf('fuel') <= 0) { toast('Você não tem combustível.', 'bad'); return; }
  removeItem('fuel', 1);
  best.fuel = Math.min(best.maxFuel, best.fuel + 28);
  addSkillXP('mechanics', 8);
  AudioFX.drink();
  toast(`Tanque abastecido (${Math.round(best.fuel)}/${best.maxFuel} L).`, 'good');
}
function takeEntry(c, entry) {
  const max = itemDef(entry.id).stack || 20;
  let take = entry.qty;
  let added = 0;
  while (take > 0) {
    const n = Math.min(take, max);
    const got = addItem(entry.id, n, entry.durability, true);
    if (!got) break;
    added += got; take -= got;
  }
  if (added <= 0) { toast('Sem espaço na mochila.', 'bad'); return; }
  entry.qty -= added;
  if (entry.qty <= 0) c.items = c.items.filter(e => e !== entry);
  AudioFX.pickup();
  toast(`${itemDef(entry.id).name} ×${added}`);
  renderPanel(); updateHUD(true);
}
function takeAll(c) {
  if (!c.items.length) return;
  let any = false;
  for (const e of [...c.items]) {
    const before = e.qty;
    takeEntryNoToast(c, e);
    if (e.qty < before) any = true;
  }
  if (any) { AudioFX.pickup(); toast('Você guardou o que coube na mochila.'); }
  else toast('Sem espaço na mochila.', 'bad');
  renderPanel(); updateHUD(true);
}
function takeEntryNoToast(c, entry) {
  const max = itemDef(entry.id).stack || 20;
  let take = entry.qty, added = 0;
  while (take > 0) {
    const n = Math.min(take, max);
    const got = addItem(entry.id, n, entry.durability, true);
    if (!got) break;
    added += got; take -= got;
  }
  entry.qty -= added;
  if (entry.qty <= 0) c.items = c.items.filter(e => e !== entry);
}

/* ---------------------------------------------------------------- panels */
function openPanel(name, opts = {}) {
  if (!G.started || G.dead) return;
  if (name === 'container') {
    G.ui.container = opts.container || null;
    if (G.ui.container && !G.ui.container.searched) {
      G.ui.container.searched = true;
      G.stats.looted++;
      addSkillXP('survival', 5);
    }
  }
  if (name === 'farm') G.ui.farmPlot = opts.plot || null;
  if (name === 'craft' && opts.tab) G.ui.tab = opts.tab;
  G.ui.panel = name;
  G.placing = null;
  $('#overlay').classList.remove('hidden');
  renderPanel();
  AudioFX.ui();
}
function closePanel() {
  G.ui.panel = null;
  G.ui.container = null;
  G.ui.farmPlot = null;
  $('#overlay').classList.add('hidden');
  updateHUD(true);
}
function setPanelTitle(kicker, title) {
  $('#panelKicker').textContent = kicker;
  $('#panelTitle').textContent = title;
}
function setTabs(tabs, active, onClick) {
  const el = $('#panelTabs');
  if (!tabs) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = 'flex';
  el.innerHTML = tabs.map(t => `<button class="tab ${t.id === active ? 'active' : ''}" data-tab="${t.id}">${esc(t.label)}</button>`).join('');
  el.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { AudioFX.ui(); onClick(b.dataset.tab); }));
}
function renderPanel() {
  const name = G.ui.panel;
  if (!name) return;
  $('#panelFoot').innerHTML = '';
  $('#panelTabs').style.display = 'none';
  if (name === 'inventory') renderInventory();
  else if (name === 'container') renderContainer(G.ui.container);
  else if (name === 'craft') renderCraft();
  else if (name === 'skills') renderSkills();
  else if (name === 'map') renderMap();
  else if (name === 'journal') renderJournal();
  else if (name === 'pause') renderPause();
  else if (name === 'farm') renderFarm();
  else if (name === 'controls') renderControls();
}
function renderInventory() {
  setPanelTitle('MOCHILA', 'Inventário');
  setTabs(null);
  const p = G.player;
  const cap = weightCap(), weight = carriedWeight();
  const selected = p.inventory.find(e => e.uid === G.ui.selected) || null;
  const items = p.inventory;
  const eq = p.weapon;
  const eqDef = eq ? itemDef(eq.id) : null;
  $('#panelBody').innerHTML = `
    <div class="inv-layout">
      <div class="inv-left">
        <div class="section-label"><span>CARREGANDO</span><b>${items.length} tipo${items.length === 1 ? '' : 's'}</b></div>
        <div class="inv-grid">
          ${items.length ? items.map(e => itemCardHTML(e, selected?.uid === e.uid)).join('') : '<div class="empty-note" style="grid-column:1/-1">Sua mochila está vazia. Vasculhe casas, lojas e armários.</div>'}
        </div>
        <div class="weight-row">
          <div class="weight-label"><span>PESO</span><span>${weight.toFixed(1)} / ${cap.toFixed(1)} kg</span></div>
          <div class="mini-bar"><i style="width:${clamp(weight / cap * 100, 0, 100)}%"></i></div>
        </div>
        ${selected ? `<div class="detail-card" style="margin-top:12px">
          <h3>${esc(itemDef(selected.id).name)}</h3>
          <p>${esc(itemDef(selected.id).desc)}</p>
          <div class="detail-stats"><span class="stat-pill">PESO ${itemDef(selected.id).weight.toFixed(2)} kg</span><span class="stat-pill">${itemDef(selected.id).cat.toUpperCase()}</span>${selected.durability != null ? `<span class="stat-pill">DURABILIDADE ${Math.round(selected.durability)}%</span>` : ''}</div>
          <div class="actions-row">
            ${itemDef(selected.id).cat === 'food' || itemDef(selected.id).cat === 'drink' || itemDef(selected.id).cat === 'medical' ? '<button class="action-btn primary" data-act="use">USAR</button>' : ''}
            ${itemDef(selected.id).weapon ? '<button class="action-btn primary" data-act="equip">EQUIPAR</button>' : ''}
            ${itemDef(selected.id).cat === 'clothing' ? '<button class="action-btn primary" data-act="wear">VESTIR</button>' : ''}
            ${itemDef(selected.id).read ? '<button class="action-btn primary" data-act="read">LER</button>' : ''}
            ${itemDef(selected.id).light ? '<button class="action-btn" data-act="light">LANTERNA</button>' : ''}
            ${itemDef(selected.id).fuel ? '<button class="action-btn" data-act="refuel">ABASTECER</button>' : ''}
            <button class="action-btn danger" data-act="drop">SOLTAR</button>
          </div>
        </div>` : ''}
      </div>
      <div class="inv-side">
        <div class="equip-box">
          <h3>EQUIPAMENTO</h3>
          <div class="equip-line"><span>${eqDef ? esc(eqDef.name) : 'Mãos nuas'}</span><span>${eq ? Math.round(eq.durability) + '%' : '—'}</span></div>
          <div class="equip-line"><span>Mochila</span><span>${p.clothing.backpack ? 'Equipada' : 'Nenhuma'}</span></div>
          <div class="equip-line"><span>Jaqueta</span><span>${p.clothing.jacket ? 'Vestida' : 'Nenhuma'}</span></div>
          <div class="equip-line"><span>Botas</span><span>${p.clothing.boots ? 'Calçadas' : 'Nenhuma'}</span></div>
          <div class="equip-line"><span>Lanterna</span><span>${IN_BAG('flashlight') ? (p.flashlightOn ? 'Ligada' : 'Desligada') : 'Nenhuma'}</span></div>
        </div>
        <div class="equip-box">
          <h3>CORPO</h3>
          <div class="equip-line"><span>Sangramento</span><span>${p.bleed > 0 ? 'ATIVO' : 'Nenhum'}</span></div>
          <div class="equip-line"><span>Infecção</span><span>${Math.round(p.infection)}%</span></div>
          <div class="equip-line"><span>Dor</span><span>${Math.round(p.pain)}%</span></div>
          <div class="equip-line"><span>Temperatura</span><span>${p.bodyTemp.toFixed(1)} °C</span></div>
          <div class="equip-line"><span>Higiene</span><span>${Math.round(p.hygiene)}%</span></div>
        </div>
      </div>
    </div>`;
  $('#panelFoot').innerHTML = `<span>Dica: soltar itens cria um pacote no chão que pode ser recuperado.</span>`;
  $('#panelBody').querySelectorAll('.item-card').forEach(b => b.addEventListener('click', () => {
    G.ui.selected = Number(b.dataset.uid); AudioFX.ui(); renderInventory();
  }));
  const act = async (a) => {
    if (!selected) return;
    if (a === 'use') useEntry(selected);
    else if (a === 'equip') equipWeapon(p, selected);
    else if (a === 'wear') equipClothing(selected);
    else if (a === 'read') useEntry(selected);
    else if (a === 'light') toggleFlashlight();
    else if (a === 'refuel') refuelNearestVehicle();
    else if (a === 'drop') dropItemEntry(selected);
    updateHUD(true);
    if (G.ui.panel) renderInventory();
  };
  $('#panelBody').querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => act(b.dataset.act)));
}
function renderContainer(c) {
  if (!c) { closePanel(); return; }
  setPanelTitle('VASCULAR', c.label || c.name || 'Recipiente');
  setTabs(null);
  const d = c.items.reduce((n, e) => n + (itemDef(e.id).weight || 0) * e.qty, 0);
  $('#panelBody').innerHTML = `
    <div class="loot-head"><h3>${esc(c.label || c.name)}</h3><span>${c.items.length} item(ns) · ${d.toFixed(1)} kg</span></div>
    ${c.items.length ? `<div class="loot-list">${c.items.map((e, i) => {
      const it = itemDef(e.id);
      return `<div class="loot-row"><span class="item-ico" style="color:${it.color}">${iconFor(it.icon)}</span><span class="loot-name">${esc(it.name)}<small>${esc(it.desc).slice(0, 80)}</small></span><span class="loot-qty">×${e.qty}</span><button class="action-btn" data-take="${i}">PEGAR</button></div>`;
    }).join('')}</div><div class="take-all"><span>Peso: ${carriedWeight().toFixed(1)} / ${weightCap().toFixed(1)} kg</span><button class="action-btn primary" id="takeAll">PEGAR TUDO</button></div>`
      : `<div class="loot-empty">Este recipiente está vazio. Alguém passou antes de você.</div>`}`;
  $('#panelFoot').innerHTML = `<span>Recipientes saqueados não se reabastecem.</span><div class="spacer"></div><span>${c.searched ? 'SAQUEADO' : 'INTACTO'}</span>`;
  $('#panelBody').querySelectorAll('[data-take]').forEach(b => b.addEventListener('click', () => {
    const e = c.items[Number(b.dataset.take)]; if (e) takeEntry(c, e);
  }));
  $('#takeAll')?.addEventListener('click', () => takeAll(c));
}

/* ---------------------------------------------------------------- crafting */
function hasTool(id) {
  const p = G.player;
  return !!(p && (p.inventory.some(e => e.id === id) || p.weapon?.id === id));
}
function campfireNear(range = 3.6) {
  const p = G.player; if (!p) return null;
  return G.structures.find(s => s.kind === 'campfire' && s.fuel > 0 && dist(p.x, p.y, s.x + .5, s.y + .5) < range) || null;
}
function canCraft(r) {
  const p = G.player;
  const missing = [];
  for (const [id, n] of Object.entries(r.requires || {})) if (countOf(id) < n) missing.push({ id, n, have: countOf(id) });
  const toolOk = !r.tools || r.tools.every(t => hasTool(t));
  const skillOk = !r.skill || (p.skills[r.skill] || 0) >= (r.level || 0);
  const stationOk = !r.station || (r.station === 'fire' && !!campfireNear());
  return { ok: !missing.length && toolOk && skillOk && stationOk, missing, toolOk, skillOk, stationOk };
}
function craft(id) {
  const r = RECIPES.find(x => x.id === id); if (!r) return;
  const check = canCraft(r);
  if (!check.ok) { toast('Você não tem o necessário.', 'bad'); return; }
  for (const [item, n] of Object.entries(r.requires)) removeItem(item, n);
  if (r.id === 'repair_weapon') {
    const p = G.player;
    if (!p.weapon) { toast('Nenhuma arma equipada.', 'bad'); return; }
    const d = itemDef(p.weapon.id);
    p.weapon.durability = Math.min(d.durability, p.weapon.durability + d.durability * .4);
  } else {
    for (const [item, n] of Object.entries(r.result || {})) addItem(item, n, undefined, true);
  }
  addSkillXP(r.skill || 'survival', r.xp || 6);
  AudioFX.pickup();
  toast(`<b>${r.name}</b> fabricado${r.result ? ' (' + Object.entries(r.result).map(([i, n]) => itemDef(i).name + ' ×' + n).join(', ') + ')' : ''}.`, 'good');
  G.stats.crafted = (G.stats.crafted || 0) + 1;
  renderPanel(); updateHUD(true);
}
function renderCraft() {
  setPanelTitle('BANCADA', 'Fabricação');
  setTabs([{ id: 'craft', label: 'FABRICAR' }, { id: 'build', label: 'CONSTRUIR' }], G.ui.tab, (t) => { G.ui.tab = t; renderCraft(); });
  const tab = G.ui.tab;
  const fire = campfireNear();
  if (tab === 'craft') {
    $('#panelBody').innerHTML = `
      <div class="section-label"><span>RECEITAS CONHECIDAS</span><b>${fire ? 'FOGUEIRA ACESA POR PERTO' : 'SEM ESTAÇÃO DE FOGO'}</b></div>
      <div class="craft-layout">${RECIPES.map(r => {
        const c = canCraft(r);
        const reqs = Object.entries(r.requires).map(([id, n]) => {
          const have = countOf(id);
          return `<span class="req ${have >= n ? '' : 'missing'}">${esc(itemDef(id).name)} ${have}/${n}</span>`;
        }).join('');
        const toolReq = (r.tools || []).map(t => `<span class="req ${hasTool(t) ? '' : 'missing'}">Ferramenta: ${esc(itemDef(t).name)}</span>`).join('');
        const station = r.station ? `<span class="req ${fire ? 'station-ok' : 'missing'}">${fire ? 'Fogueira pronta' : 'Precisa de fogueira'}</span>` : '';
        return `<div class="recipe ${c.ok ? '' : 'unavailable'}">
          <div class="recipe-head"><h3>${esc(r.name)}</h3><span>${esc(r.cat)}</span></div>
          <p>${esc(r.desc)}</p>
          <div class="req-row">${reqs}${toolReq}${station}</div>
          <div class="recipe-foot"><small>${esc(SKILLS[r.skill]?.name || 'Sobrevivência')} Nv. ${r.level || 0} · +${r.xp || 0} XP</small><button class="craft-btn" data-craft="${r.id}" ${c.ok ? '' : 'disabled'}>FABRICAR</button></div>
        </div>`;
      }).join('')}</div>`;
    $('#panelBody').querySelectorAll('[data-craft]').forEach(b => b.addEventListener('click', () => craft(b.dataset.craft)));
    $('#panelFoot').innerHTML = `<span>Ferramentas são preservadas. Materiais são consumidos.</span><div class="spacer"></div>${fire ? `<span>Combustível da fogueira: ${Math.round(fire.fuel)}%</span><button class="action-btn" id="feedFire">ABASTECER (1 TÁBUA)</button>` : '<span>Construa uma fogueira para cozinhar.</span>'}`;
    $('#feedFire')?.addEventListener('click', () => {
      if (countOf('plank') < 1) { toast('Você precisa de uma tábua.', 'bad'); return; }
      const f = campfireNear(); if (!f) return;
      removeItem('plank', 1); f.fuel = Math.min(100, f.fuel + 35); AudioFX.hit(); toast('Fogueira alimentada.', 'good'); renderPanel();
    });
  } else {
    $('#panelBody').innerHTML = `<div class="section-label"><span>ESTRUTURAS</span><b>${G.structures.length} construída(s)</b></div>
      <div class="build-grid">${BUILDABLES.map(b => {
        const reqs = Object.entries(b.requires).map(([id, n]) => {
          const have = countOf(id);
          return `<span class="req ${have >= n ? '' : 'missing'}">${esc(itemDef(id).name)} ${have}/${n}</span>`;
        }).join('');
        const toolReq = (b.tools || []).map(t => `<span class="req ${hasTool(t) ? '' : 'missing'}">Ferramenta: ${esc(itemDef(t).name)}</span>`).join('');
        return `<div class="build-card"><div class="recipe-head"><h3>${esc(b.name)}</h3><span>${esc(b.cat)}</span></div>
          <p>${esc(b.desc)}</p><div class="req-row">${reqs}${toolReq}</div>
          <div class="recipe-foot"><small>${esc(SKILLS[b.skill]?.name || 'Sobrevivência')} Nv. ${b.level || 0}</small><button class="craft-btn" data-build="${b.id}" ${G.player.skills[b.skill] >= (b.level || 0) ? '' : 'disabled'}>CONSTRUIR</button></div>
        </div>`;
      }).join('')}</div>`;
    $('#panelBody').querySelectorAll('[data-build]').forEach(b => b.addEventListener('click', () => beginBuild(b.dataset.build)));
    $('#panelFoot').innerHTML = `<span>Posicione a estrutura no bloco à sua frente. Pressione confirmar.</span>`;
  }
}

/* ---------------------------------------------------------------- other panels */
function renderSkills() {
  setPanelTitle('FICHA', 'Habilidades');
  setTabs(null);
  const p = G.player;
  const rows = Object.entries(SKILLS).map(([id, s]) => {
    const lvl = p.skills[id] || 0;
    const cur = p.xp[id] || 0;
    const base = SKILL_LEVEL_XP[lvl] || 0;
    const next = SKILL_LEVEL_XP[Math.min(lvl + 1, SKILL_LEVEL_XP.length - 1)] || base + 1;
    const pct = lvl >= 9 ? 100 : clamp((cur - base) / Math.max(1, next - base) * 100, 0, 100);
    return `<div class="skill-row">
      <span class="skill-glyph">${s.glyph}</span>
      <div class="skill-mid"><div class="skill-name-row"><span>${esc(s.name)}</span><span>Nv. ${lvl}</span></div>
      <div class="skill-xp"><i style="width:${pct}%"></i></div><div class="skill-desc">${esc(s.desc)}</div></div>
    </div>`;
  }).join('');
  const total = Object.entries(p.skills).reduce((n, [id, v]) => n + v, 0);
  $('#panelBody').innerHTML = `
    <div class="stats-strip">
      <span>NÍVEL TOTAL <b>${total}</b></span>
      <span>ZUMBIS <b>${G.stats.zombiesKilled || 0}</b></span>
      <span>RECIPIENTES <b>${G.stats.looted || 0}</b></span>
      <span>DISTÂNCIA <b>${Math.round(G.stats.distance || 0)} m</b></span>
      <span>DIAS <b>${G.timeOfDay.day}</b></span>
    </div>
    <div class="skills-grid">${rows}</div>`;
  $('#panelFoot').innerHTML = `<span>Habilidades sobem com uso. Profissões começam com vantagens, mas não são limites.</span>`;
}
function renderMap() {
  setPanelTitle('AURORA', 'Mapa');
  setTabs(null);
  const explored = G.stats.explored || 0;
  $('#panelBody').innerHTML = `
    <div class="map-wrap">
      <canvas id="mapCanvas"></canvas>
      <div class="map-meta">EXPLORADO ${explored}%</div>
      <div class="map-legend">
        <span><i class="legend-dot" style="background:#8a5b3b"></i>Construções</span>
        <span><i class="legend-dot" style="background:#78756a"></i>Ruas</span>
        <span><i class="legend-dot" style="background:#36545f"></i>Água</span>
        <span><i class="legend-dot" style="background:#d5a04a"></i>Você</span>
        <span><i class="legend-dot" style="background:#8fa86e"></i>Local descoberto</span>
      </div>
      <p class="map-note">A névoa só se dissipa com a exploração. Leia mapas encontrados para revelar pontos de interesse.</p>
    </div>`;
  requestAnimationFrame(() => drawMap($('#mapCanvas')));
  $('#panelFoot').innerHTML = `<span>Locais descobertos: ${G.foundLocations.size}</span><div class="spacer"></div><span>DIA ${G.timeOfDay.day} · ${fmtTime(G.timeOfDay.minutes)}</span>`;
}
function drawMap(c) {
  if (!c) return;
  const W = c.clientWidth || 600, H = c.clientHeight || 420;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  c.width = W * dpr; c.height = H * dpr;
  const x = c.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.fillStyle = '#0b0e0a'; x.fillRect(0, 0, W, H);
  const world = G.world, n = world.size;
  const s = Math.min(W / n, H / n);
  const ox = (W - n * s) / 2, oy = (H - n * s) / 2;
  const colors = {
    [T.GRASS]: '#293224', [T.GRASS2]: '#303a28', [T.ROAD]: '#55554f', [T.SIDEWALK]: '#6b675d',
    [T.DIRT]: '#4a3d2b', [T.WATER]: '#27444f', [T.WOOD]: '#594633', [T.TILE]: '#625d50',
    [T.CONCRETE]: '#5d5e57', [T.FIELD]: '#4c422a', [T.SAND]: '#766a4f', [T.BRIDGE]: '#6a553c',
    [T.PARK]: '#33442c', [T.GRAVEL]: '#5b574e', [T.CROSSWALK]: '#7a786c'
  };
  for (let y = 0; y < n; y++) {
    for (let xx = 0; xx < n; xx++) {
      if (!G.discovered[y * n + xx]) continue;
      x.fillStyle = colors[world.ground[y * n + xx]] || '#333';
      x.fillRect(ox + xx * s, oy + y * s, Math.ceil(s), Math.ceil(s));
    }
  }
  // Buildings that are known become clearer blocks.
  for (const b of world.buildings) {
    if (!G.discovered[Math.floor((b.y + b.h / 2)) * n + Math.floor((b.x + b.w / 2))]) continue;
    x.fillStyle = b.discovered || G.foundLocations.has(b.name) ? '#b98554' : '#7d5c3f';
    x.fillRect(ox + b.x * s, oy + b.y * s, b.w * s, b.h * s);
    x.strokeStyle = 'rgba(20,16,11,.55)'; x.lineWidth = .7;
    x.strokeRect(ox + b.x * s, oy + b.y * s, b.w * s, b.h * s);
  }
  // POI labels
  x.font = '8px "DejaVu Sans Mono", monospace';
  for (const loc of world.locations) {
    if (!loc.discovered && !G.foundLocations.has(loc.name)) continue;
    const lx = ox + loc.x * s, ly = oy + loc.y * s;
    x.fillStyle = '#d5a04a';
    x.beginPath(); x.arc(lx, ly, 2, 0, TAU); x.fill();
    x.fillStyle = 'rgba(232,224,205,.8)';
    const label = loc.name.length > 22 ? loc.name.slice(0, 21) + '…' : loc.name;
    x.fillText(label, lx + 4, ly + 3);
  }
  // Player marker
  const px = ox + G.player.x * s, py = oy + G.player.y * s;
  x.save(); x.translate(px, py); x.rotate(G.player.facing + Math.PI / 2);
  x.fillStyle = '#f0c16c'; x.beginPath(); x.moveTo(0, -5); x.lineTo(4, 4); x.lineTo(0, 2.4); x.lineTo(-4, 4); x.closePath(); x.fill();
  x.restore();
  x.strokeStyle = 'rgba(213,160,74,.3)'; x.lineWidth = 1; x.strokeRect(ox, oy, n * s, n * s);
}
function renderJournal() {
  setPanelTitle('DIÁRIO', 'Caderno de sobrevivência');
  setTabs(null);
  const done = completedObjectives();
  $('#panelBody').innerHTML = `
    <div class="journal-grid">
      <div><div class="section-label"><span>OBJETIVOS</span><b>${done} / ${OBJECTIVES.length}</b></div>
        <div class="objective-list">${OBJECTIVES.map(o => {
          const d = !!G.objectiveFlags['done_' + o.id] || o.check();
          return `<div class="objective-item ${d ? 'done' : ''}"><span class="obj-check">✓</span><div><b>${esc(o.title)}</b><small>${esc(o.hint)}</small></div></div>`;
        }).join('')}</div>
        <div class="tips"><b>SOBREVIVER:</b> a noite reduz a visão e aumenta a agressividade. Feche portas, apague a lanterna e durma em locais seguros. Água suspeita deve ser fervida.</div>
      </div>
      <div><div class="section-label"><span>REGISTRO</span><b>${G.player.name}</b></div>
        <div class="journal-stats">
          <div class="journal-stat"><span>Dias sobrevividos</span><b>${G.timeOfDay.day}</b></div>
          <div class="journal-stat"><span>Zumbis abatidos</span><b>${G.stats.zombiesKilled || 0}</b></div>
          <div class="journal-stat"><span>Recipientes saqueados</span><b>${G.stats.looted || 0}</b></div>
          <div class="journal-stat"><span>Estruturas construídas</span><b>${G.stats.built || 0}</b></div>
          <div class="journal-stat"><span>Refeições</span><b>${G.stats.ate || 0}</b></div>
          <div class="journal-stat"><span>Peixes pescados</span><b>${G.stats.fish || 0}</b></div>
          <div class="journal-stat"><span>Distância percorrida</span><b>${Math.round(G.stats.distance || 0)} m</b></div>
          <div class="journal-stat"><span>Exploração</span><b>${G.stats.explored || 0}%</b></div>
        </div>
        <div class="tips"><b>PROFISSÃO:</b> ${esc(G.player.professionName)}. ${esc(PROFESSIONS.find(p => p.id === G.player.profession)?.trait || '')}</div>
      </div>
    </div>`;
  $('#panelFoot').innerHTML = `<span>O mundo continua mesmo quando você não está olhando.</span>`;
}
function renderFarm() {
  const plot = G.ui.farmPlot;
  setPanelTitle('CULTIVO', 'Horta');
  setTabs(null);
  if (!plot) { closePanel(); return; }
  const crop = plot.crop ? CROPS[plot.crop] : null;
  let status = 'Solo preparado e vazio.';
  if (crop) {
    const pct = clamp(plot.growth / (crop.growHours * 60) * 100, 0, 100);
    status = `${crop.name} · ${plot.mature ? 'PRONTA PARA COLHER' : Math.round(pct) + '% de crescimento'} · ${plot.watered ? 'solo úmido' : 'solo seco'}`;
    if (!plot.mature) status += `<div style="margin-top:8px"><div class="fish-track"><i style="width:${pct}%"></i></div></div>`;
  }
  $('#panelBody').innerHTML = `
    <div class="loot-head"><h3>${crop ? esc(crop.name) : 'Canteiro de terra'}</h3><span>${plot.watered ? 'IRRIGADO' : 'SECO'}</span></div>
    <p style="font-size:10px;color:#999281;line-height:1.6">${status}</p>
    <div class="actions-row" style="margin-top:14px">
      ${!crop ? `<button class="action-btn primary" data-plant="carrot" ${countOf('seeds_carrot') ? '' : 'disabled'}>PLANTAR CENOURA (${countOf('seeds_carrot')})</button>
                 <button class="action-btn primary" data-plant="potato" ${countOf('seeds_potato') ? '' : 'disabled'}>PLANTAR BATATA (${countOf('seeds_potato')})</button>` : ''}
      ${crop && !plot.mature && !plot.watered ? `<button class="action-btn primary" id="waterPlot" ${countOf('water_bottle') ? '' : 'disabled'}>REGAR (1 ÁGUA)</button>` : ''}
      ${crop && plot.mature ? '<button class="action-btn primary" id="harvestPlot">COLHER</button>' : ''}
      ${crop && !plot.mature ? `<button class="action-btn" id="fertPlot" ${countOf('fertilizer') ? '' : 'disabled'}>FERTILIZAR (1)</button>` : ''}
    </div>`;
  $('#panelBody').querySelectorAll('[data-plant]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.plant;
    const seed = CROPS[id].seed;
    if (countOf(seed) < 1) return;
    removeItem(seed, 1);
    plot.crop = id; plot.growth = 0; plot.mature = false; plot.watered = plot.watered || G.weather.type === 'rain' || G.weather.type === 'storm';
    G.stats.planted = (G.stats.planted || 0) + 1;
    addSkillXP('farming', 6);
    AudioFX.pickup();
    toast(`${CROPS[id].name} plantada. ${plot.watered ? 'O solo está úmido.' : 'Regue para crescer mais rápido.'}`, 'good');
    renderFarm(); updateHUD(true);
  }));
  $('#waterPlot')?.addEventListener('click', () => {
    if (countOf('water_bottle') < 1) return;
    removeItem('water_bottle', 1); addItem('empty_bottle', 1, null, true);
    plot.watered = true; addSkillXP('farming', 3); AudioFX.drink(); toast('Horta regada.', 'good'); renderFarm();
  });
  $('#fertPlot')?.addEventListener('click', () => {
    removeItem('fertilizer', 1); plot.growth += 60 * 2; addSkillXP('farming', 4); toast('Fertilizante aplicado. A planta cresceu um pouco.', 'good'); renderFarm();
  });
  $('#harvestPlot')?.addEventListener('click', () => {
    if (!plot.crop || !plot.mature) return;
    const def = CROPS[plot.crop];
    const bonus = G.player.profession === 'farmer' ? 1 : 0;
    const yieldN = def.yield + bonus + rndi(0, 2);
    addItem(def.item, yieldN, null, true);
    G.stats.harvested = (G.stats.harvested || 0) + yieldN;
    addSkillXP('farming', 18);
    toast(`Colheita: <b>${def.name} ×${yieldN}</b>`, 'good');
    plot.crop = null; plot.growth = 0; plot.mature = false; plot.watered = false;
    renderFarm(); updateHUD(true);
  });
  $('#panelFoot').innerHTML = `<span>Plantas crescem mesmo enquanto você explora. A chuva irriga o solo.</span>`;
}
function renderPause() {
  setPanelTitle('PAUSA', 'Aurora pode esperar');
  if (!G.ui.pauseTab) G.ui.pauseTab = 'game';
  setTabs([{ id: 'game', label: 'JOGO' }, { id: 'settings', label: 'AJUSTES' }, { id: 'controls', label: 'CONTROLES' }], G.ui.pauseTab, (t) => { G.ui.pauseTab = t; renderPause(); });
  if (G.ui.pauseTab === 'game') {
    const p = G.player;
    $('#panelBody').innerHTML = `
      <div class="pause-grid">
        <div>
          <div class="section-label"><span>PARTIDA</span><b>DIA ${G.timeOfDay.day} · ${fmtTime(G.timeOfDay.minutes)}</b></div>
          <div class="pause-actions">
            <button class="action-btn primary" data-pause="resume">CONTINUAR</button>
            <button class="action-btn" data-pause="save">SALVAR PARTIDA</button>
            <button class="action-btn" data-pause="settings">AJUSTES E CONTROLES</button>
            <button class="action-btn danger" data-pause="menu">SALVAR E VOLTAR AO MENU</button>
          </div>
          <p class="pause-note">Salvamento automático a cada ${20}s. A partida também é salva ao fechar a aba.</p>
        </div>
        <div>
          <div class="section-label"><span>RESUMO</span><b>${esc(p.name)}</b></div>
          <div class="journal-stats">
            <div class="journal-stat"><span>Profissão</span><b>${esc(p.professionName)}</b></div>
            <div class="journal-stat"><span>Saúde</span><b>${Math.round(p.health)}% ${p.bleed > 0 ? '· SANGRANDO' : ''}</b></div>
            <div class="journal-stat"><span>Fome / Sede</span><b>${Math.round(p.hunger)} / ${Math.round(p.thirst)}</b></div>
            <div class="journal-stat"><span>Zumbis na região</span><b>${G.zombies.filter(z => !z.dead).length}</b></div>
            <div class="journal-stat"><span>Estruturas</span><b>${G.structures.length}</b></div>
            <div class="journal-stat"><span>Exploração</span><b>${G.stats.explored || 0}%</b></div>
          </div>
        </div>
      </div>`;
    $('#panelBody').querySelectorAll('[data-pause]').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.pause;
      if (a === 'resume') closePanel();
      else if (a === 'save') saveGame(true);
      else if (a === 'settings') { G.ui.pauseTab = 'settings'; renderPause(); }
      else if (a === 'menu') { saveGame(true); closePanel(); showMenu(); }
    }));
    $('#panelFoot').innerHTML = `<span>Dica: feche a porta e apague a lanterna quando estiver dentro de casa.</span>`;
  } else if (G.ui.pauseTab === 'settings') {
    $('#panelBody').innerHTML = `
      <div class="section-label"><span>EXPERIÊNCIA</span><b>APLICA-SE À PARTIDA ATUAL</b></div>
      <div class="setting-row"><div><label>Volume</label><small>Efeitos de combate, ambiente e chuva</small></div><input type="range" id="setVolume" min="0" max="100" value="${Math.round(G.settings.volume * 100)}"></div>
      <div class="setting-row"><div><label>Qualidade gráfica</label><small>Baixa poupa bateria em celulares intermediários</small></div><select id="setQuality"><option value="low" ${G.settings.quality === 'low' ? 'selected' : ''}>Baixa</option><option value="medium" ${G.settings.quality === 'medium' ? 'selected' : ''}>Média</option><option value="high" ${G.settings.quality === 'high' ? 'selected' : ''}>Alta</option></select></div>
      <div class="setting-row"><div><label>Sangue e violência</label><small>Partículas e manchas de sangue</small></div><select id="setGore"><option value="1" ${G.settings.gore ? 'selected' : ''}>Ativado</option><option value="0" ${!G.settings.gore ? 'selected' : ''}>Reduzido</option></select></div>
      <div class="setting-row"><div><label>Salvamento automático</label><small>A cada 20 segundos e ao sair</small></div><select id="setAuto"><option value="1" ${G.settings.autosave ? 'selected' : ''}>Ligado</option><option value="0" ${!G.settings.autosave ? 'selected' : ''}>Desligado</option></select></div>
      <div class="controls-grid" style="margin-top:14px">
        <div><span>Dificuldade</span><b>${DIFF().name.toUpperCase()}</b></div><div><span>Tempo</span><b>${G.weather.label.toUpperCase()} ${Math.round(G.weather.temp)}°C</b></div>
      </div>`;
    $('#setVolume').addEventListener('input', (e) => { G.settings.volume = e.target.value / 100; AudioFX.setVolume(G.settings.volume); });
    $('#setQuality').addEventListener('change', (e) => { G.settings.quality = e.target.value; resize(); });
    $('#setGore').addEventListener('change', (e) => { G.settings.gore = e.target.value === '1'; });
    $('#setAuto').addEventListener('change', (e) => { G.settings.autosave = e.target.value === '1'; });
    $('#panelFoot').innerHTML = `<button class="action-btn" id="backToPause">VOLTAR</button><div class="spacer"></div><span>As configurações são salvas com a partida.</span>`;
    $('#backToPause').addEventListener('click', () => { G.ui.pauseTab = 'game'; renderPause(); });
  } else {
    $('#panelBody').innerHTML = `<div class="controls-grid">
      <div><span>Mover</span><b>WASD / JOYSTICK</b></div>
      <div><span>Interagir</span><b>E / AÇÃO</b></div>
      <div><span>Atacar</span><b>ESPAÇO / ATAQUE</b></div>
      <div><span>Correr</span><b>SHIFT / CORRER</b></div>
      <div><span>Agachar</span><b>CTRL / AGACHAR</b></div>
      <div><span>Mochila</span><b>I</b></div>
      <div><span>Mapa</span><b>M</b></div>
      <div><span>Diário</span><b>J</b></div>
      <div><span>Pausa</span><b>ESC</b></div>
      <div><span>Dormir</span><b>INTERAGIR NA CAMA</b></div>
      <div><span>Construir</span><b>BANCADA → CONSTRUIR</b></div>
      <div><span>Pescar</span><b>VARA + ÁGUA</b></div>
    </div>
    <p class="pause-note">No celular, use o joystick à esquerda e os botões à direita. Toque nos recipientes e portas para interagir. A lanterna e a corrida aumentam o ruído e atraem zumbis.</p>`;
    $('#panelFoot').innerHTML = `<button class="action-btn" id="backToPause2">VOLTAR</button>`;
    $('#backToPause2').addEventListener('click', () => { G.ui.pauseTab = 'game'; renderPause(); });
  }
}
function renderControls() { renderPause(); }

/* ---------------------------------------------------------------- interaction */
function nearWater(range = 2.2) {
  const p = G.player; if (!p) return null;
  const cx = Math.floor(p.x), cy = Math.floor(p.y);
  for (let y = cy - range; y <= cy + range; y++) {
    for (let x = cx - range; x <= cx + range; x++) {
      if (!G.world.inBounds(x, y)) continue;
      if (G.world.get(x, y) === T.WATER || G.world.get(x, y) === T.BRIDGE) {
        if (dist(p.x, p.y, x + .5, y + .5) <= range) return { x, y };
      }
    }
  }
  return null;
}
function findTarget() {
  const p = G.player; if (!p || G.dead) return null;
  if (p.inVehicle) return { type: 'vehicleExit', label: 'Sair do veículo', x: p.x, y: p.y, dist: 0, obj: p.inVehicle };
  let best = null;
  const add = (type, obj, label, x, y, range, extra = {}) => {
    const d = dist(p.x, p.y, x, y);
    if (d > range) return;
    if (!best || d < best.dist) best = { type, obj, label, x, y, dist: d, ...extra };
  };
  for (const c of G.containers.values()) add('container', c, `Vasculhar ${c.label || c.name}`, c.x + .5, c.y + .5, 1.65);
  for (const pr of G.world.props) {
    if (pr.kind === 'bed') add('bed', pr, 'Dormir', pr.x + .5, pr.y + .5, 1.8);
    else if (pr.kind === 'sink') add('sink', pr, 'Usar a pia', pr.x + .5, pr.y + .5, 1.5);
    else if (pr.kind === 'well') add('well', pr, 'Usar o poço', pr.x + .5, pr.y + .5, 1.8);
  }
  for (const b of G.world.buildings) {
    const d = b.doorTile;
    add('door', b, b.doorOpen ? 'Fechar porta' : 'Abrir porta', d.x + .5, d.y + .5, 1.9);
  }
  for (const s of G.structures) {
    if (s.kind === 'barricade') add('barricade', s, hasTool('hammer') ? 'Desmontar barricada' : 'Barricada improvisada', s.x + .5, s.y + .5, 1.7);
    else if (s.kind === 'campfire') add('campfire', s, s.fuel > 0 ? 'Cozinhar na fogueira' : 'Reacender fogueira', s.x + .5, s.y + .5, 1.8);
    else if (s.kind === 'crate') add('crate', s, 'Abrir caixa de armazenamento', s.x + .5, s.y + .5, 1.7);
    else if (s.kind === 'farmplot') add('farmplot', s, s.crop ? (s.mature ? 'Colher plantação' : 'Cuidar da horta') : 'Plantar na horta', s.x + .5, s.y + .5, 1.8);
    else if (s.kind === 'raincollector') add('raincollector', s, 'Coletar água da chuva', s.x + .5, s.y + .5, 1.8);
  }
  for (const v of G.vehicles) add('vehicle', v, v.fuel > 0 ? 'Entrar no veículo' : 'Veículo sem combustível', v.x, v.y, 2.1);
  for (const pk of G.pickups) add('pickup', pk, `Pegar ${itemDef(pk.id).name}`, pk.x, pk.y, 1.4);
  if (IN_BAG('fishing_rod') && !G.fishing) {
    const w = nearWater();
    if (w) add('water', w, 'Pescar', w.x + .5, w.y + .5, 2.4);
  }
  return best;
}
function doInteract() {
  if (G.dead || G.mode !== 'playing' || G.ui.panel) return;
  if (G.placing) { confirmBuild(); return; }
  const t = G.target || findTarget();
  if (!t) { toast('Nada ao alcance.', '', 1400); return; }
  AudioFX.ui();
  if (t.type === 'door') {
    t.obj.doorOpen = !t.obj.doorOpen;
    G.world.solid[G.world.idx(t.obj.doorTile.x, t.obj.doorTile.y)] = t.obj.doorOpen ? 0 : 1;
    AudioFX.tone(t.obj.doorOpen ? 190 : 150, .12, .06, 'square', -30);
    emitNoise(t.x, t.y, t.obj.doorOpen ? 4 : 2);
  } else if (t.type === 'container') {
    openPanel('container', { container: t.obj });
  } else if (t.type === 'crate') {
    if (!t.obj.container) t.obj.container = { id: 'crate_' + t.obj.x + '_' + t.obj.y, items: [], searched: true, label: 'Caixa de armazenamento' };
    openPanel('container', { container: t.obj.container });
  } else if (t.type === 'bed') {
    doSleep();
  } else if (t.type === 'sink' || t.type === 'well') {
    useWaterSource(t.type);
  } else if (t.type === 'campfire') {
    if (t.obj.fuel <= 0) {
      if (countOf('plank') > 0) {
        removeItem('plank', 1); t.obj.fuel = 55; toast('Fogueira reacesa.', 'good'); AudioFX.hit();
      } else toast('Você precisa de madeira para reacender.', 'bad');
    } else openPanel('craft', { tab: 'craft' });
  } else if (t.type === 'farmplot') {
    openPanel('farm', { plot: t.obj });
  } else if (t.type === 'raincollector') {
    collectRain(t.obj);
  } else if (t.type === 'barricade') {
    if (hasTool('hammer')) {
      if (confirmDismantle()) {
        t.obj.removed = true;
        G.structures = G.structures.filter(s => s !== t.obj);
        if (G.world.inBounds(Math.floor(t.obj.x), Math.floor(t.obj.y))) G.world.solid[G.world.idx(Math.floor(t.obj.x), Math.floor(t.obj.y))] = 0;
        addItem('plank', 2, null, true); toast('Barricada desmontada. Duas tábuas recuperadas.'); addSkillXP('carpentry', 4);
      }
    } else toast('Você precisa de um martelo para desmontar.', 'bad');
  } else if (t.type === 'vehicle') {
    enterVehicle(t.obj);
  } else if (t.type === 'vehicleExit') {
    exitVehicle();
  } else if (t.type === 'pickup') {
    if (addItem(t.obj.id, t.obj.qty, t.obj.durability, true)) {
      G.pickups = G.pickups.filter(x => x !== t.obj);
      AudioFX.pickup(); toast(`${itemDef(t.obj.id).name} recolhido.`);
    } else toast('Sem espaço na mochila.', 'bad');
  } else if (t.type === 'water') {
    startFishing(t.obj);
  }
  updateHUD(true);
}
let pendingDismantle = null;
function confirmDismantle() {
  if (pendingDismantle && Date.now() - pendingDismantle < 2200) { pendingDismantle = null; return true; }
  pendingDismantle = Date.now();
  toast('Toque novamente para confirmar a desmontagem.', '', 2400);
  return false;
}
function useWaterSource(type) {
  const p = G.player;
  const empties = countOf('empty_bottle');
  if (empties > 0) {
    const n = Math.min(empties, 3);
    removeItem('empty_bottle', n);
    for (let i = 0; i < n; i++) addItem('water_bottle', 1, null, true);
    AudioFX.drink();
    toast(`${n} garrafa(s) reabastecida(s) com água limpa.`, 'good');
    addSkillXP('survival', 2);
  } else {
    p.thirst = clamp(p.thirst + 16, 0, 100);
    p.hygiene = clamp(p.hygiene + 4, 0, 100);
    G.stats.drank++;
    AudioFX.drink();
    floatText('+Sede', p.x, p.y, '#7db2c8');
    toast('Você bebeu água direto da fonte.');
  }
  updateHUD(true);
}
function collectRain(s) {
  const p = G.player;
  if ((s.water || 0) < 8) { toast('O coletor está quase vazio. Espere pela chuva.', 'bad'); return; }
  const empties = countOf('empty_bottle');
  if (empties > 0) {
    const n = Math.min(empties, Math.floor(s.water / 8), 3);
    removeItem('empty_bottle', n);
    for (let i = 0; i < n; i++) addItem('water_bottle', 1, null, true);
    s.water -= n * 8;
    AudioFX.drink();
    toast(`${n} garrafa(s) enchida(s) com água da chuva.`, 'good');
  } else {
    p.thirst = clamp(p.thirst + 15, 0, 100); s.water = Math.max(0, s.water - 8);
    G.stats.drank++; AudioFX.drink(); toast('Você bebeu do coletor.');
  }
  updateHUD(true);
}
function doSleep() {
  const p = G.player;
  const threat = G.zombies.some(z => !z.dead && dist(p.x, p.y, z.x, z.y) < 9);
  if (threat) { toast('Há mortos perto demais. Não é seguro dormir agora.', 'bad'); return; }
  if (p.sleep > 92 && p.health > 95) { toast('Você não está cansado o suficiente.'); return; }
  const hours = 5;
  $('#fade').classList.add('on');
  setTimeout(() => {
    const before = { day: G.timeOfDay.day, min: G.timeOfDay.minutes };
    advanceMinutes(hours * 60);
    p.sleep = clamp(p.sleep + 68, 0, 100);
    p.health = clamp(p.health + 14, 0, p.maxHealth);
    p.stress = clamp(p.stress - 35, 0, 100);
    p.hunger = clamp(p.hunger - 4.5, 0, 100);
    p.thirst = clamp(p.thirst - 5.5, 0, 100);
    if (p.bleed > 0) { p.bleed = Math.max(0, p.bleed - 2); }
    p.infection = clamp(p.infection + 4, 0, 100);
    addSkillXP('survival', 4);
    toast(`Você dormiu ${hours} horas. O mundo não parou.`, 'good', 4500);
    $('#fade').classList.remove('on');
    updateHUD(true);
    checkObjectives();
    saveGame(true);
  }, 620);
}
function startFishing(water) {
  if (G.fishing) return;
  if (!IN_BAG('fishing_rod')) { toast('Você precisa de uma vara de pesca.', 'bad'); return; }
  const p = G.player;
  G.fishing = { t: 0, duration: 4.2, x: p.x, y: p.y, water };
  $('#fishingBar').classList.remove('hidden');
  AudioFX.tone(260, .2, .05, 'sine', 80);
  toast('Você lançou a linha. Fique parado e espere.', '', 2200);
}
function updateFishing(dt) {
  const f = G.fishing; if (!f) return;
  const p = G.player;
  if (dist(p.x, p.y, f.x, f.y) > .55 || p.inVehicle) { cancelFishing(true); return; }
  f.t += dt;
  $('#fishingFill').style.width = clamp(f.t / f.duration * 100, 0, 100) + '%';
  if (f.t >= f.duration) {
    const chance = .5 + (p.skills.fishing || 0) * .045 + (G.weather.type === 'rain' ? .1 : 0) + (G.timeOfDay.minutes > 1200 || G.timeOfDay.minutes < 300 ? -.08 : .04);
    if (Math.random() < chance) {
      const n = 1 + (Math.random() < .18 ? 1 : 0);
      addItem('fish_raw', n, null, true);
      G.stats.fish = (G.stats.fish || 0) + n;
      addSkillXP('fishing', 14);
      AudioFX.pickup();
      toast(`<b>Pescou ${n} peixe(s)!</b> Asse na fogueira para uma refeição decente.`, 'good', 4500);
    } else {
      addSkillXP('fishing', 5);
      toast('Nada fisgou. Tente novamente.', '', 2500);
    }
    cancelFishing(false);
  }
}
function cancelFishing(showToast) {
  G.fishing = null;
  $('#fishingBar').classList.add('hidden');
  $('#fishingFill').style.width = '0%';
  if (showToast) toast('Pesca cancelada.');
}
function enterVehicle(v) {
  if (v.hp <= 0) { toast('O veículo está destruído.', 'bad'); return; }
  const p = G.player;
  if (p.inVehicle) return;
  p.inVehicle = v; v.occupied = true;
  v.speed = 0;
  AudioFX.tone(120, .18, .08, 'square', 40);
  toast(v.fuel > 0 ? 'Motor ligado. Cuidado: o barulho atrai os mortos.' : 'O tanque está vazio. Abasteça com um galão.');
  $('#btnAttack').classList.add('hidden');
  $('#btnCrouch').classList.add('hidden');
  $('#fishingBar').classList.add('hidden');
}
function exitVehicle() {
  const p = G.player, v = p.inVehicle; if (!v) return;
  const spots = [[.9, 0], [-.9, 0], [0, .9], [0, -.9], [1.2, 1.2], [-1.2, -1.2]];
  let place = null;
  for (const [dx, dy] of spots) {
    const nx = v.x + dx, ny = v.y + dy;
    if (!collidesAt(nx, ny, .3)) { place = { x: nx, y: ny }; break; }
  }
  if (!place) { toast('Não há espaço para sair aqui.', 'bad'); return; }
  p.x = place.x; p.y = place.y;
  p.inVehicle = null; v.occupied = false; v.speed = 0;
  AudioFX.tone(90, .12, .06, 'square', -20);
  $('#btnAttack').classList.remove('hidden');
  $('#btnCrouch').classList.remove('hidden');
  updateHUD(true);
}

/* ---------------------------------------------------------------- building */
function beginBuild(id) {
  const def = BUILDABLES.find(b => b.id === id); if (!def) return;
  const p = G.player;
  if ((p.skills[def.skill] || 0) < (def.level || 0)) { toast('Habilidade insuficiente.', 'bad'); return; }
  for (const [item, n] of Object.entries(def.requires)) if (countOf(item) < n) { toast(`Falta ${itemDef(item).name}.`, 'bad'); return; }
  if (def.tools && !def.tools.every(hasTool)) { toast('Ferramenta necessária em falta.', 'bad'); return; }
  G.placing = def;
  closePanel();
  updateBuildTarget();
  $('#buildBar').classList.remove('hidden');
  $('#buildName').textContent = def.name;
  toast(`Posicione a ${def.name.toLowerCase()} no bloco à frente e confirme.`, '', 4200);
}
function buildTargetTile() {
  const p = G.player;
  const fx = Math.cos(p.facing), fy = Math.sin(p.facing);
  return { x: Math.floor(p.x + fx * 1.15), y: Math.floor(p.y + fy * 1.15) };
}
function canPlaceAt(x, y) {
  const w = G.world;
  if (!w.inBounds(x, y)) return false;
  if (x === Math.floor(G.player.x) && y === Math.floor(G.player.y)) return false;
  if (w.solid[w.idx(x, y)]) return false;
  if (w.get(x, y) === T.WATER) return false;
  if (G.structures.some(s => Math.floor(s.x) === x && Math.floor(s.y) === y)) return false;
  for (const v of G.vehicles) if (dist(x + .5, y + .5, v.x, v.y) < 1.5) return false;
  return true;
}
function updateBuildTarget() {
  if (!G.placing) { G.buildTarget = null; return; }
  const t = buildTargetTile();
  G.buildTarget = { ...t, valid: canPlaceAt(t.x, t.y) };
  const hint = $('#buildHint');
  if (hint) hint.textContent = G.buildTarget.valid ? 'Válido neste local' : 'Local bloqueado — mude de posição';
}
function confirmBuild() {
  if (!G.placing) return;
  const def = G.placing, t = G.buildTarget;
  if (!t || !t.valid) { toast('Não é possível construir aí.', 'bad'); return; }
  for (const [item, n] of Object.entries(def.requires)) if (countOf(item) < n) { toast('Materiais insuficientes.', 'bad'); return; }
  for (const [item, n] of Object.entries(def.requires)) removeItem(item, n);
  const s = { id: G.uid++, kind: def.id, x: t.x, y: t.y, fuel: def.id === 'campfire' ? 100 : 0, water: 0, crop: null, growth: 0, watered: false, mature: false };
  if (def.id === 'crate') s.container = { id: 'crate_' + s.id, items: [], searched: true, label: 'Caixa de armazenamento' };
  if (def.solid) G.world.solid[G.world.idx(t.x, t.y)] = 1;
  G.structures.push(s);
  G.stats.built = (G.stats.built || 0) + 1;
  addSkillXP(def.skill, 12);
  AudioFX.hit();
  toast(`<b>${def.name}</b> construída.`, 'good');
  G.placing = null;
  $('#buildBar').classList.add('hidden');
  updateHUD(true);
  saveGame(true);
}
function cancelBuildPlacement() {
  G.placing = null;
  G.buildTarget = null;
  $('#buildBar').classList.add('hidden');
}

/* ---------------------------------------------------------------- simulation */
function totalMinutes() { return (G.timeOfDay.day - 1) * 1440 + G.timeOfDay.minutes; }
function advanceMinutes(m, announce = true) {
  let t = G.timeOfDay.minutes + m;
  let days = 0;
  while (t >= 1440) { t -= 1440; days++; G.timeOfDay.day++; }
  G.timeOfDay.minutes = t;
  if (days > 0 && announce) {
    G.stats.days = G.timeOfDay.day;
    toast(`<b>Dia ${G.timeOfDay.day}.</b> Você sobreviveu mais uma noite.`, 'good', 5200);
  }
  if (days > 0) G.stats.days = G.timeOfDay.day;
}
function gameHour() { return G.timeOfDay.minutes / 60; }
function nightFactor() {
  const h = gameHour();
  if (h < 5) return 1;
  if (h < 7) return 1 - smooth(5, 7, h);
  if (h < 18.5) return 0;
  if (h < 21) return smooth(18.5, 21, h);
  return 1;
}
function isNight() { return nightFactor() > .55; }
function ambientTemp() {
  const h = gameHour();
  const base = 14.5 + Math.sin((h - 9) / 24 * TAU) * 7.5;
  const wet = G.weather.type === 'rain' || G.weather.type === 'storm' ? -3.5 : G.weather.type === 'fog' ? -1.5 : 0;
  return base + wet;
}
function updateWeather(dt, gameMinutes) {
  const abs = totalMinutes();
  if (abs >= (G.weather.next || 0)) {
    const roll = Math.random();
    let type = 'clear', label = 'Limpo', intensity = 0;
    if (roll < .2) { type = 'clear'; label = 'Limpo'; }
    else if (roll < .48) { type = 'cloudy'; label = 'Nublado'; }
    else if (roll < .76) { type = 'rain'; label = 'Chuva'; intensity = .65; }
    else if (roll < .86) { type = 'storm'; label = 'Tempestade'; intensity = 1; }
    else { type = 'fog'; label = 'Neblina'; intensity = .5; }
    G.weather.type = type; G.weather.label = label; G.weather.intensity = intensity;
    G.weather.wind = 1 + rnd(4);
    G.weather.next = abs + 22 + rnd(30);
    if (type !== 'clear' && Math.random() < .8) toast(`O tempo mudou: <b>${label.toLowerCase()}</b>.`, '', 3800);
    if (type === 'storm') setTimeout(() => { if (G.started && !G.dead) AudioFX.thunder(); }, 3200);
  }
  const target = ambientTemp();
  G.weather.targetTemp = target;
  G.weather.temp = lerp(G.weather.temp, target, Math.min(1, dt * .18));
  const rainAmt = (G.weather.type === 'rain' ? .55 : G.weather.type === 'storm' ? 1 : 0) * G.weather.intensity;
  AudioFX.setRain(rainAmt);
  if (G.weather.type === 'storm' && Math.random() < dt * .06) {
    G.flash = .7; AudioFX.thunder(); shake(3);
  }
}
function updatePlayer(dt, gameMinutes) {
  const p = G.player;
  const hours = gameMinutes / 60;
  p.attackCd = Math.max(0, p.attackCd - dt);
  p.attackAnim = Math.max(0, p.attackAnim - dt * 3.4);
  p.hurtFlash = Math.max(0, p.hurtFlash - dt * 2.5);
  p.hunger = clamp(p.hunger - 3.1 * hours * DIFF().drain, 0, 100);
  p.thirst = clamp(p.thirst - 4.0 * hours * DIFF().drain, 0, 100);
  p.sleep = clamp(p.sleep - 2.7 * hours * DIFF().drain, 0, 100);
  p.hygiene = clamp(p.hygiene - .9 * hours, 0, 100);
  const inside = playerInsideBuilding();
  const raining = (G.weather.type === 'rain' || G.weather.type === 'storm') && !inside;
  if (raining) p.wet = clamp(p.wet + dt * 7 * G.weather.intensity, 0, 100);
  else p.wet = clamp(p.wet - dt * (inside ? 4 : 2), 0, 100);
  const cold = G.weather.temp < 11 && !p.clothing.jacket;
  if (cold && p.wet > 30) p.stress = clamp(p.stress + dt * .6, 0, 100);
  if (inside) p.stress = clamp(p.stress - dt * .35, 0, 100);
  if (Math.random() < dt * .08) p.stress = clamp(p.stress + (isNight() ? .5 : .18), 0, 100);
  p.pain = clamp(p.pain - dt * .55, 0, 100);
  if (p.bleed > 0) {
    p.health -= dt * 1.1;
    if (Math.random() < dt * 2) addBlood(p.x, p.y, 1);
  }
  if (p.hunger <= 0) p.health -= dt * .55;
  else if (p.hunger < 12) p.health -= dt * .16;
  if (p.thirst <= 0) p.health -= dt * .75;
  else if (p.thirst < 12) p.health -= dt * .2;
  if (p.sleep <= 0) p.stress = clamp(p.stress + dt * .3, 0, 100);
  if (p.infection > 12) p.infection = clamp(p.infection + hours * .9, 0, 100);
  if (p.infection > 78) p.health -= dt * .4;
  if (p.sickness > 0) {
    p.sickness = clamp(p.sickness - dt * .35, 0, 100);
    if (Math.random() < dt * .2) p.health -= .4;
  }
  if (p.bleed <= 0 && p.hunger > 25 && p.thirst > 25 && p.health < p.maxHealth) p.health = clamp(p.health + dt * .055, 0, p.maxHealth);
  if (p.health <= 0) { die('Seu corpo cedeu. A cidade ficou em silêncio.'); return; }
  // Flashlight battery
  if (p.flashlightOn) {
    p.battery = Math.max(0, p.battery - dt * .22);
    if (p.battery <= 0) { p.flashlightOn = false; toast('A lanterna apagou.', 'bad'); }
  }
  // Movement
  if (p.inVehicle) {
    updateVehicle(dt);
  } else {
    const mv = getMoveVector();
    const worldDir = screenToWorldDir(mv.x, mv.y);
    const mag = Math.hypot(worldDir.x, worldDir.y);
    p.moving = mag > .05;
    if (G.fishing && p.moving) cancelFishing(true);
    if (p.moving) {
      const sprint = input.sprint && !p.crouch && p.stamina > 1;
      let speed = p.crouch ? 1.3 : sprint ? 4.55 : 2.65;
      if (p.pain > 40) speed *= .82;
      if (p.health < 35) speed *= .82;
      if (p.sleep < 15) speed *= .9;
      if (p.hunger < 10 || p.thirst < 10) speed *= .92;
      p.sprint = sprint;
      const fx = worldDir.x / mag, fy = worldDir.y / mag;
      p.facing = Math.atan2(fy, fx);
      movePlayer(fx * speed * dt, fy * speed * dt);
      p.walkPhase += dt * (sprint ? 15 : p.crouch ? 7 : 10);
      G.stats.distance = (G.stats.distance || 0) + speed * dt;
      if (sprint) p.stamina = Math.max(0, p.stamina - dt * 21);
      G.footTimer -= dt;
      if (G.footTimer <= 0) {
        G.footTimer = sprint ? .24 : p.crouch ? .7 : .42;
        AudioFX.noise(.035, p.crouch ? .015 : sprint ? .065 : .035, sprint ? 480 : 260, .6);
        if (sprint) emitNoise(p.x, p.y, 9);
        else if (!p.crouch) emitNoise(p.x, p.y, 1.2);
      }
    } else {
      p.sprint = false;
      if (G.timeOfDay.minutes > 0) p.stamina = Math.min(100, p.stamina + dt * (p.crouch ? 7 : 11) * (p.sleep < 20 ? .6 : 1));
    }
    if (!p.moving && p.stamina < 100) p.stamina = Math.min(100, p.stamina + dt * 4);
  }
  if (p.stamina > 100) p.stamina = 100;
  // Camera trails behind
  G.trail.push({ x: p.x, y: p.y });
  if (G.trail.length > 2) G.trail.shift();
}
function screenToWorldDir(sx, sy) {
  if (!sx && !sy) return { x: 0, y: 0 };
  const wx = sx / (TILE_W / 2) + sy / (TILE_H / 2);
  const wy = sy / (TILE_H / 2) - sx / (TILE_W / 2);
  const m = Math.hypot(wx, wy) || 1;
  return { x: wx / m, y: wy / m };
}
function movePlayer(dx, dy) {
  const p = G.player;
  if (!collidesAt(p.x + dx, p.y, p.radius)) p.x += dx;
  if (!collidesAt(p.x, p.y + dy, p.radius)) p.y += dy;
  // push away from zombies gently
}
function collidesAt(x, y, r = .3) {
  const w = G.world;
  if (!w) return true;
  for (let yy = Math.floor(y - r); yy <= Math.floor(y + r); yy++) {
    for (let xx = Math.floor(x - r); xx <= Math.floor(x + r); xx++) {
      if (!w.inBounds(xx, yy)) return true;
      if (w.solid[w.idx(xx, yy)]) {
        if (x + r > xx && x - r < xx + 1 && y + r > yy && y - r < yy + 1) return true;
      }
    }
  }
  for (const v of G.vehicles) {
    if (v === G.player.inVehicle) continue;
    if (dist(x, y, v.x, v.y) < .9) return true;
  }
  return false;
}
function moveEntity(e, dx, dy, r = .25) {
  let moved = false;
  if (!collidesAt(e.x + dx, e.y, r)) { e.x += dx; moved = true; }
  if (!collidesAt(e.x, e.y + dy, r)) { e.y += dy; moved = true; }
  return moved;
}
function addBlood(x, y, n = 3) {
  if (!G.settings.gore) { G.decals.push({ x, y, r: .1 + rnd(.2), alpha: .35, color: '#4a1d18' }); return; }
  for (let i = 0; i < n; i++) G.particles.push({ x, y, z: 6 + rnd(8), vx: rnd(.8) - .4, vy: rnd(.8) - .4, vz: 1 + rnd(2), life: .5 + rnd(.6), color: '#651b18', size: 1.4 + rnd(2) });
  G.decals.push({ x: x + rnd(.4) - .2, y: y + rnd(.4) - .2, r: .08 + rnd(.22), alpha: .35 + rnd(.3), color: '#3f1714' });
  if (G.decals.length > 140) G.decals.shift();
}
function addDust(x, y, n = 4, color = '#9a8b6d') {
  for (let i = 0; i < n; i++) G.particles.push({ x, y, z: 2 + rnd(4), vx: rnd(.8) - .4, vy: rnd(.8) - .4, vz: .5 + rnd(1), life: .3 + rnd(.4), color, size: 1 + rnd(2) });
}
function killZombie(z) {
  z.dead = true;
  G.stats.zombiesKilled = (G.stats.zombiesKilled || 0) + 1;
  addSkillXP('combat', 10);
  addBlood(z.x, z.y, 9);
  G.corpses.push({ x: z.x, y: z.y, variant: z.variant, angle: z.facing, life: 999 });
  if (G.corpses.length > 26) G.corpses.shift();
  if (Math.random() < .14) {
    const loot = ['bandage', 'cloth', 'chips', 'empty_bottle', 'scrap'][Math.floor(rnd(5))];
    G.pickups.push({ id: loot, qty: 1, x: z.x + rnd(.4) - .2, y: z.y + rnd(.4) - .2, born: G.time });
  }
}
function playerAttack() {
  const p = G.player;
  if (!p || p.dead || G.ui.panel) return;
  if (p.inVehicle) { AudioFX.tone(180, .4, .12, 'square', -30); emitNoise(p.x, p.y, 16); toast('Você buzina. Não foi uma boa ideia.', 'bad'); return; }
  if (G.placing) return;
  if (p.attackCd > 0) return;
  if (G.fishing) cancelFishing(true);
  if (p.stamina < 6) { toast('Sem fôlego para atacar.', 'bad', 1600); return; }
  const wd = p.weapon ? itemDef(p.weapon.id) : null;
  const stats = wd ? { damage: wd.damage, range: wd.range, speed: wd.speed, crit: wd.crit || .1 } : { damage: 8, range: 1.15, speed: .48, crit: .05 };
  // auto-face nearest zombie in front-ish range
  let nearest = null, nd = 3.4;
  for (const z of G.zombies) { if (z.dead) continue; const d = dist(p.x, p.y, z.x, z.y); if (d < nd) { nd = d; nearest = z; } }
  if (nearest) p.facing = Math.atan2(nearest.y - p.y, nearest.x - p.x);
  p.attackCd = stats.speed;
  p.attackAnim = 1;
  p.stamina = Math.max(0, p.stamina - (wd ? 8 : 6));
  emitNoise(p.x, p.y, wd ? 6 : 3.5);
  AudioFX.swing();
  const fx = Math.cos(p.facing), fy = Math.sin(p.facing);
  let hit = 0;
  for (const z of G.zombies) {
    if (z.dead) continue;
    const dx = z.x - p.x, dy = z.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d > stats.range + .35) continue;
    const dot = (dx / (d || 1)) * fx + (dy / (d || 1)) * fy;
    if (dot < Math.cos(1.35)) continue;
    let dmg = stats.damage * (.85 + rnd(.3)) * (1 + (p.skills.combat || 0) * .035);
    if (Math.random() < stats.crit) dmg *= 1.7;
    z.hp -= dmg;
    z.state = 'hunt'; z.tx = p.x; z.ty = p.y; z.lost = 0;
    z.flash = .12;
    hit++;
    addBlood(z.x, z.y, 4);
    floatText('-'+Math.round(dmg), z.x, z.y, '#e3a489');
    addDust(z.x, z.y, 2, '#7d2a21');
    if (z.hp <= 0) killZombie(z);
  }
  if (hit) {
    AudioFX.hit(); shake(4);
    if (wd) { p.weapon.durability -= 1 + rnd(1.4); if (p.weapon.durability <= 0) { toast(`${wd.name} quebrou.`, 'bad'); p.weapon = null; } }
  }
  updateHUD(true);
}
function updateZombies(dt) {
  const p = G.player;
  if (!p) return;
  const night = isNight();
  const alive = G.zombies.filter(z => !z.dead);
  for (const z of alive) {
    z.anim += dt * (2 + z.speed * 2);
    z.attackCd = Math.max(0, (z.attackCd || 0) - dt);
    z.flash = Math.max(0, (z.flash || 0) - dt);
    const d = dist(p.x, p.y, z.x, z.y);
    let sight = 7.5 + (night ? 2.2 : 0) + (p.flashlightOn ? 3.5 : 0);
    if (p.crouch) sight -= 2.6;
    if (p.inVehicle) sight += 5;
    if (d > 40) { z.state = z.state === 'hunt' ? 'hunt' : 'idle'; continue; }
    const vis = d < sight && hasLineOfSight(z.x, z.y, p.x, p.y);
    if (z.state === 'hunt') {
      if (vis) { z.tx = p.x; z.ty = p.y; z.lost = 0; }
      else z.lost = (z.lost || 0) + dt;
      if (z.lost > 6.5) { z.state = 'investigate'; z.timer = 4; z.lost = 0; }
      if (d > 28) z.state = 'idle';
    } else if (vis && (d < 3.8 || p.moving || p.flashlightOn || d < sight * .6)) {
      z.state = 'hunt'; z.timer = 0; z.lost = 0; z.tx = p.x; z.ty = p.y;
      if (Math.random() < .5) AudioFX.zombie(clamp(.12 - d * .006, .01, .1));
      // Nearby dead hear the commotion.
      if (Math.random() < .45) {
        for (const o of alive) {
          if (o === z || o.state === 'hunt') continue;
          if (dist(z.x, z.y, o.x, o.y) < 6 && Math.random() < .45) {
            o.state = 'investigate'; o.tx = p.x; o.ty = p.y; o.timer = 5;
          }
        }
      }
    }
    let tx = z.tx, ty = z.ty, speed = 0;
    if (z.state === 'hunt') {
      tx = p.x; ty = p.y;
      speed = (z.speed + .12) * (night ? 1.16 : 1) * (p.inVehicle ? 1 : 1);
    } else if (z.state === 'investigate') {
      z.timer -= dt;
      speed = z.speed * .55;
      if (z.timer <= 0 || (tx != null && dist(z.x, z.y, tx, ty) < .5)) { z.state = 'idle'; z.wander = rnd(3); }
    } else {
      z.wander -= dt;
      if (z.wander <= 0) {
        z.wander = 3 + rnd(5);
        z.tx = z.x + rnd(4) - 2; z.ty = z.y + rnd(4) - 2;
      }
      if (z.tx != null) { tx = z.tx; ty = z.ty; speed = .22; }
    }
    if (speed > 0 && tx != null) {
      let dx = tx - z.x, dy = ty - z.y;
      const dl = Math.hypot(dx, dy);
      if (dl > (z.state === 'idle' ? .4 : .8)) {
        dx /= dl; dy /= dl;
        z.facing = Math.atan2(dy, dx);
        const moved = moveEntity(z, dx * speed * dt, dy * speed * dt, .24);
        if (!moved) {
          const alt = z.dir + 1.1; z.dir = alt;
          const ax = Math.cos(alt), ay = Math.sin(alt);
          if (!moveEntity(z, ax * speed * dt, ay * speed * dt, .24)) {
            z.dir += 1.4;
            moveEntity(z, Math.cos(z.dir) * speed * dt, Math.sin(z.dir) * speed * dt, .24);
          }
          // Force open a door if one is right in front.
          tryOpenDoorNear(z);
        }
        z.anim += dt * speed * 4;
      }
    }
    if (z.state === 'hunt' && d < 1.12 && z.attackCd <= 0) {
      z.attackCd = 1.45 + rnd(.55);
      zombieAttack(z);
    }
    // distant groans
    if (d < 16 && Math.random() < dt * .012) AudioFX.zombie(clamp(.08 - d * .004, .008, .08));
  }
}
function hasLineOfSight(x1, y1, x2, y2) {
  const steps = Math.ceil(dist(x1, y1, x2, y2) / .4);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = Math.floor(x1 + (x2 - x1) * t);
    const y = Math.floor(y1 + (y2 - y1) * t);
    if (G.world.solid[G.world.idx(x, y)]) {
      const info = G.world.wallInfo.get(x + ',' + y);
      if (!info || info.kind !== 'door') return false;
    }
  }
  return true;
}
function tryOpenDoorNear(z) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = Math.floor(z.x) + dx, y = Math.floor(z.y) + dy;
    if (!G.world.inBounds(x, y)) continue;
    const info = G.world.wallInfo.get(x + ',' + y);
    if (info?.kind === 'door') {
      const b = G.world.buildings.find(bb => bb.id === info.buildingId);
      if (b && !b.doorOpen) {
        b.doorOpen = true;
        G.world.solid[G.world.idx(x, y)] = 0;
        AudioFX.tone(130, .12, .05, 'square', -20);
      }
    }
  }
}
function zombieAttack(z) {
  const p = G.player;
  const dmg = (7 + rnd(8)) * (G.selectedDifficulty === 'nightmare' ? 1.25 : G.selectedDifficulty === 'calm' ? .8 : 1);
  p.health -= dmg;
  p.pain = clamp(p.pain + 12, 0, 100);
  p.hurtFlash = 1;
  shake(8);
  AudioFX.hurt();
  addBlood(p.x, p.y, 5);
  floatText('-' + Math.round(dmg), p.x, p.y, '#e27b63');
  if (Math.random() < .3) {
    p.bleed = Math.min(3, p.bleed + 1);
    toast('Você está sangrando. Use uma bandagem!', 'bad', 3200);
  }
  if (Math.random() < .14) {
    p.infection = Math.max(p.infection, 8);
    p.infected = true;
    toast('A mordida arde. Talvez esteja infectada.', 'bad', 3600);
  }
  // knockback
  const a = Math.atan2(p.y - z.y, p.x - z.x);
  for (let i = 0; i < 2; i++) if (!collidesAt(p.x + Math.cos(a) * .16, p.y + Math.sin(a) * .16, .28)) { p.x += Math.cos(a) * .16; p.y += Math.sin(a) * .16; }
  if (p.health <= 0) die('Os mortos o alcançaram. A cidade reclamou mais um.');
  else updateHUD(true);
}
function updateVehicle(dt) {
  const p = G.player, v = p.inVehicle;
  if (!v) return;
  const mv = getMoveVector();
  const wd = screenToWorldDir(mv.x, mv.y);
  const mag = Math.hypot(wd.x, wd.y);
  if (v.fuel <= 0) {
    if (v.speed > .05 && Math.random() < dt * 2) toast('O tanque está vazio.', 'bad', 1800);
    v.speed *= Math.pow(.2, dt);
  } else if (mag > .08) {
    const target = Math.atan2(wd.y, wd.x);
    let diff = ((target - v.angle + Math.PI) % TAU + TAU) % TAU - Math.PI;
    v.angle += diff * Math.min(1, dt * 4.5);
    v.speed = Math.min(6.3, v.speed + dt * 4.8 * mag);
    v.fuel = Math.max(0, v.fuel - dt * (.03 + v.speed * .018) * (p.profession === 'mechanic' ? .8 : 1));
  } else {
    v.speed *= Math.pow(.35, dt);
  }
  if (v.speed > .05) {
    const nx = v.x + Math.cos(v.angle) * v.speed * dt;
    const ny = v.y + Math.sin(v.angle) * v.speed * dt;
    if (!collidesAt(nx, ny, .55)) { v.x = nx; v.y = ny; }
    else if (!collidesAt(v.x + Math.cos(v.angle) * v.speed * dt, v.y, .55)) { v.x += Math.cos(v.angle) * v.speed * dt; v.speed *= .8; }
    else if (!collidesAt(v.x, v.y + Math.sin(v.angle) * v.speed * dt, .55)) { v.y += Math.sin(v.angle) * v.speed * dt; v.speed *= .8; }
    else { v.speed *= -.28; v.hp = Math.max(0, v.hp - 1); shake(5); }
    G.stats.distance = (G.stats.distance || 0) + v.speed * dt;
    p.x = v.x; p.y = v.y;
    G.noiseTimer -= dt;
    if (G.noiseTimer <= 0) { G.noiseTimer = .5; emitNoise(v.x, v.y, 16); }
    for (const z of G.zombies) {
      if (z.dead) continue;
      if (dist(v.x, v.y, z.x, z.y) < 1.15) {
        killZombie(z); addBlood(z.x, z.y, 14); AudioFX.hit(); shake(5); v.speed *= .82;
      }
    }
    if (Math.random() < dt * 2) addDust(v.x, v.y, 1, '#6d6253');
  }
  p.x = v.x; p.y = v.y;
  if (v.hp <= 0) {
    toast('O veículo parou de vez.', 'bad');
    exitVehicle();
  }
}
function updateStructures(gameMinutes) {
  const raining = G.weather.type === 'rain' || G.weather.type === 'storm';
  for (const s of G.structures) {
    if (s.kind === 'campfire') {
      s.fuel = Math.max(0, (s.fuel || 0) - gameMinutes * .075);
    } else if (s.kind === 'farmplot' && s.crop) {
      const def = CROPS[s.crop];
      if (raining) s.watered = true;
      const rate = (s.watered ? 1.75 : .55) * (G.player.profession === 'farmer' ? 1.2 : 1);
      s.growth = (s.growth || 0) + gameMinutes * rate;
      if (!s.mature && s.growth >= def.growHours * 60) { s.mature = true; toast(`Sua plantação de ${def.name.toLowerCase()} está pronta para colher.`, 'good', 4200); }
    } else if (s.kind === 'raincollector' && raining) {
      s.water = Math.min(100, (s.water || 0) + gameMinutes * .22 * G.weather.intensity);
    }
  }
}
function maintainPopulation() {
  const diff = DIFF();
  const alive = G.zombies.filter(z => !z.dead).length;
  const target = Math.round(62 * diff.zombies + (G.timeOfDay.day - 1) * 3);
  if (alive >= Math.min(target, 108)) return;
  const p = G.player;
  let tries = 0;
  let spawned = 0;
  while (spawned < 2 && tries < 120) {
    tries++;
    const a = rnd(TAU), r = 18 + rnd(16);
    const x = Math.floor(p.x + Math.cos(a) * r), y = Math.floor(p.y + Math.sin(a) * r);
    if (!G.world.inBounds(x, y) || G.world.solid[G.world.idx(x, y)] || G.world.get(x, y) === T.WATER) continue;
    G.zombies.push({
      id: G.uid++, x, y, hp: 30 + rndi(0, 22), maxHp: 54, speed: .7 + rnd(.5),
      variant: rndi(0, 5), state: 'idle', dir: rnd(TAU), facing: rnd(TAU),
      wander: rnd(4), attackCd: 0, tx: x, ty: y, anim: rnd(8), dead: false, flash: 0
    });
    spawned++;
  }
}
function updateParticles(dt) {
  for (const q of G.particles) {
    q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.vz -= 5 * dt;
    if (q.z < 0) { q.z = 0; q.vz *= -.2; q.vx *= .5; q.vy *= .5; }
    q.life -= dt;
  }
  G.particles = G.particles.filter(q => q.life > 0);
  for (const f of G.floats) { f.life -= dt; f.y -= dt * .3; }
  G.floats = G.floats.filter(f => f.life > 0);
  G.shake = Math.max(0, G.shake - dt * 20);
  G.flash = Math.max(0, G.flash - dt * 1.5);
  for (const d of G.decals) d.alpha = Math.max(0, d.alpha - dt * .001);
}
function updateCamera(dt) {
  const p = G.player; if (!p) return;
  const px = (p.x - p.y) * (TILE_W / 2);
  const py = (p.x + p.y) * (TILE_H / 2);
  const lead = p.inVehicle ? 20 : 8;
  const tx = px + Math.cos(p.facing) * lead;
  const ty = py + Math.sin(p.facing) * lead * .4;
  G.cam.x = lerp(G.cam.x, tx, Math.min(1, dt * 5.5));
  G.cam.y = lerp(G.cam.y, ty, Math.min(1, dt * 5.5));
}
function die(cause) {
  if (G.dead) return;
  G.dead = true;
  G.player.cause = cause;
  AudioFX.hurt(); AudioFX.setRain(0);
  $('#deathCause').textContent = cause;
  $('#deathStats').innerHTML = `
    <span>DIAS SOBREVIVIDOS<b>${G.timeOfDay.day}</b></span>
    <span>ZUMBIS ABATIDOS<b>${G.stats.zombiesKilled || 0}</b></span>
    <span>RECIPIENTES SAQUEADOS<b>${G.stats.looted || 0}</b></span>
    <span>DISTÂNCIA<b>${Math.round(G.stats.distance || 0)} m</b></span>
    <span>EXPLORAÇÃO<b>${G.stats.explored || 0}%</b></span>`;
  setTimeout(() => $('#death').classList.remove('hidden'), 500);
  if (G.player.inVehicle) { G.player.inVehicle.occupied = false; G.player.inVehicle = null; }
  try { localStorage.removeItem(SAVE_KEY); refreshContinue(); } catch {}
}

/* ---------------------------------------------------------------- HUD */
function applyWeatherVisual() {
  document.body.dataset.weather = G.weather?.type || 'clear';
  const night = isNight();
  if (G.lastNightState !== night) {
    G.lastNightState = night;
    document.body.classList.toggle('is-night', night);
  }
  if (G.lastWeatherType !== G.weather?.type) {
    G.lastWeatherType = G.weather?.type;
    document.body.classList.toggle('is-wet', G.weather?.type === 'rain' || G.weather?.type === 'storm');
  }
}
function getMoveVector() {
  let x = 0, y = 0;
  const k = input.keys;
  if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
  if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
  if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
  if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
  if (input.joy.active && (input.joy.x || input.joy.y)) {
    x += input.joy.x; y += input.joy.y;
  }
  const m = Math.hypot(x, y);
  if (m > 1) { x /= m; y /= m; }
  return { x, y };
}
function firstEntryOf(ids) {
  const p = G.player; if (!p) return null;
  for (const id of ids) {
    const e = p.inventory.find(x => x.id === id);
    if (e) return e;
  }
  return null;
}
function quickbarHTML() {
  const p = G.player; if (!p) return '';
  const weapon = p.weapon ? itemDef(p.weapon.id) : null;
  const med = firstEntryOf(['bandage', 'medkit', 'painkillers', 'vitamins']);
  const drink = firstEntryOf(['water_bottle', 'canned_food', 'fish_cooked', 'meal', 'bread', 'apple', 'chips', 'carrot', 'potato', 'fish_raw']);
  const flash = p.inventory.find(x => x.id === 'flashlight') || null;
  const slots = [
    { key: '1', cls: 'weapon', icon: weapon ? iconFor(weapon.icon) : iconFor('box'), label: weapon ? weapon.name.split(' ')[0].slice(0, 8).toUpperCase() : 'MÃOS', qty: '', empty: !weapon },
    { key: '2', cls: '', icon: med ? iconFor(itemDef(med.id).icon) : iconFor('bandage'), label: med ? itemDef(med.id).name.split(' ')[0].slice(0, 8).toUpperCase() : 'CURA', qty: med && med.qty > 1 ? med.qty : '', empty: !med },
    { key: '3', cls: '', icon: drink ? iconFor(itemDef(drink.id).icon) : iconFor('bottle'), label: drink ? itemDef(drink.id).name.split(' ')[0].slice(0, 8).toUpperCase() : 'ÁGUA', qty: drink && drink.qty > 1 ? drink.qty : '', empty: !drink },
    { key: '4', cls: '', icon: iconFor('flashlight'), label: 'LUZ', qty: '', empty: !flash, active: p.flashlightOn },
    { key: '5', cls: '', icon: iconFor('hammer'), label: 'BANCADA', qty: '', empty: false }
  ];
  return slots.map((s, i) => `<button class="slot ${s.cls} ${s.empty ? 'empty' : ''} ${s.active ? 'active' : ''} keyed" data-quick="${i}" data-key="${s.key}" aria-label="${esc(s.label)}">
    <span class="slot-icon">${s.icon}</span><span class="slot-label">${esc(s.label)}</span>${s.qty ? `<span class="slot-qty">${s.qty}</span>` : ''}
  </button>`).join('');
}
function bindQuickbar() {
  document.querySelectorAll('[data-quick]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!G.player || G.mode !== 'playing' || G.dead) return;
      const i = Number(btn.dataset.quick);
      if (i === 0) { G.ui.selected = null; openPanel('inventory'); }
      else if (i === 1) { const e = firstEntryOf(['bandage', 'medkit', 'painkillers', 'vitamins']); if (e) useEntry(e); else toast('Você não tem itens de cura.', 'bad'); }
      else if (i === 2) { const e = firstEntryOf(['water_bottle', 'canned_food', 'fish_cooked', 'meal', 'bread', 'apple', 'chips', 'carrot', 'potato', 'fish_raw']); if (e) useEntry(e); else toast('Você não tem comida ou água.', 'bad'); }
      else if (i === 3) { if (IN_BAG('flashlight')) toggleFlashlight(); else toast('Você não tem uma lanterna.', 'bad'); }
      else if (i === 4) { if (G.ui.panel) closePanel(); openPanel('craft'); }
      updateHUD(true);
    });
  });
}
function updateHUD(force = false) {
  if (!G.player) return;
  const now = performance.now() / 1000;
  if (!force && now - G.hudTimer < .12) return;
  G.hudTimer = now;
  const p = G.player, w = G.weather || {};
  $('#hudName') && ($('#hudName').textContent = p.name || 'Sobrevivente');
  $('#hudProf') && ($('#hudProf').textContent = p.professionName || 'Sobrevivente');
  const portrait = $('#portrait');
  if (portrait && portrait.textContent !== (p.name || 'S').slice(0, 1).toUpperCase()) portrait.textContent = (p.name || 'S').slice(0, 1).toUpperCase();
  $('#healthBar') && ($('#healthBar').style.width = clamp(p.health / (p.maxHealth || 100) * 100, 0, 100) + '%');
  $('#healthNum') && ($('#healthNum').textContent = Math.max(0, Math.round(p.health)));
  $('#hungerBar') && ($('#hungerBar').style.width = clamp(p.hunger, 0, 100) + '%');
  $('#thirstBar') && ($('#thirstBar').style.width = clamp(p.thirst, 0, 100) + '%');
  $('#sleepBar') && ($('#sleepBar').style.width = clamp(p.sleep, 0, 100) + '%');
  $('#staminaBar') && ($('#staminaBar').style.width = clamp(p.stamina, 0, 100) + '%');
  $('#locationName') && ($('#locationName').textContent = locationName());
  $('#clockTime') && ($('#clockTime').textContent = fmtTime(G.timeOfDay.minutes));
  $('#dayLabel') && ($('#dayLabel').textContent = 'DIA ' + G.timeOfDay.day);
  $('#weatherLabel') && ($('#weatherLabel').textContent = w.label || 'Limpo');
  $('#tempLabel') && ($('#tempLabel').textContent = Math.round(w.temp || 18) + '°');
  const wIcon = (w.type === 'rain' || w.type === 'storm') ? '#i-rain' : '#i-sun';
  const wUse = document.querySelector('#weatherPill use');
  if (wUse && wUse.getAttribute('href') !== wIcon) wUse.setAttribute('href', wIcon);

  // Status chips
  const chips = [];
  if (p.bleed > 0) chips.push('<span class="status-chip bleed">SANGRANDO</span>');
  if (p.infection > 18) chips.push('<span class="status-chip infect">INFECÇÃO</span>');
  if (p.pain > 35) chips.push('<span class="status-chip pain">DOR</span>');
  if ((w.temp || 18) < 11 && !p.clothing?.jacket) chips.push('<span class="status-chip cold">FRIO</span>');
  if (p.wet > 45) chips.push('<span class="status-chip wet">MOLHADO</span>');
  const chipSig = chips.join('');
  if (chipSig !== G.hudChipSig) { G.hudChipSig = chipSig; $('#statusChips') && ($('#statusChips').innerHTML = chipSig); }

  // Objectives
  const total = OBJECTIVES.length;
  const done = completedObjectives();
  const cur = OBJECTIVES.find(o => !o.check());
  $('#objCount') && ($('#objCount').textContent = `${done}/${total}`);
  $('#objText') && ($('#objText').textContent = cur ? cur.title : 'Você sobreviveu ao que a cidade tinha para hoje.');
  $('#objBar') && ($('#objBar').style.width = clamp(done / total * 100, 0, 100) + '%');

  // Interaction prompt
  const prompt = $('#prompt');
  if (prompt) {
    const showPrompt = G.mode === 'playing' && !G.dead && !G.ui.panel && !G.placing && !!G.target;
    prompt.classList.toggle('hidden', !showPrompt);
    if (showPrompt) {
      const label = G.target.label;
      if ($('#promptLabel').textContent !== label) $('#promptLabel').textContent = label;
    }
  }

  // Quickbar
  const qh = quickbarHTML();
  if (qh !== G.hudQuickSig) { G.hudQuickSig = qh; $('#quickbar') && ($('#quickbar').innerHTML = qh); bindQuickbar(); }

  // Build bar
  const bb = $('#buildBar');
  if (bb) {
    bb.classList.toggle('hidden', !G.placing);
    if (G.placing && G.buildTarget) {
      $('#buildName').textContent = G.placing.name;
      $('#buildHint').textContent = G.buildTarget.valid ? 'Válido neste local' : 'Local bloqueado — mude de posição';
      const cb = $('#buildConfirm'); if (cb) cb.disabled = !G.buildTarget.valid;
    }
  }
  // Fishing progress text
  if ($('#fishingBar')) $('#fishingBar').classList.toggle('hidden', !G.fishing);

  // Touch button states
  $('#btnSprint') && $('#btnSprint').classList.toggle('active', !!input.sprint);
  $('#btnCrouch') && $('#btnCrouch').classList.toggle('active', !!p.crouch);
  $('#btnAttack') && $('#btnAttack').classList.toggle('danger', G.zombies.some(z => !z.dead && dist(p.x, p.y, z.x, z.y) < 1.7));
}

/* ---------------------------------------------------------------- rendering */
const PAL = {
  [T.GRASS]: ['#46523a', '#4a573c', '#424e37'],
  [T.GRASS2]: ['#3c4a33', '#405036', '#394630'],
  [T.ROAD]: ['#35383a', '#313436', '#383b3d'],
  [T.SIDEWALK]: ['#77736a', '#7d786e', '#716d64'],
  [T.DIRT]: ['#65563f', '#6c5b43', '#5e503b'],
  [T.WATER]: ['#2c4b55', '#2a4852', '#30515b'],
  [T.WOOD]: ['#6b5138', '#72573c', '#664d35'],
  [T.TILE]: ['#85837a', '#8d8b81', '#7f7d74'],
  [T.CONCRETE]: ['#66675f', '#6b6c64', '#62635b'],
  [T.FIELD]: ['#57472f', '#5d4c32', '#51432c'],
  [T.SAND]: ['#a99571', '#ad9a76', '#a28d6a'],
  [T.BRIDGE]: ['#6b563e', '#715c42', '#665239'],
  [T.PARK]: ['#415336', '#465a39', '#3d4e32'],
  [T.GRAVEL]: ['#6b675c', '#706c60', '#666257'],
  [T.CROSSWALK]: ['#77756c', '#7d7b72', '#716f66']
};
function hash2(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = clamp(Math.round(r * f), 0, 255); g = clamp(Math.round(g * f), 0, 255); b = clamp(Math.round(b * f), 0, 255);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}
function resize() {
  G.W = window.innerWidth; G.H = window.innerHeight;
  G.dpr = Math.min(window.devicePixelRatio || 1, G.settings.quality === 'low' ? 1 : G.settings.quality === 'high' ? 2 : 1.6);
  canvas.width = Math.floor(G.W * G.dpr);
  canvas.height = Math.floor(G.H * G.dpr);
  canvas.style.width = G.W + 'px'; canvas.style.height = G.H + 'px';
  const mobile = G.W < 760;
  let z = mobile ? .94 : clamp(G.W / 1150, 1.0, 1.28);
  if (G.settings.quality === 'low') z *= .92;
  if (G.settings.quality === 'high') z *= 1.03;
  G.baseZoom = z; G.zoom = z;
  ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
  ctx.lineJoin = 'round';
}
function project(x, y, z = 0) {
  return {
    x: (x - y) * (TILE_W / 2) * G.zoom + G.W / 2 - G.cam.x * G.zoom + G.shakeX,
    y: (x + y) * (TILE_H / 2) * G.zoom + G.H / 2 - G.cam.y * G.zoom - z * G.zoom + G.shakeY
  };
}
function screenToWorld(sx, sy) {
  const ix = (sx - G.W / 2 + G.cam.x * G.zoom - (G.shakeX || 0)) / G.zoom;
  const iy = (sy - G.H / 2 + G.cam.y * G.zoom - (G.shakeY || 0)) / G.zoom;
  return { x: (ix / (TILE_W / 2) + iy / (TILE_H / 2)) / 2, y: (iy / (TILE_H / 2) - ix / (TILE_W / 2)) / 2 };
}
function visibleBounds(margin = 3) {
  const pts = [screenToWorld(0, 0), screenToWorld(G.W, 0), screenToWorld(0, G.H), screenToWorld(G.W, G.H)];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return {
    x0: Math.max(0, Math.floor(x0 - margin)), y0: Math.max(0, Math.floor(y0 - margin)),
    x1: Math.min(G.world.size - 1, Math.ceil(x1 + margin)), y1: Math.min(G.world.size - 1, Math.ceil(y1 + margin))
  };
}
function diamond(cx, cy) {
  const tw = TILE_W * G.zoom, th = TILE_H * G.zoom;
  ctx.beginPath();
  ctx.moveTo(cx, cy - th / 2);
  ctx.lineTo(cx + tw / 2, cy);
  ctx.lineTo(cx, cy + th / 2);
  ctx.lineTo(cx - tw / 2, cy);
  ctx.closePath();
}
function poly(points) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
}
function fillPoly(points, color, alpha = 1) {
  if (alpha !== 1) { const old = ctx.globalAlpha; ctx.globalAlpha *= alpha; poly(points); ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = old; }
  else { poly(points); ctx.fillStyle = color; ctx.fill(); }
}
function strokePoly(points, color, width = 1, alpha = 1) {
  const old = ctx.globalAlpha; ctx.globalAlpha *= alpha;
  poly(points); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); ctx.globalAlpha = old;
}
function isoBox(x, y, w, h, height, top, sideA, sideB, opts = {}) {
  const A = project(x, y, height), B = project(x + w, y, height), C = project(x + w, y + h, height), D = project(x, y + h, height);
  const A0 = project(x, y, 0), B0 = project(x + w, y, 0), C0 = project(x + w, y + h, 0), D0 = project(x, y + h, 0);
  const dA = project(x + w / 2, y + h / 2, 0);
  if (opts.shadow !== false) {
    ctx.save();
    ctx.globalAlpha *= .28;
    ctx.fillStyle = '#060806';
    ctx.beginPath();
    ctx.ellipse(dA.x + 4 * G.zoom, dA.y + 2 * G.zoom, Math.max(w, h) * 16 * G.zoom, Math.max(w, h) * 6 * G.zoom, 0, 0, TAU);
    ctx.fill(); ctx.restore();
  }
  // west/south face
  fillPoly([D, C, C0, D0], sideA);
  // east/south face
  fillPoly([C, B, B0, C0], sideB);
  fillPoly([A, B, C, D], top);
  if (opts.outline) {
    strokePoly([A, B, C, D], 'rgba(12,12,10,.32)', 1);
  }
  return { A, B, C, D, A0, B0, C0, D0 };
}
function render(dt) {
  G.shakeX = (Math.random() * 2 - 1) * G.shake;
  G.shakeY = (Math.random() * 2 - 1) * G.shake;
  ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
  ctx.fillStyle = '#11140e';
  ctx.fillRect(0, 0, G.W, G.H);
  if (!G.world) return;
  renderGround();
  renderFlatProps();
  const drawables = [];
  buildDrawables(drawables);
  drawables.sort((a, b) => a.depth - b.depth);
  for (const d of drawables) d.draw();
  renderRoofs();
  renderTargetRing();
  renderBuildGhost();
  renderLighting();
  renderWeather(dt);
  renderFloats();
  renderVignette();
}
function renderGround() {
  const b = visibleBounds(2), w = G.world;
  const t = performance.now() / 1000;
  for (let y = b.y0; y <= b.y1; y++) {
    for (let x = b.x0; x <= b.x1; x++) {
      const type = w.ground[w.idx(x, y)];
      const p = project(x + .5, y + .5, 0);
      const pal = PAL[type] || PAL[T.GRASS];
      const h = hash2(x, y);
      const color = pal[Math.floor(h * pal.length) % pal.length];
      diamond(p.x, p.y);
      ctx.fillStyle = color; ctx.fill();
      const tw = TILE_W * G.zoom, th = TILE_H * G.zoom;
      if (type === T.GRASS || type === T.GRASS2 || type === T.PARK) {
        if (h > .62 && G.zoom > .78) {
          ctx.strokeStyle = type === T.PARK ? 'rgba(96,119,70,.42)' : 'rgba(112,128,80,.32)';
          ctx.lineWidth = .7;
          ctx.beginPath();
          ctx.moveTo(p.x - 3 * G.zoom, p.y + 3 * G.zoom);
          ctx.lineTo(p.x - 1 * G.zoom, p.y - 2 * G.zoom);
          ctx.moveTo(p.x + 3 * G.zoom, p.y + 4 * G.zoom);
          ctx.lineTo(p.x + 4 * G.zoom, p.y - 1 * G.zoom);
          ctx.stroke();
        }
      } else if (type === T.ROAD || type === T.CROSSWALK) {
        // lane markings on the two main avenues
        if (type === T.ROAD) {
          if (y === 70 && x % 2 === 0 && !(x >= 68 && x <= 72)) {
            const a = project(x + .25, 70.5, 1), c = project(x + .68, 70.5, 1);
            ctx.strokeStyle = 'rgba(200,176,106,.5)'; ctx.lineWidth = 1.2 * G.zoom;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
          }
          if (x === 70 && y % 2 === 0 && !(y >= 68 && y <= 72)) {
            const a = project(70.5, y + .25, 1), c = project(70.5, y + .68, 1);
            ctx.strokeStyle = 'rgba(200,176,106,.5)'; ctx.lineWidth = 1.2 * G.zoom;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
          }
          if (h > .86) {
            ctx.strokeStyle = 'rgba(18,19,18,.28)'; ctx.lineWidth = .8;
            ctx.beginPath(); ctx.moveTo(p.x - tw * .22, p.y + th * .08); ctx.lineTo(p.x + tw * .1, p.y + th * .26); ctx.stroke();
          }
        } else {
          // crosswalk stripes
          ctx.strokeStyle = 'rgba(214,210,192,.55)'; ctx.lineWidth = 2.4 * G.zoom;
          for (let i = -1; i <= 1; i++) {
            const off = i * 6 * G.zoom;
            ctx.beginPath(); ctx.moveTo(p.x - tw * .22 + off, p.y + th * .05); ctx.lineTo(p.x + tw * .22 + off, p.y - th * .05); ctx.stroke();
          }
        }
      } else if (type === T.SIDEWALK) {
        ctx.strokeStyle = 'rgba(44,44,39,.22)'; ctx.lineWidth = .8;
        ctx.beginPath();
        ctx.moveTo(p.x - tw * .25, p.y - th * .06); ctx.lineTo(p.x, p.y + th * .24);
        ctx.stroke();
        if (h > .7) {
          ctx.strokeStyle = 'rgba(197,190,172,.16)';
          ctx.beginPath(); ctx.moveTo(p.x - tw * .3, p.y - th * .12); ctx.lineTo(p.x + tw * .18, p.y + th * .13); ctx.stroke();
        }
      } else if (type === T.WATER) {
        ctx.strokeStyle = 'rgba(135,183,192,.20)'; ctx.lineWidth = 1;
        const oy = Math.sin(t * 1.2 + x * .8 + y * .5) * 1.5;
        ctx.beginPath();
        ctx.moveTo(p.x - tw * .27, p.y + oy);
        ctx.quadraticCurveTo(p.x - tw * .08, p.y - 2 + oy, p.x + tw * .08, p.y + oy);
        ctx.quadraticCurveTo(p.x + tw * .2, p.y + 1 + oy, p.x + tw * .3, p.y + oy);
        ctx.stroke();
        if (h > .82) {
          ctx.fillStyle = 'rgba(190,220,220,.16)';
          ctx.beginPath(); ctx.ellipse(p.x + 5, p.y - 1, 4 * G.zoom, 1.4 * G.zoom, 0, 0, TAU); ctx.fill();
        }
      } else if (type === T.WOOD) {
        ctx.strokeStyle = 'rgba(41,29,19,.32)'; ctx.lineWidth = .7;
        ctx.beginPath(); ctx.moveTo(p.x - tw * .32, p.y - th * .04); ctx.lineTo(p.x, p.y + th * .28); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p.x + tw * .15, p.y - th * .24); ctx.lineTo(p.x + tw * .34, p.y - th * .1); ctx.stroke();
      } else if (type === T.TILE) {
        ctx.strokeStyle = 'rgba(45,45,40,.18)'; ctx.lineWidth = .7;
        ctx.beginPath(); ctx.moveTo(p.x, p.y - th / 2); ctx.lineTo(p.x, p.y + th / 2); ctx.stroke();
      } else if (type === T.FIELD) {
        ctx.strokeStyle = 'rgba(38,30,19,.35)'; ctx.lineWidth = 1.1 * G.zoom;
        ctx.beginPath(); ctx.moveTo(p.x - tw * .28, p.y); ctx.lineTo(p.x + tw * .24, p.y - th * .22); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p.x - tw * .2, p.y + th * .18); ctx.lineTo(p.x + tw * .3, p.y - th * .03); ctx.stroke();
      } else if (type === T.BRIDGE) {
        ctx.strokeStyle = 'rgba(36,26,17,.38)'; ctx.lineWidth = .9;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(p.x - tw * .3, p.y + i * 4 * G.zoom);
          ctx.lineTo(p.x + tw * .3, p.y + i * 4 * G.zoom - th * .24);
          ctx.stroke();
        }
      } else if (type === T.GRAVEL || type === T.DIRT) {
        if (h > .55) {
          ctx.fillStyle = 'rgba(28,24,18,.22)';
          ctx.beginPath(); ctx.arc(p.x + (h - .5) * tw * .4, p.y + (h - .5) * th * .3, 1.2 * G.zoom, 0, TAU); ctx.fill();
        }
      }
    }
  }
  // decals (blood, tire marks) on the ground
  for (const d of G.decals) {
    const p = project(d.x, d.y, 0);
    ctx.save(); ctx.globalAlpha *= d.alpha;
    ctx.fillStyle = d.color;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, d.r * 28 * G.zoom, d.r * 11 * G.zoom, hash2(Math.floor(d.x * 10), Math.floor(d.y * 10)) * 3, 0, TAU); ctx.fill();
    ctx.restore();
  }
  for (const c of G.corpses) drawCorpse(c);
}
function renderFlatProps() {
  const b = visibleBounds(3);
  for (const pr of G.world.props) {
    if (pr.x < b.x0 - 2 || pr.x > b.x1 + 2 || pr.y < b.y0 - 2 || pr.y > b.y1 + 2) continue;
    if (pr.kind === 'rug') {
      const p = project(pr.x + .5, pr.y + .5, 1);
      ctx.save(); ctx.globalAlpha *= .8;
      diamond(p.x, p.y);
      ctx.fillStyle = pr.color || '#77504a'; ctx.fill();
      ctx.strokeStyle = 'rgba(240,212,170,.18)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }
  }
  // placement grid hint when building
  if (G.placing && G.buildTarget) {
    const p = project(G.buildTarget.x + .5, G.buildTarget.y + .5, 0);
    diamond(p.x, p.y);
    ctx.fillStyle = G.buildTarget.valid ? 'rgba(120,170,90,.22)' : 'rgba(190,70,55,.22)';
    ctx.fill();
    ctx.strokeStyle = G.buildTarget.valid ? 'rgba(160,210,120,.8)' : 'rgba(230,110,90,.8)';
    ctx.lineWidth = 1.5; ctx.stroke();
  }
}

function buildDrawables(out) {
  const b = visibleBounds(3), w = G.world;
  const inside = playerInsideBuilding();
  for (let y = b.y0; y <= b.y1; y++) {
    for (let x = b.x0; x <= b.x1; x++) {
      const wt = w.wallType[w.idx(x, y)];
      if (!wt) continue;
      const info = w.wallInfo.get(x + ',' + y);
      if (!info) continue;
      out.push({ depth: x + y + .56, draw: () => drawWall(x, y, info, inside) });
    }
  }
  for (const pr of w.props) {
    if (pr.kind === 'rug') continue;
    if (pr.x + pr.w < b.x0 - 2 || pr.x > b.x1 + 2 || pr.y + pr.h < b.y0 - 2 || pr.y > b.y1 + 2) continue;
    out.push({ depth: pr.x + pr.w / 2 + pr.y + pr.h / 2, draw: () => drawProp(pr) });
  }
  for (const s of G.structures) {
    if (s.x < b.x0 - 2 || s.x > b.x1 + 2 || s.y < b.y0 - 2 || s.y > b.y1 + 2) continue;
    out.push({ depth: s.x + .5 + s.y + .5, draw: () => drawStructure(s) });
  }
  for (const v of G.vehicles) {
    if (v.x < b.x0 - 3 || v.x > b.x1 + 3 || v.y < b.y0 - 3 || v.y > b.y1 + 3) continue;
    out.push({ depth: v.x + v.y + .2, draw: () => drawVehicle(v) });
  }
  for (const z of G.zombies) {
    if (z.dead) continue;
    if (z.x < b.x0 - 2 || z.x > b.x1 + 2 || z.y < b.y0 - 2 || z.y > b.y1 + 2) continue;
    out.push({ depth: z.x + z.y, draw: () => drawZombie(z) });
  }
  for (const pk of G.pickups) {
    if (pk.x < b.x0 - 1 || pk.x > b.x1 + 1 || pk.y < b.y0 - 1 || pk.y > b.y1 + 1) continue;
    out.push({ depth: pk.x + pk.y, draw: () => drawPickup(pk) });
  }
  const p = G.player;
  if (p && !p.inVehicle) out.push({ depth: p.x + p.y + .06, draw: () => drawPlayer(p) });
}
function drawWall(x, y, info, inside) {
  const b = G.world.buildings.find(bb => bb.id === info.buildingId);
  if (!b) return;
  if (info.kind === 'door' && b.doorOpen) {
    // threshold / frame
    const p = project(x + .5, y + .5, 0);
    diamond(p.x, p.y);
    ctx.fillStyle = 'rgba(35,26,17,.5)'; ctx.fill();
    return;
  }
  const isIn = inside && inside.id === b.id;
  const alpha = isIn ? .48 : 1;
  const tw = TILE_W * G.zoom, th = TILE_H * G.zoom, h = WALL_H * G.zoom;
  const c = project(x + .5, y + .5, 0);
  const N = [c.x, c.y - th / 2 - h], E = [c.x + tw / 2, c.y - h], S = [c.x, c.y + th / 2 - h], Wc = [c.x - tw / 2, c.y - h];
  const S0 = [c.x, c.y + th / 2], W0 = [c.x - tw / 2, c.y], E0 = [c.x + tw / 2, c.y];
  const base = b.wallColor;
  ctx.save();
  ctx.globalAlpha *= alpha;
  fillPoly([Wc, S, S0, W0], shade(base, .68));
  fillPoly([S, E, E0, S0], shade(base, .84));
  // top
  fillPoly([N, E, S, Wc], info.kind === 'window' ? shade(base, 1.06) : shade(base, 1.12));
  // top edge highlight
  strokePoly([N, E, S, Wc], 'rgba(255,244,212,.08)', 1);
  if (info.kind === 'window') {
    drawWindowFace(S, E, S0, E0, 1);
    drawWindowFace(Wc, S, W0, S0, .8);
  }
  if (info.kind === 'door') {
    // closed door panel
    if (y === b.y + b.h - 1) drawDoorFace(S, E, S0, E0);
    else if (x === b.x + b.w - 1) drawDoorFace(Wc, S, W0, S0);
    else if (x === b.x) drawDoorFace(Wc, S, W0, S0);
    else drawDoorFace(S, E, S0, E0);
  }
  // grime
  if (hash2(x, y) > .55) {
    ctx.strokeStyle = 'rgba(30,28,22,.2)'; ctx.lineWidth = .7;
    ctx.beginPath(); ctx.moveTo(Wc[0] + 3, Wc[1] + 4); ctx.lineTo(Wc[0] + 2, W0[1] - 3); ctx.stroke();
  }
  ctx.restore();
}
function drawWindowFace(a, b2, a0, b0, alpha) {
  const mid = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];
  const x1 = mid(a, b2, .18), x2 = mid(a, b2, .82);
  const yTop = .2, yBot = .82;
  const bl = mid(a0, b0, .18), br = mid(a0, b0, .82);
  const p1 = [x1[0], a[1] + (a0[1] - a[1]) * yTop];
  const p2 = [x2[0], b2[1] + (b0[1] - b2[1]) * yTop];
  const p3 = [x2[0], b2[1] + (b0[1] - b2[1]) * yBot];
  const p4 = [x1[0], a[1] + (a0[1] - a[1]) * yBot];
  ctx.save(); ctx.globalAlpha *= alpha;
  fillPoly([p1, p2, p3, p4], 'rgba(75,104,112,.72)');
  strokePoly([p1, p2, p3, p4], 'rgba(40,40,33,.7)', 1);
  ctx.strokeStyle = 'rgba(218,222,204,.22)'; ctx.lineWidth = .6;
  ctx.beginPath(); ctx.moveTo((p1[0] + p4[0]) / 2, p1[1] + 2); ctx.lineTo((p2[0] + p3[0]) / 2, p2[1] + 2); ctx.stroke();
  ctx.restore();
}
function drawDoorFace(a, b2, a0, b0) {
  const p1 = [lerp(a[0], b2[0], .22), lerp(a[1], b2[1], .22)];
  const p2 = [lerp(a[0], b2[0], .78), lerp(a[1], b2[1], .78)];
  const p3 = [p2[0], lerp(p2[1], b0[1], .88)];
  const p4 = [p1[0], lerp(p1[1], a0[1], .88)];
  fillPoly([p1, p2, p3, p4], '#5f4632');
  strokePoly([p1, p2, p3, p4], 'rgba(36,24,16,.6)', 1);
  ctx.fillStyle = 'rgba(213,178,98,.65)';
  ctx.beginPath(); ctx.arc(p3[0] - 4, p3[1] - 7, 1.5, 0, TAU); ctx.fill();
}
// Foliage south of / next to the player is faded so characters never disappear
// behind a canopy. Trunks and small props keep their full opacity.
function isFoliage(kind) { return kind === 'tree' || kind === 'pine' || kind === 'bush'; }
function playerNearFoliage(pr) {
  const pl = G.player;
  if (!pl || G.ui.panel) return false;
  const cx = pr.x + pr.w / 2, cy = pr.y + pr.h / 2;
  const d = Math.hypot(pl.x - cx, pl.y - cy);
  if (d > 2.35) return false;
  return pl.x + pl.y < cx + cy + .35;
}
function drawProp(pr) {
  const x = pr.x, y = pr.y, w = pr.w, h = pr.h;
  const p = project(x + w / 2, y + h / 2, 0);
  const k = pr.kind;
  const fade = isFoliage(k) && playerNearFoliage(pr);
  if (fade) { ctx.save(); ctx.globalAlpha *= .3; }
  switch (k) {
    case 'tree': drawTree(pr); break;
    case 'pine': drawPine(pr); break;
    case 'bush': {
      const s = 10 * G.zoom;
      ctx.save(); ctx.globalAlpha *= .25; ctx.fillStyle = '#060806';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, s * 1.4, s * .5, 0, 0, TAU); ctx.fill(); ctx.restore();
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * TAU;
        ctx.fillStyle = shade(pr.color, .8 + i * .06);
        ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * s * .5, p.y - 5 * G.zoom + Math.sin(a) * s * .28, s * (.6 + hash2(x + i, y) * .25), 0, TAU); ctx.fill();
      }
      break;
    }
    case 'rock': {
      const s = 6 * G.zoom;
      ctx.fillStyle = 'rgba(0,0,0,.24)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, s * 1.5, s * .5, 0, 0, TAU); ctx.fill();
      fillPoly([[p.x - s, p.y], [p.x - s * .4, p.y - s * 1.2], [p.x + s * .7, p.y - s * .8], [p.x + s, p.y + 1], [p.x + s * .2, p.y + s * .5]], '#76736a');
      fillPoly([[p.x - s * .4, p.y - s * 1.2], [p.x + s * .7, p.y - s * .8], [p.x + s * .1, p.y - s * .1]], '#8c897f');
      break;
    }
    case 'bed': {
      isoBox(x, y, w, h, 7, '#8f6d4e', '#5f4834', '#4a3727');
      const m = isoBox(x + .05, y + .1, w - .1, h - .3, 10, '#c9c0a8', '#7e7360', '#6d6252', { shadow: false });
      fillPoly([m.A, m.B, m.C, m.D], '#b6a98f');
      const hp = project(x + w / 2, y + .38, 13);
      ctx.fillStyle = '#ddd3bb'; ctx.beginPath(); ctx.ellipse(hp.x, hp.y, 7 * G.zoom, 3.5 * G.zoom, 0, 0, TAU); ctx.fill();
      const bp = project(x + w / 2, y + h - .55, 12);
      ctx.fillStyle = '#7e4c43'; ctx.beginPath(); ctx.ellipse(bp.x, bp.y, 9 * G.zoom, 4.5 * G.zoom, 0, 0, TAU); ctx.fill();
      break;
    }
    case 'table': {
      isoBox(x + .08, y + .1, w - .16, h - .2, 13, '#8d6a45', '#5c432b', '#4b3623');
      break;
    }
    case 'counter': {
      isoBox(x, y, w, h, 16, '#96754f', '#634830', '#523a26');
      const tp = project(x + w / 2, y + h / 2, 17);
      ctx.strokeStyle = 'rgba(227,199,143,.25)'; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.moveTo(tp.x - 9 * G.zoom, tp.y); ctx.lineTo(tp.x + 9 * G.zoom, tp.y); ctx.stroke();
      break;
    }
    case 'workbench': {
      isoBox(x, y, w, h, 15, '#7a5a3a', '#513a26', '#432f1f');
      const tp = project(x + w / 2, y + h / 2, 18);
      ctx.fillStyle = '#aeb5b3'; ctx.fillRect(tp.x - 6, tp.y - 4, 7, 3);
      ctx.fillStyle = '#6e4633'; ctx.fillRect(tp.x + 1, tp.y - 3, 8, 2);
      break;
    }
    case 'desk': {
      isoBox(x, y, w, h, 14, '#806044', '#523a28', '#44301f');
      const tp = project(x + w / 2, y + h / 2, 16);
      ctx.fillStyle = '#c7c0a9'; ctx.fillRect(tp.x - 7, tp.y - 6, 8, 5);
      break;
    }
    case 'chair': {
      isoBox(x + .12, y + .12, .76, .76, 8, '#71533a', '#4f3727', '#402c1f', { shadow: false });
      break;
    }
    case 'sofa': {
      isoBox(x, y, w, h, 10, pr.color || '#5e6152', '#3f4539', '#343a2f');
      const top = project(x + w / 2, y + h / 2, 12);
      ctx.strokeStyle = 'rgba(20,20,16,.25)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(top.x - w * 10 * G.zoom, top.y); ctx.lineTo(top.x, top.y + h * 5 * G.zoom); ctx.stroke();
      break;
    }
    case 'fridge': {
      isoBox(x, y, w, h, 28, '#b6c0bd', '#7f8986', '#6b7572');
      const fp = project(x + w / 2, y + h / 2, 17);
      ctx.strokeStyle = 'rgba(54,60,58,.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(fp.x - 7 * G.zoom, fp.y - 5 * G.zoom); ctx.lineTo(fp.x + 7 * G.zoom, fp.y + 2 * G.zoom); ctx.stroke();
      ctx.fillStyle = 'rgba(40,44,42,.55)'; ctx.fillRect(fp.x + 4, fp.y - 1, 2, 6);
      break;
    }
    case 'cabinet': {
      isoBox(x, y, w, h, 23, '#83613f', '#553d29', '#463122');
      const fp = project(x + w / 2, y + h / 2, 12);
      ctx.strokeStyle = 'rgba(41,29,18,.45)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(fp.x, fp.y - 6 * G.zoom); ctx.lineTo(fp.x, fp.y + 6 * G.zoom); ctx.stroke();
      ctx.fillStyle = 'rgba(222,186,110,.6)'; ctx.beginPath(); ctx.arc(fp.x - 3, fp.y, 1.3, 0, TAU); ctx.fill();
      break;
    }
    case 'shelf': {
      isoBox(x, y, w, h, 25, '#6e5538', '#493723', '#3b2c1c');
      const fp = project(x + w / 2, y + h / 2, 0);
      for (let i = 0; i < 3; i++) {
        const sp = project(x + w / 2, y + h / 2, 6 + i * 6);
        ctx.strokeStyle = 'rgba(203,176,125,.28)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(sp.x - tw(0.36), sp.y); ctx.lineTo(sp.x + tw(0.36), sp.y + th(0.18)); ctx.stroke();
      }
      for (let i = 0; i < 3; i++) {
        const sp = project(x + .32 + i * .18, y + h / 2, 10 + (i % 2) * 6);
        ctx.fillStyle = ['#8a3f34', '#3f5f6b', '#7b6e42'][i];
        ctx.fillRect(sp.x - 2, sp.y - 3, 4, 4);
      }
      break;
    }
    case 'locker':
    case 'locker_med': {
      isoBox(x, y, w, h, 26, k === 'locker_med' ? '#b4c3c3' : '#68777c', '#455156', '#394348');
      const fp = project(x + w / 2, y + h / 2, 13);
      ctx.strokeStyle = 'rgba(30,35,35,.5)'; ctx.lineWidth = .8;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(fp.x + i * 4, fp.y - 7); ctx.lineTo(fp.x + i * 4, fp.y + 7); ctx.stroke(); }
      break;
    }
    case 'crate': {
      isoBox(x + .03, y + .06, w - .06, h - .12, 16, '#9b784c', '#69502f', '#553f26');
      const cp = project(x + w / 2, y + h / 2, 17);
      ctx.strokeStyle = 'rgba(60,42,24,.45)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cp.x - 8, cp.y); ctx.lineTo(cp.x + 8, cp.y); ctx.stroke();
      break;
    }
    case 'toolbox': {
      isoBox(x + .1, y + .15, w - .2, h - .3, 12, '#a84536', '#6c2d25', '#55231d');
      const tp = project(x + w / 2, y + h / 2, 13);
      ctx.fillStyle = '#c7bda9'; ctx.fillRect(tp.x - 5, tp.y - 2, 10, 2);
      break;
    }
    case 'dumpster': {
      isoBox(x, y, w, h, 18, '#4e5c4a', '#354135', '#2b352b');
      const dp = project(x + w / 2, y + h / 2, 19);
      ctx.fillStyle = 'rgba(20,24,19,.5)'; ctx.fillRect(dp.x - 12, dp.y - 3, 24, 3);
      ctx.strokeStyle = 'rgba(160,165,140,.2)'; ctx.lineWidth = .8; ctx.strokeRect(dp.x - 10, dp.y - 8, 20, 6);
      break;
    }
    case 'barrel': {
      drawBarrel(x + .5, y + .5, pr.color, 18);
      break;
    }
    case 'streetlight': {
      const base = project(x + .5, y + .5, 0);
      ctx.strokeStyle = '#4f5553'; ctx.lineWidth = 2.2 * G.zoom;
      ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(base.x, base.y - 62 * G.zoom); ctx.stroke();
      const lampP = project(x + .5, y + .5, 62);
      ctx.strokeStyle = '#4f5553'; ctx.lineWidth = 1.8 * G.zoom;
      ctx.beginPath(); ctx.moveTo(lampP.x, lampP.y); ctx.lineTo(lampP.x + 10 * G.zoom, lampP.y - 2 * G.zoom); ctx.stroke();
      ctx.fillStyle = '#d9b15a'; ctx.beginPath(); ctx.ellipse(lampP.x + 12 * G.zoom, lampP.y, 4 * G.zoom, 2 * G.zoom, 0, 0, TAU); ctx.fill();
      if (isNight()) {
        const g = ctx.createRadialGradient(lampP.x + 12 * G.zoom, lampP.y, 0, lampP.x + 12 * G.zoom, lampP.y, 30 * G.zoom);
        g.addColorStop(0, 'rgba(255,201,105,.35)'); g.addColorStop(1, 'rgba(255,201,105,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lampP.x + 12 * G.zoom, lampP.y, 30 * G.zoom, 0, TAU); ctx.fill();
      }
      break;
    }
    case 'trafficlight': {
      const base = project(x + .5, y + .5, 0);
      ctx.strokeStyle = '#393f3f'; ctx.lineWidth = 2 * G.zoom;
      ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(base.x, base.y - 44 * G.zoom); ctx.stroke();
      ctx.fillStyle = '#282e2d'; ctx.fillRect(base.x - 4, base.y - 48 * G.zoom, 8, 16);
      ctx.fillStyle = '#a54332'; ctx.beginPath(); ctx.arc(base.x, base.y - 43 * G.zoom, 2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#5a6b46'; ctx.beginPath(); ctx.arc(base.x, base.y - 38 * G.zoom, 2, 0, TAU); ctx.fill();
      break;
    }
    case 'fence': {
      isoBox(x + .08, y + .35, w - .16, h - .7, 11, '#826b4a', '#58492f', '#473a26', { shadow: false });
      break;
    }
    case 'hay': {
      isoBox(x + .05, y + .08, w - .1, h - .16, 13, '#b49b58', '#7e6a39', '#6a592f');
      break;
    }
    case 'bench': {
      isoBox(x, y + .1, w, h - .2, 8, '#755c40', '#4c3b26', '#3e2f1f');
      break;
    }
    case 'mailbox': {
      const mp = project(x + .5, y + .5, 0);
      ctx.strokeStyle = '#5f4b37'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(mp.x, mp.y); ctx.lineTo(mp.x, mp.y - 18 * G.zoom); ctx.stroke();
      ctx.fillStyle = '#7a4d3e'; ctx.fillRect(mp.x - 5 * G.zoom, mp.y - 22 * G.zoom, 10 * G.zoom, 7 * G.zoom);
      break;
    }
    case 'well': {
      const wp = project(x + .5, y + .5, 0);
      ctx.fillStyle = '#5e5a50'; ctx.beginPath(); ctx.ellipse(wp.x, wp.y, 13 * G.zoom, 7 * G.zoom, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3d4a4e'; ctx.beginPath(); ctx.ellipse(wp.x, wp.y - 2, 9 * G.zoom, 4.5 * G.zoom, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#6b6252'; ctx.lineWidth = 1.5 * G.zoom;
      ctx.beginPath(); ctx.moveTo(wp.x - 9 * G.zoom, wp.y - 1); ctx.lineTo(wp.x - 9 * G.zoom, wp.y - 20 * G.zoom); ctx.lineTo(wp.x + 9 * G.zoom, wp.y - 20 * G.zoom); ctx.lineTo(wp.x + 9 * G.zoom, wp.y - 1); ctx.stroke();
      ctx.fillStyle = '#7b5239'; ctx.fillRect(wp.x - 8 * G.zoom, wp.y - 22 * G.zoom, 16 * G.zoom, 4 * G.zoom);
      break;
    }
    case 'dockpost': {
      const dp = project(x + .5, y + .5, 0);
      ctx.strokeStyle = '#5c4630'; ctx.lineWidth = 2 * G.zoom;
      ctx.beginPath(); ctx.moveTo(dp.x, dp.y + 1); ctx.lineTo(dp.x, dp.y - 10 * G.zoom); ctx.stroke();
      break;
    }
    case 'sink': {
      isoBox(x + .05, y + .1, w - .1, h - .2, 14, '#c2c7c2', '#858b87', '#6e7470');
      const sp = project(x + w / 2, y + h / 2, 15);
      ctx.fillStyle = '#69716f'; ctx.fillRect(sp.x - 3, sp.y - 1, 6, 3);
      ctx.strokeStyle = '#9ba3a0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sp.x, sp.y - 1); ctx.lineTo(sp.x, sp.y - 6); ctx.stroke();
      break;
    }
    default: {
      isoBox(x, y, w, h, 10, pr.color, shade(pr.color, .65), shade(pr.color, .52));
    }
  }
  if (pr.containerId) {
    const c = G.containers.get(pr.containerId);
    if (c && !c.searched && c.items.length) {
      const cp = project(x + w / 2, y + h / 2, 34 + Math.sin(performance.now() / 380) * 2);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(240,193,108,.85)';
      ctx.beginPath(); ctx.arc(cp.x, cp.y, 1.7 * G.zoom, 0, TAU); ctx.fill();
      ctx.globalAlpha = .18; ctx.beginPath(); ctx.arc(cp.x, cp.y, 6 * G.zoom, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }
  if (fade) ctx.restore();
}
function tw(v) { return v * TILE_W * G.zoom; }
function th(v) { return v * TILE_H * G.zoom; }
function drawBarrel(x, y, color, height) {
  const p = project(x, y, 0);
  const s = 9 * G.zoom;
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 1, s * 1.3, s * .45, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = shade(color, .7); ctx.beginPath(); ctx.ellipse(p.x, p.y - height * .5 * G.zoom, s * .9, s * .38, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = color; ctx.fillRect(p.x - s * .9, p.y - height * G.zoom, s * 1.8, height * .55 * G.zoom);
  ctx.fillStyle = shade(color, 1.1); ctx.beginPath(); ctx.ellipse(p.x, p.y - height * G.zoom, s * .9, s * .38, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(20,20,15,.3)'; ctx.lineWidth = .8;
  for (const k of [.3, .7]) { ctx.beginPath(); ctx.ellipse(p.x, p.y - height * G.zoom * k, s * .9, s * .35, 0, 0, TAU); ctx.stroke(); }
}
function drawTree(pr) {
  const p = project(pr.x + .5, pr.y + .5, 0);
  const sway = Math.sin(performance.now() / 1800 + pr.x) * 1.5 * G.zoom;
  const s = (15 + hash2(pr.x, pr.y) * 6) * G.zoom;
  ctx.save(); ctx.globalAlpha *= .25; ctx.fillStyle = '#050705';
  ctx.beginPath(); ctx.ellipse(p.x + 5, p.y + 2, s * 1.25, s * .42, 0, 0, TAU); ctx.fill(); ctx.restore();
  ctx.strokeStyle = '#4b3625'; ctx.lineWidth = 3.2 * G.zoom; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(p.x + 2, p.y - s * 1.4, p.x + sway, p.y - s * 2.4); ctx.stroke();
  const canopy = [
    [p.x + sway - s * .8, p.y - s * 2.1, s * .9, shade(pr.color || '#34503a', .78)],
    [p.x + sway + s * .75, p.y - s * 2.2, s * .85, shade(pr.color || '#34503a', .9)],
    [p.x + sway, p.y - s * 2.95, s * 1.05, shade(pr.color || '#34503a', 1.05)],
    [p.x + sway - s * .3, p.y - s * 2.55, s * .75, shade(pr.color || '#34503a', 1.15)]
  ];
  for (const [cx, cy, r, col] of canopy) {
    const g = ctx.createRadialGradient(cx - r * .3, cy - r * .35, r * .1, cx, cy, r);
    g.addColorStop(0, shade(col, 1.18)); g.addColorStop(1, shade(col, .72));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
  }
}
function drawPine(pr) {
  const p = project(pr.x + .5, pr.y + .5, 0);
  const s = (14 + hash2(pr.x + 2, pr.y) * 5) * G.zoom;
  ctx.save(); ctx.globalAlpha *= .25; ctx.fillStyle = '#050705';
  ctx.beginPath(); ctx.ellipse(p.x + 4, p.y + 2, s * .95, s * .4, 0, 0, TAU); ctx.fill(); ctx.restore();
  ctx.strokeStyle = '#453322'; ctx.lineWidth = 2.6 * G.zoom;
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - s * 2.7); ctx.stroke();
  for (let i = 0; i < 3; i++) {
    const yy = p.y - s * (1 + i * .7);
    const wdt = s * (1.35 - i * .3);
    fillPoly([[p.x, yy - s * 1.1], [p.x + wdt, yy + s * .45], [p.x - wdt, yy + s * .45]], shade(pr.color || '#2f4a34', .85 + i * .1));
  }
}
function drawVehicle(v) {
  const p = project(v.x, v.y, 0);
  const z = G.zoom;
  const speedBob = Math.abs(v.speed) > .1 ? Math.sin(performance.now() / 90) * .6 : 0;
  ctx.save();
  ctx.globalAlpha *= .32; ctx.fillStyle = '#030403';
  ctx.beginPath(); ctx.ellipse(p.x + 4, p.y + 4, 28 * z, 12 * z, v.angle, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(p.x, p.y + speedBob);
  ctx.scale(z, z * .58);
  ctx.rotate(v.angle);
  // wheels
  ctx.fillStyle = '#1c1c1b';
  for (const [wx, wy] of [[-14, -9], [14, -9], [-14, 9], [14, 9]]) ctx.fillRect(wx - 4, wy - 2, 8, 4);
  const L = v.type === 'van' ? 27 : v.type === 'pickup' ? 25 : 24;
  const W = v.type === 'van' ? 12 : 10;
  ctx.fillStyle = shade(v.color, .75);
  ctx.beginPath(); ctx.roundRect(-L, -W, L * 2, W * 2, 5); ctx.fill();
  ctx.fillStyle = v.color;
  ctx.beginPath(); ctx.roundRect(-L + 1.5, -W + 1.2, L * 2 - 3, W * 2 - 2.4, 4); ctx.fill();
  // cabin
  ctx.fillStyle = '#26343a';
  if (v.type === 'pickup') {
    ctx.beginPath(); ctx.roundRect(-6, -W + 2, 12, W * 2 - 4, 2); ctx.fill();
    ctx.fillStyle = shade(v.color, 1.08); ctx.fillRect(8, -W + 2, 13, W * 2 - 4);
  } else {
    ctx.beginPath(); ctx.roundRect(-8, -W + 2.2, 16, W * 2 - 4.4, 3); ctx.fill();
    ctx.strokeStyle = 'rgba(170,200,207,.2)'; ctx.lineWidth = .8; ctx.stroke();
  }
  // lights
  ctx.fillStyle = '#e8d39a'; ctx.fillRect(L - 2, -W + 2, 2, 3); ctx.fillRect(L - 2, W - 5, 2, 3);
  ctx.fillStyle = '#a74232'; ctx.fillRect(-L, -W + 2, 1.6, 3); ctx.fillRect(-L, W - 5, 1.6, 3);
  // rust
  ctx.fillStyle = 'rgba(72,47,30,.35)'; ctx.fillRect(-L * .3, W - 2, 7, 2.5); ctx.fillRect(L * .2, -W + 1, 5, 1.5);
  ctx.restore();
  if (v.fuel <= 0 && Math.hypot(G.player.x - v.x, G.player.y - v.y) < 4) {
    const lp = project(v.x, v.y, 18);
    ctx.fillStyle = 'rgba(232,196,115,.8)'; ctx.font = `${9 * G.zoom}px "DejaVu Sans Mono", monospace`; ctx.textAlign = 'center';
    ctx.fillText('SEM COMBUSTÍVEL', lp.x, lp.y);
    ctx.textAlign = 'left';
  }
}

/* ---------------------------------------------------------------- characters */
function screenDirection(a) {
  const sx = Math.cos(a) - Math.sin(a);
  const sy = (Math.cos(a) + Math.sin(a)) * .5;
  const m = Math.hypot(sx, sy) || 1;
  return { x: sx / m, y: sy / m };
}
function drawShadow(x, y, rx, ry, alpha = .3) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = '#050705';
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
  ctx.restore();
}
function drawPlayer(p) {
  const ground = project(p.x, p.y, 0);
  const z = G.zoom;
  const dir = screenDirection(p.facing);
  const walk = p.moving ? Math.sin(p.walkPhase) : 0;
  const bob = p.moving ? Math.abs(Math.cos(p.walkPhase)) * 1.4 * z : Math.sin(performance.now() / 900) * .45 * z;
  drawShadow(ground.x, ground.y + 1, 10 * z, 4.2 * z, .32);
  ctx.save();
  ctx.translate(ground.x, ground.y - bob);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // Legs
  const legSwing = walk * 2.4 * z;
  ctx.strokeStyle = '#2f3230'; ctx.lineWidth = 3.1 * z;
  ctx.beginPath(); ctx.moveTo(-1.8 * z, -10 * z); ctx.lineTo(-2.1 * z + dir.x * legSwing, -1.4 * z + dir.y * legSwing * .4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(1.8 * z, -10 * z); ctx.lineTo(2.1 * z - dir.x * legSwing, -1.4 * z - dir.y * legSwing * .4); ctx.stroke();
  ctx.fillStyle = '#292a26';
  ctx.beginPath(); ctx.ellipse(-2.1 * z + dir.x * legSwing, -1.2 * z + dir.y * legSwing * .4, 2.4 * z, 1.4 * z, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(2.1 * z - dir.x * legSwing, -1.2 * z - dir.y * legSwing * .4, 2.4 * z, 1.4 * z, 0, 0, TAU); ctx.fill();
  // Backpack
  if (p.clothing?.backpack) {
    ctx.fillStyle = '#3d5760';
    ctx.beginPath(); ctx.roundRect(-5 * z - dir.x * 3 * z, -25 * z - dir.y * 2 * z, 9 * z, 13 * z, 2.4 * z); ctx.fill();
    ctx.strokeStyle = 'rgba(160,188,190,.22)'; ctx.lineWidth = .7 * z; ctx.stroke();
  }
  // Torso / jacket
  const coat = p.clothing?.jacket;
  ctx.fillStyle = coat ? '#45584f' : '#62513d';
  ctx.beginPath();
  ctx.moveTo(-5.2 * z, -11 * z);
  ctx.quadraticCurveTo(-6.4 * z, -21 * z, -4.6 * z, -25 * z);
  ctx.lineTo(4.6 * z, -25 * z);
  ctx.quadraticCurveTo(6.4 * z, -21 * z, 5.2 * z, -11 * z);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(235,218,180,.13)'; ctx.lineWidth = .7 * z; ctx.stroke();
  // coat opening
  ctx.strokeStyle = 'rgba(30,26,20,.5)'; ctx.lineWidth = .8 * z;
  ctx.beginPath(); ctx.moveTo(dir.x * 1.2 * z, -24 * z); ctx.lineTo(dir.x * 1.5 * z, -12 * z); ctx.stroke();
  // Arms
  const armSwing = walk * 3.2 * z;
  ctx.strokeStyle = coat ? '#3e4f47' : '#564733'; ctx.lineWidth = 2.7 * z;
  ctx.beginPath(); ctx.moveTo(-4.5 * z, -23 * z); ctx.lineTo(-6 * z - dir.x * armSwing, -15 * z - dir.y * armSwing); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(4.5 * z, -23 * z); ctx.lineTo(6 * z + dir.x * armSwing, -15 * z + dir.y * armSwing); ctx.stroke();
  ctx.fillStyle = '#b48a6a';
  ctx.beginPath(); ctx.arc(-6 * z - dir.x * armSwing, -14.6 * z - dir.y * armSwing, 1.5 * z, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(6 * z + dir.x * armSwing, -14.6 * z + dir.y * armSwing, 1.5 * z, 0, TAU); ctx.fill();
  // Head
  const hx = dir.x * 1.1 * z, hy = -30.5 * z;
  ctx.fillStyle = '#b98a68'; ctx.beginPath(); ctx.arc(hx, hy, 4.4 * z, 0, TAU); ctx.fill();
  ctx.fillStyle = p.clothing?.jacket ? '#3b3026' : '#4b3b2b';
  ctx.beginPath(); ctx.arc(hx - dir.x * .6 * z, hy - 1.3 * z, 4.3 * z, Math.PI * .95, Math.PI * 2.05); ctx.fill();
  ctx.fillStyle = 'rgba(30,24,19,.6)';
  ctx.beginPath(); ctx.arc(hx + dir.x * 2.1 * z, hy + .4 * z, .6 * z, 0, TAU); ctx.fill();
  // Neck scarf
  ctx.fillStyle = '#7d4c3c'; ctx.fillRect(-2.6 * z + hx * .3, -27 * z, 5.2 * z, 1.4 * z);
  // Moonlit rim keeps the survivor readable against dark asphalt and grass.
  if (nightFactor() > .25) {
    ctx.strokeStyle = 'rgba(246,232,198,.5)'; ctx.lineWidth = 1 * z;
    ctx.beginPath();
    ctx.moveTo(-5.2 * z, -11 * z);
    ctx.quadraticCurveTo(-6.4 * z, -21 * z, -4.6 * z, -25 * z);
    ctx.lineTo(4.6 * z, -25 * z);
    ctx.quadraticCurveTo(6.4 * z, -21 * z, 5.2 * z, -11 * z);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(hx, hy, 4.55 * z, 0, TAU); ctx.stroke();
  }
  // Weapon
  if (p.weapon) {
    const def = itemDef(p.weapon.id);
    const swing = p.attackAnim > 0 ? (-.85 + (1 - p.attackAnim) * 1.7) : .3;
    const ang = Math.atan2(dir.y, dir.x) + swing;
    const hx2 = 6 * z + dir.x * 1.4 * z, hy2 = -16 * z + dir.y * .8 * z;
    ctx.save(); ctx.translate(hx2, hy2); ctx.rotate(ang);
    if (def.icon === 'knife') {
      ctx.strokeStyle = '#8b8578'; ctx.lineWidth = 1.6 * z;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(8 * z, 0); ctx.stroke();
      ctx.fillStyle = '#c8d0d0'; ctx.beginPath(); ctx.moveTo(8 * z, -1.2 * z); ctx.lineTo(15 * z, 0); ctx.lineTo(8 * z, 1.2 * z); ctx.closePath(); ctx.fill();
    } else if (def.icon === 'axe') {
      ctx.strokeStyle = '#7c5c3c'; ctx.lineWidth = 2.2 * z;
      ctx.beginPath(); ctx.moveTo(-1 * z, 0); ctx.lineTo(15 * z, 0); ctx.stroke();
      ctx.fillStyle = '#adb4b2'; ctx.beginPath(); ctx.moveTo(12 * z, -1 * z); ctx.lineTo(19 * z, -5 * z); ctx.lineTo(20 * z, 3 * z); ctx.lineTo(13 * z, 4 * z); ctx.closePath(); ctx.fill();
    } else {
      ctx.strokeStyle = def.icon === 'crowbar' ? '#8e3a2d' : '#9c7748'; ctx.lineWidth = 2.2 * z;
      ctx.beginPath(); ctx.moveTo(-1 * z, 0); ctx.lineTo(17 * z, 0); ctx.stroke();
      ctx.fillStyle = def.icon === 'crowbar' ? '#b9543f' : '#c3a16b';
      ctx.beginPath(); ctx.arc(17 * z, 0, 1.5 * z, 0, TAU); ctx.fill();
    }
    ctx.restore();
    if (p.attackAnim > .2) {
      ctx.save(); ctx.globalAlpha *= p.attackAnim * .3;
      ctx.strokeStyle = '#f0d4a0'; ctx.lineWidth = 1.4 * z;
      ctx.beginPath(); ctx.arc(0, -18 * z, 18 * z, -1.5 + (1 - p.attackAnim) * 2.1, 1.3 + (1 - p.attackAnim) * 2.1); ctx.stroke();
      ctx.restore();
    }
  }
  // Flashlight glint
  if (p.flashlightOn) {
    ctx.fillStyle = '#f2d27d';
    ctx.beginPath(); ctx.arc(6 * z + dir.x * 6 * z, -16 * z + dir.y * 3 * z, 1.2 * z, 0, TAU); ctx.fill();
  }
  // Hurt flash
  if (p.hurtFlash > 0) {
    ctx.save(); ctx.globalAlpha *= clamp(p.hurtFlash * .45, 0, .5);
    ctx.fillStyle = '#e0563f'; ctx.beginPath(); ctx.arc(0, -20 * z, 15 * z, 0, TAU); ctx.fill(); ctx.restore();
  }
  // Crouch marker
  if (p.crouch) {
    ctx.save(); ctx.globalAlpha *= .55;
    ctx.strokeStyle = '#d5a04a'; ctx.lineWidth = .9 * z;
    ctx.beginPath(); ctx.arc(0, -1 * z, 12 * z, .15, Math.PI - .15); ctx.stroke(); ctx.restore();
  }
  ctx.restore();
}
function drawZombie(z0) {
  const g = project(z0.x, z0.y, 0);
  const z = G.zoom;
  const dir = screenDirection(z0.facing);
  const anim = z0.anim || 0;
  const sway = Math.sin(anim) * 2.1;
  const variants = [
    ['#66725c', '#3f473a', '#6d8a59'], ['#6b6458', '#403c34', '#7a7a5d'],
    ['#5c6b63', '#353f3a', '#73906f'], ['#74675d', '#413a33', '#8b7c66'],
    ['#626a54', '#3a3f32', '#6f8259'], ['#6c5b55', '#3f3431', '#84645b']
  ];
  const [skin, cloth, stain] = variants[(z0.variant || 0) % variants.length];
  drawShadow(g.x, g.y + 1, 9.5 * z, 4 * z, .34);
  ctx.save();
  ctx.translate(g.x, g.y - Math.abs(Math.sin(anim)) * .7 * z);
  ctx.rotate(Math.sin(anim * .5) * .025);
  ctx.lineCap = 'round';
  // legs
  ctx.strokeStyle = shade(cloth, .8); ctx.lineWidth = 2.8 * z;
  ctx.beginPath(); ctx.moveTo(-1.6 * z, -9.5 * z); ctx.lineTo(-2.4 * z + Math.sin(anim) * 2 * z, -1.2 * z); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(1.6 * z, -9.5 * z); ctx.lineTo(2.2 * z - Math.sin(anim) * 2 * z, -1.2 * z); ctx.stroke();
  ctx.fillStyle = '#24251f';
  ctx.beginPath(); ctx.ellipse(-2.4 * z + Math.sin(anim) * 2 * z, -1 * z, 2.3 * z, 1.3 * z, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(2.2 * z - Math.sin(anim) * 2 * z, -1 * z, 2.3 * z, 1.3 * z, 0, 0, TAU); ctx.fill();
  // torso, hunched
  ctx.fillStyle = cloth;
  ctx.beginPath();
  ctx.moveTo(-5.2 * z, -10 * z);
  ctx.quadraticCurveTo(-6 * z, -19 * z, -3.3 * z, -23 * z);
  ctx.quadraticCurveTo(0, -25 * z, 4 * z, -23 * z);
  ctx.quadraticCurveTo(6 * z, -18 * z, 5.1 * z, -10 * z);
  ctx.closePath(); ctx.fill();
  // torn shirt detail / ribs
  ctx.strokeStyle = 'rgba(25,24,20,.55)'; ctx.lineWidth = .75 * z;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-3.6 * z, (-18 + i * 2.4) * z); ctx.lineTo(3.4 * z, (-17.4 + i * 2.4) * z); ctx.stroke(); }
  ctx.fillStyle = 'rgba(83,24,20,.55)';
  ctx.beginPath(); ctx.ellipse(2.6 * z, -14 * z, 2.2 * z, 3.4 * z, .4, 0, TAU); ctx.fill();
  // outstretched arms
  const reach = 7.5 * z + Math.sin(anim * 1.3) * 1.2 * z;
  const lean = Math.sin(anim * .7) * .7;
  ctx.strokeStyle = skin; ctx.lineWidth = 2.3 * z;
  ctx.beginPath(); ctx.moveTo(-4.2 * z, -21 * z); ctx.lineTo(dir.x * reach - 1 * z, -16 * z + dir.y * reach * .6 + lean * z); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(4.2 * z, -21 * z); ctx.lineTo(dir.x * reach + 1 * z, -15 * z + dir.y * reach * .6 - lean * z); ctx.stroke();
  ctx.fillStyle = shade(skin, .88);
  ctx.beginPath(); ctx.arc(dir.x * reach - 1 * z, -16 * z + dir.y * reach * .6 + lean * z, 1.5 * z, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(dir.x * reach + 1 * z, -15 * z + dir.y * reach * .6 - lean * z, 1.5 * z, 0, TAU); ctx.fill();
  // head hanging forward
  const hx = dir.x * 2.2 * z + Math.sin(anim * .6) * .8 * z;
  const hy = -28 * z + Math.abs(Math.sin(anim * .5)) * .7 * z;
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(hx, hy, 4.3 * z, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(30,38,26,.5)'; ctx.beginPath(); ctx.arc(hx - 1.3 * z, hy - .6 * z, 3.4 * z, 0, TAU); ctx.fill();
  ctx.fillStyle = '#d8d3bd';
  ctx.beginPath(); ctx.arc(hx + dir.x * 1.6 * z - .8 * z, hy + .4 * z, .55 * z, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(hx + dir.x * 1.6 * z + .9 * z, hy + .4 * z, .55 * z, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#4a1e19'; ctx.lineWidth = .8 * z;
  ctx.beginPath(); ctx.moveTo(hx - 1.2 * z, hy + 2.2 * z); ctx.lineTo(hx + 1.4 * z, hy + 2 * z); ctx.stroke();
  // mouth blood
  ctx.fillStyle = 'rgba(104,28,22,.7)'; ctx.fillRect(hx - .8 * z, hy + 2.7 * z, 2 * z, .9 * z);
  // stains
  ctx.fillStyle = stain; ctx.globalAlpha *= .35;
  ctx.beginPath(); ctx.ellipse(-2 * z, -7 * z, 2.5 * z, 1.8 * z, .3, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  if (z0.flash > 0) {
    ctx.save(); ctx.globalAlpha *= clamp(z0.flash * 6, 0, .8);
    ctx.fillStyle = '#f4e3c4'; ctx.beginPath(); ctx.arc(0, -18 * z, 13 * z, 0, TAU); ctx.fill(); ctx.restore();
  }
  ctx.restore();
}
function drawCorpse(c) {
  const p = project(c.x, c.y, 0);
  const z = G.zoom;
  ctx.save();
  ctx.translate(p.x, p.y); ctx.rotate(c.angle || 0);
  ctx.fillStyle = 'rgba(42,56,38,.5)';
  ctx.beginPath(); ctx.ellipse(0, 2 * z, 13 * z, 6 * z, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#3c4337';
  ctx.beginPath(); ctx.ellipse(0, 0, 10 * z, 4.4 * z, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#5e6d55';
  ctx.beginPath(); ctx.arc(7 * z, 0, 3.4 * z, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#4d5745'; ctx.lineWidth = 2.2 * z;
  ctx.beginPath(); ctx.moveTo(-4 * z, -1 * z); ctx.lineTo(-12 * z, -4 * z); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-2 * z, 2 * z); ctx.lineTo(-10 * z, 6 * z); ctx.stroke();
  ctx.fillStyle = 'rgba(63,20,16,.55)';
  ctx.beginPath(); ctx.ellipse(-1 * z, 3 * z, 9 * z, 3 * z, .2, 0, TAU); ctx.fill();
  ctx.restore();
}
function drawPickup(pk) {
  const bob = Math.sin(performance.now() / 420 + (pk.born || 0)) * 1.4;
  const p = project(pk.x, pk.y, 5 + bob);
  const z = G.zoom;
  const d = itemDef(pk.id);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 13 * z);
  g.addColorStop(0, 'rgba(240,193,108,.34)'); g.addColorStop(1, 'rgba(240,193,108,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, 13 * z, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = d.color || '#c9b98d';
  if (d.weapon) {
    ctx.rotate(-.55);
    ctx.fillRect(-7 * z, -1 * z, 14 * z, 2 * z);
    ctx.fillStyle = shade(d.color || '#c9b98d', .7);
    ctx.fillRect(-7 * z, -1 * z, 4 * z, 2 * z);
  } else {
    ctx.beginPath(); ctx.roundRect(-4 * z, -4 * z, 8 * z, 8 * z, 1.6 * z); ctx.fill();
    ctx.strokeStyle = 'rgba(255,246,220,.4)'; ctx.lineWidth = .7 * z; ctx.stroke();
    ctx.fillStyle = 'rgba(255,246,220,.55)'; ctx.fillRect(-2.4 * z, -1 * z, 4.8 * z, .8 * z);
  }
  ctx.restore();
  if (pk.qty > 1) {
    ctx.fillStyle = 'rgba(240,225,196,.85)'; ctx.font = `${8 * z}px "DejaVu Sans Mono", monospace`; ctx.textAlign = 'center';
    ctx.fillText('×' + pk.qty, p.x, p.y - 8 * z); ctx.textAlign = 'left';
  }
}

/* ---------------------------------------------------------------- structures */
function drawStructure(s) {
  const z = G.zoom;
  if (s.kind === 'barricade') {
    isoBox(s.x + .05, s.y + .22, .9, .56, 8, '#8e6c45', '#5f472d', '#4c3824', { shadow: true });
    const a = project(s.x + .5, s.y + .5, 0);
    ctx.save(); ctx.strokeStyle = '#a98254'; ctx.lineWidth = 3.2 * z; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a.x - 11 * z, a.y + 2 * z); ctx.lineTo(a.x + 9 * z, a.y - 19 * z); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(a.x + 10 * z, a.y + 2 * z); ctx.lineTo(a.x - 9 * z, a.y - 19 * z); ctx.stroke();
    ctx.strokeStyle = 'rgba(50,35,20,.6)'; ctx.lineWidth = 1 * z;
    ctx.beginPath(); ctx.moveTo(a.x - 9 * z, a.y - 8 * z); ctx.lineTo(a.x + 9 * z, a.y - 8 * z); ctx.stroke();
    ctx.restore();
  } else if (s.kind === 'campfire') {
    const a = project(s.x + .5, s.y + .5, 0);
    drawShadow(a.x, a.y + 2, 13 * z, 5 * z, .3);
    ctx.fillStyle = '#514b40';
    for (let i = 0; i < 7; i++) {
      const ang = i / 7 * TAU;
      ctx.beginPath(); ctx.ellipse(a.x + Math.cos(ang) * 10 * z, a.y + Math.sin(ang) * 4.6 * z, 2.4 * z, 1.5 * z, 0, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = '#513a26'; ctx.lineWidth = 2.3 * z;
    ctx.beginPath(); ctx.moveTo(a.x - 7 * z, a.y); ctx.lineTo(a.x + 7 * z, a.y - 4 * z); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(a.x - 6 * z, a.y - 4 * z); ctx.lineTo(a.x + 7 * z, a.y); ctx.stroke();
    if (s.fuel > 0) {
      const t = performance.now() / 90;
      for (let i = 0; i < 3; i++) {
        const fl = (Math.sin(t + i * 2.1) + 1) * .5;
        const h = (8 + fl * 9) * z;
        const g = ctx.createLinearGradient(a.x, a.y - h, a.x, a.y);
        g.addColorStop(0, i === 0 ? 'rgba(255,222,140,.9)' : 'rgba(236,137,52,.85)');
        g.addColorStop(1, 'rgba(160,48,20,.15)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(a.x + (i - 1) * 4 * z, a.y - 1);
        ctx.quadraticCurveTo(a.x + (i - 1) * 6 * z + Math.sin(t + i) * 2 * z, a.y - h * .55, a.x + (i - 1) * 3 * z, a.y - h);
        ctx.quadraticCurveTo(a.x + (i - 1) * 1.5 * z, a.y - h * .5, a.x - (i - 1) * 4 * z, a.y - 1);
        ctx.closePath(); ctx.fill();
      }
      const gl = ctx.createRadialGradient(a.x, a.y - 8 * z, 0, a.x, a.y - 8 * z, 28 * z);
      gl.addColorStop(0, 'rgba(255,171,75,.28)'); gl.addColorStop(1, 'rgba(255,171,75,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(a.x, a.y - 8 * z, 28 * z, 0, TAU); ctx.fill();
    }
  } else if (s.kind === 'crate') {
    isoBox(s.x + .06, s.y + .06, .88, .88, 17, '#9b784c', '#69502f', '#553f26');
    const a = project(s.x + .5, s.y + .5, 18);
    ctx.strokeStyle = 'rgba(59,41,23,.5)'; ctx.lineWidth = 1 * z;
    ctx.beginPath(); ctx.moveTo(a.x - 8 * z, a.y); ctx.lineTo(a.x + 8 * z, a.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(a.x, a.y - 4 * z); ctx.lineTo(a.x, a.y + 4 * z); ctx.stroke();
  } else if (s.kind === 'farmplot') {
    const a = project(s.x + .5, s.y + .5, 0);
    diamond(a.x, a.y); ctx.fillStyle = '#56412a'; ctx.fill();
    ctx.strokeStyle = 'rgba(30,22,13,.45)'; ctx.lineWidth = 1 * z; ctx.stroke();
    if (s.crop) {
      const growth = clamp((s.growth || 0) / (CROPS[s.crop]?.growHours * 60 || 1), 0, 1);
      const n = 3 + Math.round(growth * 3);
      for (let i = 0; i < n; i++) {
        const px = a.x + (i - (n - 1) / 2) * 5 * z;
        const h = (3 + growth * 9) * z;
        ctx.strokeStyle = s.mature ? '#7f8c42' : '#62753d'; ctx.lineWidth = 1.1 * z;
        ctx.beginPath(); ctx.moveTo(px, a.y + 2 * z); ctx.lineTo(px + Math.sin(i) * 1.5 * z, a.y - h); ctx.stroke();
        if (s.mature) {
          ctx.fillStyle = CROPS[s.crop]?.item === 'carrot' ? '#cf7f38' : '#a98a58';
          ctx.beginPath(); ctx.arc(px + Math.sin(i) * 1.5 * z, a.y - h + 1 * z, 1.5 * z, 0, TAU); ctx.fill();
        }
      }
    }
  } else if (s.kind === 'raincollector') {
    isoBox(s.x + .15, s.y + .15, .7, .7, 22, '#6e7a74', '#4a534f', '#3d4541');
    const a = project(s.x + .5, s.y + .5, 24);
    ctx.fillStyle = '#8b9690';
    ctx.beginPath(); ctx.moveTo(a.x - 9 * z, a.y); ctx.lineTo(a.x + 9 * z, a.y); ctx.lineTo(a.x + 5 * z, a.y + 5 * z); ctx.lineTo(a.x - 5 * z, a.y + 5 * z); ctx.closePath(); ctx.fill();
    if ((s.water || 0) > 1) {
      ctx.save(); ctx.globalAlpha *= .3;
      ctx.fillStyle = '#6da2b8';
      ctx.beginPath(); ctx.ellipse(a.x, a.y + 2 * z, 6 * z, 2 * z, 0, 0, TAU); ctx.fill(); ctx.restore();
    }
  }
}

/* ---------------------------------------------------------------- roofs, lighting, weather */
function distToBuildingRect(x, y, b) {
  const dx = Math.max(b.x - x, 0, x - (b.x + b.w));
  const dy = Math.max(b.y - y, 0, y - (b.y + b.h));
  return Math.hypot(dx, dy);
}
function renderRoofs() {
  if (!G.world) return;
  const b = visibleBounds(3);
  const inside = playerInsideBuilding();
  for (const bb of G.world.buildings) {
    if (!bb.roof) continue;
    if (inside && inside.id === bb.id) continue;
    if (bb.x + bb.w < b.x0 - 2 || bb.x > b.x1 + 2 || bb.y + bb.h < b.y0 - 2 || bb.y > b.y1 + 2) continue;
    // Fade the roof as the player hugs a wall from outside; the eave would
    // otherwise cover the character when walking along the south side.
    const nearEdge = G.player ? distToBuildingRect(G.player.x, G.player.y, bb) < 1.15 : false;
    if (nearEdge) { ctx.save(); ctx.globalAlpha *= .2; }
    drawRoof(bb);
    if (nearEdge) ctx.restore();
  }
}
function drawRoof(b) {
  const over = .08;
  const x0 = b.x - over, y0 = b.y - over, x1 = b.x + b.w + over, y1 = b.y + b.h + over;
  const base = b.roofColor || '#4d4b48';
  const pa = (q) => [q.x, q.y];
  const A = pa(project(x0, y0, WALL_H)), B = pa(project(x1, y0, WALL_H)), C = pa(project(x1, y1, WALL_H)), D = pa(project(x0, y1, WALL_H));
  const alongX = b.w >= b.h;
  let R1, R2, F1, F2;
  if (alongX) {
    const cy = b.y + b.h / 2;
    R1 = pa(project(b.x + .2, cy, WALL_H + 8)); R2 = pa(project(b.x + b.w - .2, cy, WALL_H + 8));
    F1 = [A, B, R2, R1]; F2 = [C, D, R1, R2];
  } else {
    const cx = b.x + b.w / 2;
    R1 = pa(project(cx, b.y + .2, WALL_H + 8)); R2 = pa(project(cx, b.y + b.h - .2, WALL_H + 8));
    F1 = [A, D, R2, R1]; F2 = [B, C, R2, R1];
  }
  ctx.save();
  ctx.globalAlpha *= .94;
  fillPoly(F1, shade(base, 1.0));
  fillPoly(F2, shade(base, .74));
  // ridge highlight
  ctx.strokeStyle = 'rgba(232,220,190,.16)'; ctx.lineWidth = 1.2 * G.zoom;
  ctx.beginPath(); ctx.moveTo(R1[0], R1[1]); ctx.lineTo(R2[0], R2[1]); ctx.stroke();
  // eave shadow
  ctx.strokeStyle = 'rgba(10,12,9,.35)'; ctx.lineWidth = 1.4 * G.zoom;
  ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(C[0], C[1]); ctx.lineTo(D[0], D[1]); ctx.closePath(); ctx.stroke();
  // tile streaks
  ctx.save();
  ctx.beginPath(); ctx.moveTo(F1[0][0], F1[0][1]);
  for (const p of [...F1, ...F2]) ctx.lineTo(p[0], p[1]);
  ctx.closePath(); ctx.clip();
  ctx.strokeStyle = 'rgba(14,14,12,.13)'; ctx.lineWidth = .7 * G.zoom;
  for (let i = 0; i < 12; i++) {
    const t = i / 12;
    const a = project(lerp(x0, x1, t), y0, WALL_H), c = project(lerp(x0, x1, t), y1, WALL_H);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
  }
  ctx.restore();
  // chimney for some houses
  if (b.type === 'house' || b.type === 'cabin' || b.type === 'farmhouse') {
    const ch = isoBox(b.x + b.w * .68, b.y + b.h * .28, .32, .32, WALL_H + 12, '#6c5646', '#4a3a2e', '#3c2f26', { shadow: false });
  }
  ctx.restore();
}
function renderTargetRing() {
  const t = G.target;
  if (!t || G.dead || G.ui.panel) return;
  const p = project(t.x, t.y, 0);
  const pulse = .5 + Math.sin(performance.now() / 220) * .5;
  ctx.save();
  ctx.globalAlpha *= .5 + pulse * .3;
  ctx.strokeStyle = t.type === 'pickup' ? '#f0c16c' : '#d5a04a';
  ctx.lineWidth = 1.2 * G.zoom;
  ctx.setLineDash([4 * G.zoom, 4 * G.zoom]);
  ctx.beginPath(); ctx.ellipse(p.x, p.y, 15 * G.zoom, 7.5 * G.zoom, 0, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha *= .25;
  ctx.fillStyle = '#f0c16c'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 15 * G.zoom, 7.5 * G.zoom, 0, 0, TAU); ctx.fill();
  ctx.restore();
}
function renderBuildGhost() {
  if (!G.placing || !G.buildTarget) return;
  const t = G.buildTarget;
  const ok = t.valid;
  ctx.save(); ctx.globalAlpha *= .38;
  isoBox(t.x + .08, t.y + .08, .84, .84, G.placing.id === 'barricade' ? 22 : 15, ok ? '#8fbd6a' : '#c25a4a', ok ? '#5f8442' : '#823a2f', ok ? '#4b6a35' : '#6a2f27', { shadow: true });
  ctx.restore();
  const p = project(t.x + .5, t.y + .5, 30);
  ctx.fillStyle = ok ? 'rgba(181,219,147,.85)' : 'rgba(235,147,129,.85)';
  ctx.font = `${8 * G.zoom}px "DejaVu Sans Mono", monospace`; ctx.textAlign = 'center';
  ctx.fillText(ok ? 'CONFIRMAR' : 'BLOQUEADO', p.x, p.y); ctx.textAlign = 'left';
}
function renderLighting() {
  const night = nightFactor();
  const p = G.player;
  const inside = playerInsideBuilding();
  const weatherDim = (G.weather.type === 'storm' ? .16 : G.weather.type === 'rain' ? .1 : G.weather.type === 'fog' ? .07 : 0);
  let dark = night * .6 + weatherDim * .62;
  if (inside) dark *= .86;
  if (dark <= .01) return;
  ctx.save();
  ctx.fillStyle = `rgba(8,12,20,${clamp(dark, 0, .72)})`;
  ctx.fillRect(0, 0, G.W, G.H);
  ctx.globalCompositeOperation = 'lighter';
  const addLight = (px, py, radius, color, alpha) => {
    const g = ctx.createRadialGradient(px, py, 0, px, py, radius);
    g.addColorStop(0, color.replace('ALPHA', alpha.toFixed(3)));
    g.addColorStop(.55, color.replace('ALPHA', (alpha * .35).toFixed(3)));
    g.addColorStop(1, color.replace('ALPHA', '0'));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, radius, 0, TAU); ctx.fill();
  };
  // street lights
  const b = visibleBounds(4);
  for (const pr of G.world.props) {
    if (pr.kind !== 'streetlight') continue;
    if (pr.x < b.x0 - 2 || pr.x > b.x1 + 2 || pr.y < b.y0 - 2 || pr.y > b.y1 + 2) continue;
    const lp = project(pr.x + .5, pr.y + .5, 62);
    addLight(lp.x + 10 * G.zoom, lp.y, 74 * G.zoom, 'rgba(255,193,96,ALPHA)', .36 * (night + .2));
  }
  for (const s of G.structures) {
    if (s.kind === 'campfire' && s.fuel > 0) {
      const cp = project(s.x + .5, s.y + .5, 12);
      addLight(cp.x, cp.y, 58 * G.zoom, 'rgba(255,158,68,ALPHA)', .42);
    }
  }
  if (p) {
    const pp = project(p.x, p.y, 16);
    addLight(pp.x, pp.y, 54 * G.zoom, 'rgba(206,216,220,ALPHA)', .3);
    if (p.flashlightOn) {
      const dir = screenDirection(p.facing);
      const ang = Math.atan2(dir.y, dir.x);
      const reach = 145 * G.zoom;
      const cone = ctx.createRadialGradient(pp.x, pp.y, 4 * G.zoom, pp.x, pp.y, reach);
      cone.addColorStop(0, 'rgba(255,239,190,.48)');
      cone.addColorStop(.5, 'rgba(255,232,166,.18)');
      cone.addColorStop(1, 'rgba(255,232,166,0)');
      ctx.fillStyle = cone;
      ctx.beginPath(); ctx.moveTo(pp.x, pp.y);
      ctx.arc(pp.x, pp.y, reach, ang - .34, ang + .34);
      ctx.closePath(); ctx.fill();
      addLight(pp.x, pp.y, 34 * G.zoom, 'rgba(255,240,200,ALPHA)', .22);
    }
  }
  // warm window glow for houses at night
  for (const bb of G.world.buildings) {
    if (inside && inside.id === bb.id) continue;
    if (bb.x + bb.w < b.x0 - 2 || bb.x > b.x1 + 2 || bb.y + bb.h < b.y0 - 2 || bb.y > b.y1 + 2) continue;
    if (hash2(bb.id, bb.x) > .55) continue;
    const wp = project(bb.x + bb.w * .5, bb.y + bb.h * .5, 10);
    addLight(wp.x, wp.y, 28 * G.zoom, 'rgba(255,181,94,ALPHA)', .09 * night);
  }
  ctx.restore();
  // Edge of screen is always a touch darker.
  const vg = ctx.createRadialGradient(G.W / 2, G.H / 2, Math.min(G.W, G.H) * .38, G.W / 2, G.H / 2, Math.max(G.W, G.H) * .75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${.28 + night * .22})`);
  ctx.fillStyle = vg; ctx.fillRect(0, 0, G.W, G.H);
}
function renderWeather(dt) {
  const w = G.weather;
  const rainAmt = (w.type === 'rain' ? .65 : w.type === 'storm' ? 1 : 0) * (w.intensity || 0);
  if (rainAmt > 0.01) {
    const want = Math.round(90 + rainAmt * 170);
    while (G.rain.length < want) {
      G.rain.push({ x: rnd(G.W + 200) - 100, y: rnd(G.H), len: 8 + rnd(12), sp: 620 + rnd(480), a: .18 + rnd(.28) });
    }
    if (G.rain.length > want + 40) G.rain.length = want;
    ctx.save();
    ctx.strokeStyle = `rgba(174,206,215,${.28 + rainAmt * .22})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const d of G.rain) {
      d.y += d.sp * dt; d.x += (w.wind || 2) * 18 * dt;
      if (d.y > G.H + 20) { d.y = -20; d.x = rnd(G.W + 200) - 100; }
      if (d.x > G.W + 20) d.x = -20;
      ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 2.2, d.y + d.len);
    }
    ctx.stroke();
    ctx.restore();
  } else if (G.rain.length) {
    G.rain.length = Math.max(0, G.rain.length - Math.ceil(dt * 120));
  }
  if (w.type === 'fog') {
    const t = performance.now() / 9000;
    ctx.save();
    ctx.fillStyle = 'rgba(160,168,162,.10)';
    ctx.fillRect(0, 0, G.W, G.H);
    for (let i = 0; i < 5; i++) {
      const cx = ((i * .27 + t * (.12 + i * .02)) % 1.3 - .15) * G.W;
      const cy = G.H * (.24 + i * .13);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, G.W * .34);
      g.addColorStop(0, 'rgba(183,190,183,.11)'); g.addColorStop(1, 'rgba(183,190,183,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(cx, cy, G.W * .36, G.H * .1, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  if (G.flash > 0) {
    ctx.save(); ctx.globalAlpha = clamp(G.flash * .4, 0, .5); ctx.fillStyle = '#dfe8ec';
    ctx.fillRect(0, 0, G.W, G.H); ctx.restore();
  }
}
function renderFloats() {
  for (const f of G.floats) {
    const p = project(f.x, f.y, 30);
    const a = clamp(f.life / f.max, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = `700 ${10 * G.zoom}px "DejaVu Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 2.4 * G.zoom; ctx.strokeStyle = 'rgba(12,13,10,.8)';
    ctx.strokeText(f.text, p.x, p.y - (1 - a) * 18 * G.zoom);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, p.x, p.y - (1 - a) * 18 * G.zoom);
    ctx.restore();
  }
  ctx.textAlign = 'left';
}
function renderVignette() {
  const p = G.player;
  if (p && p.hurtFlash > 0) {
    const g = ctx.createRadialGradient(G.W / 2, G.H / 2, Math.min(G.W, G.H) * .28, G.W / 2, G.H / 2, Math.max(G.W, G.H) * .7);
    g.addColorStop(0, 'rgba(120,20,14,0)'); g.addColorStop(1, `rgba(120,20,14,${clamp(p.hurtFlash * .35, 0, .45)})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, G.W, G.H);
  }
  if (p && p.health < 30) {
    const a = (1 - p.health / 30) * (.15 + Math.sin(performance.now() / 500) * .04);
    const g = ctx.createRadialGradient(G.W / 2, G.H / 2, Math.min(G.W, G.H) * .3, G.W / 2, G.H / 2, Math.max(G.W, G.H) * .72);
    g.addColorStop(0, 'rgba(90,12,10,0)'); g.addColorStop(1, `rgba(90,12,10,${clamp(a, 0, .4)})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, G.W, G.H);
  }
}

/* ---------------------------------------------------------------- input & session */
function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}
function toggleCrouch() {
  const p = G.player; if (!p) return;
  p.crouch = !p.crouch;
  input.crouch = p.crouch;
  AudioFX.ui();
  updateHUD(true);
}
function bindInput() {
  window.addEventListener('keydown', (e) => {
    input.keys.add(e.code);
    if (isTyping(e)) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.sprint = true;
    if (e.repeat) return;
    if (e.code === 'Escape') {
      if (G.ui.panel) closePanel();
      else if (G.mode === 'playing' && !G.dead) openPanel('pause');
      return;
    }
    if (G.mode !== 'playing' || G.dead) return;
    if (e.code === 'Space') { if (G.ui.panel) return; playerAttack(); }
    else if (e.code === 'KeyE') { if (!G.ui.panel) doInteract(); }
    else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.sprint = true;
    else if (e.code === 'ControlLeft' || e.code === 'ControlRight') toggleCrouch();
    else if (e.code === 'KeyI') { G.ui.panel === 'inventory' ? closePanel() : openPanel('inventory'); }
    else if (e.code === 'KeyM') { G.ui.panel === 'map' ? closePanel() : openPanel('map'); }
    else if (e.code === 'KeyJ') { G.ui.panel === 'journal' ? closePanel() : openPanel('journal'); }
    else if (e.code === 'KeyK') { G.ui.panel === 'skills' ? closePanel() : openPanel('skills'); }
    else if (e.code === 'KeyC') { if (!G.ui.panel) openPanel('craft'); }
    else if (e.code === 'KeyF') { if (!G.ui.panel) toggleFlashlight(); }
    else if (e.code === 'KeyR') { if (!G.ui.panel) { const v = G.player?.inVehicle; if (v) exitVehicle(); } }
    else if (/^Digit[1-5]$/.test(e.code)) {
      document.querySelector(`[data-quick="${Number(e.code.slice(5)) - 1}"]`)?.click();
    }
  });
  window.addEventListener('keyup', (e) => {
    input.keys.delete(e.code);
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.sprint = false;
  });
  window.addEventListener('blur', () => { input.keys.clear(); input.sprint = false; input.joy.x = input.joy.y = 0; input.joy.active = false; });

  // Virtual joystick
  const joy = $('#joystick'), ring = joy?.querySelector('.joy-ring'), knob = $('#joyKnob');
  if (ring && knob) {
    let pointerId = null;
    const setJoy = (e) => {
      const r = ring.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let dx = (e.clientX - cx) / (r.width * .38);
      let dy = (e.clientY - cy) / (r.height * .38);
      const m = Math.hypot(dx, dy);
      if (m > 1) { dx /= m; dy /= m; }
      input.joy.x = dx; input.joy.y = dy; input.joy.active = Math.hypot(dx, dy) > .08;
      knob.style.transform = `translate(${dx * r.width * .31}px, ${dy * r.height * .31}px)`;
      ring.classList.toggle('active', input.joy.active);
    };
    const endJoy = () => {
      pointerId = null;
      input.joy.x = 0; input.joy.y = 0; input.joy.active = false;
      knob.style.transform = '';
      ring.classList.remove('active');
    };
    ring.addEventListener('pointerdown', (e) => {
      pointerId = e.pointerId;
      ring.setPointerCapture?.(e.pointerId);
      AudioFX.init();
      setJoy(e); e.preventDefault();
    });
    ring.addEventListener('pointermove', (e) => { if (pointerId === e.pointerId) { setJoy(e); e.preventDefault(); } });
    ring.addEventListener('pointerup', endJoy);
    ring.addEventListener('pointercancel', endJoy);
    ring.addEventListener('lostpointercapture', endJoy);
  }

  // Touch and desktop action buttons
  $('#btnAttack')?.addEventListener('click', () => { AudioFX.init(); playerAttack(); });
  $('#btnInteract')?.addEventListener('click', () => { AudioFX.init(); doInteract(); });
  $('#btnSprint')?.addEventListener('click', () => { input.sprint = !input.sprint; AudioFX.ui(); updateHUD(true); });
  $('#btnCrouch')?.addEventListener('click', () => { AudioFX.init(); toggleCrouch(); });
  $('#buildConfirm')?.addEventListener('click', confirmBuild);
  $('#buildCancel')?.addEventListener('click', cancelBuildPlacement);

  // HUD panel openers
  document.querySelectorAll('[data-panel]').forEach(btn => btn.addEventListener('click', () => {
    if (G.mode !== 'playing' || G.dead) return;
    const name = btn.dataset.panel;
    AudioFX.init();
    if (G.ui.panel === name) closePanel(); else openPanel(name);
  }));
  $('#panelClose')?.addEventListener('click', closePanel);
  $('#overlay')?.addEventListener('pointerdown', (e) => { if (e.target === $('#overlay')) closePanel(); });

  // Menu
  $('#startBtn')?.addEventListener('click', () => {
    AudioFX.init(); AudioFX.ui();
    const nameInput = $('#playerName');
    G.playerName = (nameInput?.value || '').trim().slice(0, 18) || 'Aurora';
    newGame();
  });
  $('#continueBtn')?.addEventListener('click', () => { AudioFX.init(); AudioFX.ui(); loadGame(); });
  $('#deleteSave')?.addEventListener('click', () => {
    try { localStorage.removeItem(SAVE_KEY); } catch {}
    refreshContinue();
    toast('Salvamento apagado.', 'good');
  });
  $('#menuSound')?.addEventListener('click', () => {
    AudioFX.init();
    G.settings.volume = G.settings.volume > 0 ? 0 : .6;
    AudioFX.setVolume(G.settings.volume);
    const b = $('#menuSound');
    if (b) b.textContent = 'SOM: ' + (G.settings.volume > 0 ? 'ON' : 'OFF');
    if (G.settings.volume > 0) AudioFX.ui();
  });
  $('#retryBtn')?.addEventListener('click', () => {
    AudioFX.init(); AudioFX.ui();
    $('#death').classList.add('hidden');
    newGame();
  });
  $('#deathMenuBtn')?.addEventListener('click', () => showMenu());

  // Responsive + persistence
  window.addEventListener('resize', () => { resize(); updateHUD(true); });
  window.addEventListener('orientationchange', () => setTimeout(() => { resize(); updateHUD(true); }, 180));
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(false); });
  window.addEventListener('beforeunload', () => { if (G.started && !G.dead) saveGame(false); });
  // Save the active game every 20 seconds even if the loop is throttled.
  setInterval(() => { if (G.started && !G.dead && G.settings.autosave) saveGame(false); }, 20000);
}
function startNewGame() {
  AudioFX.init();
  const nameInput = $('#playerName');
  G.playerName = (nameInput?.value || '').trim().slice(0, 18) || 'Aurora';
  newGame();
}
function loop(ts) {
  if (!G.last) G.last = ts;
  const dt = clamp((ts - G.last) / 1000, 0, .05);
  G.last = ts;
  G.time += dt;
  if (G.mode === 'playing' && !G.dead && !G.ui.panel) {
    const gm = dt * MIN_PER_SEC * (DIFF().timeScale || 1);
    advanceMinutes(gm, true);
    updateWeather(dt, gm);
    updatePlayer(dt, gm);
    if (!G.dead) {
      updateFishing(dt);
      updateZombies(dt);
      updateStructures(gm);
      updateParticles(dt);
      G.discoverTimer += dt;
      if (G.discoverTimer > 1.1) { G.discoverTimer = 0; discoverAround(); }
      G.spawnTimer += dt;
      if (G.spawnTimer > 9) { G.spawnTimer = 0; maintainPopulation(); }
      G.objTimer = (G.objTimer || 0) + dt;
      if (G.objTimer > .7) { G.objTimer = 0; checkObjectives(); }
      G.saveTimer += dt;
      if (G.saveTimer > 20) { G.saveTimer = 0; if (G.settings.autosave) saveGame(false); }
      applyWeatherVisual();
    }
    G.targetTimer = (G.targetTimer || 0) + dt;
    if (G.targetTimer > .1) { G.targetTimer = 0; G.target = findTarget(); }
    updateCamera(dt);
    updateHUD();
  } else if (G.mode === 'playing') {
    // Paused by a panel or death: keep ambient animation alive but freeze time.
    updateParticles(dt * .25);
    updateCamera(dt);
    updateHUD();
  } else {
    // Main menu: a slow, cinematic drift over the generated town.
    updateParticles(dt);
    G.cam.x = Math.sin(G.time * .11) * 30;
    G.cam.y = 1852 + Math.cos(G.time * .09) * 12;
    applyWeatherVisual();
  }
  render(dt);
  requestAnimationFrame(loop);
}
function init() {
  resize();
  setupMenuWorld();
  renderProfessions();
  renderDifficulties();
  refreshContinue();
  bindInput();
  applyWeatherVisual();
  updateHUD(true);
  G.last = 0;
  requestAnimationFrame(loop);
  // Expose a tiny debug surface for automated smoke tests.
  window.__cinzas = {
    G, input, newGame, saveGame, loadGame, showMenu, render, updatePlayer, updateZombies,
    updateHUD, findTarget, doInteract, resize, playerAttack, beginBuild, confirmBuild,
    enterVehicle, exitVehicle, openPanel, closePanel, craft, addItem, removeItem, advanceMinutes
  };
}
init();
