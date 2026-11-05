// ---------------------------------------------------------------------------
// DOM layer: HUD, touch controls, sheets and menus. Reads game state, calls
// game actions. All gameplay logic stays in game.js.
// ---------------------------------------------------------------------------
import { PROFESSIONS, DIFFICULTIES, ITEMS, RECIPES, BUILD_RECIPES, SKILLS } from './config.js';
import { formatClock, timeOfDayName } from './utils.js';

const SAVE_KEY = 'lastlight.save.v1';
const $ = id => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

export class UI {
  constructor(game, renderer) {
    this.game = game;
    this.renderer = renderer;
    this.screens = {
      title: $('screen-title'),
      create: $('screen-create'),
      inventory: $('screen-inventory'),
      loot: $('screen-loot'),
      map: $('screen-map'),
      sleep: $('screen-sleep'),
      pause: $('screen-pause'),
      help: $('screen-help'),
      death: $('screen-death'),
      victory: $('screen-victory'),
    };
    this.current = null;
    this.tab = 'items';
    this.selectedProfession = 'survivor';
    this.selectedDifficulty = 'normal';
    this.lootContainer = null;
    this.attackHeld = false;
    this.joyPointer = null;
    this.minimapT = 0;
    this.questSig = '';
    this.statusSig = '';
    this.abandonArmed = false;
    this.pauseSettingsBound = false;
    this.refs = {
      hud: $('hud'),
      time: $('hud-time'),
      day: $('hud-day'),
      phase: $('hud-phase'),
      temp: $('hud-temp'),
      weather: $('hud-weather'),
      location: $('hud-location'),
      status: $('status-icons'),
      quest: $('quest-tracker'),
      prompt: $('interact-prompt'),
      promptLabel: $('interact-label'),
      promptKey: document.querySelector('#interact-prompt .key'),
      toasts: $('toasts'),
      minimap: $('minimap'),
      buildBar: $('build-bar'),
      buildName: $('build-name'),
      invBody: $('inv-body'),
      invTabs: $('inv-tabs'),
      lootList: $('loot-list'),
      lootInv: $('loot-inv'),
      worldMap: $('world-map'),
      btnAttack: $('btn-attack'),
      btnInteract: $('btn-interact'),
      btnSprint: $('btn-sprint'),
      btnCrouch: $('btn-crouch'),
      btnLight: $('btn-light'),
      joystick: $('joystick'),
      stick: document.querySelector('#joystick .stick'),
    };
    this.vitals = {};
    document.querySelectorAll('.vital').forEach(el => {
      this.vitals[el.dataset.v] = { el, bar: el.querySelector('.bar i'), value: el.querySelector('b') };
    });
    this.buildCreate();
    this.bind();
    this.applySettings();
  }

  // ------------------------------------------------------------------ setup
  start() {
    document.body.classList.toggle('is-touch', this.game.isTouch);
    this.showTitle();
  }

  applySettings() {
    const s = this.game.settings;
    this.game.sound.enabled = s.sound;
    this.game.sound.setVolume(s.volume);
    document.body.dataset.quality = s.quality || 'auto';
  }

  showTitle() {
    this.hideAllScreens();
    this.game.state = 'title';
    this.game.paused = true;
    this.game.inputLocked = true;
    this.refs.hud.classList.add('hidden');
    this.refs.buildBar.classList.add('hidden');
    this.refs.prompt.classList.add('hidden');
    this.screens.title.classList.remove('hidden');
    this.current = 'title';
    this.abandonArmed = false;
    this.updateTitleInfo();
  }

  updateTitleInfo() {
    const info = this.readSaveInfo();
    const cont = $('btn-continue');
    const saveInfo = $('title-save-info');
    cont.classList.toggle('hidden', !info);
    saveInfo.textContent = info ? `${info.name} · ${info.profession} · Day ${info.day}` : '';
  }

