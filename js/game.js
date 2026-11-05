import {
  clamp, lerp, dist, angleTo, angleDiff, randRange, randInt, chance, choose, shuffle,
  TAU, isNight, uid, b64FromBytes,
} from './util.js';
import {
  ITEMS, DIFFICULTIES, BACKGROUNDS, SKILLS, ZOMBIE_TYPES, SEASONS, WEATHERS,
  BUILDABLES, NOTES, SURVIVOR_FIRST, SURVIVOR_LAST, TRADE_LINES, AMBIENT_LINES,
  EVENT_DEFS, CRAFT_RECIPES,
} from './data.js';
import { World, TILE, T } from './world.js';
import { audio } from './audio.js';
import { systems } from './systems.js';

const TIME_RATE = 1.4; // minutos de jogo por segundo real
const BASE_CAPACITY = 14;

export class Game {
  constructor(opts = {}) {
    this.opts = opts;
    this.seed = opts.seed ?? Math.floor(Math.random() * 1e9);
    this.difficulty = opts.difficulty || 'sobrevivente';
    this.diff = DIFFICULTIES[this.difficulty] || DIFFICULTIES.sobrevivente;
    this.mode = opts.mode || 'single';
    this.mp = opts.mp || null;
    this.isHost = !this.mp || this.mp.isHost !== false;
    this.ui = null;
    this.world = new World(this.seed, this.difficulty);
    this.time = opts.time ?? 8 * 60 + 10;
    this.day = opts.day ?? 1;
    this.weather = opts.weather || 'limpo';
    this.weatherTimer = 110;
    this.seasonIndex = Math.floor((this.day - 1) / 7) % 4;
    this.flash = 0;
    this.paused = false;
    this.dead = false;
    this.deathCause = '';
    this.timeAlive = 0;
    this.clock = 0;
    this.autosaveTimer = 0;
    this.revealTimer = 0;

    this.zombies = [];
    this.corpses = [];
    this.npcs = [];
    this.remotePlayers = new Map();
    this.groundItems = [];
    this.particles = [];
    this.floaters = [];
    this.bloodDecals = [];
    this.noiseRings = [];
    this.events = [];
    this.chat = [];

    this.stats = { kills: 0, distance: 0, looted: 0, built: 0, days: 1, shots: 0, survivorsMet: 0 };
    this.flags = {};
    this.objectives = [
      { id: 'drink', text: 'Beba algo', icon: '💧', done: false, reward: 15 },
      { id: 'eat', text: 'Coma algo', icon: '🍞', done: false, reward: 15 },
      { id: 'weapon', text: 'Equipe uma arma', icon: '🔪', done: false, reward: 20 },
      { id: 'loot', text: 'Vasculhe um recipiente', icon: '📦', done: false, reward: 20 },
      { id: 'barricade', text: 'Barrique uma porta ou janela', icon: '🪵', done: false, reward: 40 },
      { id: 'vehicle', text: 'Entre em um veículo', icon: '🚗', done: false, reward: 35 },
      { id: 'night', text: 'Sobreviva à primeira noite', icon: '🌙', done: false, reward: 60 },
      { id: 'shelter', text: 'Construa um abrigo ou fogueira', icon: '🏠', done: false, reward: 50 },
    ];
    this.questIndex = 0;

    this.player = this.createPlayer(opts.background || 'estudante', opts.playerName || 'Sobrevivente');
    this.aim = { x: this.player.x, y: this.player.y, angle: -Math.PI / 2, active: false };
    this.camera = { x: 0, y: 0, w: 1200, h: 800 };
    this.viewW = 1200; this.viewH = 800;
    this.shake = 0;
    this.hurtFlash = 0;
    this.buildMode = false;
    this.selectedBuild = null;
    this.lootOpen = null;
    this.dialogNpc = null;
    this.sleeping = false;

    this.input = {
      up: false, down: false, left: false, right: false, sprint: false, sneak: false,
      attack: false, pointerX: 0, pointerY: 0, pointerActive: false, touchAim: null,
    };

    if (opts.save) {
      this.loadState(opts.save);
    } else {
      this.spawnInitial();
    }
    if (!this.zombies.length) this.spawnInitialZombies();
    if (!this.npcs.length) this.spawnInitialNPCs();
    this.world.reveal(Math.floor(this.player.x / TILE), Math.floor(this.player.y / TILE), 10);
    this.applyWeatherAudio();
  }

  // ================= JOGADOR =================
  createPlayer(backgroundId, name) {
    const bg = BACKGROUNDS[backgroundId] || BACKGROUNDS.estudante;
    const p = {
      name: name || 'Sobrevivente',
      background: backgroundId,
      x: this.world.start.x, y: this.world.start.y, angle: -Math.PI / 2,
      radius: 10, health: 100, maxHealth: 100,
      hunger: 82, thirst: 78, fatigue: 12, stamina: 100, maxStamina: 100,
      temp: 36.8, hygiene: 84, infection: 0, bleed: 0, wet: 0, sick: 0,
      injuries: { leg: 0, arm: 0 }, pain: 0,
      inventory: [], skills: {}, xp: 0, level: 1, xpNext: 120,
      flashlight: false, inVehicle: null, downed: false, downTimer: 0,
      attackCd: 0, swing: 0, footstep: 0, lastHurt: 0, sprinting: false,
      infectionWarned: false, lastStatus: 0, kills: 0, lastMelee: 0,
    };
    for (const [key, lvl] of Object.entries(bg.skills || {})) {
      p.skills[key] = { level: lvl, xp: 0, next: this.skillNext(lvl) };
    }
    for (const key of Object.keys(SKILLS)) {
      if (!p.skills[key]) p.skills[key] = { level: 0, xp: 0, next: this.skillNext(0) };
    }
    p.xpBonus = bg.xpBonus || 0;
    const startItems = (bg.items || []).map(([id, qty]) => ({ id, qty, condition: 1 }));
    // Itens básicos garantidos
    if (!startItems.some(i => ITEMS[i.id]?.type === 'drink')) startItems.push({ id: 'agua', qty: 1, condition: 1 });
    if (!startItems.some(i => ITEMS[i.id]?.type === 'food')) startItems.push({ id: 'enlatado', qty: 1, condition: 1 });
    if (!startItems.some(i => ITEMS[i.id]?.weapon)) startItems.push({ id: 'bastao', qty: 1, condition: 0.8 });
    if (!startItems.some(i => ITEMS[i.id]?.type === 'med')) startItems.push({ id: 'bandagem', qty: 1, condition: 1 });
    for (const it of startItems) this.pushItem(p.inventory, it);
    const weapon = p.inventory.find(s => ITEMS[s.id]?.weapon);
    if (weapon) weapon.equipped = true;
    const pack = p.inventory.find(s => ITEMS[s.id]?.type === 'backpack');
    if (pack) pack.equipped = true;
    for (const s of p.inventory) if (ITEMS[s.id]?.type === 'clothing' && chance(this.world.rng, 0.4)) s.equipped = true;
    p.capacity = this.calcCapacity(p);
    return p;
  }

