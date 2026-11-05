// Ponto de entrada: fluxo de telas, entrada, loop principal e cooperativo local.
import { Game } from './game.js';
import { Renderer } from './renderer.js';
import { UI } from './ui.js';
import { Multiplayer } from './multiplayer.js';
import { audio } from './audio.js';
import { TILE } from './world.js';
import { clamp } from './util.js';

const canvas = document.getElementById('gameCanvas');
const ui = new UI();

let game = null;
let renderer = null;
let mp = null;
let hostDifficulty = 'sobrevivente';
let lastSingle = null;
let session = 0;
let starting = false;
let lastFrame = performance.now();
let hudTimer = 0;
let minimapTimer = 0;
let fpsAccum = 0;
let fpsFrames = 0;
let fps = 60;

const isTyping = (el) => {
  if (!el) return false;
  const tag = (el.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
};

const nextFrame = () => new Promise(resolve => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
});
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ======================= CICLO DE VIDA =======================
function clearInput() {
  if (!game) return;
  const inp = game.input;
  inp.up = inp.down = inp.left = inp.right = false;
  inp.sprint = inp.sneak = inp.attack = false;
  inp.pointerActive = false;
  inp.touchAim = null;
  document.querySelectorAll('.touch-btn.active').forEach(b => b.classList.remove('active'));
  const knob = document.getElementById('joystickKnob');
  if (knob) knob.style.transform = '';
}

function leaveRoom(silent = true) {
  if (mp) {
    try { mp.leave(silent); } catch { /* canal já fechado */ }
  }
  mp = null;
  ui.setMultiplayer(null);
}

function goMenu(opts = {}) {
  session++;
  starting = false;
  if (!opts.skipSave && game?.mode === 'single' && !game.dead) ui.autosave(true);
  clearInput();
  leaveRoom(true);
  game = null;
  renderer = null;
  ui.showMenu();
  ui.setMultiplayer(null);
  ui.refreshSaveInfo();
}

function attachGame(g, { multiplayer = false } = {}) {
  game = g;
  g.ui = ui;
  g.mp = multiplayer ? mp : null;
  g.isHost = !g.mp || g.mp.isHost !== false;

  renderer = new Renderer(canvas, g);
  ui.setGame(g, renderer);

  if (multiplayer && mp) {
    if (!mp.isHost) {
      // O anfitrião é autoritativo: o cliente espera o primeiro snapshot.
      g.zombies = [];
      g.corpses = [];
    }
    mp.setGame(g);
    ui.setMultiplayer(mp);
    ui.updateRoster();
    ui.refreshObjectives();
    if (mp.isHost) ui.notify('Você é o anfitrião. Zumbis e clima são simulados nesta aba.', 'mp', '👑', 5200);
    else ui.notify('Conectado à partida. Siga o anfitrião e sobreviva.', 'mp', '🔗', 5200);
  } else {
    ui.setMultiplayer(null);
  }
  ui.refreshHUD(true);
}

async function buildGame(opts, { multiplayer = false, intro = false } = {}) {
  const token = ++session;
  starting = true;
  ui.showLoading('Reunindo memórias, mapas e histórias...');
  ui.setLoading(14, 'Reunindo memórias, mapas e histórias...');
  await nextFrame();
  if (token !== session) return;
  ui.setLoading(38, 'Escavando ruas, casas e escombros...');
  await delay(90);
  if (token !== session) return;
  ui.setLoading(57, 'Distribuindo suprimentos — e aquilo que os quer.');
  await nextFrame();
  if (token !== session) return;

  let g = null;
  try {
    g = new Game(opts);
  } catch (err) {
    console.error('Falha ao gerar o mundo:', err);
    if (token === session) {
      starting = false;
      ui.showMenu();
      ui.notify('Não foi possível gerar o mundo. Tente novamente.', 'danger', '☣', 7000);
    }
    return;
  }
  if (token !== session) return;

  ui.setLoading(82, 'Acendendo as luzes. Apagando as esperanças.');
  await nextFrame();
  if (token !== session) return;

  attachGame(g, { multiplayer });
  ui.setLoading(100, 'O vale está esperando.');
  await delay(300);
  if (token !== session) return;

  starting = false;
  clearInput();
  ui.enterGame({ intro, multiplayer });
  if (intro) {
    game.paused = true;
  } else {
    game.paused = false;
  }
  if (!multiplayer) lastSingle = opts;
  audio.ensure();
}

