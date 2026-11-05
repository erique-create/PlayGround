// Interface: menus, HUD, painéis, notificações, chat e lobby.
import {
  ITEMS, BACKGROUNDS, DIFFICULTIES, SKILLS, BUILDABLES, CRAFT_RECIPES, SEASONS, WEATHERS,
} from './data.js';
import { TILE } from './world.js';
import { formatClock, dist, clamp } from './util.js';
import { audio } from './audio.js';

export const SAVE_KEY = 'ultimoAbrigo.save.v2';
const TYPE_LABEL = {
  food: 'Comida', drink: 'Bebida', med: 'Medicamento', weapon: 'Arma', tool: 'Ferramenta',
  material: 'Material', clothing: 'Vestuário', backpack: 'Mochila', ammo: 'Munição',
  seed: 'Semente', hygiene: 'Higiene', valuable: 'Valioso', misc: 'Diverso',
};
const STATUS_ORDER = ['food', 'drink', 'med', 'weapon', 'clothing', 'backpack', 'tool', 'material', 'ammo', 'seed', 'hygiene', 'valuable', 'misc'];
const FILTERS = [
  ['all', 'Tudo'], ['food', 'Comida'], ['drink', 'Bebida'], ['med', 'Remédio'], ['weapon', 'Armas'],
  ['material', 'Materiais'], ['clothing', 'Roupas'], ['tool', 'Ferramentas'], ['misc', 'Diversos'],
];
const TOUCH_QUERY = '(hover: none) and (pointer: coarse)';
const STAT_LABEL = {
  weight: 'Peso', value: 'Valor', hunger: 'Fome', thirst: 'Sede', fatigue: 'Sono',
  health: 'Saúde', heal: 'Cura', bleed: 'Sangramento', infection: 'Infecção', hygiene: 'Higiene',
  damage: 'Dano', range: 'Alcance', cooldown: 'Recarga', durability: 'Durabilidade',
  capacity: 'Capacidade', armor: 'Armadura', insulation: 'Aquecimento', morale: 'Moral',
  fuel: 'Combustível', accuracy: 'Precisão', pellets: 'Projéteis',
};

const TIPS = [
  'Barulho atrai. Sempre.',
  'Uma porta fechada compra segundos. Uma barricada compra minutos.',
  'Beba antes da sede virar fraqueza.',
  'Zumbis não sentem dor, mas sentem fogo.',
  'Comida crua pode custar mais que uma noite de fome.',
  'Não corrija um erro com uma arma de fogo.',
  'Nem todo sobrevivente quer conversar.',
  'A noite muda as regras. A neblina muda tudo.',
];

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function pct(v, max) { return clamp(Math.round((v / (max || 100)) * 100), 0, 100); }
function fmtKg(v) { return (Math.round(v * 10) / 10).toFixed(1) + ' kg'; }

export class UI {
  constructor() {
    this.game = null;
    this.renderer = null;
    this.mp = null;
    this.hudDirty = true;
    this.marker = null;
    this.introActive = false;
    this.chatOpen = false;
    this.touchEnabled = false;
    this.menuTime = 0;
    this.menuDpr = 1;
    this.selectedStack = null;
    this.invFilter = 'all';
    this.buildTab = 'build';
    this.tradeNpc = null;
    this.tradeOffer = null;
    this.tradePayment = null;
    this.selectedBackground = 'estudante';
    this.selectedDifficulty = 'sobrevivente';
    this._lastHud = 0;
    this._lastInteract = 0;
    this._lastInteractable = undefined;
    this._toastTimers = new Set();
    this._bannerTimer = null;
    this._dayTimer = null;
    this._lastObjectiveSig = '';
    this._menuW = 0;
    this._menuH = 0;

    this.onStart = () => {};
    this.onContinue = () => {};
    this.onRetry = () => {};
    this.onMenu = () => {};
    this.onIntroStart = () => {};
    this.onMultiCreate = () => {};
    this.onMultiJoin = () => {};
    this.onLobbyStart = () => {};
    this.onLobbyLeave = () => {};
    this.onTouchAction = () => {};
    this.onChatSend = () => {};
    this.onHowFromPause = null;

    this._cache();
    this._bind();
    this._renderCharacterChoices();
    this._renderMultiSelects();
    this.refreshSaveInfo();
    this.menuTip = TIPS[Math.floor(Math.random() * TIPS.length)];
    if (this.$('menuTip')) this.$('menuTip').textContent = 'Dica: ' + this.menuTip;

    const prefersTouch = window.matchMedia(TOUCH_QUERY).matches || navigator.maxTouchPoints > 1;
    this.touchEnabled = prefersTouch;
    if (prefersTouch) this.$('touchControls')?.classList.remove('hidden');
  }

  $(id) { return document.getElementById(id); }

  _cache() {
    this.el = {
      menu: this.$('menu'), charScreen: this.$('charScreen'), loading: this.$('loadingScreen'),
      mpScreen: this.$('mpScreen'), lobby: this.$('lobbyScreen'), intro: this.$('introScreen'),
      hud: this.$('hud'), touch: this.$('touchControls'), fade: this.$('fadeOverlay'),
      toasts: this.$('toasts'), eventBanner: this.$('eventBanner'), dayBanner: this.$('dayBanner'),
      markerHud: this.$('markerHud'), downed: this.$('downedOverlay'), chatBox: this.$('chatBox'),
      chatToggle: this.$('chatToggle'), chatLog: this.$('chatLog'), chatInput: this.$('chatInput'),
      mpRoster: this.$('mpRoster'), objectives: this.$('objectivesCard'), objList: this.$('objList'),
      hotbar: this.$('hotbar'), equipped: this.$('equippedName'), interact: this.$('interactPrompt'),
      interactLabel: this.$('interactLabel'), invWeight: this.$('invWeight'), invList: this.$('invList'),
      invDetail: this.$('invDetail'), invFilters: this.$('invFilters'), buildMaterials: this.$('buildMaterials'),
      buildGrid: this.$('buildGrid'), craftGrid: this.$('craftGrid'), skillsGrid: this.$('skillsGrid'),
      statsGrid: this.$('statsGrid'), playerLevel: this.$('playerLevel'), mapMeta: this.$('mapMeta'),
      lootTitle: this.$('lootTitle'), lootItems: this.$('lootItems'), lootPlayerItems: this.$('lootPlayerItems'),
      lootWeight: this.$('lootWeight'), lootHint: this.$('lootHint'), dialogName: this.$('npcName'),
      dialogPersonality: this.$('npcPersonality'), dialogLine: this.$('npcLine'), dialogGreeting: this.$('npcGreeting'),
      npcFollow: this.$('npcFollow'), tradeName: this.$('tradeNpcName'), tradeOffers: this.$('tradeOffers'),
      tradePlayer: this.$('tradePlayerItems'), tradeStatus: this.$('tradeStatus'), tradeConfirm: this.$('tradeConfirm'),
      pauseStats: this.$('pauseStats'), pauseTip: this.$('pauseTip'), deathCause: this.$('deathCause'),
      deathStats: this.$('deathStats'), deathQuote: this.$('deathQuote'), noteText: this.$('noteText'),
      loadingBar: this.$('loadingBar'), loadingText: this.$('loadingText'), loadingTip: this.$('loadingTip'),
      lobbyCode: this.$('lobbyCode'), lobbyPlayers: this.$('lobbyPlayers'), lobbyHint: this.$('lobbyHint'),
      lobbyStart: this.$('lobbyStart'), lobbyChatLog: this.$('lobbyChatLog'), lobbyChatInput: this.$('lobbyChatInput'),
      mpError: this.$('mpError'), charSummary: this.$('charSummary'), charName: this.$('charName'),
      continueInfo: this.$('continueInfo'), btnContinue: this.$('btnContinue'), dayLabel: this.$('dayLabel'),
      clockLabel: this.$('clockLabel'), weatherLabel: this.$('weatherLabel'), seasonLabel: this.$('seasonLabel'),
      tempLabel: this.$('tempLabel'), zoneLabel: this.$('zoneLabel'), coordLabel: this.$('coordLabel'),
      survivorCount: this.$('survivorCount'), statusRow: this.$('statusRow'), markerText: this.$('markerText'),
      markerDist: this.$('markerDist'), downedText: this.$('downedText'), mpBackground: this.$('mpBackground'),
      mpDifficulty: this.$('mpDifficulty'), mpName: this.$('mpName'), mapCanvas: this.$('mapCanvas'),
      menuCanvas: this.$('menuCanvas'), pauseMute: this.$('pauseMute'),
      death: this.$('deathScreen'), pauseSave: this.$('pauseSave'),
    };
    this.vitals = {};
    document.querySelectorAll('.vital').forEach(el => { this.vitals[el.dataset.v] = el; });
  }