  skillNext(level) { return Math.round(55 * Math.pow(1.32, level)); }

  get weaponStack() { return this.player.inventory.find(s => s.equipped && ITEMS[s.id]?.weapon); }
  get backpackStack() { return this.player.inventory.find(s => s.equipped && ITEMS[s.id]?.type === 'backpack'); }
  get clothingStacks() { return this.player.inventory.filter(s => s.equipped && ITEMS[s.id]?.type === 'clothing'); }

  calcCapacity(p = this.player) {
    let c = BASE_CAPACITY + (p.skills.condicionamento?.level || 0) * 0.35;
    const pack = p.inventory.find(s => s.equipped && ITEMS[s.id]?.type === 'backpack');
    if (pack) c += ITEMS[pack.id].capacity || 0;
    return Math.round(c * 10) / 10;
  }

  weight(inv = this.player.inventory) {
    let w = 0;
    for (const s of inv) w += (ITEMS[s.id]?.weight || 0) * (s.qty || 1);
    return Math.round(w * 100) / 100;
  }

  capacity() { this.player.capacity = this.calcCapacity(); return this.player.capacity; }

  pushItem(inv, item) {
    const def = ITEMS[item.id];
    if (!def) return false;
    if (def.stack > 1) {
      const existing = inv.find(s => s.id === item.id && s.qty < def.stack && !s.equipped);
      if (existing) {
        const can = Math.min(def.stack - existing.qty, item.qty);
        existing.qty += can;
        item.qty -= can;
        if (item.qty <= 0) return true;
      }
    }
    inv.push({ ...item });
    return true;
  }

  addItem(id, qty = 1, condition = 1, opts = {}) {
    if (!ITEMS[id] || qty <= 0) return false;
    const def = ITEMS[id];
    const addWeight = def.weight * qty;
    if (!opts.ignoreWeight && this.weight() + addWeight > this.capacity() * 1.1) {
      this.ui?.notify('Carga máxima atingida. Solte algo ou use uma mochila.', 'warn', '⚖️');
      return false;
    }
    this.pushItem(this.player.inventory, { id, qty, condition });
    this.player.capacity = this.calcCapacity();
    if (opts.silent !== true) audio.play('pickup');
    return true;
  }

  removeItem(id, qty = 1) {
    let need = qty;
    const inv = this.player.inventory;
    for (let i = inv.length - 1; i >= 0 && need > 0; i--) {
      if (inv[i].id !== id) continue;
      const take = Math.min(inv[i].qty, need);
      inv[i].qty -= take; need -= take;
      if (inv[i].qty <= 0) inv.splice(i, 1);
    }
    this.player.capacity = this.calcCapacity();
    return need === 0;
  }

  countItem(id) {
    return this.player.inventory.filter(s => s.id === id).reduce((a, s) => a + s.qty, 0);
  }

  hasTool(...ids) { return ids.some(id => this.countItem(id) > 0); }

  // ================= INÍCIO =================
  spawnInitial() {
    this.spawnInitialZombies();
    this.spawnInitialNPCs();
  }

  spawnInitialZombies() {
    const rng = this.world.rng;
    const target = Math.round(95 * this.diff.spawn);
    const start = this.player;
    const anchors = shuffle(rng, this.world.spawnPoints.slice());
    let placed = 0;
    const near = anchors.filter(p => dist(p.x, p.y, start.x, start.y) < 1900 && dist(p.x, p.y, start.x, start.y) > 430);
    const far = anchors.filter(p => dist(p.x, p.y, start.x, start.y) >= 1900);
    const pool = [...near, ...far];
    for (const a of pool) {
      if (placed >= target) break;
      if (this.zombies.some(z => dist(z.x, z.y, a.x, a.y) < 45)) continue;
      if (dist(a.x, a.y, start.x, start.y) < 420) continue;
      this.spawnZombie(a.x, a.y, this.pickZombieType());
      placed++;
    }
    // alguns dentro de prédios
    for (const b of this.world.buildings) {
      if (placed >= target + 12) break;
      if (chance(rng, 0.45) && dist((b.x + b.w / 2) * TILE, (b.y + b.h / 2) * TILE, start.x, start.y) > 600) {
        const spot = { x: (b.x + 1.5 + rng() * (b.w - 3)) * TILE, y: (b.y + 1.5 + rng() * (b.h - 3)) * TILE };
        if (!this.world.collidesCircle(spot.x, spot.y, 10)) { this.spawnZombie(spot.x, spot.y, this.pickZombieType()); placed++; }
      }
    }
  }

  pickZombieType() {
    const day = this.day;
    const entries = [
      ['comum', 68], ['corredor', 12 + Math.min(20, day * 2.2)],
      ['rastejante', 11], ['bruto', 3 + Math.min(16, day * 1.8)],
    ];
    let total = entries.reduce((s, e) => s + e[1], 0), r = this.world.rng() * total;
    for (const [type, w] of entries) { r -= w; if (r <= 0) return type; }
    return 'comum';
  }