function startSingle(config, save = null) {
  const opts = {
    seed: config.seed ?? Math.floor(Math.random() * 1e9),
    difficulty: config.difficulty || 'sobrevivente',
    background: config.background || 'estudante',
    playerName: config.name || config.playerName || 'Sobrevivente',
    mode: 'single',
    save,
  };
  return buildGame(opts, { multiplayer: false, intro: !save });
}

function startMultiplayerGame({ seed, difficulty, host = false }) {
  if (starting) return Promise.resolve();
  const opts = {
    seed,
    difficulty: difficulty || hostDifficulty || 'sobrevivente',
    background: mp?.background || 'estudante',
    playerName: mp?.name || 'Sobrevivente',
    mode: 'mp',
    mp,
  };
  return buildGame(opts, { multiplayer: true, intro: false }).then(() => {
    if (host) ui.notify('Partida iniciada. O mundo é compartilhado entre as abas.', 'mp', '🌍', 5000);
  });
}

// ======================= CALLBACKS DA INTERFACE =======================
ui.onStart = ({ name, background, difficulty }) => {
  startSingle({ name, background, difficulty, seed: Math.floor(Math.random() * 1e9) });
};

ui.onContinue = () => {
  const save = ui.readSave();
  if (!save) {
    ui.notify('Nenhum jogo salvo encontrado.', 'warn', '💾');
    ui.refreshSaveInfo();
    return;
  }
  startSingle({
    name: save.player?.name,
    background: save.player?.background || 'estudante',
    difficulty: save.difficulty || 'sobrevivente',
    seed: save.seed,
  }, save);
};

ui.onRetry = () => {
  const cfg = lastSingle || {
    name: 'Sobrevivente', background: 'estudante', difficulty: 'sobrevivente',
    seed: Math.floor(Math.random() * 1e9),
  };
  startSingle({ ...cfg, seed: Math.floor(Math.random() * 1e9) });
};

ui.onMenu = () => goMenu();

ui.onIntroStart = () => {
  if (!game) return;
  ui.introActive = false;
  document.getElementById('introScreen')?.classList.add('hidden');
  game.paused = false;
  audio.ensure();
  ui.refreshHUD(true);
  ui.notify('A casa está silenciosa. Lá fora, não.', 'info', '🚪', 4200);
};

function makeMultiplayer({ name, background }) {
  leaveRoom(true);
  mp = new Multiplayer({
    name,
    background,
    onLobby: (players, meta) => {
      if (!mp) return;
      const lobby = ui.el.lobby;
      if (!mp.isHost && !mp.hostId) return;
      if (!lobby || lobby.classList.contains('hidden')) ui.showLobby(mp.room, players);
      else ui.updateLobby(players, meta);
    },
    onChat: (msg) => ui.chatPush(msg),
    onStart: ({ seed, difficulty }) => {
      if (!mp) return;
      startMultiplayerGame({ seed, difficulty, host: false });
    },
    onError: (text) => {
      ui.showMultiError(text);
      if (text && text.includes('não suporta')) leaveRoom(true);
    },
    onDisconnect: () => {
      if (!mp) return;
      ui.notify('Conexão com o anfitrião perdida. Voltando ao menu...', 'danger', '📡', 6000);
      if (game) game.paused = true;
      setTimeout(() => {
        if (mp && !mp.closed) goMenu({ skipSave: true });
      }, 1800);
    },
    onNotify: (text, kind, icon, timeout) => ui.notify(text, kind, icon, timeout),
    onPlayerLeft: (p) => {
      ui.notify(`${p?.name || 'Um sobrevivente'} deixou a partida.`, 'info', '🚪');
      if (game) game.remotePlayers.delete(p?.id);
      ui.updateRoster();
    },
  });
  ui.setMultiplayer(mp);
}

