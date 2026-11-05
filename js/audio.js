// Procedural WebAudio layer: no external assets, tiny and mobile friendly.
export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.7;
    this.rainGain = null;
    this.windGain = null;
    this.lastGroan = 0;
    this.heart = 0;
  }

  ensure() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise(2.5);
      this.startAmbience();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  makeNoise(seconds = 2) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  startAmbience() {
    const ctx = this.ctx;
    // wind
    const wind = ctx.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 420;
    const wg = ctx.createGain();
    wg.gain.value = 0.035;
    wind.connect(wf).connect(wg).connect(this.master);
    wind.start();
    this.windGain = wg;
    // rain (silent until weather)
    const rain = ctx.createBufferSource();
    rain.buffer = this.noise;
    rain.loop = true;
    const rf = ctx.createBiquadFilter();
    rf.type = 'highpass';
    rf.frequency.value = 1100;
    const rg = ctx.createGain();
    rg.gain.value = 0;
    rain.connect(rf).connect(rg).connect(this.master);
    rain.start();
    this.rainGain = rg;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  setRain(type, intensity = 0) {
    if (!this.ctx) return;
    if (!this.rainGain) return;
    const target = (type === 'rain' ? 0.075 : type === 'storm' ? 0.14 : 0) * intensity;
    this.rainGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.6);
  }

  noiseBurst({ dur = 0.12, freq = 900, q = 1, gain = 0.2, type = 'bandpass', when = 0 } = {}) {
    const ctx = this.ensure();
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime + when;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  tone({ freq = 220, dur = 0.15, type = 'sine', gain = 0.12, slide = 0, when = 0 } = {}) {
    const ctx = this.ensure();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const t = ctx.currentTime + when;
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  step(sprint = false, indoor = false) {
    if (!this.enabled) return;
    this.noiseBurst({
      dur: 0.07, freq: indoor ? 420 : 260, gain: sprint ? 0.12 : 0.065,
      type: 'lowpass', q: 0.7,
    });
    if (!indoor && !sprint) this.noiseBurst({ dur: 0.04, freq: 1600, gain: 0.02, when: 0.005 });
  }

  hit(power = 1, crit = false) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    this.tone({ freq: crit ? 110 : 80, dur: 0.16, type: 'sine', gain: 0.22 * power, slide: -40 });
    this.noiseBurst({ dur: 0.1, freq: 700, gain: 0.16 * power, q: 0.6 });
    if (crit) this.noiseBurst({ dur: 0.16, freq: 2400, gain: 0.08 });
  }

  swing() {
    if (!this.enabled) return;
    this.noiseBurst({ dur: 0.1, freq: 1300, gain: 0.035, type: 'bandpass', q: 2 });
  }

  gunshot() {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    this.noiseBurst({ dur: 0.16, freq: 900, gain: 0.34, type: 'lowpass', q: 0.8 });
    this.noiseBurst({ dur: 0.05, freq: 3200, gain: 0.2 });
    this.tone({ freq: 120, dur: 0.25, type: 'triangle', gain: 0.16, slide: -80 });
  }

  groan(pan = 0, close = 1) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const now = performance.now();
    if (now - this.lastGroan < 900) return;
    this.lastGroan = now;
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    o.type = 'sawtooth'; o2.type = 'triangle';
    const base = 62 + Math.random() * 36;
    o.frequency.value = base;
    o2.frequency.value = base * 1.5 + Math.random() * 8;
    f.type = 'lowpass'; f.frequency.value = 380; f.Q.value = 4;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.028 * close, ctx.currentTime + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9 + Math.random() * 0.6);
    o.connect(f); o2.connect(f); f.connect(g);
    if (p) { p.pan.value = pan; g.connect(p).connect(this.master); }
    else g.connect(this.master);
    o.start(); o2.start();
    o.stop(ctx.currentTime + 1.8); o2.stop(ctx.currentTime + 1.8);
  }

  pickup() {
    if (!this.enabled) return;
    this.tone({ freq: 620, dur: 0.07, type: 'triangle', gain: 0.055 });
    this.tone({ freq: 930, dur: 0.09, type: 'triangle', gain: 0.045, when: 0.055 });
  }

  craft() {
    if (!this.enabled) return;
    for (let i = 0; i < 3; i++) this.noiseBurst({ dur: 0.06, freq: 900 + i * 200, gain: 0.05, when: i * 0.09 });
    this.tone({ freq: 330, dur: 0.2, type: 'triangle', gain: 0.06, slide: 90, when: 0.25 });
  }

  build() {
    if (!this.enabled) return;
    this.noiseBurst({ dur: 0.25, freq: 300, gain: 0.18, type: 'lowpass' });
    this.tone({ freq: 90, dur: 0.22, type: 'square', gain: 0.08, slide: -30 });
  }

  drink() {
    if (!this.enabled) return;
    for (let i = 0; i < 3; i++) this.noiseBurst({ dur: 0.05, freq: 500, gain: 0.05, type: 'bandpass', when: i * 0.11 });
  }

  eat() {
    if (!this.enabled) return;
    for (let i = 0; i < 2; i++) this.noiseBurst({ dur: 0.08, freq: 300, gain: 0.06, type: 'lowpass', when: i * 0.14 });
  }

  heal() {
    if (!this.enabled) return;
    this.tone({ freq: 440, dur: 0.25, type: 'sine', gain: 0.05, slide: 220 });
  }

  click() {
    if (!this.enabled) return;
    this.tone({ freq: 700, dur: 0.035, type: 'triangle', gain: 0.035 });
  }

  danger() {
    if (!this.enabled) return;
    this.tone({ freq: 180, dur: 0.45, type: 'sawtooth', gain: 0.05, slide: -60 });
  }

  quest() {
    if (!this.enabled) return;
    [523, 659, 784].forEach((f, i) => this.tone({ freq: f, dur: 0.22, type: 'triangle', gain: 0.045, when: i * 0.1 }));
  }

  thunder() {
    if (!this.enabled) return;
    this.noiseBurst({ dur: 1.4, freq: 140, gain: 0.22, type: 'lowpass' });
    this.noiseBurst({ dur: 0.4, freq: 500, gain: 0.07, type: 'lowpass', when: 0.1 });
  }

  heartbeat() {
    if (!this.enabled) return;
    this.tone({ freq: 66, dur: 0.12, type: 'sine', gain: 0.12, slide: -8 });
    this.tone({ freq: 58, dur: 0.1, type: 'sine', gain: 0.09, slide: -6, when: 0.16 });
  }
}