  _bind() {
    const on = (id, ev, fn) => {
      const el = this.$(id);
      if (el) el.addEventListener(ev, fn);
    };

    on('btnNew', 'click', () => { audio.ensure(); audio.play('ui'); this.showCharacter(); });
    on('btnContinue', 'click', () => { audio.ensure(); audio.play('ui'); this.onContinue(); });
    on('btnMulti', 'click', () => { audio.ensure(); audio.play('ui'); this.showMultiplayer(); });
    on('btnHow', 'click', () => { audio.play('ui'); this.showHow(); });
    on('charBack', 'click', () => this.showMenu());
    on('charStart', 'click', () => this._startFromCharacter());
    on('charName', 'keydown', (e) => { if (e.key === 'Enter') this._startFromCharacter(); });
    on('mpBack', 'click', () => this.showMenu());
    on('mpCreate', 'click', () => this._createRoom());
    on('mpJoin', 'click', () => this._joinRoom());
    on('mpCode', 'keydown', (e) => { if (e.key === 'Enter') this._joinRoom(); });
    on('mpName', 'keydown', (e) => { if (e.key === 'Enter') this._createRoom(); });
    on('lobbyLeave', 'click', () => this.onLobbyLeave());
    on('lobbyStart', 'click', () => { audio.play('ui'); this.onLobbyStart(); });
    on('copyCode', 'click', () => this._copyLobbyCode());
    on('lobbyChatInput', 'keydown', (e) => {
      if (e.key === 'Enter') {
        const text = e.currentTarget.value.trim();
        if (text && this.mp) this.mp.sendChat(text);
        e.currentTarget.value = '';
        e.preventDefault();
      }
    });
    on('introStart', 'click', () => { audio.ensure(); audio.play('ui'); this.onIntroStart(); });

    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => this.hideOverlay(btn.dataset.close));
    });

    // Criação de personagem (delegação)
    const bgGrid = this.$('backgroundGrid');
    if (bgGrid) bgGrid.addEventListener('click', (e) => {
      const card = e.target.closest('[data-bg]');
      if (!card) return;
      this.selectBackground(card.dataset.bg);
      audio.play('ui');
    });
    const diffGrid = this.$('difficultyGrid');
    if (diffGrid) diffGrid.addEventListener('click', (e) => {
      const card = e.target.closest('[data-diff]');
      if (!card) return;
      this.selectDifficulty(card.dataset.diff);
      audio.play('ui');
    });

    // Inventário
    if (this.el.hotbar) this.el.hotbar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-quick]');
      if (!b || !this.game) return;
      this.game.useQuick(Number(b.dataset.quick));
      this.el.hotbar.dataset.sig = '';
      this.refreshHUD(true);
    });

    if (this.el.invFilters) this.el.invFilters.addEventListener('click', (e) => {
      const b = e.target.closest('[data-filter]');
      if (!b) return;
      this.invFilter = b.dataset.filter;
      this._renderFilters();
      this.refreshInventory();
      audio.play('ui');
    });
    if (this.el.invList) this.el.invList.addEventListener('click', (e) => {
      const row = e.target.closest('[data-inv-index]');
      if (!row || !this.game) return;
      const stack = this.game.player.inventory[Number(row.dataset.invIndex)];
      if (!stack) return;
      this.selectedStack = stack;
      this.refreshInventory();
      audio.play('ui');
    });
    if (this.el.invList) this.el.invList.addEventListener('dblclick', (e) => {
      const row = e.target.closest('[data-inv-index]');
      if (!row || !this.game) return;
      const stack = this.game.player.inventory[Number(row.dataset.invIndex)];
      if (stack) this._useOrEquip(stack);
    });
    if (this.el.invDetail) this.el.invDetail.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-item-action]');
      if (!btn || !this.game || !this.selectedStack) return;
      const action = btn.dataset.itemAction;
      if (action === 'use') this._useOrEquip(this.selectedStack);
      else if (action === 'equip') { this.game.equipItem(this.selectedStack); this.refreshInventory(); }
      else if (action === 'drop') { this.game.dropItem(this.selectedStack); this.selectedStack = null; this.refreshInventory(); }
    });

    // Construção
    document.querySelectorAll('[data-build-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        this.buildTab = tab.dataset.buildTab;
        document.querySelectorAll('[data-build-tab]').forEach(t => t.classList.toggle('active', t === tab));
        this.el.buildGrid.classList.toggle('hidden', this.buildTab !== 'build');
        this.el.craftGrid.classList.toggle('hidden', this.buildTab !== 'craft');
        this.refreshCrafting();
        audio.play('ui');
      });
    });
    if (this.el.buildGrid) this.el.buildGrid.addEventListener('click', (e) => {
      const card = e.target.closest('[data-build-type]');
      if (!card || !this.game) return;
      this.game.selectBuildable(card.dataset.buildType);
      this.hideOverlay('buildScreen');
    });
    if (this.el.craftGrid) this.el.craftGrid.addEventListener('click', (e) => {
      const card = e.target.closest('[data-craft-id]');
      if (!card || !this.game) return;
      this.game.craft(card.dataset.craftId);
      this.refreshCrafting();
    });

    // Saque
    on('takeAll', 'click', () => this.game?.takeAllLoot());
    if (this.el.lootItems) this.el.lootItems.addEventListener('click', (e) => {
      const row = e.target.closest('[data-loot-index]');
      if (!row || !this.game?.lootOpen) return;
      const item = this.game.lootOpen.items[Number(row.dataset.lootIndex)];
      if (item) this.game.takeLoot(item);
    });
    if (this.el.lootPlayerItems) this.el.lootPlayerItems.addEventListener('click', (e) => {
      const row = e.target.closest('[data-store-index]');
      if (!row || !this.game) return;
      const stack = this.game.player.inventory[Number(row.dataset.storeIndex)];
      if (!stack) return;
      if (['storage', 'trunk'].includes(this.game.lootOpen?.kind)) this.game.storeLoot(stack);
      else this.notify('Este recipiente não aceita itens.', 'info', '📦');
    });

    // Diálogo
    on('npcTalk', 'click', () => { if (this.game?.dialogNpc) this.game.npcChat(this.game.dialogNpc); });
    on('npcTrade', 'click', () => this._openTrade());
    on('npcFollow', 'click', () => { if (this.game?.dialogNpc) this.game.npcRecruit(this.game.dialogNpc); });
    if (this.el.tradeOffers) this.el.tradeOffers.addEventListener('click', (e) => {
      const row = e.target.closest('[data-offer]');
      if (!row) return;
      this.tradeOffer = Number(row.dataset.offer);
      this.refreshTrade();
    });
    if (this.el.tradePlayer) this.el.tradePlayer.addEventListener('click', (e) => {
      const row = e.target.closest('[data-pay-index]');
      if (!row || !this.game) return;
      this.tradePayment = this.game.player.inventory[Number(row.dataset.payIndex)] || null;
      this.refreshTrade();
    });
    on('tradeConfirm', 'click', () => {
      if (!this.game || !this.tradeNpc) return;
      const ok = this.game.tradeWith(this.tradeNpc, this.tradeOffer, this.tradePayment);
      if (ok) { this.tradeOffer = null; this.tradePayment = null; this.refreshTrade(); }
    });

    // Pausa / morte
    on('pauseResume', 'click', () => this.hideOverlay('pauseScreen'));
    on('pauseSave', 'click', () => this.autosave(false));
    on('pauseMute', 'click', () => this._toggleMute());
    on('pauseHow', 'click', () => this.showHow(true));
    on('pauseMenu', 'click', () => {
      if (this.game?.mode === 'mp' && this.mp) this.mp.leave();
      this.onMenu();
    });
    on('deathRetry', 'click', () => this.onRetry());
    on('deathMenu', 'click', () => { if (this.mp) this.mp.leave(); this.onMenu(); });
    on('sleepConfirm', 'click', () => { this.hideOverlay('sleepScreen'); this.game?.sleepInBed(); });
    on('sleepCancel', 'click', () => this.hideOverlay('sleepScreen'));
    on('objToggle', 'click', () => {
      this.el.objectives.classList.toggle('collapsed');
      this.$('objToggle').textContent = this.el.objectives.classList.contains('collapsed') ? '+' : '–';
    });

    // Chat
    on('chatToggle', 'click', () => this.toggleChat());
    on('chatInput', 'keydown', (e) => {
      if (e.key === 'Enter') {
        const text = e.currentTarget.value.trim();
        if (text && this.mp) this.mp.sendChat(text);
        e.currentTarget.value = '';
        this.toggleChat(false);
        e.preventDefault();
      } else if (e.key === 'Escape') {
        this.toggleChat(false);
        e.currentTarget.blur();
        e.preventDefault();
      }
    });

    // Toque
    document.querySelectorAll('[data-touch]').forEach(btn => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        audio.ensure();
        this.onTouchAction(btn.dataset.touch, true, btn);
      });
      btn.addEventListener('pointerup', (e) => {
        e.preventDefault();
        this.onTouchAction(btn.dataset.touch, false, btn);
      });
      btn.addEventListener('pointercancel', () => this.onTouchAction(btn.dataset.touch, false, btn));
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.chatOpen) {
        this.toggleChat(false);
        this.el.chatInput.blur();
      }
    });
  }

  // ======================= MENU E FLUXO =======================
  showMenu() {
    this._hideAllPanels();
    this.hideHud();
    this.el.menu?.classList.remove('hidden');
    this.el.charScreen?.classList.add('hidden');
    this.el.mpScreen?.classList.add('hidden');
    this.el.lobby?.classList.add('hidden');
    this.el.loading?.classList.add('hidden');
    this.el.intro?.classList.add('hidden');
    this.el.death?.classList.add('hidden');
    this.game = null;
    this.renderer = null;
    this.marker = null;
    this.refreshSaveInfo();
    this._drawMenuStill();
  }

  showCharacter() {
    this.el.menu?.classList.add('hidden');
    this.el.charScreen?.classList.remove('hidden');
    this._renderCharacterChoices();
    this.selectBackground(this.selectedBackground);
    this.selectDifficulty(this.selectedDifficulty);
    if (this.el.charName && !this.el.charName.value) this.el.charName.value = 'Sobrevivente';
  }

  showMultiplayer() {
    this.el.menu?.classList.add('hidden');
    this.el.mpScreen?.classList.remove('hidden');
    if (this.el.mpError) this.el.mpError.textContent = '';
    if (this.el.mpName && this.el.mpName.value === 'Sobrevivente') {
      const last = localStorage.getItem('ultimoAbrigo.lastName');
      if (last) this.el.mpName.value = last;
    }
  }

  showLobby(room, players) {
    this._hideAllPanels();
    this.el.lobby?.classList.remove('hidden');
    if (this.el.lobbyCode) this.el.lobbyCode.textContent = room || '----';
    this.updateLobby(players || [], { isHost: this.mp?.isHost, room });
  }

  updateLobby(players, meta = {}) {
    if (!this.el.lobbyPlayers) return;
    const list = Array.isArray(players) ? players : [];
    const sorted = [...list].sort((a, b) => (b.host ? 1 : 0) - (a.host ? 1 : 0));
    this.el.lobbyPlayers.innerHTML = sorted.map(p => `
      <li>
        <span class="dot" style="background:${esc(p.color || '#9cbb72')};box-shadow:0 0 9px ${esc(p.color || '#9cbb72')}88"></span>
        <span>${esc(p.name || 'Sobrevivente')}${p.id === this.mp?.id ? ' <small class="muted">(você)</small>' : ''}</span>
        ${p.host ? '<span class="host-tag">ANFITRIÃO</span>' : ''}
      </li>
    `).join('') || '<li class="muted">Ninguém na sala ainda.</li>';
    if (this.el.lobbyCode) this.el.lobbyCode.textContent = meta.room || this.mp?.room || '----';
    const host = !!meta.isHost;
    if (this.el.lobbyStart) this.el.lobbyStart.classList.toggle('hidden', !host);
    if (this.el.lobbyHint) {
      if (host) this.el.lobbyHint.textContent = list.length > 1
        ? 'Todos prontos. Inicie a sobrevivência quando quiser.'
        : 'Compartilhe o código e abra outra aba para jogar junto. Você também pode iniciar sozinho.';
      else this.el.lobbyHint.textContent = 'Aguardando o anfitrião iniciar a partida...';
    }
  }

  showLoading(text = 'Construindo cidades, estradas e memórias...') {
    this._hideAllPanels();
    this.hideHud();
    this.el.menu?.classList.add('hidden');
    this.el.charScreen?.classList.add('hidden');
    this.el.mpScreen?.classList.add('hidden');
    this.el.lobby?.classList.add('hidden');
    this.el.intro?.classList.add('hidden');
    this.el.death?.classList.add('hidden');
    this.el.loading?.classList.remove('hidden');
    this.setLoading(8, text);
    if (this.el.loadingTip) this.el.loadingTip.textContent = 'Dica: ' + TIPS[Math.floor(Math.random() * TIPS.length)];
  }

  setLoading(progress, text) {
    if (this.el.loadingBar) this.el.loadingBar.style.width = clamp(progress, 0, 100) + '%';
    if (text && this.el.loadingText) this.el.loadingText.textContent = text;
  }

  showIntro() {
    this.el.loading?.classList.add('hidden');
    this.el.intro?.classList.remove('hidden');
    this.introActive = true;
    if (this.game) this.game.paused = true;
  }

  enterGame({ intro = false, multiplayer = false } = {}) {
    this.el.menu?.classList.add('hidden');
    this.el.charScreen?.classList.add('hidden');
    this.el.mpScreen?.classList.add('hidden');
    this.el.lobby?.classList.add('hidden');
    this.el.loading?.classList.add('hidden');
    this.el.intro?.classList.add('hidden');
    this.el.death?.classList.add('hidden');
    this._hideAllPanels();
    this.showHud();
    this.introActive = !!intro;
    if (intro) this.showIntro();
    else if (this.game) this.game.paused = false;
    if (multiplayer) this.enableChat(true);
    else this.enableChat(false);
    if (this.touchEnabled) this.el.touch?.classList.remove('hidden');
    this.hudDirty = true;
    this.refreshHUD(true);
  }

  hideAllScreens() {
    this._hideAllPanels();
    ['menu', 'charScreen', 'mpScreen', 'lobby', 'loading', 'intro'].forEach(id => this.$(`${id}Screen`) || this.$(id));
    this.el.menu?.classList.add('hidden');
    this.el.charScreen?.classList.add('hidden');
    this.el.mpScreen?.classList.add('hidden');
    this.el.lobby?.classList.add('hidden');
    this.el.loading?.classList.add('hidden');
    this.el.intro?.classList.add('hidden');
  }

  _startFromCharacter() {
    const name = (this.el.charName?.value || 'Sobrevivente').trim().slice(0, 22) || 'Sobrevivente';
    localStorage.setItem('ultimoAbrigo.lastName', name);
    audio.play('ui');
    this.onStart({
      name, background: this.selectedBackground, difficulty: this.selectedDifficulty,
    });
  }

  _createRoom() {
    const name = (this.el.mpName?.value || 'Sobrevivente').trim().slice(0, 18) || 'Sobrevivente';
    localStorage.setItem('ultimoAbrigo.lastName', name);
    const background = this.el.mpBackground?.value || 'estudante';
    const difficulty = this.el.mpDifficulty?.value || 'sobrevivente';
    if (this.el.mpError) this.el.mpError.textContent = '';
    audio.play('ui');
    this.onMultiCreate({ name, background, difficulty });
  }

  _joinRoom() {
    const name = (this.el.mpName?.value || 'Sobrevivente').trim().slice(0, 18) || 'Sobrevivente';
    localStorage.setItem('ultimoAbrigo.lastName', name);
    const code = (this.el.mpCode?.value || '').trim().toUpperCase();
    const background = this.el.mpBackground?.value || 'estudante';
    if (!code) { if (this.el.mpError) this.el.mpError.textContent = 'Digite o código de 4 caracteres da sala.'; return; }
    if (this.el.mpError) this.el.mpError.textContent = '';
    audio.play('ui');
    this.onMultiJoin({ name, code, background });
  }

  showMultiError(text) {
    if (this.el.mpError) this.el.mpError.textContent = text || '';
    this.el.mpScreen?.classList.remove('hidden');
    this.el.lobby?.classList.add('hidden');
    this.el.menu?.classList.add('hidden');
  }

  async _copyLobbyCode() {
    const code = this.el.lobbyCode?.textContent || '';
    try {
      await navigator.clipboard.writeText(code);
      this.notify('Código copiado: ' + code, 'good', '📋');
    } catch {
      this.notify('Selecione e copie o código: ' + code, 'info', '📋');
    }
  }

  _renderCharacterChoices() {
    const bgGrid = this.$('backgroundGrid');
    if (bgGrid && !bgGrid.childElementCount) {
      bgGrid.innerHTML = Object.entries(BACKGROUNDS).map(([id, b]) => `
        <button class="bg-card" data-bg="${esc(id)}">
          <span class="bg-icon">${esc(b.icon)}</span>
          <strong>${esc(b.name)}</strong>
          <p>${esc(b.desc)}</p>
          <div class="bg-skills">${Object.entries(b.skills || {}).map(([s, lv]) => `<span>${esc(SKILLS[s]?.name || s)} ${lv}</span>`).join('')}</div>
        </button>
      `).join('');
    }
    const diffGrid = this.$('difficultyGrid');
    if (diffGrid && !diffGrid.childElementCount) {
      diffGrid.innerHTML = Object.entries(DIFFICULTIES).map(([id, d]) => `
        <button class="diff-card" data-diff="${esc(id)}">
          <strong>${esc(d.icon)} ${esc(d.name)}</strong>
          <small>${esc(d.desc)}</small>
        </button>
      `).join('');
    }
  }

  _renderMultiSelects() {
    if (this.el.mpBackground && !this.el.mpBackground.childElementCount) {
      this.el.mpBackground.innerHTML = Object.entries(BACKGROUNDS)
        .map(([id, b]) => `<option value="${esc(id)}">${esc(b.icon)} ${esc(b.name)}</option>`).join('');
    }
    if (this.el.mpDifficulty && !this.el.mpDifficulty.childElementCount) {
      this.el.mpDifficulty.innerHTML = Object.entries(DIFFICULTIES)
        .map(([id, d]) => `<option value="${esc(id)}">${esc(d.icon)} ${esc(d.name)}</option>`).join('');
    }
  }

  selectBackground(id) {
    if (!BACKGROUNDS[id]) id = 'estudante';
    this.selectedBackground = id;
    document.querySelectorAll('[data-bg]').forEach(el => el.classList.toggle('active', el.dataset.bg === id));
    const b = BACKGROUNDS[id];
    if (this.el.charSummary) {
      const skills = Object.entries(b.skills || {}).map(([s, lv]) => `${SKILLS[s]?.name || s} ${lv}`).join(' · ') || 'Sem treinamento';
      const items = (b.items || []).map(([item, qty]) => `${qty}x ${ITEMS[item]?.name || item}`).join(', ');
      this.el.charSummary.innerHTML = `<strong>${esc(b.icon)} ${esc(b.name)}</strong><br>${esc(b.desc)}<br><span class="muted">Habilidades: ${esc(skills)}</span><br><span class="muted">Começa com: ${esc(items)}</span>`;
    }
  }

  selectDifficulty(id) {
    if (!DIFFICULTIES[id]) id = 'sobrevivente';
    this.selectedDifficulty = id;
    document.querySelectorAll('[data-diff]').forEach(el => el.classList.toggle('active', el.dataset.diff === id));
  }

  // ======================= SAVE E MENU =======================
  readSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !data.player) return null;
      return data;
    } catch { return null; }
  }

  refreshSaveInfo() {
    const save = this.readSave();
    if (!this.el.btnContinue) return;
    if (!save) {
      this.el.btnContinue.disabled = true;
      if (this.el.continueInfo) this.el.continueInfo.textContent = 'Nenhum jogo salvo';
      return;
    }
    this.el.btnContinue.disabled = false;
    const when = save.savedAt ? new Date(save.savedAt) : null;
    let time = '';
    try { time = when ? when.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + when.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''; } catch { time = ''; }
    const name = save.player?.name || 'Sobrevivente';
    if (this.el.continueInfo) this.el.continueInfo.textContent = `Dia ${save.day || 1} · ${name}${time ? ' · ' + time : ''}`;
  }

  autosave(silent = false) {
    if (!this.game || this.game.mode !== 'single' || this.game.dead) return false;
    try {
      const sv = this.game.serialize();
      sv.savedAt = Date.now();
      localStorage.setItem(SAVE_KEY, JSON.stringify(sv));
      this.refreshSaveInfo();
      if (!silent) this.notify('Jogo salvo.', 'good', '💾');
      return true;
    } catch {
      if (!silent) this.notify('Não foi possível salvar: armazenamento cheio.', 'danger', '💾');
      return false;
    }
  }

  clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignora */ }
    this.refreshSaveInfo();
  }

  // ======================= HUD =======================
  showHud() {
    this.el.hud?.classList.remove('hidden');
    this.hudDirty = true;
  }

  hideHud() {
    this.el.hud?.classList.add('hidden');
    this.el.touch?.classList.add('hidden');
    this.el.markerHud?.classList.add('hidden');
  }

  setGame(game, renderer) {
    this.game = game;
    this.renderer = renderer;
    this.hudDirty = true;
    this.selectedStack = null;
    this.refreshHUD(true);
  }

  setMultiplayer(mp) {
    this.mp = mp;
    if (mp) {
      this.enableChat(true);
      this.el.mpRoster?.classList.remove('hidden');
    } else {
      this.enableChat(false);
      this.el.mpRoster?.classList.add('hidden');
    }
  }

  refreshHUD(force = false) {
    const g = this.game;
    if (!g || !g.player) return;
    const now = performance.now();
    if (!force && now - this._lastHud < 70) return;
    this._lastHud = now;
    this.hudDirty = false;
    const p = g.player;

    if (this.el.dayLabel) this.el.dayLabel.textContent = 'DIA ' + g.day;
    if (this.el.clockLabel) this.el.clockLabel.textContent = formatClock(g.time);
    const w = WEATHERS[g.weather] || WEATHERS.limpo;
    if (this.el.weatherLabel) this.el.weatherLabel.textContent = `${w.icon} ${w.name}`;
    const season = SEASONS[g.seasonIndex] || SEASONS[0];
    if (this.el.seasonLabel) this.el.seasonLabel.textContent = `${season.icon} ${season.name}`;
    if (this.el.tempLabel) this.el.tempLabel.textContent = `${p.temp.toFixed(1)}°C`;
    if (this.el.zoneLabel) {
      const b = g.world.buildingAt(p.x, p.y);
      const z = g.world.zoneAt(p.x, p.y);
      this.el.zoneLabel.textContent = b?.name || z?.name || 'Vale Sereno';
    }
    if (this.el.coordLabel) this.el.coordLabel.textContent = `X ${Math.floor(p.x / TILE)} · Y ${Math.floor(p.y / TILE)}`;
    if (this.el.survivorCount) this.el.survivorCount.textContent = `☣ ${g.zombies.length}`;

    this._refreshVitals(p);
    this._refreshEquipment(g);
    this._refreshHotbar(g);
    this._refreshStatuses(p, g);
    this._refreshObjectives();
    this._refreshMarker(g);
    this._refreshInteract(g);
    this._refreshDowned(p);
    this._refreshRoster();
  }

  _refreshVitals(p) {
    const vals = {
      health: [p.health, p.maxHealth, Math.round(p.health)],
      hunger: [p.hunger, 100, Math.round(p.hunger)],
      thirst: [p.thirst, 100, Math.round(p.thirst)],
      stamina: [p.stamina, p.maxStamina, Math.round(p.stamina)],
      sleep: [100 - p.fatigue, 100, Math.round(100 - p.fatigue)],
      hygiene: [p.hygiene, 100, Math.round(p.hygiene)],
    };
    for (const [key, [value, max, label]] of Object.entries(vals)) {
      const el = this.vitals[key];
      if (!el) continue;
      const bar = el.querySelector('.v-bar i');
      const num = el.querySelector('.v-val');
      if (bar) bar.style.width = pct(value, max) + '%';
      if (num) num.textContent = String(label);
      el.classList.toggle('low', pct(value, max) < 22);
    }
  }

  _refreshEquipment(g) {
    if (this.el.equipped) {
      const w = g.weaponStack;
      this.el.equipped.textContent = w ? (ITEMS[w.id]?.name || w.id) : 'Punhos';
    }
  }

  _refreshHotbar(g) {
    if (!this.el.hotbar) return;
    const slots = g.getQuickSlots();
    const current = this.el.hotbar.dataset.sig || '';
    const sig = slots.map(s => s.id + ':' + s.qty).join('|');
    if (sig === current) return;
    this.el.hotbar.dataset.sig = sig;
    this.el.hotbar.innerHTML = [0, 1, 2, 3].map(i => {
      const s = slots[i];
      const def = s ? ITEMS[s.id] : null;
      return `<button class="hot-slot ${s ? '' : 'empty'}" data-quick="${i}" title="${esc(def?.name || 'Espaço vazio')}">
        <span class="hk">${i + 1}</span>
        <span>${def ? esc(def.icon) : '·'}</span>
        <span class="hq">${s && s.qty > 1 ? s.qty : ''}</span>
      </button>`;
    }).join('');
  }

  _refreshStatuses(p, g) {
    if (!this.el.statusRow) return;
    const chips = [];
    if (p.bleed > 15) chips.push(['Sangrando', 'bad', '🩸']);
    if (p.infection > 12) chips.push(['Infectado', 'bad', '🦠']);
    if (p.sick > 10) chips.push(['Enjoo', 'warn', '🤢']);
    if (p.injuries?.leg > 0.1) chips.push(['Perna ferida', 'warn', '🦴']);
    if (p.injuries?.arm > 0.1) chips.push(['Braço ferido', 'warn', '💪']);
    if (p.wet > 55) chips.push(['Molhado', 'info', '💧']);
    if (p.temp < 36.1) chips.push(['Frio', 'info', '🥶']);
    if (p.temp > 38.2) chips.push(['Febre', 'bad', '🤒']);
    if (p.fatigue > 75) chips.push(['Exausto', 'warn', '😴']);
    if (p.hunger < 20) chips.push(['Faminto', 'warn', '🍖']);
    if (p.thirst < 20) chips.push(['Sede', 'warn', '💧']);
    if (!chips.length) chips.push(['Estável', 'good', '✓']);
    const sig = chips.map(c => c[0]).join('|');
    if (this.el.statusRow.dataset.sig === sig) return;
    this.el.statusRow.dataset.sig = sig;
    this.el.statusRow.innerHTML = chips.map(([t, k, i]) => `<span class="status-chip ${k}">${i} ${esc(t)}</span>`).join('');
  }

  _refreshObjectives() {
    const g = this.game;
    if (!this.el.objList || !g) return;
    const sig = g.objectives.map(o => o.id + (o.done ? '1' : '0')).join('');
    if (sig === this._lastObjectiveSig) return;
    this._lastObjectiveSig = sig;
    const pending = g.objectives.filter(o => !o.done);
    const done = g.objectives.filter(o => o.done).slice(-2);
    const list = [...pending, ...done];
    this.el.objList.innerHTML = list.length
      ? list.map(o => `<li class="${o.done ? 'done' : ''}"><span class="oi">${esc(o.icon)}</span><span>${esc(o.text)}</span></li>`).join('')
      : '<li><span class="oi">✓</span><span>Todos os objetivos concluídos.</span></li>';
  }

  refreshObjectives() { this._lastObjectiveSig = ''; this._refreshObjectives(); }

  _refreshMarker(g) {
    if (!this.marker) { this.el.markerHud?.classList.add('hidden'); return; }
    if (this.marker.until !== undefined && this.marker.until < g.time) {
      this.marker = null;
      this.el.markerHud?.classList.add('hidden');
      return;
    }
    this.el.markerHud?.classList.remove('hidden');
    if (this.el.markerText) this.el.markerText.textContent = this.marker.label || 'Objetivo';
    const d = dist(g.player.x, g.player.y, this.marker.x, this.marker.y);
    if (this.el.markerDist) this.el.markerDist.textContent = Math.round(d / TILE) + 'm';
  }

  setMarker(marker) {
    this.marker = marker;
    if (this.game) this._refreshMarker(this.game);
  }

  _refreshInteract(g) {
    const now = performance.now();
    if (now - this._lastInteract < 150) return;
    this._lastInteract = now;
    if (g.buildMode) { this.el.interact?.classList.add('hidden'); return; }
    let it = null;
    try { it = g.getInteractable(); } catch { it = null; }
    if (!it) {
      this.el.interact?.classList.add('hidden');
      this._lastInteractable = null;
      return;
    }
    this.el.interact?.classList.remove('hidden');
    if (this.el.interactLabel) this.el.interactLabel.textContent = it.label || 'Interagir';
    const kbd = this.el.interact?.querySelector('kbd');
    if (kbd) kbd.textContent = it.key || 'E';
    const icon = this.el.interact?.querySelector('.ip-icon');
    if (icon) icon.textContent = it.icon || '•';
    this._lastInteractable = it;
  }

  _refreshDowned(p) {
    if (!this.el.downed) return;
    if (p.downed) {
      this.el.downed.classList.remove('hidden');
      if (this.el.downedText) this.el.downedText.textContent = `Aguarde um aliado reanimar você. ${Math.ceil(p.downTimer || 0)}s`;
    } else this.el.downed.classList.add('hidden');
  }

  _refreshRoster() {
    const g = this.game;
    if (!g || !this.mp || !this.el.mpRoster) return;
    const list = [];
    if (g.player) list.push({ name: g.player.name, color: this.mp.color, downed: g.player.downed, self: true });
    for (const rp of g.remotePlayers.values()) list.push({ name: rp.name, color: rp.color || '#6cd7c4', downed: rp.downed });
    const sig = list.map(p => p.name + (p.downed ? '1' : '0')).join('|');
    if (this.el.mpRoster.dataset.sig === sig) return;
    this.el.mpRoster.dataset.sig = sig;
    this.el.mpRoster.innerHTML = list.map(p => `
      <div class="rp ${p.downed ? 'down' : ''}">
        <i style="background:${esc(p.color)}"></i>
        <span>${esc(p.name)}${p.self ? ' (você)' : ''}</span>
        <span style="margin-left:auto;color:${p.downed ? '#d88b82' : '#7fae62'}">${p.downed ? 'CAÍDO' : '●'}</span>
      </div>
    `).join('');
  }

  updateRoster() { if (this.el.mpRoster) this.el.mpRoster.dataset.sig = ''; this._refreshRoster(); }

  // ======================= NOTIFICAÇÕES =======================
  notify(text, kind = 'info', icon = '•', timeout = 4200) {
    if (!this.el.toasts) return;
    const div = document.createElement('div');
    div.className = 'toast ' + kind;
    div.innerHTML = `<span class="t-icon">${esc(icon)}</span><span>${esc(text)}</span>`;
    this.el.toasts.appendChild(div);
    const all = [...this.el.toasts.children];
    if (all.length > 6) all.slice(0, all.length - 6).forEach(el => el.remove());
    const timer = setTimeout(() => {
      div.classList.add('out');
      setTimeout(() => { div.remove(); this._toastTimers.delete(timer); }, 360);
    }, Math.max(1200, timeout));
    this._toastTimers.add(timer);
  }

  eventBanner(def) {
    if (!this.el.eventBanner) return;
    this.el.eventBanner.querySelector('.ev-icon').textContent = def.icon || '⚠️';
    this.el.eventBanner.querySelector('.ev-title').textContent = def.title || 'Evento';
    this.el.eventBanner.querySelector('.ev-desc').textContent = def.desc || '';
    this.el.eventBanner.classList.remove('hidden');
    this.el.eventBanner.style.animation = 'none';
    void this.el.eventBanner.offsetWidth;
    this.el.eventBanner.style.animation = '';
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => this.el.eventBanner.classList.add('hidden'), 7200);
  }

  dayBanner(day, season, weather) {
    if (!this.el.dayBanner) return;
    this.$('dayBannerIcon').textContent = season?.icon || '🌅';
    this.$('dayBannerTitle').textContent = `Dia ${day}`;
    const w = WEATHERS[weather] || WEATHERS.limpo;
    this.$('dayBannerSub').textContent = `${season?.name || 'Estação'} · ${w.icon} ${w.name}`;
    this.el.dayBanner.classList.remove('hidden');
    this.el.dayBanner.style.animation = 'none';
    void this.el.dayBanner.offsetWidth;
    this.el.dayBanner.style.animation = '';
    clearTimeout(this._dayTimer);
    this._dayTimer = setTimeout(() => this.el.dayBanner.classList.add('hidden'), 4600);
  }

  // ======================= OVERLAYS =======================
  showOverlay(id) {
    const el = this.$(id);
    if (!el) return;
    el.classList.remove('hidden');
    if (this.game && !this.game.dead && !this.introActive) this.game.paused = true;
    audio.play('ui');
  }

  hideOverlay(id) {
    const el = this.$(id);
    if (!el) return;
    el.classList.add('hidden');
    if (id === 'dialogScreen' && this.game) this.game.dialogNpc = null;
    if (id === 'lootScreen' && this.game) {
      if (this.game.lootOpen?.ref?.trunk) this.game.lootOpen.ref.trunkOpen = false;
      this.game.closeLoot?.();
    }
    if (id === 'howScreen' && this.onHowFromPause) {
      const back = this.onHowFromPause;
      this.onHowFromPause = null;
      if (back) this.showOverlay('pauseScreen');
      return;
    }
    this._refreshPauseState();
  }

  _refreshPauseState() {
    if (!this.game || this.game.dead || this.introActive) return;
    const open = [...document.querySelectorAll('.overlay:not(.hidden)')].length > 0;
    this.game.paused = open;
  }

  closeAll() {
    document.querySelectorAll('.overlay').forEach(el => el.classList.add('hidden'));
    if (this.game && !this.game.dead && !this.introActive) this.game.paused = false;
  }

  _hideAllPanels() {
    document.querySelectorAll('.overlay').forEach(el => el.classList.add('hidden'));
  }

  isAnyOverlayOpen() {
    return [...document.querySelectorAll('.overlay:not(.hidden)')].length > 0;
  }

  openInventory() {
    if (!this.game) return;
    this._hideAllPanels();
    this.selectedStack = this.selectedStack && this.game.player.inventory.includes(this.selectedStack) ? this.selectedStack : null;
    this.el.invList.dataset.sig = '';
    this.showOverlay('inventoryScreen');
    this._renderFilters();
    this.refreshInventory();
  }

  _renderFilters() {
    if (!this.el.invFilters) return;
    this.el.invFilters.innerHTML = FILTERS.map(([id, label]) =>
      `<button class="inv-filter ${this.invFilter === id ? 'active' : ''}" data-filter="${id}">${label}</button>`).join('');
  }

  refreshInventory() {
    const g = this.game;
    if (!g || !this.el.invList) return;
    const p = g.player;
    if (this.el.invWeight) this.el.invWeight.textContent = `${fmtKg(g.weight())} / ${fmtKg(g.capacity())}`;
    const entries = p.inventory.map((stack, index) => ({ stack, index }))
      .filter(({ stack }) => {
        const type = ITEMS[stack.id]?.type || 'misc';
        if (this.invFilter === 'all') return true;
        if (this.invFilter === 'misc') return ['misc', 'valuable', 'seed', 'hygiene', 'ammo'].includes(type);
        return type === this.invFilter;
      })
      .sort((a, b) => {
        const ta = TYPE_LABEL[ITEMS[a.stack.id]?.type] || 'zzz';
        const tb = TYPE_LABEL[ITEMS[b.stack.id]?.type] || 'zzz';
        if (ta !== tb) return ta.localeCompare(tb);
        return (ITEMS[a.stack.id]?.name || '').localeCompare(ITEMS[b.stack.id]?.name || '');
      });

    if (!entries.length) {
      this.el.invList.innerHTML = '<div class="empty-state">Nada nesta categoria. A mochila não é infinita — mas a sorte também não.</div>';
    } else {
      this.el.invList.innerHTML = entries.map(({ stack, index }) => {
        const def = ITEMS[stack.id] || { name: stack.id, icon: '❔', type: 'misc', weight: 0 };
        const cap = def.durability ? Math.max(0, stack.condition ?? 1) : null;
        return `<button class="inv-row ${this.selectedStack === stack ? 'selected' : ''}" data-inv-index="${index}">
          <span class="ir-icon">${esc(def.icon)}</span>
          <span class="ir-main">
            <span class="ir-name">${esc(def.name)}${stack.equipped ? '<span class="equipped">EQUIPADO</span>' : ''}</span>
            <span class="ir-sub">${esc(TYPE_LABEL[def.type] || 'Item')} · ${fmtKg((def.weight || 0) * (stack.qty || 1))}${cap !== null ? ' · ' + Math.round(cap * 100) + '%' : ''}</span>
          </span>
          <span class="ir-qty">${stack.qty > 1 ? 'x' + stack.qty : ''}</span>
          ${cap !== null ? `<span class="ir-bar"><i style="width:${Math.round(cap * 100)}%;background:${cap < 0.25 ? '#d05f54' : '#9cbb72'}"></i></span>` : ''}
        </button>`;
      }).join('');
    }
    this._refreshItemDetail();
  }

  _refreshItemDetail() {
    if (!this.el.invDetail) return;
    const stack = this.selectedStack;
    if (!stack || !this.game || !this.game.player.inventory.includes(stack)) {
      this.el.invDetail.innerHTML = '<div class="empty-state">Selecione um item para ver detalhes.<br><br>Duplo clique usa ou equipa.</div>';
      return;
    }
    const def = ITEMS[stack.id] || { name: stack.id, icon: '❔', desc: '', type: 'misc', weight: 0 };
    const stats = [];
    stats.push(['Peso', fmtKg((def.weight || 0) * (stack.qty || 1))]);
    if (stack.qty > 1) stats.push(['Quantidade', 'x' + stack.qty]);
    if (def.durability) stats.push(['Condição', Math.round((stack.condition ?? 1) * 100) + '%']);
    for (const [k, label] of Object.entries(STAT_LABEL)) {
      if (def[k] === undefined || k === 'weight') continue;
      const v = def[k];
      if (typeof v === 'number') stats.push([label, (v > 0 && ['hunger', 'thirst', 'heal', 'bleed', 'infection'].includes(k) && !['damage', 'range', 'durability', 'capacity', 'armor', 'insulation', 'morale', 'fuel'].includes(k) ? '+' : '') + (Number.isInteger(v) ? v : Math.round(v * 10) / 10)]);
    }
    if (def.gun) stats.push(['Munição', ITEMS[def.ammo]?.name || def.ammo]);
    const canEquip = def.weapon || ['backpack', 'clothing'].includes(def.type);
    const canUse = ['food', 'drink', 'med', 'hygiene', 'misc'].includes(def.type);
    let actions = '';
    if (canUse) actions += `<button class="btn-primary" data-item-action="use">Usar ${esc(def.icon)}</button>`;
    if (canEquip) actions += `<button class="btn-secondary" data-item-action="equip">${stack.equipped ? 'Desequipar' : 'Equipar'} ${esc(def.icon)}</button>`;
    actions += `<button class="btn-ghost" data-item-action="drop">Soltar no chão</button>`;
    this.el.invDetail.innerHTML = `
      <div class="id-icon">${esc(def.icon)}</div>
      <h3 class="id-name">${esc(def.name)}</h3>
      <div class="id-type">${esc(TYPE_LABEL[def.type] || 'Item')}${stack.equipped ? ' · equipado' : ''}</div>
      <p class="id-desc">${esc(def.desc || 'Sem descrição.')}</p>
      <div class="id-stats">${stats.map(([k, v]) => `<span>${esc(k)}</span><strong>${esc(v)}</strong>`).join('')}</div>
      <div class="id-actions">${actions}</div>
    `;
  }

  _useOrEquip(stack) {
    if (!this.game) return;
    const def = ITEMS[stack.id];
    if (!def) return;
    if (def.weapon || ['backpack', 'clothing'].includes(def.type)) {
      this.game.equipItem(stack);
    } else {
      this.game.useItem(stack);
    }
    this.selectedStack = this.game.player.inventory.includes(stack) ? stack : null;
    this.refreshInventory();
    this.refreshHUD(true);
  }

  openLoot(loot) {
    if (!this.game) return;
    this._hideAllPanels();
    this.el.lootTitle.textContent = loot?.title || 'Recipiente';
    this.showOverlay('lootScreen');
    this.refreshLoot();
  }

  refreshLoot() {
    const g = this.game;
    if (!g || !g.lootOpen) return;
    const loot = g.lootOpen;
    if (this.el.lootTitle) this.el.lootTitle.textContent = loot.title || 'Recipiente';
    if (this.el.lootWeight) this.el.lootWeight.textContent = `${fmtKg(g.weight())} / ${fmtKg(g.capacity())}`;
    if (this.el.lootItems) {
      this.el.lootItems.innerHTML = loot.items?.length
        ? loot.items.map((item, i) => {
          const def = ITEMS[item.id] || { name: item.id, icon: '❔', weight: 0 };
          return `<button class="loot-row" data-loot-index="${i}">
            <span class="li-icon">${esc(def.icon)}</span>
            <span><span class="li-name">${esc(def.name)}</span><span class="li-sub">${fmtKg((def.weight || 0) * (item.qty || 1))}${def.durability ? ' · ' + Math.round((item.condition ?? 1) * 100) + '%' : ''}</span></span>
            <span class="li-qty">${item.qty > 1 ? 'x' + item.qty : ''}</span>
          </button>`;
        }).join('')
        : '<div class="loot-empty">Vazio. Alguém passou aqui antes — ou o tempo fez o trabalho.</div>';
    }
    if (this.el.lootPlayerItems) {
      const inv = g.player.inventory;
      const canStore = ['storage', 'trunk'].includes(loot.kind);
      this.el.lootPlayerItems.innerHTML = inv.length
        ? inv.map((stack, i) => {
          const def = ITEMS[stack.id] || { name: stack.id, icon: '❔', weight: 0 };
          return `<button class="loot-row" data-store-index="${i}">
            <span class="li-icon">${esc(def.icon)}</span>
            <span><span class="li-name">${esc(def.name)}</span><span class="li-sub">${fmtKg((def.weight || 0) * (stack.qty || 1))}${canStore ? ' · guardar' : ' · na mochila'}</span></span>
            <span class="li-qty">${stack.qty > 1 ? 'x' + stack.qty : ''}</span>
          </button>`;
        }).join('')
        : '<div class="loot-empty">Sua mochila está vazia.</div>';
    }
    if (this.el.lootHint) {
      this.el.lootHint.textContent = ['storage', 'trunk'].includes(loot.kind)
        ? 'Clique nos itens da direita para guardar. Clique à esquerda para pegar.'
        : 'Leve apenas o necessário. Peso importa.';
    }
  }

  openBuild() {
    if (!this.game) return;
    this._hideAllPanels();
    this.showOverlay('buildScreen');
    this.el.buildGrid.classList.toggle('hidden', this.buildTab !== 'build');
    this.el.craftGrid.classList.toggle('hidden', this.buildTab !== 'craft');
    document.querySelectorAll('[data-build-tab]').forEach(t => t.classList.toggle('active', t.dataset.buildTab === this.buildTab));
    this.refreshCrafting();
  }

  refreshCrafting() {
    const g = this.game;
    if (!g) return;
    const mats = ['madeira', 'metal', 'pregos', 'pedra', 'corda', 'lona', 'pecas', 'combustivel'];
    if (this.el.buildMaterials) {
      this.el.buildMaterials.innerHTML = mats.map(id => `<span class="bm-chip">${ITEMS[id].icon} ${g.countItem(id)}</span>`).join('');
    }
    if (this.el.buildGrid) {
      this.el.buildGrid.innerHTML = Object.entries(BUILDABLES).map(([type, def]) => {
        const costs = Object.entries(def.cost || {}).map(([id, qty]) => {
          const have = g.countItem(id);
          return `<span class="${have < qty ? 'missing' : ''}">${ITEMS[id]?.icon || ''} ${have}/${qty}</span>`;
        }).join('');
        const affordable = Object.entries(def.cost || {}).every(([id, qty]) => g.countItem(id) >= qty);
        return `<button class="build-card ${affordable ? '' : 'unaffordable'}" data-build-type="${esc(type)}">
          <div class="bc-head"><span class="bc-icon">${esc(def.icon)}</span><span class="bc-name">${esc(def.name)}</span></div>
          <div class="bc-desc">${esc(def.desc)}</div>
          <div class="bc-cost">${costs}</div>
          <div class="bc-meta"><span>${esc(SKILLS[def.skill]?.name || def.skill)}</span><span>${def.hp} HP</span></div>
        </button>`;
      }).join('');
    }
    if (this.el.craftGrid) {
      this.el.craftGrid.innerHTML = CRAFT_RECIPES.map(r => {
        const costs = Object.entries(r.cost || {}).map(([id, qty]) => {
          const have = g.countItem(id);
          return `<span class="${have < qty ? 'missing' : ''}">${ITEMS[id]?.icon || ''} ${have}/${qty}</span>`;
        }).join('');
        const affordable = Object.entries(r.cost || {}).every(([id, qty]) => g.countItem(id) >= qty);
        return `<button class="build-card ${affordable ? '' : 'unaffordable'}" data-craft-id="${esc(r.id)}">
          <div class="bc-head"><span class="bc-icon">${esc(r.icon)}</span><span class="bc-name">${esc(r.name)}</span></div>
          <div class="bc-desc">${esc(r.desc)}</div>
          <div class="bc-cost">${costs}</div>
          <div class="bc-meta"><span>${esc(SKILLS[r.skill]?.name || r.skill)}</span><span>${esc((r.gives || []).map(([id, q]) => `${q}x ${ITEMS[id]?.name || id}`).join(', '))}</span></div>
        </button>`;
      }).join('');
    }
  }

  openSkills() {
    if (!this.game) return;
    this._hideAllPanels();
    this.showOverlay('skillsScreen');
    this.refreshSkills();
  }

  refreshSkills() {
    const g = this.game;
    if (!g || !this.el.skillsGrid) return;
    const p = g.player;
    if (this.el.playerLevel) this.el.playerLevel.textContent = `Nível ${p.level} · ${Math.round(p.xp)}/${p.xpNext} XP`;
    this.el.skillsGrid.innerHTML = Object.entries(SKILLS).map(([id, def]) => {
      const s = p.skills[id] || { level: 0, xp: 0, next: g.skillNext(0) };
      const pctXp = clamp((s.xp / (s.next || 1)) * 100, 0, 100);
      return `<div class="skill-card">
        <div class="skill-head"><span class="si">${esc(def.icon)}</span><strong>${esc(def.name)}</strong><span class="skill-level">Nv ${s.level}</span></div>
        <div class="skill-desc">${esc(def.desc)}</div>
        <div class="skill-bar"><i style="width:${pctXp}%"></i></div>
        <div class="skill-xp">${Math.round(s.xp)} / ${s.next} XP</div>
      </div>`;
    }).join('');
    if (this.el.statsGrid) {
      const distM = Math.round((g.stats.distance || 0) / TILE);
      const stats = [
        ['Dias vivo', g.day], ['Zumbis mortos', g.stats.kills || 0], ['Distância', distM + ' m'],
        ['Construções', g.stats.built || 0], ['Recipientes', g.stats.looted || 0], ['Sobreviventes', g.stats.survivorsMet || 0],
        ['Tiros', g.stats.shots || 0], ['Condição', p.inVehicle ? 'Veículo' : p.sneak ? 'Furtivo' : 'A pé'],
      ];
      this.el.statsGrid.innerHTML = stats.map(([k, v]) => `<div class="stat-card"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('');
    }
  }

  openMap() {
    if (!this.game) return;
    this._hideAllPanels();
    this.showOverlay('mapScreen');
    if (this.el.mapMeta) this.el.mapMeta.textContent = `Dia ${this.game.day} · ${formatClock(this.game.time)}`;
    requestAnimationFrame(() => {
      if (this.renderer) this.renderer.drawFullMap(this.el.mapCanvas);
    });
  }

  refreshMap() {
    if (this.renderer && this.el.mapCanvas) this.renderer.drawFullMap(this.el.mapCanvas);
  }

  // ======================= DIÁLOGO / TROCA =======================
  openDialog(npc) {
    if (!npc) return;
    this._hideAllPanels();
    this.game.dialogNpc = npc;
    this.showOverlay('dialogScreen');
    this.refreshDialog();
  }

  refreshDialog() {
    const npc = this.game?.dialogNpc;
    if (!npc) return;
    const icons = { cauteloso: '🧔', amigável: '🙂', desconfiado: '🕵️', prático: '🧑‍🔧', nervoso: '😰', hostil: '🏴' };
    const av = this.$('npcAvatar');
    if (av) av.textContent = icons[npc.personality] || '🧑';
    if (this.el.dialogName) this.el.dialogName.textContent = npc.name || 'Sobrevivente';
    if (this.el.dialogPersonality) this.el.dialogPersonality.textContent = (npc.personality || 'sobrevivente').toUpperCase() + (npc.trader ? ' · MERCADOR' : '');
    if (this.el.dialogLine) this.el.dialogLine.textContent = npc.line || '...';
    if (this.el.dialogGreeting) this.el.dialogGreeting.textContent = npc.greeting || '';
    if (this.el.npcFollow) this.el.npcFollow.textContent = npc.following ? '🚶 Pedir para seguir sozinho' : '🧭 Pedir para acompanhar';
    const tradeBtn = this.$('npcTrade');
    if (tradeBtn) tradeBtn.disabled = !(npc.trade && npc.trade.length);
  }

  _openTrade() {
    const npc = this.game?.dialogNpc;
    if (!npc) return;
    this.tradeNpc = npc;
    this.tradeOffer = null;
    this.tradePayment = null;
    this._hideAllPanels();
    this.showOverlay('tradeScreen');
    if (this.el.tradeName) this.el.tradeName.textContent = npc.name || 'Sobrevivente';
    this.refreshTrade();
  }

  refreshTrade() {
    const g = this.game;
    const npc = this.tradeNpc;
    if (!g || !npc) return;
    if (this.el.tradeOffers) {
      this.el.tradeOffers.innerHTML = npc.trade?.length
        ? npc.trade.map((item, i) => {
          const def = ITEMS[item.id] || { name: item.id, icon: '❔', value: 1 };
          return `<button class="trade-row ${this.tradeOffer === i ? 'selected' : ''}" data-offer="${i}">
            <span class="ti">${esc(def.icon)}</span>
            <span class="tn">${esc(def.name)}${item.qty > 1 ? ' x' + item.qty : ''}</span>
            <span class="tv">${Math.round((def.value || 1) * item.qty)}</span>
          </button>`;
        }).join('')
        : '<div class="trade-empty">Ele não tem mais nada para trocar.</div>';
    }
    if (this.el.tradePlayer) {
      this.el.tradePlayer.innerHTML = g.player.inventory.length
        ? g.player.inventory.map((stack, i) => {
          const def = ITEMS[stack.id] || { name: stack.id, icon: '❔', value: 1 };
          return `<button class="trade-row ${this.tradePayment === stack ? 'selected' : ''}" data-pay-index="${i}">
            <span class="ti">${esc(def.icon)}</span>
            <span class="tn">${esc(def.name)}${stack.qty > 1 ? ' x' + stack.qty : ''}</span>
            <span class="tv">${Math.round((def.value || 1) * stack.qty)}</span>
          </button>`;
        }).join('')
        : '<div class="trade-empty">Sua mochila está vazia.</div>';
    }
    const offer = this.tradeOffer !== null ? npc.trade?.[this.tradeOffer] : null;
    const offerDef = offer ? ITEMS[offer.id] : null;
    const payDef = this.tradePayment ? ITEMS[this.tradePayment.id] : null;
    const valueOffer = offerDef ? (offerDef.value || 1) * offer.qty : 0;
    const valuePay = payDef ? (payDef.value || 1) * this.tradePayment.qty : 0;
    if (this.el.tradeStatus) {
      if (!offer) this.el.tradeStatus.textContent = 'Selecione uma oferta e um item seu.';
      else if (!this.tradePayment) this.el.tradeStatus.textContent = `Ele pede algo de valor próximo a ${valueOffer}. Escolha o que oferecer.`;
      else if (valuePay < valueOffer * 0.65) this.el.tradeStatus.textContent = `Sua oferta vale ${valuePay}. Ele quer ao menos ${Math.ceil(valueOffer * 0.65)}. Recusado.`;
      else this.el.tradeStatus.textContent = `Troca possível: ${payDef?.name} por ${offerDef?.name}.`;
    }
    if (this.el.tradeConfirm) {
      this.el.tradeConfirm.disabled = !offer || !this.tradePayment || valuePay < valueOffer * 0.65;
    }
  }

  // ======================= PAUSA / MORTE / NOTAS =======================
  togglePause() {
    if (!this.game || this.game.dead || this.introActive) return;
    if (this.isAnyOverlayOpen()) { this.closeAll(); return; }
    if (this.game.buildMode) { this.game.cancelBuild(); }
    this._hideAllPanels();
    this.showOverlay('pauseScreen');
    this._refreshPause();
  }

  _refreshPause() {
    if (!this.game || !this.el.pauseStats) return;
    const g = this.game;
    const p = g.player;
    const stats = [
      ['Sobrevivente', p.name], ['Dias', g.day], ['Nível', p.level], ['Zumbis', g.stats.kills || 0],
      ['Distância', Math.round((g.stats.distance || 0) / TILE) + ' m'], ['Construções', g.stats.built || 0],
    ];
    this.el.pauseStats.innerHTML = stats.map(([k, v]) => `<div class="stat-card"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('');
    if (this.el.pauseTip) this.el.pauseTip.textContent = '“' + TIPS[Math.floor(Math.random() * TIPS.length)] + '”';
    if (this.el.pauseMute) this.el.pauseMute.textContent = audio.muted ? '🔇 Som: desligado' : '🔊 Som: ligado';
    if (this.el.pauseSave) this.el.pauseSave.classList.toggle('hidden', this.game.mode !== 'single');
  }

  _toggleMute() {
    audio.ensure();
    audio.setMuted(!audio.muted);
    if (this.el.pauseMute) this.el.pauseMute.textContent = audio.muted ? '🔇 Som: desligado' : '🔊 Som: ligado';
  }

  showDeath(cause) {
    this._hideAllPanels();
    if (this.game) this.game.paused = true;
    this.el.hud?.classList.add('hidden');
    this.el.touch?.classList.add('hidden');
    this.$('deathScreen')?.classList.remove('hidden');
    if (this.el.deathCause) this.el.deathCause.textContent = 'Você ' + (cause || 'não resistiu aos ferimentos') + '.';
    const g = this.game;
    if (g && this.el.deathStats) {
      const distM = Math.round((g.stats.distance || 0) / TILE);
      const stats = [
        ['Dias', g.day], ['Zumbis', g.stats.kills || 0], ['Nível', g.player.level], ['Distância', distM + 'm'],
        ['Construções', g.stats.built || 0], ['Saqueados', g.stats.looted || 0], ['Sobreviventes', g.stats.survivorsMet || 0], ['Tiros', g.stats.shots || 0],
      ];
      this.el.deathStats.innerHTML = stats.map(([k, v]) => `<div class="ds"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('');
    }
    if (this.el.deathQuote) {
      const quotes = [
        '“O mundo não perdoa. Ele só continua.”',
        '“Heróis não duram uma semana.”',
        '“Alguém vai encontrar sua mochila. Talvez tenha mais sorte.”',
        '“Não era sobre vencer. Era sobre durar mais um dia.”',
      ];
      this.el.deathQuote.textContent = quotes[Math.floor(Math.random() * quotes.length)];
    }
    this.clearSave();
  }

  showSleepConfirm() {
    if (!this.game) return;
    this._hideAllPanels();
    this.showOverlay('sleepScreen');
  }

  openNote(text) {
    if (!this.game) return;
    this._hideAllPanels();
    if (this.el.noteText) this.el.noteText.textContent = text || '...';
    this.showOverlay('noteScreen');
  }

  showHow(fromPause = false) {
    this.onHowFromPause = fromPause ? true : null;
    const el = this.$('howScreen');
    if (!el) return;
    el.classList.remove('hidden');
    if (this.game && !this.game.dead && !this.introActive) this.game.paused = true;
  }

  // ======================= CHAT =======================
  enableChat(enabled) {
    if (!this.mp && enabled) return;
    this.el.chatBox?.classList.toggle('hidden', !enabled);
    this.el.chatToggle?.classList.toggle('hidden', !enabled);
  }

  toggleChat(force) {
    if (!this.mp) return;
    this.chatOpen = typeof force === 'boolean' ? force : !this.chatOpen;
    this.el.chatBox?.classList.remove('hidden');
    this.el.chatToggle?.classList.remove('hidden');
    if (this.chatOpen) {
      this.el.chatInput?.focus();
      this.el.chatToggle?.classList.add('active');
    } else {
      this.el.chatInput?.blur();
      this.el.chatToggle?.classList.remove('active');
    }
  }

  chatPush(msg) {
    if (!msg) return;
    const text = String(msg.text || '');
    if (!text) return;
    const escText = esc(text);
    const line = msg.system
      ? `<div class="c-system">${escText}</div>`
      : `<div><span class="c-name">${esc(msg.name || 'Sobrevivente')}:</span> ${escText}</div>`;
    if (this.el.chatLog) {
      const div = document.createElement('div');
      div.innerHTML = line;
      const entry = div.firstElementChild;
      this.el.chatLog.appendChild(entry);
      while (this.el.chatLog.children.length > 40) this.el.chatLog.firstElementChild.remove();
      this.el.chatLog.scrollTop = this.el.chatLog.scrollHeight;
    }
    if (this.el.lobbyChatLog && !this.el.lobby?.classList.contains('hidden')) {
      const div = document.createElement('div');
      div.innerHTML = msg.system
        ? `<div class="msg-system">${escText}</div>`
        : `<div><span class="msg-name">${esc(msg.name || 'Sobrevivente')}:</span> ${escText}</div>`;
      this.el.lobbyChatLog.appendChild(div.firstElementChild);
      while (this.el.lobbyChatLog.children.length > 30) this.el.lobbyChatLog.firstElementChild.remove();
      this.el.lobbyChatLog.scrollTop = this.el.lobbyChatLog.scrollHeight;
    }
  }

  // ======================= FUNDO ANIMADO DO MENU =======================
  animateMenu(dt) {
    if (!this.el.menu || this.el.menu.classList.contains('hidden')) return;
    this.menuTime += dt;
    this._drawMenu(this.menuTime);
  }

  _drawMenuStill() {
    if (this.el.menu && !this.el.menu.classList.contains('hidden')) this._drawMenu(this.menuTime || 0.1);
  }

  _drawMenu(t) {
    const canvas = this.el.menuCanvas;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth, h = window.innerHeight;
    if (this._menuW !== w || this._menuH !== h || canvas.width !== Math.floor(w * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      this._menuW = w; this._menuH = h;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const horizon = h * 0.58;

    // céu
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#0a120f');
    sky.addColorStop(0.42, '#22291c');
    sky.addColorStop(0.7, '#5a5130');
    sky.addColorStop(0.92, '#9a7a3f');
    sky.addColorStop(1, '#4d4228');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, horizon + 2);

    // sol poente
    const sunX = w * 0.76, sunY = horizon - h * 0.11;
    const glow = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, h * 0.27);
    glow.addColorStop(0, 'rgba(255,214,140,0.62)');
    glow.addColorStop(0.22, 'rgba(224,169,87,0.24)');
    glow.addColorStop(1, 'rgba(224,169,87,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, w, horizon + 10);
    ctx.fillStyle = 'rgba(255,223,164,0.75)';
    ctx.beginPath(); ctx.arc(sunX, sunY, Math.min(w, h) * 0.036, 0, Math.PI * 2); ctx.fill();

    // nuvens
    for (let i = 0; i < 6; i++) {
      const cx = ((i * 237 + t * (3 + i * 0.4)) % (w + 400)) - 200;
      const cy = h * (0.12 + i * 0.055);
      const cw = 180 + i * 24, chh = 20 + i * 3;
      ctx.fillStyle = `rgba(18,23,18,${0.18 + i * 0.018})`;
      ctx.beginPath(); ctx.ellipse(cx, cy, cw, chh, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + cw * 0.4, cy + 4, cw * 0.62, chh * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    }

    // montanhas / serras
    const layers = [
      { y: horizon - h * 0.13, amp: h * 0.08, color: '#161d16', step: 44, speed: 0.5 },
      { y: horizon - h * 0.055, amp: h * 0.05, color: '#10160f', step: 30, speed: 0.9 },
    ];
    for (const layer of layers) {
      ctx.fillStyle = layer.color;
      ctx.beginPath(); ctx.moveTo(0, horizon + 20);
      for (let x = 0; x <= w + layer.step; x += layer.step) {
        const y = layer.y + Math.sin(x * 0.008 + layer.speed) * layer.amp + Math.sin(x * 0.021 + 3) * layer.amp * 0.3;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w + layer.step, horizon + 20); ctx.closePath(); ctx.fill();
    }

    // cidade silhueta
    const base = horizon + h * 0.005;
    const skylineShade = ctx.createLinearGradient(0, horizon - 80, 0, base);
    skylineShade.addColorStop(0, '#0d120d');
    skylineShade.addColorStop(1, '#070a07');
    ctx.fillStyle = skylineShade;
    const seed = 7331;
    for (let i = 0; i < 38; i++) {
      const bw = ((i * 73 + seed) % 47) + 22;
      const bh = ((i * 41 + 29) % 64) + 18;
      const bx = ((i * (w / 38)) + (i % 3) * 13) % (w + 80) - 40;
      ctx.fillRect(bx, base - bh, bw, bh + 40);
      // janelas quebradas
      if (i % 4 === 1) {
        ctx.fillStyle = 'rgba(224,169,87,0.42)';
        ctx.fillRect(bx + bw * 0.3, base - bh + 11, 4, 5);
        ctx.fillStyle = skylineShade;
      }
      // antenas
      if (i % 7 === 2) {
        ctx.fillRect(bx + bw * 0.6, base - bh - 18, 2, 18);
        ctx.fillStyle = 'rgba(208,95,84,0.7)';
        ctx.fillRect(bx + bw * 0.6 - 1, base - bh - 20, 4, 3);
        ctx.fillStyle = skylineShade;
      }
    }
    // torre da igreja
    ctx.fillStyle = '#0b100b';
    ctx.fillRect(w * 0.24, base - h * 0.18, w * 0.026, h * 0.18 + 5);
    ctx.beginPath();
    ctx.moveTo(w * 0.24, base - h * 0.18);
    ctx.lineTo(w * 0.253, base - h * 0.26);
    ctx.lineTo(w * 0.266, base - h * 0.18);
    ctx.closePath(); ctx.fill();

    // chão / estrada
    const ground = ctx.createLinearGradient(0, base, 0, h);
    ground.addColorStop(0, '#1a1d13');
    ground.addColorStop(0.4, '#10130d');
    ground.addColorStop(1, '#060806');
    ctx.fillStyle = ground; ctx.fillRect(0, base, w, h - base);
    ctx.fillStyle = 'rgba(35,36,27,0.8)';
    ctx.beginPath();
    ctx.moveTo(w * 0.53, base);
    ctx.lineTo(w * 0.46, h);
    ctx.lineTo(w * 0.62, h);
    ctx.lineTo(w * 0.57, base);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(189,171,113,0.16)'; ctx.lineWidth = 2;
    ctx.setLineDash([12, 20]);
    ctx.beginPath(); ctx.moveTo(w * 0.565, base); ctx.lineTo(w * 0.545, h); ctx.stroke();
    ctx.setLineDash([]);

    // postes e fios
    const poles = [0.08, 0.3, 0.44, 0.66, 0.9];
    ctx.strokeStyle = 'rgba(8,10,8,0.85)'; ctx.lineWidth = 3;
    let prev = null;
    for (const px of poles) {
      const x = w * px, y = base - h * (0.04 + (px % 0.12));
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, base + 28); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 12, y + 8); ctx.lineTo(x + 12, y + 8); ctx.stroke();
      if (prev) {
        ctx.strokeStyle = 'rgba(5,7,5,0.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(prev.x, prev.y + 8); ctx.quadraticCurveTo((prev.x + x) / 2, y + 26, x, y + 8); ctx.stroke();
        ctx.strokeStyle = 'rgba(8,10,8,0.85)'; ctx.lineWidth = 3;
      }
      prev = { x, y };
    }

    // árvores
    for (let i = 0; i < 24; i++) {
      const tx = ((i * 137 + 41) % (w + 80)) - 40;
      const depth = 0.25 + ((i * 53) % 100) / 120;
      const ty = base + (h - base) * depth * 0.42;
      const s = 0.6 + depth * 0.9;
      ctx.fillStyle = 'rgba(6,9,6,0.92)';
      ctx.fillRect(tx - 2 * s, ty - 16 * s, 4 * s, 24 * s);
      ctx.beginPath();
      ctx.moveTo(tx, ty - 48 * s);
      ctx.lineTo(tx - 19 * s, ty - 14 * s);
      ctx.lineTo(tx + 19 * s, ty - 14 * s);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(tx, ty - 65 * s);
      ctx.lineTo(tx - 14 * s, ty - 30 * s);
      ctx.lineTo(tx + 14 * s, ty - 30 * s);
      ctx.closePath(); ctx.fill();
    }

    // zumbis distantes
    ctx.fillStyle = 'rgba(5,7,5,0.9)';
    for (let i = 0; i < 7; i++) {
      const zx = w * (0.58 + i * 0.047) + Math.sin(t * 0.8 + i) * 3;
      const zy = base + h * 0.025 + (i % 3) * 6;
      const sway = Math.sin(t * 2.2 + i * 1.7) * 2;
      ctx.beginPath(); ctx.arc(zx + sway, zy - 14, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(zx - 2 + sway, zy - 11, 4, 12);
      ctx.fillRect(zx - 5 + sway, zy - 9, 3, 9);
      ctx.fillRect(zx + 2 + sway, zy - 9, 3, 9);
    }

    // fumaça / fog
    const fog = ctx.createLinearGradient(0, horizon - 60, 0, horizon + 90);
    fog.addColorStop(0, 'rgba(120,120,95,0)');
    fog.addColorStop(0.55, 'rgba(124,126,102,0.09)');
    fog.addColorStop(1, 'rgba(90,95,75,0)');
    ctx.fillStyle = fog; ctx.fillRect(0, horizon - 60, w, 160);
    for (let i = 0; i < 3; i++) {
      const fx = ((t * (5 + i * 2) + i * 310) % (w + 300)) - 150;
      ctx.fillStyle = `rgba(110,115,92,${0.022 + i * 0.008})`;
      ctx.beginPath(); ctx.ellipse(fx, horizon + 12 + i * 13, 220 + i * 50, 28 + i * 6, 0, 0, Math.PI * 2); ctx.fill();
    }

    // brasas / partículas
    for (let i = 0; i < 22; i++) {
      const px = ((i * 197 + t * (9 + i % 5)) % (w + 100)) - 50;
      const py = h * 0.5 + ((i * 83 - t * 14) % (h * 0.45) + h * 0.45) % (h * 0.45);
      ctx.fillStyle = `rgba(224,180,95,${0.08 + (i % 4) * 0.03})`;
      ctx.fillRect(px, py, 1.5, 1.5);
    }

    // grão
    ctx.globalAlpha = 0.05;
    for (let i = 0; i < 140; i++) {
      const gx = (i * 97 + t * 13) % w, gy = (i * 61 + t * 7) % h;
      ctx.fillStyle = i % 2 ? '#fff' : '#000';
      ctx.fillRect(gx, gy, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  // ======================= RODAPÉ DE DEBUG / RESIZE =======================
  onResize() {
    this._menuW = 0; this._menuH = 0;
    if (this.el.menu && !this.el.menu.classList.contains('hidden')) this._drawMenuStill();
  }
}