ui.onMultiCreate = ({ name, background, difficulty }) => {
  hostDifficulty = difficulty || 'sobrevivente';
  makeMultiplayer({ name, background });
  if (!mp) return;
  const room = mp.createRoom();
  if (!room) {
    ui.showMultiError('Este navegador não suporta coop local. Use Chrome, Edge ou Firefox atualizado.');
    return;
  }
  ui.showLobby(room, [...mp.players.values()]);
  ui.notify('Sala criada. Compartilhe o código com outra aba.', 'good', '🏠', 5200);
};

ui.onMultiJoin = ({ name, background, code }) => {
  makeMultiplayer({ name, background });
  if (!mp) return;
  const room = mp.joinRoom(code);
  if (!room) return;
  ui.el.mpScreen?.classList.add('hidden');
  ui.showLoading('Procurando a sala ' + room + '...');
  ui.setLoading(40, 'Procurando a sala ' + room + '...');
};

ui.onLobbyStart = () => {
  if (!mp || !mp.isHost) return;
  if (starting) return;
  const seed = Math.floor(Math.random() * 1e9);
  mp.startGame(seed, hostDifficulty);
  startMultiplayerGame({ seed, difficulty: hostDifficulty, host: true });
};

ui.onLobbyLeave = () => {
  leaveRoom(false);
  ui.showMenu();
};

ui.onTouchAction = (action, active, btn) => {
  if (!game || game.dead) return;
  const inp = game.input;
  switch (action) {
    case 'attack':
      inp.attack = !!active;
      btn?.classList.toggle('active', !!active);
      break;
    case 'sprint':
      if (!active) break;
      inp.sprint = !inp.sprint;
      btn?.classList.toggle('active', inp.sprint);
      break;
    case 'sneak':
      if (!active) break;
      inp.sneak = !inp.sneak;
      btn?.classList.toggle('active', inp.sneak);
      break;
    case 'interact':
      if (active) game.interact();
      break;
    case 'inventory':
      if (active) ui.openInventory();
      break;
    case 'build':
      if (active) ui.openBuild();
      break;
    case 'flashlight':
      if (active) game.toggleFlashlight();
      break;
    case 'pause':
      if (active) ui.togglePause();
      break;
    default:
      break;
  }
};

// O chat da equipe abre com Enter (o input já trata o envio).
function openChat() {
  if (!mp || !game || game.mode !== 'mp') return;
  if (ui.isAnyOverlayOpen()) return;
  ui.toggleChat(true);
  setTimeout(() => ui.el.chatInput?.focus(), 0);
}

// ======================= ENTRADA — TECLADO =======================
const held = new Set();

window.addEventListener('keydown', (e) => {
  const typing = isTyping(e.target);

  if (e.key === 'Escape') {
    if (ui.chatOpen) { ui.toggleChat(false); e.preventDefault(); return; }
    if (typing) return;
    if (ui.isAnyOverlayOpen()) {
      if (game?.buildMode) game.cancelBuild();
      ui.closeAll();
      e.preventDefault();
      return;
    }
    if (game && !game.dead && !ui.introActive) { ui.togglePause(); e.preventDefault(); }
    return;
  }

  if (typing || !game || game.dead) return;

  if (e.key === 'Enter') {
    if (game.mode === 'mp' && !ui.chatOpen) { openChat(); e.preventDefault(); }
    return;
  }

  const inp = game.input;
  switch (e.code) {
    case 'KeyW': case 'ArrowUp': inp.up = true; held.add('up'); break;
    case 'KeyS': case 'ArrowDown': inp.down = true; held.add('down'); break;
    case 'KeyA': case 'ArrowLeft': inp.left = true; held.add('left'); break;
    case 'KeyD': case 'ArrowRight': inp.right = true; held.add('right'); break;
    case 'ShiftLeft': case 'ShiftRight': inp.sprint = true; break;
    case 'ControlLeft': case 'ControlRight': inp.sneak = true; break;
    case 'Space': if (!e.repeat) inp.attack = true; break;
    default: break;
  }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();

  if (e.repeat) return;

  switch (e.code) {
    case 'KeyE': game.interact(); break;
    case 'KeyF': {
      if (game.player.inVehicle) game.exitVehicle();
      else {
        const it = game.getInteractable();
        if (it?.type === 'vehicle') game.enterVehicle(it.ref);
        else ui.notify('Nenhum veículo por perto.', 'warn', '🚗', 1800);
      }
      break;
    }
    case 'KeyI': case 'Tab': ui.openInventory(); break;
    case 'KeyB': ui.openBuild(); break;
    case 'KeyK': ui.openSkills(); break;
    case 'KeyM': ui.openMap(); break;
    case 'KeyQ': game.toggleFlashlight(); break;
    case 'KeyG': game.openTrunk(); break;
    case 'KeyR': {
      const v = game.world.vehicleNear(game.player.x, game.player.y, 85);
      if (!v) { ui.notify('Nenhum veículo por perto.', 'warn', '🚗', 1800); break; }
      const canRepair = v.condition < 99 && game.hasTool('chave_inglesa', 'martelo') && game.countItem('pecas') > 0;
      if (canRepair) game.repairVehicle();
      else game.refuelVehicle();
      break;
    }
    case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4':
      game.useQuick(Number(e.code.slice(-1)) - 1);
      break;
    default: break;
  }
});

