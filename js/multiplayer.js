// Cooperativo local por abas usando BroadcastChannel.
// O anfitrião é autoritativo para zumbis; cada aba simula o próprio sobrevivente.

import { ZOMBIE_TYPES } from './data.js';
import { TAU } from './util.js';

const COLORS = ['#e0b95f', '#78b8d6', '#9cbb72', '#d98b78', '#b595cb', '#6cd7c4', '#d6c47a', '#c98ab4'];
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeCode() {
  let out = '';
  for (let i = 0; i < 4; i++) out += CHARS[Math.floor(Math.random() * CHARS.length)];
  return out;
}

function shortId() {
  return 'p' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
}

export class Multiplayer {
  constructor(opts = {}) {
    this.name = (opts.name || 'Sobrevivente').slice(0, 18);
    this.background = opts.background || 'estudante';
    this.id = shortId();
    this.color = COLORS[Math.floor(Math.random() * COLORS.length)];
    this.room = '';
    this.channel = null;
    this.isHost = false;
    this.hostId = null;
    this.players = new Map();
    this.game = null;
    this.started = false;
    this.closed = false;

    this.onLobby = opts.onLobby || (() => {});
    this.onChat = opts.onChat || (() => {});
    this.onStart = opts.onStart || (() => {});
    this.onError = opts.onError || (() => {});
    this.onDisconnect = opts.onDisconnect || (() => {});
    this.onNotify = opts.onNotify || (() => {});
    this.onPlayerLeft = opts.onPlayerLeft || (() => {});

    this._stateTimer = 0;
    this._zombieTimer = 0;
    this._lobbyTimer = 0;
    this._lastHostSeen = Date.now();
    this._lastX = 0;
    this._lastY = 0;
    this._disconnectWarned = false;
    this._joinTimer = null;
    this._heartbeat = null;

    this._onUnload = () => this.leave(true);
    window.addEventListener('beforeunload', this._onUnload);
  }

  // ----------------------------- ciclo de vida -----------------------------
  _open() {
    if (this.channel) return;
    if (typeof BroadcastChannel === 'undefined') {
      this.onError('Este navegador não suporta coop local. Use Chrome, Edge ou Firefox atualizado.');
      return;
    }
    this.channel = new BroadcastChannel('ultimo-abrigo-' + this.room);
    this.channel.onmessage = (ev) => this._receive(ev.data);
    this._heartbeat = setInterval(() => this._heart(), 2600);
  }

  createRoom() {
    if (this.channel) this.leave(true);
    this.closed = false;
    this.room = makeCode();
    this.isHost = true;
    this.hostId = this.id;
    this.players.clear();
    this._addSelf(true);
    this._open();
    if (!this.channel) return null;
    this._broadcastLobby();
    this._emitLobby();
    return this.room;
  }

  joinRoom(code) {
    const clean = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (clean.length !== 4) {
      this.onError('O código da sala precisa ter 4 caracteres.');
      return null;
    }
    if (this.channel) this.leave(true);
    this.closed = false;
    this.room = clean;
    this.isHost = false;
    this.hostId = null;
    this.players.clear();
    this._addSelf(false);
    this._open();
    if (!this.channel) return null;
    this._post({ t: 'join', player: this.selfInfo() });
    this._joinTimer = setTimeout(() => {
      if (!this.hostId && !this.closed) {
        this.onError('Sala não encontrada. Confira o código e se a outra aba está aberta.');
        this.leave(true);
      }
    }, 2200);
    return this.room;
  }

  leave(silent = false) {
    if (this.closed) return;
    this.closed = true;
    if (this.channel && this.room) this._post({ t: 'leave', id: this.id });
    if (this._joinTimer) clearTimeout(this._joinTimer);
    if (this._heartbeat) clearInterval(this._heartbeat);
    this._joinTimer = null;
    this._heartbeat = null;
    if (this.channel) {
      try { this.channel.close(); } catch { /* ignora */ }
    }
    this.channel = null;
    this.game = null;
    this.started = false;
    this.players.clear();
    this.hostId = null;
    this.isHost = false;
    if (!silent) this.onNotify('Você saiu da sala.', 'info', '🚪');
  }

  _addSelf(host) {
    this.players.set(this.id, {
      id: this.id, name: this.name, color: this.color, background: this.background,
      host: !!host, lastSeen: Date.now(), downed: false,
    });
  }

