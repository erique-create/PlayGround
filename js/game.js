// ---------------------------------------------------------------------------
// Last Light - core simulation. Owns the player, needs, zombies, inventory,
// crafting, building, quests and persistence. Rendering and DOM live elsewhere.
// ---------------------------------------------------------------------------
import { clamp, lerp, dist, findPath, angleDiff, timeOfDayName, uid } from './utils.js';
import { ITEMS, FISTS, RECIPES, BUILD_RECIPES, PROFESSIONS, DIFFICULTIES, SKILLS } from './config.js';
import { World, T } from './world.js';
import { Sound } from './audio.js';

const SAVE_KEY = 'lastlight.save.v1';
const SETTINGS_KEY = 'lastlight.settings.v1';
const HOURS_PER_SEC = 0.05; // one in-game day is about eight real minutes
const LEVEL_XP = [0, 25, 70, 140, 240, 380, 560, 800, 1100, 1500, 2000];
const BLOCKING_STRUCTURES = new Set(['barricade', 'crate', 'rain_collector']);
const PICKUP_RADIUS = 0.62;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.sound = new Sound();
    this.state = 'title';
    this.isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.keys = new Set();
    this.shift = false;
    this.joy = null;
    this.touch = { sprint: false, crouch: false };
    this.mouse = { x: 0, y: 0, active: false };
    this.inputLocked = false;
    this.paused = false;
    this.renderer = null;
    this.ui = null;
    this.world = null;
    this.player = null;
    this.zombies = [];
    this.effects = [];
    this.floaters = [];
    this.particles = [];
    this.decals = [];
    this.groundItems = [];
    this.inventory = [];
    this.equipped = { weapon: null, light: null, backpack: null, armor: null };
    this.skills = {};
    this.skillXp = {};
    this.hour = 8;
    this.day = 1;
    this.totalHours = 8;
    this.weather = { type: 'clear', intensity: 0, flash: 0, next: 14 };
    this.dead = false;
    this.damageFlash = 0;
    this.fade = 0;
    this.shake = 0;
    this.muzzleFlash = 0;
    this.nearestInteract = null;
    this.buildMode = null;
    this.stepTimer = 0;
    this.exploreTimer = 0;
    this.pathBudget = 7;
    this.autosaveT = 0;
    this.hudT = 0;
    this.frameT = 0;
    this.notifyCd = {};
    this.pathBudget = 7;
    this.quests = { looted: 0, killed: 0, campfire: false, extracted: false };
    this.stats = { kills: 0, looted: 0, crafted: 0, built: 0, damage: 0, distance: 0, started: Date.now() };
    this.lastDay = 1;
    this.quality = 'auto';
    this.settings = this.loadSettings();
    this.loop = this.loop.bind(this);
  }

  // ------------------------------------------------------------- settings
  loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) return Object.assign({ sound: true, volume: 0.65, quality: 'auto', autoSprint: false }, JSON.parse(raw));
    } catch (e) { /* ignore */ }
    return { sound: true, volume: 0.65, quality: 'auto', autoSprint: false };
  }

  saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (e) { /* ignore */ }
    this.sound.enabled = this.settings.sound;
    this.sound.setVolume(this.settings.volume);
  }

  defaultProfile() {
    return { name: 'Avery', profession: 'survivor', difficulty: 'normal' };
  }

  // ------------------------------------------------------------- new game
  newGame(profile = {}) {
    const p = Object.assign(this.defaultProfile(), profile);
    p.name = (p.name || 'Avery').slice(0, 18);
    p.profession = PROFESSIONS[p.profession] ? p.profession : 'survivor';
    p.difficulty = DIFFICULTIES[p.difficulty] ? p.difficulty : 'normal';
    this.profile = p;
    this.settings.sound = this.settings.sound !== false;
    this.saveSettings();
    const diff = DIFFICULTIES[p.difficulty];
    this.seed = profile.seed || (Math.floor(Math.random() * 1e9) >>> 0);
    this.world = new World(this.seed, diff);
    this.world.structures = [];
    this.world.exploredDirty = true;
    const prof = PROFESSIONS[p.profession];
    this.player = {
      name: p.name,
      profession: p.profession,
      x: this.world.spawn.x,
      y: this.world.spawn.y,
      facing: { x: 0.75, y: 0.66 },
      health: p.profession === 'veteran' ? 120 : 100,
      maxHealth: p.profession === 'veteran' ? 120 : 100,
      stamina: 100,
      maxStamina: p.profession === 'farmer' ? 120 : 100,
      hunger: 82,
      thirst: 76,
      fatigue: 18,
      warmth: 64,
      stress: 10,
      pain: 0,
      bleeding: 0,
      infection: 0,
      fracture: 0,
      wet: 0,
      moving: false,
      movePhase: 0,
      crouch: false,
      sprinting: false,
      swing: 0,
      swingTime: 0.3,
      attackCd: 0,
      flashlightOn: false,
      backpackItem: null,
      jacketItem: null,
      lightItem: null,
      color: p.color || '#c59a73',
    };
    this.inventory = [];
    this.equipped = { weapon: null, light: null, backpack: null, armor: null };
    this.zombies = [];
    this.effects = [];
    this.floaters = [];
    this.particles = [];
    this.decals = [];
    this.groundItems = [];
    this.skills = {};
    this.skillXp = {};
    for (const key of Object.keys(SKILLS)) {
      const level = prof.skills[key] || 0;
      this.skills[key] = level;
      this.skillXp[key] = LEVEL_XP[level] || 0;
    }
    this.totalHours = 8;
    this.hour = 8;
    this.day = 1;
    this.lastDay = 1;
    this.weather = { type: 'clear', intensity: 0.2, flash: 0, next: 16 };
    this.quests = { looted: 0, killed: 0, campfire: false, extracted: false };
    this.stats = { kills: 0, looted: 0, crafted: 0, built: 0, damage: 0, distance: 0, started: Date.now() };
    this.dead = false;
    this.paused = false;
    this.inputLocked = false;
    this.fade = 1;
    this.damageFlash = 0;
    this.shake = 0;
    this.muzzleFlash = 0;
    this.buildMode = null;
    this.nearestInteract = null;
    this.autosaveT = 0;
    for (const it of prof.items) this.addItem(it.id, it.qty || 1, undefined, true);
    // Auto-equip the obvious starting kit.
    for (const entry of [...this.inventory]) {
      const def = ITEMS[entry.id];
      if (!def) continue;
      if (def.equip === 'weapon') this.equip(entry, true);
      else if (def.equip === 'backpack') this.equip(entry, true);
      else if (def.equip === 'armor') this.equip(entry, true);
    }
    if (this.world.waypoint) this.world.waypoint = null;
    this.spawnInitialZombies();
    this.state = 'playing';
    this.ui?.enterGame();
    this.save();
    this.notify('Day 1. Find supplies and keep moving.', 'info');
    return true;
  }

  // ------------------------------------------------------------- save/load
  hasSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      return !!(d && d.v === 2);
    } catch (e) { return false; }
  }

  serialize() {
    if (!this.player || !this.world) return null;
    return {
      v: 2,
      seed: this.seed,
      profile: this.profile,
      totalHours: this.totalHours,
      weather: this.weather,
      player: { ...this.player },
      inventory: this.inventory,
      equipped: this.equipped,
      skills: this.skills,
      skillXp: this.skillXp,
      zombies: this.zombies.map(z => ({
        x: z.x, y: z.y, homeX: z.homeX, homeY: z.homeY, health: z.health, maxHealth: z.maxHealth,
        speed: z.speed, perception: z.perception, damage: z.damage, facing: z.facing,
        phase: z.phase, state: z.state, variant: z.variant, shirt: z.shirt, pants: z.pants, skin: z.skin,
      })),
      structures: this.world.structures,
      groundItems: this.groundItems,
      decals: this.decals.slice(-70),
      quests: this.quests,
      stats: this.stats,
      world: this.world.serialize(),
    };
  }

  save() {
    if (!this.player || this.dead) return false;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.serialize()));
      return true;
    } catch (e) {
      this.notify('Save failed: storage is full.', 'bad');
      return false;
    }
  }

  deleteSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  }

  load() {
    let d;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      d = JSON.parse(raw);
    } catch (e) { return false; }
    if (!d || d.v !== 2 || !d.seed || !d.player) return false;
    this.profile = d.profile || this.defaultProfile();
    const diff = DIFFICULTIES[this.profile.difficulty] || DIFFICULTIES.normal;
    this.seed = d.seed;
    this.world = new World(this.seed, diff);
    this.world.applySave(d.world);
    this.world.structures = Array.isArray(d.structures) ? d.structures : [];
    this.applyStructureSolids();
    this.player = Object.assign({
      name: 'Avery', profession: 'survivor', x: this.world.spawn.x, y: this.world.spawn.y,
      facing: { x: 0.7, y: 0.7 }, health: 100, maxHealth: 100, stamina: 100, maxStamina: 100,
      hunger: 80, thirst: 80, fatigue: 20, warmth: 60, stress: 10, pain: 0, bleeding: 0,
      infection: 0, fracture: 0, wet: 0, moving: false, movePhase: 0, crouch: false,
      sprinting: false, swing: 0, swingTime: 0.3, attackCd: 0, flashlightOn: false,
      backpackItem: null, jacketItem: null, lightItem: null,
    }, d.player || {});
    this.inventory = Array.isArray(d.inventory) ? d.inventory : [];
    this.equipped = Object.assign({ weapon: null, light: null, backpack: null, armor: null }, d.equipped || {});
    this.refreshEquipmentFlags();
    this.skills = Object.assign({}, d.skills || {});
    this.skillXp = Object.assign({}, d.skillXp || {});
    for (const key of Object.keys(SKILLS)) {
      if (this.skillXp[key] == null) this.skillXp[key] = LEVEL_XP[this.skills[key] || 0] || 0;
    }
    this.totalHours = d.totalHours ?? 8;
    this.hour = this.totalHours % 24;
    this.day = Math.floor(this.totalHours / 24) + 1;
    this.lastDay = this.day;
    this.weather = d.weather || { type: 'clear', intensity: 0.2, flash: 0, next: this.totalHours + 5 };
    this.weather.flash = 0;
    this.zombies = (d.zombies || []).map(z => this.makeZombie(z.x, z.y, z));
    this.groundItems = d.groundItems || [];
    this.decals = d.decals || [];
    this.quests = Object.assign({ looted: 0, killed: 0, campfire: false, extracted: false }, d.quests || {});
    this.stats = Object.assign({ kills: 0, looted: 0, crafted: 0, built: 0, damage: 0, distance: 0, started: Date.now() }, d.stats || {});
    this.dead = false;
    this.paused = false;
    this.inputLocked = false;
    this.effects = [];
    this.floaters = [];
    this.particles = [];
    this.fade = 1;
    this.damageFlash = 0;
    this.shake = 0;
    this.buildMode = null;
    this.nearestInteract = null;
    this.state = 'playing';
    this.sound.enabled = this.settings.sound;
    this.sound.setVolume(this.settings.volume);
    const wt = this.weather?.type;
    this.sound.setRain(wt === 'storm' ? 'storm' : wt === 'rain' ? 'rain' : 'clear', this.weather?.intensity || 0);
    this.ui?.enterGame();
    this.notify('Welcome back, ' + this.player.name + '.', 'info');
    return true;
  }

  applyStructureSolids() {
    if (!this.world || !this.world.structures) return;
    for (const s of this.world.structures) {
      if (!BLOCKING_STRUCTURES.has(s.type)) continue;
      if (this.world.inBounds(s.x, s.y)) this.world.solid[this.world.idx(s.x, s.y)] = 1;
    }
  }

  // --------------------------------------------------------------- input
  bindInput() {
    window.addEventListener('keydown', e => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const gameKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
      if (gameKeys.includes(e.code) && this.state === 'playing') e.preventDefault();
      if (this.state !== 'playing' || this.paused || this.inputLocked) return;
      this.keys.add(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.shift = true;
      if (e.code === 'Space' && !e.repeat) this.attack();
      if (e.code === 'KeyE' && !e.repeat) this.interact();
      if (e.code === 'KeyC' && !e.repeat) this.toggleCrouch();
      if (e.code === 'KeyF' && !e.repeat) this.toggleFlashlight();
      if (e.code === 'KeyR' && !e.repeat) this.reloadHint();
    });
    window.addEventListener('keyup', e => {
      this.keys.delete(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.shift = false;
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.shift = false; });
    this.canvas.addEventListener('pointermove', e => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
      this.mouse.active = e.pointerType !== 'touch';
    });
    this.canvas.addEventListener('pointerleave', () => { this.mouse.active = false; });
    this.canvas.addEventListener('pointerdown', e => {
      if (this.state !== 'playing' || this.paused || this.inputLocked) return;
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
      if (e.pointerType === 'touch') return;
      this.mouse.active = true;
      if (this.buildMode) { this.placeStructure(); return; }
      if (e.button === 2) { this.interact(); return; }
      this.faceScreen(this.mouse.x, this.mouse.y);
      this.attack();
    });
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.state === 'playing' && !this.dead) this.save();
        this.keys.clear();
        this.shift = false;
      }
    });
  }

  faceScreen(sx, sy) {
    if (!this.renderer || !this.player) return;
    const w = this.renderer.screenToWorld(sx, sy);
    const dx = w.x - this.player.x, dy = w.y - this.player.y;
    const l = Math.hypot(dx, dy);
    if (l > 0.05) this.player.facing = { x: dx / l, y: dy / l };
  }

  faceNearestZombie(maxDist = 7) {
    if (!this.player) return false;
    let best = null, bd = maxDist * maxDist;
    for (const z of this.zombies) {
      if (z.health <= 0) continue;
      const d = (z.x - this.player.x) ** 2 + (z.y - this.player.y) ** 2;
      if (d < bd) { bd = d; best = z; }
    }
    if (!best) return false;
    const dx = best.x - this.player.x, dy = best.y - this.player.y;
    const l = Math.hypot(dx, dy) || 1;
    this.player.facing = { x: dx / l, y: dy / l };
    return true;
  }

  setJoystick(sx, sy) {
    const mag = Math.hypot(sx, sy);
    if (mag < 0.12) { this.joy = null; return; }
    const x = sx / 64 + sy / 32;
    const y = sy / 32 - sx / 64;
    const l = Math.hypot(x, y) || 1;
    this.joy = { x: x / l, y: y / l, mag: Math.min(1, mag) };
  }

  toggleCrouch() {
    if (!this.player) return;
    this.player.crouch = !this.player.crouch;
    this.touch.crouch = this.player.crouch;
    if (this.player.crouch) this.touch.sprint = false;
    this.sound.click();
  }

  toggleSprint() {
    this.touch.sprint = !this.touch.sprint;
    if (this.touch.sprint) {
      this.touch.crouch = false;
      if (this.player) this.player.crouch = false;
    }
    this.sound.click();
  }

  toggleFlashlight() {
    const light = this.equipped.light;
    if (!light || !light.dur) { this.notify('No light equipped.', 'warn'); return; }
    this.player.flashlightOn = !this.player.flashlightOn;
    this.sound.click();
  }

  reloadHint() {
    const w = this.getWeapon();
    if (w.weapon.ranged) {
      const ammo = this.countItem('ammo');
      this.notify(ammo ? `${ammo} rounds loaded.` : 'No 9mm rounds.', ammo ? 'info' : 'warn');
    }
  }

  loop(ts) {
    const now = ts / 1000;
    let dt = this.frameT ? now - this.frameT : 0.016;
    this.frameT = now;
    dt = clamp(dt, 0, 0.05);
    if (this.world && this.player) {
      if (this.state === 'playing' && !this.paused && !this.inputLocked) this.update(dt);
      else this.updateIdle(dt);
      this.renderer?.render(dt);
      this.hudT += dt;
      if (this.hudT > 0.1) { this.hudT = 0; this.ui?.frame(dt); }
    }
    requestAnimationFrame(this.loop);
  }

  updateIdle(dt) {
    this.fade = Math.max(0, this.fade - dt * 1.4);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.4);
    this.shake = Math.max(0, this.shake - dt * 3);
    this.muzzleFlash = Math.max(0, this.muzzleFlash - dt * 4);
    this.weather.flash = Math.max(0, this.weather.flash - dt * 2.4);
    this.updateEffects(dt);
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    this.pathBudget = 7;
    this.fade = Math.max(0, this.fade - dt * 1.4);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.4);
    this.shake = Math.max(0, this.shake - dt * 3);
    this.muzzleFlash = Math.max(0, this.muzzleFlash - dt * 4);
    this.updateTime(dt);
    this.updateWeather(dt);
    this.updateSurvival(dt);
    this.updatePlayer(dt);
    this.updateZombies(dt);
    this.updateEffects(dt);
    this.updateFarming(dt * HOURS_PER_SEC);
    this.updateInteraction();
    this.updateGroundPickup();
    this.maintainHorde(dt);
    this.updateExploration(dt);
    this.autosaveT += dt;
    if (this.autosaveT > 25) {
      this.autosaveT = 0;
      this.save();
    }
  }

  updateTime(dt) {
    const before = this.totalHours;
    this.totalHours += dt * HOURS_PER_SEC;
    this.hour = this.totalHours % 24;
    const day = Math.floor(this.totalHours / 24) + 1;
    if (day !== this.lastDay) {
      this.lastDay = day;
      this.day = day;
      this.notify(`Day ${day}. The dead are still here.`, 'warn');
      this.save();
    }
    this.day = day;
    if (before < 6 && this.totalHours >= 6) this.notify('Dawn breaks. You made it through the night.', 'info');
    if (before < 20 && this.totalHours >= 20 && this.totalHours < 22) this.notify('Night is coming. Find shelter or light.', 'warn');
  }

  updateWeather(dt) {
    const w = this.weather;
    if (this.totalHours >= (w.next || 0)) this.chooseWeather();
    w.flash = Math.max(0, w.flash - dt * 2.4);
    if ((w.type === 'storm' || w.type === 'rain') && Math.random() < dt * (w.type === 'storm' ? 0.16 : 0.025)) {
      w.flash = 1;
      this.sound.thunder();
    }
    if (this.player) {
      const raining = w.type === 'rain' || w.type === 'storm';
      this.player.wet = clamp(this.player.wet + (raining ? dt * 7 * w.intensity : -dt * 2.5), 0, 100);
    }
  }

  chooseWeather() {
    const roll = Math.random();
    let type = 'clear';
    if (roll < 0.5) type = 'clear';
    else if (roll < 0.75) type = 'rain';
    else if (roll < 0.87) type = 'fog';
    else type = 'storm';
    const intensity = type === 'clear' ? 0.15 : 0.45 + Math.random() * 0.55;
    this.weather = {
      type,
      intensity,
      flash: 0,
      next: this.totalHours + 2.5 + Math.random() * 4.5,
    };
    this.sound.ensure();
    this.sound.setRain(type === 'storm' ? 'storm' : type === 'rain' ? 'rain' : 'clear', intensity);
    if (type === 'storm') this.notify('A storm rolls in. Visibility and sound are unreliable.', 'warn');
    else if (type === 'fog') this.notify('Fog settles over the town.', 'info');
    else if (type === 'rain') this.notify('Rain begins to fall.', 'info');
  }

  weatherName() {
    const w = this.weather;
    if (w.type === 'rain') return 'Rain';
    if (w.type === 'storm') return 'Storm';
    if (w.type === 'fog') return 'Fog';
    return 'Clear';
  }

  temperature() {
    const h = this.hour;
    let t = 15 + 7 * Math.sin(((h - 9) / 24) * Math.PI * 2);
    const w = this.weather;
    if (w.type === 'rain') t -= 4 * w.intensity;
    if (w.type === 'storm') t -= 6 * w.intensity;
    if (w.type === 'fog') t -= 2;
    if (this.player) t += (this.player.warmth - 60) * 0.06;
    return Math.round(t);
  }

  nearHeat(radius = 2.8) {
    if (!this.world || !this.player) return false;
    const p = this.player;
    for (const s of this.world.structures || []) {
      if (s.type === 'campfire' && dist(p.x, p.y, s.x + 0.5, s.y + 0.5) < radius) return true;
    }
    for (const pr of this.world.props) {
      if (pr.type !== 'stove') continue;
      if (dist(p.x, p.y, pr.x + 0.5, pr.y + 0.5) < radius) return true;
    }
    return false;
  }

  updateSurvival(dt) {
    const p = this.player;
    if (!p) return;
    const diff = DIFFICULTIES[this.profile?.difficulty] || DIFFICULTIES.normal;
    const dh = dt * HOURS_PER_SEC * (diff.drain || 1);
    p.hunger = clamp(p.hunger - 4.1 * dh, 0, 100);
    p.thirst = clamp(p.thirst - 5.3 * dh, 0, 100);
    p.fatigue = clamp(p.fatigue + 3.3 * dh, 0, 100);
    p.pain = clamp(p.pain - 9 * dh, 0, 100);
    p.bleeding = clamp(p.bleeding - 1.2 * dh, 0, 100);
    if (p.infection > 0) p.infection = clamp(p.infection + 1.4 * dh, 0, 100);
    const night = this.hour < 7 || this.hour > 19.5;
    const heat = this.nearHeat(3);
    let warmthTarget = 58 + (night ? -18 : 14) + (this.weather.type === 'rain' || this.weather.type === 'storm' ? -14 : 0);
    if (this.equipped.armor) warmthTarget += ITEMS[this.equipped.armor.id]?.warmth || 0;
    if (heat) warmthTarget += 26;
    if (p.wet > 40) warmthTarget -= (p.wet - 40) * 0.18;
    p.warmth = lerp(p.warmth, clamp(warmthTarget, 0, 100), clamp(dh * 0.9, 0, 1));
    let stressTarget = 10 + (night ? 8 : 0) + (p.health < 40 ? 22 : 0) + (p.hunger < 25 ? 15 : 0) + (p.thirst < 25 ? 12 : 0);
    if (heat) stressTarget -= 16;
    if (this.zombies.some(z => z.health > 0 && z.state === 'chase' && dist(z.x, z.y, p.x, p.y) < 10)) stressTarget += 18;
    p.stress = lerp(p.stress, clamp(stressTarget, 0, 100), clamp(dh * 0.8, 0, 1));
    if (p.bleeding > 0) p.health -= p.bleeding * 0.12 * dh;
    if (p.infection > 30) p.health -= p.infection * 0.03 * dh;
    if (p.warmth < 25) p.health -= (25 - p.warmth) * 0.1 * dh;
    if (p.hunger <= 0) p.health -= 3.2 * dh;
    if (p.thirst <= 0) p.health -= 4.2 * dh;
    const safe = p.hunger > 40 && p.thirst > 40 && p.bleeding <= 0 && p.infection < 30;
    if (safe && p.health > 0) p.health = Math.min(p.maxHealth, p.health + 1.6 * dh);
    const lowStam = p.fatigue > 80 || p.hunger < 15 || p.thirst < 15;
    p.stamina = clamp(p.stamina + (p.sprinting ? 0 : lowStam ? 4 : 11) * dt, 0, p.maxStamina);
    if (p.health <= 0) this.die('Your body gave out.');
    // Heartbeat when badly hurt.
    if (p.health < 32) {
      this.heartT = (this.heartT || 0) + dt;
      if (this.heartT > 1.15) { this.heartT = 0; this.sound.heartbeat(); }
    }
  }

  updatePlayer(dt) {
    const p = this.player;
    if (!p) return;
    p.attackCd = Math.max(0, p.attackCd - dt);
    p.swing = Math.max(0, p.swing - dt);
    // Movement input: keyboard produces screen-space directions.
    let sx = 0, sy = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) sy -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) sy += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) sx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) sx += 1;
    let dir = null, mag = 1;
    if (sx || sy) {
      const l = Math.hypot(sx, sy);
      sx /= l; sy /= l;
      const wx = sx / 64 + sy / 32;
      const wy = sy / 32 - sx / 64;
      const wl = Math.hypot(wx, wy) || 1;
      dir = { x: wx / wl, y: wy / wl };
    } else if (this.joy) {
      dir = { x: this.joy.x, y: this.joy.y };
      mag = this.joy.mag;
    }
    const wantsSprint = (this.shift || this.touch.sprint) && !p.crouch;
    const canSprint = p.stamina > 4 && p.fatigue < 98 && p.hunger > 3 && p.thirst > 3;
    const sprinting = !!(dir && wantsSprint && canSprint);
    p.sprinting = sprinting;
    if (sprinting) p.stamina = clamp(p.stamina - 15 * dt, 0, p.maxStamina);
    let speed = p.crouch ? 1.18 : sprinting ? 3.75 : 2.2;
    if (p.fracture > 0) speed *= 0.7;
    if (p.pain > 30) speed *= 1 - Math.min(0.2, (p.pain - 30) * 0.0028);
    if (p.fatigue > 75) speed *= 0.92;
    const load = this.getWeight() / Math.max(1, this.getCapacity());
    if (load > 0.85) speed *= 1 - Math.min(0.18, (load - 0.85) * 0.55);
    if (p.hunger < 15 || p.thirst < 15) speed *= 0.94;
    if (this.weather.type === 'storm') speed *= 0.96;
    if (dir) {
      const step = speed * mag * dt;
      const dx = dir.x * step, dy = dir.y * step;
      const beforeX = p.x, beforeY = p.y;
      if (!this.blockedCircle(p.x + dx, p.y)) p.x += dx;
      if (!this.blockedCircle(p.x, p.y + dy)) p.y += dy;
      const moved = dist(beforeX, beforeY, p.x, p.y);
      p.moving = moved > 0.0004;
      if (p.moving) {
        p.movePhase += dt * (sprinting ? 7.5 : p.crouch ? 3.4 : 5.1);
        p.facing = { x: dir.x, y: dir.y };
        this.stats.distance += moved;
        this.stepTimer -= dt;
        if (this.stepTimer <= 0) {
          this.stepTimer = sprinting ? 0.27 : p.crouch ? 0.62 : 0.43;
          const indoors = !!this.world.buildingInside(p.x, p.y);
          this.sound.step(sprinting, indoors);
          this.makeNoise(p.x, p.y, sprinting ? 4.4 : p.crouch ? 0.7 : 2.1, 'step');
        }
      }
    } else {
      p.moving = false;
      if (this.mouse.active && !this.isTouch) this.faceScreen(this.mouse.x, this.mouse.y);
    }
    if (p.flashlightOn && this.equipped.light) {
      const entry = this.equipped.light;
      entry.dur = Math.max(0, (entry.dur || 0) - dt * 0.22);
      if (entry.dur <= 0) {
        p.flashlightOn = false;
        this.notify('Your light dies. Replace the battery.', 'bad');
      }
    }
    if (this.buildMode) this.updateBuildGhost();
    // Keep inside the world.
    p.x = clamp(p.x, 0.4, this.world.size - 0.4);
    p.y = clamp(p.y, 0.4, this.world.size - 0.4);
  }

  blockedCircle(x, y) {
    if (!this.world) return true;
    const r = 0.29;
    return !this.world.walkable(x - r, y - r) || !this.world.walkable(x + r, y - r)
      || !this.world.walkable(x - r, y + r) || !this.world.walkable(x + r, y + r);
  }

  updateEffects(dt) {
    for (const e of this.effects) e.life -= dt;
    this.effects = this.effects.filter(e => e.life > 0);
    for (const f of this.floaters) { f.life -= dt; f.y -= dt * 0.15; }
    this.floaters = this.floaters.filter(f => f.life > 0);
    for (const p of this.particles) {
      p.life -= dt;
      if (p.grav) p.z = Math.max(0, p.z + p.vz * dt);
      else p.z += p.vz * dt;
      p.ox += p.vx * dt;
      p.oy += p.vy * dt;
      if (p.kind !== 'spark') p.vz += 3.2 * dt;
    }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const d of this.decals) if (d.type === 'blood') d.alpha = Math.max(0.15, (d.alpha || 1) - dt * 0.004);
    if (this.decals.length > 90) this.decals.splice(0, this.decals.length - 90);
  }

  updateGroundPickup() {
    if (!this.player) return;
    for (let i = this.groundItems.length - 1; i >= 0; i--) {
      const gi = this.groundItems[i];
      if (dist(gi.x, gi.y, this.player.x, this.player.y) > PICKUP_RADIUS) continue;
      const def = ITEMS[gi.id];
      if (!def) { this.groundItems.splice(i, 1); continue; }
      if (this.addItem(gi.id, gi.qty || 1, gi.dur)) {
        this.groundItems.splice(i, 1);
        this.notify(`Picked up ${def.icon} ${def.name}${gi.qty > 1 ? ' x' + gi.qty : ''}.`, 'good', 900);
        this.sound.pickup();
        this.gainSkill('survival', 1);
      } else {
        this.notify('Too heavy to pick that up.', 'warn', 2200);
      }
    }
  }

  updateExploration(dt) {
    this.exploreTimer += dt;
    if (this.exploreTimer < 0.45) return;
    this.exploreTimer = 0;
    const p = this.player;
    const radius = p.flashlightOn ? 8 : 9.5;
    this.world.markExplored(p.x, p.y, radius);
    this.world.discoverBuildings(p.x, p.y, 15);
    const b = this.world.buildingInside(p.x, p.y);
    if (b && !b.seen) { b.seen = true; this.notify(`Entered ${b.name}.`, 'info', 4000); }
    this.checkExtractionReady();
  }

  maintainHorde(dt) {
    this.hordeT = (this.hordeT || 0) + dt;
    if (this.hordeT < 6) return;
    this.hordeT = 0;
    const diff = DIFFICULTIES[this.profile?.difficulty] || DIFFICULTIES.normal;
    const night = this.hour < 6.5 || this.hour > 20;
    const cap = Math.round((night ? 48 : 34) * (diff.zed || 1));
    if (this.zombies.length >= cap) return;
    const n = Math.random() < 0.6 ? 1 : 2;
    for (let i = 0; i < n && this.zombies.length < cap; i++) this.spawnZombieNearPlayer();
  }

  spawnZombieNearPlayer() {
    for (let attempt = 0; attempt < 24; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 20 + Math.random() * 26;
      const x = this.player.x + Math.cos(ang) * r;
      const y = this.player.y + Math.sin(ang) * r;
      if (!this.world.walkable(x, y)) continue;
      const z = this.makeZombie(x, y);
      this.zombies.push(z);
      return z;
    }
    return null;
  }

  spawnInitialZombies() {
    const count = Math.round(26 * (DIFFICULTIES[this.profile?.difficulty]?.zed || 1));
    let placed = 0;
    for (let attempt = 0; attempt < 900 && placed < count; attempt++) {
      const x = 4 + Math.random() * (this.world.size - 8);
      const y = 4 + Math.random() * (this.world.size - 8);
      if (dist(x, y, this.world.spawn.x, this.world.spawn.y) < 14) continue;
      if (!this.world.walkable(x, y)) continue;
      if (Math.random() > 0.72) {
        // Bias toward the town and buildings.
        if (dist(x, y, 64, 62) > 42) continue;
      }
      this.zombies.push(this.makeZombie(x, y));
      placed++;
    }
  }

  updateInteraction() {
    if (!this.player || !this.world) return;
    const p = this.player;
    let best = null;
    const take = (kind, target, label, action, range = 1.75) => {
      const d = dist(p.x, p.y, (target.x ?? 0) + 0.5, (target.y ?? 0) + 0.5);
      if (d <= range && (!best || d < best.d)) best = { kind, target, label, action, d };
    };
    for (const c of this.world.containers) take('container', c, `${c.searched ? 'Search again' : 'Search'} ${c.name}`, 'open', 1.65);
    for (const s of this.world.structures || []) {
      if (s.type === 'campfire') take('structure', s, 'Cook at campfire', 'cook', 1.8);
      else if (s.type === 'crate') take('structure', s, 'Open storage crate', 'open', 1.8);
      else if (s.type === 'farm_plot') {
        if (!s.planted) take('structure', s, 'Plant seeds', 'plant', 1.8);
        else if ((s.growth || 0) >= 1) take('structure', s, 'Harvest crop', 'harvest', 1.8);
        else take('structure', s, 'Water crop', 'water_plot', 1.8);
      } else if (s.type === 'rain_collector') take('structure', s, 'Collect rainwater', 'collect_water', 1.8);
      else if (s.type === 'bedroll') take('structure', s, 'Sleep in bedroll', 'sleep', 1.8);
      else if (s.type === 'barricade') take('structure', s, 'Inspect barricade', 'inspect', 1.7);
    }
    const props = this.world.props;
    for (const pr of props) {
      if (pr.type === 'well') take('prop', pr, 'Draw well water', 'well', 2.0);
      else if (pr.type === 'stove') take('prop', pr, 'Use the stove', 'cook', 2.0);
      else if (pr.type === 'bed') take('prop', pr, 'Sleep in the bed', 'sleep', 2.0);
      else if (pr.type === 'dumpster') take('prop', pr, 'Search dumpster', 'open', 2.0);
    }
    // Lake/river access
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const tx = Math.floor(p.x) + ox, ty = Math.floor(p.y) + oy;
      if (this.world.terrainAt(tx, ty) === T.WATER) {
        take('water', { x: tx, y: ty }, 'Drink from the lake', 'lake', 1.9);
      }
    }
    const school = this.world.buildings.find(b => b.type === 'school');
    if (school) {
      const cx = school.x + school.w / 2, cy = school.y + school.h / 2;
      if (dist(p.x, p.y, cx, cy) < Math.max(school.w, school.h) * 0.62) {
        const ready = this.extractionReady();
        const label = ready ? 'Signal the evac convoy' : this.totalHours < 54 ? 'Evac arrives Day 3, 06:00' : 'Complete your objectives first';
        best = { kind: 'extract', target: { x: cx - 0.5, y: cy - 0.5 }, label, action: 'extract', d: 0.01 };
      }
    }
    this.nearestInteract = best;
  }

  updateFarming(dh) {
    if (!this.world) return;
    const growMul = this.player?.profession === 'farmer' ? 1.3 : 1;
    const rain = this.weather.type === 'rain' || this.weather.type === 'storm' ? 1.35 : 1;
    for (const s of this.world.structures || []) {
      if (s.type === 'farm_plot' && s.planted && (s.growth || 0) < 1) {
        s.growth = clamp((s.growth || 0) + (dh / 34) * growMul * rain, 0, 1);
      } else if (s.type === 'rain_collector') {
        if (this.weather.type === 'rain' || this.weather.type === 'storm') {
          s.water = clamp((s.water || 0) + dh * 0.42 * this.weather.intensity, 0, 4);
        }
      }
    }
  }

  // --------------------------------------------------------------- zombies
  makeZombie(x, y, opts = {}) {
    const r = Math.random;
    const health = opts.health ?? (36 + r() * 28);
    const facing = opts.facing || { x: Math.cos(r() * 6.28), y: Math.sin(r() * 6.28) };
    const fl = Math.hypot(facing.x, facing.y) || 1;
    return {
      x, y,
      homeX: opts.homeX ?? x,
      homeY: opts.homeY ?? y,
      health,
      maxHealth: opts.maxHealth ?? health,
      speed: opts.speed ?? (0.82 + r() * 0.55),
      perception: opts.perception ?? (6.2 + r() * 3.4),
      damage: opts.damage ?? (6 + r() * 5),
      facing: { x: facing.x / fl, y: facing.y / fl },
      phase: opts.phase ?? r() * 6.28,
      state: opts.state || 'idle',
      variant: opts.variant ?? Math.floor(r() * 6),
      shirt: opts.shirt || ['#5a5a48', '#4c5550', '#5e4b46', '#454f56', '#625a43', '#51453f'][Math.floor(r() * 6)],
      pants: opts.pants || ['#3b3f3a', '#45443a', '#353b40', '#4a4137'][Math.floor(r() * 4)],
      skin: opts.skin || ['#8c967a', '#9aa083', '#7f8a71', '#a0a082'][Math.floor(r() * 4)],
      attackCd: 0,
      alert: 0,
      path: null,
      pathIdx: 0,
      pathTimer: r() * 1.2,
      wanderT: r() * 4,
      wanderTarget: null,
      target: null,
      lastSeen: null,
      lostT: 0,
      investigateT: 0,
      dead: false,
    };
  }

  updateZombies(dt) {
    if (!this.player) return;
    const p = this.player;
    for (const z of this.zombies) {
      if (z.health <= 0) { z.dead = true; continue; }
      const d = dist(z.x, z.y, p.x, p.y);
      if (d > 58) { z.phase += dt * 0.4; continue; }
      z.attackCd = Math.max(0, z.attackCd - dt);
      z.alert = Math.max(0, z.alert - dt * 0.2);
      const seen = this.zombieSees(z, p);
      if (seen) {
        if (z.state !== 'chase' && Math.random() < dt * 1.6) {
          this.sound.groan(clamp((z.x - p.x) / 18, -1, 1), clamp(1 - d / 16, 0.15, 1));
        }
        z.state = 'chase';
        z.target = { x: p.x, y: p.y };
        z.lastSeen = { x: p.x, y: p.y };
        z.alert = 2.4;
        z.lostT = 0;
      } else if (z.state === 'chase') {
        z.lostT += dt;
        if (z.lostT > 2.4) {
          z.state = 'investigate';
          z.target = z.lastSeen ? { ...z.lastSeen } : z.target;
          z.investigateT = 6;
          z.path = null;
          z.lostT = 0;
        }
      }
      if (z.state === 'chase') {
        if (d < 1.04 && z.attackCd <= 0) {
          z.attackCd = 1.05 + Math.random() * 0.45;
          this.zombieAttack(z);
        } else if (d > 0.9) {
          this.zombieMoveTo(z, p.x, p.y, Math.min(2.55, z.speed + 0.9), dt);
        }
      } else if (z.state === 'investigate') {
        if (!z.target) { z.state = 'idle'; continue; }
        const arrived = this.zombieMoveTo(z, z.target.x, z.target.y, z.speed * 0.92, dt);
        z.investigateT -= dt;
        if (arrived || z.investigateT <= 0) {
          z.state = 'idle';
          z.path = null;
          z.target = null;
        }
      } else {
        z.wanderT -= dt;
        if (z.wanderT <= 0) {
          z.wanderT = 3 + Math.random() * 6;
          if (Math.random() < 0.55) {
            const a = Math.random() * 6.28, rr = 1 + Math.random() * 4;
            const tx = z.homeX + Math.cos(a) * rr, ty = z.homeY + Math.sin(a) * rr;
            if (this.world.walkable(tx, ty)) z.wanderTarget = { x: tx, y: ty };
          } else z.wanderTarget = null;
        }
        if (z.wanderTarget) this.zombieMoveTo(z, z.wanderTarget.x, z.wanderTarget.y, z.speed * 0.42, dt);
      }
      z.phase += dt * (z.state === 'chase' ? 4.6 : 1.9);
    }
    this.zombies = this.zombies.filter(z => !z.dead);
  }

  zombieSees(z, p) {
    const d = dist(z.x, z.y, p.x, p.y);
    let range = z.perception;
    const night = this.hour < 6.5 || this.hour > 19.5;
    if (night) range *= 0.82;
    if (p.crouch) range *= 0.55;
    if (p.flashlightOn) range *= 1.4;
    if (p.sprinting) range *= 1.12;
    if (this.weather.type === 'rain') range *= 0.9;
    if (this.weather.type === 'fog') range *= 0.72;
    if (p.infection > 60) range *= 1.1;
    if (d < 1.9) return true;
    if (d > range) return false;
    return this.world.hasLineOfSight(z.x, z.y, p.x, p.y);
  }

  zombieMoveTo(z, tx, ty, speed, dt) {
    const d = dist(z.x, z.y, tx, ty);
    if (d < 0.24) return true;
    let dx, dy;
    const los = d < 9 && this.world.hasLineOfSight(z.x, z.y, tx, ty);
    if (los) {
      dx = tx - z.x; dy = ty - z.y;
      z.path = null;
    } else {
      z.pathTimer -= dt;
      if (z.pathTimer <= 0 || !z.path || z.pathIdx >= z.path.length) {
        if (this.pathBudget > 0) {
          this.pathBudget--;
          z.path = findPath(this.world, z.x, z.y, tx, ty, 420);
          z.pathIdx = 0;
        }
        z.pathTimer = 0.85 + Math.random() * 0.6;
      }
      if (z.path && z.path.length) {
        while (z.pathIdx < z.path.length - 1 && dist(z.x, z.y, z.path[z.pathIdx].x, z.path[z.pathIdx].y) < 0.42) z.pathIdx++;
        const wp = z.path[z.pathIdx];
        dx = wp.x - z.x; dy = wp.y - z.y;
      } else {
        dx = tx - z.x; dy = ty - z.y;
      }
    }
    const l = Math.hypot(dx, dy) || 1;
    z.facing = { x: dx / l, y: dy / l };
    const beforeX = z.x, beforeY = z.y;
    const mx = (dx / l) * speed * dt, my = (dy / l) * speed * dt;
    if (!this.zombieBlocked(z.x + mx, z.y)) z.x += mx;
    if (!this.zombieBlocked(z.x, z.y + my)) z.y += my;
    if (Math.abs(z.x - beforeX) + Math.abs(z.y - beforeY) < 0.00005) z.path = null;
    return false;
  }

  zombieBlocked(x, y) {
    const r = 0.24;
    return !this.world.walkable(x - r, y - r) || !this.world.walkable(x + r, y - r)
      || !this.world.walkable(x - r, y + r) || !this.world.walkable(x + r, y + r);
  }

  zombieAttack(z) {
    if (!this.player || this.dead) return;
    const diff = DIFFICULTIES[this.profile?.difficulty] || DIFFICULTIES.normal;
    this.damagePlayer(z.damage * (diff.damage || 1), z);
    this.sound.groan(clamp((z.x - this.player.x) / 10, -1, 1), 1);
    this.makeNoise(z.x, z.y, 2.5, 'zed');
  }

  makeNoise(x, y, radius, kind = 'generic') {
    if (!this.world) return;
    let r = radius;
    if (this.weather.type === 'rain') r *= 0.72;
    else if (this.weather.type === 'storm') r *= 0.6;
    else if (this.weather.type === 'fog') r *= 0.9;
    for (const z of this.zombies) {
      if (z.health <= 0 || z.state === 'chase') continue;
      const d = dist(z.x, z.y, x, y);
      if (d > r) continue;
      z.state = 'investigate';
      z.target = { x, y };
      z.lastSeen = { x, y };
      z.alert = Math.max(z.alert, 1.5);
      z.investigateT = 5 + Math.random() * 2;
      z.path = null;
    }
  }

  // ---------------------------------------------------------------- combat
  attack() {
    if (!this.player || this.dead || this.paused || this.inputLocked) return;
    const p = this.player;
    if (p.attackCd > 0) return;
    const w = this.getWeapon();
    const wd = w.weapon;
    if (p.stamina < wd.stamina * 0.55) {
      this.notify('You are too exhausted to swing.', 'warn', 1600);
      return;
    }
    const ranged = !!wd.ranged;
    if (ranged && this.countItem('ammo') <= 0) {
      this.notify('No 9mm rounds left.', 'warn', 1600);
      this.sound.click();
      p.attackCd = 0.3;
      return;
    }
    if (this.isTouch) this.faceNearestZombie(ranged ? 9 : Math.max(3, wd.range * 3.2));
    const combat = this.skills.combat || 0;
    p.attackCd = wd.speed * (1 - combat * 0.018);
    p.swingTime = Math.min(0.36, Math.max(0.18, wd.speed * 0.65));
    p.swing = p.swingTime;
    p.stamina = clamp(p.stamina - wd.stamina * (1 - combat * 0.025), 0, p.maxStamina);
    if (ranged) this.fireWeapon(w);
    else this.meleeStrike(w);
    this.applyWeaponWear(w, ranged);
  }

  meleeStrike(w) {
    const p = this.player;
    const wd = w.weapon;
    const fa = Math.atan2(p.facing.y, p.facing.x);
    let hits = 0;
    let critHit = false;
    for (const z of this.zombies) {
      if (z.health <= 0) continue;
      const dx = z.x - p.x, dy = z.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > wd.range + 0.42) continue;
      const ang = Math.atan2(dy, dx);
      const diff = Math.abs(angleDiff(ang, fa));
      if (diff > wd.arc / 2 + 0.24) continue;
      const crit = diff < 0.3 && Math.random() < 0.35;
      if (crit) critHit = true;
      let dmg = wd.damage * (1 + (this.skills.combat || 0) * 0.06) * (0.86 + Math.random() * 0.28);
      if (this.player.profession === 'veteran') dmg *= 1.12;
      if (p.stamina < 20) dmg *= 0.8;
      if (crit) dmg *= 1.45;
      this.damageZombie(z, dmg, crit);
      z.state = 'chase';
      z.target = { x: p.x, y: p.y };
      z.lastSeen = { x: p.x, y: p.y };
      z.alert = 2.5;
      hits++;
      if (hits >= 3) break;
    }
    const ex = p.x + p.facing.x * 0.55, ey = p.y + p.facing.y * 0.55;
    this.effects.push({ type: 'slash', x: ex, y: ey, facing: { ...p.facing }, life: 0.17, max: 0.17, range: wd.range });
    if (hits) {
      this.sound.hit(1, critHit);
      this.shake = Math.max(this.shake, 0.14);
      this.gainSkill('combat', 4 + hits * 2);
    } else {
      this.sound.swing();
      this.gainSkill('combat', 1);
    }
    this.makeNoise(p.x, p.y, wd.noise, 'melee');
  }

  fireWeapon(w) {
    const p = this.player;
    const wd = w.weapon;
    this.consumeItem('ammo', 1);
    const fa = Math.atan2(p.facing.y, p.facing.x);
    let best = null, bd = 1e9;
    for (const z of this.zombies) {
      if (z.health <= 0) continue;
      const dx = z.x - p.x, dy = z.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 8.5) continue;
      const diff = Math.abs(angleDiff(Math.atan2(dy, dx), fa));
      if (diff > 0.26) continue;
      if (!this.world.hasLineOfSight(p.x, p.y, z.x, z.y)) continue;
      if (d < bd) { bd = d; best = z; }
    }
    if (best) {
      const dmg = wd.damage * (1 + (this.skills.combat || 0) * 0.05) * (0.9 + Math.random() * 0.2);
      this.damageZombie(best, dmg, false);
      best.state = 'chase';
      best.target = { x: p.x, y: p.y };
      best.alert = 2.5;
      this.gainSkill('combat', 6);
    }
    this.effects.push({ type: 'muzzle', x: p.x + p.facing.x * 0.5, y: p.y + p.facing.y * 0.5, life: 0.12, max: 0.12 });
    this.muzzleFlash = 1;
    this.shake = Math.max(this.shake, 0.42);
    this.sound.gunshot();
    this.makeNoise(p.x, p.y, wd.noise, 'gun');
    this.notify('The shot echoes through the streets.', 'warn', 2200);
  }

  applyWeaponWear(w, ranged) {
    const entry = this.equipped.weapon;
    if (!entry || w.id === 'fists') return;
    entry.dur = Math.max(0, (entry.dur || 0) - (ranged ? 1 : 1.2));
    if (entry.dur <= 0) {
      this.equipped.weapon = null;
      this.refreshEquipmentFlags();
      this.notify(`${w.name} broke.`, 'bad');
      this.sound.build();
    }
  }

  damageZombie(z, dmg, crit) {
    z.health -= dmg;
    z.alert = 2.5;
    this.floaters.push({
      x: z.x + (Math.random() - 0.5) * 0.3, y: z.y,
      text: crit ? `${Math.round(dmg)}!` : `${Math.round(dmg)}`,
      color: crit ? '#ffd27a' : '#e8c78a', life: 0.9, max: 0.9,
    });
    for (let i = 0; i < 5; i++) {
      this.particles.push({
        x: z.x, y: z.y, z: 18 + Math.random() * 12, ox: 0, oy: 0,
        vx: (Math.random() - 0.5) * 1.6, vy: (Math.random() - 0.5) * 1.2, vz: 0.6 + Math.random() * 1.2,
        life: 0.4 + Math.random() * 0.3, max: 0.7, color: 'rgba(120,26,22,0.85)', kind: 'blood', size: 2, grav: true,
      });
    }
    if (Math.random() < 0.4) {
      this.decals.push({ type: 'blood', x: z.x + (Math.random() - 0.5) * 0.5, y: z.y + (Math.random() - 0.5) * 0.5, size: 3 + Math.random() * 4, alpha: 0.9 });
    }
    if (z.health <= 0) this.killZombie(z);
  }

  killZombie(z) {
    if (z.dead) return;
    z.dead = true;
    this.decals.push({ type: 'corpse', x: z.x, y: z.y, rot: Math.random() * 6.28, color: z.shirt });
    this.decals.push({ type: 'blood', x: z.x, y: z.y, size: 8 + Math.random() * 5, alpha: 1 });
    this.stats.kills++;
    this.quests.killed++;
    this.gainSkill('combat', 15);
    this.sound.hit(1.2, true);
    for (let i = 0; i < 12; i++) {
      this.particles.push({
        x: z.x, y: z.y, z: 14 + Math.random() * 18, ox: 0, oy: 0,
        vx: (Math.random() - 0.5) * 2.4, vy: (Math.random() - 0.5) * 1.8, vz: 0.8 + Math.random() * 1.6,
        life: 0.5 + Math.random() * 0.4, max: 0.9, color: 'rgba(110,22,20,0.8)', kind: 'blood', size: 2.4, grav: true,
      });
    }
    const roll = Math.random();
    let drop = null;
    if (roll < 0.16) drop = { id: 'bandage', qty: 1 };
    else if (roll < 0.3) drop = { id: 'cloth', qty: 1 + Math.floor(Math.random() * 2) };
    else if (roll < 0.38) drop = { id: 'ammo', qty: 1 + Math.floor(Math.random() * 2) };
    else if (roll < 0.48) drop = { id: ['granola', 'canned_beans', 'soda'][Math.floor(Math.random() * 3)], qty: 1 };
    if (drop) this.groundItems.push({ ...drop, x: z.x, y: z.y });
    if (this.quests.killed === 3) this.notify('Three infected down. The street feels quieter.', 'good', 5000);
    this.checkExtractionReady();
  }

  damagePlayer(amount, source) {
    if (this.dead || !this.player) return;
    const p = this.player;
    const diff = DIFFICULTIES[this.profile?.difficulty] || DIFFICULTIES.normal;
    let dmg = amount * (diff.damage || 1) * (0.86 + Math.random() * 0.28);
    const armor = this.equipped.armor ? (ITEMS[this.equipped.armor.id]?.armor || 0) : 0;
    dmg *= 1 - armor;
    p.health -= dmg;
    p.pain = clamp(p.pain + dmg * 0.75, 0, 100);
    p.stress = clamp(p.stress + 7, 0, 100);
    this.damageFlash = 1;
    this.shake = Math.max(this.shake, 0.55);
    this.stats.damage += dmg;
    this.sound.hit(1, true);
    this.floaters.push({ x: p.x, y: p.y, text: `-${Math.round(dmg)}`, color: '#e2705f', life: 0.9, max: 0.9 });
    for (let i = 0; i < 6; i++) {
      this.particles.push({
        x: p.x, y: p.y, z: 16 + Math.random() * 14, ox: 0, oy: 0,
        vx: (Math.random() - 0.5) * 1.8, vy: (Math.random() - 0.5) * 1.4, vz: 0.5 + Math.random() * 1.2,
        life: 0.4 + Math.random() * 0.3, max: 0.7, color: 'rgba(150,32,26,0.85)', kind: 'blood', size: 2.2, grav: true,
      });
    }
    if (Math.random() < 0.32) {
      p.bleeding = clamp(p.bleeding + 14, 0, 100);
      this.notify('You are bleeding. Use a bandage.', 'bad', 2600);
    }
    if (Math.random() < 0.07) {
      p.infection = clamp(p.infection + 9, 0, 100);
      this.notify('The wound burns. Infection is setting in.', 'bad', 3000);
    }
    if (Math.random() < 0.035 && p.fracture <= 0) {
      p.fracture = 1;
      this.notify('A bone snaps. Movement is impaired. Use a splint.', 'bad', 4000);
    }
    if (p.health <= 0) this.die('The dead brought you down.');
  }

  die(reason) {
    if (this.dead) return;
    this.dead = true;
    this.state = 'dead';
    this.player.health = 0;
    this.sound.danger();
    this.deleteSave();
    this.ui?.onDeath(reason);
  }

  extractionReady() {
    return (this.quests.looted >= 3) && (this.quests.killed >= 3) && this.quests.campfire && this.totalHours >= 54;
  }

  checkExtractionReady() {
    const school = this.world?.buildings.find(b => b.type === 'school');
    if (!school) return;
    if (this.quests.looted >= 3 && this.quests.killed >= 3 && this.quests.campfire && !this.extractNotified) {
      this.extractNotified = true;
      this.notify('Extraction is at Havenwood High. Be there after Day 3, 06:00.', 'good', 8000);
      this.sound.quest();
    }
    if (this.quests.looted >= 3 && this.quests.killed >= 3 && this.quests.campfire && !this.world.waypoint) {
      this.world.waypoint = { x: school.x + school.w / 2, y: school.y + school.h / 2 };
    }
  }

  extract() {
    if (!this.extractionReady()) {
      if (this.totalHours < 54) this.notify('The convoy is not here yet. Survive until Day 3, 06:00.', 'warn', 4000);
      else this.notify('Finish searching, clearing the infected and building a campfire first.', 'warn', 4000);
      return;
    }
    this.quests.extracted = true;
    this.state = 'victory';
    this.player.moving = false;
    this.sound.quest();
    this.save();
    this.ui?.onVictory();
  }

  // ------------------------------------------------------------- inventory
  itemDef(id) { return ITEMS[id] || null; }

  countItem(id) {
    let n = 0;
    for (const e of this.inventory) if (e.id === id) n += e.qty || 1;
    return n;
  }

  hasItem(id, qty = 1) { return this.countItem(id) >= qty; }

  getCapacity() {
    let cap = 8;
    if (this.equipped.backpack) cap += ITEMS[this.equipped.backpack.id]?.carry || 0;
    if (this.player?.profession === 'farmer') cap += 1;
    return cap;
  }

  getWeight() {
    let w = 0;
    for (const e of this.inventory) {
      const d = ITEMS[e.id];
      if (d) w += (d.w || 0) * (e.qty || 1);
    }
    for (const slot of Object.values(this.equipped)) {
      if (!slot) continue;
      const d = ITEMS[slot.id];
      if (d) w += (d.w || 0) * (slot.qty || 1);
    }
    return Math.round(w * 10) / 10;
  }

  addItem(id, qty = 1, dur, silent = false) {
    const def = ITEMS[id];
    if (!def) return false;
    qty = Math.max(1, Math.round(qty));
    if (dur === undefined && def.dur !== undefined) dur = Math.round(def.dur * (0.55 + Math.random() * 0.45));
    if (this.getWeight() + (def.w || 0) * qty > this.getCapacity() + 0.001) {
      if (!silent) this.notify('Your pack is too heavy.', 'warn');
      return false;
    }
    let remaining = qty;
    const maxStack = def.stack || 1;
    if (maxStack > 1) {
      for (const e of this.inventory) {
        if (e.id !== id || (e.qty || 1) >= maxStack) continue;
        if (e.dur !== undefined || dur !== undefined) continue;
        const add = Math.min(maxStack - (e.qty || 1), remaining);
        e.qty = (e.qty || 1) + add;
        remaining -= add;
        if (remaining <= 0) break;
      }
    }
    while (remaining > 0) {
      const chunk = Math.min(maxStack, remaining);
      this.inventory.push(dur !== undefined ? { id, qty: chunk, dur } : { id, qty: chunk });
      remaining -= chunk;
    }
    return true;
  }

  removeItem(id, qty = 1) {
    let remaining = qty;
    for (let i = this.inventory.length - 1; i >= 0 && remaining > 0; i--) {
      const e = this.inventory[i];
      if (e.id !== id) continue;
      const take = Math.min(e.qty || 1, remaining);
      e.qty = (e.qty || 1) - take;
      remaining -= take;
      if (e.qty <= 0) this.inventory.splice(i, 1);
    }
    return remaining <= 0;
  }

  consumeItem(id, qty = 1) { return this.removeItem(id, qty); }

  getWeapon() {
    const w = this.equipped.weapon;
    if (!w) return { id: 'fists', name: 'Bare Hands', icon: '✊', weapon: FISTS.weapon, dur: null };
    const def = ITEMS[w.id];
    if (!def || !def.weapon) return { id: 'fists', name: 'Bare Hands', icon: '✊', weapon: FISTS.weapon, dur: null };
    return { id: w.id, name: def.name, icon: def.icon, weapon: def.weapon, dur: w.dur, maxDur: def.dur, entry: w };
  }

  refreshEquipmentFlags() {
    if (!this.player) return;
    this.player.backpackItem = this.equipped.backpack;
    this.player.jacketItem = this.equipped.armor;
    this.player.lightItem = this.equipped.light;
    if (!this.equipped.light) this.player.flashlightOn = false;
  }

  equip(entry, silent = false) {
    if (!entry) return false;
    const def = ITEMS[entry.id];
    if (!def || !def.equip) return false;
    const idx = this.inventory.indexOf(entry);
    if (idx < 0) return false;
    const slot = def.equip;
    if (this.equipped[slot]) {
      if (!this.unequip(slot, true)) return false;
    }
    this.inventory.splice(idx, 1);
    const equipped = { ...entry, qty: 1 };
    if (equipped.dur === undefined && def.dur !== undefined) equipped.dur = def.dur;
    this.equipped[slot] = equipped;
    this.refreshEquipmentFlags();
    if (!silent) {
      this.sound.click();
      this.notify(`Equipped ${def.icon} ${def.name}.`, 'good', 1800);
    }
    return true;
  }

  unequip(slot, silent = false) {
    const e = this.equipped[slot];
    if (!e) return false;
    const def = ITEMS[e.id];
    if (this.getWeight() + (def?.w || 0) > this.getCapacity() + 0.001) {
      if (!silent) this.notify('No room in your pack to stow that.', 'warn');
      return false;
    }
    this.equipped[slot] = null;
    this.inventory.push({ ...e, qty: 1 });
    this.refreshEquipmentFlags();
    if (!silent) { this.sound.click(); this.notify(`Stowed ${def?.name || 'item'}.`, 'info', 1500); }
    return true;
  }

  useItem(entry) {
    if (!entry || !this.player) return false;
    const def = ITEMS[entry.id];
    if (!def) return false;
    if (def.equip) return this.equip(entry);
    if (!def.use) {
      this.notify(`${def.name} cannot be used directly.`, 'warn', 1600);
      return false;
    }
    const u = def.use;
    const p = this.player;
    if (u.reveal) {
      this.world.markExplored(p.x, p.y, 28);
      this.world.discoverBuildings(p.x, p.y, 40);
      this.removeItem(entry.id, 1);
      this.sound.pickup();
      this.notify('You study the torn map. Nearby streets and buildings are marked.', 'good', 4500);
      return true;
    }
    if (u.radio) {
      this.removeItem(entry.id, 1);
      this.useRadio();
      return true;
    }
    let mult = 1;
    if (this.profile?.profession === 'cook' && def.cat === 'food') mult = 1.5;
    if (this.profile?.profession === 'medic' && def.cat === 'medical') mult = 1.6;
    if (u.health) p.health += u.health * mult;
    if (u.hunger) p.hunger += u.hunger * mult;
    if (u.thirst) p.thirst += u.thirst * mult;
    if (u.fatigue) p.fatigue += u.fatigue;
    if (u.stamina) p.stamina += u.stamina;
    if (u.warmth) p.warmth += u.warmth;
    if (u.pain) p.pain += u.pain;
    if (u.bleed) p.bleeding += u.bleed;
    if (u.infection) p.infection += u.infection;
    if (u.fracture) p.fracture = Math.max(0, p.fracture + u.fracture);
    p.health = clamp(p.health, 0, p.maxHealth);
    p.hunger = clamp(p.hunger, 0, 100);
    p.thirst = clamp(p.thirst, 0, 100);
    p.fatigue = clamp(p.fatigue, 0, 100);
    p.stamina = clamp(p.stamina, 0, p.maxStamina);
    p.warmth = clamp(p.warmth, 0, 100);
    p.pain = clamp(p.pain, 0, 100);
    p.bleeding = clamp(p.bleeding, 0, 100);
    p.infection = clamp(p.infection, 0, 100);
    this.removeItem(entry.id, 1);
    if (def.cat === 'medical') { this.sound.heal(); this.gainSkill('firstaid', 5); }
    else if (def.cat === 'food') { this.sound.eat(); this.gainSkill('cooking', 1); }
    else if (def.cat === 'drink') { this.sound.drink(); }
    if (entry.id === 'rotten_food' || entry.id === 'dirty_water') {
      if (Math.random() < 0.55) {
        p.infection = clamp(p.infection + 10, 0, 100);
        this.notify('Your stomach turns. That was a mistake.', 'bad', 3500);
      }
    }
    if (def.cat === 'medical' && u.health) this.notify(`Used ${def.name}.`, 'good', 1600);
    else this.notify(`Used ${def.icon} ${def.name}.`, 'info', 1800);
    if (p.health <= 0) this.die('You could not recover.');
    return true;
  }

  useRadio() {
    const lines = [
      'Emergency broadcast: Havenwood High is an extraction point. Day 3, 06:00. Do not travel alone.',
      'Static... then a voice: "The bridge is out. Use the back roads through the farms."',
      'A looping message: "Quarantine failed. Avoid the hospital. Avoid the noise."',
      'Numbers station. You catch a partial coordinate before the signal dies.',
      'Someone breathing. Then a click. Then nothing.',
    ];
    const line = lines[Math.floor(Math.random() * lines.length)];
    this.notify(line, 'info', 7000);
    this.gainSkill('survival', 4);
    this.sound.tone({ freq: 520, dur: 0.3, type: 'sine', gain: 0.04 });
  }

  dropItem(entry) {
    if (!this.player) return false;
    const idx = this.inventory.indexOf(entry);
    if (idx < 0) return false;
    const qty = entry.qty || 1;
    this.inventory.splice(idx, 1);
    const a = Math.random() * 6.28;
    this.groundItems.push({
      id: entry.id, qty, dur: entry.dur,
      x: clamp(this.player.x + Math.cos(a) * 0.5, 0.5, this.world.size - 0.5),
      y: clamp(this.player.y + Math.sin(a) * 0.5, 0.5, this.world.size - 0.5),
    });
    this.sound.click();
    return true;
  }

  sortInventory() {
    const catOrder = ['weapon', 'gear', 'medical', 'food', 'drink', 'material', 'ammo'];
    this.inventory.sort((a, b) => {
      const da = ITEMS[a.id] || {}, db = ITEMS[b.id] || {};
      const ca = catOrder.indexOf(da.cat), cb = catOrder.indexOf(db.cat);
      if (ca !== cb) return ca - cb;
      return (da.name || '').localeCompare(db.name || '');
    });
    this.inventoryDirty = true;
  }

  // ------------------------------------------------------------- containers
  openContainer(c) {
    if (!c) return;
    if (!c.noQuestCount && !c.searched) {
      c.searched = true;
      this.quests.looted++;
      this.stats.looted++;
      this.gainSkill('survival', 7);
      this.sound.pickup();
      if (this.quests.looted === 3) this.notify('Three containers searched. Keep the momentum.', 'good', 5000);
      this.checkExtractionReady();
    }
    this.ui?.openLoot(c);
  }

  openStorage(s) {
    if (!s) return;
    if (!Array.isArray(s.storage)) s.storage = [];
    const view = {
      id: 's:' + s.id, name: 'Storage Crate', type: 'crate', color: '#8c7048',
      icon: '', x: s.x, y: s.y, items: s.storage, searched: true, noQuestCount: true,
    };
    this.ui?.openLoot(view);
  }

  takeItem(c, entry, qty) {
    if (!c || !entry) return false;
    qty = Math.min(qty || entry.qty || 1, entry.qty || 1);
    const def = ITEMS[entry.id];
    if (!def) return false;
    if (this.getWeight() + (def.w || 0) * qty > this.getCapacity() + 0.001) {
      this.notify('Too heavy. Drop something or equip a bigger pack.', 'warn', 2400);
      return false;
    }
    if (!this.addItem(entry.id, qty, entry.dur, true)) return false;
    entry.qty = (entry.qty || 1) - qty;
    if (entry.qty <= 0) {
      const i = c.items.indexOf(entry);
      if (i >= 0) c.items.splice(i, 1);
    }
    this.sound.pickup();
    this.notify(`Took ${def.icon} ${def.name}${qty > 1 ? ' x' + qty : ''}.`, 'good', 1400);
    return true;
  }

  putItem(c, entry, qty) {
    if (!c || !entry) return false;
    qty = Math.min(qty || entry.qty || 1, entry.qty || 1);
    const def = ITEMS[entry.id];
    if (!def) return false;
    const maxStack = def.stack || 1;
    let remaining = qty;
    if (maxStack > 1) {
      for (const e of c.items) {
        if (e.id !== entry.id || (e.qty || 1) >= maxStack) continue;
        if (e.dur !== undefined || entry.dur !== undefined) continue;
        const add = Math.min(maxStack - (e.qty || 1), remaining);
        e.qty = (e.qty || 1) + add;
        remaining -= add;
        if (remaining <= 0) break;
      }
    }
    while (remaining > 0) {
      const chunk = Math.min(maxStack, remaining);
      c.items.push(entry.dur !== undefined ? { id: entry.id, qty: chunk, dur: entry.dur } : { id: entry.id, qty: chunk });
      remaining -= chunk;
    }
    entry.qty = (entry.qty || 1) - qty;
    if (entry.qty <= 0) {
      const i = this.inventory.indexOf(entry);
      if (i >= 0) this.inventory.splice(i, 1);
    }
    this.sound.click();
    this.notify(`Stored ${def.icon} ${def.name}${qty > 1 ? ' x' + qty : ''}.`, 'info', 1400);
    return true;
  }

  takeAll(c) {
    if (!c) return;
    for (const e of [...c.items]) this.takeItem(c, e, e.qty || 1);
  }

  // ------------------------------------------------------------- crafting
  hasCost(cost) {
    for (const [id, qty] of Object.entries(cost || {})) {
      if (this.countItem(id) < qty) return false;
    }
    return true;
  }

  canCraft(recipe) {
    if (!recipe) return { ok: false, reason: 'Unknown recipe' };
    const lvl = this.skills[recipe.skill] || 0;
    if (lvl < (recipe.level || 0)) {
      return { ok: false, reason: `Requires ${SKILLS[recipe.skill]?.name || recipe.skill} ${recipe.level}` };
    }
    if (recipe.station === 'heat' && !this.nearHeat(3.3)) {
      return { ok: false, reason: 'Needs a lit fire or stove' };
    }
    for (const [id, qty] of Object.entries(recipe.cost || {})) {
      if (this.countItem(id) < qty) return { ok: false, reason: `Missing ${ITEMS[id]?.name || id}` };
    }
    let weight = this.getWeight();
    for (const [id, qty] of Object.entries(recipe.cost || {})) weight -= (ITEMS[id]?.w || 0) * qty;
    weight += (ITEMS[recipe.out]?.w || 0) * (recipe.qty || 1);
    if (weight > this.getCapacity() + 0.001) return { ok: false, reason: 'Not enough carrying capacity' };
    return { ok: true };
  }

  craft(recipe) {
    const check = this.canCraft(recipe);
    if (!check.ok) { this.notify(check.reason, 'warn', 2200); return false; }
    for (const [id, qty] of Object.entries(recipe.cost || {})) this.removeItem(id, qty);
    const outQty = recipe.qty || 1;
    if (!this.addItem(recipe.out, outQty, undefined, true)) {
      this.groundItems.push({ id: recipe.out, qty: outQty, x: this.player.x, y: this.player.y });
    }
    this.stats.crafted++;
    this.gainSkill(recipe.skill, 9);
    this.sound.craft();
    this.notify(`Crafted ${ITEMS[recipe.out]?.icon || ''} ${ITEMS[recipe.out]?.name || recipe.out}${outQty > 1 ? ' x' + outQty : ''}.`, 'good', 2600);
    return true;
  }

  buildCost(recipe) {
    const cost = { ...(recipe.cost || {}) };
    if (this.profile?.profession === 'carpenter' && cost.wood) {
      cost.wood = Math.max(1, Math.round(cost.wood * 0.75));
    }
    return cost;
  }

  canBuild(recipe) {
    if (!recipe) return { ok: false, reason: 'Unknown structure' };
    const lvl = this.skills[recipe.skill] || 0;
    if (lvl < (recipe.level || 0)) {
      return { ok: false, reason: `Requires ${SKILLS[recipe.skill]?.name || recipe.skill} ${recipe.level}` };
    }
    const cost = this.buildCost(recipe);
    for (const [id, qty] of Object.entries(cost)) {
      if (this.countItem(id) < qty) return { ok: false, reason: `Missing ${ITEMS[id]?.name || id}` };
    }
    return { ok: true };
  }

  startBuild(recipeId) {
    const recipe = BUILD_RECIPES.find(r => r.id === recipeId);
    if (!recipe) return false;
    const check = this.canBuild(recipe);
    if (!check.ok) { this.notify(check.reason, 'warn', 2200); return false; }
    this.buildMode = { recipe, x: null, y: null, valid: false };
    this.updateBuildGhost();
    this.notify('Move to choose a spot, then tap Place.', 'info', 2600);
    this.ui?.setBuildMode(true, recipe);
    return true;
  }

  structureAt(x, y) {
    return (this.world.structures || []).find(s => s.x === x && s.y === y) || null;
  }

  updateBuildGhost() {
    if (!this.buildMode || !this.player) return;
    const p = this.player;
    let tx = Math.floor(p.x + p.facing.x * 1.2);
    let ty = Math.floor(p.y + p.facing.y * 1.2);
    const px = Math.floor(p.x), py = Math.floor(p.y);
    if (tx === px && ty === py) {
      const options = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      let best = null, bd = 1e9;
      for (const [ox, oy] of options) {
        const nx = px + ox, ny = py + oy;
        const d = (nx + 0.5 - (p.x + p.facing.x)) ** 2 + (ny + 0.5 - (p.y + p.facing.y)) ** 2;
        if (d < bd) { bd = d; best = [nx, ny]; }
      }
      if (best) { tx = best[0]; ty = best[1]; }
    }
    tx = clamp(tx, 0, this.world.size - 1);
    ty = clamp(ty, 0, this.world.size - 1);
    const inPlayerTile = tx === px && ty === py;
    const valid = !inPlayerTile
      && this.world.walkable(tx, ty)
      && this.world.terrainAt(tx, ty) !== T.WATER
      && !this.structureAt(tx, ty);
    this.buildMode.x = tx;
    this.buildMode.y = ty;
    this.buildMode.valid = valid;
  }

  placeStructure() {
    if (!this.buildMode || !this.player) return false;
    const b = this.buildMode;
    if (!b.valid || b.x == null || b.y == null) {
      this.notify('You cannot build there.', 'warn', 1800);
      return false;
    }
    const recipe = b.recipe;
    const cost = this.buildCost(recipe);
    for (const [id, qty] of Object.entries(cost)) {
      if (this.countItem(id) < qty) { this.notify(`Missing ${ITEMS[id]?.name || id}.`, 'warn'); return false; }
    }
    for (const [id, qty] of Object.entries(cost)) this.removeItem(id, qty);
    const s = {
      id: uid(), type: recipe.id, x: b.x, y: b.y,
      planted: false, growth: 0, water: 0, storage: [], builtAt: this.totalHours,
    };
    this.world.structures.push(s);
    if (BLOCKING_STRUCTURES.has(recipe.id)) this.world.solid[this.world.idx(b.x, b.y)] = 1;
    this.stats.built++;
    this.gainSkill(recipe.skill, 14);
    this.sound.build();
    if (recipe.id === 'campfire') {
      this.quests.campfire = true;
      this.notify('Campfire built. Warmth, light and a place to cook.', 'good', 4500);
      this.sound.quest();
      this.checkExtractionReady();
    } else {
      this.notify(`Built ${recipe.icon} ${recipe.name}.`, 'good', 2600);
    }
    this.buildMode = null;
    this.ui?.setBuildMode(false);
    return true;
  }

  cancelBuild() {
    if (!this.buildMode) return;
    this.buildMode = null;
    this.ui?.setBuildMode(false);
    this.notify('Build cancelled.', 'info', 1400);
  }

  // ----------------------------------------------------------- interaction
  interact() {
    if (!this.player || this.dead || this.paused || this.inputLocked) return;
    if (this.buildMode) { this.cancelBuild(); return; }
    const it = this.nearestInteract;
    if (!it) { this.notify('Nothing within reach.', 'warn', 1200); return; }
    if (it.kind === 'container') this.openContainer(it.target);
    else if (it.kind === 'structure') this.interactStructure(it.target, it.action);
    else if (it.kind === 'prop') this.interactProp(it.target, it.action);
    else if (it.kind === 'water') this.drinkLake();
    else if (it.kind === 'extract') this.extract();
  }

  interactStructure(s, action) {
    if (!s) return;
    if (action === 'open') this.openStorage(s);
    else if (action === 'cook') this.ui?.openCraft('heat');
    else if (action === 'sleep') this.ui?.openSleep();
    else if (action === 'inspect') this.notify('The barricade is holding. For now.', 'info', 1800);
    else if (action === 'plant') {
      if (!this.hasItem('seeds')) { this.notify('You need a seed packet.', 'warn', 1800); return; }
      this.removeItem('seeds', 1);
      s.planted = true;
      s.growth = 0;
      s.water = 0;
      s.plantedAt = this.totalHours;
      this.gainSkill('farming', 8);
      this.sound.pickup();
      this.notify('Seeds planted. Water them and give them time.', 'good', 3000);
    } else if (action === 'harvest') {
      const yieldQty = 1 + Math.floor(Math.random() * 2) + (this.player.profession === 'farmer' ? 1 : 0);
      this.addItem('raw_veg', yieldQty);
      if (Math.random() < 0.5) this.addItem('seeds', 1);
      s.planted = false;
      s.growth = 0;
      this.gainSkill('farming', 16);
      this.sound.pickup();
      this.notify(`Harvested ${yieldQty} fresh vegetables.`, 'good', 2800);
    } else if (action === 'water_plot') {
      if (!this.hasItem('water') && !this.hasItem('dirty_water')) {
        this.notify('You need water to irrigate the plot.', 'warn', 1800);
        return;
      }
      const id = this.hasItem('water') ? 'water' : 'dirty_water';
      this.removeItem(id, 1);
      s.growth = Math.min(1, (s.growth || 0) + 0.14);
      this.gainSkill('farming', 3);
      this.sound.drink();
      this.notify('You water the plot.', 'info', 1800);
    } else if (action === 'collect_water') {
      if ((s.water || 0) < 0.3) { this.notify('The collector is dry. It fills when it rains.', 'warn', 2400); return; }
      s.water = Math.max(0, (s.water || 0) - 1);
      this.addItem('dirty_water', 1);
      this.sound.drink();
      this.notify('Collected dirty rainwater. Boil it before drinking.', 'info', 2600);
    }
  }

  interactProp(pr, action) {
    if (!pr) return;
    if (action === 'well') {
      const p = this.player;
      p.thirst = clamp(p.thirst + 28, 0, 100);
      p.warmth = clamp(p.warmth - 2, 0, 100);
      this.sound.drink();
      this.gainSkill('survival', 2);
      this.notify('You drink cold, clean well water.', 'good', 2000);
    } else if (action === 'cook') {
      this.ui?.openCraft('heat');
    } else if (action === 'sleep') {
      this.ui?.openSleep();
    } else if (action === 'open') {
      const c = pr.containerId ? this.world.getContainer(pr.containerId) : null;
      if (c) this.openContainer(c);
      else this.notify('It is empty.', 'info', 1400);
    }
  }

  drinkLake() {
    const p = this.player;
    p.thirst = clamp(p.thirst + 20, 0, 100);
    if (Math.random() < 0.45) {
      p.infection = clamp(p.infection + 6, 0, 100);
      this.notify('The lake water is foul. You may regret that.', 'bad', 3000);
    } else {
      this.notify('You drink from the lake. It tastes like mud.', 'info', 2200);
    }
    this.sound.drink();
    this.gainSkill('survival', 1);
  }

  // -------------------------------------------------------------- rest/time
  canSleep() {
    if (!this.player) return false;
    return !this.zombies.some(z => z.health > 0 && z.state === 'chase' && dist(z.x, z.y, this.player.x, this.player.y) < 7);
  }

  sleep(hours = 8) {
    if (!this.player || this.dead) return false;
    if (!this.canSleep()) {
      this.notify('Too dangerous to sleep. Something is hunting you.', 'bad', 3200);
      return false;
    }
    this.ui?.closeAll();
    const start = this.totalHours;
    // Sleep in fixed blocks. Sleeping through the night naturally lands the
    // survivor near dawn without turning a daytime nap into a lost day.
    const target = start + hours;
    const slept = Math.max(0.5, target - start);
    this.passTime(slept);
    if (this.dead) return false;
    const p = this.player;
    p.fatigue = clamp(p.fatigue - slept * 12.2, 0, 100);
    p.health = Math.min(p.maxHealth, p.health + slept * 2 + (this.skills.firstaid || 0) * 0.6);
    p.stamina = p.maxStamina;
    p.pain = clamp(p.pain - 24, 0, 100);
    p.stress = clamp(p.stress - 28, 0, 100);
    this.fade = 1;
    this.sound.heal();
    this.notify(`You slept ${slept.toFixed(1)} hours. Day ${this.day}, ${String(Math.floor(this.hour)).padStart(2, '0')}:00.`, 'good', 5000);
    this.save();
    return true;
  }

  passTime(hours) {
    if (!this.player) return;
    const diff = DIFFICULTIES[this.profile?.difficulty] || DIFFICULTIES.normal;
    let remaining = Math.max(0, hours);
    const p = this.player;
    while (remaining > 0.0001) {
      const chunk = Math.min(0.5, remaining);
      remaining -= chunk;
      this.totalHours += chunk;
      this.hour = this.totalHours % 24;
      const dh = chunk * (diff.drain || 1);
      p.hunger = clamp(p.hunger - 4.1 * dh, 0, 100);
      p.thirst = clamp(p.thirst - 5.3 * dh, 0, 100);
      p.fatigue = clamp(p.fatigue + 3.3 * dh, 0, 100);
      p.pain = clamp(p.pain - 9 * dh, 0, 100);
      p.bleeding = clamp(p.bleeding - 1.2 * dh, 0, 100);
      if (p.infection > 0) p.infection = clamp(p.infection + 1.4 * dh, 0, 100);
      if (p.bleeding > 0) p.health -= p.bleeding * 0.12 * dh;
      if (p.infection > 30) p.health -= p.infection * 0.03 * dh;
      if (p.hunger <= 0) p.health -= 3.2 * dh;
      if (p.thirst <= 0) p.health -= 4.2 * dh;
      const safe = p.hunger > 40 && p.thirst > 40 && p.bleeding <= 0 && p.infection < 30;
      if (safe) p.health = Math.min(p.maxHealth, p.health + 1.3 * dh);
      this.updateFarming(chunk);
      if (this.totalHours >= (this.weather.next || 0)) this.chooseWeather();
      if (p.health <= 0) break;
    }
    const day = Math.floor(this.totalHours / 24) + 1;
    this.day = day;
    this.lastDay = day;
    this.weather.flash = 0;
    p.health = clamp(p.health, 0, p.maxHealth);
    if (p.health <= 0) this.die('You never woke up.');
  }

  // --------------------------------------------------------------- helpers
  skillLevel(skill) { return this.skills[skill] || 0; }

  gainSkill(skill, amount) {
    if (!this.skills || !SKILLS[skill]) return;
    const mult = this.profile?.profession === 'survivor' ? 1.1 : 1;
    const old = this.skills[skill] || 0;
    let xp = (this.skillXp[skill] || 0) + amount * mult;
    this.skillXp[skill] = xp;
    let lvl = old;
    while (lvl < 10 && xp >= LEVEL_XP[lvl + 1]) lvl++;
    if (lvl > old) {
      this.skills[skill] = lvl;
      this.notify(`${SKILLS[skill].name} improved to level ${lvl}.`, 'good', 4200);
      this.sound.quest();
    }
  }

  xpProgress(skill) {
    const lvl = this.skills[skill] || 0;
    const xp = this.skillXp[skill] || 0;
    const floor = LEVEL_XP[lvl] || 0;
    const next = lvl >= 10 ? floor : (LEVEL_XP[lvl + 1] || floor + 1);
    const pct = lvl >= 10 ? 1 : clamp((xp - floor) / Math.max(1, next - floor), 0, 1);
    return { level: lvl, pct, xp, next: lvl >= 10 ? null : next };
  }

  objectives() {
    const ready = this.totalHours >= 54;
    return [
      { id: 'loot', text: 'Search 3 containers', done: this.quests.looted >= 3, detail: `${Math.min(3, this.quests.looted)}/3` },
      { id: 'kill', text: 'Put down 3 infected', done: this.quests.killed >= 3, detail: `${Math.min(3, this.quests.killed)}/3` },
      { id: 'fire', text: 'Build a campfire', done: this.quests.campfire, detail: this.quests.campfire ? 'Done' : '0/1' },
      {
        id: 'extract', text: 'Reach Havenwood High', done: this.quests.extracted,
        detail: ready ? 'Convoy ready' : `Day 3, 06:00 · ${Math.max(0, 54 - this.totalHours).toFixed(0)}h`,
      },
    ];
  }

  notify(text, type = 'info', ms = 3200) {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const key = text;
    if (this.notifyCd[key] && now - this.notifyCd[key] < Math.max(500, ms * 0.6)) return;
    this.notifyCd[key] = now;
    this.ui?.toast(text, type, ms);
  }

  book() {
    return {
      name: this.profile?.name || this.player?.name || 'Survivor',
      profession: PROFESSIONS[this.profile?.profession || 'survivor']?.name || 'Survivor',
      day: this.day, hour: this.hour,
    };
  }
}