window.addEventListener('keyup', (e) => {
  if (isTyping(e.target) || !game) return;
  const inp = game.input;
  switch (e.code) {
    case 'KeyW': case 'ArrowUp': inp.up = false; break;
    case 'KeyS': case 'ArrowDown': inp.down = false; break;
    case 'KeyA': case 'ArrowLeft': inp.left = false; break;
    case 'KeyD': case 'ArrowRight': inp.right = false; break;
    case 'ShiftLeft': case 'ShiftRight': inp.sprint = false; break;
    case 'ControlLeft': case 'ControlRight': inp.sneak = false; break;
    case 'Space': inp.attack = false; break;
    default: break;
  }
});

window.addEventListener('blur', () => {
  if (game) {
    game.input.up = game.input.down = game.input.left = game.input.right = false;
    game.input.sprint = game.input.sneak = game.input.attack = false;
  }
  held.clear();
});

// ======================= ENTRADA — MOUSE =======================
function updatePointer(e) {
  if (!game) return;
  game.setPointer(e.clientX, e.clientY);
}

canvas?.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  updatePointer(e);
});

canvas?.addEventListener('pointerdown', (e) => {
  if (!game || game.dead) return;
  audio.ensure();

  if (e.pointerType === 'touch') {
    // Toque no cenário: mira no ponto e ataca enquanto pressiona.
    const z = game.camera.zoom || 1;
    const wx = game.camera.x + e.clientX / z;
    const wy = game.camera.y + e.clientY / z;
    game.input.pointerActive = false;
    game.input.touchAim = { x: wx, y: wy };
    game.input.attack = true;
    e.preventDefault();
    return;
  }

  updatePointer(e);
  if (e.button === 2) {
    if (game.buildMode) game.cancelBuild();
    return;
  }
  if (e.button !== 0) return;
  if (ui.isAnyOverlayOpen()) return;

  if (game.buildMode) {
    const ghost = game.getBuildGhost();
    if (ghost) game.placeBuild(ghost.tx, ghost.ty);
    game.input.attack = false;
  } else {
    game.input.attack = true;
  }
});

window.addEventListener('pointerup', (e) => {
  if (!game) return;
  if (e.pointerType === 'touch') {
    // O botão de ataque continua mandando quando estiver pressionado.
    if (!document.querySelector('[data-touch="attack"].active')) game.input.attack = false;
    game.input.touchAim = null;
  } else if (e.button === 0) {
    game.input.attack = false;
  }
});

window.addEventListener('pointercancel', () => {
  if (!game) return;
  game.input.attack = false;
  game.input.touchAim = null;
});

canvas?.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (game?.buildMode) game.cancelBuild();
});

// ======================= ENTRADA — TOQUE =======================
const joystick = document.getElementById('joystick');
const joystickKnob = document.getElementById('joystickKnob');
let joystickId = null;