  spawnZombie(x, y, type = 'comum') {
    const def = ZOMBIE_TYPES[type] || ZOMBIE_TYPES.comum;
    const z = {
      id: uid('z'), x, y, angle: this.world.rng() * TAU,
      type, hp: def.hp * (this.difficulty === 'apocalipse' ? 1.2 : 1), maxHp: def.hp,
      speed: def.speed * randRange(this.world.rng, 0.9, 1.12),
      damage: def.damage * this.diff.damage, size: def.size,
      hearing: def.hearing, sight: def.sight,
      state: 'idle', alert: 0, target: null, wander: null, idleTimer: randRange(this.world.rng, 0.5, 4),
      attackCd: 0, anim: this.world.rng() * 10, groanCd: randRange(this.world.rng, 3, 12),
      home: { x, y }, stuck: 0, lastX: x, lastY: y, hitFlash: 0, trapCd: 0,
      inside: false, xp: def.xp, corpseTimer: 0,
    };
    this.zombies.push(z);
    return z;
  }

  spawnInitialNPCs() {
    const rng = this.world.rng;
    const pts = this.world.npcPoints.filter(p => dist(p.x, p.y, this.player.x, this.player.y) < 3400);
    const count = 11;
    const used = new Set();
    for (let i = 0; i < count && pts.length; i++) {
      const pt = pts[Math.floor(rng() * pts.length)];
      const spot = this.world.randomWalkableNear(pt.x, pt.y, 240);
      if (this.npcs.some(n => dist(n.x, n.y, spot.x, spot.y) < 60)) continue;
      const key = pt.x + ',' + pt.y;
      if (used.has(key)) continue;
      used.add(key);
      this.spawnNPC(spot.x, spot.y, {
        name: choose(rng, SURVIVOR_FIRST) + ' ' + choose(rng, SURVIVOR_LAST),
        personality: choose(rng, ['cauteloso', 'amigável', 'desconfiado', 'prático', 'nervoso']),
        hostile: false,
      });
    }
    // um comerciante perto do início
    const near = this.world.randomWalkableNear(this.player.x, this.player.y, 700);
    this.spawnNPC(near.x, near.y, {
      name: 'Mercador ' + choose(rng, SURVIVOR_FIRST), personality: 'prático', hostile: false, trader: true,
      line: 'Tenho coisas que você precisa. Você tem coisas que eu quero.',
    });
  }

  spawnNPC(x, y, opts = {}) {
    const rng = this.world.rng;
    const skill = randInt(rng, 1, 3);
    const npc = {
      id: uid('n'), x, y, angle: rng() * TAU, name: opts.name || 'Sobrevivente',
      personality: opts.personality || 'cauteloso', hostile: !!opts.hostile, trader: !!opts.trader,
      state: 'wander', home: { x, y }, target: null, wander: null, idleTimer: randRange(rng, 1, 4),
      speed: opts.hostile ? 120 : 80, hp: opts.hostile ? 80 : 100, maxHp: 100,
      attackCd: 0, weapon: opts.hostile ? 'cano' : (rng() < 0.5 ? 'faca' : 'bastao'),
      line: opts.line || choose(rng, TRADE_LINES), following: false, talked: false,
      trade: [], greeting: choose(rng, ['Ainda estou vivo. Por enquanto.', 'Cuidado lá fora.', 'Você tem comida?', 'Não confio em estranhos. Mas fale.']),
      anim: rng() * 10, hitFlash: 0, alive: true, combatSkill: opts.hostile ? 2 : skill,
      downed: false, loseInterest: 0,
    };
    for (let i = 0; i < (opts.trader ? 5 : 3); i++) {
      npc.trade.push(this.world.rollLoot(choose(this.world.rng, ['mercado', 'ferramentas', 'farmacia', 'armario', 'oficina']), 0.75)[0] || { id: 'bandagem', qty: 1, condition: 1 });
    }
    this.npcs.push(npc);
    return npc;
  }

