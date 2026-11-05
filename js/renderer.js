import { clamp, lerp, dist, hash2, TAU, formatClock, isNight } from './util.js';
import { ITEMS, BUILDABLES, ZOMBIE_TYPES, SEASONS, WEATHERS } from './data.js';
import { TILE, T, MINIMAP_COLORS } from './world.js';
import { audio } from './audio.js';

const TILE_COLORS = {
  [T.GRASS]: '#3b4a2c', [T.FOREST]: '#263820', [T.DIRT]: '#584734', [T.ROAD]: '#333532',
  [T.SIDEWALK]: '#5c5c53', [T.WATER]: '#1c3b46', [T.FARM]: '#4b4427', [T.WOOD]: '#4a3827',
  [T.TILE]: '#4d5049', [T.CONCRETE]: '#454741', [T.RUBBLE]: '#46433b', [T.SAND]: '#776747',
  [T.GRAVEL]: '#4a4944', [T.TALLGRASS]: '#44542f',
};

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.game = game;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.time = 0;
    this.camera = game.camera;
    this.rain = [];
    this.fogBlobs = [];
    this.lightCanvas = document.createElement('canvas');
    this.lightCtx = this.lightCanvas.getContext('2d');
    this.minimapBase = null;
    this.minimapFog = null;
    this.minimapCache = null;
    this.mapCache = null;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.initWeather();
    this.buildMinimapBase();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.w = w; this.h = h;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.zoom = w < 700 ? 0.82 : w < 1000 ? 0.92 : 1;
    this.game.viewW = w; this.game.viewH = h;
    this.game.camera.zoom = this.zoom;
    this.lightCanvas.width = Math.ceil(w / 2);
    this.lightCanvas.height = Math.ceil(h / 2);
  }

  initWeather() {
    this.rain = [];
    for (let i = 0; i < 260; i++) {
      this.rain.push({ x: Math.random() * this.w, y: Math.random() * this.h, s: 0.5 + Math.random(), len: 8 + Math.random() * 16 });
    }
    this.fogBlobs = [];
    for (let i = 0; i < 12; i++) this.fogBlobs.push({ x: Math.random() * this.w, y: Math.random() * this.h, r: 120 + Math.random() * 260, a: 0.02 + Math.random() * 0.03, vx: (Math.random() - 0.5) * 8 });
  }

  buildMinimapBase() {
    const w = this.game.world.w, h = this.game.world.h;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const t = this.game.world.tile(x, y);
      const col = MINIMAP_COLORS[t] || '#333';
      const rgb = this.hexToRgb(col);
      const i = (y * w + x) * 4;
      const v = 0.82 + hash2(x, y, 7) * 0.36;
      img.data[i] = clamp(rgb[0] * v, 0, 255);
      img.data[i + 1] = clamp(rgb[1] * v, 0, 255);
      img.data[i + 2] = clamp(rgb[2] * v, 0, 255);
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // contornos de prédios descobertos
    for (const b of this.game.world.buildings) {
      ctx.strokeStyle = '#8b8a7a'; ctx.lineWidth = 0.8;
      ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    }
    this.minimapBase = c;
    this.minimapFog = document.createElement('canvas'); this.minimapFog.width = w; this.minimapFog.height = h;
    this.minimapFogCtx = this.minimapFog.getContext('2d');
    this.lastFogUpdate = 0;
  }

  hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  draw(dt) {
    if (!this.game) return;
    this.time += dt;
    const g = this.game;
    const p = g.player;
    const targetX = p.x, targetY = p.y;
    const vw = this.w / this.zoom, vh = this.h / this.zoom;
    // câmera suave
    const desiredX = clamp(targetX - vw / 2, 0, g.world.w * TILE - vw);
    const desiredY = clamp(targetY - vh / 2, 0, g.world.h * TILE - vh);
    this.camera.x = lerp(this.camera.x || desiredX, desiredX, Math.min(1, dt * 7));
    this.camera.y = lerp(this.camera.y || desiredY, desiredY, Math.min(1, dt * 7));
    if (Math.abs(this.camera.x - desiredX) < 0.5) this.camera.x = desiredX;
    if (Math.abs(this.camera.y - desiredY) < 0.5) this.camera.y = desiredY;
    this.camera.w = vw; this.camera.h = vh;
    this.camera.zoom = this.zoom;

    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#0b0e0b';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.save();
    const shake = g.shake || 0;
    const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-Math.floor(this.camera.x + sx), -Math.floor(this.camera.y + sy));

    const minX = Math.max(0, Math.floor(this.camera.x / TILE) - 1);
    const maxX = Math.min(g.world.w - 1, Math.ceil((this.camera.x + vw) / TILE) + 1);
    const minY = Math.max(0, Math.floor(this.camera.y / TILE) - 1);
    const maxY = Math.min(g.world.h - 1, Math.ceil((this.camera.y + vh) / TILE) + 1);

    this.drawTiles(ctx, minX, maxX, minY, maxY);
    this.drawBlood(ctx, minX, maxX, minY, maxY);
    this.drawDecor(ctx, minX, maxX, minY, maxY);
    this.drawStructures(ctx, minX, maxX, minY, maxY);
    this.drawContainers(ctx, minX, maxX, minY, maxY);
    this.drawBedsNotes(ctx, minX, maxX, minY, maxY);
    this.drawGroundItems(ctx, minX, maxX, minY, maxY);
    this.drawVehicles(ctx, minX, maxX, minY, maxY);
    this.drawCorpses(ctx, minX, maxX, minY, maxY);
    this.drawNoiseRings(ctx);
    this.drawNPCs(ctx, minX, maxX, minY, maxY);
    this.drawZombies(ctx, minX, maxX, minY, maxY);
    this.drawRemote(ctx);
    this.drawPlayer(ctx);
    this.drawTreeCanopies(ctx, minX, maxX, minY, maxY);
    this.drawParticles(ctx);
    this.drawFloaters(ctx);
    this.drawBuildGhost(ctx);
    this.drawInteraction(ctx);
    ctx.restore();

    this.drawWeather(ctx, dt);
    this.drawLighting(ctx);
    this.drawAim(ctx);
    this.drawVignette(ctx);
    if (g.hurtFlash > 0) {
      ctx.fillStyle = `rgba(130,10,10,${g.hurtFlash * 0.22})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    if (g.buildMode) this.drawBuildHint(ctx);
  }

  // ================= TERRENO =================
  drawTiles(ctx, minX, maxX, minY, maxY) {
    const g = this.game, w = g.world;
    const t = this.time;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const tile = w.tile(x, y);
        const px = x * TILE, py = y * TILE;
        const h = hash2(x, y, 11);
        let color = TILE_COLORS[tile] || '#333';
        if (tile === T.GRASS) color = h > 0.55 ? '#3f4f2f' : '#374428';
        else if (tile === T.FOREST) color = h > 0.5 ? '#283b21' : '#22331d';
        else if (tile === T.ROAD) color = '#343633';
        else if (tile === T.SIDEWALK) color = '#5a5a50';
        else if (tile === T.WOOD) color = h > 0.6 ? '#4d3b29' : '#463424';
        else if (tile === T.TILE) color = ((x + y) % 2 === 0) ? '#4c4f48' : '#494c45';
        else if (tile === T.CONCRETE) color = '#43453f';
        else if (tile === T.FARM) color = h > 0.5 ? '#4b4427' : '#443e22';
        else if (tile === T.WATER) color = '#183842';
        else if (tile === T.DIRT) color = h > 0.5 ? '#594834' : '#51412e';
        else if (tile === T.TALLGRASS) color = h > 0.5 ? '#46572f' : '#3d4c29';
        ctx.fillStyle = color;
        ctx.fillRect(px, py, TILE, TILE);

        if (tile === T.GRASS || tile === T.TALLGRASS || tile === T.FOREST) {
          if (h > 0.72) {
            ctx.strokeStyle = tile === T.TALLGRASS ? 'rgba(150,170,90,0.28)' : 'rgba(120,140,80,0.18)';
            ctx.lineWidth = 1;
            for (let i = 0; i < 3; i++) {
              const gx = px + 5 + ((h * 100 + i * 9) % 22), gy = py + 10 + ((h * 70 + i * 7) % 18);
              ctx.beginPath(); ctx.moveTo(gx, gy + 5); ctx.lineTo(gx + (i - 1) * 2, gy); ctx.stroke();
            }
          }
          if (tile === T.FOREST && h > 0.9) {
            ctx.fillStyle = 'rgba(40,30,18,0.5)';
            ctx.beginPath(); ctx.ellipse(px + 16, py + 20, 8, 5, 0, 0, TAU); ctx.fill();
          }
        } else if (tile === T.ROAD) {
          ctx.strokeStyle = 'rgba(20,20,19,0.35)'; ctx.lineWidth = 1;
          if (h > 0.62) {
            ctx.beginPath();
            ctx.moveTo(px + 4, py + (h * 30));
            ctx.lineTo(px + 13 + (h * 8), py + 22);
            ctx.stroke();
          }
          // faixas amarelas nas vias centrais
          if (w.tile(x, y - 1) === T.ROAD && w.tile(x, y + 1) === T.ROAD && x % 6 === 0) {
            ctx.fillStyle = 'rgba(190,160,60,0.3)';
            ctx.fillRect(px + 12, py - 8, 8, 16);
          }
        } else if (tile === T.SIDEWALK) {
          ctx.strokeStyle = 'rgba(30,30,26,0.28)'; ctx.lineWidth = 1;
          ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
          if (h > 0.82) {
            ctx.strokeStyle = 'rgba(25,25,22,0.4)';
            ctx.beginPath(); ctx.moveTo(px + 5, py + 5); ctx.lineTo(px + 13, py + 12); ctx.lineTo(px + 10, py + 18); ctx.stroke();
          }
        } else if (tile === T.WOOD) {
          ctx.strokeStyle = 'rgba(30,22,14,0.35)'; ctx.lineWidth = 1;
          for (let i = 0; i < 3; i++) {
            const yy = py + 5 + i * 11;
            ctx.beginPath(); ctx.moveTo(px, yy); ctx.lineTo(px + TILE, yy); ctx.stroke();
          }
        } else if (tile === T.TILE) {
          ctx.strokeStyle = 'rgba(25,28,24,0.3)';
          ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
        } else if (tile === T.WATER) {
          const wave = Math.sin(t * 1.4 + x * 0.6 + y * 0.3) * 4;
          ctx.strokeStyle = 'rgba(120,180,190,0.16)'; ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(px + 4, py + 12 + wave);
          ctx.quadraticCurveTo(px + 12, py + 8 + wave, px + 20, py + 12 + wave);
          ctx.quadraticCurveTo(px + 26, py + 15 + wave, px + 30, py + 11 + wave);
          ctx.stroke();
        } else if (tile === T.FARM) {
          ctx.strokeStyle = 'rgba(25,30,15,0.28)';
          ctx.beginPath(); ctx.moveTo(px + 4, py + 26); ctx.lineTo(px + 28, py + 26); ctx.stroke();
          if (h > 0.6) {
            ctx.fillStyle = 'rgba(110,140,60,0.55)';
            ctx.fillRect(px + 8, py + 12, 3, 6);
            ctx.fillRect(px + 20, py + 17, 3, 6);
          }
        } else if (tile === T.WALL) {
          this.drawWall(ctx, x, y, px, py);
        } else if (tile === T.DOOR) {
          this.drawDoor(ctx, w, x, y, px, py, h);
        } else if (tile === T.WINDOW) {
          this.drawWindow(ctx, w, x, y, px, py);
        }
      }
    }
  }

  drawWall(ctx, x, y, px, py) {
    const w = this.game.world;
    const north = w.tile(x, y - 1) === T.WALL;
    const south = w.tile(x, y + 1) === T.WALL;
    const west = w.tile(x - 1, y) === T.WALL;
    const east = w.tile(x + 1, y) === T.WALL;
    const h = hash2(x, y, 3);
    ctx.fillStyle = '#574a3a';
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = h > 0.5 ? '#4a3f31' : '#443a2d';
    ctx.fillRect(px + 1, py + 3, TILE - 2, TILE - 6);
    ctx.fillStyle = 'rgba(160,135,100,0.22)';
    if (!north) ctx.fillRect(px, py, TILE, 3);
    if (!west) ctx.fillRect(px, py + 3, 2, TILE - 6);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    if (!south) ctx.fillRect(px, py + TILE - 3, TILE, 3);
    if (!east) ctx.fillRect(px + TILE - 2, py + 3, 2, TILE - 6);
    // tijolos
    ctx.strokeStyle = 'rgba(20,15,10,0.22)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px + 2, py + 16); ctx.lineTo(px + 30, py + 16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px + 16, py + 4); ctx.lineTo(px + 16, py + 16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px + 8, py + 16); ctx.lineTo(px + 8, py + 29); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px + 24, py + 16); ctx.lineTo(px + 24, py + 29); ctx.stroke();
  }

  drawDoor(ctx, w, x, y, px, py, h) {
    const d = w.doorAt(x, y);
    const open = d?.open;
    const barricade = w.portalStructures.get(x + ',' + y);
    // moldura
    ctx.fillStyle = '#2e261c';
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = '#6a4c2c';
    if (open) {
      ctx.fillRect(px + 2, py + 2, 6, TILE - 4);
      ctx.fillStyle = 'rgba(20,14,8,0.45)';
      ctx.fillRect(px + 8, py + 3, TILE - 10, TILE - 6);
      // folha aberta
      ctx.fillStyle = '#7a5732';
      ctx.fillRect(px + 2, py + 2, 5, TILE - 4);
    } else {
      ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(px + 2, py + 2, TILE - 4, 4);
      ctx.fillStyle = '#c9b26a';
      ctx.beginPath(); ctx.arc(px + 24, py + 17, 2, 0, TAU); ctx.fill();
      if (d?.broken) {
        ctx.strokeStyle = 'rgba(15,10,6,0.7)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px + 6, py + 4); ctx.lineTo(px + 18, py + 16); ctx.lineTo(px + 12, py + 28); ctx.stroke();
      }
    }
    if (barricade) {
      ctx.save();
      ctx.strokeStyle = barricade.type === 'reforco_metal' ? '#9aa3a8' : '#8a6a3d';
      ctx.lineWidth = 4;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(px + 2, py + 6 + i * 10); ctx.lineTo(px + 30, py + 9 + i * 9); ctx.stroke();
      }
      ctx.strokeStyle = barricade.type === 'reforco_metal' ? '#6f777c' : '#5f492d';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(px + 6 + i * 8, py + 2); ctx.lineTo(px + 9 + i * 8, py + 30); ctx.stroke();
      }
      ctx.restore();
      if (barricade.hp < barricade.maxHp) this.drawHPBar(ctx, px + 4, py - 5, 24, barricade.hp / barricade.maxHp);
    }
  }

  drawWindow(ctx, w, x, y, px, py) {
    const win = w.windowAt(x, y);
    const broken = win?.broken;
    const barricade = w.portalStructures.get(x + ',' + y);
    ctx.fillStyle = '#2f2b22';
    ctx.fillRect(px, py, TILE, TILE);
    if (!broken) {
      ctx.fillStyle = '#52747c';
      ctx.fillRect(px + 3, py + 3, TILE - 6, TILE - 6);
      ctx.fillStyle = 'rgba(160,210,220,0.22)';
      ctx.fillRect(px + 4, py + 4, TILE - 8, 6);
      ctx.strokeStyle = '#38342b'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px + 16, py + 3); ctx.lineTo(px + 16, py + 29); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px + 3, py + 16); ctx.lineTo(px + 29, py + 16); ctx.stroke();
    } else {
      ctx.fillStyle = '#1b1a16';
      ctx.fillRect(px + 3, py + 3, TILE - 6, TILE - 6);
      ctx.fillStyle = 'rgba(120,170,180,0.5)';
      for (let i = 0; i < 5; i++) {
        const h = hash2(x, y + i, 9);
        ctx.beginPath();
        ctx.moveTo(px + 4 + h * 8, py + 5 + i * 5);
        ctx.lineTo(px + 20 + h * 8, py + 7 + i * 4);
        ctx.lineTo(px + 12 + h * 10, py + 9 + i * 5);
        ctx.fill();
      }
      ctx.strokeStyle = '#3a352b'; ctx.lineWidth = 2;
      ctx.strokeRect(px + 3, py + 3, TILE - 6, TILE - 6);
    }
    if (barricade) {
      ctx.strokeStyle = barricade.type === 'reforco_metal' ? '#9aa3a8' : '#8a6a3d';
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(px + 2, py + 5 + i * 10); ctx.lineTo(px + 30, py + 8 + i * 9); ctx.stroke();
      }
      if (barricade.hp < barricade.maxHp) this.drawHPBar(ctx, px + 4, py - 5, 24, barricade.hp / barricade.maxHp);
    }
  }

  drawHPBar(ctx, x, y, w, pct) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x, y, w, 3);
    ctx.fillStyle = pct > 0.55 ? '#8fbf5f' : pct > 0.25 ? '#d8b04b' : '#c7563f';
    ctx.fillRect(x, y, w * clamp(pct, 0, 1), 3);
  }

  // ================= DECORAÇÃO =================
  drawBlood(ctx, minX, maxX, minY, maxY) {
    for (const b of this.game.bloodDecals) {
      const tx = b.x / TILE, ty = b.y / TILE;
      if (tx < minX - 1 || tx > maxX + 1 || ty < minY - 1 || ty > maxY + 1) continue;
      ctx.save();
      ctx.globalAlpha = b.alpha;
      ctx.fillStyle = '#4a0f0e';
      ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r, b.r * 0.6, b.angle, 0, TAU); ctx.fill();
      ctx.fillStyle = '#6b1412';
      ctx.beginPath(); ctx.ellipse(b.x - 3, b.y - 2, b.r * 0.55, b.r * 0.35, b.angle + 1, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  drawDecor(ctx, minX, maxX, minY, maxY) {
    const g = this.game;
    for (const d of g.world.decor) {
      if (d.x < minX - 1 || d.x > maxX + 1 || d.y < minY - 1 || d.y > maxY + 1) continue;
      const px = d.x * TILE + 16, py = d.y * TILE + 16;
      ctx.save();
      ctx.translate(px, py);
      if (d.rot) ctx.rotate(d.rot * Math.PI / 2);
      if (d.type === 'table') {
        ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(-13, -9, 28, 22);
        ctx.fillStyle = '#6b5237'; ctx.fillRect(-14, -11, 28, 20);
        ctx.strokeStyle = '#4b3825'; ctx.strokeRect(-14, -11, 28, 20);
      } else if (d.type === 'desk') {
        ctx.fillStyle = '#5f4a31'; ctx.fillRect(-15, -10, 30, 20);
        ctx.fillStyle = '#7a6143'; ctx.fillRect(-15, -12, 30, 5);
      } else if (d.type === 'chair') {
        ctx.fillStyle = '#5a4530'; ctx.fillRect(-6, -6, 12, 12);
        ctx.fillStyle = '#6f5639'; ctx.fillRect(-6, -8, 12, 4);
      } else if (d.type === 'sofa') {
        ctx.fillStyle = '#4f4a3a'; ctx.fillRect(-15, -8, 30, 17);
        ctx.fillStyle = '#605a46'; ctx.fillRect(-15, -10, 30, 6);
        ctx.fillStyle = '#3d392d'; ctx.fillRect(-15, -10, 5, 18); ctx.fillRect(10, -10, 5, 18);
      } else if (d.type === 'shelf' || d.type === 'toolbench') {
        ctx.fillStyle = '#4e3c29'; ctx.fillRect(-14, -12, 28, 24);
        ctx.fillStyle = '#6a5236'; ctx.fillRect(-14, -12, 28, 4);
        ctx.fillStyle = '#3e2f20'; ctx.fillRect(-14, 4, 28, 3);
        if (d.type === 'shelf') {
          ctx.fillStyle = '#8c7f5f'; ctx.fillRect(-11, -7, 5, 7); ctx.fillRect(-3, -6, 5, 6); ctx.fillRect(5, -8, 5, 8);
        }
      } else if (d.type === 'counter') {
        ctx.fillStyle = '#6b563a'; ctx.fillRect(-15, -9, 30, 18);
        ctx.fillStyle = '#8a7350'; ctx.fillRect(-15, -11, 30, 5);
      } else if (d.type === 'tire') {
        ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fill();
        ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
      } else if (d.type === 'tent') {
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 6, 22, 12, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#56613f'; ctx.beginPath(); ctx.moveTo(-20, 12); ctx.lineTo(0, -18); ctx.lineTo(20, 12); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#3b432d'; ctx.beginPath(); ctx.moveTo(-6, 12); ctx.lineTo(0, -6); ctx.lineTo(6, 12); ctx.closePath(); ctx.fill();
      } else if (d.type === 'campfire_dead') {
        ctx.fillStyle = '#3b3730'; ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#26231e'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(8, 4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(8, -4); ctx.lineTo(-8, 4); ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawStructures(ctx, minX, maxX, minY, maxY) {
    const g = this.game;
    for (const s of g.world.structures) {
      if (s.x < minX - 1 || s.x > maxX + 1 || s.y < minY - 1 || s.y > maxY + 1) continue;
      const px = s.x * TILE, py = s.y * TILE;
      if (s.type === 'fogueira') {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(px + 16, py + 22, 14, 8, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#4b463b';
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU;
          ctx.beginPath(); ctx.arc(px + 16 + Math.cos(a) * 12, py + 16 + Math.sin(a) * 8, 3.4, 0, TAU); ctx.fill();
        }
        ctx.strokeStyle = '#2d2115'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(px + 8, py + 20); ctx.lineTo(px + 24, py + 12); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px + 8, py + 12); ctx.lineTo(px + 24, py + 20); ctx.stroke();
        const f = Math.sin(this.time * 9 + s.x) * 2;
        ctx.fillStyle = '#d86a2a';
        ctx.beginPath(); ctx.moveTo(px + 16, py + 3 + f); ctx.quadraticCurveTo(px + 25, py + 14, px + 16, py + 20); ctx.quadraticCurveTo(px + 7, py + 14, px + 16, py + 3 + f); ctx.fill();
        ctx.fillStyle = '#f0b84a';
        ctx.beginPath(); ctx.moveTo(px + 16, py + 9 - f); ctx.quadraticCurveTo(px + 21, py + 16, px + 16, py + 20); ctx.quadraticCurveTo(px + 11, py + 16, px + 16, py + 9 - f); ctx.fill();
      } else if (s.type === 'caixa') {
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(px + 5, py + 8, 26, 22);
        ctx.fillStyle = '#6e5536'; ctx.fillRect(px + 4, py + 6, 24, 22);
        ctx.fillStyle = '#836845'; ctx.fillRect(px + 4, py + 6, 24, 5);
        ctx.strokeStyle = '#3d2d1b'; ctx.lineWidth = 2;
        ctx.strokeRect(px + 4, py + 6, 24, 22);
        ctx.beginPath(); ctx.moveTo(px + 4, py + 17); ctx.lineTo(px + 28, py + 17); ctx.stroke();
        ctx.fillStyle = '#c9b26a'; ctx.fillRect(px + 14, py + 14, 4, 6);
      } else if (s.type === 'canteiro') {
        ctx.fillStyle = '#584a2e'; ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
        ctx.strokeStyle = '#3b301c'; ctx.lineWidth = 2; ctx.strokeRect(px + 3, py + 3, TILE - 6, TILE - 6);
        ctx.strokeStyle = 'rgba(30,24,12,0.5)';
        for (let i = 1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(px + 4, py + i * 10); ctx.lineTo(px + 28, py + i * 10); ctx.stroke(); }
        if (s.crop) {
          const pct = clamp((s.growth || 0) / (s.crop === 'abobora' ? 4400 : 3600), 0, 1);
          const n = 2 + Math.floor(pct * 4);
          for (let i = 0; i < n; i++) {
            const cx = px + 7 + (i % 3) * 9, cy = py + 8 + Math.floor(i / 3) * 12;
            ctx.strokeStyle = '#5d7c37'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(cx, cy + 6); ctx.lineTo(cx, cy - 2 - pct * 4); ctx.stroke();
            ctx.fillStyle = s.ready ? (s.crop === 'abobora' ? '#c98a35' : s.crop === 'batata' ? '#9c7c4a' : '#d3b447') : '#6e8c43';
            ctx.beginPath(); ctx.arc(cx, cy - 2 - pct * 4, 2 + pct * 2, 0, TAU); ctx.fill();
          }
        }
      } else if (s.type === 'coletor') {
        ctx.fillStyle = '#3d4a50'; ctx.beginPath(); ctx.ellipse(px + 16, py + 20, 11, 7, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#4f6068'; ctx.fillRect(px + 6, py + 8, 20, 14);
        ctx.fillStyle = '#38464e'; ctx.beginPath(); ctx.ellipse(px + 16, py + 8, 10, 4, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(80,150,170,0.7)';
        const pct = clamp((s.water || 0) / 3, 0, 1);
        ctx.fillRect(px + 8, py + 15 - pct * 6, 16, pct * 6);
        ctx.strokeStyle = '#26343a'; ctx.lineWidth = 1;
        ctx.strokeRect(px + 8, py + 9, 16, 10);
      } else if (s.type === 'armadilha') {
        ctx.fillStyle = 'rgba(25,20,14,0.45)'; ctx.fillRect(px + 3, py + 3, 26, 26);
        ctx.fillStyle = '#6d5839';
        for (let i = 0; i < 4; i++) {
          const cx = px + 8 + (i % 2) * 14, cy = py + 9 + Math.floor(i / 2) * 12;
          ctx.beginPath(); ctx.moveTo(cx - 3, cy + 3); ctx.lineTo(cx, cy - 5); ctx.lineTo(cx + 3, cy + 3); ctx.closePath(); ctx.fill();
        }
      } else if (s.type === 'parede' || s.type === 'muro_metal' || s.type === 'cerca') {
        if (s.type === 'cerca') {
          ctx.strokeStyle = '#8a6a3d'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(px + 3, py + 8); ctx.lineTo(px + 29, py + 8); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(px + 3, py + 22); ctx.lineTo(px + 29, py + 22); ctx.stroke();
          for (let i = 0; i < 3; i++) {
            ctx.beginPath(); ctx.moveTo(px + 6 + i * 10, py + 3); ctx.lineTo(px + 6 + i * 10, py + 29); ctx.stroke();
          }
        } else {
          ctx.fillStyle = s.type === 'muro_metal' ? '#5d666b' : '#5d452e';
          ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
          ctx.fillStyle = s.type === 'muro_metal' ? '#778289' : '#755a3c';
          ctx.fillRect(px + 2, py + 2, TILE - 4, 6);
          if (s.type === 'muro_metal') {
            ctx.strokeStyle = '#3d454a'; ctx.lineWidth = 1;
            for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(px + 4, py + 10 + i * 6); ctx.lineTo(px + 28, py + 10 + i * 6); ctx.stroke(); }
          } else {
            ctx.strokeStyle = '#3b2b1a'; ctx.lineWidth = 1;
            for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(px + 3, py + 10 + i * 7); ctx.lineTo(px + 29, py + 10 + i * 7); ctx.stroke(); }
          }
        }
        if (s.hp < s.maxHp) this.drawHPBar(ctx, px + 4, py - 5, 24, s.hp / s.maxHp);
      } else if (s.portal) {
        // barricada desenhada junto da porta; nada extra
      }
    }
  }

  drawContainers(ctx, minX, maxX, minY, maxY) {
    const w = this.game.world;
    for (const c of w.containers) {
      if (c.x < minX - 1 || c.x > maxX + 1 || c.y < minY - 1 || c.y > maxY + 1) continue;
      const px = c.x * TILE, py = c.y * TILE;
      const type = c.type;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(px + 16, py + 26, 12, 5, 0, 0, TAU); ctx.fill();
      if (type === 'geladeira') {
        ctx.fillStyle = c.searched ? '#7c7e78' : '#b8bcb4'; ctx.fillRect(px + 7, py + 2, 18, 28);
        ctx.fillStyle = '#8f938b'; ctx.fillRect(px + 8, py + 13, 16, 2);
        ctx.fillStyle = '#5f625b'; ctx.fillRect(px + 21, py + 7, 2, 5);
      } else if (type === 'farmacia') {
        ctx.fillStyle = '#d5d7cf'; ctx.fillRect(px + 5, py + 4, 22, 24);
        ctx.fillStyle = '#9aa096'; ctx.fillRect(px + 6, py + 15, 20, 2);
        ctx.fillStyle = '#b6423b'; ctx.fillRect(px + 14, py + 8, 4, 10); ctx.fillRect(px + 11, py + 11, 10, 4);
      } else if (type === 'mercado') {
        ctx.fillStyle = '#5a4a33'; ctx.fillRect(px + 2, py + 5, 28, 20);
        ctx.fillStyle = '#6d5b3f'; ctx.fillRect(px + 2, py + 5, 28, 4);
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = ['#b7a15c', '#8e6a46', '#6f8648'][i];
          ctx.fillRect(px + 5 + i * 8, py + 11, 5, 8);
        }
      } else if (type === 'quartel' || type === 'armario_militar' || type === 'caixa_suprimentos') {
        ctx.fillStyle = type === 'caixa_suprimentos' ? '#5c6b45' : '#4f5a3d';
        ctx.fillRect(px + 4, py + 5, 24, 23);
        ctx.fillStyle = '#6c7a52'; ctx.fillRect(px + 4, py + 5, 24, 4);
        ctx.strokeStyle = '#333b26'; ctx.lineWidth = 1; ctx.strokeRect(px + 4, py + 5, 24, 23);
        ctx.fillStyle = '#c9ccb4'; ctx.fillRect(px + 14, py + 16, 4, 4);
      } else if (type === 'oficina' || type === 'ferramentas' || type === 'caixa' || type === 'fazenda') {
        ctx.fillStyle = type === 'fazenda' ? '#7a6238' : '#664f32';
        ctx.fillRect(px + 4, py + 7, 24, 21);
        ctx.fillStyle = 'rgba(190,160,100,0.35)'; ctx.fillRect(px + 4, py + 7, 24, 4);
        ctx.strokeStyle = '#3c2e1b'; ctx.lineWidth = 1; ctx.strokeRect(px + 4, py + 7, 24, 21);
        ctx.beginPath(); ctx.moveTo(px + 4, py + 18); ctx.lineTo(px + 28, py + 18); ctx.stroke();
      } else {
        ctx.fillStyle = '#6d5b40'; ctx.fillRect(px + 5, py + 6, 22, 22);
        ctx.fillStyle = 'rgba(210,190,150,0.25)'; ctx.fillRect(px + 5, py + 6, 22, 4);
      }
      ctx.restore();
      // brilho de vasculhável não saqueado
      if (!c.searched && c.items.length) {
        const pulse = 0.3 + Math.sin(this.time * 2 + c.x) * 0.12;
        ctx.strokeStyle = `rgba(230,210,140,${pulse})`;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px + 3, py + 3, TILE - 6, TILE - 6);
      }
    }
  }

  drawBedsNotes(ctx, minX, maxX, minY, maxY) {
    const w = this.game.world;
    for (const b of w.beds) {
      if (b.x < minX - 1 || b.x > maxX + 1 || b.y < minY - 1 || b.y > maxY + 1) continue;
      const px = b.x * TILE, py = b.y * TILE;
      ctx.fillStyle = '#5a5f63'; ctx.fillRect(px + 4, py + 2, 24, 28);
      ctx.fillStyle = '#b8c0bf'; ctx.fillRect(px + 6, py + 4, 20, 24);
      ctx.fillStyle = '#e1e4dc'; ctx.fillRect(px + 8, py + 5, 16, 7);
      ctx.fillStyle = '#7c8b8c'; ctx.fillRect(px + 6, py + 16, 20, 10);
    }
    for (const n of w.notes) {
      if (n.x < minX - 1 || n.x > maxX + 1 || n.y < minY - 1 || n.y > maxY + 1) continue;
      const px = n.x * TILE + 16, py = n.y * TILE + 16;
      ctx.save(); ctx.translate(px, py); ctx.rotate(0.2);
      ctx.fillStyle = '#d8d2b8'; ctx.fillRect(-6, -8, 12, 16);
      ctx.strokeStyle = '#a39b7f'; ctx.lineWidth = 1; ctx.strokeRect(-6, -8, 12, 16);
      ctx.strokeStyle = '#8a8268';
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-4, -3 + i * 4); ctx.lineTo(4, -3 + i * 4); ctx.stroke(); }
      ctx.restore();
    }
  }

  drawGroundItems(ctx, minX, maxX, minY, maxY) {
    for (const gi of this.game.groundItems) {
      const tx = gi.x / TILE, ty = gi.y / TILE;
      if (tx < minX - 1 || tx > maxX + 1 || ty < minY - 1 || ty > maxY + 1) continue;
      const item = ITEMS[gi.stack.id];
      const pulse = 0.5 + Math.sin(this.time * 3 + gi.x) * 0.2;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(gi.x, gi.y + 7, 8, 3, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = item?.type === 'weapon' ? '#aab3b8' : item?.type === 'med' ? '#c8d4c4' : '#c9b07a';
      ctx.fillRect(gi.x - 5, gi.y - 5, 10, 10);
      ctx.strokeStyle = `rgba(240,220,150,${pulse})`; ctx.lineWidth = 1.5;
      ctx.strokeRect(gi.x - 7, gi.y - 7, 14, 14);
    }
  }

  drawCorpses(ctx, minX, maxX, minY, maxY) {
    for (const c of this.game.corpses) {
      const tx = c.x / TILE, ty = c.y / TILE;
      if (tx < minX - 1 || tx > maxX + 1 || ty < minY - 1 || ty > maxY + 1) continue;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.angle);
      ctx.globalAlpha = clamp(1 - c.time / 120, 0.35, 1);
      const s = c.size || 1;
      ctx.fillStyle = c.type === 'npc' ? '#3a3630' : '#3d4433';
      ctx.beginPath(); ctx.ellipse(0, 0, 13 * s, 7 * s, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = c.type === 'npc' ? '#6b5d4f' : '#627052';
      ctx.beginPath(); ctx.arc(10 * s, -2, 5 * s, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  drawNoiseRings(ctx) {
    for (const r of this.game.noiseRings) {
      ctx.strokeStyle = r.kind === 'tiro' || r.kind === 'veiculo' ? `rgba(255,150,100,${r.life / r.maxLife * 0.25})` : `rgba(220,220,190,${r.life / r.maxLife * 0.14})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.stroke();
    }
  }

  // ================= VEÍCULOS =================
  drawVehicles(ctx, minX, maxX, minY, maxY) {
    for (const v of this.game.world.vehicles) {
      if (v.x / TILE < minX - 3 || v.x / TILE > maxX + 3 || v.y / TILE < minY - 3 || v.y / TILE > maxY + 3) continue;
      this.drawVehicle(ctx, v);
    }
  }

  drawVehicle(ctx, v) {
    const night = isNight(this.game.time);
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.rotate(v.angle);
    // sombra
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath(); ctx.ellipse(0, 6, v.w / 2 + 2, v.h / 2 + 2, 0, 0, TAU); ctx.fill();
    // rodas
    ctx.fillStyle = '#1c1c1c';
    const wx = v.w * 0.3, wy = v.h / 2 - 2;
    ctx.fillRect(-wx - 5, -wy - 3, 10, 6); ctx.fillRect(wx - 5, -wy - 3, 10, 6);
    ctx.fillRect(-wx - 5, wy - 3, 10, 6); ctx.fillRect(wx - 5, wy - 3, 10, 6);
    // corpo
    ctx.fillStyle = v.color;
    this.roundRect(ctx, -v.w / 2, -v.h / 2, v.w, v.h, 6); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    this.roundRect(ctx, -v.w / 2 + 4, -v.h / 2 + 3, v.w - 8, v.h * 0.3, 4); ctx.fill();
    // cabine / vidros
    ctx.fillStyle = '#25333a';
    const cabW = v.w * 0.38;
    this.roundRect(ctx, -cabW / 2 + v.w * 0.1, -v.h / 2 + 3, cabW, v.h - 6, 3); ctx.fill();
    ctx.fillStyle = 'rgba(150,200,210,0.3)';
    ctx.fillRect(-cabW / 2 + v.w * 0.1 + 2, -v.h / 2 + 5, cabW - 4, 3);
    // faróis
    const lightsOn = v.occupied && v.engineOn;
    ctx.fillStyle = lightsOn ? '#ffe7a3' : '#7d7a64';
    ctx.fillRect(v.w / 2 - 4, -v.h / 2 + 3, 4, 5);
    ctx.fillRect(v.w / 2 - 4, v.h / 2 - 8, 4, 5);
    ctx.fillStyle = '#8f2f2a';
    ctx.fillRect(-v.w / 2, -v.h / 2 + 3, 3, 5);
    ctx.fillRect(-v.w / 2, v.h / 2 - 8, 3, 5);
    // ferrugem / dano
    if (v.condition < 55) {
      ctx.fillStyle = 'rgba(90,50,25,0.55)';
      ctx.fillRect(-v.w * 0.2, -v.h / 2 + 2, 5, 5);
      ctx.fillRect(v.w * 0.15, v.h / 2 - 6, 7, 4);
    }
    ctx.restore();
    if (night && v.occupied && v.engineOn) {
      // cone dos faróis
      ctx.save();
      ctx.translate(v.x, v.y); ctx.rotate(v.angle);
      const grad = ctx.createLinearGradient(v.w / 2, 0, v.w / 2 + 200, 0);
      grad.addColorStop(0, 'rgba(255,240,180,0.22)');
      grad.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.moveTo(v.w / 2, -6); ctx.lineTo(v.w / 2 + 220, -90); ctx.lineTo(v.w / 2 + 220, 90); ctx.lineTo(v.w / 2, 6); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    if (v.occupied) {
      ctx.fillStyle = 'rgba(210,230,190,0.8)';
      ctx.font = '9px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`⛽ ${Math.round(v.fuel)}% • 🔧 ${Math.round(v.condition)}%`, v.x, v.y - v.h / 2 - 8);
    }
  }

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ================= PERSONAGENS =================
  drawTreeCanopies(ctx, minX, maxX, minY, maxY) {
    const g = this.game;
    const winter = g.seasonIndex === 2;
    const autumn = g.seasonIndex === 1;
    const t = this.time;
    for (const tr of g.world.trees) {
      const tx = tr.x / TILE, ty = tr.y / TILE;
      if (tx < minX - 1.5 || tx > maxX + 1.5 || ty < minY - 1.5 || ty > maxY + 1.5) continue;
      const sway = Math.sin(t * 0.9 + tr.sway) * 1.2;
      const r = tr.r * 8;
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath(); ctx.ellipse(tr.x + 3, tr.y + 5, r * 0.9, r * 0.5, 0, 0, TAU); ctx.fill();
      // tronco
      ctx.fillStyle = '#43331f';
      ctx.fillRect(tr.x - 2, tr.y + 1, 4, 8);
      const base = winter ? ['#33413a', '#3c4b43', '#2a3730'] : autumn ? ['#6b5a2a', '#7a6330', '#5b4c24'] : ['#2e4a2c', '#3a5933', '#233a22'];
      ctx.fillStyle = base[tr.variant % 3];
      ctx.beginPath(); ctx.arc(tr.x - r * 0.35 + sway, tr.y - 2, r * 0.62, 0, TAU); ctx.fill();
      ctx.fillStyle = base[(tr.variant + 1) % 3];
      ctx.beginPath(); ctx.arc(tr.x + r * 0.3 + sway, tr.y - 4, r * 0.58, 0, TAU); ctx.fill();
      ctx.fillStyle = base[(tr.variant + 2) % 3];
      ctx.beginPath(); ctx.arc(tr.x + sway, tr.y - r * 0.4, r * 0.66, 0, TAU); ctx.fill();
      // highlight
      ctx.fillStyle = winter ? 'rgba(210,225,230,0.08)' : 'rgba(150,190,110,0.12)';
      ctx.beginPath(); ctx.arc(tr.x - r * 0.2 + sway, tr.y - r * 0.5, r * 0.4, 0, TAU); ctx.fill();
    }
    // pedras
    for (const rock of g.world.rocks) {
      if (rock.x / TILE < minX - 1 || rock.x / TILE > maxX + 1 || rock.y / TILE < minY - 1 || rock.y / TILE > maxY + 1) continue;
      const r = rock.r * 13;
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(rock.x + 2, rock.y + 3, r, r * 0.55, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#5b5b52'; ctx.beginPath(); ctx.ellipse(rock.x, rock.y, r, r * 0.75, 0.4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#6d6d63'; ctx.beginPath(); ctx.ellipse(rock.x - r * 0.2, rock.y - r * 0.25, r * 0.55, r * 0.4, 0.4, 0, TAU); ctx.fill();
    }
  }
  drawPlayer(ctx) {
    const g = this.game, p = g.player;
    if (p.inVehicle) {
      // pequeno indicador de motorista
      const v = p.inVehicle;
      ctx.fillStyle = 'rgba(220,235,200,0.85)';
      ctx.beginPath(); ctx.arc(v.x + Math.cos(v.angle) * 6, v.y + Math.sin(v.angle) * 6, 4, 0, TAU); ctx.fill();
      return;
    }
    if (p.downed) {
      this.drawSurvivor(ctx, p.x, p.y, p.angle, '#5d6b57', '#b58a6b', 0, false, { downed: true, name: p.name, player: true });
      return;
    }
    const moving = g.input.up || g.input.down || g.input.left || g.input.right;
    const bob = moving ? Math.sin(g.clock * 12) * 2 : Math.sin(g.clock * 2) * 0.5;
    this.drawSurvivor(ctx, p.x, p.y, p.angle, '#556b52', '#c99a78', bob, moving, { player: true, weapon: g.weaponStack, swing: p.swing, flashlight: p.flashlight });
    if (p.bleed > 20) {
      ctx.fillStyle = 'rgba(120,20,18,0.35)';
      ctx.beginPath(); ctx.arc(p.x + 3, p.y + 5, 9, 0, TAU); ctx.fill();
    }
  }
  drawSurvivor(ctx, x, y, angle, jacket, skin, bob, moving, opts = {}) {
    ctx.save();
    ctx.translate(x, y);
    // sombra
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(0, 5, 10, 5, 0, 0, TAU); ctx.fill();
    ctx.rotate(angle);
    const downed = opts.downed;
    if (downed) {
      ctx.fillStyle = jacket;
      ctx.beginPath(); ctx.ellipse(0, 0, 12, 6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.arc(10, 0, 5, 0, TAU); ctx.fill();
      ctx.restore();
      return;
    }
    // pernas
    const legSwing = moving ? Math.sin(this.game.clock * 12) * 4 : 0;
    ctx.strokeStyle = '#383d34'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-3, -3); ctx.lineTo(-6 + legSwing, -7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-3, 3); ctx.lineTo(-6 - legSwing, 7); ctx.stroke();
    // mochila
    if (opts.player) {
      ctx.fillStyle = '#4e4232';
      this.roundRect(ctx, -10, -6, 6, 12, 2); ctx.fill();
    }
    // corpo
    ctx.fillStyle = jacket;
    this.roundRect(ctx, -6, -6 + bob * 0.2, 14, 12, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    this.roundRect(ctx, -4, -5, 9, 3, 1.5); ctx.fill();
    // braços
    const armSwing = opts.swing ? Math.sin((1 - opts.swing) * Math.PI) * 0.7 : 0;
    ctx.strokeStyle = jacket; ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.moveTo(3, -5); ctx.lineTo(7 + Math.cos(armSwing) * 4, -7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, 5); ctx.lineTo(7, 7 + armSwing * 3); ctx.stroke();
    // mãos
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(8, -7, 2.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(8, 7 + armSwing * 3, 2.2, 0, TAU); ctx.fill();
    // cabeça
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(4, 0, 5.3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2b2620';
    ctx.beginPath(); ctx.arc(3, 0, 5.3, Math.PI * 0.7, Math.PI * 1.3); ctx.fill();
    // arma
    if (opts.weapon) {
      const def = ITEMS[opts.weapon.id];
      if (def?.gun) {
        ctx.fillStyle = '#2e3235';
        ctx.fillRect(8, -2, 14, 3);
        ctx.fillStyle = '#4d5458';
        ctx.fillRect(10, -3, 7, 2);
      } else if (def?.weapon) {
        ctx.strokeStyle = '#9a9a8e'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(6, 6); ctx.lineTo(18, 8); ctx.stroke();
        ctx.fillStyle = '#7a5a33'; ctx.fillRect(5, 5, 4, 4);
      }
      if (opts.swing) {
        ctx.strokeStyle = `rgba(235,235,215,${opts.swing * 0.4})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, def?.range ? Math.min(24, def.range * 0.5) : 20, -0.9, 0.9); ctx.stroke();
      }
    }
    if (opts.flashlight) {
      ctx.fillStyle = '#d8d6b0';
      ctx.fillRect(7, -8, 4, 3);
    }
    ctx.restore();
    if (opts.name) {
      ctx.fillStyle = 'rgba(225,235,215,0.85)';
      ctx.font = '600 10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(opts.name, x, y - 22);
    }
  }
  drawZombies(ctx, minX, maxX, minY, maxY) {
    const g = this.game;
    for (const z of g.zombies) {
      const tx = z.x / TILE, ty = z.y / TILE;
      if (tx < minX - 1 || tx > maxX + 1 || ty < minY - 1 || ty > maxY + 1) continue;
      const def = ZOMBIE_TYPES[z.type] || ZOMBIE_TYPES.comum;
      const s = z.size;
      const lunge = (z.lunge || 0) * 3;
      ctx.save();
      ctx.translate(z.x, z.y);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(0, 6, 10 * s, 5 * s, 0, 0, TAU); ctx.fill();
      ctx.rotate(z.angle);
      if (z.hitFlash > 0) ctx.globalAlpha = 1;
      const bob = Math.sin(z.anim * 4) * 1.4;
      if (z.type === 'rastejante') {
        ctx.fillStyle = z.hitFlash > 0.3 ? '#e8e0d2' : '#4c5940';
        ctx.beginPath(); ctx.ellipse(-2, 0, 13 * s, 6 * s, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = z.hitFlash > 0.3 ? '#f0e8dc' : '#7c8a62';
        ctx.beginPath(); ctx.arc(10 * s, -1, 5 * s, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#4c5940'; ctx.lineWidth = 3 * s;
        ctx.beginPath(); ctx.moveTo(4, -4); ctx.lineTo(14 + lunge, -8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(4, 4); ctx.lineTo(14 + lunge, 8); ctx.stroke();
      } else {
        // pernas
        ctx.strokeStyle = '#3a4034'; ctx.lineWidth = 3 * s;
        const legSwing = Math.sin(z.anim * 6) * 4 * s;
        ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(-8 + legSwing, -8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-4, 4); ctx.lineTo(-8 - legSwing, 8); ctx.stroke();
        // corpo
        ctx.fillStyle = z.hitFlash > 0.3 ? '#e8e0d2' : def.skin;
        this.roundRect(ctx, -7 * s, -6 * s + bob, 15 * s, 12 * s, 5 * s); ctx.fill();
        ctx.fillStyle = 'rgba(30,40,20,0.28)';
        this.roundRect(ctx, -5 * s, 1 * s, 9 * s, 4 * s, 2 * s); ctx.fill();
        // braços estendidos
        ctx.strokeStyle = z.hitFlash > 0.3 ? '#e8e0d2' : def.skin; ctx.lineWidth = 3 * s;
        ctx.beginPath(); ctx.moveTo(3 * s, -5 * s); ctx.lineTo(15 * s + lunge, -6 * s); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(3 * s, 5 * s); ctx.lineTo(15 * s + lunge, 6 * s); ctx.stroke();
        ctx.fillStyle = '#75825f';
        ctx.beginPath(); ctx.arc(16 * s + lunge, -6 * s, 2.2 * s, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(16 * s + lunge, 6 * s, 2.2 * s, 0, TAU); ctx.fill();
        // cabeça
        ctx.fillStyle = z.hitFlash > 0.3 ? '#f4ece0' : def.skin;
        ctx.beginPath(); ctx.arc(6 * s, 0, 5.2 * s, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(60,20,18,0.55)';
        ctx.beginPath(); ctx.arc(8 * s, 1 * s, 2.6 * s, 0, TAU); ctx.fill();
        ctx.fillStyle = '#2b1d18';
        ctx.beginPath(); ctx.arc(5 * s, -2 * s, 0.9 * s, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(5 * s, 2 * s, 0.9 * s, 0, TAU); ctx.fill();
      }
      ctx.restore();
      if (z.hp < z.maxHp) this.drawHPBar(ctx, z.x - 12, z.y - 18 * s - 6, 24, z.hp / z.maxHp);
      if (z.alert > 0 && dist(z.x, z.y, g.player.x, g.player.y) < 500) {
        ctx.fillStyle = 'rgba(230,120,90,0.9)';
        ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center';
        ctx.fillText('!', z.x, z.y - 20 * s - 9);
      }
    }
  }
  drawNPCs(ctx, minX, maxX, minY, maxY) {
    const g = this.game;
    for (const n of g.npcs) {
      if (!n.alive) continue;
      const tx = n.x / TILE, ty = n.y / TILE;
      if (tx < minX - 1 || tx > maxX + 1 || ty < minY - 1 || ty > maxY + 1) continue;
      const color = n.hostile ? '#7d3b2c' : n.trader ? '#4e5d71' : (n.name.charCodeAt(0) % 2 ? '#5b6250' : '#625b4e');
      const bob = Math.sin(n.anim * 5) * 1.2;
      this.drawSurvivor(ctx, n.x, n.y, n.angle, color, '#b98a6a', bob, true, { name: n.hostile ? 'SAQUEADOR' : n.name });
      if (n.following) {
        ctx.fillStyle = 'rgba(120,200,120,0.9)';
        ctx.font = '10px system-ui'; ctx.textAlign = 'center';
        ctx.fillText('● aliado', n.x, n.y + 24);
      } else if (n.trader) {
        ctx.fillStyle = 'rgba(220,200,120,0.95)';
        ctx.font = '11px system-ui'; ctx.textAlign = 'center';
        ctx.fillText('🤝', n.x, n.y - 30);
      }
      if (n.hostile && n.hp < n.maxHp) this.drawHPBar(ctx, n.x - 12, n.y - 28, 24, n.hp / n.maxHp);
    }
  }
  drawRemote(ctx) {
    const g = this.game;
    for (const rp of g.remotePlayers.values()) {
      const x = rp.renderX ?? rp.x, y = rp.renderY ?? rp.y;
      this.drawSurvivor(ctx, x, y, rp.angle, rp.color || '#4f6f78', '#c99a78', 0, rp.moving, { name: rp.name, downed: rp.downed });
      if (rp.downed) {
        ctx.fillStyle = 'rgba(240,120,100,0.9)';
        ctx.font = '10px system-ui'; ctx.textAlign = 'center';
        ctx.fillText('CAÍDO — reanime', x, y - 24);
      }
    }
  }
  drawParticles(ctx) {
    for (const p of this.game.particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.size > 7) {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a, 0, TAU); ctx.fill();
      } else {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }
  drawFloaters(ctx) {
    for (const f of this.game.floaters) {
      ctx.globalAlpha = clamp(f.life / f.maxLife, 0, 1);
      ctx.font = 'bold 12px system-ui';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }
  drawBuildGhost(ctx) {
    const g = this.game;
    if (!g.buildMode || !g.selectedBuild) return;
    const ghost = g.getBuildGhost();
    if (!ghost) return;
    const x = ghost.tx * TILE, y = ghost.ty * TILE;
    ctx.fillStyle = ghost.valid ? 'rgba(120,220,130,0.22)' : 'rgba(230,90,80,0.22)';
    ctx.strokeStyle = ghost.valid ? 'rgba(150,240,160,0.85)' : 'rgba(255,120,100,0.9)';
    ctx.lineWidth = 2;
    ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
    ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
    const def = BUILDABLES[g.selectedBuild];
    if (def.target === 'portal') { ctx.strokeStyle = 'rgba(240,220,120,0.8)'; ctx.strokeRect(x - 2, y - 2, TILE + 4, TILE + 4); }
    if (ghost.reason) {
      ctx.fillStyle = 'rgba(255,180,160,0.95)'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(ghost.reason, x + 16, y - 6);
    }
  }
  drawBuildHint(ctx) {
    const g = this.game;
    const def = BUILDABLES[g.selectedBuild];
    if (!def) return;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const y = this.h - 95;
    ctx.fillStyle = 'rgba(12,15,12,0.78)';
    ctx.fillRect(this.w / 2 - 190, y, 380, 38);
    ctx.strokeStyle = 'rgba(180,200,150,0.25)'; ctx.strokeRect(this.w / 2 - 190, y, 380, 38);
    ctx.fillStyle = '#e8e4d0'; ctx.font = '600 13px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(`${def.icon} ${def.name} — clique para construir • Esc cancela`, this.w / 2, y + 24);
    ctx.restore();
  }
  drawInteraction(ctx) {
    const it = this.game.getInteractable();
    if (!it || !it.ref) return;
    const g = this.game;
    let x, y;
    if (it.ref.x !== undefined && it.ref.y !== undefined && it.ref.w === undefined) { x = it.ref.x; y = it.ref.y; }
    if (it.type === 'ground' || it.type === 'revive') { x = it.ref.x; y = it.ref.y; }
    if (it.type === 'door' || it.type === 'window' || it.type === 'container' || it.type === 'structure') {
      x = it.ref.x * TILE + TILE / 2; y = it.ref.y * TILE + TILE / 2;
    }
    if (it.type === 'bed' || it.type === 'note') { x = it.ref.x * TILE + 16; y = it.ref.y * TILE + 16; }
    if (x === undefined) return;
    const pulse = 0.6 + Math.sin(this.time * 4) * 0.25;
    ctx.strokeStyle = `rgba(240,225,160,${pulse * 0.75})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(x, y, 17 + Math.sin(this.time * 4) * 2, 0, TAU); ctx.stroke();
  }
  // ================= CLIMA E LUZ =================
  drawWeather(ctx, dt) {
    const g = this.game;
    const def = WEATHERS[g.weather] || WEATHERS.limpo;
    const intensity = def.wet;
    const winter = g.seasonIndex === 2;
    if (g.weather === 'neblina' || g.weather === 'tempestade') {
      for (const b of this.fogBlobs) {
        b.x += b.vx * dt;
        if (b.x < -b.r) b.x = this.w + b.r; if (b.x > this.w + b.r) b.x = -b.r;
        const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        grad.addColorStop(0, `rgba(175,185,180,${b.a * (g.weather === 'tempestade' ? 1.2 : 1.8)})`);
        grad.addColorStop(1, 'rgba(175,185,180,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
      }
      if (g.weather === 'neblina') {
        ctx.fillStyle = 'rgba(150,160,155,0.10)';
        ctx.fillRect(0, 0, this.w, this.h);
      }
    }
    if (intensity > 0) {
      const count = Math.floor(60 + intensity * 220);
      ctx.strokeStyle = winter ? 'rgba(235,240,245,0.55)' : 'rgba(150,185,200,0.38)';
      ctx.lineWidth = winter ? 1 : 1.2;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const r = this.rain[i % this.rain.length];
        if (winter) {
          r.y += (20 + r.s * 30) * dt;
          r.x += Math.sin(this.time + r.s * 8) * 18 * dt;
          ctx.fillStyle = 'rgba(235,240,245,0.65)';
          ctx.beginPath(); ctx.arc(r.x, r.y, 1 + r.s * 1.5, 0, TAU); ctx.fill();
        } else {
          r.y += (380 + r.s * 320) * dt;
          r.x -= 60 * dt;
          if (r.y > this.h) { r.y = -20; r.x = Math.random() * (this.w + 100); }
          if (r.x < -20) r.x = this.w + 20;
          ctx.moveTo(r.x, r.y);
          ctx.lineTo(r.x - 5, r.y + r.len * (0.6 + intensity * 0.6));
        }
      }
      if (!winter) ctx.stroke();
      ctx.fillStyle = `rgba(30,50,65,${intensity * 0.07})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    if (g.flash > 0) {
      ctx.fillStyle = `rgba(210,225,245,${g.flash * 0.35})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }
  getNightAlpha() {
    const h = this.game.time / 60;
    if (h >= 7 && h < 18) return 0;
    if (h >= 18 && h < 20) return (h - 18) / 2 * 0.58;
    if (h >= 20 && h < 23) return 0.58 + (h - 20) / 3 * 0.14;
    if (h >= 23 || h < 4) return 0.72;
    if (h >= 4 && h < 6) return 0.72 * (1 - (h - 4) / 2);
    if (h >= 6 && h < 7) return 0.25 * (1 - (h - 6));
    return 0;
  }
  drawLighting(ctx) {
    const g = this.game;
    let alpha = this.getNightAlpha();
    if (g.weather === 'tempestade') alpha = Math.max(alpha, 0.45);
    if (g.weather === 'neblina') alpha = Math.max(alpha, 0.18);
    if (alpha <= 0.01) return;
    const lc = this.lightCanvas, l = this.lightCtx;
    const lw = lc.width, lh = lc.height;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.clearRect(0, 0, lw, lh);
    l.fillStyle = `rgba(5,9,16,${alpha})`;
    l.fillRect(0, 0, lw, lh);
    l.setTransform(0.5, 0, 0, 0.5, 0, 0);
    l.globalCompositeOperation = 'destination-out';
    const addLight = (wx, wy, r, strength = 1) => {
      const sx = (wx - this.camera.x) * this.zoom;
      const sy = (wy - this.camera.y) * this.zoom;
      if (sx < -r || sy < -r || sx > this.w + r || sy > this.h + r) return;
      const grad = l.createRadialGradient(sx, sy, 0, sx, sy, r);
      grad.addColorStop(0, `rgba(0,0,0,${0.92 * strength})`);
      grad.addColorStop(0.45, `rgba(0,0,0,${0.55 * strength})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      l.fillStyle = grad;
      l.beginPath(); l.arc(sx, sy, r, 0, TAU); l.fill();
    };
    const p = g.player;
    if (!p.inVehicle) addLight(p.x, p.y, p.flashlight ? 170 : 92, p.flashlight ? 1 : 0.75);
    if (p.flashlight) {
      const sx = (p.x - this.camera.x) * this.zoom, sy = (p.y - this.camera.y) * this.zoom;
      const cone = l.createRadialGradient(sx, sy, 10, sx, sy, 330);
      cone.addColorStop(0, 'rgba(0,0,0,0.85)'); cone.addColorStop(0.7, 'rgba(0,0,0,0.55)'); cone.addColorStop(1, 'rgba(0,0,0,0)');
      l.save();
      l.translate(sx, sy); l.rotate(p.angle);
      l.fillStyle = cone;
      l.beginPath(); l.moveTo(0, -16); l.lineTo(330, -120); l.lineTo(330, 120); l.lineTo(0, 16); l.closePath(); l.fill();
      l.restore();
    }
    for (const s of g.world.structures) {
      if (s.type === 'fogueira') addLight(s.x * TILE + 16, s.y * TILE + 16, 210, 1);
    }
    for (const v of g.world.vehicles) {
      if (v.occupied && v.engineOn) {
        addLight(v.x, v.y, 120, 0.6);
        addLight(v.x + Math.cos(v.angle) * 150, v.y + Math.sin(v.angle) * 150, 170, 0.7);
      }
    }
    for (const rp of g.remotePlayers.values()) {
      if (rp.flashlight) addLight(rp.x, rp.y, 140, 0.7);
    }
    l.globalCompositeOperation = 'source-over';
    ctx.drawImage(lc, 0, 0, lw * 2, lh * 2);
    // brilho quente das fogueiras
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of g.world.structures) {
      if (s.type !== 'fogueira') continue;
      const sx = (s.x * TILE + 16 - this.camera.x) * this.zoom, sy = (s.y * TILE + 16 - this.camera.y) * this.zoom;
      if (sx < -100 || sy < -100 || sx > this.w + 100 || sy > this.h + 100) continue;
      const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, 120);
      grad.addColorStop(0, 'rgba(255,160,60,0.12)');
      grad.addColorStop(1, 'rgba(255,160,60,0)');
      ctx.fillStyle = grad; ctx.fillRect(sx - 120, sy - 120, 240, 240);
    }
    ctx.restore();
  }
  drawAim(ctx) {
    const g = this.game;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (g.aim?.active && g.input.pointerActive) {
      const sx = (g.aim.x - this.camera.x) * this.zoom;
      const sy = (g.aim.y - this.camera.y) * this.zoom;
      if (sx > 0 && sy > 0 && sx < this.w && sy < this.h) {
        ctx.strokeStyle = 'rgba(235,230,200,0.65)';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(sx, sy, 8, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(sx, sy, 2, 0, TAU); ctx.fillStyle = 'rgba(235,230,200,0.8)'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(sx - 13, sy); ctx.lineTo(sx - 9, sy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx + 9, sy); ctx.lineTo(sx + 13, sy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx, sy - 13); ctx.lineTo(sx, sy - 9); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx, sy + 9); ctx.lineTo(sx, sy + 13); ctx.stroke();
      }
    }
  }
  drawVignette(ctx) {
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const grad = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.26, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.72);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.7, 'rgba(0,0,0,0.18)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.w, this.h);
    // scanline sutil
    ctx.fillStyle = 'rgba(0,0,0,0.035)';
    for (let y = 0; y < this.h; y += 4) ctx.fillRect(0, y, this.w, 1);
  }
  // ================= MINIMAPA =================
  updateMinimapFog() {
    const now = performance.now();
    if (now - this.lastFogUpdate < 800) return;
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
    // prédios descobertos
    for (const b of g.world.buildings) {
      if (!b.discovered) continue;
      ctx.fillStyle = 'rgba(185,175,145,0.25)';
      ctx.fillRect(px(b.x * TILE), py(b.y * TILE), b.w * scale, b.h * scale);
      ctx.strokeStyle = 'rgba(200,190,160,0.35)'; ctx.lineWidth = 0.7;
      ctx.strokeRect(px(b.x * TILE), py(b.y * TILE), b.w * scale, b.h * scale);
    }
    // zumbis próximos
    for (const z of g.zombies) {
      if (dist(z.x, z.y, g.player.x, g.player.y) > 650) continue;
      if (!g.world.explored[Math.floor(z.y / TILE) * w + Math.floor(z.x / TILE)]) continue;
      ctx.fillStyle = '#b5433c';
      ctx.beginPath(); ctx.arc(px(z.x), py(z.y), 1.5, 0, TAU); ctx.fill();
    }
    // NPCs
    for (const n of g.npcs) {
      if (!n.alive || dist(n.x, n.y, g.player.x, g.player.y) > 800) continue;
      ctx.fillStyle = n.hostile ? '#e0714d' : '#d9c56a';
      ctx.beginPath(); ctx.arc(px(n.x), py(n.y), 1.8, 0, TAU); ctx.fill();
    }
    for (const rp of g.remotePlayers.values()) {
      ctx.fillStyle = '#6cd7c4';
      ctx.beginPath(); ctx.arc(px(rp.x), py(rp.y), 2.2, 0, TAU); ctx.fill();
    }
    if (g.ui?.marker) {
      const m = g.ui.marker;
      if (m.until > g.time) {
        ctx.fillStyle = '#e8d27a';
        ctx.beginPath(); ctx.arc(px(m.x), py(m.y), 2.5, 0, TAU); ctx.fill();
      }
    }
    // jogador
    ctx.save();
    ctx.translate(px(g.player.x), py(g.player.y));
    ctx.rotate(g.player.angle);
    ctx.fillStyle = '#f1f0dc';
    ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(-3, 3); ctx.lineTo(-3, -3); ctx.closePath(); ctx.fill();
    ctx.restore();
    // borda
    ctx.strokeStyle = 'rgba(180,190,160,0.25)'; ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
    ctx.restore();
  }
  drawFullMap(canvas) {
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
    // grade sutil
    ctx.strokeStyle = 'rgba(150,160,130,0.06)'; ctx.lineWidth = 1;
    for (let i = 0; i < w; i += 10) {
      ctx.beginPath(); ctx.moveTo(px(i * TILE), oy); ctx.lineTo(px(i * TILE), oy + h * scale); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox, py(i * TILE)); ctx.lineTo(ox + w * scale, py(i * TILE)); ctx.stroke();
    }
    // prédios/POIs descobertos
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
    // marcador de evento
    if (g.ui?.marker && g.ui.marker.until > g.time) {
      const m = g.ui.marker;
      ctx.fillStyle = '#f0d97a'; ctx.beginPath(); ctx.arc(px(m.x), py(m.y), 4, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(240,225,160,0.95)'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(m.label, px(m.x), py(m.y) - 8);
    }
    // jogador
    ctx.save();
    ctx.translate(px(g.player.x), py(g.player.y));
    ctx.rotate(g.player.angle);
    ctx.fillStyle = '#fffbe0';
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, 5); ctx.lineTo(-5, -5); ctx.closePath(); ctx.fill();
    ctx.restore();
    // legenda
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
  // __MORE__
}