function setJoystick(e) {
  if (!game || !joystick || !joystickKnob) return;
  const rect = joystick.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let dx = e.clientX - cx;
  let dy = e.clientY - cy;
  const max = rect.width * 0.36;
  const len = Math.hypot(dx, dy) || 1;
  if (len > max) { dx = dx / len * max; dy = dy / len * max; }
  joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;

  const nx = dx / max, ny = dy / max;
  const dead = 0.2;
  const inp = game.input;
  inp.left = nx < -dead;
  inp.right = nx > dead;
  inp.up = ny < -dead;
  inp.down = ny > dead;
}

function resetJoystick() {
  joystickId = null;
  if (joystickKnob) joystickKnob.style.transform = '';
  if (!game) return;
  game.input.left = game.input.right = game.input.up = game.input.down = false;
}

if (joystick) {
  joystick.addEventListener('pointerdown', (e) => {
    if (!game) return;
    audio.ensure();
    joystickId = e.pointerId;
    joystick.setPointerCapture?.(e.pointerId);
    joystick.classList.add('active');
    setJoystick(e);
    e.preventDefault();
  });
  joystick.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joystickId) return;
    setJoystick(e);
    e.preventDefault();
  });
  joystick.addEventListener('pointerup', (e) => {
    if (e.pointerId !== joystickId) return;
    joystick.classList.remove('active');
    resetJoystick();
    e.preventDefault();
  });
  joystick.addEventListener('pointercancel', (e) => {
    if (e.pointerId !== joystickId) return;
    joystick.classList.remove('active');
    resetJoystick();
  });
}

// ======================= LOOP PRINCIPAL =======================
function frame(now) {
  const rawDt = (now - lastFrame) / 1000;
  const dt = clamp(Number.isFinite(rawDt) ? rawDt : 0.016, 0, 0.05);
  lastFrame = now;

  if (game) {
    game.update(dt);
    if (renderer) renderer.draw(dt);

    hudTimer += dt;
    if (hudTimer >= 0.2) {
      hudTimer = 0;
      ui.refreshHUD();
      if (mp && ui.el.mpRoster && !ui.el.mpRoster.classList.contains('hidden')) ui._refreshRoster();
    }

    minimapTimer += dt;
    if (minimapTimer >= 0.32 && !ui.el.hud?.classList.contains('hidden')) {
      minimapTimer = 0;
      const mini = document.getElementById('minimap');
      if (mini && renderer) renderer.drawMinimap(mini);
      if (!ui.el.mapScreen?.classList.contains('hidden') && renderer) renderer.drawFullMap(ui.el.mapCanvas);
    }

    // Atualiza o prompt de interação com um pouco mais de frequência.
    if (!ui.isAnyOverlayOpen()) ui.refreshHUD(false);
  } else {
    ui.animateMenu(dt);
  }

  // Contadores leves para diagnóstico.
  fpsAccum += dt;
  fpsFrames++;
  if (fpsAccum >= 1) {
    fps = Math.round(fpsFrames / fpsAccum);
    fpsAccum = 0;
    fpsFrames = 0;
    ui.el.fpsLabel?.remove();
  }

  requestAnimationFrame(frame);
}

// ======================= CICLO DE ABA / PERSISTÊNCIA =======================
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game?.mode === 'single' && !game.dead) ui.autosave(true);
});

window.addEventListener('beforeunload', () => {
  if (game?.mode === 'single' && !game.dead) ui.autosave(true);
});

window.addEventListener('error', (e) => {
  console.error('Erro em tempo de execução:', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('Promessa rejeitada:', e.reason);
});

// ======================= BOOT =======================
ui.onResize();
ui.animateMenu(0.016);
requestAnimationFrame((t) => { lastFrame = t; frame(t); });

// Depuração acessível pelo console do navegador.
window.ultimoAbrigo = {
  get game() { return game; },
  get renderer() { return renderer; },
  get mp() { return mp; },
  get fps() { return fps; },
  ui,
  startSingle,
  goMenu,
  TILE,
};