  // ================= LOOP =================
  update(dt) {
    if (this.paused) return;
    if (!this.dead) {
      this.clock += dt;
      this.updateTime(dt);
      this.updateSurvival(dt);
      this.updatePlayer(dt);
      this.updateNoiseRings(dt);
      this.updateParticles(dt);
      this.updateFloaters(dt);
      this.updateZombies(dt);
      this.updateNPCs(dt);
      this.updateVehicles(dt);
      this.updateStructures(dt);
      this.updateEvents(dt);
      this.updateRemote(dt);
      this.updateObjectives();
      this.updateAutosave(dt);
      if (this.ui?.hudDirty) this.ui.refreshHUD();
    } else {
      this.updateParticles(dt * 0.35);
    }
    this.shake = Math.max(0, this.shake - dt * 18);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.2);
    this.flash = Math.max(0, this.flash - dt * 2.5);
  }

  updateTime(dt) {
    this.timeAlive += dt;
    this.advanceTime(dt * TIME_RATE);
    if (this.weather === 'tempestade' && chance(this.world.rng, dt * 0.05)) {
      this.flash = 0.7 + Math.random() * 0.3;
      setTimeout(() => audio.play('thunder'), 300 + Math.random() * 500);
    }
  }

  advanceTime(minutes) {
    this.time += minutes;
    while (this.time >= 1440) {
      this.time -= 1440;
      this.day++;
      this.stats.days = this.day;
      this.onNewDay();
    }
    this.weatherTimer -= minutes;
    if (this.weatherTimer <= 0) this.changeWeather();
    this.seasonIndex = Math.floor((this.day - 1) / 7) % 4;
  }

  onNewDay() {
    const season = SEASONS[this.seasonIndex];
    this.ui?.notify(`Dia ${this.day} começou. ${season.icon} ${season.desc}`, 'day', '🌅');
    this.ui?.dayBanner(this.day, season, this.weather);
    // espalha novos zumbis com o tempo
    const cap = Math.round(140 * this.diff.spawn);
    if (this.isHost && this.zombies.length < cap) {
      const adds = Math.min(8, cap - this.zombies.length);
      for (let i = 0; i < adds; i++) {
        const p = this.world.randomWalkableNear(this.player.x + randRange(this.world.rng, -1400, 1400), this.player.y + randRange(this.world.rng, -1400, 1400), 300);
        if (dist(p.x, p.y, this.player.x, this.player.y) > 550) this.spawnZombie(p.x, p.y, this.pickZombieType());
      }
    }
    if (!this.flags.firstNightSurvived && this.day >= 2) {
      this.flags.firstNightSurvived = true;
      this.completeObjective('night');
    }
    // saque parcial em contêineres não visitados
    for (const c of this.world.containers) {
      if (!c.searched && chance(this.world.rng, 0.03)) c.items = this.world.rollLoot(c.type === 'caixa_suprimentos' ? 'caixa_suprimentos' : (c.type || 'caixa'), 0.5);
    }
    this.stats.days = this.day;
  }

  changeWeather() {
    const season = SEASONS[this.seasonIndex];
    const entries = [
      ['limpo', 36], ['nublado', 26], ['chuva', Math.round(season.rain * 100)],
      ['tempestade', Math.round(season.rain * 45)], ['neblina', 10 + season.rain * 12],
    ];
    let total = entries.reduce((s, e) => s + e[1], 0), r = Math.random() * total;
    let next = 'limpo';
    for (const [w, weight] of entries) { r -= weight; if (r <= 0) { next = w; break; } }
    if (next !== this.weather) {
      this.weather = next;
      const def = WEATHERS[next];
      this.ui?.notify(`Clima mudou: ${def.icon} ${def.name}. ${def.desc}`, 'weather', def.icon);
      if (next === 'tempestade') {
        audio.play('thunder');
        this.player.wet = Math.min(100, this.player.wet + 30);
      }
    }
    this.weatherTimer = randRange(this.world.rng, 90, 300);
    this.applyWeatherAudio();
  }

  applyWeatherAudio() {
    const def = WEATHERS[this.weather] || WEATHERS.limpo;
    const wet = def.wet;
    audio.setRain(wet);
  }

  updateAutosave(dt) {
    this.autosaveTimer += dt;
    if (this.autosaveTimer > 45) {
      this.autosaveTimer = 0;
      if (this.mode === 'single') this.ui?.autosave();
    }
  }

  // ================= SOBREVIVÊNCIA =================
  updateSurvival(dt) {
    const p = this.player;
    if (p.downed) return;
    if (p.inVehicle) return;
    const d = this.diff;
    p.hunger = clamp(p.hunger - 0.020 * dt * d.hunger, 0, 100);
    p.thirst = clamp(p.thirst - 0.029 * dt * d.hunger, 0, 100);
    p.fatigue = clamp(p.fatigue + 0.011 * dt * (isNight(this.time) ? 1.4 : 1) * 0.8, 0, 100);
    p.hygiene = clamp(p.hygiene - 0.0035 * dt, 0, 100);
    p.stamina = clamp(p.stamina, 0, p.maxStamina);

    // Sangramento
    if (p.bleed > 0) {
      p.health -= 0.45 * (p.bleed / 100) * dt;
      p.bleed = Math.max(0, p.bleed - 0.22 * dt);
    }
    // Infecção
    if (p.infection > 0) {
      p.infection = clamp(p.infection + 0.0045 * dt * d.infect, 0, 100);
      if (p.infection > 55) p.health -= 0.09 * (p.infection / 100) * dt;
      if (p.infection > 60 && !p.infectionWarned) {
        p.infectionWarned = true;
        this.ui?.notify('Febre e calafrios. A infecção está avançando. Antibióticos podem salvar você.', 'danger', '🦠');
      }
    }
    if (p.sick > 0) {
      p.sick = Math.max(0, p.sick - 0.01 * dt);
      p.health -= 0.025 * (p.sick / 100) * dt;
    }
    // Necessidades críticas
    if (p.hunger <= 0) p.health -= 0.05 * dt;
    if (p.thirst <= 0) p.health -= 0.09 * dt;
    if (p.fatigue > 90) { p.stamina = Math.min(p.stamina, 35); p.health -= 0.015 * dt; }

    // Temperatura
    const season = SEASONS[this.seasonIndex];
    let target = 36.8 + season.temp * 0.012;
    if (isNight(this.time)) target -= 0.35;
    target -= (p.wet / 100) * 1.25;
    if (this.weather === 'chuva' || this.weather === 'tempestade') target -= 0.25;
    let insulation = 0;
    for (const s of this.clothingStacks) insulation += ITEMS[s.id].insulation || 0;
    target += insulation * 0.13;
    let nearFire = false;
    for (const st of this.world.structures) {
      if (st.type === 'fogueira' && dist(p.x, p.y, st.x * TILE + 16, st.y * TILE + 16) < 130) nearFire = true;
    }
    if (nearFire) target += 0.9;
    if (this.world.buildingAt(p.x, p.y)) target += 0.2;
    p.temp += (target - p.temp) * Math.min(1, dt / 22);
    if (p.temp < 36.1) p.health -= (36.1 - p.temp) * 0.22 * dt;
    if (p.temp > 38.6) p.health -= (p.temp - 38.6) * 0.16 * dt;

    // Molhado / secagem
    const wdef = WEATHERS[this.weather] || WEATHERS.limpo;
    const rainproof = this.clothingStacks.some(s => ITEMS[s.id].rainproof);
    if (wdef.wet > 0 && !rainproof && !this.world.buildingAt(p.x, p.y)) p.wet = clamp(p.wet + wdef.wet * 4.5 * dt, 0, 100);
    else p.wet = clamp(p.wet - 1.6 * dt * (nearFire ? 3.5 : 1), 0, 100);

    // Regeneração
    if (p.bleed <= 0 && p.infection < 20 && p.hunger > 28 && p.thirst > 28 && p.fatigue < 85 && p.health < p.maxHealth) {
      p.health += 0.035 * dt;
    }
    // Ferimentos
    for (const k of ['leg', 'arm']) {
      if (p.injuries[k] > 0) p.injuries[k] = Math.max(0, p.injuries[k] - 0.0015 * dt);
    }
    p.health = clamp(p.health, 0, p.maxHealth);
    // Avisos de estado
    if (this.clock - p.lastStatus > 30) {
      p.lastStatus = this.clock;
      if (p.hunger < 18) this.ui?.notify('Sua barriga ronca. Você precisa comer.', 'warn', '🍖');
      else if (p.thirst < 18) this.ui?.notify('Sua garganta está seca. Beba algo.', 'warn', '💧');
      else if (p.fatigue > 82) this.ui?.notify('O cansaço pesa. Durma em uma cama.', 'warn', '😴');
      else if (p.temp < 36.0) this.ui?.notify('Você está com hipotermia. Procure calor e roupa seca.', 'danger', '🥶');
      else if (p.infection > 35) this.ui?.notify('A infecção está se espalhando. Use antibióticos.', 'danger', '🦠');
    }
    if (p.health <= 0) this.killPlayer(this.deathReason());
    // Sincroniza barra
    if (this.ui) this.ui.hudDirty = true;
  }

  deathReason() {
    const p = this.player;
    if (p.bleed > 25) return 'perdeu sangue demais';
    if (p.infection > 55) return 'não resistiu à infecção';
    if (p.thirst <= 0) return 'morreu de sede';
    if (p.hunger <= 0) return 'morreu de fome';
    if (p.temp < 35.7) return 'morreu de hipotermia';
    return 'não resistiu aos ferimentos';
  }

  killPlayer(cause) {
    if (this.dead) return;
    if (this.mode !== 'single') {
      if (this.player.downed) return;
      this.player.downed = true;
      this.player.downTimer = 45;
      this.player.health = 0;
      this.ui?.notify('Você caiu! Um aliado pode reanimar você.', 'danger', '💀');
      this.mp?.send({ t: 'down', down: true });
      return;
    }
    this.dead = true;
    this.deathCause = cause;
    audio.play('zombie_die');
    this.ui?.showDeath(cause);
    if (this.mode === 'single') this.ui?.autosave(true);
  }

  damagePlayer(amount, source = 'zumbi', opts = {}) {
    const p = this.player;
    if (this.dead || p.downed) return;
    let armor = 0;
    for (const s of this.clothingStacks) armor += ITEMS[s.id].armor || 0;
    const reduced = Math.max(1, amount - armor * 0.75);
    p.health -= reduced;
    p.lastHurt = this.clock;
    this.hurtFlash = Math.min(1, this.hurtFlash + 0.55);
    this.shake = Math.min(12, this.shake + 4);
    audio.play('hurt');
    this.addFloater(p.x, p.y - 22, `-${Math.round(reduced)}`, '#ff6b63', 1.1);
    if (source === 'zumbi') {
      if (chance(this.world.rng, 0.33 * this.diff.infect)) {
        p.bleed = clamp(p.bleed + randRange(this.world.rng, 12, 30), 0, 100);
        this.ui?.notify('Você está sangrando. Use uma bandagem.', 'danger', '🩸');
      }
      if (chance(this.world.rng, 0.18 * this.diff.infect)) {
        p.infection = clamp(p.infection + randRange(this.world.rng, 5, 13), 0, 100);
      }
      if (chance(this.world.rng, 0.055)) {
        const leg = chance(this.world.rng, 0.5);
        p.injuries[leg ? 'leg' : 'arm'] = Math.min(1, p.injuries[leg ? 'leg' : 'arm'] + 0.35);
        this.ui?.notify(leg ? 'Ferimento na perna. Você está mais lento.' : 'Ferimento no braço. Seus golpes perderam força.', 'danger', '🦴');
      }
    }
    p.health = clamp(p.health, 0, p.maxHealth);
    if (p.health <= 0) this.killPlayer(source === 'fome' ? 'morreu de fome' : 'foi morto por zumbis');
    if (this.ui) this.ui.hudDirty = true;
  }

  healPlayer(amount) {
    this.player.health = clamp(this.player.health + amount, 0, this.player.maxHealth);
    if (this.ui) this.ui.hudDirty = true;
  }

  // ================= MOVIMENTO =================
  updatePlayer(dt) {
    const p = this.player;
    const inp = this.input;
    if (p.downed) {
      p.downTimer -= dt;
      if (p.downTimer <= 0) this.reviveSelf();
      return;
    }
    if (p.inVehicle) {
      p.x = p.inVehicle.x; p.y = p.inVehicle.y; p.angle = p.inVehicle.angle;
      return;
    }
    // mira
    if (inp.pointerActive) {
      const z = this.camera.zoom || 1;
      const wx = this.camera.x + inp.pointerX / z, wy = this.camera.y + inp.pointerY / z;
      p.angle = angleTo(p.x, p.y, wx, wy);
      this.aim.x = wx; this.aim.y = wy; this.aim.active = true;
    } else if (inp.touchAim) {
      p.angle = angleTo(p.x, p.y, inp.touchAim.x, inp.touchAim.y);
      this.aim.x = inp.touchAim.x; this.aim.y = inp.touchAim.y; this.aim.active = true;
    } else {
      const nearest = this.nearestZombie(p.x, p.y, 380);
      if (nearest) { p.angle = angleTo(p.x, p.y, nearest.x, nearest.y); this.aim.x = nearest.x; this.aim.y = nearest.y; this.aim.active = true; }
      else this.aim.active = false;
    }
    let dx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    let dy = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
    const len = Math.hypot(dx, dy);
    let moving = len > 0;
    if (moving) { dx /= len; dy /= len; }
    p.sprinting = inp.sprint && moving && p.stamina > 3;
    let speed = 138 * (1 + (p.skills.condicionamento.level || 0) * 0.018);
    if (p.sprinting) speed *= 1.48;
    else if (inp.sneak) speed *= 0.46;
    if (p.injuries.leg > 0) speed *= 1 - p.injuries.leg * 0.32;
    if (this.weight() > this.capacity()) speed *= 0.62;
    if (p.fatigue > 85) speed *= 0.85;
    if (p.health < 30) speed *= 0.85;
    if (p.hunger < 10 || p.thirst < 10) speed *= 0.9;
    if (moving) {
      const ox = p.x, oy = p.y;
      this.moveEntity(p, dx * speed * dt, dy * speed * dt, 10);
      const moved = dist(ox, oy, p.x, p.y);
      this.stats.distance += moved;
      p.footstep -= dt;
      if (p.footstep <= 0) {
        const noiseR = inp.sneak ? 26 : p.sprinting ? 145 : 62;
        this.emitNoise(p.x, p.y, noiseR, 'passos');
        p.footstep = p.sprinting ? 0.34 : inp.sneak ? 0.8 : 0.52;
      }
    }
    if (p.sprinting) {
      p.stamina -= 15 * dt;
      p.fatigue += 0.008 * dt;
    } else {
      p.stamina += (8.5 + (p.skills.condicionamento.level || 0) * 0.7) * dt;
    }
    p.stamina = clamp(p.stamina, 0, p.maxStamina);
    p.attackCd = Math.max(0, p.attackCd - dt);
    p.swing = Math.max(0, p.swing - dt * 3.4);
    if (inp.attack && p.attackCd <= 0) this.attack();
    this.revealTimer -= dt;
    if (this.revealTimer <= 0) {
      this.revealTimer = 0.35;
      this.world.reveal(Math.floor(p.x / TILE), Math.floor(p.y / TILE), 9);
    }
  }

  moveEntity(e, dx, dy, r) {
    if (!this.world.collidesCircle(e.x + dx, e.y, r)) e.x += dx;
    else e.blocked = true;
    if (!this.world.collidesCircle(e.x, e.y + dy, r)) e.y += dy;
    else e.blocked = true;
    e.x = clamp(e.x, r, this.world.w * TILE - r);
    e.y = clamp(e.y, r, this.world.h * TILE - r);
  }

  setPointer(x, y) {
    this.input.pointerX = x; this.input.pointerY = y; this.input.pointerActive = true;
  }

  nearestZombie(x, y, radius = 1e9) {
    let best = null, bd = radius * radius;
    for (const z of this.zombies) {
      if (z.dead) continue;
      const d = (z.x - x) ** 2 + (z.y - y) ** 2;
      if (d < bd) { bd = d; best = z; }
    }
    return best;
  }

  nearestHostileNPC(x, y, radius = 1e9) {
    let best = null, bd = radius * radius;
    for (const n of this.npcs) {
      if (!n.alive || !n.hostile) continue;
      const d = (n.x - x) ** 2 + (n.y - y) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  // ================= ITENS =================
  getQuickSlots() {
    const inv = this.player.inventory;
    const usable = inv.filter(s => ['food', 'drink', 'med', 'hygiene', 'misc'].includes(ITEMS[s.id]?.type) && ITEMS[s.id].type !== 'valuable');
    const p = this.player;
    const score = s => {
      const d = ITEMS[s.id];
      let v = 0;
      if (p.thirst < 55 && (d.thirst || 0) > 0) v += (60 - p.thirst) + (d.thirst || 0);
      if (p.hunger < 55 && (d.hunger || 0) > 0) v += (60 - p.hunger) + (d.hunger || 0);
      if (p.bleed > 0 && d.bleed) v += 300;
      if (p.infection > 10 && d.infection) v += 200;
      if (p.health < 60 && d.heal) v += (100 - p.health);
      v += (d.value || 0) * 0.05;
      return v;
    };
    return usable.sort((a, b) => score(b) - score(a)).slice(0, 4);
  }

  useQuick(i) {
    const slots = this.getQuickSlots();
    const s = slots[i];
    if (!s) { this.ui?.notify('Nenhum item utilizável nesse espaço.', 'info', '🎒'); return; }
    this.useItem(s);
  }

  useItem(stack) {
    const def = ITEMS[stack.id];
    if (!def || this.dead) return false;
    const p = this.player;
    if (def.type === 'med') {
      const skill = p.skills.primeiros_socorros.level || 0;
      const mult = 1 + skill * 0.07;
      let did = false;
      if (def.bleed && p.bleed > 0) { p.bleed = clamp(p.bleed + def.bleed * 100, 0, 100); did = true; }
      if (def.heal) { this.healPlayer(def.heal * mult); did = true; }
      if (def.infection) { p.infection = clamp(p.infection + def.infection * mult, 0, 100); did = true; }
      if (def.fever) { p.temp = lerp(p.temp, 36.8, 0.4); did = true; }
      if (def.fatigue) p.fatigue = clamp(p.fatigue + def.fatigue, 0, 100);
      if (!did && p.health >= p.maxHealth) { this.ui?.notify('Você não precisa disso agora.', 'info', def.icon); return false; }
      this.grantSkill('primeiros_socorros', def.type === 'med' ? 4 : 1);
      audio.play('heal');
      this.spendGameMinutes(4);
      this.addFloater(p.x, p.y - 26, def.name, '#8be28b', 1.2);
      this.consumeStack(stack, 1);
      return true;
    }
    if (def.type === 'food' || def.type === 'drink') {
      if (def.cooked) {
        // cru: pode comer, mas é arriscado
      }
      p.hunger = clamp(p.hunger + (def.hunger || 0) * (def.type === 'food' && (p.skills.culinaria.level || 0) > 0 ? 1 + p.skills.culinaria.level * 0.02 : 1), 0, 100);
      p.thirst = clamp(p.thirst + (def.thirst || 0), 0, 100);
      if (def.fatigue) p.fatigue = clamp(p.fatigue + def.fatigue, 0, 100);
      if (def.health) p.health = clamp(p.health + def.health, 0, p.maxHealth);
      if (def.morale) p.fatigue = clamp(p.fatigue - def.morale * 0.15, 0, 100);
      if (def.sickChance && chance(this.world.rng, def.sickChance * (1 - (p.skills.culinaria.level || 0) * 0.02))) {
        p.sick = clamp(p.sick + randRange(this.world.rng, 22, 42), 0, 100);
        this.ui?.notify('Seu estômago revira. Você não devia ter comido isso.', 'danger', '🤢');
      }
      this.completeObjective(def.type === 'drink' ? 'drink' : 'eat');
      audio.play(def.type === 'drink' ? 'drink' : 'eat');
      this.spendGameMinutes(def.type === 'food' ? 3 : 1);
      this.addFloater(p.x, p.y - 26, `+${def.type === 'food' ? def.hunger : def.thirst}`, def.type === 'food' ? '#e5c06a' : '#74b9e8', 1.1);
      this.consumeStack(stack, 1);
      return true;
    }
    if (def.type === 'hygiene') {
      p.hygiene = clamp(p.hygiene + (def.hygiene || 25), 0, 100);
      this.spendGameMinutes(6);
      this.ui?.notify('Você se limpou um pouco. A vida parece menos miserável.', 'good', '🧼');
      this.consumeStack(stack, 1);
      return true;
    }
    if (def.type === 'misc' || def.type === 'valuable') {
      if (def.morale) { p.fatigue = clamp(p.fatigue - def.morale, 0, 100); this.ui?.notify('Um pequeno alívio em meio ao caos.', 'good', def.icon); this.consumeStack(stack, 1); this.spendGameMinutes(2); return true; }
      if (def.heal) { this.healPlayer(def.heal); this.consumeStack(stack, 1); return true; }
      this.ui?.notify(def.desc, 'info', def.icon);
      return false;
    }
    if (def.type === 'seed') {
      this.ui?.notify('Plante em um canteiro construído (tecla B).', 'info', '🌱');
      return false;
    }
    this.ui?.notify(`${def.name}: ${def.desc}`, 'info', def.icon);
    return false;
  }

  consumeStack(stack, qty = 1) {
    stack.qty -= qty;
    if (stack.qty <= 0) {
      const i = this.player.inventory.indexOf(stack);
      if (i >= 0) this.player.inventory.splice(i, 1);
    }
    this.player.capacity = this.calcCapacity();
    if (this.ui) this.ui.hudDirty = true;
  }

  equipItem(stack, slot) {
    const def = ITEMS[stack.id];
    if (!def) return;
    if (def.weapon) {
      for (const s of this.player.inventory) if (ITEMS[s.id]?.weapon) s.equipped = false;
      stack.equipped = true;
      this.completeObjective('weapon');
      this.ui?.notify(`${def.name} equipada.`, 'good', def.icon);
    } else if (def.type === 'backpack') {
      for (const s of this.player.inventory) if (ITEMS[s.id]?.type === 'backpack') s.equipped = false;
      stack.equipped = true;
      this.player.capacity = this.calcCapacity();
      this.ui?.notify(`${def.name} equipada. Capacidade: ${this.capacity()} kg.`, 'good', def.icon);
    } else if (def.type === 'clothing') {
      stack.equipped = !stack.equipped;
      this.ui?.notify(`${def.name} ${stack.equipped ? 'vestida' : 'removida'}.`, 'good', def.icon);
    } else if (def.type === 'tool' || def.type === 'misc') {
      this.ui?.notify(def.desc, 'info', def.icon);
    } else if (def.type === 'weapon') {
      this.equipItem(stack, slot);
    }
    if (this.ui) { this.ui.hudDirty = true; this.ui.refreshInventory?.(); }
  }

  dropItem(stack) {
    const p = this.player;
    const angle = p.angle + randRange(this.world.rng, -0.4, 0.4);
    const d = 26 + randRange(this.world.rng, 0, 14);
    const x = clamp(p.x + Math.cos(angle) * d, 20, this.world.w * TILE - 20);
    const y = clamp(p.y + Math.sin(angle) * d, 20, this.world.h * TILE - 20);
    this.groundItems.push({ x, y, stack: { ...stack, equipped: false }, id: uid('gi') });
    const i = p.inventory.indexOf(stack);
    if (i >= 0) p.inventory.splice(i, 1);
    p.capacity = this.calcCapacity();
    this.ui?.refreshInventory?.();
    this.ui?.refreshHUD();
  }

  pickupGround(gi) {
    if (!this.addItem(gi.stack.id, gi.stack.qty, gi.stack.condition)) return;
    const i = this.groundItems.indexOf(gi);
    if (i >= 0) this.groundItems.splice(i, 1);
  }

  toggleFlashlight() {
    if (!this.countItem('lanterna') && !this.player.flashlight) {
      this.ui?.notify('Você não tem uma lanterna.', 'warn', '🔦');
      return;
    }
    this.player.flashlight = !this.player.flashlight;
    audio.play('ui');
    this.ui?.notify(this.player.flashlight ? 'Lanterna ligada.' : 'Lanterna desligada.', 'info', '🔦');
  }

  // ================= SKILLS =================
  grantSkill(skill, amount) {
    const s = this.player.skills[skill];
    if (!s) return;
    const mult = 1 + (this.player.xpBonus || 0);
    s.xp += amount * mult;
    this.addXP(amount * 0.6 * mult);
    let leveled = false;
    while (s.xp >= s.next) {
      s.xp -= s.next;
      s.level++;
      s.next = this.skillNext(s.level);
      leveled = true;
      this.ui?.notify(`${SKILLS[skill].name} nível ${s.level}! ${SKILLS[skill].desc}`, 'skill', SKILLS[skill].icon);
      audio.play('level');
    }
    if (leveled) {
      this.player.capacity = this.calcCapacity();
      this.ui?.refreshSkills?.();
    }
    if (this.ui) this.ui.hudDirty = true;
  }

  addXP(amount) {
    const p = this.player;
    p.xp += amount;
    while (p.xp >= p.xpNext) {
      p.xp -= p.xpNext;
      p.level++;
      p.xpNext = Math.round(p.xpNext * 1.22);
      p.maxHealth += 2;
      p.maxStamina += 1;
      this.ui?.notify(`Nível ${p.level}! Seu corpo se adapta um pouco mais ao mundo.`, 'level', '⭐');
      audio.play('level');
    }
  }

  // ================= OBJETIVOS =================
  completeObjective(id) {
    const o = this.objectives.find(o => o.id === id);
    if (!o || o.done) return;
    o.done = true;
    this.addXP(o.reward);
    this.ui?.notify(`Objetivo concluído: ${o.text} (+${o.reward} XP)`, 'good', o.icon);
    this.ui?.refreshObjectives?.();
  }

  updateObjectives() {
    if (this.flags.firstNightSurvived) this.completeObjective('night');
    if (this.stats.built > 0) {
      if (this.world.structures.some(s => ['fogueira', 'caixa', 'canteiro', 'coletor', 'parede', 'muro_metal'].includes(s.type))) this.completeObjective('shelter');
    }
    if (this.player.inVehicle) this.completeObjective('vehicle');
  }

  // ================= TEMPO / AÇÕES =================
  spendGameMinutes(mins) {
    this.advanceTime(mins);
    const p = this.player;
    p.hunger = clamp(p.hunger - mins * 0.013, 0, 100);
    p.thirst = clamp(p.thirst - mins * 0.019, 0, 100);
    p.fatigue = clamp(p.fatigue + mins * 0.006, 0, 100);
    p.temp = clamp(p.temp, 35, 40);
    if (this.ui) this.ui.hudDirty = true;
  }

  get isNight() { return isNight(this.time); }
  get season() { return SEASONS[this.seasonIndex]; }
  get weatherDef() { return WEATHERS[this.weather] || WEATHERS.limpo; }

  // ================= MULTIPLAYER =================
  updateRemote(dt) {
    for (const rp of this.remotePlayers.values()) {
      rp.renderX = lerp(rp.renderX ?? rp.x, rp.x, Math.min(1, dt * 10));
      rp.renderY = lerp(rp.renderY ?? rp.y, rp.y, Math.min(1, dt * 10));
      rp.anim = (rp.anim || 0) + dt * (rp.moving ? 1 : 0.2);
    }
    for (const z of this.zombies) {
      if (z.remote && z.tx !== undefined) {
        z.x = lerp(z.x, z.tx, Math.min(1, dt * 8));
        z.y = lerp(z.y, z.ty, Math.min(1, dt * 8));
      }
    }
    this.mp?.tick?.(dt);
  }

  receivePlayerState(msg) {
    if (!msg.id || msg.id === this.mp?.selfId) return;
    let rp = this.remotePlayers.get(msg.id);
    if (!rp) {
      rp = { id: msg.id, name: msg.name || 'Sobrevivente', x: msg.x, y: msg.y, angle: 0, hp: 100, downed: false, moving: false, anim: 0, color: msg.color };
      this.remotePlayers.set(msg.id, rp);
      this.ui?.notify(`${rp.name} entrou na área.`, 'mp', '🤝');
      this.ui?.chatPush({ system: true, text: `${rp.name} entrou na partida.` });
    }
    rp.name = msg.name || rp.name;
    rp.x = msg.x; rp.y = msg.y; rp.angle = msg.angle;
    rp.hp = msg.hp; rp.downed = !!msg.downed; rp.moving = !!msg.moving; rp.weapon = msg.weapon;
    rp.color = msg.color || rp.color;
  }

  reviveSelf() {
    if (!this.player.downed) return;
    this.player.downed = false;
    this.player.health = 30;
    this.player.downTimer = 0;
    this.player.x = this.world.start.x; this.player.y = this.world.start.y;
    this.player.bleed = 0; this.player.infection = Math.max(0, this.player.infection - 20);
    this.mp?.send({ t: 'down', down: false });
    this.ui?.notify('Você se arrastou até um esconderijo e sobreviveu. Perdeu parte dos suprimentos?', 'warn', '💀');
    // penalidade: derruba metade dos itens consumíveis
    for (const s of [...this.player.inventory]) {
      if (['food', 'drink', 'med'].includes(ITEMS[s.id]?.type) && chance(this.world.rng, 0.5)) this.consumeStack(s, s.qty);
    }
    if (this.ui) this.ui.refreshHUD();
  }

  // ================= SALVAR =================
  serialize() {
    const p = this.player;
    return {
      v: 2, seed: this.seed, difficulty: this.difficulty, mode: 'single',
      time: this.time, day: this.day, weather: this.weather, weatherTimer: this.weatherTimer,
      clock: this.clock, stats: this.stats, flags: this.flags, objectives: this.objectives,
      player: {
        name: p.name, background: p.background, x: p.x, y: p.y, angle: p.angle,
        health: p.health, maxHealth: p.maxHealth, hunger: p.hunger, thirst: p.thirst,
        fatigue: p.fatigue, stamina: p.stamina, maxStamina: p.maxStamina, temp: p.temp,
        hygiene: p.hygiene, infection: p.infection, bleed: p.bleed, wet: p.wet, sick: p.sick,
        injuries: p.injuries, xp: p.xp, level: p.level, xpNext: p.xpNext, xpBonus: p.xpBonus,
        skills: p.skills, inventory: p.inventory.map(s => ({ ...s })), flashlight: p.flashlight,
        inVehicleId: p.inVehicle?.id || null,
      },
      world: { ...this.world.serialize(), explored: b64FromBytes(this.world.explored) },
      npcs: this.npcs.filter(n => n.alive).map(n => ({
        id: n.id, x: n.x, y: n.y, name: n.name, hostile: n.hostile, trader: n.trader,
        personality: n.personality, following: n.following, hp: n.hp, trade: n.trade, line: n.line, talked: n.talked,
      })),
      groundItems: this.groundItems,
      notesRead: this.world.notesRead || [],
      savedAt: Date.now(),
    };
  }

  loadState(sv) {
    if (!sv || !sv.player) return;
    this.world.applySave(sv.world);
    if (sv.world?.explored) {
      // já aplicado no world; mantém referência
    }
    this.time = sv.time ?? this.time;
    this.day = sv.day ?? 1;
    this.weather = sv.weather || 'limpo';
    this.weatherTimer = sv.weatherTimer || 100;
    this.clock = sv.clock || 0;
    this.stats = { ...this.stats, ...(sv.stats || {}) };
    this.flags = sv.flags || {};
    if (sv.objectives) this.objectives = sv.objectives;
    Object.assign(this.player, sv.player);
    this.player.attackCd = 0; this.player.swing = 0; this.player.downed = false;
    this.player.injuries = this.player.injuries || { leg: 0, arm: 0 };
    this.player.capacity = this.calcCapacity();
    if (sv.player.inVehicleId) {
      const v = this.world.vehicles.find(v => v.id === sv.player.inVehicleId);
      if (v) { v.occupied = true; this.player.inVehicle = v; }
    }
    if (sv.npcs) {
      this.npcs = sv.npcs.map(n => ({
        ...n, angle: 0, state: 'wander', attackCd: 0, alive: true, wander: null,
        idleTimer: 2, speed: n.hostile ? 120 : 80, maxHp: 100, weapon: 'bastao', following: !!n.following,
        anim: 0, hitFlash: 0, downed: false, loseInterest: 0, combatSkill: 2,
      }));
    }
    if (sv.groundItems) this.groundItems = sv.groundItems;
    this.world.notesRead = sv.notesRead || [];
    this.seasonIndex = Math.floor((this.day - 1) / 7) % 4;
  }
}

// métodos de sistemas (IA, combate, veículos, eventos, construção)
Object.assign(Game.prototype, systems);
