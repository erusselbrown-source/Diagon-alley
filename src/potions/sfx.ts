/**
 * Synthesized sound effects and a procedural music loop (Web Audio only — no files).
 */
import { AudioEngine } from '../audio';
import { SeededRandom } from '../core/random';

export type Sfx =
  | 'pickup' | 'drop' | 'chop' | 'grind' | 'plop' | 'bottle' | 'deliver' | 'wrong'
  | 'alarm' | 'ignite' | 'water' | 'vanish' | 'tick' | 'go' | 'expire' | 'throw'
  | 'fall' | 'whoosh' | 'thunder' | 'star' | 'done' | 'click' | 'swap';

export class GameAudio {
  readonly engine = new AudioEngine();
  private noise: AudioBuffer | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private bubbleGain: GainNode | null = null;
  private fireGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private musicOn = false;
  private nextBeat = 0;
  private beat = 0;
  private tempo = 132;
  private seq: { mel: number[]; bass: number[] } = { mel: [], bass: [] };
  muted = false;

  get ready(): boolean { return !!this.engine.ctx; }

  async start(): Promise<void> {
    await this.engine.start();
    const ctx = this.engine.ctx!;
    if (this.noise) return;
    this.noise = this.engine.createNoiseBuffer(2, 7);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.engine.master!);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.32;
    // gentle room reverb for the music bus
    const verb = ctx.createConvolver();
    verb.buffer = this.impulse(1.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.musicBus.connect(this.engine.master!);
    this.musicBus.connect(verb).connect(wet).connect(this.engine.master!);
    this.sfxBus.connect(verb);

    this.bubbleGain = this.loopNoise(260, 6, 0);
    this.fireGain = this.loopNoise(900, 0.7, 0);
    this.rainGain = this.loopNoise(2400, 0.4, 0);
    setInterval(() => this.scheduleMusic(), 50);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.engine.master) this.engine.master.gain.value = m ? 0 : 0.6;
  }

  private impulse(seconds: number): AudioBuffer {
    const ctx = this.engine.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    const rng = new SeededRandom('verb');
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (rng.next() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return b;
  }

  private loopNoise(freq: number, q: number, gain: number): GainNode {
    const ctx = this.engine.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.sfxBus!);
    src.start();
    return g;
  }

  /** Continuous beds driven from world state each frame (0..1). */
  setBeds(bubbling: number, fire: number, rain: number): void {
    const ctx = this.engine.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.bubbleGain!.gain.setTargetAtTime(Math.min(bubbling, 3) * 0.05, t, 0.3);
    this.fireGain!.gain.setTargetAtTime(Math.min(fire, 3) * 0.12, t, 0.2);
    this.rainGain!.gain.setTargetAtTime(rain * 0.09, t, 0.5);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0, attack = 0.005): void {
    const ctx = this.engine.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxBus!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(freq: number, q: number, dur: number, vol: number, delay = 0, type: BiquadFilterType = 'bandpass', sweepTo?: number): void {
    const ctx = this.engine.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus!);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  private bell(freq: number, delay: number, vol = 0.18): void {
    for (const [m, v] of [[1, 1], [2.76, 0.4], [5.4, 0.18]] as const) this.tone('sine', freq * m, freq * m, 1.1 / m + 0.2, vol * v, delay, 0.003);
  }

  play(s: Sfx): void {
    if (!this.engine.ctx || this.muted) return;
    switch (s) {
      case 'pickup': this.tone('sine', 420, 880, 0.09, 0.22); break;
      case 'drop': this.tone('triangle', 300, 140, 0.1, 0.25); this.burst(500, 1, 0.06, 0.15); break;
      case 'click': this.tone('square', 900, 700, 0.04, 0.05); break;
      case 'swap': this.tone('sine', 600, 1200, 0.12, 0.15); this.tone('sine', 900, 1800, 0.12, 0.1, 0.06); break;
      case 'chop': this.burst(2200, 2, 0.05, 0.5); this.tone('sine', 180, 70, 0.08, 0.35); break;
      case 'grind': this.burst(700 + Math.random() * 400, 3, 0.16, 0.35, 0, 'bandpass', 300); break;
      case 'plop': this.tone('sine', 900, 180, 0.18, 0.3); this.tone('sine', 500, 1400, 0.08, 0.12, 0.12); break;
      case 'bottle': this.tone('sine', 700, 1500, 0.35, 0.15); this.burst(3000, 4, 0.25, 0.08); break;
      case 'deliver': [0, 4, 7, 12].forEach((n, i) => this.bell(660 * 2 ** (n / 12), i * 0.07)); break;
      case 'wrong': this.tone('sawtooth', 180, 150, 0.25, 0.12); this.tone('sawtooth', 120, 100, 0.3, 0.12, 0.12); break;
      case 'alarm': this.tone('square', 1320, 1320, 0.08, 0.06); this.tone('square', 1320, 1320, 0.08, 0.06, 0.14); break;
      case 'ignite': this.burst(400, 0.6, 0.7, 0.5, 0, 'lowpass', 2500); this.tone('sine', 90, 40, 0.5, 0.3); break;
      case 'water': this.burst(4000, 0.8, 0.14, 0.12, 0, 'highpass'); break;
      case 'vanish': this.tone('sine', 1500, 200, 0.35, 0.15); this.burst(6000, 2, 0.3, 0.1, 0, 'bandpass', 800); break;
      case 'tick': this.tone('sine', 1000, 1000, 0.06, 0.15); break;
      case 'go': [0, 4, 7].forEach((n) => this.tone('triangle', 523 * 2 ** (n / 12), 523 * 2 ** (n / 12), 0.6, 0.12)); this.bell(1046, 0); break;
      case 'expire': this.tone('triangle', 400, 200, 0.4, 0.2); break;
      case 'throw': this.burst(1200, 1, 0.18, 0.2, 0, 'bandpass', 3000); break;
      case 'fall': this.tone('sine', 700, 80, 0.9, 0.2); break;
      case 'whoosh': this.burst(600, 0.7, 0.25, 0.3, 0, 'bandpass', 2400); break;
      case 'thunder': this.burst(120, 0.5, 2.4, 0.9, 0, 'lowpass', 40); this.burst(300, 0.5, 0.4, 0.5, 0, 'lowpass'); break;
      case 'star': this.bell(880, 0, 0.25); this.bell(1320, 0.08, 0.15); break;
      case 'done': [0, 4, 7, 12, 16].forEach((n, i) => this.bell(523 * 2 ** (n / 12), i * 0.12, 0.2)); break;
    }
  }

  /** Bubbling blip for a brewing cauldron. */
  bubble(): void {
    if (!this.engine.ctx || this.muted) return;
    const f = 200 + Math.random() * 300;
    this.tone('sine', f, f * 2.2, 0.06, 0.05);
  }

  // ---- music: a light, bouncy minor-key jig generated per level ----
  startMusic(seed: string): void {
    const rng = new SeededRandom(seed);
    const scale = [0, 2, 3, 5, 7, 8, 10, 12, 14, 15]; // natural minor
    const prog = [0, 5, 3, 4]; // i  VI  iv  v  (as scale degrees)
    const mel: number[] = [];
    const bass: number[] = [];
    let deg = 4;
    for (let bar = 0; bar < 8; bar++) {
      const root = prog[bar % 4];
      for (let s = 0; s < 8; s++) {
        bass.push(s % 4 === 0 ? root : s % 4 === 2 ? root + 4 : -99);
        if (rng.chance(s % 2 === 0 ? 0.85 : 0.45)) {
          deg = Math.max(0, Math.min(scale.length - 1, deg + rng.pick([-2, -1, -1, 1, 1, 2, 0])));
          if (s === 0) deg = Math.max(0, Math.min(9, root + rng.pick([0, 2, 4])));
          mel.push(scale[deg]);
        } else mel.push(-99);
      }
    }
    this.seq = { mel, bass: bass.map((d) => (d < -50 ? d : scale[d % 7] + (d >= 7 ? 12 : 0))) };
    this.musicOn = true;
    this.beat = 0;
    if (this.engine.ctx) this.nextBeat = this.engine.ctx.currentTime + 0.1;
    this.tempo = 132;
  }

  stopMusic(): void { this.musicOn = false; }
  setHurry(h: boolean): void { this.tempo = h ? 160 : 132; }

  private scheduleMusic(): void {
    const ctx = this.engine.ctx;
    if (!ctx || !this.musicOn || this.muted) return;
    if (this.nextBeat < ctx.currentTime) this.nextBeat = ctx.currentTime + 0.05;
    const step = 60 / this.tempo / 2;
    while (this.nextBeat < ctx.currentTime + 0.2) {
      const i = this.beat % this.seq.mel.length;
      const m = this.seq.mel[i];
      const b = this.seq.bass[i];
      const t = this.nextBeat - ctx.currentTime;
      if (m > -50) this.note(57 + m, t, step * 1.6, 'triangle', 0.09);
      if (b > -50) this.note(45 + b, t, step * 1.8, 'sine', 0.2);
      if (i % 2 === 0) this.musicTick(t, i % 8 === 0 ? 0.05 : 0.02);
      this.nextBeat += step;
      this.beat++;
    }
  }

  private note(midi: number, delay: number, dur: number, type: OscillatorType, vol: number): void {
    const ctx = this.engine.ctx!;
    const t = ctx.currentTime + delay;
    const f = 440 * 2 ** ((midi - 69) / 12);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 2.005;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const g2 = ctx.createGain();
    g2.gain.value = 0.3;
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(this.musicBus!);
    o.start(t); o2.start(t);
    o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }

  private musicTick(delay: number, vol: number): void {
    const ctx = this.engine.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(f).connect(g).connect(this.musicBus!);
    src.start(t, Math.random());
    src.stop(t + 0.08);
  }
}
