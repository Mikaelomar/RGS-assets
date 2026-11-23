// Fully synthesized audio (no audio files needed): SFX, ambience loops and procedural store music.

type Spatial = { x: number; z: number } | null;

export class AudioSys {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private amb!: GainNode;
  private noiseBuf!: AudioBuffer;
  private lx = 0;
  private lz = 0;
  private lyaw = 0;
  sfxVolume = 0.8;
  musicVolume = 0.35;
  private musicOn = false;
  private musicTimer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private bar = 0;
  private loops = new Map<string, { gain: GainNode; src: AudioScheduledSourceNode[]; target: number }>();

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock() {
    if (!this.ctx) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC() as AudioContext;
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = 1;
      this.master.connect(c.destination);
      this.sfx = c.createGain();
      this.sfx.gain.value = this.sfxVolume;
      this.sfx.connect(this.master);
      this.music = c.createGain();
      this.music.gain.value = this.musicVolume * 0.45;
      this.music.connect(this.master);
      this.amb = c.createGain();
      this.amb.gain.value = this.sfxVolume * 0.6;
      this.amb.connect(this.master);
      const len = c.sampleRate * 2;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  suspend() { this.ctx?.suspend().catch(() => {}); }
  resume() { this.ctx?.resume().catch(() => {}); }

  setVolumes(sfx: number, music: number) {
    this.sfxVolume = sfx;
    this.musicVolume = music;
    if (!this.ctx) return;
    this.sfx.gain.value = sfx;
    this.amb.gain.value = sfx * 0.6;
    this.music.gain.value = music * 0.45;
  }

  setListener(x: number, z: number, yaw: number) {
    this.lx = x;
    this.lz = z;
    this.lyaw = yaw;
  }

  private spatialNodes(at: Spatial, range = 22): { gain: number; pan: number } {
    if (!at) return { gain: 1, pan: 0 };
    const dx = at.x - this.lx;
    const dz = at.z - this.lz;
    const d = Math.hypot(dx, dz);
    const gain = Math.max(0, 1 - d / range) ** 1.6;
    // Camera looks along -Z rotated by yaw; right vector = (cos, -sin)
    const rx = Math.cos(this.lyaw), rz = -Math.sin(this.lyaw);
    const pan = d > 0.01 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / Math.max(d, 1))) * 0.8 : 0;
    return { gain, pan };
  }

  private out(at: Spatial, vol = 1, range = 22): AudioNode | null {
    if (!this.ctx) return null;
    const { gain, pan } = this.spatialNodes(at, range);
    if (gain * vol < 0.005) return null;
    const g = this.ctx.createGain();
    g.gain.value = gain * vol;
    if (this.ctx.createStereoPanner && at) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(this.sfx);
    } else g.connect(this.sfx);
    return g;
  }

  private tone(dst: AudioNode, type: OscillatorType, freq: number, t0: number, dur: number, vol: number, attack = 0.005, freqEnd?: number) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(dst);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private noise(dst: AudioNode, t0: number, dur: number, vol: number, filter: BiquadFilterType, freq: number, q = 1, freqEnd?: number) {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== undefined) f.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f);
    f.connect(g);
    g.connect(dst);
    s.start(t0, Math.random() * 1.5);
    s.stop(t0 + dur + 0.05);
  }

  play(name: string, at: Spatial = null, vol = 1) {
    const o = this.out(at, vol);
    if (!o || !this.ctx) return;
    const t = this.ctx.currentTime + 0.005;
    switch (name) {
      case 'beep':
        this.tone(o, 'square', 1950, t, 0.09, 0.12);
        break;
      case 'click':
        this.tone(o, 'triangle', 900, t, 0.05, 0.15, 0.002, 600);
        break;
      case 'tab':
        this.tone(o, 'sine', 660, t, 0.07, 0.15, 0.002);
        break;
      case 'key':
        this.tone(o, 'square', 1200, t, 0.04, 0.06);
        break;
      case 'pop':
        this.tone(o, 'sine', 520, t, 0.08, 0.25, 0.003, 300);
        this.noise(o, t, 0.04, 0.05, 'highpass', 3000);
        break;
      case 'pickup':
        this.noise(o, t, 0.12, 0.2, 'bandpass', 700, 0.8, 1500);
        this.tone(o, 'sine', 180, t, 0.1, 0.2, 0.005, 260);
        break;
      case 'thud':
        this.tone(o, 'sine', 120, t, 0.18, 0.5, 0.003, 50);
        this.noise(o, t, 0.1, 0.25, 'lowpass', 500);
        break;
      case 'drop':
        this.tone(o, 'sine', 90, t, 0.25, 0.6, 0.002, 40);
        this.noise(o, t, 0.16, 0.35, 'lowpass', 800);
        break;
      case 'chaching': {
        this.noise(o, t, 0.08, 0.25, 'highpass', 2500);
        const f = [1568, 2093, 2637, 3136];
        f.forEach((fr, i) => this.tone(o, 'sine', fr, t + 0.06 + i * 0.012, 0.9, 0.12));
        this.tone(o, 'triangle', 4186, t + 0.08, 0.6, 0.05);
        break;
      }
      case 'drawer':
        this.noise(o, t, 0.25, 0.3, 'bandpass', 1200, 2, 400);
        this.tone(o, 'sine', 2600, t + 0.2, 0.4, 0.08);
        break;
      case 'coins':
        for (let i = 0; i < 5; i++) this.tone(o, 'sine', 3000 + Math.random() * 2500, t + i * 0.045, 0.18, 0.07);
        break;
      case 'cash':
        this.noise(o, t, 0.15, 0.2, 'highpass', 4000, 1, 2000);
        break;
      case 'approved':
        this.tone(o, 'sine', 1320, t, 0.12, 0.15);
        this.tone(o, 'sine', 1760, t + 0.14, 0.2, 0.15);
        break;
      case 'error':
        this.tone(o, 'sawtooth', 160, t, 0.28, 0.18);
        this.tone(o, 'sawtooth', 150, t + 0.02, 0.28, 0.12);
        break;
      case 'chime':
        this.tone(o, 'sine', 1046, t, 0.7, 0.2, 0.004);
        this.tone(o, 'sine', 784, t + 0.32, 0.9, 0.2, 0.004);
        break;
      case 'door':
        this.noise(o, t, 0.6, 0.08, 'bandpass', 400, 0.7, 1200);
        break;
      case 'notify':
        this.tone(o, 'sine', 880, t, 0.15, 0.15);
        this.tone(o, 'sine', 1318, t + 0.1, 0.25, 0.15);
        break;
      case 'warn':
        this.tone(o, 'triangle', 740, t, 0.18, 0.2);
        this.tone(o, 'triangle', 554, t + 0.2, 0.3, 0.2);
        break;
      case 'success':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(o, 'sine', f, t + i * 0.07, 0.35, 0.16));
        break;
      case 'levelup':
        [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => {
          this.tone(o, 'triangle', f, t + i * 0.09, 0.5, 0.16);
          this.tone(o, 'sine', f * 2, t + i * 0.09, 0.3, 0.05);
        });
        this.tone(o, 'sine', 2093, t + 0.6, 1.2, 0.12);
        break;
      case 'trash':
        this.noise(o, t, 0.35, 0.3, 'bandpass', 2500, 0.6, 900);
        this.tone(o, 'sine', 140, t + 0.1, 0.2, 0.3, 0.003, 60);
        break;
      case 'mop':
        this.noise(o, t, 0.45, 0.18, 'bandpass', 900, 0.5, 1800);
        break;
      case 'spray':
        this.noise(o, t, 0.3, 0.15, 'highpass', 5000);
        break;
      case 'horn':
        this.tone(o, 'sawtooth', 311, t, 0.5, 0.15, 0.02);
        this.tone(o, 'sawtooth', 392, t, 0.5, 0.12, 0.02);
        break;
      case 'reverse':
        for (let i = 0; i < 4; i++) this.tone(o, 'square', 1050, t + i * 0.5, 0.25, 0.08);
        break;
      case 'step':
        this.noise(o, t, 0.06, 0.08 + Math.random() * 0.03, 'lowpass', 700 + Math.random() * 400);
        break;
      case 'repair':
        for (let i = 0; i < 3; i++) {
          this.noise(o, t + i * 0.16, 0.08, 0.25, 'bandpass', 3000, 3);
          this.tone(o, 'square', 300 + Math.random() * 200, t + i * 0.16, 0.06, 0.06);
        }
        break;
      case 'buzz':
        this.tone(o, 'sawtooth', 110, t, 0.6, 0.12);
        break;
      case 'alarm':
        for (let i = 0; i < 6; i++) this.tone(o, 'square', i % 2 ? 880 : 660, t + i * 0.18, 0.17, 0.12);
        break;
      case 'unlock':
        this.noise(o, t, 0.08, 0.3, 'highpass', 2000);
        [392, 523, 659, 784].forEach((f, i) => this.tone(o, 'triangle', f, t + 0.05 + i * 0.06, 0.4, 0.15));
        break;
      case 'coffee':
        this.noise(o, t, 1.4, 0.12, 'bandpass', 600, 0.4, 300);
        this.tone(o, 'sine', 1200, t + 1.4, 0.3, 0.1);
        break;
      case 'flush':
        this.noise(o, t, 1.6, 0.25, 'lowpass', 1800, 0.6, 300);
        break;
      case 'scrubber':
        this.noise(o, t, 0.5, 0.12, 'lowpass', 300, 0.7);
        break;
    }
  }

  /** Continuous loop (ambience). target 0..1 is approached smoothly. */
  setLoop(name: string, target: number) {
    if (!this.ctx) return;
    let l = this.loops.get(name);
    if (!l) {
      if (target <= 0.001) return;
      const created = this.createLoop(name);
      if (!created) return;
      l = created;
      this.loops.set(name, l);
    }
    l.target = target;
    l.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.4);
  }

  private createLoop(name: string) {
    const c = this.ctx!;
    const g = c.createGain();
    g.gain.value = 0;
    g.connect(this.amb);
    const srcs: AudioScheduledSourceNode[] = [];
    const addNoise = (type: BiquadFilterType, f: number, q: number, vol: number, lfoRate = 0, lfoDepth = 0) => {
      const s = c.createBufferSource();
      s.buffer = this.noiseBuf;
      s.loop = true;
      const fl = c.createBiquadFilter();
      fl.type = type;
      fl.frequency.value = f;
      fl.Q.value = q;
      const gg = c.createGain();
      gg.gain.value = vol;
      s.connect(fl);
      fl.connect(gg);
      gg.connect(g);
      if (lfoRate > 0) {
        const lfo = c.createOscillator();
        lfo.frequency.value = lfoRate;
        const lg = c.createGain();
        lg.gain.value = lfoDepth;
        lfo.connect(lg);
        lg.connect(gg.gain);
        lfo.start();
        srcs.push(lfo);
      }
      s.start();
      srcs.push(s);
    };
    const addTone = (type: OscillatorType, f: number, vol: number) => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const gg = c.createGain();
      gg.gain.value = vol;
      o.connect(gg);
      gg.connect(g);
      o.start();
      srcs.push(o);
    };
    switch (name) {
      case 'crowd':
        addNoise('bandpass', 450, 0.9, 0.35, 0.7, 0.12);
        addNoise('bandpass', 1100, 1.2, 0.12, 1.3, 0.06);
        break;
      case 'hum':
        addTone('sine', 58, 0.25);
        addTone('sine', 117, 0.08);
        addNoise('lowpass', 200, 0.5, 0.05);
        break;
      case 'street':
        addNoise('lowpass', 380, 0.4, 0.35, 0.08, 0.15);
        break;
      case 'rain':
        addNoise('highpass', 1600, 0.3, 0.3);
        addNoise('bandpass', 5000, 0.5, 0.12, 6, 0.05);
        break;
      case 'engine':
        addTone('sawtooth', 42, 0.12);
        addTone('sawtooth', 63, 0.06);
        addNoise('lowpass', 250, 0.8, 0.3);
        break;
      case 'scrubber':
        addTone('sawtooth', 75, 0.07);
        addNoise('lowpass', 600, 0.6, 0.25);
        break;
      default:
        return null;
    }
    return { gain: g, src: srcs, target: 0 };
  }

  // ---------------- Procedural background music ----------------
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 90);
  }
  stopMusic() {
    this.musicOn = false;
    if (this.musicTimer !== null) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  private scheduleMusic() {
    if (!this.ctx || !this.musicOn) return;
    const bpm = 96;
    const stepDur = 60 / bpm / 2; // eighth notes
    // I - vi - IV - V  /  I - iii - IV - V (C major)
    const progA = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
    const progB = [[60, 64, 67], [52, 55, 59], [53, 57, 60], [55, 59, 62]];
    while (this.nextNoteTime < this.ctx.currentTime + 0.4) {
      const t = this.nextNoteTime;
      const s = this.step % 8;
      const chordIdx = Math.floor(this.step / 8) % 4;
      const prog = Math.floor(this.step / 32) % 2 === 0 ? progA : progB;
      const chord = prog[chordIdx];
      const mf = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
      const dst = this.music;
      if (s === 0) {
        // Soft electric-piano chord
        for (const n of chord) this.epiano(dst, mf(n), t, stepDur * 7.5, 0.05);
        this.tone(dst, 'sine', mf(chord[0] - 24), t, stepDur * 3.5, 0.16, 0.02);
      }
      if (s === 4) this.tone(dst, 'sine', mf(chord[0] - 24 + (Math.random() < 0.5 ? 7 : 12)), t, stepDur * 3.5, 0.12, 0.02);
      // Gentle arpeggio / melody from the pentatonic scale over the chord
      if (s % 2 === 1 || Math.random() < 0.25) {
        const pent = [72, 74, 76, 79, 81, 84];
        const choices = pent.filter((p) => chord.some((c) => (p - c) % 12 === 0) || Math.random() < 0.3);
        if (Math.random() < 0.65 && choices.length) {
          const n = choices[Math.floor(Math.random() * choices.length)];
          this.epiano(dst, mf(n), t, stepDur * 1.8, 0.035);
        }
      }
      // Light percussion
      if (s % 2 === 0) this.noise(dst, t, 0.04, 0.035, 'highpass', 8000);
      if (s === 0 || s === 4) this.tone(dst, 'sine', 95, t, 0.18, 0.15, 0.002, 45);
      if (s === 2 || s === 6) this.noise(dst, t, 0.09, 0.05, 'bandpass', 1800, 0.8);
      this.nextNoteTime += stepDur;
      this.step++;
    }
  }

  private epiano(dst: AudioNode, f: number, t: number, dur: number, vol: number) {
    const c = this.ctx!;
    const car = c.createOscillator();
    car.type = 'sine';
    car.frequency.value = f;
    const mod = c.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = f * 2;
    const mg = c.createGain();
    mg.gain.setValueAtTime(f * 0.6, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.05, t + dur);
    mod.connect(mg);
    mg.connect(car.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    car.connect(g);
    g.connect(dst);
    car.start(t);
    mod.start(t);
    car.stop(t + dur + 0.05);
    mod.stop(t + dur + 0.05);
  }
}

export const audio = new AudioSys();
