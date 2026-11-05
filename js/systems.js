import {
  clamp, lerp, dist, angleTo, angleDiff, randRange, randInt, chance, choose,
  TAU, isNight, uid,
} from './util.js';
import { ITEMS, ZOMBIE_TYPES, WEATHERS, EVENT_DEFS, BUILDABLES, SKILLS, CRAFT_RECIPES } from './data.js';
import { TILE, T } from './world.js';
import { audio } from './audio.js';

export const systems = {
  // ================== RUÍDO ==================
  emitNoise(x, y, radius, kind = 'som') {
    if (radius < 10) return;
    this.noiseRings.push({ x, y, r: 8, max: radius, life: 0.9, maxLife: 0.9, kind });
    if (this.noiseRings.length > 14) this.noiseRings.shift();
    const weatherNoise = (WEATHERS[this.weather] || WEATHERS.limpo).noise || 1;
    for (const z of this.zombies) {
      if (z.dead) continue;
      const d = dist(z.x, z.y, x, y);
      const hear = radius * weatherNoise * (0.65 + (z.hearing || 180) / 400);
      if (d < hear) {
        const seesSource = kind === 'tiro' || kind === 'veiculo';
        z.alert = Math.max(z.alert, seesSource ? 8 : 5);
        z.target = { x: x + randRange(this.world.rng, -28, 28), y: y + randRange(this.world.rng, -28, 28) };
        z.state = 'investigate';
        if (seesSource && d < hear * 1.25) {
          const target = this.zombieTarget(z);
          if (target) z.target = { x: target.x, y: target.y };
        }
      }
    }
    // saqueadores também investigam tiros
    if (kind === 'tiro' || kind === 'veiculo') {
      for (const n of this.npcs) {
        if (!n.alive || !n.hostile) continue;
        if (dist(n.x, n.y, x, y) < 700) { n.target = { x, y }; n.state = 'investigate'; n.alert = 6; }
      }
    }
  },

  updateNoiseRings(dt) {
    for (const r of this.noiseRings) { r.life -= dt; r.r = lerp(8, r.max, 1 - Math.max(0, r.life) / r.maxLife); }
    this.noiseRings = this.noiseRings.filter(r => r.life > 0);
  },

  // ================== PARTÍCULAS ==================
  addParticle(p) {
    this.particles.push({ life: 0.6, maxLife: 0.6, size: 3, color: '#fff', gravity: 0, drag: 0.98, ...p });
    if (this.particles.length > 650) this.particles.splice(0, 60);
  },

  burst(x, y, color, count = 8, speed = 70, opts = {}) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU, s = speed * (0.3 + Math.random() * 0.9);
      this.addParticle({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: randRange(this.world.rng, 0.25, 0.7), maxLife: 0.7,
        size: randRange(this.world.rng, 1.5, 4.2), color, gravity: opts.gravity ?? 0, drag: opts.drag ?? 0.92,
      });
    }
  },

  blood(x, y, angle, amount = 8) {
    for (let i = 0; i < amount; i++) {
      const a = angle + randRange(this.world.rng, -0.9, 0.9);
      const s = randRange(this.world.rng, 25, 140);
      this.addParticle({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: randRange(this.world.rng, 0.3, 0.8), maxLife: 0.8,
        size: randRange(this.world.rng, 1.5, 4.5), color: chance(this.world.rng, 0.25) ? '#5b1111' : '#8c1f1c',
        gravity: 80, drag: 0.9,
      });
    }
    if (this.bloodDecals.length < 180) {
      this.bloodDecals.push({
        x: x + randRange(this.world.rng, -8, 8), y: y + randRange(this.world.rng, -8, 8),
        r: randRange(this.world.rng, 4, 13), angle: Math.random() * TAU, alpha: randRange(this.world.rng, 0.25, 0.55), life: 90,
      });
    }
  },

  addFloater(x, y, text, color = '#fff', life = 1) {
    this.floaters.push({ x: x + randRange(this.world.rng, -6, 6), y, text, color, life, maxLife: life });
    if (this.floaters.length > 60) this.floaters.shift();
  },

  updateParticles(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      p.vy += (p.gravity || 0) * dt;
      p.vx *= p.drag ?? 0.98; p.vy *= p.drag ?? 0.98;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const b of this.bloodDecals) { b.life -= dt; b.alpha = Math.max(0, Math.min(0.55, b.alpha * 0.999)); }
    this.bloodDecals = this.bloodDecals.filter(b => b.life > 0);
    for (const c of this.corpses) c.time += dt;
    if (this.corpses.length > 45) this.corpses.splice(0, this.corpses.length - 45);
  },

  updateFloaters(dt) {
    for (const f of this.floaters) { f.life -= dt; f.y -= 24 * dt; }
    this.floaters = this.floaters.filter(f => f.life > 0);
  },

  // ================== COMBATE ==================
  attack() {
    const p = this.player;
    if (p.downed || p.dead) return;
    const stack = this.weaponStack;
    const def = stack ? ITEMS[stack.id] : null;
    const unarmed = !def || !def.weapon;
    const w = unarmed ? { name: 'Punhos', damage: 6, range: 34, cooldown: 0.62, noise: 30, arc: 1.35 } : def;
    const combat = p.skills.combate.level || 0;
    const armPenalty = 1 - (p.injuries.arm || 0) * 0.38;
    p.attackCd = (w.cooldown || 0.6) * (1 - Math.min(0.25, combat * 0.015));
    p.swing = 1;
    const staminaCost = w.gun ? 4 : 9;
    if (p.stamina < staminaCost) {
      this.ui?.notify('Sem fôlego para atacar. Respire ou ande.', 'warn', '😮‍💨');
      p.attackCd = 0.5;
      return;
    }
    p.stamina -= staminaCost;

    if (w.gun) {
      const ammo = this.countItem(w.ammo);
      if (ammo <= 0) {
        this.ui?.notify(`Sem munição (${ITEMS[w.ammo].name}).`, 'warn', '🔸');
        audio.play('empty');
        p.attackCd = 0.45;
        return;
      }
      this.removeItem(w.ammo, 1);
      this.stats.shots++;
      audio.play(w.name?.includes('Espingarda') ? 'shotgun' : 'gun');
      this.emitNoise(p.x, p.y, w.noise, 'tiro');
      this.shake = Math.min(10, this.shake + 3.5);
      // clarão
      this.addParticle({
        x: p.x + Math.cos(p.angle) * 24, y: p.y + Math.sin(p.angle) * 24,
        vx: Math.cos(p.angle) * 80, vy: Math.sin(p.angle) * 80,
        life: 0.1, maxLife: 0.1, size: 10, color: '#ffd27a', drag: 0.8,
      });
      const pellets = w.pellets || 1;
      const spread = w.spread || 0.025;
      const hitSet = new Set();
      for (let pellet = 0; pellet < pellets; pellet++) {
        const a = p.angle + randRange(this.world.rng, -spread, spread);
        const targets = pellets > 1 ? this.zombies.filter(z => !z.dead) : this.zombies;
        let best = null, bestD = w.range;
        for (const z of targets) {
          const d = dist(p.x, p.y, z.x, z.y);
          if (d > w.range) continue;
          if (pellets > 1 && Math.abs(angleDiff(a, angleTo(p.x, p.y, z.x, z.y))) > 0.28 + (z.size - 1) * 0.12) continue;
          if (pellets === 1 && Math.abs(angleDiff(a, angleTo(p.x, p.y, z.x, z.y))) > (0.06 + (z.size - 1) * 0.04)) continue;
          if (!this.world.lineOfSight(p.x, p.y, z.x, z.y)) continue;
          if (d < bestD) { bestD = d; best = z; }
        }
        if (best && !hitSet.has(best)) {
          hitSet.add(best);
          const falloff = w.pellets ? clamp(1.2 - bestD / w.range, 0.35, 1) : 1;
          const dmg = w.damage * falloff * armPenalty * (1 + combat * 0.035);
          this.damageZombie(best, dmg, { angle: a, head: chance(this.world.rng, 0.12) });
        }
      }
      if (!hitSet.size) {
        // errou: poeira no ponto de impacto aproximado
        const d = Math.min(w.range, 250);
        const hx = p.x + Math.cos(p.angle) * d, hy = p.y + Math.sin(p.angle) * d;
        this.burst(hx, hy, '#c9b88a', 4, 40);
      }
      if (stack && def.durability) {
        stack.condition = Math.max(0, (stack.condition ?? 1) - 1 / def.durability);
        if (stack.condition <= 0) this.breakWeapon(stack);
      }
      this.grantSkill('combate', 5);
      this.spendGameMinutes(0.3);
      return;
    }

    // corpo a corpo
    audio.play('swing');
    this.emitNoise(p.x, p.y, w.noise * (1 - (p.skills.furtividade.level || 0) * 0.02), 'golpe');
    let hit = 0;
    const reach = w.range;
    for (const z of this.zombies) {
      if (z.dead) continue;
      const d = dist(p.x, p.y, z.x, z.y);
      if (d > reach + z.size * 8) continue;
      const a = angleTo(p.x, p.y, z.x, z.y);
      if (Math.abs(angleDiff(p.angle, a)) > (w.arc || 1.4) / 2) continue;
      if (!this.world.lineOfSight(p.x, p.y, z.x, z.y)) continue;
      const cond = stack ? clamp(stack.condition ?? 1, 0.2, 1) : 1;
      const dmg = w.damage * armPenalty * cond * (1 + combat * 0.055) * (p.stamina < 10 ? 0.6 : 1);
      this.damageZombie(z, dmg, { angle: a });
      hit++;
      if (hit >= 3) break;
    }
    // saqueadores
    for (const n of this.npcs) {
      if (!n.alive || !n.hostile) continue;
      const d = dist(p.x, p.y, n.x, n.y);
      if (d > reach + 10) continue;
      if (Math.abs(angleDiff(p.angle, angleTo(p.x, p.y, n.x, n.y))) > (w.arc || 1.4) / 2) continue;
      const cond = stack ? clamp(stack.condition ?? 1, 0.2, 1) : 1;
      this.damageNPC(n, w.damage * armPenalty * cond * (1 + combat * 0.055), 'player');
      hit++;
    }
    if (hit > 0) {
      audio.play('hit_flesh');
      this.shake = Math.min(6, this.shake + 1.5);
      if (stack && def.durability) {
        stack.condition = Math.max(0, (stack.condition ?? 1) - 1 / def.durability);
        if (stack.condition <= 0) this.breakWeapon(stack);
      }
      this.grantSkill('combate', 3 + hit);
    } else {
      const missX = p.x + Math.cos(p.angle) * 34, missY = p.y + Math.sin(p.angle) * 34;
      this.burst(missX, missY, '#8d8a70', 2, 20);
    }
    this.grantSkill('condicionamento', 1);
  },

  breakWeapon(stack) {
    const i = this.player.inventory.indexOf(stack);
    if (i >= 0) this.player.inventory.splice(i, 1);
    this.ui?.notify(`Sua ${ITEMS[stack.id]?.name || 'arma'} quebrou de vez.`, 'danger', '🧨');
    this.player.capacity = this.calcCapacity();
  },

  damageZombie(z, amount, opts = {}) {
    if (z.dead) return;
    z.hp -= amount;
    z.hitFlash = 1;
    z.alert = 9;
    if (this.player) z.target = { x: this.player.x, y: this.player.y };
    this.addFloater(z.x, z.y - 20 * z.size, `${Math.round(amount)}`, opts.head ? '#ffd166' : '#f0e6d2', 0.7);
    this.blood(z.x, z.y, opts.angle ?? this.player.angle, opts.head ? 12 : 7);
    audio.play('hit_flesh');
    if (this.mp && !this.isHost) this.mp.send({ t: 'hitZombie', zid: z.id, dmg: amount, head: !!opts.head });
    if (z.hp <= 0) this.killZombie(z);
  },

  killZombie(z) {
    if (z.dead) return;
    z.dead = true;
    const i = this.zombies.indexOf(z);
    if (i >= 0) this.zombies.splice(i, 1);
    this.corpses.push({ x: z.x, y: z.y, angle: z.angle, type: z.type, size: z.size, time: 0 });
    this.stats.kills++;
    this.player.kills++;
    this.addXP(z.xp || 10);
    this.grantSkill('combate', (z.xp || 10) * 0.9);
    this.blood(z.x, z.y, z.angle, 16);
    audio.play('zombie_die');
    if (this.mp?.isHost) this.mp.send({ t: 'zombieDied', zid: z.id });
    // saque
    if (chance(this.world.rng, 0.38)) {
      const bag = this.world.rollLoot('caixa', 0.5);
      for (const it of bag) this.groundItems.push({ id: uid('gi'), x: z.x + randRange(this.world.rng, -12, 12), y: z.y + randRange(this.world.rng, -12, 12), stack: it });
    }
    if (this.ui) this.ui.hudDirty = true;
  },

  breakWeaponDurabilityCheck(stack) {},

  damageNPC(npc, amount, source = 'zumbi') {
    if (!npc.alive) return;
    npc.hp -= amount;
    npc.hitFlash = 1;
    npc.alert = 8;
    this.blood(npc.x, npc.y, Math.random() * TAU, 6);
    this.addFloater(npc.x, npc.y - 26, `${Math.round(amount)}`, '#ffb3a7', 0.8);
    if (npc.hp <= 0) this.killNPC(npc, source);
  },

  killNPC(npc, source) {
    npc.alive = false;
    const i = this.npcs.indexOf(npc);
    if (i >= 0) this.npcs.splice(i, 1);
    this.corpses.push({ x: npc.x, y: npc.y, angle: npc.angle, type: 'npc', size: 1, time: 0 });
    for (const it of npc.trade || []) this.groundItems.push({ id: uid('gi'), x: npc.x + randRange(this.world.rng, -14, 14), y: npc.y + randRange(this.world.rng, -14, 14), stack: it });
    if (npc.following) this.ui?.notify(`${npc.name} morreu. O silêncio pesa mais agora.`, 'danger', '🕯️');
    else this.ui?.notify(`Um sobrevivente caiu${source === 'player' ? ' pela sua mão' : ''}.`, 'warn', '🕯️');
    if (source === 'player') { this.addXP(30); this.stats.kills++; }
    this.ui?.chatPush?.({ system: true, text: `${npc.name} não está mais entre nós.` });
  },

  // ================== ZUMBIS ==================
  updateZombies(dt) {
    if (this.mp && !this.isHost) return this.clientZombieContact(dt);
    const p = this.player;
    for (const z of [...this.zombies]) {
      if (z.dead) continue;
      z.anim += dt * (z.state === 'chase' ? 3.2 : 1.4);
      z.hitFlash = Math.max(0, z.hitFlash - dt * 3.5);
      z.attackCd = Math.max(0, z.attackCd - dt);
      z.trapCd = Math.max(0, z.trapCd - dt);
      z.blockCd = Math.max(0, (z.blockCd || 0) - dt);
      z.groanCd -= dt;
      if (z.groanCd <= 0) {
        z.groanCd = randRange(this.world.rng, 5, 16);
        if (dist(z.x, z.y, p.x, p.y) < 700) audio.play('zombie');
      }
      z.senseCd = (z.senseCd || 0) - dt;
      z.lastX = z.x; z.lastY = z.y;
      const target = this.zombieTarget(z);
      if (z.senseCd <= 0) {
        z.senseCd = 0.22 + Math.random() * 0.14;
        const detected = this.zombieDetect(z, target);
        if (detected) { z.alert = 7; z.target = { x: target.x, y: target.y }; z.state = 'chase'; }
      }
      if (z.alert > 0) z.alert -= dt;
      if (z.target && z.alert > 0 && target) {
        // atualiza posição do alvo enquanto persegue
        z.target.x = target.x; z.target.y = target.y;
        z.state = dist(z.x, z.y, target.x, target.y) < 34 + z.size * 10 ? 'attack' : 'chase';
      } else if (z.alert <= 0) {
        z.target = null;
        if (z.state === 'chase' || z.state === 'investigate') z.state = 'idle';
      }

      let moved = false;
      if (z.target && z.alert > 0) {
        const d = dist(z.x, z.y, z.target.x, z.target.y);
        if (d > 24 + z.size * 8 && z.state !== 'attack') {
          const a = angleTo(z.x, z.y, z.target.x, z.target.y);
          z.angle = a;
          const speed = z.speed * (z.state === 'chase' ? 1 : 0.72);
          const before = { x: z.x, y: z.y };
          this.moveEntity(z, Math.cos(a) * speed * dt, Math.sin(a) * speed * dt, 9 * z.size);
          moved = dist(before.x, before.y, z.x, z.y) > speed * dt * 0.25;
        }
        if (d < 44 + z.size * 8 && target) {
          if (target.kind === 'player' && z.attackCd <= 0) {
            this.zombieAttackPlayer(z);
          } else if (target.kind === 'npc' && z.attackCd <= 0) {
            this.damageNPC(target.ref, z.damage * 0.8, 'zumbi');
            z.attackCd = 1.2;
            z.lunge = 1;
          } else if (target.kind === 'remote' && z.attackCd <= 0) {
            this.mp?.send({ t: 'zombieHit', target: target.ref.id, dmg: z.damage });
            z.attackCd = 1.2;
          }
        }
      } else {
        // vagar
        z.idleTimer -= dt;
        if (z.idleTimer <= 0) {
          z.idleTimer = randRange(this.world.rng, 2, 8);
          if (chance(this.world.rng, 0.55)) {
            z.wander = {
              x: z.home.x + randRange(this.world.rng, -230, 230),
              y: z.home.y + randRange(this.world.rng, -230, 230),
            };
          } else z.wander = null;
        }
        if (z.wander) {
          const d = dist(z.x, z.y, z.wander.x, z.wander.y);
          if (d < 14) z.wander = null;
          else {
            const a = angleTo(z.x, z.y, z.wander.x, z.wander.y);
            z.angle = a;
            const before = { x: z.x, y: z.y };
            this.moveEntity(z, Math.cos(a) * z.speed * 0.38 * dt, Math.sin(a) * z.speed * 0.38 * dt, 9 * z.size);
            moved = dist(before.x, before.y, z.x, z.y) > z.speed * 0.38 * dt * 0.25;
            if (!moved) z.wander = null;
          }
        }
      }
      // obstáculo à frente: atacar porta, janela, barricada ou parede
      if (!moved && z.target && z.alert > 0) {
        z.stuck = (z.stuck || 0) + dt;
        if (z.stuck > 0.25 && z.blockCd <= 0) {
          if (this.zombieAttackBlocker(z)) z.stuck = 0;
          z.blockCd = 0.8;
        }
      } else z.stuck = 0;
      z.lunge = Math.max(0, (z.lunge || 0) - dt * 4);
      // armadilhas
      if (z.trapCd <= 0) {
        for (const s of this.world.structures) {
          if (s.type !== 'armadilha' || s.hp <= 0) continue;
          if (dist(z.x, z.y, s.x * TILE + 16, s.y * TILE + 16) < 26) {
            this.damageZombie(z, 48, { angle: z.angle });
            s.hp -= 18;
            z.trapCd = 2;
            audio.play('hit');
            if (s.hp <= 0) this.destroyStructure(s, false);
            break;
          }
        }
      }
      // luz / fogo
      if (dist(z.x, z.y, p.x, p.y) < 34 && !p.inVehicle && z.attackCd <= 0 && z.state === 'chase') this.zombieAttackPlayer(z);
    }

    // separação entre zumbis (evita pilha)
    const alive = this.zombies;
    for (let i = 0; i < alive.length; i++) {
      const a = alive[i];
      for (let j = i + 1; j < alive.length; j++) {
        const b = alive[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const min = 17 * (a.size + b.size);
        if (d2 > 0.1 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = (min - d) * 0.5;
          const nx = dx / d, ny = dy / d;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
        }
      }
    }
  },

  clientZombieContact(dt) {
    // O anfitrião é autoritativo para o dano. O cliente apenas anima os zumbis
    // sincronizados e deixa os ataques chegarem por "zombieHit".
    for (const z of this.zombies) {
      if (z.dead) continue;
      z.anim = (z.anim || 0) + dt * (z.state === 'chase' ? 3.2 : 1.4);
      z.hitFlash = Math.max(0, z.hitFlash - dt * 3.5);
      z.attackCd = Math.max(0, (z.attackCd || 0) - dt);
    }
  },

  zombieTarget(z) {
    const p = this.player;
    let best = null, bd = 1e9;
    if (!p.dead && !p.downed) { best = { kind: 'player', ref: p, x: p.x, y: p.y }; bd = dist(z.x, z.y, p.x, p.y); }
    for (const rp of this.remotePlayers.values()) {
      if (rp.downed) continue;
      const d = dist(z.x, z.y, rp.x, rp.y);
      if (d < bd) { bd = d; best = { kind: 'remote', ref: rp, x: rp.x, y: rp.y }; }
    }
    for (const n of this.npcs) {
      if (!n.alive) continue;
      const d = dist(z.x, z.y, n.x, n.y);
      if (d < bd && d < 900) { bd = d; best = { kind: 'npc', ref: n, x: n.x, y: n.y }; }
    }
    return best;
  },

  zombieDetect(z, target) {
    if (!target) return false;
    const p = this.player;
    const d = dist(z.x, z.y, target.x, target.y);
    const vision = (WEATHERS[this.weather] || WEATHERS.limpo).vision;
    let sight = (ZOMBIE_TYPES[z.type]?.sight || 220) * vision;
    if (target.kind === 'player') {
      if (p.flashlight) sight *= 1.35;
      if (this.input.sneak) sight *= 0.62;
      if (p.inVehicle) sight = Math.max(sight, 500);
    }
    if (d > sight) return false;
    if (d > 75) {
      const angleToTarget = angleTo(z.x, z.y, target.x, target.y);
      if (Math.abs(angleDiff(z.angle, angleToTarget)) > 1.15) return false;
    }
    if (!this.world.lineOfSight(z.x, z.y, target.x, target.y)) return false;
    return true;
  },

  zombieAttackPlayer(z) {
    const p = this.player;
    z.attackCd = randRange(this.world.rng, 0.9, 1.35);
    z.lunge = 1;
    audio.play('zombie');
    if (p.inVehicle) {
      const v = p.inVehicle;
      v.condition = Math.max(0, v.condition - z.damage * 0.35);
      v.speed *= 0.7;
      this.ui?.notify('Zumbis estão batendo no veículo!', 'warn', '🚗');
      return;
    }
    this.damagePlayer(z.damage * randRange(this.world.rng, 0.85, 1.15), 'zumbi');
    const knock = 16;
    this.moveEntity(p, Math.cos(z.angle) * knock, Math.sin(z.angle) * knock, 10);
  },

  zombieAttackBlocker(z) {
    // encontra porta, janela ou estrutura na frente imediata
    let blocker = null, bd = 56;
    for (const d of this.world.doors.values()) {
      const px = d.x * TILE + 16, py = d.y * TILE + 16;
      const dd = dist(z.x, z.y, px, py);
      if (dd < bd) {
        const a = angleTo(z.x, z.y, px, py);
        if (Math.abs(angleDiff(z.angle, a)) < 1.2) { bd = dd; blocker = { kind: 'door', ref: d, x: px, y: py }; }
      }
    }
    for (const w of this.world.windows.values()) {
      const px = w.x * TILE + 16, py = w.y * TILE + 16;
      const dd = dist(z.x, z.y, px, py);
      if (dd < bd) {
        const a = angleTo(z.x, z.y, px, py);
        if (Math.abs(angleDiff(z.angle, a)) < 1.2) { bd = dd; blocker = { kind: 'window', ref: w, x: px, y: py }; }
      }
    }
    for (const s of this.world.structures) {
      if (!['parede', 'muro_metal', 'cerca', 'barricada', 'reforco_metal'].includes(s.type)) continue;
      if (s.portal) continue;
      const px = s.x * TILE + 16, py = s.y * TILE + 16;
      const dd = dist(z.x, z.y, px, py);
      if (dd < bd) {
        const a = angleTo(z.x, z.y, px, py);
        if (Math.abs(angleDiff(z.angle, a)) < 1.2) { bd = dd; blocker = { kind: 'structure', ref: s, x: px, y: py }; }
      }
    }
    // barricadas em portais primeiro
    for (const s of this.world.structures) {
      if (!s.portal) continue;
      const px = s.x * TILE + 16, py = s.y * TILE + 16;
      const dd = dist(z.x, z.y, px, py);
      if (dd < 62) { blocker = { kind: 'structure', ref: s, x: px, y: py }; break; }
    }
    if (!blocker) return false;
    if (Math.abs(angleDiff(z.angle, angleTo(z.x, z.y, blocker.x, blocker.y))) > 1.4) return false;
    this.damageBlocker(z, blocker);
    return true;
  },

  damageBlocker(z, blocker) {
    const dmg = 15 + z.damage * 0.9;
    z.lunge = 1;
    if (blocker.kind === 'structure') {
      const s = blocker.ref;
      s.hp -= dmg;
      this.burst(blocker.x, blocker.y, '#8b6f4e', 4, 40);
      audio.play('hit');
      if (s.hp <= 0) {
        this.destroyStructure(s, true);
        this.ui?.notify('Uma barreira foi destruída!', 'danger', '🧱');
        audio.play('door_break');
      }
    } else if (blocker.kind === 'door') {
      const d = blocker.ref;
      if (this.world.portalStructures.has(d.x + ',' + d.y)) return;
      d.hp -= dmg;
      audio.play('hit');
      this.burst(blocker.x, blocker.y, '#7a5b3c', 3, 30);
      if (d.hp <= 0) {
        d.open = true; d.broken = true;
        audio.play('door_break');
        this.ui?.notify('Uma porta cedeu à horda.', 'danger', '🚪');
      }
    } else if (blocker.kind === 'window') {
      const w = blocker.ref;
      if (this.world.portalStructures.has(w.x + ',' + w.y)) return;
      w.hp -= dmg;
      audio.play('hit');
      this.burst(blocker.x, blocker.y, '#9bb6be', 4, 40);
      if (w.hp <= 0) {
        w.broken = true;
        audio.play('door_break');
        this.ui?.notify('Uma janela foi quebrada.', 'warn', '🪟');
      }
    }
  },

  // ================== VEÍCULOS ==================
  updateVehicles(dt) {
    for (const v of this.world.vehicles) {
      if (!v.occupied) continue;
      const inp = this.input;
      let throttle = (inp.up ? 1 : 0) - (inp.down ? 1 : 0);
      const steer = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      const engineOk = v.fuel > 0 && v.condition > 0;
      if (!engineOk) throttle = 0;
      v.engineOn = engineOk;
      if (!v.engineOn) v.speed *= Math.max(0, 1 - dt * 1.4);
      if (v.engineOn) {
        if (throttle > 0) v.speed += 130 * dt;
        else if (throttle < 0) v.speed -= (v.speed > 0 ? 220 : 110) * dt;
        else v.speed *= Math.max(0, 1 - dt * 0.8);
        v.speed = clamp(v.speed, -80, 245);
        v.fuel = Math.max(0, v.fuel - Math.abs(v.speed) * 0.00016 * dt);
        const steerFactor = clamp(Math.abs(v.speed) / 80, 0, 1);
        v.angle += steer * 2.1 * dt * steerFactor * (v.speed < 0 ? -1 : 1);
      } else {
        v.speed *= Math.max(0, 1 - dt * 2);
        if (v.fuel <= 0 && v.engineOn === false && inp.up) {
          if (!v.emptyWarned) { v.emptyWarned = true; this.ui?.notify('O tanque está vazio. Encontre combustível.', 'warn', '⛽'); }
        }
      }
      const dx = Math.cos(v.angle) * v.speed * dt;
      const dy = Math.sin(v.angle) * v.speed * dt;
      const nx = v.x + dx, ny = v.y + dy;
      const hit = this.world.collidesCircle(nx + Math.cos(v.angle) * v.w * 0.35, ny + Math.sin(v.angle) * v.w * 0.35, 12, v);
      if (hit) {
        if (Math.abs(v.speed) > 40) {
          audio.play('car_hit');
          this.shake = Math.min(14, this.shake + Math.abs(v.speed) * 0.05);
          v.condition = Math.max(0, v.condition - Math.abs(v.speed) * 0.022);
          this.burst(nx, ny, '#c9b88a', 8, 80);
          this.ui?.notify(Math.abs(v.speed) > 150 ? 'Batida forte! O veículo sofreu danos.' : 'Você raspou em algo.', 'warn', '💥');
          if (v.condition <= 0) this.ui?.notify('O motor morreu. O veículo está inutilizado.', 'danger', '🔧');
        }
        v.speed = -v.speed * 0.22;
      } else {
        v.x = nx; v.y = ny;
      }
      v.x = clamp(v.x, 20, this.world.w * TILE - 20);
      v.y = clamp(v.y, 20, this.world.h * TILE - 20);
      this.player.x = v.x; this.player.y = v.y; this.player.angle = v.angle;
      // atropelamento
      if (Math.abs(v.speed) > 45) {
        for (const z of [...this.zombies]) {
          if (z.dead) continue;
          if (this.world.collidesRotRect(z.x, z.y, z.size * 12, v)) {
            this.damageZombie(z, 40 + Math.abs(v.speed) * 0.45, { angle: v.angle, head: false });
            v.condition = Math.max(0, v.condition - 0.8);
            v.speed *= 0.9;
            audio.play('car_hit');
            this.shake = Math.min(12, this.shake + 3);
          }
        }
        // atropelar NPCs hostis
        for (const n of [...this.npcs]) {
          if (!n.alive || !n.hostile) continue;
          if (this.world.collidesRotRect(n.x, n.y, 12, v)) this.damageNPC(n, 60, 'veiculo');
        }
      }
      // ruído do motor
      v.noiseTimer = (v.noiseTimer || 0) - dt;
      if (v.noiseTimer <= 0 && v.engineOn) {
        v.noiseTimer = 0.45;
        this.emitNoise(v.x, v.y, 560, 'veiculo');
      }
      // fumaça quando danificado
      if (v.condition < 35 && v.engineOn && chance(this.world.rng, dt * 8)) {
        this.addParticle({ x: v.x + Math.cos(v.angle) * 16, y: v.y + Math.sin(v.angle) * 16, vx: randRange(this.world.rng, -10, 10), vy: -18, life: 1.4, maxLife: 1.4, size: randRange(this.world.rng, 2, 5), color: '#555', gravity: -4, drag: 0.99 });
      }
      this.stats.distance += Math.abs(v.speed) * dt;
    }
  },

  enterVehicle(v) {
    const p = this.player;
    if (v.occupied) return;
    v.occupied = true;
    v.engineOn = v.fuel > 0 && v.condition > 0;
    p.inVehicle = v;
    this.completeObjective('vehicle');
    audio.play('car_start');
    this.emitNoise(v.x, v.y, 200, 'veiculo');
    this.ui?.notify(v.condition > 0 ? `${v.type} ligado. Combustível: ${Math.round(v.fuel)}%. Cuidado com o barulho.` : 'O veículo não liga.', v.condition > 0 ? 'good' : 'warn', '🚗');
    this.ui?.refreshHUD();
  },

  exitVehicle() {
    const p = this.player;
    const v = p.inVehicle;
    if (!v) return;
    v.occupied = false; v.engineOn = false; v.speed = 0;
    p.inVehicle = null;
    let placed = false;
    for (const a of [v.angle + Math.PI / 2, v.angle - Math.PI / 2, v.angle + Math.PI, v.angle]) {
      const x = v.x + Math.cos(a) * (v.h / 2 + 24);
      const y = v.y + Math.sin(a) * (v.h / 2 + 24);
      if (!this.world.collidesCircle(x, y, 10)) { p.x = x; p.y = y; placed = true; break; }
    }
    if (!placed) { p.x = v.x; p.y = v.y; }
    audio.play('ui');
    this.ui?.refreshHUD();
  },

  refuelVehicle() {
    const v = this.world.vehicleNear(this.player.x, this.player.y, 85);
    if (!v) { this.ui?.notify('Nenhum veículo por perto.', 'warn', '🚗'); return; }
    if (this.countItem('combustivel') <= 0) { this.ui?.notify('Você não tem um galão de combustível.', 'warn', '⛽'); return; }
    const max = v.maxFuel || 60;
    if (v.fuel >= max - 1) { this.ui?.notify('O tanque já está cheio.', 'info', '⛽'); return; }
    this.removeItem('combustivel', 1);
    v.fuel = Math.min(max, v.fuel + ITEMS.combustivel.fuel);
    audio.play('drink');
    this.ui?.notify(`Abastecido: ${Math.round(v.fuel)}/${max}.`, 'good', '⛽');
  },

  repairVehicle() {
    const v = this.world.vehicleNear(this.player.x, this.player.y, 85);
    if (!v) { this.ui?.notify('Nenhum veículo por perto.', 'warn', '🚗'); return; }
    if (v.condition >= 99) { this.ui?.notify('O veículo está em bom estado.', 'info', '🔧'); return; }
    if (!this.hasTool('chave_inglesa', 'martelo')) { this.ui?.notify('Você precisa de uma chave inglesa ou martelo.', 'warn', '🔧'); return; }
    if (this.countItem('pecas') < 1) { this.ui?.notify('Você precisa de peças de motor.', 'warn', '⚙️'); return; }
    this.removeItem('pecas', 1);
    const skill = this.player.skills.mecanica.level || 0;
    const repair = 18 + skill * 7;
    v.condition = Math.min(v.maxCondition || 100, v.condition + repair);
    this.grantSkill('mecanica', 14);
    this.spendGameMinutes(30);
    audio.play('build');
    this.ui?.notify(`Conserto concluído (+${Math.round(repair)}%). Condição: ${Math.round(v.condition)}%.`, 'good', '🔧');
  },

  openTrunk(v) {
    if (!v) v = this.world.vehicleNear(this.player.x, this.player.y, 85);
    if (!v) { this.ui?.notify('Nenhum veículo por perto.', 'warn', '🚗'); return; }
    this.lootOpen = { kind: 'trunk', ref: v, title: `Porta-malas — ${v.type}`, items: v.trunk };
    this.ui?.openLoot(this.lootOpen);
  },

  // ================== NPCs ==================
  updateNPCs(dt) {
    const p = this.player;
    for (const n of [...this.npcs]) {
      if (!n.alive) continue;
      n.anim += dt;
      n.hitFlash = Math.max(0, n.hitFlash - dt * 3);
      n.attackCd = Math.max(0, n.attackCd - dt);
      n.alert = Math.max(0, (n.alert || 0) - dt);
      if (n.hostile) {
        const d = dist(n.x, n.y, p.x, p.y);
        if (d < 460 && !p.downed && this.world.lineOfSight(n.x, n.y, p.x, p.y)) { n.target = { x: p.x, y: p.y }; n.alert = 5; }
        if (n.alert > 0 && !p.downed) {
          if (n.weapon === 'pistola' && d > 80 && d < 430) {
            n.angle = angleTo(n.x, n.y, p.x, p.y);
            if (n.attackCd <= 0) {
              n.attackCd = randRange(this.world.rng, 1.2, 2.1);
              audio.play('gun');
              this.emitNoise(n.x, n.y, 750, 'tiro');
              this.addParticle({ x: n.x + Math.cos(n.angle) * 20, y: n.y + Math.sin(n.angle) * 20, vx: Math.cos(n.angle) * 60, vy: Math.sin(n.angle) * 60, life: 0.1, maxLife: 0.1, size: 8, color: '#ffd27a' });
              if (chance(this.world.rng, 0.68)) this.damagePlayer(randRange(this.world.rng, 8, 15), 'saqueador');
              this.addFloater(n.x, n.y - 30, 'SAQUEADOR', '#ff8c7a', 1);
            }
          } else if (d < 42) {
            if (n.attackCd <= 0) { n.attackCd = 1.1; this.damagePlayer(randRange(this.world.rng, 7, 13), 'saqueador'); }
          } else {
            this.npcMoveTo(n, p.x, p.y, n.speed, dt);
          }
        } else if (!n.wander || dist(n.x, n.y, n.wander.x, n.wander.y) < 20) {
          if (!n.wander || chance(this.world.rng, dt * 0.3)) n.wander = { x: n.home.x + randRange(this.world.rng, -180, 180), y: n.home.y + randRange(this.world.rng, -180, 180) };
          if (n.wander) this.npcMoveTo(n, n.wander.x, n.wander.y, n.speed * 0.4, dt);
        }
      } else {
        // aliado ou civil
        const z = this.nearestZombie(n.x, n.y, n.following ? 320 : 220);
        if (n.following && z && dist(n.x, n.y, z.x, z.y) < 240) {
          if (dist(n.x, n.y, z.x, z.y) < 38) {
            if (n.attackCd <= 0) {
              n.attackCd = 0.9;
              this.damageZombie(z, 20, { angle: angleTo(n.x, n.y, z.x, z.y) });
              audio.play('hit');
            }
          } else this.npcMoveTo(n, z.x, z.y, 130, dt);
        } else if (n.following) {
          const d = dist(n.x, n.y, p.x, p.y);
          if (d > 85) this.npcMoveTo(n, p.x, p.y, Math.min(150, 70 + d * 0.25), dt);
          else if (d < 45) { /* mantém distância */ }
          n.home = { x: p.x, y: p.y };
        } else {
          // civil: foge de zumbis próximos, senão vagueia
          const danger = this.nearestZombie(n.x, n.y, 200);
          if (danger && n.hp < 70) {
            const away = angleTo(danger.x, danger.y, n.x, n.y);
            this.moveEntity(n, Math.cos(away) * 110 * dt, Math.sin(away) * 110 * dt, 9);
            n.angle = away;
          } else {
            n.idleTimer -= dt;
            if (n.idleTimer <= 0) {
              n.idleTimer = randRange(this.world.rng, 2, 7);
              n.wander = chance(this.world.rng, 0.65) ? { x: n.home.x + randRange(this.world.rng, -160, 160), y: n.home.y + randRange(this.world.rng, -160, 160) } : null;
            }
            if (n.wander) {
              if (dist(n.x, n.y, n.wander.x, n.wander.y) < 18) n.wander = null;
              else this.npcMoveTo(n, n.wander.x, n.wander.y, n.speed, dt);
            }
          }
        }
      }
    }
  },

  npcMoveTo(n, tx, ty, speed, dt) {
    const a = angleTo(n.x, n.y, tx, ty);
    n.angle = a;
    const dx = Math.cos(a) * speed * dt, dy = Math.sin(a) * speed * dt;
    const before = { x: n.x, y: n.y };
    this.moveEntity(n, dx, dy, 9);
    if (dist(before.x, before.y, n.x, n.y) < 0.2) {
      // desvia
      this.moveEntity(n, Math.cos(a + 1.2) * speed * dt, Math.sin(a + 1.2) * speed * dt, 9);
    }
  },

  // ================== ESTRUTURAS ==================
  updateStructures(dt) {
    const raining = ['chuva', 'tempestade'].includes(this.weather);
    for (const s of [...this.world.structures]) {
      if (s.type === 'canteiro') {
        if (!s.crop) continue;
        const agri = this.player.skills.agricultura.level || 0;
        const grow = dt * 1.4 * (raining ? 1.35 : 1) * (1 + agri * 0.035) * (s.fertilized ? 1.5 : 1);
        s.growth = (s.growth || 0) + grow;
        const need = s.crop === 'abobora' ? 4400 : 3600;
        s.ready = s.growth >= need;
      } else if (s.type === 'coletor') {
        if (raining) {
          s.water = Math.min(3, (s.water || 0) + dt * 0.012 * (this.weather === 'tempestade' ? 1.6 : 1));
        }
      } else if (s.type === 'fogueira') {
        s.lit = true;
        if (chance(this.world.rng, dt * 7)) {
          this.addParticle({
            x: s.x * TILE + 16 + randRange(this.world.rng, -5, 5), y: s.y * TILE + 18,
            vx: randRange(this.world.rng, -5, 5), vy: randRange(this.world.rng, -28, -14),
            life: randRange(this.world.rng, 0.5, 1.2), maxLife: 1.2, size: randRange(this.world.rng, 2, 5),
            color: choose(this.world.rng, ['#ff9f43', '#ffcf5c', '#e05a2b']), gravity: -8, drag: 0.98,
          });
        }
      }
    }
  },

  destroyStructure(s, dropLoot = true) {
    this.world.removeStructure(s);
    this.burst(s.x * TILE + 16, s.y * TILE + 16, s.type === 'muro_metal' ? '#8a8f94' : '#8b6f4e', 10, 60);
    if (dropLoot && s.storage?.length && s.storage.length) {
      for (const it of s.storage) this.groundItems.push({ id: uid('gi'), x: s.x * TILE + 16, y: s.y * TILE + 16, stack: it });
    }
  },

  // ================== EVENTOS ==================
  updateEvents(dt) {
    if (!this.isHost) return;
    if (this.eventCountdown === undefined) this.eventCountdown = 180;
    this.eventCountdown -= dt * 1.4;
    if (this.eventCountdown <= 0) {
      this.eventCountdown = randRange(this.world.rng, 140, 320);
      this.triggerRandomEvent();
    }
    // limpando corpos antigos
    if (this.bloodDecals.length > 180) this.bloodDecals.splice(0, 30);
  },

  triggerRandomEvent() {
    const night = isNight(this.time);
    const entries = [
      ['horda', night ? 34 : 20],
      ['suprimentos', 18],
      ['tempestade', 10],
      ['saqueadores', night ? 22 : 14],
      ['viajante', 18],
      ['caravana', 12],
    ];
    let total = entries.reduce((s, e) => s + e[1], 0), r = this.world.rng() * total;
    let kind = 'suprimentos';
    for (const [k, w] of entries) { r -= w; if (r <= 0) { kind = k; break; } }
    this.fireEvent(kind);
  },

  fireEvent(kind) {
    const def = EVENT_DEFS[kind] || EVENT_DEFS.suprimentos;
    this.ui?.eventBanner(def);
    this.ui?.chatPush?.({ system: true, text: `${def.icon} ${def.title}` });
    const p = this.player;
    if (kind === 'horda') {
      const count = randInt(this.world.rng, 9, 16) + Math.floor(this.day * 0.4);
      const baseA = Math.random() * TAU;
      for (let i = 0; i < count; i++) {
        const a = baseA + randRange(this.world.rng, -0.9, 0.9);
        const d = randRange(this.world.rng, 520, 900);
        let x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
        const spot = this.world.randomWalkableNear(x, y, 160);
        const z = this.spawnZombie(spot.x, spot.y, this.pickZombieType());
        z.alert = 12; z.target = { x: p.x, y: p.y }; z.state = 'chase';
      }
      audio.play('zombie');
      this.emitNoise(p.x, p.y, 200, 'horda');
      this.ui?.notify('Uma horda está se aproximando. Barrique as portas ou fuja!', 'danger', '🧟');
    } else if (kind === 'suprimentos') {
      const a = Math.random() * TAU, d = randRange(this.world.rng, 280, 520);
      const spot = this.world.randomWalkableNear(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 150);
      const tx = Math.floor(spot.x / TILE), ty = Math.floor(spot.y / TILE);
      const c = {
        id: 'ct' + (++this.world.containerId), type: 'caixa_suprimentos', x: tx, y: ty, building: 0,
        searched: false, items: this.world.rollLoot('caixa_suprimentos', 1.6), icon: '🎁',
        name: 'Caixa de suprimentos', solid: true,
      };
      this.world.containers.push(c);
      this.world.gridAdd({ kind: 'container', x: tx, y: ty, ref: c, solid: true });
      this.ui?.notify('Uma caixa de suprimentos foi deixada perto daqui. Siga o marcador.', 'good', '🎁');
      this.ui?.setMarker({ x: spot.x, y: spot.y, icon: '🎁', label: 'Suprimentos', until: this.time + 180 });
    } else if (kind === 'tempestade') {
      this.weather = 'tempestade';
      this.weatherTimer = randRange(this.world.rng, 90, 160);
      this.applyWeatherAudio();
      this.flash = 0.8;
      audio.play('thunder');
      this.player.wet = Math.min(100, this.player.wet + 25);
    } else if (kind === 'saqueadores') {
      const n = randInt(this.world.rng, 2, 4);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, d = randRange(this.world.rng, 380, 650);
        const spot = this.world.randomWalkableNear(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 120);
        const npc = this.spawnNPC(spot.x, spot.y, {
          name: 'Saqueador', personality: 'hostil', hostile: true,
        });
        npc.weapon = chance(this.world.rng, 0.4) ? 'pistola' : 'cano';
        npc.alert = 8; npc.target = { x: p.x, y: p.y };
      }
      this.ui?.notify('Saqueadores foram vistos na área. Eles não vieram conversar.', 'danger', '🏴');
    } else if (kind === 'viajante') {
      const a = Math.random() * TAU, d = randRange(this.world.rng, 300, 480);
      const spot = this.world.randomWalkableNear(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 120);
      this.spawnNPC(spot.x, spot.y, { personality: 'nervoso', line: 'Por favor, você tem água? Estou perdido.' });
      this.ui?.notify('Um sobrevivente se aproxima. Talvez ele tenha algo útil.', 'info', '🧑');
    } else if (kind === 'caravana') {
      const a = Math.random() * TAU, d = randRange(this.world.rng, 320, 520);
      const spot = this.world.randomWalkableNear(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 120);
      this.spawnNPC(spot.x, spot.y, { name: 'Mercador Viajante', personality: 'prático', trader: true, line: 'Compro, vendo e troco. Sem dinheiro, sem problema.' });
      this.ui?.notify('Uma caravana de troca chegou. Procure o mercador.', 'good', '🤝');
    }
  },

  // ================== INTERAÇÕES ==================
  getInteractable() {
    const p = this.player;
    if (p.downed) return null;
    if (p.inVehicle) return { type: 'exit_vehicle', label: 'Sair do veículo', key: 'F', icon: '🚪' };
    // aliado caído
    for (const rp of this.remotePlayers.values()) {
      if (rp.downed && dist(p.x, p.y, rp.x, rp.y) < 70) return { type: 'revive', label: `Reanimar ${rp.name}`, ref: rp, key: 'E', icon: '🩺' };
    }
    // itens no chão
    let bestGround = null, bgd = 44;
    for (const gi of this.groundItems) {
      const d = dist(p.x, p.y, gi.x, gi.y);
      if (d < bgd) { bgd = d; bestGround = gi; }
    }
    if (bestGround) return { type: 'ground', label: `Pegar ${ITEMS[bestGround.stack.id]?.name || 'item'}`, ref: bestGround, key: 'E', icon: ITEMS[bestGround.stack.id]?.icon || '📦' };
    // NPC
    let bestNpc = null, bnd = 62;
    for (const n of this.npcs) {
      if (!n.alive || n.hostile) continue;
      const d = dist(p.x, p.y, n.x, n.y);
      if (d < bnd) { bnd = d; bestNpc = n; }
    }
    if (bestNpc) return { type: 'npc', label: `${bestNpc.following ? 'Falar com' : 'Conversar com'} ${bestNpc.name}`, ref: bestNpc, key: 'E', icon: '🧑' };
    // veículo
    const v = this.world.vehicleNear(p.x, p.y, 80);
    if (v) return { type: 'vehicle', label: `Entrar no ${v.type}`, ref: v, key: 'F', icon: '🚗' };
    // contêiner
    const c = this.world.containerNear(p.x, p.y, 56);
    if (c) return {
      type: 'container', ref: c, key: 'E', icon: c.icon,
      label: c.items.length ? `Vasculhar ${c.name}` : (c.searched ? `${c.name} (vazio)` : `Vasculhar ${c.name}`),
    };
    // estruturas
    const s = this.world.structureNear(p.x, p.y, 56);
    if (s) {
      const labels = {
        fogueira: 'Usar fogueira (cozinhar)', caixa: s.storage?.length ? `Abrir caixa (${s.storage.length} itens)` : 'Abrir caixa vazia',
        canteiro: s.crop ? (s.ready ? 'Colher plantação' : 'Ver plantação') : 'Plantar semente',
        coletor: `Coletar água (${Math.floor(s.water || 0)})`,
        armadilha: 'Armadilha de estacas',
        parede: 'Desmontar parede', muro_metal: 'Desmontar muro', cerca: 'Desmontar cerca',
        barricada: 'Desmontar barricada', reforco_metal: 'Desmontar reforço',
      };
      return { type: 'structure', ref: s, key: 'E', icon: s.type === 'fogueira' ? '🔥' : s.type === 'caixa' ? '📦' : s.type === 'canteiro' ? '🌱' : s.type === 'coletor' ? '🛢️' : '🧱', label: labels[s.type] || 'Usar estrutura' };
    }
    // porta
    const door = this.world.doorNear(p.x, p.y, 52);
    if (door) {
      const barricaded = this.world.portalStructures.has(door.x + ',' + door.y);
      return { type: 'door', ref: door, key: 'E', icon: door.open ? '🚪' : '🚪', label: barricaded ? 'Porta barricada' : door.open ? 'Fechar porta' : 'Abrir porta' };
    }
    // cama
    const bed = this.world.bedNear(p.x, p.y, 52);
    if (bed) return { type: 'bed', ref: bed, key: 'E', icon: '🛏️', label: 'Dormir até amanhecer' };
    // bilhete
    const note = this.world.noteNear(p.x, p.y, 44);
    if (note) return { type: 'note', ref: note, key: 'E', icon: '📄', label: 'Ler bilhete' };
    // janela
    const win = this.world.windowNear(p.x, p.y, 56);
    if (win) {
      const barricaded = this.world.portalStructures.has(win.x + ',' + win.y);
      return { type: 'window', ref: win, key: 'E', icon: '🪟', label: barricaded ? 'Janela barricada' : 'Quebrar janela' };
    }
    // água
    const water = this.nearestWater(p.x, p.y, 60);
    if (water) return { type: 'water', ref: water, key: 'E', icon: '💧', label: 'Beber água (risco de contaminação)' };
    return null;
  },

  nearestWater(x, y, radius = 60) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    let best = null, bd = radius;
    for (let yy = ty - 2; yy <= ty + 2; yy++) for (let xx = tx - 2; xx <= tx + 2; xx++) {
      if (this.world.tile(xx, yy) !== T.WATER) continue;
      const d = dist(x, y, xx * TILE + 16, yy * TILE + 16);
      if (d < bd) { bd = d; best = { x: xx, y: yy, dist: d }; }
    }
    return best;
  },

  interact() {
    if (this.paused || this.dead) return;
    const it = this.getInteractable();
    if (!it) { this.ui?.notify('Nada por perto.', 'info', '•', 900); return; }
    switch (it.type) {
      case 'exit_vehicle': this.exitVehicle(); break;
      case 'revive': this.reviveRemote(it.ref); break;
      case 'ground': this.pickupGround(it.ref); break;
      case 'npc': this.talkTo(it.ref); break;
      case 'vehicle': this.enterVehicle(it.ref); break;
      case 'container': this.openContainer(it.ref); break;
      case 'structure': this.interactStructure(it.ref); break;
      case 'door': this.toggleDoor(it.ref); break;
      case 'bed': this.ui?.showSleepConfirm(); break;
      case 'note': this.readNote(it.ref); break;
      case 'window': this.breakWindow(it.ref); break;
      case 'water': this.drinkWater(it.ref); break;
      default: break;
    }
  },

  toggleDoor(d) {
    if (this.world.portalStructures.has(d.x + ',' + d.y)) {
      this.ui?.notify('A porta está barricada. Desmonte a barricada primeiro.', 'warn', '🪵');
      return;
    }
    d.open = !d.open;
    audio.play('door');
    this.emitNoise(d.x * TILE + 16, d.y * TILE + 16, 110, 'porta');
    this.spendGameMinutes(0.3);
    this.ui?.refreshHUD();
  },

  breakWindow(w) {
    if (this.world.portalStructures.has(w.x + ',' + w.y)) { this.ui?.notify('A janela está barricada.', 'warn', '🪵'); return; }
    if (w.broken) return;
    w.hp = 0; w.broken = true;
    audio.play('door_break');
    this.emitNoise(w.x * TILE + 16, w.y * TILE + 16, 220, 'vidro');
    this.burst(w.x * TILE + 16, w.y * TILE + 16, '#b9d7de', 12, 70, { gravity: 120 });
    this.spendGameMinutes(1);
    if (chance(this.world.rng, 0.18)) {
      this.player.bleed = clamp(this.player.bleed + 12, 0, 100);
      this.ui?.notify('Você se cortou no vidro.', 'warn', '🩸');
    } else this.ui?.notify('Janela quebrada. Agora dá para passar — e para entrar.', 'info', '🪟');
  },

  readNote(note) {
    this.ui?.openNote(note.text);
    if (!this.world.notesRead) this.world.notesRead = [];
    const key = note.x + ',' + note.y;
    if (!this.world.notesRead.includes(key)) { this.world.notesRead.push(key); this.addXP(8); }
  },

  drinkWater(water) {
    const p = this.player;
    p.thirst = clamp(p.thirst + 26, 0, 100);
    this.spendGameMinutes(1);
    audio.play('drink');
    this.completeObjective('drink');
    if (chance(this.world.rng, 0.34)) {
      p.sick = clamp(p.sick + randRange(this.world.rng, 18, 38), 0, 100);
      p.infection = clamp(p.infection + 4, 0, 100);
      this.ui?.notify('A água tinha gosto estranho. Seu estômago embrulha.', 'danger', '🤢');
    } else {
      this.ui?.notify('Água fresca do lago. Revigorante.', 'good', '💧');
    }
    this.addFloater(p.x, p.y - 28, '+26 sede', '#74b9e8', 1);
  },

  openContainer(c) {
    const first = !c.searched;
    c.searched = true;
    this.lootOpen = { kind: 'container', ref: c, title: c.name, items: c.items };
    this.ui?.openLoot(this.lootOpen);
    if (first) {
      this.stats.looted++;
      this.grantSkill('furtividade', 2);
      this.completeObjective('loot');
      this.spendGameMinutes(2);
      this.emitNoise(c.x * TILE + 16, c.y * TILE + 16, 45, 'vasculhar');
    }
  },

  takeLoot(item) {
    if (!this.lootOpen) return;
    const items = this.lootOpen.items;
    const i = items.indexOf(item);
    if (i < 0) return;
    if (!this.addItem(item.id, item.qty, item.condition)) return;
    items.splice(i, 1);
    this.stats.looted++;
    this.ui?.refreshLoot();
    this.ui?.refreshHUD();
  },

  takeAllLoot() {
    if (!this.lootOpen) return;
    const items = [...this.lootOpen.items];
    let got = 0;
    for (const item of items) {
      if (this.weight() + (ITEMS[item.id]?.weight || 0) * item.qty > this.capacity() * 1.1) continue;
      if (this.addItem(item.id, item.qty, item.condition, { silent: true })) {
        this.lootOpen.items.splice(this.lootOpen.items.indexOf(item), 1);
        got++;
      }
    }
    audio.play(got ? 'pickup' : 'error');
    if (got) this.ui?.notify(`${got} tipo(s) de item guardado(s).`, 'good', '🎒');
    else this.ui?.notify('Sua mochila está cheia.', 'warn', '⚖️');
    this.ui?.refreshLoot();
    this.ui?.refreshHUD();
  },

  storeLoot(stack) {
    if (!this.lootOpen) return;
    if (this.lootOpen.kind !== 'storage' && this.lootOpen.kind !== 'trunk') return;
    const amount = stack.qty;
    const i = this.player.inventory.indexOf(stack);
    if (i < 0) return;
    if (stack.equipped) stack.equipped = false;
    this.player.inventory.splice(i, 1);
    this.lootOpen.items.push({ id: stack.id, qty: amount, condition: stack.condition });
    this.player.capacity = this.calcCapacity();
    audio.play('pickup');
    this.ui?.refreshLoot();
    this.ui?.refreshHUD();
  },

  closeLoot() { this.lootOpen = null; },

  // ================== CAMA / SONO ==================
  sleepInBed() {
    const p = this.player;
    const nearZ = this.zombies.filter(z => dist(z.x, z.y, p.x, p.y) < 430);
    if (nearZ.length) {
      this.ui?.notify('Zumbis por perto. Você não consegue fechar os olhos.', 'danger', '🧟');
      return;
    }
    if (p.infection > 70) this.ui?.notify('A febre não deixa você dormir. Trate a infecção primeiro.', 'danger', '🤒');
    const hour = this.time / 60;
    let hours;
    if (hour >= 19 || hour < 5) hours = ((7 * 60 - this.time + 1440) % 1440) / 60;
    else hours = 2;
    hours = Math.max(1, Math.min(11, hours));
    const before = this.time;
    this.ui?.closeAll?.();
    p.fatigue = Math.max(0, p.fatigue - 100);
    p.health = clamp(p.health + 12, 0, p.maxHealth);
    p.stamina = p.maxStamina;
    p.hunger = clamp(p.hunger - hours * 0.75, 0, 100);
    p.thirst = clamp(p.thirst - hours * 0.95, 0, 100);
    p.wet = Math.max(0, p.wet - hours * 3);
    p.bleed = Math.max(0, p.bleed - 2);
    if (p.infection > 0) p.infection = clamp(p.infection + hours * 0.25, 0, 100);
    p.temp = lerp(p.temp, 36.7, 0.6);
    this.advanceTime(hours * 60);
    // risco noturno se o abrigo não estiver protegido
    const hasBarricade = this.world.structures.some(s => s.portal && dist(s.x * TILE, s.y * TILE, p.x, p.y) < 200);
    if (!hasBarricade && chance(this.world.rng, 0.22)) {
      this.damagePlayer(randRange(this.world.rng, 8, 20), 'zumbi');
      this.ui?.notify('Você acordou com uma mordida. Algo entrou enquanto dormia.', 'danger', '🩸');
    }
    this.ui?.notify(`Você dormiu ${hours.toFixed(1)}h. Amanheceu o dia ${this.day}.`, 'good', '🌅');
    if (isNight(before) && !isNight(this.time)) { this.flags.firstNightSurvived = true; this.completeObjective('night'); }
    this.ui?.refreshHUD();
    if (this.mode === 'single') this.ui?.autosave();
  },

  // ================== ESTRUTURAS ==================
  interactStructure(s) {
    if (s.type === 'fogueira') return this.cookAtFire(s);
    if (s.type === 'caixa') {
      this.lootOpen = { kind: 'storage', ref: s, title: 'Caixa de armazenamento', items: s.storage || [] };
      this.ui?.openLoot(this.lootOpen);
      return;
    }
    if (s.type === 'canteiro') return this.farmInteract(s);
    if (s.type === 'coletor') {
      const qty = Math.floor(s.water || 0);
      if (qty <= 0) { this.ui?.notify('O coletor está vazio. Espere pela chuva.', 'info', '🛢️'); return; }
      if (this.addItem('agua', qty)) {
        s.water -= qty;
        this.ui?.notify(`+${qty} água coletada.`, 'good', '💧');
        this.spendGameMinutes(2);
      }
      return;
    }
    if (s.type === 'armadilha') { this.ui?.notify('Uma armadilha de estacas. Cuidado onde pisa.', 'info', '🕳️'); return; }
    if (['parede', 'muro_metal', 'cerca', 'barricada', 'reforco_metal'].includes(s.type)) {
      if (s.storage?.length) { this.ui?.notify('Retire os itens da estrutura antes de desmontá-la.', 'warn', '📦'); return; }
      return this.dismantleStructure(s);
    }
  },

  dismantleStructure(s) {
    const def = BUILDABLES[s.type];
    if (!def) return;
    if (s.type === 'canteiro' && s.crop && s.ready) { this.harvest(s); }
    this.world.removeStructure(s);
    // devolve metade dos materiais
    const refunds = [];
    for (const [id, qty] of Object.entries(def.cost || {})) {
      const back = Math.max(1, Math.floor(qty * 0.5));
      this.addItem(id, back, 1, { ignoreWeight: true, silent: true });
      refunds.push(`${back} ${ITEMS[id]?.name || id}`);
    }
    audio.play('build');
    this.spendGameMinutes(4);
    this.ui?.notify(`Estrutura desmontada. Recuperado: ${refunds.join(', ')}.`, 'good', '🔨');
    this.ui?.refreshHUD();
  },

  cookAtFire(s) {
    const raws = this.player.inventory.filter(st => ITEMS[st.id]?.cooked);
    if (!raws.length) {
      this.ui?.notify('Nada cru para cozinhar. A fogueira estala, acolhedora.', 'info', '🔥');
      return;
    }
    let cooked = 0;
    for (const st of raws) {
      const targetId = ITEMS[st.id].cooked;
      if (!ITEMS[targetId]) continue;
      const qty = st.qty;
      this.consumeStack(st, qty);
      this.addItem(targetId, qty, 1, { ignoreWeight: true, silent: true });
      cooked += qty;
      this.grantSkill('culinaria', 5 * qty);
      this.spendGameMinutes(5 * qty);
    }
    audio.play('craft');
    this.ui?.notify(`${cooked} porção(ões) cozida(s). O cheiro atrai estômagos vazios — e não só humanos.`, 'good', '🍲');
    this.emitNoise(s.x * TILE + 16, s.y * TILE + 16, 90, 'cozinhar');
    this.ui?.refreshHUD();
  },

  farmInteract(s) {
    if (s.crop) {
      if (s.ready) { this.harvest(s); return; }
      const need = s.crop === 'abobora' ? 4400 : 3600;
      const pct = Math.floor(((s.growth || 0) / need) * 100);
      this.ui?.notify(`Plantação de ${s.crop} crescendo: ${pct}%.`, 'info', '🌱');
      return;
    }
    const seed = this.player.inventory.find(st => ITEMS[st.id]?.type === 'seed');
    if (!seed) { this.ui?.notify('Você precisa de sementes. Encontre-as em fazendas e mercados.', 'warn', '🌱'); return; }
    this.consumeStack(seed, 1);
    s.crop = ITEMS[seed.id].crop || 'milho';
    s.growth = 0; s.ready = false; s.plantedDay = this.day;
    this.grantSkill('agricultura', 8);
    this.spendGameMinutes(8);
    audio.play('build');
    this.ui?.notify(`Sementes de ${s.crop} plantadas. Regue com a chuva e espere.`, 'good', '🌱');
  },

  harvest(s) {
    const skill = this.player.skills.agricultura.level || 0;
    const qty = Math.max(1, Math.round(randRange(this.world.rng, 2, 3) + skill * 0.35));
    const item = s.crop === 'batata' ? 'batata' : s.crop === 'abobora' ? 'abobora' : 'milho';
    this.addItem(item, qty, 1, { ignoreWeight: true });
    s.crop = null; s.growth = 0; s.ready = false;
    this.grantSkill('agricultura', 16);
    this.spendGameMinutes(10);
    audio.play('pickup');
    this.ui?.notify(`Colheita: ${qty}x ${ITEMS[item].name}.`, 'good', ITEMS[item].icon);
    this.ui?.refreshHUD();
  },

  // ================== NPCS / DIÁLOGO ==================
  talkTo(npc) {
    this.dialogNpc = npc;
    npc.talked = true;
    this.stats.survivorsMet = (this.stats.survivorsMet || 0) + 1;
    this.ui?.openDialog(npc);
  },

  npcChat(npc) {
    npc.line = choose(this.world.rng, AMBIENT_LINES);
    npc.greeting = choose(this.world.rng, ['Ainda estou vivo. Por enquanto.', 'Cuidado lá fora.', 'Você tem comida?', 'Não confio em estranhos. Mas fale.']);
    this.ui?.refreshDialog();
  },

  npcRecruit(npc) {
    if (npc.following) {
      npc.following = false;
      npc.state = 'wander';
      this.ui?.notify(`${npc.name} vai seguir o próprio caminho.`, 'info', '🚶');
      this.ui?.refreshDialog();
      return;
    }
    const food = this.player.inventory.find(s => ITEMS[s.id]?.type === 'food' || ITEMS[s.id]?.type === 'drink');
    if (!food) { this.ui?.notify('Você precisa oferecer comida ou água para ganhar confiança.', 'warn', '🍞'); return; }
    this.consumeStack(food, 1);
    npc.following = true;
    npc.state = 'follow';
    npc.home = { x: this.player.x, y: this.player.y };
    this.ui?.notify(`${npc.name} agora acompanha você.`, 'good', '🤝');
    this.ui?.chatPush({ system: true, text: `${npc.name} se juntou a você.` });
    this.ui?.refreshDialog();
  },

  tradeWith(npc, offerIndex, paymentStack) {
    const offer = npc.trade[offerIndex];
    if (!offer || !paymentStack) return false;
    if (!this.player.inventory.includes(paymentStack)) return false;
    const offerDef = ITEMS[offer.id], payDef = ITEMS[paymentStack.id];
    if (!offerDef || !payDef) return false;
    const offerValue = (offerDef.value || 1) * offer.qty;
    const payValue = (payDef.value || 1) * paymentStack.qty;
    if (payValue < offerValue * 0.65) {
      this.ui?.notify('Ele não aceita essa troca. Valor muito baixo.', 'warn', '🤝');
      return false;
    }
    if (this.weight() + offerDef.weight * offer.qty > this.capacity() * 1.1) {
      this.ui?.notify('Você não tem espaço para isso.', 'warn', '⚖️');
      return false;
    }
    // remove pagamento
    const qty = paymentStack.qty;
    const idx = this.player.inventory.indexOf(paymentStack);
    if (idx < 0) return false;
    this.player.inventory.splice(idx, 1);
    npc.trade.splice(offerIndex, 1);
    npc.trade.push({ id: paymentStack.id, qty, condition: paymentStack.condition });
    this.addItem(offer.id, offer.qty, offer.condition, { ignoreWeight: true });
    this.grantSkill('furtividade', 3);
    this.addXP(8);
    audio.play('pickup');
    this.ui?.notify(`Troca feita: ${offer.qty}x ${offerDef.name}.`, 'good', offerDef.icon);
    this.ui?.refreshTrade();
    this.ui?.refreshHUD();
    return true;
  },

  reviveRemote(rp) {
    if (!rp || !rp.downed) return;
    rp.downed = false; rp.hp = 55;
    this.mp?.send({ t: 'revive', target: rp.id });
    this.ui?.notify(`Você reanimou ${rp.name}.`, 'good', '🩺');
    this.ui?.chatPush({ system: true, text: `${this.player.name} reanimou ${rp.name}.` });
  },

  // ================== CRAFTING ==================
  craft(recipeId) {
    const r = CRAFT_RECIPES.find(r => r.id === recipeId);
    if (!r) return;
    for (const [id, qty] of Object.entries(r.cost)) {
      if (this.countItem(id) < qty) { this.ui?.notify(`Faltam ${ITEMS[id]?.name || id}.`, 'warn', '🔨'); return; }
    }
    for (const [id, qty] of Object.entries(r.cost)) this.removeItem(id, qty);
    for (const [id, qty] of r.gives) this.addItem(id, qty, 1, { ignoreWeight: true, silent: true });
    this.grantSkill(r.skill, r.xp);
    this.spendGameMinutes(8);
    audio.play('craft');
    this.ui?.notify(`${r.name} criado.`, 'good', r.icon);
    this.ui?.refreshCrafting();
    this.ui?.refreshHUD();
  },

  // ================== CONSTRUÇÃO ==================
  selectBuildable(type) {
    if (!BUILDABLES[type]) return;
    this.selectedBuild = type;
    this.buildMode = true;
    this.ui?.closeAll?.();
    this.ui?.notify('Escolha um local. Clique para construir, botão direito ou Esc para cancelar.', 'info', BUILDABLES[type].icon, 5000);
    this.ui?.refreshHUD();
  },

  cancelBuild() {
    this.buildMode = false;
    this.selectedBuild = null;
    this.ui?.refreshHUD();
  },

  getBuildGhost() {
    if (!this.buildMode || !this.selectedBuild) return null;
    const type = this.selectedBuild;
    const def = BUILDABLES[type];
    const p = this.player;
    let tx, ty;
    if (this.input.pointerActive) {
      const z = this.camera.zoom || 1;
      tx = Math.floor((this.camera.x + this.input.pointerX / z) / TILE);
      ty = Math.floor((this.camera.y + this.input.pointerY / z) / TILE);
    } else {
      tx = Math.floor((p.x + Math.cos(p.angle) * 48) / TILE);
      ty = Math.floor((p.y + Math.sin(p.angle) * 48) / TILE);
    }
    const d = dist(p.x, p.y, tx * TILE + 16, ty * TILE + 16);
    let result = { type, tx, ty, valid: false, reason: '', portal: null };
    if (d > TILE * 5) { result.reason = 'Longe demais'; return result; }
    if (def.target === 'portal' || def.target === 'barricade') {
      // encontra portal próximo
      let best = null, bd = TILE * 2.2;
      for (const dr of this.world.doors.values()) {
        const dd = dist(tx * TILE + 16, ty * TILE + 16, dr.x * TILE + 16, dr.y * TILE + 16);
        if (dd < bd) { bd = dd; best = { kind: 'door', ref: dr, x: dr.x, y: dr.y }; }
      }
      for (const w of this.world.windows.values()) {
        if (w.broken) continue;
        const dd = dist(tx * TILE + 16, ty * TILE + 16, w.x * TILE + 16, w.y * TILE + 16);
        if (dd < bd) { bd = dd; best = { kind: 'window', ref: w, x: w.x, y: w.y }; }
      }
      if (!best) { result.reason = 'Aponte para uma porta ou janela'; return result; }
      const existing = this.world.portalStructures.get(best.x + ',' + best.y);
      if (type === 'barricada' && existing) { result.reason = 'Já existe uma barricada'; return result; }
      if (type === 'reforco_metal' && (!existing || existing.type !== 'barricada')) { result.reason = 'Reforço exige uma barricada'; return result; }
      result.tx = best.x; result.ty = best.y; result.portal = best; result.valid = true;
      result.cost = def.cost;
      return result;
    }
    if (!this.world.inBounds(tx, ty)) { result.reason = 'Fora dos limites'; return result; }
    const t = this.world.tile(tx, ty);
    if (t === T.WATER) { result.reason = 'Não é possível construir na água'; return result; }
    if ([T.WALL, T.DOOR, T.WINDOW].includes(t)) { result.reason = 'Local ocupado'; return result; }
    if (this.world.containerAtTile(tx, ty)) { result.reason = 'Há um móvel aqui'; return result; }
    if (this.world.structureAt(tx, ty)) { result.reason = 'Já há uma construção aqui'; return result; }
    if (this.world.trees.some(tr => Math.floor(tr.x / TILE) === tx && Math.floor(tr.y / TILE) === ty)) { result.reason = 'Uma árvore bloqueia o local'; return result; }
    if (this.world.beds.some(b => b.x === tx && b.y === ty)) { result.reason = 'Há uma cama aqui'; return result; }
    if (this.world.vehicles.some(v => !v.occupied && Math.floor(v.x / TILE) === tx && Math.floor(v.y / TILE) === ty)) { result.reason = 'Há um veículo aqui'; return result; }
    // não bloquear totalmente portas próximas
    for (const dr of this.world.doors.values()) {
      if (Math.abs(dr.x - tx) + Math.abs(dr.y - ty) === 0) { result.reason = 'Não bloqueie a porta'; return result; }
    }
    result.valid = true;
    result.cost = def.cost;
    return result;
  },

  placeBuild(tx, ty) {
    if (!this.buildMode || !this.selectedBuild) return false;
    const type = this.selectedBuild;
    const def = BUILDABLES[type];
    const ghost = this.getBuildGhost();
    if (!ghost || !ghost.valid) {
      if (ghost?.reason) this.ui?.notify(ghost.reason + '.', 'warn', '🚫');
      return false;
    }
    tx = ghost.tx; ty = ghost.ty;
    for (const [id, qty] of Object.entries(def.cost)) {
      if (this.countItem(id) < qty) {
        this.ui?.notify(`Faltam ${qty - this.countItem(id)}x ${ITEMS[id]?.name || id}.`, 'warn', '🧱');
        audio.play('error');
        return false;
      }
    }
    for (const [id, qty] of Object.entries(def.cost)) this.removeItem(id, qty);
    const s = {
      id: uid('s'), type, x: tx, y: ty, hp: def.hp, maxHp: def.hp,
      builtDay: this.day, storage: def.storage ? [] : undefined,
      crop: type === 'canteiro' ? 'milho' : null, growth: 0, ready: false,
      water: 0, lit: type === 'fogueira',
    };
    if (ghost.portal) {
      s.portal = true;
      s.portalType = ghost.portal.kind;
      if (ghost.portal.kind === 'door') { ghost.portal.ref.open = false; }
    }
    this.world.addStructure(s);
    this.stats.built++;
    this.grantSkill(def.skill, def.xp);
    this.addXP(6);
    this.spendGameMinutes(Math.max(4, def.time * 4));
    this.emitNoise(tx * TILE + 16, ty * TILE + 16, 150, 'construção');
    this.burst(tx * TILE + 16, ty * TILE + 16, '#c9b88a', 8, 50);
    audio.play('build');
    this.ui?.notify(`${def.name} construída.`, 'good', def.icon);
    if (type === 'barricada' || type === 'reforco_metal') this.completeObjective('barricade');
    if (['fogueira', 'caixa', 'canteiro', 'coletor', 'parede', 'muro_metal'].includes(type)) this.completeObjective('shelter');
    this.ui?.refreshHUD();
    return true;
  },

  // __MORE__
};

