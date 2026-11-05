// Áudio sintetizado — sem arquivos externos
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.ambientGain = null;
    this.rainGain = null;
    this.started = false;
    this.muted = false;
    this.rainNode = null;
    this.windNode = null;
    this.lastZombie = 0;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.7;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.65; this.sfxGain.connect(this.master);
      this.ambientGain = this.ctx.createGain(); this.ambientGain.gain.value = 0.0; this.ambientGain.connect(this.master);
      this.rainGain = this.ctx.createGain(); this.rainGain.gain.value = 0.0; this.rainGain.connect(this.master);
      this.startAmbient();
      this.started = true;
    } catch { /* áudio indisponível */ }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
  }

  startAmbient() {
    const ctx = this.ctx;
    // vento distante
    const buf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) { last = last * 0.985 + (Math.random() * 2 - 1) * 0.015; data[i] = last; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 380;
    const gain = ctx.createGain(); gain.gain.value = 0.25;
    src.connect(filter).connect(gain).connect(this.ambientGain);
    src.start();
    this.windNode = gain;
    this.ambientGain.gain.setTargetAtTime(0.5, ctx.currentTime, 2);
    // drone grave
    const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 47;
    const og = ctx.createGain(); og.gain.value = 0.025;
    osc.connect(og).connect(this.ambientGain); osc.start();

    // chuva
    const rbuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const rdata = rbuf.getChannelData(0);
    for (let i = 0; i < rdata.length; i++) rdata[i] = Math.random() * 2 - 1;
    const rsrc = ctx.createBufferSource(); rsrc.buffer = rbuf; rsrc.loop = true;
    const rf = ctx.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 2600; rf.Q.value = 0.4;
    const rg = ctx.createGain(); rg.gain.value = 0.12;
    rsrc.connect(rf).connect(rg).connect(this.rainGain); rsrc.start();
    this.rainNode = rg;
  }

  setRain(intensity) {
    if (!this.ctx) return;
    this.rainGain.gain.setTargetAtTime(intensity * 0.35, this.ctx.currentTime, 2);
  }

  tone({ freq = 220, dur = 0.15, type = 'sine', vol = 0.2, slide = 0, attack = 0.005, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxGain); o.start(t); o.stop(t + dur + 0.02);
  }

  noise({ dur = 0.15, vol = 0.2, freq = 1200, q = 0.8, type = 'lowpass', slide = 0 }) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(80, freq + slide), t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxGain); src.start(t);
  }

  play(name, arg = {}) {
    if (!this.ctx) return;
    switch (name) {
      case 'swing': this.noise({ dur: 0.12, vol: 0.18, freq: 900, type: 'highpass' }); break;
      case 'hit': this.noise({ dur: 0.09, vol: 0.4, freq: 380 }); this.tone({ freq: 90, dur: 0.09, type: 'square', vol: 0.13, slide: -40 }); break;
      case 'hit_flesh': this.noise({ dur: 0.12, vol: 0.5, freq: 220 }); this.tone({ freq: 120, dur: 0.12, type: 'sine', vol: 0.2, slide: -70 }); break;
      case 'zombie': this.tone({ freq: 90 + Math.random() * 40, dur: 0.7, type: 'sawtooth', vol: 0.06, slide: -35 }); this.noise({ dur: 0.4, vol: 0.06, freq: 300 }); break;
      case 'hurt': this.tone({ freq: 160, dur: 0.22, type: 'sawtooth', vol: 0.18, slide: -90 }); this.noise({ dur: 0.18, vol: 0.2, freq: 500 }); break;
      case 'pickup': this.tone({ freq: 520, dur: 0.08, type: 'triangle', vol: 0.12 }); this.tone({ freq: 780, dur: 0.09, type: 'triangle', vol: 0.1, delay: 0.07 }); break;
      case 'eat': this.noise({ dur: 0.12, vol: 0.12, freq: 1400, type: 'bandpass' }); break;
      case 'drink': this.tone({ freq: 300, dur: 0.1, type: 'sine', vol: 0.08, slide: 90 }); break;
      case 'heal': this.tone({ freq: 440, dur: 0.18, type: 'sine', vol: 0.12, slide: 120 }); break;
      case 'gun': this.noise({ dur: 0.35, vol: 0.9, freq: 700, slide: -500 }); this.tone({ freq: 120, dur: 0.25, type: 'square', vol: 0.35, slide: -80 }); break;
      case 'shotgun': this.noise({ dur: 0.5, vol: 1.0, freq: 500, slide: -400 }); this.tone({ freq: 80, dur: 0.4, type: 'square', vol: 0.4, slide: -50 }); break;
      case 'empty': this.tone({ freq: 220, dur: 0.05, type: 'square', vol: 0.1 }); break;
      case 'door': this.noise({ dur: 0.16, vol: 0.22, freq: 300 }); this.tone({ freq: 140, dur: 0.13, type: 'triangle', vol: 0.08, slide: 40 }); break;
      case 'door_break': this.noise({ dur: 0.5, vol: 0.55, freq: 240, slide: -140 }); break;
      case 'build': this.tone({ freq: 180, dur: 0.14, type: 'square', vol: 0.13 }); this.tone({ freq: 240, dur: 0.1, type: 'triangle', vol: 0.1, delay: 0.12 }); break;
      case 'craft': this.tone({ freq: 330, dur: 0.1, type: 'triangle', vol: 0.12 }); this.tone({ freq: 440, dur: 0.1, type: 'triangle', vol: 0.1, delay: 0.1 }); this.tone({ freq: 550, dur: 0.14, type: 'triangle', vol: 0.1, delay: 0.2 }); break;
      case 'ui': this.tone({ freq: 300, dur: 0.05, type: 'sine', vol: 0.06 }); break;
      case 'error': this.tone({ freq: 130, dur: 0.18, type: 'square', vol: 0.1 }); break;
      case 'level': this.tone({ freq: 440, dur: 0.12, type: 'triangle', vol: 0.13 }); this.tone({ freq: 554, dur: 0.12, type: 'triangle', vol: 0.12, delay: 0.12 }); this.tone({ freq: 660, dur: 0.25, type: 'triangle', vol: 0.12, delay: 0.24 }); break;
      case 'thunder': this.noise({ dur: 1.8, vol: 0.55, freq: 180, slide: -100 }); this.tone({ freq: 55, dur: 1.2, type: 'sine', vol: 0.2, slide: -20 }); break;
      case 'car_start': this.tone({ freq: 60, dur: 0.6, type: 'sawtooth', vol: 0.16, slide: 30 }); this.noise({ dur: 0.5, vol: 0.2, freq: 300 }); break;
      case 'car_hit': this.noise({ dur: 0.3, vol: 0.5, freq: 500 }); this.tone({ freq: 80, dur: 0.2, type: 'square', vol: 0.2, slide: -30 }); break;
      case 'zombie_die': this.tone({ freq: 100, dur: 0.5, type: 'sawtooth', vol: 0.12, slide: -60 }); this.noise({ dur: 0.3, vol: 0.2, freq: 280 }); break;
      case 'sleep': this.tone({ freq: 180, dur: 1.2, type: 'sine', vol: 0.08, slide: -60 }); break;
      case 'rain': this.setRain(arg.intensity || 0.6); break;
      default: break;
    }
  }

  ambientZombie() {
    const now = performance.now();
    if (now - this.lastZombie < 12000) return;
    this.lastZombie = now;
    if (Math.random() < 0.6) {
      const p = Math.random();
      this.tone({ freq: 70 + p * 60, dur: 1.0 + p, type: 'sawtooth', vol: 0.018, slide: -30 });
    }
  }
}

export const audio = new AudioManager();