  selfInfo() {
    return {
      id: this.id, name: this.name, color: this.color, background: this.background,
      host: this.isHost, lastSeen: Date.now(),
    };
  }

  // ----------------------------- mensagens -----------------------------
  _post(msg) {
    if (!this.channel) return;
    try { this.channel.postMessage({ ...msg, room: this.room, from: this.id }); } catch { /* canal fechado */ }
  }

  send(msg) {
    if (!this.channel) return;
    this._post(msg);
  }

  _broadcastLobby() {
    if (!this.isHost) return;
    const players = [...this.players.values()].map(p => ({ ...p }));
    this._post({ t: 'lobby', players, hostId: this.hostId });
  }

  _emitLobby() {
    const players = [...this.players.values()].map(p => ({ ...p }));
    this.onLobby(players, { isHost: this.isHost, room: this.room, hostId: this.hostId });
  }

  _receive(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.room !== this.room) return;
    if (msg.from === this.id) return;

    switch (msg.t) {
      case 'join': {
        if (!this.isHost) return;
        const p = msg.player || {};
        if (!p.id) return;
        this.players.set(p.id, {
          id: p.id, name: String(p.name || 'Sobrevivente').slice(0, 18), color: p.color || '#9cbb72',
          background: p.background || 'estudante', host: false, lastSeen: Date.now(), downed: false,
        });
        this._lastHostSeen = Date.now();
        this._post({ t: 'welcome', hostId: this.id, players: [...this.players.values()], started: this.started });
        this._broadcastLobby();
        this._emitLobby();
        this.onNotify(`${this.players.get(p.id).name} entrou na sala.`, 'mp', '🤝');
        break;
      }
      case 'welcome': {
        if (this.isHost) return;
        if (this._joinTimer) { clearTimeout(this._joinTimer); this._joinTimer = null; }
        this.hostId = msg.hostId || null;
        if (Array.isArray(msg.players)) {
          for (const p of msg.players) {
            this.players.set(p.id, { ...p, lastSeen: Date.now() });
          }
        }
        this._lastHostSeen = Date.now();
        this._disconnectWarned = false;
        this._emitLobby();
        this.onNotify('Conectado à sala ' + this.room + '.', 'good', '🔗');
        break;
      }
      case 'lobby': {
        if (this.isHost) return;
        this.hostId = msg.hostId || this.hostId;
        if (Array.isArray(msg.players)) {
          const seen = new Set();
          for (const p of msg.players) {
            seen.add(p.id);
            const old = this.players.get(p.id);
            this.players.set(p.id, { ...old, ...p, lastSeen: Date.now() });
          }
          // remove quem sumiu do lobby, exceto a si mesmo
          for (const id of [...this.players.keys()]) {
            if (id !== this.id && !seen.has(id)) this.players.delete(id);
          }
        }
        this._lastHostSeen = Date.now();
        this._disconnectWarned = false;
        this._emitLobby();
        break;
      }
      case 'start': {
        if (this.isHost || this.started) return;
        this.started = true;
        this._lastHostSeen = Date.now();
        this.onStart({
          seed: msg.seed,
          difficulty: msg.difficulty || 'sobrevivente',
          day: msg.day || 1,
          time: msg.time,
          weather: msg.weather,
        });
        break;
      }
      case 'chat': {
        const clean = String(msg.text || '').slice(0, 160);
        if (!clean) return;
        this.onChat({
          system: !!msg.system, id: msg.id || msg.from, name: msg.name || 'Sobrevivente',
          text: clean, time: Date.now(),
        });
        break;
      }
      case 'state': {
        this._lastHostSeen = Date.now();
        const p = this.players.get(msg.from);
        if (p) p.lastSeen = Date.now();
        if (!this.game) return;
        this.game.receivePlayerState({ ...msg, id: msg.from });
        break;
      }
      case 'zombies': {
        if (this.isHost || !this.game || !Array.isArray(msg.list)) return;
        this._lastHostSeen = Date.now();
        if (typeof msg.time === 'number') this.game.time = msg.time;
        if (typeof msg.day === 'number' && msg.day !== this.game.day) this.game.day = msg.day;
        if (msg.weather && msg.weather !== this.game.weather) {
          this.game.weather = msg.weather;
          this.game.applyWeatherAudio();
        }
        this._syncZombies(msg.list);
        break;
      }
      case 'hitZombie': {
        if (!this.isHost || !this.game) return;
        const z = this.game.zombies.find(z => z.id === msg.zid);
        if (z) this.game.damageZombie(z, Math.max(1, Math.min(160, Number(msg.dmg) || 1)), { head: !!msg.head });
        break;
      }
      case 'zombieDied': {
        if (this.isHost || !this.game) return;
        const i = this.game.zombies.findIndex(z => z.id === msg.zid);
        if (i >= 0) {
          const z = this.game.zombies[i];
          this.game.corpses.push({ x: z.x, y: z.y, angle: z.angle, type: z.type, time: 0, color: '#5d6753' });
          this.game.zombies.splice(i, 1);
        }
        break;
      }
      case 'zombieHit': {
        if (msg.target !== this.id || !this.game) return;
        this.game.damagePlayer(Math.max(1, Math.min(80, Number(msg.dmg) || 1)), 'zumbi');
        break;
      }
      case 'down': {
        if (msg.id === this.id) return;
        const p = this.players.get(msg.from);
        if (p) p.downed = true;
        if (!this.game) break;
        const rp = this.game.remotePlayers.get(msg.from);
        if (rp && msg.down) {
          rp.downed = true;
          this.onNotify(`${rp.name} caiu. Aproxime-se para reanimar.`, 'danger', '💀');
        }
        break;
      }
      case 'revive': {
        if (msg.target !== this.id || !this.game) return;
        const p = this.game.player;
        p.downed = false;
        p.downTimer = 0;
        p.health = Math.max(45, p.health);
        p.bleed = Math.max(0, p.bleed - 20);
        this.onNotify('Um aliado reanimou você. Não desperdice a segunda chance.', 'good', '🩺');
        break;
      }
      case 'leave': {
        const p = this.players.get(msg.from);
        this.players.delete(msg.from);
        if (this.game) this.game.remotePlayers.delete(msg.from);
        if (this.isHost) {
          this._broadcastLobby();
          this._emitLobby();
        }
        if (p) this.onPlayerLeft(p);
        break;
      }
      case 'ping': {
        this._lastHostSeen = Date.now();
        if (this.isHost) {
          const p = this.players.get(msg.from);
          if (p) p.lastSeen = Date.now();
          this._post({ t: 'pong' });
          if (!this.game) this._broadcastLobby();
        }
        break;
      }
      case 'pong': {
        this._lastHostSeen = Date.now();
        break;
      }
      default:
        break;
    }
  }

  // ----------------------------- heartbeat -----------------------------
  _heart() {
    if (this.closed) return;
    if (this.isHost) {
      const now = Date.now();
      for (const [id, p] of [...this.players]) {
        if (id === this.id) continue;
        if (now - (p.lastSeen || 0) > 10500) {
          this.players.delete(id);
          if (this.game) this.game.remotePlayers.delete(id);
          this.onPlayerLeft(p);
        }
      }
      this._broadcastLobby();
      this._emitLobby();
    } else {
      this._post({ t: 'ping' });
      if (this.hostId && Date.now() - this._lastHostSeen > 9500 && !this._disconnectWarned) {
        this._disconnectWarned = true;
        this.onDisconnect();
      }
    }
  }

  // ----------------------------- partida -----------------------------
  startGame(seed, difficulty) {
    if (!this.isHost) return;
    this.started = true;
    this._post({
      t: 'start', seed, difficulty,
      day: 1, time: 8 * 60 + 10, weather: 'limpo',
    });
    this._broadcastLobby();
  }

  setGame(game) {
    this.game = game;
    this._lastX = game.player.x;
    this._lastY = game.player.y;
    // Host anuncia seu estado imediatamente.
    this._sendState();
  }

  tick(dt) {
    if (!this.game || this.closed) return;
    this._stateTimer += dt;
    this._zombieTimer += dt;
    this._lobbyTimer += dt;

    if (this._stateTimer >= 0.085) {
      this._stateTimer = 0;
      this._sendState();
    }
    if (this.isHost && this._zombieTimer >= 0.14) {
      this._zombieTimer = 0;
      this._sendZombies();
    }
    if (this._lobbyTimer >= 1.6) {
      this._lobbyTimer = 0;
      this._emitLobby();
    }
  }

  _sendState() {
    if (!this.game || this.closed) return;
    const p = this.game.player;
    const moved = Math.hypot(p.x - this._lastX, p.y - this._lastY);
    this._lastX = p.x;
    this._lastY = p.y;
    const weapon = this.game.weaponStack;
    this._post({
      t: 'state', name: p.name, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10,
      angle: Math.round(p.angle * 100) / 100, hp: Math.round(p.health),
      downed: !!p.downed, moving: moved > 0.4, weapon: weapon?.id || null,
      flashlight: !!p.flashlight, color: this.color,
    });
  }

  _sendZombies() {
    if (!this.game || this.closed) return;
    const list = this.game.zombies.slice(0, 260).map(z => ({
      id: z.id, x: Math.round(z.x), y: Math.round(z.y),
      angle: Math.round(z.angle * 100) / 100,
      type: z.type, hp: Math.max(0, Math.round(z.hp)), maxHp: Math.round(z.maxHp),
      speed: Math.round(z.speed * 10) / 10, damage: Math.round(z.damage * 10) / 10,
      size: z.size, state: z.state, alert: Math.round((z.alert || 0) * 10) / 10,
      attackCd: Math.round((z.attackCd || 0) * 100) / 100,
      anim: Math.round((z.anim || 0) * 10) / 10, lunge: Math.round((z.lunge || 0) * 100) / 100,
    }));
    this._post({
      t: 'zombies', list,
      time: Math.round(this.game.time * 10) / 10,
      day: this.game.day,
      weather: this.game.weather,
    });
  }

  _syncZombies(list) {
    const byId = new Map(this.game.zombies.map(z => [z.id, z]));
    const seen = new Set();
    let added = 0;
    for (const s of list) {
      if (!s || !s.id) continue;
      seen.add(s.id);
      let z = byId.get(s.id);
      if (!z) {
        const def = ZOMBIE_TYPES[s.type] || ZOMBIE_TYPES.comum;
        z = {
          id: s.id, x: s.x, y: s.y, angle: s.angle || 0, type: s.type || 'comum',
          hp: s.hp, maxHp: s.maxHp || def.hp, speed: s.speed || def.speed,
          damage: s.damage || def.damage, size: s.size || def.size,
          state: s.state || 'idle', alert: s.alert || 0, target: null, wander: null,
          idleTimer: 2, attackCd: s.attackCd || 0, anim: s.anim || Math.random() * 10,
          groanCd: 5, home: { x: s.x, y: s.y }, stuck: 0, trapCd: 0, hitFlash: 0,
          lunge: s.lunge || 0, remote: true,
        };
        this.game.zombies.push(z);
        added++;
      }
      z.tx = s.x; z.ty = s.y;
      z.angle = s.angle ?? z.angle;
      z.hp = s.hp; z.maxHp = s.maxHp || z.maxHp;
      z.state = s.state || z.state; z.alert = s.alert || 0;
      z.attackCd = s.attackCd || 0; z.anim = s.anim ?? z.anim;
      z.lunge = s.lunge || 0; z.remote = true;
      if (added === 0 && (Math.abs(z.x - s.x) > 3 || Math.abs(z.y - s.y) > 3)) {
        z.x += (s.x - z.x) * 0.25;
        z.y += (s.y - z.y) * 0.25;
      }
    }
    for (let i = this.game.zombies.length - 1; i >= 0; i--) {
      if (!seen.has(this.game.zombies[i].id)) this.game.zombies.splice(i, 1);
    }
  }

  // ----------------------------- chat -----------------------------
  sendChat(text) {
    const clean = String(text || '').trim().slice(0, 120);
    if (!clean) return;
    const msg = { t: 'chat', id: this.id, name: this.name, text: clean };
    this.onChat({ system: false, id: this.id, name: this.name, text: clean, time: Date.now() });
    this._post(msg);
  }

  sendSystemChat(text) {
    this._post({ t: 'chat', id: 'system', name: 'Sistema', text, system: true });
  }

  announceDown(down = true) {
    this._post({ t: 'down', down });
  }

  // ----------------------------- sincronização de aliados -----------------------------
  drawRemotePlayers(canvas) {
    // Reservado para HUD extra; o renderer desenha os aliados no mundo.
    return canvas;
  }
}
