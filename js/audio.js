// Tiny synthesized engine sound + UI blips with WebAudio (no assets needed).
export class EngineAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  /** Must be called from a user gesture. */
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    this.master.connect(ctx.destination);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 500;
    this.filter.Q.value = 3;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.filter.connect(this.engineGain).connect(this.master);

    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    const g2 = ctx.createGain();
    g2.gain.value = 0.45;
    this.osc1.connect(this.filter);
    this.osc2.connect(g2).connect(this.filter);
    this.osc1.start();
    this.osc2.start();

    // rumble: low-passed noise for the exhaust "chug"
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = ctx.createBufferSource();
    this.noise.buffer = buf;
    this.noise.loop = true;
    this.noiseFilter = ctx.createBiquadFilter();
    this.noiseFilter.type = 'bandpass';
    this.noiseFilter.frequency.value = 120;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;
    this.noise.connect(this.noiseFilter).connect(this.noiseGain).connect(this.master);
    this.noise.start();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }

  resume() { this.ctx?.state === 'suspended' && this.ctx.resume(); }
  suspend() { this.ctx?.state === 'running' && this.ctx.suspend(); }

  update(rpm, throttle, running) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 18 + (rpm / 60) * 1.6;
    this.osc1.frequency.setTargetAtTime(f, t, 0.03);
    this.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.03);
    this.filter.frequency.setTargetAtTime(260 + throttle * 1500 + rpm * 0.08, t, 0.05);
    const vol = rpm > 50 ? (running ? 0.07 + throttle * 0.08 : 0.04) : 0;
    this.engineGain.gain.setTargetAtTime(vol, t, 0.06);
    this.noiseFilter.frequency.setTargetAtTime(60 + rpm / 40, t, 0.05);
    this.noiseGain.gain.setTargetAtTime(rpm > 50 ? 0.05 + throttle * 0.1 : 0, t, 0.06);
  }

  blip(freq = 880, dur = 0.08, type = 'sine', vol = 0.15) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  tick() { this.blip(1800, 0.025, 'square', 0.05); }
  ding() { this.blip(1046, 0.12, 'sine', 0.18); setTimeout(() => this.blip(1568, 0.18, 'sine', 0.16), 90); }
  buzz() { this.blip(140, 0.25, 'sawtooth', 0.15); }
  clunk() { this.blip(90, 0.07, 'square', 0.2); }
}