  readSaveInfo() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || d.v !== 2) return null;
      const prof = PROFESSIONS[d.profile?.profession] || PROFESSIONS.survivor;
      return {
        name: d.profile?.name || d.player?.name || 'Survivor',
        profession: prof.name,
        day: Math.floor((d.totalHours || 8) / 24) + 1,
      };
    } catch (e) { return null; }
  }

  buildCreate() {
    const list = $('profession-list');
    list.innerHTML = Object.entries(PROFESSIONS).map(([id, p]) => `
      <button class="prof-card ${id === this.selectedProfession ? 'active' : ''}" data-prof="${id}">
        <span class="pi">${p.icon}</span>
        <span><span class="pn">${esc(p.name)}</span><span class="pb">${esc(p.blurb)}</span></span>
      </button>`).join('');
    list.addEventListener('click', e => {
      const btn = e.target.closest('[data-prof]');
      if (!btn) return;
      this.selectedProfession = btn.dataset.prof;
      list.querySelectorAll('.prof-card').forEach(b => b.classList.toggle('active', b.dataset.prof === this.selectedProfession));
      this.renderProfessionInfo();
      this.game.sound.click();
    });
    const diff = $('difficulty-list');
    diff.innerHTML = Object.entries(DIFFICULTIES).map(([id, d]) =>
      `<button data-diff="${id}" class="${id === this.selectedDifficulty ? 'active' : ''}">${esc(d.name)}</button>`).join('');
    diff.insertAdjacentHTML('afterend', '<p id="difficulty-desc" class="tiny muted" style="margin-top:6px"></p>');
    diff.addEventListener('click', e => {
      const btn = e.target.closest('[data-diff]');
      if (!btn) return;
      this.selectedDifficulty = btn.dataset.diff;
      diff.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.diff === this.selectedDifficulty));
      this.renderDifficulty();
      this.game.sound.click();
    });
    this.renderProfessionInfo();
    this.renderDifficulty();
  }

  renderProfessionInfo() {
    const p = PROFESSIONS[this.selectedProfession] || PROFESSIONS.survivor;
    const skills = Object.entries(p.skills).filter(([, v]) => v > 0)
      .map(([k, v]) => `<span class="chip req">${SKILLS[k]?.icon || ''} ${SKILLS[k]?.name || k} ${v}</span>`).join('');
    const kit = p.items.map(it => `<span class="chip">${ITEMS[it.id]?.icon || ''} ${ITEMS[it.id]?.name || it.id}${it.qty > 1 ? ' ×' + it.qty : ''}</span>`).join('');
    $('profession-info').innerHTML = `
      <h3>${esc(p.name)}</h3>
      <p>${esc(p.blurb)}</p>
      <p class="perk">${esc(p.perk)}</p>
      <div class="r-cost" style="margin-top:7px">${skills}</div>
      <h3 style="margin-top:9px">STARTING KIT</h3>
      <div class="r-cost">${kit}</div>`;
  }

  renderDifficulty() {
    const d = DIFFICULTIES[this.selectedDifficulty];
    const el = $('difficulty-desc');
    if (el && d) el.textContent = d.desc;
  }

  bind() {
    $('btn-quick').addEventListener('click', () => {
      this.game.sound.ensure();
      const prof = this.readSaveInfo();
      if (prof) { /* quick start always starts fresh */ }
      this.game.newGame(this.game.defaultProfile());
    });
    $('btn-new').addEventListener('click', () => {
      this.game.sound.ensure();
      this.selectedProfession = 'survivor';
      this.selectedDifficulty = 'normal';
      $('create-name').value = 'Avery';
      this.renderProfessionInfo();
      this.renderDifficulty();
      this.openScreen('create');
    });
    $('btn-continue').addEventListener('click', () => {
      this.game.sound.ensure();
      if (!this.game.load()) {
        this.toast('No valid save found.', 'bad');
        this.updateTitleInfo();
      }
    });
    $('create-start').addEventListener('click', () => {
      this.game.sound.ensure();
      const name = ($('create-name').value || 'Avery').trim().slice(0, 18) || 'Avery';
      this.game.newGame({ name, profession: this.selectedProfession, difficulty: this.selectedDifficulty });
    });

    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        const scr = btn.closest('.screen');
        if (!scr) return;
        if (scr.id === 'screen-create') { this.showTitle(); return; }
        if (scr.id === 'screen-help' || scr.id === 'screen-pause' || scr.id === 'screen-inventory' ||
            scr.id === 'screen-loot' || scr.id === 'screen-map' || scr.id === 'screen-sleep') {
          this.closeScreen(this.current);
        }
      });
    });

    document.querySelectorAll('[data-open]').forEach(btn => {
      btn.addEventListener('click', () => {
        const what = btn.dataset.open;
        if (what === 'inventory') this.openInventory(this.tab);
        else if (what === 'map') this.openMap();
        else if (what === 'pause') this.openPause();
      });
    });
    $('minimap-wrap').addEventListener('click', () => this.openMap());

    this.refs.invTabs.addEventListener('click', e => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      this.tab = b.dataset.tab;
      if (this.tab !== 'craft') this.craftFilter = null;
      else this.craftFilter = null;
      this.renderInventory();
      this.game.sound.click();
    });
    this.refs.invBody.addEventListener('click', e => {
      const b = e.target.closest('button[data-act],button[data-craft],button[data-build],button[data-unequip]');
      if (!b) return;
      const g = this.game;
      if (b.dataset.craft) {
        const r = RECIPES.find(x => x.id === b.dataset.craft);
        if (r && g.craft(r)) this.renderInventory();
        return;
      }
      if (b.dataset.build) {
        const r = BUILD_RECIPES.find(x => x.id === b.dataset.build);
        if (!r) return;
        if (g.startBuild(r.id)) this.closeScreen('inventory');
        return;
      }
      if (b.dataset.unequip) {
        if (g.unequip(b.dataset.unequip)) this.renderInventory();
        return;
      }
      const idx = Number(b.dataset.idx);
      const entry = g.inventory[idx];
      if (!entry) return;
      if (b.dataset.act === 'primary') {
        const def = ITEMS[entry.id];
        if (def?.equip) g.equip(entry);
        else if (def?.use) g.useItem(entry);
        this.renderInventory();
      } else if (b.dataset.act === 'drop') {
        if (g.dropItem(entry)) this.renderInventory();
      }
    });

    $('loot-take-all').addEventListener('click', () => {
      if (!this.lootContainer) return;
      this.game.takeAll(this.lootContainer);
      this.renderLoot();
      this.updateWeight();
    });
    this.refs.lootList.addEventListener('click', e => {
      const b = e.target.closest('button[data-take]');
      if (!b || !this.lootContainer) return;
      const idx = Number(b.dataset.take);
      const entry = this.lootContainer.items[idx];
      if (entry) this.game.takeItem(this.lootContainer, entry, entry.qty || 1);
      this.renderLoot();
      this.updateWeight();
    });
    this.refs.lootInv.addEventListener('click', e => {
      const b = e.target.closest('button[data-put]');
      if (!b || !this.lootContainer) return;
      const idx = Number(b.dataset.put);
      const entry = this.game.inventory[idx];
      if (entry) this.game.putItem(this.lootContainer, entry, entry.qty || 1);
      this.renderLoot();
      this.updateWeight();
    });

    this.refs.worldMap.addEventListener('click', e => {
      const rect = this.refs.worldMap.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 900;
      const y = ((e.clientY - rect.top) / rect.height) * 900;
      const wp = this.renderer.mapClickToWorld(x, y);
      if (!wp) return;
      const cur = this.game.world.waypoint;
      if (cur && Math.hypot(cur.x - wp.x, cur.y - wp.y) < 3.5) {
        this.game.world.waypoint = null;
        this.toast('Waypoint cleared.', 'info', 1500);
      } else {
        this.game.world.waypoint = { x: wp.x, y: wp.y };
        this.toast('Waypoint placed.', 'good', 1500);
      }
      this.game.sound.click();
      this.renderer.drawWorldMap(this.refs.worldMap, this.game);
      this.updateMapSub();
    });

    $('pause-resume').addEventListener('click', () => this.closeScreen('pause'));
    $('pause-save').addEventListener('click', () => {
      if (this.game.save()) this.toast('Game saved.', 'good');
    });
    $('pause-help').addEventListener('click', () => this.openScreen('help'));
    $('set-sound').addEventListener('change', e => {
      this.game.settings.sound = e.target.checked;
      this.game.saveSettings();
      this.applySettings();
    });
    $('set-volume').addEventListener('input', e => {
      this.game.settings.volume = Number(e.target.value);
      this.game.saveSettings();
      this.game.sound.setVolume(this.game.settings.volume);
    });
    $('set-quality').addEventListener('change', e => {
      this.game.settings.quality = e.target.value;
      this.game.saveSettings();
      this.renderer.applyQuality?.();
      this.toast(`Graphics set to ${e.target.value}.`, 'info', 1600);
    });
    $('pause-abandon').addEventListener('click', () => {
      const btn = $('pause-abandon');
      if (!this.abandonArmed) {
        this.abandonArmed = true;
        btn.textContent = 'Tap again to abandon';
        btn.classList.add('danger');
        setTimeout(() => {
          if (this.abandonArmed) {
            this.abandonArmed = false;
            btn.textContent = 'Abandon run';
          }
        }, 4000);
        return;
      }
      this.abandonArmed = false;
      btn.textContent = 'Abandon run';
      this.game.deleteSave();
      this.showTitle();
    });

    this.screens.sleep.addEventListener('click', e => {
      const b = e.target.closest('[data-sleep]');
      if (!b) return;
      const hours = Number(b.dataset.sleep);
      if (!this.game.sleep(hours)) this.toast('You cannot sleep now.', 'warn');
    });

    $('death-respawn').addEventListener('click', () => {
      const prof = this.game.profile || this.game.defaultProfile();
      this.game.newGame({ name: prof.name, profession: prof.profession, difficulty: prof.difficulty });
    });
    $('death-title').addEventListener('click', () => this.showTitle());
    $('victory-title').addEventListener('click', () => this.showTitle());
    $('victory-continue').addEventListener('click', () => {
      this.screens.victory.classList.add('hidden');
      this.current = null;
      this.game.state = 'playing';
      this.game.paused = false;
      this.game.inputLocked = false;
      this.refs.hud.classList.remove('hidden');
    });

    // Build controls
    $('build-place').addEventListener('click', () => this.game.placeStructure());
    $('build-cancel').addEventListener('click', () => this.game.cancelBuild());

    // Touch buttons
    this.refs.btnInteract.addEventListener('click', e => {
      e.preventDefault();
      this.game.interact();
    });
    const attackDown = e => {
      e.preventDefault();
      this.game.sound.ensure();
      if (this.game.buildMode) { this.game.placeStructure(); return; }
      this.game.faceNearestZombie(7);
      this.game.attack();
      this.attackHeld = true;
    };
    const attackUp = () => { this.attackHeld = false; };
    this.refs.btnAttack.addEventListener('pointerdown', attackDown);
    this.refs.btnAttack.addEventListener('pointerup', attackUp);
    this.refs.btnAttack.addEventListener('pointercancel', attackUp);
    this.refs.btnAttack.addEventListener('pointerleave', attackUp);
    window.addEventListener('pointerup', attackUp);
    window.addEventListener('pointercancel', attackUp);

    this.refs.btnSprint.addEventListener('click', e => {
      e.preventDefault();
      this.game.toggleSprint();
      this.refs.btnSprint.classList.toggle('active', this.game.touch.sprint);
    });
    this.refs.btnCrouch.addEventListener('click', e => {
      e.preventDefault();
      this.game.toggleCrouch();
      this.refs.btnCrouch.classList.toggle('active', this.game.player?.crouch);
    });
    this.refs.btnLight.addEventListener('click', e => {
      e.preventDefault();
      this.game.toggleFlashlight();
      this.refs.btnLight.classList.toggle('active', !!this.game.player?.flashlightOn);
    });

    this.bindJoystick();

    window.addEventListener('keydown', e => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Escape') {
        e.preventDefault();
        if (this.current && this.current !== 'death' && this.current !== 'victory' && this.current !== 'title') {
          if (this.current === 'create') this.showTitle();
          else this.closeScreen(this.current);
        } else if (this.game.state === 'playing') {
          this.openPause();
        }
        return;
      }
      if (this.game.state !== 'playing' || this.current) return;
      if (e.code === 'KeyI' || e.code === 'Tab') { e.preventDefault(); this.openInventory(this.tab); }
      else if (e.code === 'KeyM') { e.preventDefault(); this.openMap(); }
      else if (e.code === 'KeyH') { e.preventDefault(); this.openScreen('help'); }
    });

    window.addEventListener('resize', () => {
      if (this.current === 'map' && this.game.world) this.renderer.drawWorldMap(this.refs.worldMap, this.game);
    });
  }

  bindJoystick() {
    const joy = this.refs.joystick;
    const stick = this.refs.stick;
    const update = e => {
      const rect = joy.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = (e.clientX - cx) / (rect.width * 0.34);
      let dy = (e.clientY - cy) / (rect.width * 0.34);
      const mag = Math.hypot(dx, dy);
      if (mag > 1) { dx /= mag; dy /= mag; }
      const max = rect.width * 0.29;
      stick.style.transform = `translate(${dx * max}px, ${dy * max}px)`;
      this.game.setJoystick(dx, dy);
    };
    const reset = () => {
      this.joyPointer = null;
      stick.style.transform = 'translate(0,0)';
      this.game.setJoystick(0, 0);
    };
    joy.addEventListener('pointerdown', e => {
      e.preventDefault();
      this.joyPointer = e.pointerId;
      try { joy.setPointerCapture?.(e.pointerId); } catch (err) { /* synthetic events */ }
      update(e);
    });
    joy.addEventListener('pointermove', e => {
      if (this.joyPointer !== e.pointerId) return;
      e.preventDefault();
      update(e);
    });
    joy.addEventListener('pointerup', e => { if (this.joyPointer === e.pointerId) reset(); });
    joy.addEventListener('pointercancel', reset);
    joy.addEventListener('pointerleave', e => { if (this.joyPointer === e.pointerId) reset(); });
  }

  // ------------------------------------------------------------- screens
  openScreen(name) {
    const el = this.screens[name];
    if (!el) return;
    if (name === 'help' && this.current !== 'help') this.helpReturn = this.current;
    for (const [k, s] of Object.entries(this.screens)) if (k !== name) s.classList.add('hidden');
    el.classList.remove('hidden');
    this.current = name;
    this.game.inputLocked = true;
    this.game.paused = true;
    this.game.sound.click();
    if (name === 'pause') this.fillPause();
    if (name === 'map') {
      this.renderer.drawWorldMap(this.refs.worldMap, this.game);
      this.updateMapSub();
    }
  }

  closeScreen(name) {
    if (!name || !this.screens[name]) return;
    this.screens[name].classList.add('hidden');
    if (this.current === name) this.current = null;
    if (name === 'loot') this.lootContainer = null;
    if (name === 'help' && this.helpReturn === 'pause' && this.game.state === 'playing') {
      this.helpReturn = null;
      this.openScreen('pause');
      return;
    }
    this.helpReturn = null;
    if (this.game.state === 'playing') {
      this.game.inputLocked = false;
      this.game.paused = false;
    }
  }

  closeAll() {
    this.hideAllScreens();
    this.current = null;
    this.helpReturn = null;
    this.lootContainer = null;
    this.refs.buildBar.classList.add('hidden');
    if (this.game.state === 'playing') {
      this.game.inputLocked = false;
      this.game.paused = false;
    }
  }

  hideAllScreens() {
    for (const s of Object.values(this.screens)) s.classList.add('hidden');
  }

  enterGame() {
    this.hideAllScreens();
    this.current = null;
    this.lootContainer = null;
    this.abandonArmed = false;
    this.refs.hud.classList.remove('hidden');
    this.refs.prompt.classList.add('hidden');
    this.refs.buildBar.classList.add('hidden');
    this.game.inputLocked = false;
    this.game.paused = false;
    document.body.classList.toggle('is-touch', this.game.isTouch);
    this.updateHUD(true);
    this.updateMinimap(1);
    this.refs.btnSprint.classList.remove('active');
    this.refs.btnCrouch.classList.remove('active');
    this.refs.btnLight.classList.remove('active');
    this.toast('Day 1. Search, drink, and stay quiet.', 'info', 4200);
  }

  onDeath(reason) {
    this.hideAllScreens();
    this.current = 'death';
    this.refs.hud.classList.add('hidden');
    this.refs.prompt.classList.add('hidden');
    this.refs.buildBar.classList.add('hidden');
    $('death-reason').textContent = reason || 'The dead brought you down.';
    $('death-stats').innerHTML = this.endStats();
    this.screens.death.classList.remove('hidden');
  }

  onVictory() {
    this.hideAllScreens();
    this.current = 'victory';
    this.refs.prompt.classList.add('hidden');
    this.refs.buildBar.classList.add('hidden');
    $('victory-text').textContent = `The convoy pulls away at dawn. ${this.game.profile?.name || 'You'} made it out of Havenwood.`;
    $('victory-stats').innerHTML = this.endStats();
    this.screens.victory.classList.remove('hidden');
  }

  endStats() {
    const g = this.game;
    const s = g.stats || {};
    const rows = [
      ['Days survived', g.day],
      ['Infected killed', s.kills || 0],
      ['Containers searched', s.looted || 0],
      ['Items crafted', s.crafted || 0],
      ['Structures built', s.built || 0],
      ['Damage taken', Math.round(s.damage || 0)],
      ['Distance walked', `${Math.round((s.distance || 0) * 2)} m`],
      ['Profession', PROFESSIONS[g.profile?.profession]?.name || 'Survivor'],
    ];
    return rows.map(([k, v]) => `<div class="es"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
  }

  fillPause() {
    const p = this.game.player;
    const prof = PROFESSIONS[this.game.profile?.profession];
    $('pause-sub').textContent = p ? `${p.name} · ${prof?.name || 'Survivor'} · Day ${this.game.day}, ${formatClock(this.game.hour).time}` : '';
    $('set-sound').checked = !!this.game.settings.sound;
    $('set-volume').value = this.game.settings.volume;
    $('set-quality').value = this.game.settings.quality || 'auto';
    $('pause-abandon').textContent = 'Abandon run';
  }

  // ------------------------------------------------------------- live frame
  frame(dt) {
    const g = this.game;
    if (!g.player || !g.world) return;
    if (this.attackHeld && g.state === 'playing' && !g.paused && !g.inputLocked) g.attack();
    this.updateHUD();
    this.updatePrompt();
    this.updateQuestTracker();
    this.minimapT += dt;
    if (this.minimapT > 0.3) {
      this.minimapT = 0;
      this.updateMinimap();
    }
  }

  updateHUD(force = false) {
    const g = this.game;
    const p = g.player;
    if (!p) return;
    const clock = formatClock(g.hour, g.day);
    if (this.refs.time.textContent !== clock.time) this.refs.time.textContent = clock.time;
    this.refs.day.textContent = `DAY ${g.day}`;
    this.refs.phase.textContent = timeOfDayName(g.hour);
    this.refs.temp.textContent = `${g.temperature()}°C`;
    this.refs.weather.textContent = g.weatherName();
    const loc = g.world.locationName(p.x, p.y);
    if (this.refs.location.textContent !== loc) this.refs.location.textContent = loc;

    const vals = {
      health: p.health / Math.max(1, p.maxHealth),
      stamina: p.stamina / Math.max(1, p.maxStamina),
      hunger: p.hunger / 100,
      thirst: p.thirst / 100,
      fatigue: p.fatigue / 100,
      warmth: p.warmth / 100,
    };
    for (const [key, v] of Object.entries(vals)) {
      const el = this.vitals[key];
      if (!el) continue;
      el.bar.style.width = `${clamp(v, 0, 1) * 100}%`;
      const readout = key === 'health' ? Math.ceil(p.health) : key === 'stamina' ? Math.ceil(p.stamina) : Math.ceil((key === 'fatigue' ? p.fatigue : key === 'warmth' ? p.warmth : p[key]));
      if (el.value.textContent !== String(readout)) el.value.textContent = readout;
      el.el.classList.toggle('low', (key === 'health' && v < 0.3) || (key === 'hunger' && v < 0.18) ||
        (key === 'thirst' && v < 0.18) || (key === 'warmth' && v < 0.28) || (key === 'fatigue' && v > 0.85));
    }

    const chips = [];
    if (p.health < 35) chips.push(['Critical', '']);
    if (p.bleeding > 0.5) chips.push(['Bleeding', '']);
    if (p.infection > 15) chips.push(['Infected', '']);
    if (p.fracture > 0) chips.push(['Fractured', '']);
    if (p.pain > 45) chips.push(['In pain', '']);
    if (p.hunger < 20) chips.push(['Starving', '']);
    if (p.thirst < 20) chips.push(['Dehydrated', '']);
    if (p.fatigue > 82) chips.push(['Exhausted', '']);
    if (p.warmth < 30) chips.push(['Freezing', 'cold']);
    if (p.wet > 60) chips.push(['Soaked', 'cold']);
    if (!chips.length) chips.push(['Stable', 'ok']);
    const sig = chips.map(c => c[0] + c[1]).join('|');
    if (force || sig !== this.statusSig) {
      this.statusSig = sig;
      this.refs.status.innerHTML = chips.map(([t, cls]) => `<span class="status-chip ${cls}">${esc(t)}</span>`).join('');
    }

    const lightEquipped = !!g.equipped?.light;
    this.refs.btnLight.classList.toggle('active', !!p.flashlightOn);
    this.refs.btnLight.style.opacity = lightEquipped ? '1' : '0.45';
    this.refs.btnSprint.classList.toggle('active', !!g.touch?.sprint);
    this.refs.btnCrouch.classList.toggle('active', !!p.crouch);
    this.refs.btnLight.disabled = !lightEquipped;
  }

  updateMinimap() {
    const g = this.game;
    if (!g.world || !g.player || this.refs.hud.classList.contains('hidden')) return;
    this.renderer.drawMinimap(this.refs.minimap, g);
  }

  updatePrompt() {
    const g = this.game;
    if (g.state !== 'playing' || this.current || g.buildMode) {
      this.refs.prompt.classList.add('hidden');
      this.refs.btnInteract.classList.remove('ready');
      return;
    }
    const it = g.nearestInteract;
    if (!it) {
      this.refs.prompt.classList.add('hidden');
      this.refs.btnInteract.classList.remove('ready');
      return;
    }
    this.refs.promptLabel.textContent = it.label;
    this.refs.promptKey.textContent = g.isTouch ? '•' : 'E';
    this.refs.prompt.classList.remove('hidden');
    this.refs.prompt.classList.add('ready');
    this.refs.btnInteract.classList.add('ready');
  }

  updateQuestTracker() {
    const g = this.game;
    if (!g.player) return;
    const objs = g.objectives();
    const sig = objs.map(o => `${o.id}:${o.done}:${o.detail}`).join('|');
    if (sig === this.questSig) return;
    this.questSig = sig;
    const ul = this.refs.quest.querySelector('ul');
    if (!ul) return;
    ul.innerHTML = objs.map(o => `
      <li class="${o.done ? 'done' : ''}">
        <span class="qcheck">${o.done ? '✓' : '·'}</span>
        <span class="qtext">${esc(o.text)}</span>
        <span class="qdetail">${esc(o.detail)}</span>
      </li>`).join('');
  }

  toast(text, type = 'info', ms = 3200) {
    if (!this.refs.toasts) return;
    while (this.refs.toasts.children.length >= 4) this.refs.toasts.firstElementChild.remove();
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    const icon = type === 'good' ? '✓' : type === 'bad' ? '✕' : type === 'warn' ? '!' : '·';
    el.innerHTML = `<span class="ti">${icon}</span><span>${esc(text)}</span>`;
    this.refs.toasts.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 450);
    }, Math.max(700, ms));
  }

  // -------------------------------------------------------------- inventory
  openInventory(tab, keepFilter = false) {
    if (this.game.state !== 'playing') return;
    if (tab) this.tab = tab;
    if (!keepFilter) this.craftFilter = null;
    this.renderInventory();
    this.openScreen('inventory');
  }

  updateWeight() {
    const g = this.game;
    const wt = g.getWeight();
    const cap = g.getCapacity();
    $('inv-weight').textContent = `${wt.toFixed(1)} / ${cap} kg`;
    $('inv-weight-bar').style.width = `${clamp(wt / Math.max(1, cap), 0, 1) * 100}%`;
    const lw = $('loot-weight');
    if (lw) lw.textContent = `${wt.toFixed(1)} / ${cap} kg`;
  }

  renderInventory() {
    const g = this.game;
    if (!g.player) return;
    const p = g.player;
    this.updateWeight();
    $('inv-title').textContent = p.name;
    $('inv-sub').textContent = `${PROFESSIONS[g.profile?.profession]?.name || 'Survivor'} · Day ${g.day} · ${formatClock(g.hour).time}`;
    this.refs.invTabs.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === this.tab));
    const body = this.refs.invBody;
    if (this.tab === 'items') body.innerHTML = this.renderItemsTab();
    else if (this.tab === 'equipment') body.innerHTML = this.renderEquipmentTab();
    else if (this.tab === 'craft') body.innerHTML = this.renderCraftTab();
    else if (this.tab === 'build') body.innerHTML = this.renderBuildTab();
    else body.innerHTML = this.renderStatusTab();
    if (this.tab === 'items' || this.tab === 'equipment') this.updateWeight();
  }

  itemMeta(entry) {
    const def = ITEMS[entry.id] || {};
    const bits = [];
    if (def.cat) bits.push(def.cat);
    if (def.w != null) bits.push(`${def.w} kg`);
    if (entry.dur != null && def.dur) {
      const pct = clamp(entry.dur / def.dur, 0, 1);
      bits.push(`<span class="cond">${Math.round(entry.dur)}/${def.dur} (${Math.round(pct * 100)}%)</span>`);
    }
    if (def.desc) bits.push(def.desc);
    return bits.join(' · ');
  }

  actionLabel(def) {
    if (!def) return null;
    if (def.equip === 'weapon') return 'Equip';
    if (def.equip === 'backpack') return 'Wear';
    if (def.equip === 'armor') return 'Wear';
    if (def.equip === 'light') return 'Equip';
    if (def.use) {
      if (def.cat === 'food') return 'Eat';
      if (def.cat === 'drink') return 'Drink';
      if (def.cat === 'medical') return 'Use';
      return 'Use';
    }
    return null;
  }

  renderItemsTab() {
    const g = this.game;
    if (!g.inventory.length) return '<div class="empty">YOUR PACK IS EMPTY</div>';
    return `<h3 class="section-title">CARRIED · ${g.inventory.length} ITEMS</h3>` +
      g.inventory.map((entry, idx) => {
        const def = ITEMS[entry.id];
        if (!def) return '';
        const qty = entry.qty || 1;
        const act = this.actionLabel(def);
        return `<div class="item-row">
          <div class="item-icon">${def.icon || '?'}</div>
          <div class="item-main">
            <div class="item-name">${esc(def.name)}${qty > 1 ? `<span class="qty">×${qty}</span>` : ''}</div>
            <div class="item-meta">${this.itemMeta(entry)}</div>
          </div>
          <div class="item-actions">
            ${act ? `<button class="mini primary" data-act="primary" data-idx="${idx}">${act}</button>` : ''}
            <button class="mini" data-act="drop" data-idx="${idx}">Drop</button>
          </div>
        </div>`;
      }).join('');
  }

  renderEquipmentTab() {
    const g = this.game;
    const slots = [
      ['weapon', 'Weapon'], ['light', 'Light'], ['backpack', 'Backpack'], ['armor', 'Armor'],
    ];
    const slotHtml = slots.map(([key, label]) => {
      const e = g.equipped[key];
      const def = e ? ITEMS[e.id] : null;
      return `<div class="equip-slot">
        <div class="slot-label">${label}</div>
        ${def ? `<div class="slot-item"><span>${def.icon || '?'}</span>${esc(def.name)}</div>
          ${e.dur != null && def.dur ? `<div class="item-meta"><span class="cond">Condition ${Math.round((e.dur / def.dur) * 100)}%</span></div>` : ''}
          <button class="mini" data-unequip="${key}">Unequip</button>` : '<div class="slot-empty">Empty</div>'}
      </div>`;
    }).join('');
    const w = g.getWeapon();
    return `<h3 class="section-title">EQUIPPED</h3>
      <div class="equip-grid">${slotHtml}</div>
      <h3 class="section-title">COMBAT READOUT</h3>
      <div class="stat-line"><span>Weapon</span><b>${esc(w.name)}</b></div>
      <div class="stat-line"><span>Damage</span><b>${w.weapon.damage}${w.weapon.ranged ? ' (ranged)' : ''}</b></div>
      <div class="stat-line"><span>Reach</span><b>${w.weapon.range} m</b></div>
      <div class="stat-line"><span>Stamina per swing</span><b>${w.weapon.stamina}</b></div>
      <div class="stat-line"><span>Noise</span><b>${w.weapon.noise}</b></div>
      <div class="stat-line"><span>Ammunition</span><b>${g.countItem('ammo')} rounds</b></div>
      <div class="stat-line"><span>Carrying</span><b>${g.getWeight().toFixed(1)} / ${g.getCapacity()} kg</b></div>`;
  }

  renderCraftTab() {
    const g = this.game;
    const list = RECIPES.filter(r => !this.craftFilter || r.station === this.craftFilter);
    if (!list.length) return '<div class="empty">NOTHING TO CRAFT HERE</div>';
    const header = this.craftFilter === 'heat'
      ? '<h3 class="section-title">COOKING · NEAR HEAT</h3>'
      : '<h3 class="section-title">CRAFTING</h3>';
    return header + list.map(r => {
      const chk = g.canCraft(r);
      const cost = Object.entries(r.cost || {}).map(([id, q]) => {
        const have = g.countItem(id);
        return `<span class="chip ${have < q ? 'miss' : ''}">${ITEMS[id]?.icon || ''} ${esc(ITEMS[id]?.name || id)} ${have}/${q}</span>`;
      }).join('');
      return `<div class="recipe">
        <div class="r-icon">${r.icon || '?'}</div>
        <div class="r-main">
          <div class="r-name">${esc(r.name)}${r.qty > 1 ? ` <span class="chip">×${r.qty}</span>` : ''}</div>
          <div class="r-desc">${esc(r.desc || '')}${r.station === 'heat' ? ' · requires heat' : ''}</div>
          <div class="r-cost">${cost}${r.level ? `<span class="chip req">${SKILLS[r.skill]?.name || r.skill} ${r.level}</span>` : ''}</div>
        </div>
        <div class="r-action">
          <button class="mini ${chk.ok ? 'primary' : ''}" data-craft="${r.id}" ${chk.ok ? '' : 'disabled'}>Craft</button>
          ${chk.ok ? '' : `<span class="r-reason">${esc(chk.reason)}</span>`}
        </div>
      </div>`;
    }).join('');
  }

  renderBuildTab() {
    const g = this.game;
    return '<h3 class="section-title">BUILD · CHOOSE A SITE AFTER CRAFTING</h3>' + BUILD_RECIPES.map(r => {
      const chk = g.canBuild(r);
      const cost = Object.entries(g.buildCost(r)).map(([id, q]) => {
        const have = g.countItem(id);
        return `<span class="chip ${have < q ? 'miss' : ''}">${ITEMS[id]?.icon || ''} ${esc(ITEMS[id]?.name || id)} ${have}/${q}</span>`;
      }).join('');
      return `<div class="recipe">
        <div class="r-icon">${r.icon || '?'}</div>
        <div class="r-main">
          <div class="r-name">${esc(r.name)}</div>
          <div class="r-desc">${esc(r.desc || '')}</div>
          <div class="r-cost">${cost}${r.level ? `<span class="chip req">${SKILLS[r.skill]?.name || r.skill} ${r.level}</span>` : ''}</div>
        </div>
        <div class="r-action">
          <button class="mini ${chk.ok ? 'primary' : ''}" data-build="${r.id}" ${chk.ok ? '' : 'disabled'}>Plan</button>
          ${chk.ok ? '' : `<span class="r-reason">${esc(chk.reason)}</span>`}
        </div>
      </div>`;
    }).join('');
  }

  renderStatusTab() {
    const g = this.game;
    const p = g.player;
    const stat = (label, value) => `<div class="stat-line"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
    const skills = Object.keys(SKILLS).map(k => {
      const prog = g.xpProgress(k);
      return `<div class="skill-row">
        <div class="skill-top"><span>${SKILLS[k].icon || ''} ${esc(SKILLS[k].name)}</span><b>LV ${prog.level}</b></div>
        <div class="bar"><i style="width:${Math.round(prog.pct * 100)}%"></i></div>
      </div>`;
    }).join('');
    const conditions = [];
    if (p.bleeding > 0) conditions.push('Bleeding');
    if (p.infection > 0) conditions.push(`Infection ${Math.round(p.infection)}%`);
    if (p.fracture > 0) conditions.push('Fractured limb');
    if (p.pain > 0) conditions.push(`Pain ${Math.round(p.pain)}%`);
    if (p.wet > 20) conditions.push(`Wet ${Math.round(p.wet)}%`);
    if (p.warmth < 35) conditions.push('Cold');
    if (p.hunger < 25) conditions.push('Hungry');
    if (p.thirst < 25) conditions.push('Thirsty');
    const objectives = g.objectives().map(o => `<div class="objective ${o.done ? 'done' : ''}">
      <span class="oc">${o.done ? '✓' : '○'}</span><span>${esc(o.text)}</span><span class="od">${esc(o.detail)}</span>
    </div>`).join('');
    return `<h3 class="section-title">CONDITION</h3>
      ${stat('Health', `${Math.ceil(p.health)} / ${p.maxHealth}`)}
      ${stat('Stamina', `${Math.ceil(p.stamina)} / ${p.maxStamina}`)}
      ${stat('Hunger', `${Math.ceil(p.hunger)} / 100`)}
      ${stat('Thirst', `${Math.ceil(p.thirst)} / 100`)}
      ${stat('Fatigue', `${Math.ceil(p.fatigue)} / 100`)}
      ${stat('Warmth', `${Math.ceil(p.warmth)} / 100`)}
      ${stat('Stress', `${Math.ceil(p.stress)} / 100`)}
      ${stat('Temperature', `${g.temperature()}°C`)}
      ${stat('Status', conditions.length ? conditions.join(', ') : 'Stable')}
      <h3 class="section-title">SKILLS</h3>${skills}
      <h3 class="section-title">OBJECTIVES</h3>${objectives}
      <h3 class="section-title">SURVIVAL LOG</h3>
      ${stat('Days survived', g.day)}
      ${stat('Infected killed', g.stats.kills || 0)}
      ${stat('Containers searched', g.stats.looted || 0)}
      ${stat('Items crafted', g.stats.crafted || 0)}
      ${stat('Structures built', g.stats.built || 0)}
      ${stat('Damage taken', Math.round(g.stats.damage || 0))}`;
  }

  // ------------------------------------------------------------------- loot
  openLoot(container) {
    if (!container) return;
    this.lootContainer = container;
    this.renderLoot();
    this.openScreen('loot');
    this.game.sound.click();
  }

  renderLoot() {
    const g = this.game;
    const c = this.lootContainer;
    if (!c) return;
    $('loot-title').textContent = c.name || 'Container';
    $('loot-sub').textContent = `${c.type || 'container'} · searched${c.searched ? '' : ' once'}`;
    const items = Array.isArray(c.items) ? c.items : [];
    this.refs.lootList.innerHTML = items.length ? items.map((entry, idx) => {
      const def = ITEMS[entry.id];
      if (!def) return '';
      const qty = entry.qty || 1;
      return `<div class="item-row">
        <div class="item-icon">${def.icon || '?'}</div>
        <div class="item-main">
          <div class="item-name">${esc(def.name)}${qty > 1 ? `<span class="qty">×${qty}</span>` : ''}</div>
          <div class="item-meta">${this.itemMeta(entry)}</div>
        </div>
        <div class="item-actions"><button class="mini primary" data-take="${idx}">Take</button></div>
      </div>`;
    }).join('') : '<div class="empty">NOTHING LEFT</div>';
    this.refs.lootInv.innerHTML = g.inventory.length ? g.inventory.map((entry, idx) => {
      const def = ITEMS[entry.id];
      if (!def) return '';
      const qty = entry.qty || 1;
      return `<div class="item-row">
        <div class="item-icon">${def.icon || '?'}</div>
        <div class="item-main">
          <div class="item-name">${esc(def.name)}${qty > 1 ? `<span class="qty">×${qty}</span>` : ''}</div>
          <div class="item-meta">${this.itemMeta(entry)}</div>
        </div>
        <div class="item-actions"><button class="mini" data-put="${idx}">Store</button></div>
      </div>`;
    }).join('') : '<div class="empty">PACK EMPTY</div>';
    this.updateWeight();
  }

  // -------------------------------------------------------------------- map
  openMap() {
    if (this.game.state !== 'playing') return;
    this.openScreen('map');
  }

  updateMapSub() {
    const g = this.game;
    const world = g.world;
    if (!world) return;
    let discovered = 0;
    for (const b of world.buildings) if (b.discovered) discovered++;
    let explored = 0;
    if (world.explored) for (let i = 0; i < world.explored.length; i++) if (world.explored[i]) explored++;
    const pct = Math.round((explored / Math.max(1, world.explored?.length || 1)) * 100);
    let wp = '';
    if (world.waypoint) {
      const dx = world.waypoint.x - g.player.x;
      const dy = world.waypoint.y - g.player.y;
      // world +x is screen south-east; describe in compass terms from screen axes
      const sx = dx - dy;
      const sy = dx + dy;
      const distM = Math.round(Math.hypot(dx, dy) * 2);
      const ns = sy < -3 ? 'north' : sy > 3 ? 'south' : '';
      const ew = sx > 3 ? 'east' : sx < -3 ? 'west' : '';
      wp = ` · Waypoint ${distM} m ${[ns, ew].filter(Boolean).join('-') || 'here'}`;
    }
    $('map-sub').textContent = `${pct}% explored · ${discovered}/${world.buildings.length} locations found${wp}`;
  }

  // ---------------------------------------------------------- sleep / pause
  openSleep() {
    const g = this.game;
    const p = g.player;
    if (!p) return;
    const loc = g.world.locationName(p.x, p.y);
    $('sleep-flavor').textContent = g.canSleep()
      ? `You are at ${loc}. The nearest dead are far enough away. Sleeping will pass time and restore fatigue.`
      : 'Something is hunting you. Sleeping now would be a mistake.';
    this.openScreen('sleep');
  }

  openPause() {
    if (this.game.state !== 'playing') return;
    this.openScreen('pause');
  }

  openCraft(station) {
    this.craftFilter = station || null;
    this.openInventory('craft', true);
  }

  setBuildMode(active, recipe) {
    this.refs.buildBar.classList.toggle('hidden', !active);
    if (active && recipe) this.refs.buildName.textContent = `${recipe.icon || ''} ${recipe.name}`;
    if (!active) this.refs.buildBar.classList.add('hidden');
  }
}
