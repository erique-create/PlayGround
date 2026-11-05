// Renderizador isométrico 3D semi-realista.
// A simulação continua em 2D (grade de 32 px); este módulo apenas projeta o
// mesmo mundo em uma cena Three.js com câmera ortográfica diagonal.
import * as THREE from './vendor/three.module.js';
import { Renderer as Renderer2D } from './renderer.js';
import { TILE, T, MINIMAP_COLORS, WORLD_SIZE } from './world.js';
import { ITEMS, ZOMBIE_TYPES, WEATHERS, SEASONS, BUILDABLES, BACKGROUNDS } from './data.js';
import { clamp, lerp, dist, hash2, TAU } from './util.js';

const HALF = WORLD_SIZE / 2;
const WALL_H = 2.7;
const WALL_T = 0.22;
const ROOF_Y = WALL_H + 0.16;
const wx = (x) => x / TILE - HALF;
const wz = (y) => y / TILE - HALF;
const simX = (x) => (x + HALF) * TILE;
const simY = (z) => (z + HALF) * TILE;
const clamp01 = (v) => clamp(v, 0, 1);

function makeCanvasTexture(size, paint, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  paint(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

function makeRadialTexture(inner = '255,255,255', alpha = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, `rgba(${inner},${alpha})`);
  g.addColorStop(0.38, `rgba(${inner},${alpha * 0.46})`);
  g.addColorStop(1, `rgba(${inner},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeTextTexture(text, colorCss = '#f2e8c8', bg = 'rgba(10,14,10,0.78)') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  const r = 20;
  ctx.beginPath();
  ctx.roundRect(8, 18, 496, 92, r);
  ctx.fill();
  ctx.strokeStyle = 'rgba(224,185,95,0.42)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = colorCss;
  ctx.font = '600 42px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = text.length > 28 ? text.slice(0, 27) + '…' : text;
  ctx.fillText(label, 256, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function hash01(x, y, salt = 0) { return hash2(x | 0, y | 0, salt); }

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.is3D = false;
    this.fallback = null;
    this.time = 0;
    this.baseZoom = 1;
    this.dpr = Math.min(1.6, window.devicePixelRatio || 1);
    this.actorPool = new Map();
    this.zombiePool = new Map();
    this.npcPool = new Map();
    this.remotePool = new Map();
    this.corpsePool = new Map();
    this.groundPool = new Map();
    this.vehiclePool = new Map();
    this.structurePool = new Map();
    this.floaterPool = new Map();
    this.buildingRoofs = [];
    this.windowLights = [];
    this.buildingLabels = [];
    this.campfireLights = [];
    this.tempVec = new THREE.Vector3();
    this.tempVec2 = new THREE.Vector3();
    this.lastWeather = null;
    this.lastSeason = -1;
    this.cameraTarget = new THREE.Vector3();
    this.cameraTargetInit = false;
    this.rainDrops = [];
    this.fogSprites = [];
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.15);
    this.pointerNdc = new THREE.Vector2();
    this.shadowSize = window.innerWidth < 700 ? 1024 : 2048;

    const test = document.createElement('canvas');
    const gl = test.getContext('webgl2') || test.getContext('webgl');
    if (!gl) {
      this.fallback = new Renderer2D(canvas, game);
      return;
    }

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas, antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false,
      });
    } catch (err) {
      console.warn('WebGL indisponível, usando renderizador 2D.', err);
      this.fallback = new Renderer2D(canvas, game);
      return;
    }

    this.is3D = true;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#111711');
    this.scene.fog = new THREE.FogExp2('#26302a', 0.012);

    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 260);
    this.cameraOffset = new THREE.Vector3(13, 17, 13);

    this.materials = this.createMaterials();
    this.buildLights();
    this.buildTerrain();
    this.buildBuildings();
    this.buildFurniture();
    this.buildFoliage();
    this.buildStreetDetails();
    this.buildVehicles();
    this.buildWeather();
    this.buildParticles();
    this.buildMarkers();
    this.buildMinimapBase();

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.game.camera.zoom = 1;
    // O jogo usa esta função para converter mouse/toque em coordenadas do mundo.
    this.game.screenToWorld = (sx, sy) => this.screenToWorld(sx, sy);
  }

  // =====================================================================
  //  MATERIAIS PROCEDURAIS
  // =====================================================================
  createMaterials() {
    const m = {};
    const grunge = makeCanvasTexture(256, (ctx, s) => {
      ctx.fillStyle = '#777';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 1600; i++) {
        const g = 72 + Math.random() * 90;
        ctx.fillStyle = `rgba(${g},${g},${g},${0.12 + Math.random() * 0.25})`;
        const r = 1 + Math.random() * 8;
        ctx.beginPath(); ctx.arc(Math.random() * s, Math.random() * s, r, 0, TAU); ctx.fill();
      }
      for (let i = 0; i < 90; i++) {
        ctx.strokeStyle = `rgba(35,30,22,${0.05 + Math.random() * 0.15})`;
        ctx.lineWidth = 0.5 + Math.random() * 1.5;
        ctx.beginPath();
        ctx.moveTo(Math.random() * s, Math.random() * s);
        ctx.lineTo(Math.random() * s, Math.random() * s);
        ctx.stroke();
      }
    }, 3, 3);

    const brick = makeCanvasTexture(256, (ctx, s) => {
      ctx.fillStyle = '#8a7562';
      ctx.fillRect(0, 0, s, s);
      const rows = 8, bh = s / rows;
      for (let y = 0; y < rows; y++) {
        const off = (y % 2) * 20;
        for (let x = -20; x < s; x += 40) {
          const v = 100 + Math.random() * 50;
          ctx.fillStyle = `rgb(${v + 22},${v},${v - 18})`;
          ctx.fillRect(x + off + 1.5, y * bh + 1.5, 37, bh - 3);
        }
        ctx.strokeStyle = 'rgba(52,43,36,0.42)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, y * bh); ctx.lineTo(s, y * bh); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(40,35,26,0.18)';
      for (let i = 0; i < 220; i++) ctx.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 9, 1 + Math.random() * 3);
    }, 1.5, 1.5);

    const wood = makeCanvasTexture(256, (ctx, s) => {
      ctx.fillStyle = '#6b4e32';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 26; i++) {
        const y = i * (s / 26);
        ctx.fillStyle = `rgba(${70 + Math.random() * 55},${48 + Math.random() * 40},${27 + Math.random() * 25},0.45)`;
        ctx.fillRect(0, y, s, s / 26 - 1);
        ctx.strokeStyle = 'rgba(40,26,15,0.28)';
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke();
        for (let k = 0; k < 5; k++) {
          ctx.strokeStyle = 'rgba(120,88,55,0.16)';
          ctx.beginPath();
          ctx.moveTo(Math.random() * s, y + Math.random() * 8);
          ctx.bezierCurveTo(Math.random() * s, y + 3, Math.random() * s, y + 7, Math.random() * s, y + 9);
          ctx.stroke();
        }
      }
    }, 2, 2);

    const concrete = makeCanvasTexture(256, (ctx, s) => {
      ctx.fillStyle = '#89877d';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 2400; i++) {
        const g = 108 + Math.random() * 65;
        ctx.fillStyle = `rgba(${g},${g},${g - 6},${0.12 + Math.random() * 0.25})`;
        ctx.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 4, 1 + Math.random() * 4);
      }
      for (let i = 0; i < 18; i++) {
        ctx.strokeStyle = `rgba(55,52,44,${0.08 + Math.random() * 0.14})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        let x = Math.random() * s, y = Math.random() * s;
        ctx.moveTo(x, y);
        for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 35; y += Math.random() * 25; ctx.lineTo(x, y); }
        ctx.stroke();
      }
    }, 3, 3);

    const roof = makeCanvasTexture(256, (ctx, s) => {
      ctx.fillStyle = '#6d5c4b';
      ctx.fillRect(0, 0, s, s);
      for (let y = 0; y < 12; y++) {
        for (let x = 0; x < 12; x++) {
          const v = 92 + Math.random() * 46;
          ctx.fillStyle = `rgb(${v + 20},${v},${v - 10})`;
          ctx.fillRect(x * 21.5 + (y % 2) * 6, y * 21.5, 20, 20);
        }
      }
      ctx.fillStyle = 'rgba(66,60,45,0.19)';
      for (let i = 0; i < 200; i++) ctx.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 8, 2 + Math.random() * 5);
    }, 2, 2);

    m.wall = new THREE.MeshStandardMaterial({ map: brick, color: '#b59c81', roughness: 0.94, metalness: 0.02, bumpMap: grunge, bumpScale: 0.035 });
    m.wallIn = new THREE.MeshStandardMaterial({ map: brick, color: '#a28d79', roughness: 0.96, metalness: 0.01 });
    m.concrete = new THREE.MeshStandardMaterial({ map: concrete, color: '#a09d91', roughness: 0.94, bumpMap: grunge, bumpScale: 0.03 });
    m.wood = new THREE.MeshStandardMaterial({ map: wood, color: '#84633f', roughness: 0.84 });
    m.woodDark = new THREE.MeshStandardMaterial({ map: wood, color: '#533b27', roughness: 0.9 });
    m.roof = new THREE.MeshStandardMaterial({ map: roof, color: '#b9a28a', roughness: 0.94, transparent: true, opacity: 0.97 });
    m.metal = new THREE.MeshStandardMaterial({ color: '#60645f', roughness: 0.66, metalness: 0.62 });
    m.rust = new THREE.MeshStandardMaterial({ color: '#79513a', roughness: 0.9, metalness: 0.24 });
    m.glass = new THREE.MeshStandardMaterial({ color: '#9cb3ad', roughness: 0.08, metalness: 0.35, transparent: true, opacity: 0.28 });
    m.door = new THREE.MeshStandardMaterial({ map: wood, color: '#6d4a2b', roughness: 0.8 });
    m.cloth = new THREE.MeshStandardMaterial({ color: '#596350', roughness: 0.95 });
    m.bed = new THREE.MeshStandardMaterial({ color: '#9da5a1', roughness: 0.92 });
    m.dark = new THREE.MeshStandardMaterial({ color: '#2c2f2a', roughness: 0.94 });
    m.white = new THREE.MeshStandardMaterial({ color: '#b8bbb1', roughness: 0.7 });
    m.green = new THREE.MeshStandardMaterial({ color: '#4f5d40', roughness: 0.85 });
    m.orange = new THREE.MeshStandardMaterial({ color: '#a9683d', roughness: 0.85 });
    m.skin = new THREE.MeshStandardMaterial({ color: '#b58a6b', roughness: 0.82 });
    m.trunk = new THREE.MeshStandardMaterial({ color: '#4c3a26', roughness: 0.98 });
    m.leaf = new THREE.MeshStandardMaterial({ color: '#3f5736', roughness: 0.92 });
    m.leaf2 = new THREE.MeshStandardMaterial({ color: '#51633b', roughness: 0.92 });
    m.rock = new THREE.MeshStandardMaterial({ color: '#6c6b60', roughness: 0.97 });
    m.grave = new THREE.MeshStandardMaterial({ color: '#77776b', roughness: 0.96 });
    m.fire = new THREE.MeshBasicMaterial({ color: '#ff9335', transparent: true, opacity: 0.9, depthWrite: false });
    m.glow = new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
    m.rain = new THREE.LineBasicMaterial({ color: '#b8cdd6', transparent: true, opacity: 0.42, depthWrite: false });
    m.snow = new THREE.PointsMaterial({ color: '#e8eef0', size: 0.08, transparent: true, opacity: 0.8, depthWrite: false });
    m.water = new THREE.MeshStandardMaterial({ color: '#34535b', roughness: 0.25, metalness: 0.25, transparent: true, opacity: 0.86 });
    m.puddle = new THREE.MeshStandardMaterial({ color: '#4b5d60', roughness: 0.12, metalness: 0.45, transparent: true, opacity: 0.32, depthWrite: false });
    m.marker = new THREE.MeshBasicMaterial({ color: '#f1d77a', transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
    return m;
  }

  // =====================================================================
  //  LUZES
  // =====================================================================
  buildLights() {
    this.hemi = new THREE.HemisphereLight('#b8c8bb', '#2b2b22', 1.15);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight('#7a8072', 0.3);
    this.scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight('#ffe4b0', 2.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.shadowSize, this.shadowSize);
    this.sun.shadow.bias = -0.0007;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 90;
    const s = 24;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.moon = new THREE.DirectionalLight('#9cb4d6', 0.18);
    this.scene.add(this.moon);
    this.scene.add(this.moon.target);

    // Lanterna presa ao jogador.
    this.flashlight = new THREE.SpotLight('#ffe9b5', 0, 26, 0.52, 0.45, 1.25);
    this.flashlight.castShadow = false;
    this.flashlightTarget = new THREE.Object3D();
    this.scene.add(this.flashlight);
    this.scene.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;
    this.flashCone = new THREE.Mesh(
      new THREE.ConeGeometry(2.35, 8.4, 18, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ffe3a3', transparent: true, opacity: 0.075, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.flashCone.visible = false;
    this.scene.add(this.flashCone);

    // Luz de preenchimento suave para o personagem não virar uma silhueta total.
    this.playerFill = new THREE.PointLight('#a9bcc4', 0.9, 5, 2);
    this.scene.add(this.playerFill);
  }

  buildTerrain() {
    const size = 2048;
    const p = size / WORLD_SIZE;
    const tex = makeCanvasTexture(size, (ctx) => {
      const base = {
        [T.GRASS]: '#4d5a39', [T.FOREST]: '#2c3b28', [T.DIRT]: '#6d5840', [T.ROAD]: '#353632',
        [T.SIDEWALK]: '#6d6b61', [T.WATER]: '#2b4c56', [T.FARM]: '#625b38', [T.WOOD]: '#5e4630',
        [T.TILE]: '#5b5e57', [T.WALL]: '#4f463a', [T.DOOR]: '#5e4630', [T.WINDOW]: '#46575a',
        [T.CONCRETE]: '#55564f', [T.RUBBLE]: '#544f44', [T.SAND]: '#8a785b', [T.GRAVEL]: '#57564f',
        [T.TALLGRASS]: '#4c5b34',
      };
      const world = this.game.world;
      for (let y = 0; y < WORLD_SIZE; y++) {
        for (let x = 0; x < WORLD_SIZE; x++) {
          const t = world.tile(x, y);
          const h = hash01(x, y, 21);
          let c = base[t] || '#3d4438';
          if (t === T.GRASS) c = h > 0.55 ? '#53603c' : h > 0.25 ? '#4b5737' : '#465332';
          else if (t === T.FOREST) c = h > 0.55 ? '#31422b' : '#293824';
          else if (t === T.TALLGRASS) c = h > 0.5 ? '#52623a' : '#485731';
          else if (t === T.ROAD) c = h > 0.72 ? '#3a3b37' : '#333431';
          else if (t === T.SIDEWALK) c = h > 0.6 ? '#747268' : '#68665d';
          else if (t === T.WOOD) c = h > 0.55 ? '#634a32' : '#5a422c';
          else if (t === T.TILE) c = ((x + y) & 1) ? '#5e6159' : '#575a53';
          else if (t === T.WATER) c = h > 0.5 ? '#2f525c' : '#284850';
          else if (t === T.DIRT) c = h > 0.55 ? '#735d43' : '#675238';
          else if (t === T.FARM) c = h > 0.5 ? '#6a623c' : '#5e5734';
          ctx.fillStyle = c;
          ctx.fillRect(x * p, y * p, p + 0.6, p + 0.6);

          if (t === T.GRASS || t === T.TALLGRASS || t === T.FOREST) {
            if (h > 0.55) {
              ctx.strokeStyle = t === T.TALLGRASS ? 'rgba(137,155,80,0.32)' : 'rgba(112,132,71,0.22)';
              ctx.lineWidth = 1;
              for (let i = 0; i < 3; i++) {
                const gx = x * p + 2 + ((h * 100 + i * 3) % (p - 3));
                const gy = y * p + 2 + ((h * 77 + i * 4) % (p - 4));
                ctx.beginPath(); ctx.moveTo(gx, gy + 3); ctx.lineTo(gx + (i - 1), gy); ctx.stroke();
              }
            }
            if (t === T.FOREST && h > 0.72) {
              ctx.fillStyle = 'rgba(28,24,15,0.28)';
              ctx.beginPath(); ctx.ellipse(x * p + p * 0.5, y * p + p * 0.55, p * 0.28, p * 0.16, 0, 0, TAU); ctx.fill();
            }
          } else if (t === T.ROAD) {
            if (h > 0.7) {
              ctx.strokeStyle = 'rgba(15,15,14,0.32)';
              ctx.beginPath();
              ctx.moveTo(x * p + 2, y * p + 3);
              ctx.lineTo(x * p + p * 0.45, y * p + p * 0.7);
              ctx.stroke();
            }
            const n = world.tile(x, y - 1), s = world.tile(x, y + 1);
            const e = world.tile(x + 1, y), w = world.tile(x - 1, y);
            if (n === T.ROAD && s === T.ROAD && x % 5 === 0) {
              ctx.fillStyle = 'rgba(196,168,76,0.24)';
              ctx.fillRect(x * p + p * 0.43, y * p, p * 0.14, p);
            } else if (e === T.ROAD && w === T.ROAD && y % 5 === 0) {
              ctx.fillStyle = 'rgba(196,168,76,0.24)';
              ctx.fillRect(x * p, y * p + p * 0.43, p, p * 0.14);
            }
          } else if (t === T.SIDEWALK) {
            ctx.strokeStyle = 'rgba(38,38,33,0.26)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x * p + 0.2, y * p + 0.2, p - 0.4, p - 0.4);
            if (h > 0.82) {
              ctx.strokeStyle = 'rgba(28,28,24,0.4)';
              ctx.beginPath();
              ctx.moveTo(x * p + 2, y * p + 2);
              ctx.lineTo(x * p + p * 0.5, y * p + p * 0.45);
              ctx.lineTo(x * p + p * 0.36, y * p + p * 0.7);
              ctx.stroke();
            }
          } else if (t === T.WOOD) {
            ctx.strokeStyle = 'rgba(41,29,17,0.28)';
            ctx.lineWidth = 0.9;
            for (let i = 1; i < 3; i++) {
              ctx.beginPath(); ctx.moveTo(x * p, y * p + i * p / 3); ctx.lineTo(x * p + p, y * p + i * p / 3); ctx.stroke();
            }
          } else if (t === T.TILE) {
            ctx.strokeStyle = 'rgba(35,39,33,0.28)';
            ctx.strokeRect(x * p + 0.5, y * p + 0.5, p - 1, p - 1);
          } else if (t === T.FARM) {
            ctx.strokeStyle = 'rgba(48,42,22,0.36)';
            ctx.beginPath(); ctx.moveTo(x * p + 1, y * p + p * 0.7); ctx.lineTo(x * p + p - 1, y * p + p * 0.7); ctx.stroke();
            if (h > 0.55) {
              ctx.fillStyle = 'rgba(121,148,65,0.65)';
              ctx.fillRect(x * p + p * 0.28, y * p + p * 0.32, 1.7, 4);
              ctx.fillRect(x * p + p * 0.66, y * p + p * 0.5, 1.7, 4);
            }
          } else if (t === T.WATER) {
            ctx.strokeStyle = 'rgba(145,190,198,0.15)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x * p + 1, y * p + p * 0.35);
            ctx.quadraticCurveTo(x * p + p * 0.5, y * p + p * 0.22, x * p + p - 1, y * p + p * 0.38);
            ctx.stroke();
          }
        }
      }
      // Manchas de abandono por cima do terreno.
      for (let i = 0; i < 900; i++) {
        const x = Math.random() * size, y = Math.random() * size, r = 4 + Math.random() * 30;
        ctx.fillStyle = `rgba(${20 + Math.random() * 40},${18 + Math.random() * 35},${12 + Math.random() * 25},${0.04 + Math.random() * 0.08})`;
        ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.55, Math.random() * TAU, 0, TAU); ctx.fill();
      }
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.repeat.set(1, 1);
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE);
    geo.rotateX(-Math.PI / 2);
    this.groundMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.93, metalness: 0.02, color: '#b7b7a8' });
    this.ground = new THREE.Mesh(geo, this.groundMat);
    this.ground.position.y = 0;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    // Água: apenas sobre os tiles de rio/lago, para não escurecer o mapa todo.
    const waterTiles = [];
    for (let y = 0; y < WORLD_SIZE; y++) {
      for (let x = 0; x < WORLD_SIZE; x++) {
        if (this.game.world.tile(x, y) === T.WATER) waterTiles.push({ x, y });
      }
    }
    if (waterTiles.length) {
      const waterGeo = new THREE.PlaneGeometry(1.02, 1.02).rotateX(-Math.PI / 2);
      this.waterPlane = new THREE.InstancedMesh(waterGeo, this.materials.water, waterTiles.length);
      const wm = new THREE.Matrix4(), wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3(1, 1, 1);
      waterTiles.forEach((t, i) => {
        wp.set(wx(t.x * TILE + 16), 0.012, wz(t.y * TILE + 16));
        wm.compose(wp, wq, ws);
        this.waterPlane.setMatrixAt(i, wm);
      });
      this.waterPlane.instanceMatrix.needsUpdate = true;
      this.waterPlane.receiveShadow = true;
      this.scene.add(this.waterPlane);
    }

    // Mancha de sujeira / poças espalhadas pelas ruas.
    this.puddles = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2),
      this.materials.puddle, 90
    );
    this.puddles.renderOrder = 2;
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
    let pi = 0;
    const world = this.game.world;
    for (let i = 0; i < 260 && pi < 90; i++) {
      const x = Math.floor(Math.random() * WORLD_SIZE), y = Math.floor(Math.random() * WORLD_SIZE);
      const t = world.tile(x, y);
      if (t !== T.ROAD && t !== T.SIDEWALK && t !== T.DIRT) continue;
      pos.set(wx(x * TILE + 16), 0.026, wz(y * TILE + 16));
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * TAU);
      const s = 0.35 + Math.random() * 1.25;
      sc.set(s, 1, s * (0.5 + Math.random() * 0.7));
      mtx.compose(pos, q, sc);
      this.puddles.setMatrixAt(pi++, mtx);
    }
    this.puddles.count = pi;
    this.puddles.instanceMatrix.needsUpdate = true;
    this.scene.add(this.puddles);
  }

  buildBuildings() {
    const world = this.game.world;
    const wallMatrices = [];
    const roofGroup = new THREE.Group();
    const tmp = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    // Paredes: uma instância por segmento, com espessura real.
    for (let y = 0; y < WORLD_SIZE; y++) {
      for (let x = 0; x < WORLD_SIZE; x++) {
        const t = world.tile(x, y);
        if (t !== T.WALL) continue;
        const n = world.tile(x, y - 1) === T.WALL;
        const s = world.tile(x, y + 1) === T.WALL;
        const e = world.tile(x + 1, y) === T.WALL;
        const w = world.tile(x - 1, y) === T.WALL;
        const hx = wx(x * TILE + 16), hz = wz(y * TILE + 16);
        const color = new THREE.Color(hash01(x, y, 4) > 0.5 ? '#a68d75' : '#98836f');
        if (e || w || (!n && !s)) {
          pos.set(hx, WALL_H / 2, hz);
          sc.set(1.02, WALL_H, WALL_T);
          tmp.compose(pos, q.identity(), sc);
          wallMatrices.push({ m: tmp.clone(), c: color, interior: this.insideBuilding(x, y), x: hx, z: hz });
        }
        if (n || s || (!e && !w)) {
          pos.set(hx, WALL_H / 2, hz);
          sc.set(WALL_T, WALL_H, 1.02);
          tmp.compose(pos, q.identity(), sc);
          wallMatrices.push({ m: tmp.clone(), c: color, interior: this.insideBuilding(x, y), x: hx, z: hz });
        }
      }
    }
    const wallGeo = new THREE.BoxGeometry(1, 1, 1);
    const wallMesh = new THREE.InstancedMesh(wallGeo, this.materials.wall, wallMatrices.length);
    wallMesh.castShadow = true; wallMesh.receiveShadow = true;
    wallMatrices.forEach((it, i) => {
      wallMesh.setMatrixAt(i, it.m);
      wallMesh.setColorAt(i, it.c);
    });
    wallMesh.instanceMatrix.needsUpdate = true;
    if (wallMesh.instanceColor) wallMesh.instanceColor.needsUpdate = true;
    this.scene.add(wallMesh);

    // Portas, janelas, telhados e luz de janela.
    for (const d of world.doors.values()) this.buildDoor(d);
    for (const w of world.windows.values()) this.buildWindow(w);
    for (const b of world.buildings) this.buildRoof(b);
    this.wallMesh = wallMesh;
    this.wallInstances = wallMatrices.map(it => ({ base: it.m, x: it.x, z: it.z, hidden: false }));
    this.wallHiddenMatrix = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);
    this.scene.add(roofGroup);
  }

  updateWallCutaway() {
    if (!this.wallMesh || !this.wallInstances) return;
    const p = this.game.player;
    const px = wx(p.x), pz = wz(p.y);
    let changed = false;
    for (let i = 0; i < this.wallInstances.length; i++) {
      const w = this.wallInstances[i];
      const dx = w.x - px, dz = w.z - pz;
      const hide = (dx + dz > 0.45) && (dx * dx + dz * dz < 82);
      if (hide === w.hidden) continue;
      w.hidden = hide;
      this.wallMesh.setMatrixAt(i, hide ? this.wallHiddenMatrix : w.base);
      changed = true;
    }
    if (changed) this.wallMesh.instanceMatrix.needsUpdate = true;
  }

  insideBuilding(tx, ty) {
    for (const b of this.game.world.buildings) {
      if (tx > b.x && tx < b.x + b.w - 1 && ty > b.y && ty < b.y + b.h - 1) return b;
    }
    return null;
  }

  buildDoor(d) {
    const world = this.game.world;
    const b = world.buildings.find(x => x.id === d.building);
    if (!b) return;
    const cx = wx(d.x * TILE + 16), cz = wz(d.y * TILE + 16);
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    const vertical = d.side === 'east' || d.side === 'west';
    const frameMat = this.materials.woodDark;
    const jamb = new THREE.BoxGeometry(0.13, 2.32, 0.15);
    if (vertical) {
      const a = new THREE.Mesh(jamb, frameMat); a.position.set(0, 1.16, -0.5); g.add(a);
      const bb = new THREE.Mesh(jamb, frameMat); bb.position.set(0, 1.16, 0.5); g.add(bb);
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 1.1), frameMat);
      lintel.position.set(0, 2.4, 0); g.add(lintel);
    } else {
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.32, 0.13), frameMat); a.position.set(-0.5, 1.16, 0); g.add(a);
      const bb = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.32, 0.13), frameMat); bb.position.set(0.5, 1.16, 0); g.add(bb);
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.18), frameMat);
      lintel.position.set(0, 2.4, 0); g.add(lintel);
    }
    const pivot = new THREE.Group();
    pivot.position.set(vertical ? 0 : -0.47, 0, vertical ? -0.47 : 0);
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(vertical ? 0.08 : 0.94, 2.24, vertical ? 0.94 : 0.08),
      this.materials.door
    );
    panel.castShadow = true;
    panel.position.set(vertical ? -0.02 : 0.47, 1.12, vertical ? 0.47 : 0.02);
    pivot.add(panel);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), this.materials.metal);
    knob.position.set(vertical ? -0.07 : 0.82, 1.08, vertical ? 0.82 : -0.07);
    pivot.add(knob);
    g.add(pivot);
    d._pivot = pivot;
    d._vertical = vertical;
    d._baseRot = 0;
    d._openSign = (d.side === 'south' || d.side === 'west') ? -1 : 1;
    this.scene.add(g);
  }

  buildWindow(w) {
    const b = this.game.world.buildings.find(x => x.id === w.building);
    if (!b) return;
    const cx = wx(w.x * TILE + 16), cz = wz(w.y * TILE + 16);
    const side = w.y === b.y ? 'north' : w.y === b.y + b.h - 1 ? 'south' : w.x === b.x ? 'west' : 'east';
    const vertical = side === 'east' || side === 'west';
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    const lower = new THREE.Mesh(new THREE.BoxGeometry(vertical ? WALL_T : 0.98, 0.92, vertical ? 0.98 : WALL_T), this.materials.wall);
    lower.position.y = 0.46; lower.castShadow = true; lower.receiveShadow = true; g.add(lower);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(vertical ? WALL_T : 0.98, 0.52, vertical ? 0.98 : WALL_T), this.materials.wall);
    upper.position.y = 2.36; upper.castShadow = true; upper.receiveShadow = true; g.add(upper);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 1.15), this.materials.glass);
    glass.position.set(0, 1.54, 0);
    if (!vertical) glass.rotation.y = 0; else glass.rotation.y = Math.PI / 2;
    g.add(glass);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(vertical ? 0.05 : 0.86, 0.05, vertical ? 0.86 : 0.05), this.materials.woodDark);
    bar.position.set(0, 1.54, 0); g.add(bar);
    const bar2 = bar.clone(); bar2.rotation.y = Math.PI / 2; g.add(bar2);
    this.scene.add(g);

    // Claridade falsa que entra pela janela durante o dia.
    const lx = side === 'north' ? cx : side === 'south' ? cx : side === 'east' ? cx - 0.75 : cx + 0.75;
    const lz = side === 'north' ? cz + 0.75 : side === 'south' ? cz - 0.75 : cz;
    const patch = new THREE.Mesh(
      new THREE.PlaneGeometry(1.35, 1.75).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffe9b0', transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    patch.position.set(lx, 0.035, lz);
    patch.rotation.y = side === 'north' ? 0 : side === 'south' ? 0 : Math.PI / 2;
    this.scene.add(patch);
    this.windowLights.push(patch);
  }

  buildRoof(b) {
    const type = b.type || 'casa';
    const colorByType = {
      casa: '#b09479', apartamento: '#9c968a', mercado: '#a3a69b', hospital: '#a8b0a9',
      escola: '#aca68f', delegacia: '#969d99', quartel: '#879080', posto: '#a09c8e',
      oficina: '#928b7b', fazenda: '#a5855f', cabana: '#a38461', igreja: '#a39783',
    };
    const mat = this.materials.roof.clone();
    mat.color = new THREE.Color(colorByType[type] || '#6e5e4c');
    mat.transparent = true;
    mat.opacity = 0.97;
    mat.depthWrite = true;
    const g = new THREE.Group();
    const w = b.w - 0.2, h = b.h - 0.2;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.22, h + 0.3), mat);
    slab.position.set(wx((b.x + b.w / 2) * TILE), ROOF_Y, wz((b.y + b.h / 2) * TILE));
    slab.castShadow = true; slab.receiveShadow = false;
    g.add(slab);
    // Faixa/parapeito e pequenos volumes no telhado.
    if (type === 'mercado' || type === 'hospital' || type === 'escola' || type === 'quartel' || type === 'apartamento') {
      const parapetMat = new THREE.MeshStandardMaterial({ color: '#77766c', roughness: 0.94 });
      const front = new THREE.Mesh(new THREE.BoxGeometry(w + 0.45, 0.28, 0.12), parapetMat);
      front.position.set(wx((b.x + b.w / 2) * TILE), ROOF_Y + 0.2, wz(b.y * TILE) + 0.2);
      g.add(front);
      const back = front.clone(); back.position.z = wz((b.y + b.h) * TILE) - 0.2; g.add(back);
    }
    if (hash01(b.x, b.y, 5) > 0.42) {
      const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.5, 8), this.materials.metal);
      vent.position.set(wx((b.x + b.w * 0.34) * TILE), ROOF_Y + 0.36, wz((b.y + b.h * 0.56) * TILE));
      vent.castShadow = true; g.add(vent);
    }
    if (type === 'apartamento' || type === 'hospital' || type === 'quartel') {
      const ac = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.45, 0.55), this.materials.metal);
      ac.position.set(wx((b.x + b.w * 0.72) * TILE), ROOF_Y + 0.33, wz((b.y + b.h * 0.32) * TILE));
      ac.castShadow = true; g.add(ac);
    }
    this.scene.add(g);
    this.buildingRoofs.push({ building: b, group: g, mat });

    if (b.key) {
      const tex = makeTextTexture(b.name);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.9, depthWrite: false }));
      sprite.position.set(wx((b.x + b.w / 2) * TILE), WALL_H + 0.95, wz((b.y + b.h / 2) * TILE));
      sprite.scale.set(2.7, 0.67, 1);
      sprite.visible = false;
      this.scene.add(sprite);
      this.buildingLabels.push({ building: b, sprite });
    }
  }

  // =====================================================================
  //  MOBÍLIA / CONTÊINERES / CAMAS
  // =====================================================================
  buildFurniture() {
    const world = this.game.world;
    this.furnitureGroups = new Map();
    const add = (kind, x, y, opts = {}) => {
      if (!this.furnitureGroups.has(kind)) this.furnitureGroups.set(kind, []);
      this.furnitureGroups.get(kind).push({ x, y, ...opts });
    };

    // Contêineres viram móveis reconhecíveis.
    for (const c of world.containers) {
      let kind = 'crate';
      if (c.type === 'geladeira') kind = 'fridge';
      else if (c.type === 'mercado') kind = 'shelf';
      else if (c.type === 'cozinha' || c.type === 'armario' || c.type === 'farmacia' || c.type === 'escola' || c.type === 'policia' || c.type === 'armario_militar') kind = 'cabinet';
      else if (c.type === 'oficina' || c.type === 'ferramentas') kind = 'workbench';
      else if (c.type === 'quartel') kind = 'militaryCrate';
      else if (c.type === 'caixa_suprimentos') kind = 'supplyCrate';
      add(kind, c.x * TILE + 16, c.y * TILE + 16, { searched: c.searched, object: c });
    }

    // Camas.
    for (const b of world.beds) add('bed', b.x * TILE + 16, b.y * TILE + 16, {});

    // Mobília decorativa.
    for (const d of world.decor) {
      if (d.type === 'bed') continue;
      const kind = d.type === 'desk' ? 'desk' : d.type === 'toolbench' ? 'workbench' : d.type === 'tire' ? 'tires' : d.type;
      add(kind, d.x * TILE + 16, d.y * TILE + 16, { rot: (d.rot || 0) * Math.PI / 2 });
    }

    const specs = this.furnitureSpecs();
    for (const [kind, items] of this.furnitureGroups) {
      const spec = specs[kind];
      if (!spec) continue;
      spec(items);
    }

    // Bilhetes espalhados, pequenos retângulos claros.
    const noteGeo = new THREE.PlaneGeometry(0.34, 0.44).rotateX(-Math.PI / 2);
    const noteMat = new THREE.MeshStandardMaterial({ color: '#d9d2b4', roughness: 0.95, side: THREE.DoubleSide });
    for (const n of world.notes) {
      const mesh = new THREE.Mesh(noteGeo, noteMat);
      mesh.position.set(wx(n.x * TILE + 16), 0.035, wz(n.y * TILE + 16));
      mesh.rotation.y = hash01(n.x, n.y, 8) * TAU;
      this.scene.add(mesh);
    }
  }

  furnitureSpecs() {
    const mkGroup = (geo, mat, matrixFn) => (items) => {
      const mesh = new THREE.InstancedMesh(geo, mat, items.length);
      mesh.castShadow = true; mesh.receiveShadow = true;
      const mtx = new THREE.Matrix4(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
      items.forEach((it, i) => {
        const rot = it.rot || 0;
        pos.set(wx(it.x), 0, wz(it.y));
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
        matrixFn(mtx, pos, q, sc, it);
        mesh.setMatrixAt(i, mtx);
        if (it.object) { it.object._mesh = mesh; it.object._index = i; it.object._lastSearched = it.object.searched; }
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.scene.add(mesh);
      return mesh;
    };

    this.furnitureSpecs = () => ({
      crate: mkGroup(new THREE.BoxGeometry(0.72, 0.62, 0.72).translate(0, 0.31, 0), this.materials.wood, (m, p, q, s, it) => {
        s.set(1, it.searched ? 0.82 : 1, 1); m.compose(p, q, s);
      }),
      militaryCrate: mkGroup(new THREE.BoxGeometry(0.8, 0.55, 0.6).translate(0, 0.28, 0), this.materials.green, (m, p, q, s) => m.compose(p, q, s)),
      supplyCrate: mkGroup(new THREE.BoxGeometry(0.92, 0.62, 0.68).translate(0, 0.31, 0), this.materials.green, (m, p, q, s) => m.compose(p, q, s)),
      fridge: mkGroup(new THREE.BoxGeometry(0.72, 1.85, 0.66).translate(0, 0.93, 0), this.materials.white, (m, p, q, s) => m.compose(p, q, s)),
      shelf: mkGroup(new THREE.BoxGeometry(1.0, 1.75, 0.5).translate(0, 0.88, 0), this.materials.woodDark, (m, p, q, s) => m.compose(p, q, s)),
      cabinet: mkGroup(new THREE.BoxGeometry(0.82, 1.9, 0.5).translate(0, 0.95, 0), this.materials.wood, (m, p, q, s) => m.compose(p, q, s)),
      workbench: mkGroup(new THREE.BoxGeometry(1.1, 0.9, 0.62).translate(0, 0.45, 0), this.materials.woodDark, (m, p, q, s) => m.compose(p, q, s)),
      bed: (items) => {
        const base = mkGroup(new THREE.BoxGeometry(0.98, 0.38, 1.75).translate(0, 0.19, 0), this.materials.woodDark, (m, p, q, s) => m.compose(p, q, s));
        const mat = new THREE.MeshStandardMaterial({ color: '#adb4af', roughness: 0.94 });
        const mattress = mkGroup(new THREE.BoxGeometry(0.9, 0.18, 1.55).translate(0, 0.46, 0), mat, (m, p, q, s) => m.compose(p, q, s));
        const pillowMat = new THREE.MeshStandardMaterial({ color: '#d9ddd4', roughness: 0.95 });
        const pillow = mkGroup(new THREE.BoxGeometry(0.62, 0.13, 0.3).translate(0, 0.6, -0.55), pillowMat, (m, p, q, s) => m.compose(p, q, s));
        return [base, mattress, pillow];
      },
      table: mkGroup(new THREE.BoxGeometry(0.92, 0.08, 0.82).translate(0, 0.72, 0), this.materials.wood, (m, p, q, s) => m.compose(p, q, s)),
      desk: mkGroup(new THREE.BoxGeometry(1.02, 0.08, 0.62).translate(0, 0.72, 0), this.materials.wood, (m, p, q, s) => m.compose(p, q, s)),
      chair: mkGroup(new THREE.BoxGeometry(0.44, 0.5, 0.44).translate(0, 0.25, 0), this.materials.woodDark, (m, p, q, s) => m.compose(p, q, s)),
      sofa: mkGroup(new THREE.BoxGeometry(1.25, 0.62, 0.62).translate(0, 0.31, 0), this.materials.cloth, (m, p, q, s) => m.compose(p, q, s)),
      counter: mkGroup(new THREE.BoxGeometry(1.35, 0.92, 0.6).translate(0, 0.46, 0), this.materials.wood, (m, p, q, s) => m.compose(p, q, s)),
      tires: mkGroup(new THREE.CylinderGeometry(0.35, 0.35, 0.22, 12).rotateX(Math.PI / 2).translate(0, 0.36, 0), this.materials.dark, (m, p, q, s) => m.compose(p, q, s)),
      tent: (items) => {
        const geo = new THREE.ConeGeometry(1.25, 1.15, 4, 1).translate(0, 0.57, 0);
        const mesh = new THREE.InstancedMesh(geo, this.materials.green, items.length);
        mesh.castShadow = true; mesh.receiveShadow = true;
        const mtx = new THREE.Matrix4(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
        items.forEach((it, i) => {
          pos.set(wx(it.x), 0, wz(it.y));
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
          mtx.compose(pos, q, sc);
          mesh.setMatrixAt(i, mtx);
        });
        mesh.instanceMatrix.needsUpdate = true;
        this.scene.add(mesh);
        return mesh;
      },
      campfire_dead: mkGroup(new THREE.CylinderGeometry(0.48, 0.55, 0.12, 10).translate(0, 0.06, 0), this.materials.dark, (m, p, q, s) => m.compose(p, q, s)),
    });
    return this.furnitureSpecs();
  }

  // =====================================================================
  //  VEGETAÇÃO / DETALHES URBANOS
  // =====================================================================
  buildFoliage() {
    const world = this.game.world;
    const trees = world.trees;
    this.treeBase = trees.map(t => ({ x: wx(t.x), z: wz(t.y), scale: 0.7 + t.r * 0.65, variant: t.variant, sway: t.sway }));
    const trunkGeo = new THREE.CylinderGeometry(0.09, 0.17, 1.3, 6).translate(0, 0.65, 0);
    this.trunks = new THREE.InstancedMesh(trunkGeo, this.materials.trunk, trees.length);
    this.trunks.castShadow = true; this.trunks.receiveShadow = true;
    const canopyGeo = new THREE.IcosahedronGeometry(1, 0);
    this.canopies = new THREE.InstancedMesh(canopyGeo, this.materials.leaf, trees.length);
    this.canopies.castShadow = true; this.canopies.receiveShadow = true;
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
    trees.forEach((t, i) => {
      const b = this.treeBase[i];
      pos.set(b.x, 0, b.z); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash01(i, 3, 9) * TAU);
      sc.set(0.8, 1, 0.8);
      mtx.compose(pos, q, sc);
      this.trunks.setMatrixAt(i, mtx);
      pos.set(b.x, 1.25 * b.scale, b.z);
      sc.set(b.scale * 1.05, b.scale * 0.9, b.scale * 1.05);
      mtx.compose(pos, q, sc);
      this.canopies.setMatrixAt(i, mtx);
      this.canopies.setColorAt(i, new THREE.Color(t.variant === 0 ? '#3c5335' : t.variant === 1 ? '#4b5e3a' : '#34482e'));
    });
    this.trunks.instanceMatrix.needsUpdate = true;
    this.canopies.instanceMatrix.needsUpdate = true;
    if (this.canopies.instanceColor) this.canopies.instanceColor.needsUpdate = true;
    this.scene.add(this.trunks, this.canopies);

    // Arbustos e tufos.
    const bushCount = Math.min(900, Math.max(160, Math.floor(trees.length * 0.22)));
    this.bushes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.36, 0), this.materials.leaf2, bushCount);
    let bi = 0;
    for (let i = 0; i < bushCount * 3 && bi < bushCount; i++) {
      const x = Math.floor(Math.random() * WORLD_SIZE), y = Math.floor(Math.random() * WORLD_SIZE);
      const t = world.tile(x, y);
      if (t !== T.GRASS && t !== T.TALLGRASS && t !== T.FOREST) continue;
      if (world.nearBuilding(x, y, 1)) continue;
      pos.set(wx(x * TILE + 8 + Math.random() * 16), 0.25 + Math.random() * 0.1, wz(y * TILE + 8 + Math.random() * 16));
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * TAU);
      const s = 0.6 + Math.random() * 1.4;
      sc.set(s, 0.7 + Math.random() * 0.8, s);
      mtx.compose(pos, q, sc);
      this.bushes.setMatrixAt(bi++, mtx);
    }
    this.bushes.count = bi;
    this.bushes.instanceMatrix.needsUpdate = true;
    this.bushes.castShadow = true;
    this.scene.add(this.bushes);

    // Pedras.
    if (world.rocks.length) {
      this.rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.42, 0), this.materials.rock, world.rocks.length);
      world.rocks.forEach((r, i) => {
        pos.set(wx(r.x), 0.2, wz(r.y));
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash01(i, 4, 6) * TAU);
        sc.set(0.8 + r.r, 0.7 + r.r * 0.4, 0.8 + r.r);
        mtx.compose(pos, q, sc);
        this.rocks.setMatrixAt(i, mtx);
      });
      this.rocks.instanceMatrix.needsUpdate = true;
      this.rocks.castShadow = true; this.rocks.receiveShadow = true;
      this.scene.add(this.rocks);
    }
  }

  buildStreetDetails() {
    const world = this.game.world;
    const spots = [];
    // Postes nas calçadas, de forma determinística.
    for (let y = 2; y < WORLD_SIZE - 2; y += 9) {
      for (let x = 2; x < WORLD_SIZE - 2; x += 9) {
        if (world.tile(x, y) === T.SIDEWALK && hash01(x, y, 33) > 0.28) {
          spots.push({ x: x * TILE + 16, y: y * TILE + 16 });
        }
      }
    }
    const count = Math.min(spots.length, 180);
    this.lampPosts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.075, 3.1, 6).translate(0, 1.55, 0), this.materials.metal, count);
    this.lampHeads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.12, 0.5).translate(0, 3.08, 0), new THREE.MeshStandardMaterial({ color: '#6f746b', roughness: 0.6, metalness: 0.5, emissive: '#3b3422', emissiveIntensity: 0.2 }), count);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < count; i++) {
      pos.set(wx(spots[i].x), 0, wz(spots[i].y));
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0);
      mtx.compose(pos, q, sc);
      this.lampPosts.setMatrixAt(i, mtx);
      this.lampHeads.setMatrixAt(i, mtx);
    }
    this.lampPosts.instanceMatrix.needsUpdate = true;
    this.lampHeads.instanceMatrix.needsUpdate = true;
    this.lampPosts.castShadow = true;
    this.scene.add(this.lampPosts, this.lampHeads);

    // Entulho, lixo e pequenos detritos pela cidade.
    const debrisCount = 700;
    const debrisGeo = new THREE.BoxGeometry(0.17, 0.12, 0.3);
    this.debris = new THREE.InstancedMesh(debrisGeo, this.materials.rust, debrisCount);
    let di = 0;
    for (let i = 0; i < debrisCount * 4 && di < debrisCount; i++) {
      const x = Math.floor(Math.random() * WORLD_SIZE), y = Math.floor(Math.random() * WORLD_SIZE);
      const t = world.tile(x, y);
      if (t !== T.SIDEWALK && t !== T.ROAD && t !== T.DIRT && t !== T.RUBBLE && t !== T.GRAVEL) continue;
      pos.set(wx(x * TILE + 4 + Math.random() * 24), 0.08, wz(y * TILE + 4 + Math.random() * 24));
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * TAU);
      sc.set(0.5 + Math.random() * 1.4, 0.7 + Math.random() * 1.1, 0.5 + Math.random() * 1.2);
      mtx.compose(pos, q, sc);
      this.debris.setMatrixAt(di++, mtx);
    }
    this.debris.count = di;
    this.debris.instanceMatrix.needsUpdate = true;
    this.debris.castShadow = true;
    this.scene.add(this.debris);

    // Vegetação alta em volta das ruas e terrenos vazios.
    const grassCount = 1200;
    this.grassTufts = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.09, 0.6, 4).translate(0, 0.3, 0),
      new THREE.MeshStandardMaterial({ color: '#61703f', roughness: 0.96 }),
      grassCount
    );
    let gi = 0;
    for (let i = 0; i < grassCount * 4 && gi < grassCount; i++) {
      const x = Math.floor(Math.random() * WORLD_SIZE), y = Math.floor(Math.random() * WORLD_SIZE);
      const t = world.tile(x, y);
      if (t !== T.GRASS && t !== T.TALLGRASS && t !== T.FARM) continue;
      if (world.nearBuilding(x, y, 1)) continue;
      pos.set(wx(x * TILE + Math.random() * 32), 0, wz(y * TILE + Math.random() * 32));
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * TAU);
      const s = 0.5 + Math.random() * 1.2;
      sc.set(s, 0.6 + Math.random() * 1.7, s);
      mtx.compose(pos, q, sc);
      this.grassTufts.setMatrixAt(gi++, mtx);
    }
    this.grassTufts.count = gi;
    this.grassTufts.instanceMatrix.needsUpdate = true;
    this.scene.add(this.grassTufts);
  }

  // =====================================================================
  //  VEÍCULOS
  // =====================================================================
  buildVehicles() {
    for (const v of this.game.world.vehicles) this.createVehicle(v);
  }

  createVehicle(v) {
    const g = new THREE.Group();
    const len = v.w / TILE, wid = v.h / TILE;
    const bodyH = v.type === 'van' ? 1.05 : v.type === 'caminhonete' ? 0.72 : 0.62;
    const bodyMat = new THREE.MeshStandardMaterial({ color: v.color, roughness: 0.62, metalness: 0.34 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(len, bodyH, wid), bodyMat);
    body.position.y = 0.38 + bodyH / 2;
    body.castShadow = true; body.receiveShadow = true; g.add(body);

    const cabLen = v.type === 'van' ? len * 0.76 : len * 0.48;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(cabLen, bodyH * 0.78, wid * 0.9), bodyMat);
    cab.position.set(v.type === 'van' ? -len * 0.05 : -len * 0.08, 0.38 + bodyH + bodyH * 0.34, 0);
    cab.castShadow = true; g.add(cab);

    const glassMat = new THREE.MeshStandardMaterial({ color: '#26343a', roughness: 0.18, metalness: 0.6, transparent: true, opacity: 0.72 });
    const windshield = new THREE.Mesh(new THREE.PlaneGeometry(wid * 0.78, bodyH * 0.5), glassMat);
    windshield.position.set(v.type === 'van' ? len * 0.32 : len * 0.19, 0.38 + bodyH + bodyH * 0.34, 0);
    windshield.rotation.y = Math.PI / 2;
    g.add(windshield);

    const wheelGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.18, 12).rotateX(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: '#1e201f', roughness: 0.92 });
    const wheelPositions = [
      [-len * 0.31, wid * 0.5], [len * 0.31, wid * 0.5],
      [-len * 0.31, -wid * 0.5], [len * 0.31, -wid * 0.5],
    ];
    const wheels = [];
    for (const [x, z] of wheelPositions) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(x, 0.24, z);
      w.castShadow = true; g.add(w); wheels.push(w);
    }

    const lightMat = new THREE.MeshStandardMaterial({ color: '#ffe3a0', emissive: '#ffd47a', emissiveIntensity: v.fuel > 1 ? 0.25 : 0.05, roughness: 0.25 });
    for (const z of [-wid * 0.32, wid * 0.32]) {
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.16), lightMat);
      light.position.set(len * 0.5, 0.55, z);
      g.add(light);
    }
    const tailMat = new THREE.MeshStandardMaterial({ color: '#7a2c26', emissive: '#4a120f', emissiveIntensity: 0.4 });
    for (const z of [-wid * 0.32, wid * 0.32]) {
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.13), tailMat);
      light.position.set(-len * 0.5, 0.55, z);
      g.add(light);
    }

    // Ferrugem e sujeira.
    if (v.condition < 65) {
      const rustMat = new THREE.MeshStandardMaterial({ color: '#5f3b28', roughness: 0.96 });
      for (let i = 0; i < 4; i++) {
        const rust = new THREE.Mesh(new THREE.PlaneGeometry(0.12 + Math.random() * 0.2, 0.08 + Math.random() * 0.15), rustMat);
        rust.position.set((Math.random() - 0.5) * len * 0.7, 0.42 + Math.random() * bodyH * 0.8, (Math.random() > 0.5 ? 1 : -1) * (wid * 0.5 + 0.001));
        rust.rotation.y = rust.position.z > 0 ? 0 : Math.PI;
        g.add(rust);
      }
    }

    g.position.set(wx(v.x), 0, wz(v.y));
    g.rotation.y = Math.PI / 2 - v.angle;
    this.scene.add(g);
    this.vehiclePool.set(v.id, { group: g, vehicle: v, wheels, bodyMat, lightMat });
  }

  // =====================================================================
  //  CLIMA / PARTÍCULAS / MARCADORES
  // =====================================================================
  buildWeather() {
    const dropCount = 720;
    const positions = new Float32Array(dropCount * 6);
    this.rainGeo = new THREE.BufferGeometry();
    this.rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    for (let i = 0; i < dropCount; i++) {
      this.rainDrops.push({ x: (Math.random() - 0.5) * 34, y: Math.random() * 22, z: (Math.random() - 0.5) * 34, s: 0.7 + Math.random() * 0.8 });
    }
    this.rainMesh = new THREE.LineSegments(this.rainGeo, this.materials.rain);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.visible = false;
    this.scene.add(this.rainMesh);

    const snowCount = 900;
    const sp = new Float32Array(snowCount * 3);
    for (let i = 0; i < snowCount; i++) {
      sp[i * 3] = (Math.random() - 0.5) * 38;
      sp[i * 3 + 1] = Math.random() * 20;
      sp[i * 3 + 2] = (Math.random() - 0.5) * 38;
    }
    this.snowGeo = new THREE.BufferGeometry();
    this.snowGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.snowMesh = new THREE.Points(this.snowGeo, this.materials.snow);
    this.snowMesh.frustumCulled = false;
    this.snowMesh.visible = false;
    this.scene.add(this.snowMesh);

    const fogTex = makeRadialTexture('175,185,180', 0.4);
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: fogTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(16, 16).rotateX(-Math.PI / 2), mat);
      mesh.position.set((Math.random() - 0.5) * 34, 0.4 + Math.random() * 0.5, (Math.random() - 0.5) * 34);
      mesh.renderOrder = 3;
      this.scene.add(mesh);
      this.fogSprites.push({ mesh, x: mesh.position.x, z: mesh.position.z, vx: (Math.random() - 0.5) * 0.35, phase: Math.random() * TAU });
    }

    // Decalques de sangue no chão.
    this.bloodDecals = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.32, 10).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#4c1311', transparent: true, opacity: 0.5, depthWrite: false }),
      180
    );
    this.bloodDecals.count = 0;
    this.bloodDecals.renderOrder = 2;
    this.scene.add(this.bloodDecals);
    this.bloodCount = 0;
  }

  buildParticles() {
    const max = 700;
    this.particlePositions = new Float32Array(max * 3);
    this.particleColors = new Float32Array(max * 3);
    this.particleGeo = new THREE.BufferGeometry();
    this.particleGeo.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    this.particleGeo.setAttribute('color', new THREE.BufferAttribute(this.particleColors, 3));
    this.particleMat = new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, opacity: 0.92, depthWrite: false, sizeAttenuation: true });
    this.particlePoints = new THREE.Points(this.particleGeo, this.particleMat);
    this.particlePoints.frustumCulled = false;
    this.scene.add(this.particlePoints);

    this.floaterLayer = new THREE.Group();
    this.scene.add(this.floaterLayer);

    // Anéis de ruído.
    this.noiseRings = [];
    const ringMat = new THREE.MeshBasicMaterial({ color: '#e8dcc0', transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
    for (let i = 0; i < 14; i++) {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 40).rotateX(-Math.PI / 2), ringMat.clone());
      mesh.visible = false;
      mesh.renderOrder = 1;
      this.scene.add(mesh);
      this.noiseRings.push(mesh);
    }
  }

  buildMarkers() {
    // Fantasma de construção.
    this.buildGhost = new THREE.Mesh(
      new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#7ee08a', transparent: true, opacity: 0.32, depthWrite: false })
    );
    this.buildGhost.position.y = 0.06;
    this.buildGhost.visible = false;
    this.scene.add(this.buildGhost);
    this.buildGhostOutline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 0.1, 1)),
      new THREE.LineBasicMaterial({ color: '#9cf0a0', transparent: true, opacity: 0.8 })
    );
    this.buildGhostOutline.visible = false;
    this.scene.add(this.buildGhostOutline);

    // Anel de interação.
    this.interactRing = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.52, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#f1dc8c', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })
    );
    this.interactRing.visible = false;
    this.interactRing.renderOrder = 4;
    this.scene.add(this.interactRing);

    // Retículo de mira no chão.
    this.aimRing = new THREE.Mesh(
      new THREE.RingGeometry(0.08, 0.13, 20).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#f0ead0', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })
    );
    this.aimRing.visible = false;
    this.aimRing.renderOrder = 4;
    this.scene.add(this.aimRing);

    // Marcador de evento / objetivo no mundo.
    this.markerBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 3.2, 6).translate(0, 1.6, 0),
      new THREE.MeshBasicMaterial({ color: '#f0d97a', transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.markerBeam.visible = false;
    this.scene.add(this.markerBeam);
  }

  // =====================================================================
  //  PERSONAGENS
  // =====================================================================
  createHumanoid(opts = {}) {
    const skinMat = new THREE.MeshStandardMaterial({ color: opts.skin || '#b58a6b', roughness: 0.84 });
    const bodyMat = new THREE.MeshStandardMaterial({ color: opts.body || '#596b52', roughness: 0.9 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: opts.pants || '#383d34', roughness: 0.94 });
    const hairMat = new THREE.MeshStandardMaterial({ color: opts.hair || '#2b2620', roughness: 0.96 });
    const g = new THREE.Group();
    const hip = new THREE.Group();
    g.add(hip);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.7, 0.3), bodyMat);
    torso.position.y = 1.08; torso.castShadow = true; hip.add(torso);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.2, 0.32), bodyMat);
    chest.position.y = 1.38; chest.castShadow = true; hip.add(chest);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skinMat);
    head.position.y = 1.62; head.scale.set(0.92, 1.06, 0.92); head.castShadow = true; hip.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.225, 9, 6, 0, TAU, 0, Math.PI * 0.55), hairMat);
    hair.position.y = 1.66; hair.castShadow = true; hip.add(hair);

    const legGeo = new THREE.BoxGeometry(0.17, 0.64, 0.2).translate(0, -0.32, 0);
    const leftLeg = new THREE.Group(); leftLeg.position.set(-0.15, 0.72, 0);
    const rightLeg = new THREE.Group(); rightLeg.position.set(0.15, 0.72, 0);
    const ll = new THREE.Mesh(legGeo, pantsMat); ll.castShadow = true; leftLeg.add(ll);
    const rl = new THREE.Mesh(legGeo, pantsMat); rl.castShadow = true; rightLeg.add(rl);
    const bootGeo = new THREE.BoxGeometry(0.19, 0.13, 0.28);
    const bootMat = new THREE.MeshStandardMaterial({ color: '#25241f', roughness: 0.96 });
    const lb = new THREE.Mesh(bootGeo, bootMat); lb.position.set(0, -0.66, 0.04); lb.castShadow = true; leftLeg.add(lb);
    const rb = new THREE.Mesh(bootGeo, bootMat); rb.position.set(0, -0.66, 0.04); rb.castShadow = true; rightLeg.add(rb);
    hip.add(leftLeg, rightLeg);

    const armGeo = new THREE.BoxGeometry(0.14, 0.58, 0.16).translate(0, -0.29, 0);
    const leftArm = new THREE.Group(); leftArm.position.set(-0.33, 1.36, 0);
    const rightArm = new THREE.Group(); rightArm.position.set(0.33, 1.36, 0);
    const la = new THREE.Mesh(armGeo, bodyMat); la.castShadow = true; leftArm.add(la);
    const ra = new THREE.Mesh(armGeo, bodyMat); ra.castShadow = true; rightArm.add(ra);
    const handGeo = new THREE.SphereGeometry(0.075, 7, 5);
    const lh = new THREE.Mesh(handGeo, skinMat); lh.position.y = -0.6; leftArm.add(lh);
    const rh = new THREE.Mesh(handGeo, skinMat); rh.position.y = -0.6; rightArm.add(rh);
    hip.add(leftArm, rightArm);

    // Mochila e arma.
    if (opts.backpack) {
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.22), new THREE.MeshStandardMaterial({ color: '#4a4032', roughness: 0.96 }));
      pack.position.set(0, 1.1, -0.25); pack.castShadow = true; hip.add(pack);
    }
    let weapon = null;
    if (opts.weapon !== false) {
      weapon = new THREE.Group();
      const wtype = opts.weaponType || 'melee';
      if (wtype === 'gun') {
        const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.52), new THREE.MeshStandardMaterial({ color: '#2b2f31', roughness: 0.45, metalness: 0.75 }));
        barrel.position.set(0, 0, 0.18); weapon.add(barrel);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.08), new THREE.MeshStandardMaterial({ color: '#3b3024', roughness: 0.85 }));
        grip.position.set(0, -0.08, -0.02); weapon.add(grip);
      } else {
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.035, 0.72, 6), new THREE.MeshStandardMaterial({ color: '#80603a', roughness: 0.72, metalness: 0.2 }));
        shaft.rotation.x = Math.PI / 2;
        shaft.position.z = 0.26; weapon.add(shaft);
        const headW = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.22), new THREE.MeshStandardMaterial({ color: '#666a68', roughness: 0.45, metalness: 0.6 }));
        headW.position.z = 0.62; weapon.add(headW);
      }
      weapon.position.set(0, -0.55, 0.05);
      rightArm.add(weapon);
    }

    // Lanterna na mão esquerda.
    const flash = new THREE.Group();
    const flashBody = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.22, 8), new THREE.MeshStandardMaterial({ color: '#d0c89c', roughness: 0.45, metalness: 0.4 }));
    flashBody.rotation.x = Math.PI / 2; flashBody.position.z = 0.1; flash.add(flashBody);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.055, 10), new THREE.MeshBasicMaterial({ color: '#fff1be' }));
    lens.position.z = 0.215; flash.add(lens);
    flash.position.set(0, -0.58, 0.06);
    leftArm.add(flash);
    flash.visible = false;

    // Sombra de contato.
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 18).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.28, depthWrite: false })
    );
    shadow.position.y = 0.021;
    g.add(shadow);

    g.userData = {
      hip, torso, head, hair, leftLeg, rightLeg, leftArm, rightArm, weapon, flash, shadow,
      bodyMat, skinMat, pantsMat,
      baseBody: opts.body || '#596b52',
      flashTimer: 0, walkPhase: Math.random() * 10,
    };
    g.traverse(o => { if (o.isMesh && o !== shadow) o.castShadow = true; });
    g.rotation.order = 'YXZ';
    return g;
  }

  updateHumanoid(group, state, dt, time) {
    const u = group.userData;
    const moving = !!state.moving;
    const speed = state.speed || 0;
    u.walkPhase += dt * (moving ? 7 + Math.min(7, speed / 22) : 2.2);
    const sw = moving ? Math.sin(u.walkPhase) : 0;
    const sw2 = moving ? Math.sin(u.walkPhase + Math.PI) : 0;
    const swing = state.swing || 0;
    const downed = !!state.downed;
    const sneak = !!state.sneak;
    const zombie = !!state.zombie;
    const crawler = !!state.crawler;

    group.rotation.y = Math.PI / 2 - (state.angle || 0);
    if (downed) {
      group.rotation.x = -Math.PI / 2.15;
      group.position.y = 0.14;
    } else if (crawler) {
      group.rotation.x = -Math.PI / 2.35;
      group.position.y = 0.2;
    } else {
      group.rotation.x = 0;
      group.position.y = 0;
    }
    if (u.hip) u.hip.position.y = downed || crawler ? 0 : (sneak ? -0.2 : 0) + (moving ? Math.abs(Math.sin(u.walkPhase * 2)) * 0.025 : Math.sin(time * 1.6) * 0.008);

    u.leftLeg.rotation.x = crawler ? 0.2 : sw * (zombie ? 0.28 : 0.55) * (moving ? 1 : 0.12);
    u.rightLeg.rotation.x = crawler ? -0.2 : sw2 * (zombie ? 0.28 : 0.55) * (moving ? 1 : 0.12);
    u.leftArm.rotation.x = zombie ? (-0.95 + sw * 0.18) : (crawler ? -0.9 : sw2 * 0.5 * (moving ? 1 : 0.2));
    u.rightArm.rotation.x = zombie ? (-0.95 + sw2 * 0.18) : (crawler ? -0.9 : sw * 0.5 * (moving ? 1 : 0.2));
    u.leftArm.rotation.z = zombie ? 0.08 : sneak ? 0.2 : 0.06;
    u.rightArm.rotation.z = zombie ? -0.08 : sneak ? -0.2 : -0.06;
    if (swing > 0) {
      const p = 1 - swing;
      u.rightArm.rotation.x = -0.35 - Math.sin(p * Math.PI) * 1.8;
      u.rightArm.rotation.z = -0.25;
      u.hip.rotation.y = Math.sin(p * Math.PI) * -0.25;
    } else {
      u.hip.rotation.y = 0;
    }
    if (zombie) {
      u.torso.rotation.x = 0.12;
      u.head.rotation.z = Math.sin(time * 0.8 + u.walkPhase * 0.4) * 0.14;
      u.head.rotation.x = 0.12;
    } else {
      u.torso.rotation.x = sneak ? 0.25 : 0.03;
      u.head.rotation.z = 0;
      u.head.rotation.x = sneak ? 0.2 : 0;
    }
    if (state.flash !== undefined) u.flash.visible = !!state.flash && !downed;
    if (u.shadow) u.shadow.visible = !downed && !crawler;
  }

  // =====================================================================
  //  LOOP DE RENDERIZAÇÃO
  // =====================================================================
  resize() {
    if (!this.is3D) { this.fallback?.resize(); return; }
    const w = window.innerWidth, h = window.innerHeight;
    this.w = w; this.h = h;
    this.dpr = Math.min(window.innerWidth < 700 ? 1.2 : 1.6, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    const aspect = w / Math.max(1, h);
    const minWidth = w < 700 ? 10.5 : 16;
    const minHeight = w < 700 ? 13 : 13.5;
    const viewH = Math.max(minHeight, minWidth / aspect);
    const viewW = viewH * aspect;
    this.camera.left = -viewW / 2;
    this.camera.right = viewW / 2;
    this.camera.top = viewH / 2;
    this.camera.bottom = -viewH / 2;
    this.camera.updateProjectionMatrix();
    this.game.viewW = w; this.game.viewH = h;
    this.game.camera.zoom = 1;
    this.shadowSize = w < 700 ? 1024 : 2048;
    if (this.sun) {
      this.sun.shadow.mapSize.set(this.shadowSize, this.shadowSize);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
  }

  draw(dt) {
    if (this.fallback) { this.fallback.draw(dt); return; }
    const g = this.game;
    if (!g) return;
    this.time += dt;
    this.updateCamera(dt);
    this.updateWallCutaway();
    this.updateLighting(dt);
    this.updateWeather(dt);
    this.updateDoors();
    this.updateVehicles(dt);
    this.updatePlayerActor(dt);
    this.updateZombieActors(dt);
    this.updateNpcActors(dt);
    this.updateRemoteActors(dt);
    this.updateCorpses(dt);
    this.updateGroundItems();
    this.updateStructures(dt);
    this.updateBloodDecals();
    this.updateParticles();
    this.updateFloaters(dt);
    this.updateNoiseRings();
    this.updateMarkers();
    this.updateContainerStates();
    this.renderer.render(this.scene, this.camera);
  }

  updateCamera(dt) {
    const g = this.game;
    const p = g.player;
    const target = this.tempVec.set(wx(p.x), 0.8, wz(p.y));
    if (!this.cameraTargetInit) { this.cameraTarget.copy(target); this.cameraTargetInit = true; }
    const follow = 1 - Math.exp(-dt * 7.5);
    this.cameraTarget.lerp(target, follow);
    this.camera.position.set(
      this.cameraTarget.x + this.cameraOffset.x,
      this.cameraTarget.y + this.cameraOffset.y,
      this.cameraTarget.z + this.cameraOffset.z
    );
    this.camera.lookAt(this.cameraTarget.x, this.cameraTarget.y, this.cameraTarget.z);
    this.camera.updateMatrixWorld();
    this.game.camera.x = 0; this.game.camera.y = 0; this.game.camera.w = this.w; this.game.camera.h = this.h;
  }

  updateLighting(dt) {
    const g = this.game;
    const hour = g.time / 60;
    const sunHeight = Math.sin(((hour - 6) / 12) * Math.PI);
    const daylight = clamp01(sunHeight);
    const dusk = clamp01(1 - Math.abs(hour - 7) / 2.4) + clamp01(1 - Math.abs(hour - 18.2) / 2.4);
    const night = clamp01(1 - daylight * 1.45);
    const def = WEATHERS[g.weather] || WEATHERS.limpo;
    const overcast = def.vision < 0.95 ? 0.72 : 1;
    const target = this.cameraTarget;

    const sunAngle = (hour / 24) * TAU + Math.PI * 0.15;
    const elevation = Math.max(0.06, sunHeight);
    this.sun.position.set(
      target.x + Math.cos(sunAngle) * 30,
      target.y + elevation * 38 + 4,
      target.z + Math.sin(sunAngle) * 30
    );
    this.sun.target.position.copy(target);
    this.sun.target.updateMatrixWorld();
    this.sun.intensity = (0.12 + daylight * 3.15) * overcast;
    this.sun.color.setRGB(
      1,
      lerp(0.73, 0.97, daylight),
      lerp(0.53, 0.86, daylight)
    );

    this.moon.position.set(target.x - 22, 28, target.z - 16);
    this.moon.target.position.copy(target);
    this.moon.target.updateMatrixWorld();
    this.moon.intensity = night * 0.34 * overcast;

    const hemiSky = new THREE.Color('#aebfae').lerp(new THREE.Color('#26324a'), night);
    const hemiGround = new THREE.Color('#4a4837').lerp(new THREE.Color('#15171b'), night);
    this.hemi.color.copy(hemiSky);
    this.hemi.groundColor.copy(hemiGround);
    this.hemi.intensity = lerp(0.22, 1.28, daylight) * (overcast * 0.7 + 0.3);
    this.ambient.intensity = lerp(0.1, 0.5, daylight) * (overcast * 0.7 + 0.3);

    const fogDay = new THREE.Color(overcast < 0.85 ? '#7f8981' : '#91a18f');
    const fogNight = new THREE.Color('#111923');
    const fogColor = fogDay.clone().lerp(fogNight, night * 0.92);
    if (def.wet > 0) fogColor.lerp(new THREE.Color('#59666a'), 0.32);
    this.scene.fog.color.copy(fogColor);
    this.scene.background.copy(fogColor);
    const density = 0.0075 + (g.weather === 'neblina' ? 0.033 : g.weather === 'tempestade' ? 0.017 : g.weather === 'chuva' ? 0.012 : 0);
    this.scene.fog.density = density;

    // Relâmpago.
    if (g.flash > 0) {
      const f = clamp01(g.flash);
      this.hemi.intensity += f * 2.8;
      this.sun.intensity += f * 2.4;
      this.scene.background.lerp(new THREE.Color('#cdd5da'), f * 0.7);
    }

    // Lanterna e cone.
    const p = g.player;
    const fwd = this.tempVec2.set(Math.cos(p.angle), 0, Math.sin(p.angle));
    const fl = !!p.flashlight && !p.inVehicle && !p.downed && g.time > 0;
    this.flashlight.visible = fl;
    this.flashCone.visible = fl;
    if (fl) {
      const px = wx(p.x), pz = wz(p.y);
      this.flashlight.position.set(px, 1.35, pz);
      this.flashlightTarget.position.set(px + fwd.x * 8.5, 0.12, pz + fwd.z * 8.5);
      this.flashlightTarget.updateMatrixWorld();
      this.flashlight.intensity = 95;
      this.flashCone.position.set(px + fwd.x * 3.4, 0.85, pz + fwd.z * 3.4);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), fwd);
      this.flashCone.quaternion.copy(q);
    }
    this.playerFill.position.set(wx(p.x), 1.55, wz(p.y));
    this.playerFill.intensity = lerp(1.15, 0, daylight);

    // Fogueiras e veículos.
    const lightBudget = 6;
    let used = 0;
    for (const s of g.world.structures) {
      if (s.type !== 'fogueira' || used >= lightBudget) continue;
      if (dist(s.x * TILE + 16, s.y * TILE + 16, p.x, p.y) > 1100) continue;
      let entry = this.structurePool.get(s);
      if (!entry || !entry.light) continue;
      entry.light.intensity = 4.5 + Math.sin(this.time * 11 + s.x) * 1.1 + Math.sin(this.time * 23 + s.y) * 0.5;
      used++;
    }

    // Janelas: claridade interna durante o dia.
    const windowStrength = daylight * (0.08 + (1 - overcast) * 0.13);
    for (const patch of this.windowLights) patch.material.opacity = windowStrength;

    // Telhados somem suavemente quando o jogador entra no prédio.
    const pb = g.world.buildings.find(b => p.x / TILE >= b.x - 0.5 && p.x / TILE <= b.x + b.w + 0.5 && p.y / TILE >= b.y - 0.5 && p.y / TILE <= b.y + b.h + 0.5);
    for (const r of this.buildingRoofs) {
      const inside = pb && r.building.id === pb.id;
      const targetOpacity = inside ? 0.12 : 0.97;
      r.mat.opacity = lerp(r.mat.opacity, targetOpacity, Math.min(1, dt * 8));
      r.mat.depthWrite = r.mat.opacity > 0.4;
      if (r.group.children[0]) r.group.children[0].castShadow = !inside;
    }

    // Rótulos de prédios descobertos.
    for (const l of this.buildingLabels) {
      l.sprite.visible = !!l.building.discovered && dist((l.building.x + l.building.w / 2) * TILE, (l.building.y + l.building.h / 2) * TILE, p.x, p.y) < 1900;
    }
  }

  updateWeather(dt) {
    const g = this.game;
    const def = WEATHERS[g.weather] || WEATHERS.limpo;
    const winter = g.seasonIndex === 2;
    const wet = def.wet;
    const target = this.cameraTarget;

    // Chuva.
    const rainOn = wet > 0 && !winter;
    this.rainMesh.visible = rainOn;
    if (rainOn) {
      const arr = this.rainGeo.attributes.position.array;
      for (let i = 0; i < this.rainDrops.length; i++) {
        const d = this.rainDrops[i];
        d.y -= (11 + d.s * 9) * dt;
        if (d.y < 0) { d.y = 18 + Math.random() * 6; d.x = (Math.random() - 0.5) * 34; d.z = (Math.random() - 0.5) * 34; }
        const idx = i * 6;
        arr[idx] = d.x; arr[idx + 1] = d.y; arr[idx + 2] = d.z;
        arr[idx + 3] = d.x + 0.1; arr[idx + 4] = d.y - (0.5 + d.s * 0.55); arr[idx + 5] = d.z + 0.04;
      }
      this.rainGeo.attributes.position.needsUpdate = true;
      this.rainMesh.position.set(target.x, 0, target.z);
      this.materials.rain.opacity = 0.16 + wet * 0.38;
    }

    // Neve.
    this.snowMesh.visible = winter && wet > 0;
    if (this.snowMesh.visible) {
      const arr = this.snowGeo.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] -= (1.1 + (i % 7) * 0.12) * dt;
        arr[i] += Math.sin(this.time * 0.8 + i) * 0.08 * dt;
        if (arr[i + 1] < 0) { arr[i + 1] = 18 + Math.random() * 4; arr[i] = (Math.random() - 0.5) * 38; arr[i + 2] = (Math.random() - 0.5) * 38; }
      }
      this.snowGeo.attributes.position.needsUpdate = true;
      this.snowMesh.position.set(target.x, 0, target.z);
      this.materials.snow.opacity = 0.35 + wet * 0.5;
    }

    // Neblina baixa.
    const fogVisible = g.weather === 'neblina' || g.weather === 'tempestade' || g.weather === 'chuva';
    for (const f of this.fogSprites) {
      f.mesh.visible = fogVisible;
      if (!fogVisible) continue;
      f.x += f.vx * dt;
      if (f.x > 24) f.x = -24; if (f.x < -24) f.x = 24;
      f.mesh.position.set(target.x + f.x, 0.35 + Math.sin(this.time * 0.4 + f.phase) * 0.16, target.z + f.z);
      f.mesh.material.opacity = g.weather === 'neblina' ? 0.15 : g.weather === 'tempestade' ? 0.09 : 0.045;
      f.mesh.scale.setScalar(g.weather === 'neblina' ? 1.6 : 1.1);
    }

    // Poças e brilho molhado.
    this.puddles.material.opacity = 0.08 + wet * 0.55;
    this.puddles.visible = wet > 0.02;
    this.groundMat.roughness = lerp(0.93, 0.56, wet);
    this.groundMat.color.setScalar(lerp(0.95, 0.78, wet));
    this.materials.water.opacity = 0.82 + wet * 0.1;
  }

  updateDoors() {
    for (const d of this.game.world.doors.values()) {
      if (!d._pivot) continue;
      const target = d.open ? d._openSign * Math.PI * 0.52 : 0;
      d._pivot.rotation.y = lerp(d._pivot.rotation.y, target, 0.18);
    }
  }

  updateVehicles(dt) {
    for (const [id, entry] of this.vehiclePool) {
      const v = entry.vehicle;
      entry.group.position.set(wx(v.x), 0, wz(v.y));
      entry.group.rotation.y = Math.PI / 2 - v.angle;
      const on = !!(v.occupied && v.engineOn);
      entry.lightMat.emissiveIntensity = on ? 2.2 : 0.04;
      if (v.occupied && !this.playerGroup?.visible) {
        entry.group.visible = true;
      }
    }
  }

  ensurePlayerActor() {
    if (this.playerGroup) return;
    const g = this.game;
    const p = g.player;
    const bg = BACKGROUNDS[p.background] || BACKGROUNDS.estudante;
    const bodyColors = { mecanico: '#4b6173', enfermeira: '#627b74', cacador: '#4f6247', cozinheiro: '#7a6752', carpinteiro: '#77604a', policial: '#3f5266', estudante: '#3f607d' };
    const def = g.weaponStack ? ITEMS[g.weaponStack.id] : null;
    this.playerGroup = this.createHumanoid({
      body: bodyColors[p.background] || '#556b52', pants: '#3a4034', skin: '#c99a78',
      hair: '#2b2620', backpack: !!g.backpackStack, weaponType: def?.gun ? 'gun' : 'melee',
    });
    this.playerGroup.userData.weaponName = g.weaponStack?.id || '';
    this.playerGroup.userData.weapon.visible = !!g.weaponStack;
    this.scene.add(this.playerGroup);
    this.playerLabel = this.makeLabel(p.name, '#dfe8d3');
    this.playerLabel.position.set(0, 2.25, 0);
    this.playerGroup.add(this.playerLabel);
    this.playerLabel.visible = false;
    // Anel discreto sob o jogador para diferenciá-lo dos sobreviventes e zumbis.
    this.playerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.46, 0.56, 26).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#d8e6c8', transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide })
    );
    this.playerRing.visible = false;
    this.scene.add(this.playerRing);
  }

  updatePlayerActor(dt) {
    const g = this.game, p = g.player;
    this.ensurePlayerActor();
    const moving = !p.downed && !p.inVehicle && (g.input.up || g.input.down || g.input.left || g.input.right);
    const speed = p.sprinting ? 205 : 138;
    const group = this.playerGroup;
    group.visible = !p.inVehicle;
    group.position.set(wx(p.x), 0, wz(p.y));
    if (this.playerRing) {
      this.playerRing.visible = !p.inVehicle;
      this.playerRing.position.set(wx(p.x), 0.03, wz(p.y));
      const s = p.downed ? 0.7 : 1;
      this.playerRing.scale.set(s, 1, s);
    }
    this.updateHumanoid(group, {
      angle: p.angle, moving, speed, swing: p.swing, downed: p.downed,
      sneak: g.input.sneak, flash: p.flashlight,
    }, dt, this.time);
    const u = group.userData;
    u.bodyMat.color.set(p.wet > 55 ? '#4a5a5b' : (p.bleed > 30 ? '#64544f' : (u.baseBody || '#596b52')));
    if (p.hitFlash > 0 || p.lastHurt > 0) {
      u.bodyMat.emissive.setHex(0x5c1818);
      u.bodyMat.emissiveIntensity = 0.6;
    } else {
      u.bodyMat.emissiveIntensity = 0;
    }
    if (g.weaponStack?.id !== u.weaponName) {
      u.weaponName = g.weaponStack?.id || '';
      const def = g.weaponStack ? ITEMS[g.weaponStack.id] : null;
      if (u.weapon) u.weapon.visible = !!def;
      if (def?.gun && u.weapon) {
        u.weapon.clear();
        const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.52), new THREE.MeshStandardMaterial({ color: '#2b2f31', roughness: 0.45, metalness: 0.75 }));
        barrel.position.set(0, 0, 0.18); u.weapon.add(barrel);
      }
    }
    // Marcador de aliado para o jogador é opcional; mantém oculto em single.
    if (this.playerLabel) this.playerLabel.visible = false;
  }

  updateZombieActors(dt) {
    const g = this.game;
    const active = new Set();
    for (const z of g.zombies) {
      if (z.dead) continue;
      active.add(z);
      let group = this.zombiePool.get(z);
      if (!group) {
        const def = ZOMBIE_TYPES[z.type] || ZOMBIE_TYPES.comum;
        group = this.createHumanoid({
          body: def.color, skin: def.skin, pants: '#34382e', hair: '#211c18', weapon: false,
        });
        group.scale.setScalar(z.size || 1);
        this.scene.add(group);
        this.zombiePool.set(z, group);
      }
      const moving = z.state !== 'idle' || z.alert > 0;
      group.position.set(wx(z.x), 0, wz(z.y));
      const crawler = z.type === 'rastejante';
      this.updateHumanoid(group, {
        angle: z.angle, moving, speed: (z.speed || 30) * 4, swing: 0, downed: false,
        zombie: true, crawler, flash: false,
      }, dt, this.time);
      const u = group.userData;
      u.bodyMat.emissive.setHex(z.hitFlash > 0 ? 0x6b1111 : 0x000000);
      u.bodyMat.emissiveIntensity = z.hitFlash > 0 ? 0.9 : 0;
      // Braço erguido de ataque.
      if (z.attackCd > 0.45) {
        u.rightArm.rotation.x = -1.75;
        u.leftArm.rotation.x = -1.55;
      }
    }
    for (const [z, group] of this.zombiePool) {
      if (!active.has(z)) { this.disposeGroup(group); this.zombiePool.delete(z); }
    }
  }

  updateNpcActors(dt) {
    const g = this.game;
    const active = new Set();
    for (const n of g.npcs) {
      if (!n.alive) continue;
      active.add(n);
      let group = this.npcPool.get(n);
      if (!group) {
        const color = n.hostile ? '#7d3b2c' : n.trader ? '#4e5d71' : (n.name.charCodeAt(0) % 2 ? '#5b6250' : '#625b4e');
        group = this.createHumanoid({ body: color, skin: '#b98a6a', pants: '#3c3c33', weapon: true, backpack: n.trader });
        this.scene.add(group);
        const label = this.makeLabel(n.hostile ? 'SAQUEADOR' : n.name, n.hostile ? '#e8a28f' : '#d8e1c8');
        label.position.set(0, 2.25, 0);
        group.add(label);
        group.userData.label = label;
        this.npcPool.set(n, group);
      }
      group.position.set(wx(n.x), 0, wz(n.y));
      const moving = true;
      this.updateHumanoid(group, { angle: n.angle, moving, speed: 60, swing: 0, downed: !!n.downed, flash: false }, dt, this.time);
      if (group.userData.label) group.userData.label.visible = dist(n.x, n.y, g.player.x, g.player.y) < 900;
    }
    for (const [n, group] of this.npcPool) {
      if (!active.has(n)) { this.disposeGroup(group); this.npcPool.delete(n); }
    }
  }

  updateRemoteActors(dt) {
    const g = this.game;
    const active = new Set();
    for (const rp of g.remotePlayers.values()) {
      active.add(rp);
      let group = this.remotePool.get(rp);
      if (!group) {
        group = this.createHumanoid({ body: rp.color || '#4f6f78', skin: '#c99a78', pants: '#35403d', weapon: true, backpack: true });
        this.scene.add(group);
        const label = this.makeLabel(rp.name || 'Sobrevivente', '#cfe3dc');
        label.position.set(0, 2.25, 0);
        group.add(label);
        group.userData.label = label;
        this.remotePool.set(rp, group);
      }
      const x = rp.renderX ?? rp.x, y = rp.renderY ?? rp.y;
      group.position.set(wx(x), 0, wz(y));
      this.updateHumanoid(group, {
        angle: rp.angle || 0, moving: !!rp.moving, speed: 140, swing: 0, downed: !!rp.downed,
        flash: !!rp.flashlight,
      }, dt, this.time);
    }
    for (const [rp, group] of this.remotePool) {
      if (!active.has(rp)) { this.disposeGroup(group); this.remotePool.delete(rp); }
    }
  }

  updateCorpses(dt) {
    const g = this.game;
    const active = new Set(g.corpses);
    for (const c of g.corpses) {
      let group = this.corpsePool.get(c);
      if (!group) {
        group = new THREE.Group();
        const bodyMat = new THREE.MeshStandardMaterial({ color: c.type === 'npc' ? '#4b443c' : '#59634a', roughness: 0.96 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.46), bodyMat);
        body.position.y = 0.11; body.rotation.y = c.angle || 0; group.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 5), new THREE.MeshStandardMaterial({ color: c.type === 'npc' ? '#8a7564' : '#788465', roughness: 0.96 }));
        head.position.set(Math.cos(c.angle || 0) * 0.52, 0.17, Math.sin(c.angle || 0) * 0.52); group.add(head);
        const blood = new THREE.Mesh(new THREE.CircleGeometry(0.5, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#3f1110', transparent: true, opacity: 0.45, depthWrite: false }));
        blood.position.y = 0.015; blood.scale.set(1, 0.7, 1); group.add(blood);
        group.position.set(wx(c.x), 0, wz(c.y));
        this.scene.add(group);
        this.corpsePool.set(c, group);
      }
      const alpha = clamp01(1 - c.time / 120);
      group.traverse(o => { if (o.material) { o.material.transparent = true; o.material.opacity = alpha; } });
    }
    for (const [c, group] of this.corpsePool) {
      if (!active.has(c)) { this.disposeGroup(group); this.corpsePool.delete(c); }
    }
  }

  updateGroundItems() {
    const g = this.game;
    const active = new Set(g.groundItems);
    for (const gi of g.groundItems) {
      let mesh = this.groundPool.get(gi);
      if (!mesh) {
        const item = ITEMS[gi.stack.id] || {};
        const col = item.type === 'weapon' ? '#aab3b8' : item.type === 'med' ? '#c8d4c4' : '#c9b07a';
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 0.1, 0.18),
          new THREE.MeshStandardMaterial({ color: col, emissive: '#564622', emissiveIntensity: 0.6, roughness: 0.65 })
        );
        mesh.position.set(wx(gi.x), 0.08, wz(gi.y));
        this.scene.add(mesh);
        this.groundPool.set(gi, mesh);
      }
      mesh.position.y = 0.08 + Math.sin(this.time * 3 + gi.x) * 0.02;
      mesh.rotation.y = this.time * 0.8 + gi.x;
    }
    for (const [gi, mesh] of this.groundPool) {
      if (!active.has(gi)) { this.scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); this.groundPool.delete(gi); }
    }
  }

  updateStructures(dt) {
    const g = this.game;
    const active = new Set(g.world.structures);
    for (const s of g.world.structures) {
      let entry = this.structurePool.get(s);
      if (!entry) { entry = this.createStructure(s); if (!entry) continue; this.structurePool.set(s, entry); }
      if (entry.light) {
        entry.light.position.set(wx(s.x * TILE + 16), 1.1, wz(s.y * TILE + 16));
      }
      if (entry.fire) {
        entry.fire.rotation.y += dt * 2;
        const f = 1 + Math.sin(this.time * 13 + s.x) * 0.12;
        entry.fire.scale.set(f, 1 + Math.sin(this.time * 17 + s.y) * 0.18, f);
      }
    }
    for (const [s, entry] of this.structurePool) {
      if (!active.has(s)) {
        this.scene.remove(entry.group);
        // Materiais são compartilhados; descartar apenas geometrias.
        entry.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
        if (entry.light) this.scene.remove(entry.light);
        this.structurePool.delete(s);
      }
    }
  }

  createStructure(s) {
    const group = new THREE.Group();
    group.position.set(wx(s.x * TILE + 16), 0, wz(s.y * TILE + 16));
    let light = null, fire = null;
    if (s.type === 'fogueira') {
      const stoneMat = this.materials.rock;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.1, 0), stoneMat);
        rock.position.set(Math.cos(a) * 0.36, 0.08, Math.sin(a) * 0.36);
        rock.scale.set(1, 0.7, 1); group.add(rock);
      }
      const logMat = this.materials.trunk;
      for (let i = 0; i < 2; i++) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.58, 6), logMat);
        log.rotation.z = Math.PI / 2; log.rotation.y = i * Math.PI / 2; log.position.y = 0.1; group.add(log);
      }
      fire = new THREE.Group();
      const flame1 = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.72, 7), this.materials.fire);
      flame1.position.y = 0.42; fire.add(flame1);
      const flame2 = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.44, 6), new THREE.MeshBasicMaterial({ color: '#ffe58a', transparent: true, opacity: 0.85, depthWrite: false }));
      flame2.position.y = 0.52; fire.add(flame2);
      group.add(fire);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeRadialTexture('255,158,60', 0.42), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.set(5, 5, 1); glow.position.y = 0.7; group.add(glow);
      light = new THREE.PointLight('#ff9a45', 5, 9, 1.6);
      light.position.set(0, 1.1, 0);
      this.scene.add(light);
    } else if (s.type === 'caixa') {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.62, 0.62).translate(0, 0.31, 0), this.materials.wood);
      box.castShadow = true; group.add(box);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.64).translate(0, 0.64, 0), this.materials.woodDark);
      group.add(lid);
    } else if (s.type === 'canteiro') {
      const soil = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.16, 0.94).translate(0, 0.08, 0), new THREE.MeshStandardMaterial({ color: '#4a3b24', roughness: 0.98 }));
      group.add(soil);
      if (s.crop) {
        const pct = clamp01((s.growth || 0) / (s.crop === 'abobora' ? 4400 : 3600));
        for (let i = 0; i < 5; i++) {
          const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2 + pct * 0.45, 4), new THREE.MeshStandardMaterial({ color: s.ready ? '#9ca447' : '#5d7c37', roughness: 0.9 }));
          leaf.position.set(-0.3 + (i % 3) * 0.3, 0.2 + pct * 0.2, -0.2 + Math.floor(i / 3) * 0.35);
          group.add(leaf);
        }
      }
    } else if (s.type === 'coletor') {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.38, 0.92, 12).translate(0, 0.46, 0), new THREE.MeshStandardMaterial({ color: '#46555a', roughness: 0.7, metalness: 0.35 }));
      group.add(barrel);
      const water = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, clamp01((s.water || 0) / 3) * 0.5, 10), this.materials.water);
      water.position.y = 0.22; group.add(water);
    } else if (s.type === 'armadilha') {
      const mat = this.materials.woodDark;
      for (let i = 0; i < 6; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4, 4), mat);
        spike.position.set((Math.random() - 0.5) * 0.7, 0.2, (Math.random() - 0.5) * 0.7);
        spike.rotation.z = (Math.random() - 0.5) * 0.3;
        group.add(spike);
      }
    } else if (s.type === 'parede' || s.type === 'muro_metal' || s.type === 'cerca') {
      if (s.type === 'cerca') {
        const mat = this.materials.woodDark;
        for (let i = 0; i < 3; i++) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.05, 0.08), mat);
          post.position.set(-0.35 + i * 0.35, 0.52, 0); group.add(post);
        }
        for (const y of [0.35, 0.8]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.06, 0.06), mat);
          rail.position.y = y; group.add(rail);
        }
      } else {
        const mat = s.type === 'muro_metal' ? this.materials.metal : this.materials.woodDark;
        const wall = new THREE.Mesh(new THREE.BoxGeometry(0.96, 1.75, 0.18).translate(0, 0.875, 0), mat);
        wall.castShadow = true; group.add(wall);
      }
    } else if (s.portal) {
      // Barricada simples por cima da porta.
      const mat = this.materials.wood;
      for (let i = 0; i < 3; i++) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.18, 0.07), mat);
        plank.position.y = 0.35 + i * 0.42; plank.rotation.z = (i % 2 ? 1 : -1) * 0.035; group.add(plank);
      }
    }
    this.scene.add(group);
    return { group, light, fire };
  }

  updateBloodDecals() {
    const list = this.game.bloodDecals || [];
    this.bloodCount = list.length;
    const mtx = new THREE.Matrix4(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    const n = Math.min(list.length, 180);
    for (let i = 0; i < n; i++) {
      const d = list[i];
      const life = d.maxLife ? clamp01(d.life / d.maxLife) : 1;
      pos.set(wx(d.x), 0.022, wz(d.y));
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.angle || 0);
      const size = (d.r || 8) / 10 * (0.75 + life * 0.25);
      sc.set(size, 1, size * 0.75);
      mtx.compose(pos, q, sc);
      this.bloodDecals.setMatrixAt(i, mtx);
    }
    this.bloodDecals.count = n;
    this.bloodDecals.instanceMatrix.needsUpdate = true;
  }

  updateParticles() {
    const list = this.game.particles;
    const max = Math.min(list.length, 700);
    for (let i = 0; i < max; i++) {
      const p = list[i];
      const idx = i * 3;
      this.particlePositions[idx] = wx(p.x);
      this.particlePositions[idx + 1] = 0.12 + Math.max(0, p.size * 0.035) + (p.z || 0);
      this.particlePositions[idx + 2] = wz(p.y);
      const c = new THREE.Color(p.color || '#ffffff');
      this.particleColors[idx] = c.r; this.particleColors[idx + 1] = c.g; this.particleColors[idx + 2] = c.b;
    }
    this.particleGeo.setDrawRange(0, max);
    this.particleGeo.attributes.position.needsUpdate = true;
    this.particleGeo.attributes.color.needsUpdate = true;
  }

  updateFloaters(dt) {
    const active = new Set(this.game.floaters);
    for (const f of this.game.floaters) {
      let sprite = this.floaterPool.get(f);
      if (!sprite) {
        const tex = makeTextTexture(f.text, f.color || '#f1e8cf', 'rgba(0,0,0,0.45)');
        sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 1 }));
        sprite.scale.set(1.6, 0.4, 1);
        this.scene.add(sprite);
        this.floaterPool.set(f, sprite);
      }
      const a = clamp01(f.life / f.maxLife);
      sprite.position.set(wx(f.x), 1.9 + (1 - a) * 0.7, wz(f.y));
      sprite.material.opacity = a;
    }
    for (const [f, sprite] of this.floaterPool) {
      if (!active.has(f)) {
        this.scene.remove(sprite);
        sprite.material.map.dispose(); sprite.material.dispose();
        this.floaterPool.delete(f);
      }
    }
  }

  updateNoiseRings() {
    const rings = this.game.noiseRings || [];
    for (let i = 0; i < this.noiseRings.length; i++) {
      const mesh = this.noiseRings[i], r = rings[i];
      if (!r) { mesh.visible = false; continue; }
      mesh.visible = true;
      mesh.position.set(wx(r.x), 0.04, wz(r.y));
      const scale = Math.max(0.2, (r.r || 8) / TILE);
      mesh.scale.set(scale, 1, scale);
      mesh.material.opacity = clamp01(r.life / r.maxLife) * (r.kind === 'tiro' || r.kind === 'veiculo' ? 0.3 : 0.16);
      mesh.material.color.set(r.kind === 'tiro' || r.kind === 'veiculo' ? '#e29a72' : '#e8dcc0');
    }
  }

  updateMarkers() {
    const g = this.game;
    if (g.buildMode && g.selectedBuild) {
      const ghost = g.getBuildGhost();
      if (ghost) {
        const x = wx(ghost.tx * TILE + 16), z = wz(ghost.ty * TILE + 16);
        this.buildGhost.visible = true;
        this.buildGhostOutline.visible = true;
        this.buildGhost.position.set(x, 0.055, z);
        this.buildGhostOutline.position.set(x, 0.08, z);
        const col = ghost.valid ? '#7ee08a' : '#e86f60';
        this.buildGhost.material.color.set(col);
        this.buildGhostOutline.material.color.set(col);
      } else {
        this.buildGhost.visible = false;
        this.buildGhostOutline.visible = false;
      }
    } else {
      this.buildGhost.visible = false;
      this.buildGhostOutline.visible = false;
    }

    const it = g.getInteractable();
    if (it && it.ref) {
      let x, y;
      if (it.type === 'ground' || it.type === 'revive') { x = it.ref.x; y = it.ref.y; }
      else if (it.type === 'vehicle') { x = it.ref.x; y = it.ref.y; }
      else if (it.type === 'door' || it.type === 'window' || it.type === 'container' || it.type === 'structure') { x = it.ref.x * TILE + 16; y = it.ref.y * TILE + 16; }
      else if (it.type === 'bed' || it.type === 'note') { x = it.ref.x * TILE + 16; y = it.ref.y * TILE + 16; }
      if (x !== undefined) {
        this.interactRing.visible = true;
        this.interactRing.position.set(wx(x), 0.06, wz(y));
        const s = 0.95 + Math.sin(this.time * 4) * 0.08;
        this.interactRing.scale.set(s, 1, s);
        this.interactRing.material.opacity = 0.55 + Math.sin(this.time * 4) * 0.25;
      } else this.interactRing.visible = false;
    } else this.interactRing.visible = false;

    if (g.aim?.active && g.input.pointerActive) {
      this.aimRing.visible = true;
      this.aimRing.position.set(wx(g.aim.x), 0.045, wz(g.aim.y));
    } else this.aimRing.visible = false;
    if (g.ui?.marker && g.ui.marker.until > g.time) {
      this.markerBeam.visible = true;
      this.markerBeam.position.set(wx(g.ui.marker.x), 0.02, wz(g.ui.marker.y));
      this.markerBeam.material.opacity = 0.25 + Math.sin(this.time * 3) * 0.1;
    } else this.markerBeam.visible = false;
  }

  updateContainerStates() {
    // Atualiza a cor dos móveis saqueados sem recriar a cena.
    const dark = new THREE.Color('#77776f');
    const light = new THREE.Color('#ffffff');
    for (const c of this.game.world.containers) {
      if (!c._mesh || c._index === undefined) continue;
      if (c._lastSearched === c.searched) continue;
      c._lastSearched = c.searched;
      c._mesh.setColorAt(c._index, c.searched ? dark : light);
      if (c._mesh.instanceColor) c._mesh.instanceColor.needsUpdate = true;
    }
  }

  makeLabel(text, colorCss) {
    const tex = makeTextTexture(text, colorCss, 'rgba(8,11,8,0.68)');
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.set(1.65, 0.41, 1);
    return sprite;
  }

  disposeGroup(group) {
    this.scene.remove(group);
    group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
  }

  screenToWorld(sx, sy) {
    if (!this.is3D) return { x: this.game.player.x, y: this.game.player.y };
    this.pointerNdc.set((sx / Math.max(1, this.w)) * 2 - 1, -(sy / Math.max(1, this.h)) * 2 + 1);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, hit)) {
      return { x: simX(hit.x), y: simY(hit.z) };
    }
    return { x: this.game.player.x, y: this.game.player.y };
  }

  // =====================================================================
  //  MINIMAPA / MAPA
  // =====================================================================
  buildMinimapBase() {
    const w = this.game.world.w, h = this.game.world.h;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const t = this.game.world.tile(x, y);
      const col = MINIMAP_COLORS[t] || '#333';
      const n = parseInt(col.slice(1), 16);
      const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      const i = (y * w + x) * 4;
      const v = 0.82 + hash2(x, y, 7) * 0.36;
      img.data[i] = clamp(rgb[0] * v, 0, 255);
      img.data[i + 1] = clamp(rgb[1] * v, 0, 255);
      img.data[i + 2] = clamp(rgb[2] * v, 0, 255);
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = '#8b8a7a'; ctx.lineWidth = 0.8;
    for (const b of this.game.world.buildings) ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    this.minimapBase = c;
    this.minimapFog = document.createElement('canvas'); this.minimapFog.width = w; this.minimapFog.height = h;
    this.minimapFogCtx = this.minimapFog.getContext('2d');
    this.lastFogUpdate = 0;
  }

  updateMinimapFog() {
    const now = performance.now();
    if (now - this.lastFogUpdate < 750) return;
    this.lastFogUpdate = now;
    const w = this.game.world.w, h = this.game.world.h;
    const img = this.minimapFogCtx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const explored = this.game.world.explored[i];
      img.data[i * 4] = 5; img.data[i * 4 + 1] = 8; img.data[i * 4 + 2] = 7;
      img.data[i * 4 + 3] = explored ? 0 : 238;
    }
    this.minimapFogCtx.putImageData(img, 0, 0);
  }

  drawMinimap(canvas) {
    if (this.fallback) { this.fallback.drawMinimap(canvas); return; }
    if (!canvas || !this.minimapBase) return;
    this.updateMinimapFog();
    const g = this.game, w = g.world.w, h = g.world.h;
    const size = Math.min(canvas.width, canvas.height);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const scale = size / Math.max(w, h);
    const ox = (canvas.width - w * scale) / 2, oy = (canvas.height - h * scale) / 2;
    ctx.drawImage(this.minimapBase, ox, oy, w * scale, h * scale);
    ctx.drawImage(this.minimapFog, ox, oy, w * scale, h * scale);
    const px = (x) => ox + (x / TILE) * scale;
    const py = (y) => oy + (y / TILE) * scale;
    for (const b of g.world.buildings) {
      if (!b.discovered) continue;
      ctx.fillStyle = 'rgba(185,175,145,0.25)';
      ctx.fillRect(px(b.x * TILE), py(b.y * TILE), b.w * scale, b.h * scale);
      ctx.strokeStyle = 'rgba(200,190,160,0.35)'; ctx.lineWidth = 0.7;
      ctx.strokeRect(px(b.x * TILE), py(b.y * TILE), b.w * scale, b.h * scale);
    }
    for (const z of g.zombies) {
      if (dist(z.x, z.y, g.player.x, g.player.y) > 650) continue;
      if (!g.world.explored[Math.floor(z.y / TILE) * w + Math.floor(z.x / TILE)]) continue;
      ctx.fillStyle = '#b5433c';
      ctx.beginPath(); ctx.arc(px(z.x), py(z.y), 1.5, 0, TAU); ctx.fill();
    }
    for (const n of g.npcs) {
      if (!n.alive || dist(n.x, n.y, g.player.x, g.player.y) > 800) continue;
      ctx.fillStyle = n.hostile ? '#e0714d' : '#d9c56a';
      ctx.beginPath(); ctx.arc(px(n.x), py(n.y), 1.8, 0, TAU); ctx.fill();
    }
    for (const rp of g.remotePlayers.values()) {
      ctx.fillStyle = '#6cd7c4';
      ctx.beginPath(); ctx.arc(px(rp.x), py(rp.y), 2.2, 0, TAU); ctx.fill();
    }
    if (g.ui?.marker && g.ui.marker.until > g.time) {
      ctx.fillStyle = '#e8d27a';
      ctx.beginPath(); ctx.arc(px(g.ui.marker.x), py(g.ui.marker.y), 2.5, 0, TAU); ctx.fill();
    }
    ctx.save();
    ctx.translate(px(g.player.x), py(g.player.y));
    ctx.rotate(g.player.angle);
    ctx.fillStyle = '#f1f0dc';
    ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(-3, 3); ctx.lineTo(-3, -3); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(180,190,160,0.25)'; ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
    ctx.restore();
  }

  drawFullMap(canvas) {
    if (this.fallback) { this.fallback.drawFullMap(canvas); return; }
    if (!canvas || !this.minimapBase) return;
    this.updateMinimapFog();
    const g = this.game, w = g.world.w, h = g.world.h;
    const ctx = canvas.getContext('2d');
    const cw = canvas.width, ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#0c100d'; ctx.fillRect(0, 0, cw, ch);
    const scale = Math.min(cw / w, ch / h) * 0.94;
    const ox = (cw - w * scale) / 2, oy = (ch - h * scale) / 2;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.minimapBase, ox, oy, w * scale, h * scale);
    ctx.drawImage(this.minimapFog, ox, oy, w * scale, h * scale);
    ctx.imageSmoothingEnabled = true;
    const px = (x) => ox + (x / TILE) * scale;
    const py = (y) => oy + (y / TILE) * scale;
    ctx.strokeStyle = 'rgba(150,160,130,0.06)'; ctx.lineWidth = 1;
    for (let i = 0; i < w; i += 10) {
      ctx.beginPath(); ctx.moveTo(px(i * TILE), oy); ctx.lineTo(px(i * TILE), oy + h * scale); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox, py(i * TILE)); ctx.lineTo(ox + w * scale, py(i * TILE)); ctx.stroke();
    }
    for (const b of g.world.buildings) {
      if (!b.discovered) continue;
      ctx.strokeStyle = b.key ? 'rgba(230,210,150,0.85)' : 'rgba(180,175,150,0.4)';
      ctx.lineWidth = b.key ? 1.6 : 1;
      ctx.strokeRect(px(b.x * TILE), py(b.y * TILE), b.w * scale, b.h * scale);
      if (b.key) {
        ctx.fillStyle = 'rgba(240,230,190,0.95)';
        ctx.font = '600 10px system-ui'; ctx.textAlign = 'center';
        const label = b.name.length > 26 ? b.name.slice(0, 24) + '…' : b.name;
        ctx.fillText(label, px((b.x + b.w / 2) * TILE), py((b.y + b.h / 2) * TILE) - 2);
      }
    }
    if (g.ui?.marker && g.ui.marker.until > g.time) {
      const m = g.ui.marker;
      ctx.fillStyle = '#f0d97a'; ctx.beginPath(); ctx.arc(px(m.x), py(m.y), 4, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(240,225,160,0.95)'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(m.label, px(m.x), py(m.y) - 8);
    }
    ctx.save();
    ctx.translate(px(g.player.x), py(g.player.y));
    ctx.rotate(g.player.angle);
    ctx.fillStyle = '#fffbe0';
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, 5); ctx.lineTo(-5, -5); ctx.closePath(); ctx.fill();
    ctx.restore();
    const lx = ox + 12, ly = oy + 16;
    ctx.textAlign = 'left';
    ctx.font = '11px system-ui';
    const legend = [
      ['#f0e2b0', 'Você'], ['#b5433c', 'Zumbis (minimapa)'], ['#d9c56a', 'Sobreviventes'], ['#6cd7c4', 'Aliados'],
    ];
    ctx.fillStyle = 'rgba(8,11,8,0.7)'; ctx.fillRect(lx - 6, ly - 12, 190, 18 * legend.length + 8);
    legend.forEach(([c, t], i) => {
      ctx.fillStyle = c; ctx.fillRect(lx, ly + i * 18 - 6, 6, 6);
      ctx.fillStyle = '#ddd8c5'; ctx.fillText(t, lx + 12, ly + i * 18);
    });
    ctx.strokeStyle = 'rgba(180,190,160,0.3)'; ctx.strokeRect(ox, oy, w * scale, h * scale);
  }
}




