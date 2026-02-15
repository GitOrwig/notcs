// Web Audio API synthesizer — no audio files required
export class Audio {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this._init();
  }

  _init() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.6;
    this.masterGain.connect(this.ctx.destination);
  }

  resume() {
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  // ── Utility ──────────────────────────────────────────────
  _noise(duration, freq = null, type = 'white') {
    const bufSize = this.ctx.sampleRate * duration;
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  _osc(type, freq, duration, startTime) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    osc.start(startTime);
    osc.stop(startTime + duration);
    return osc;
  }

  _envelope(gain, attack, decay, sustain, release, startTime) {
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(1, startTime + attack);
    gain.gain.linearRampToValueAtTime(sustain, startTime + attack + decay);
    gain.gain.linearRampToValueAtTime(0, startTime + attack + decay + release);
  }

  // ── Weapon sounds ─────────────────────────────────────────
  playGunshot(weaponType = 'rifle') {
    this.resume();
    const t = this.ctx.currentTime;

    const configs = {
      rifle: { vol: 0.9, noiseLen: 0.18, bassFreq: 80, decay: 0.08 },
      pistol: { vol: 0.6, noiseLen: 0.12, bassFreq: 120, decay: 0.05 },
      awp:    { vol: 1.0, noiseLen: 0.3,  bassFreq: 60,  decay: 0.15 },
    };
    const cfg = configs[weaponType] || configs.rifle;

    // Low boom
    const bassOsc = this.ctx.createOscillator();
    bassOsc.type = 'sine';
    bassOsc.frequency.setValueAtTime(cfg.bassFreq, t);
    bassOsc.frequency.exponentialRampToValueAtTime(30, t + cfg.decay);
    const bassGain = this.ctx.createGain();
    bassGain.gain.setValueAtTime(cfg.vol, t);
    bassGain.gain.exponentialRampToValueAtTime(0.001, t + cfg.decay);
    bassOsc.connect(bassGain);
    bassGain.connect(this.masterGain);
    bassOsc.start(t);
    bassOsc.stop(t + cfg.decay + 0.05);

    // High-freq crack (filtered noise)
    const noise = this._noise(cfg.noiseLen);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1800;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(cfg.vol * 0.7, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + cfg.noiseLen);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noise.start(t);
    noise.stop(t + cfg.noiseLen);
  }

  playReload(clipType = 'rifle') {
    this.resume();
    const t = this.ctx.currentTime;
    // Mag out click
    this._clickSound(t, 600);
    // Mag in click
    this._clickSound(t + (clipType === 'awp' ? 1.2 : 0.9), 800);
  }

  _clickSound(t, freq) {
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, t);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  playEmptyClick() {
    this.resume();
    this._clickSound(this.ctx.currentTime, 400);
  }

  // ── Footsteps ─────────────────────────────────────────────
  playFootstep(surface = 'concrete') {
    this.resume();
    const t = this.ctx.currentTime;
    const noise = this._noise(0.12);
    const filter = this.ctx.createBiquadFilter();
    filter.type = surface === 'metal' ? 'bandpass' : 'lowpass';
    filter.frequency.value = surface === 'metal' ? 2000 : 500;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(t);
    noise.stop(t + 0.13);
  }

  // ── Grenade ───────────────────────────────────────────────
  playGrenadeBounce() {
    this.resume();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.08);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.09);
  }

  playExplosion() {
    this.resume();
    const t = this.ctx.currentTime;

    // Sub boom
    const bassOsc = this.ctx.createOscillator();
    bassOsc.type = 'sine';
    bassOsc.frequency.setValueAtTime(60, t);
    bassOsc.frequency.exponentialRampToValueAtTime(20, t + 0.5);
    const bassGain = this.ctx.createGain();
    bassGain.gain.setValueAtTime(1.2, t);
    bassGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    bassOsc.connect(bassGain);
    bassGain.connect(this.masterGain);
    bassOsc.start(t);
    bassOsc.stop(t + 0.6);

    // Noise burst
    const noise = this._noise(0.6);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 0.5;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.8, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noise.start(t);
    noise.stop(t + 0.7);
  }

  // ── Flash ringing ──────────────────────────────────────────
  playFlashRing(intensity = 1.0) {
    this.resume();
    const t = this.ctx.currentTime;
    const duration = 2.5 * intensity;

    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 4000;
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 3700;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4 * intensity, t);
    gain.gain.linearRampToValueAtTime(0, t + duration);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);
    osc1.start(t); osc1.stop(t + duration);
    osc2.start(t); osc2.stop(t + duration);
  }

  // ── Bomb ──────────────────────────────────────────────────
  playBombBeep(interval = 1.0) {
    this.resume();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 880;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.5, t + 0.01);
    gain.gain.linearRampToValueAtTime(0, t + 0.08);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  playBombPlant() {
    this.resume();
    const t = this.ctx.currentTime;
    [400, 500, 650].forEach((f, i) => {
      this._clickSound(t + i * 0.15, f);
    });
  }

  playBombDefuse() {
    this.resume();
    const t = this.ctx.currentTime;
    [650, 500, 400, 350].forEach((f, i) => {
      this._clickSound(t + i * 0.2, f);
    });
  }

  playBombExplode() {
    this.playExplosion();
    // Extra low rumble
    const t = this.ctx.currentTime + 0.1;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(40, t);
    osc.frequency.exponentialRampToValueAtTime(15, t + 1.0);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 1.3);
  }

  // ── UI / Stings ───────────────────────────────────────────
  playRoundWin() {
    this.resume();
    const t = this.ctx.currentTime;
    [[523, 0], [659, 0.15], [784, 0.3], [1047, 0.5]].forEach(([f, dt]) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.3, t + dt);
      g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.3);
      osc.connect(g); g.connect(this.masterGain);
      osc.start(t + dt); osc.stop(t + dt + 0.35);
    });
  }

  playRoundLose() {
    this.resume();
    const t = this.ctx.currentTime;
    [[500, 0], [400, 0.2], [300, 0.45]].forEach(([f, dt]) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.25, t + dt);
      g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.35);
      osc.connect(g); g.connect(this.masterGain);
      osc.start(t + dt); osc.stop(t + dt + 0.4);
    });
  }

  playDeath() {
    this.resume();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.6);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(t); osc.stop(t + 0.75);
  }

  playHurt() {
    this.resume();
    const t = this.ctx.currentTime;
    const noise = this._noise(0.08);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2000;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    noise.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
    noise.start(t); noise.stop(t + 0.09);
  }

  playMolotovIgnite() {
    this.resume();
    const t = this.ctx.currentTime;
    const noise = this._noise(0.4);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1000;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    noise.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
    noise.start(t); noise.stop(t + 0.45);
  }

  playSmokeDeply() {
    this.resume();
    const t = this.ctx.currentTime;
    const noise = this._noise(0.3);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    noise.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
    noise.start(t); noise.stop(t + 0.35);
  }
}
