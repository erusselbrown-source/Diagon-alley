/**
 * Synthesized soundscape for the tower room (Web Audio only, no files):
 * crackling hearth (spatial), wind buffeting the tower, a ticking mantel
 * clock, a slow generative celesta-and-strings score in a soft minor mode,
 * plus one-shot effects (knock, door, riddle chimes, feather pickups,
 * footsteps on boards, page turns, globe whirr, harp strums).
 */
import * as THREE from 'three';
import { AudioEngine } from '../audio';
import { SeededRandom } from '../core/random';

export class TowerAudio {
  private readonly engine = new AudioEngine();
  private ctx!: AudioContext;
  private out!: GainNode;
  private reverb!: ConvolverNode;
  private wet!: GainNode;
  private noise!: AudioBuffer;
  private firePanner!: PannerNode;
  private clockPanner!: PannerNode;
  private fireGain!: GainNode;
  private musicGain!: GainNode;
  private rng = new SeededRandom('audio');
  started = false;
  muted = false;

  async start(firePos: THREE.Vector3, clockPos: THREE.Vector3): Promise<void> {
    if (this.started) return;
    await this.engine.start();
    this.started = true;
    this.ctx = this.engine.ctx!;
    this.out = this.engine.master!;
    this.out.gain.value = 0.8;
    this.noise = this.engine.createNoiseBuffer(3, 77);
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2, 2.6);
    this.wet = this.ctx.createGain();
    this.wet.gain.value = 0.5;
    this.reverb.connect(this.wet).connect(this.out);
    this.startFire(firePos);
    this.startWind();
    this.startClock(clockPos);
    this.startMusic();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.started) this.out.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.1);
  }

  updateListener(cam: THREE.Camera): void {
    if (!this.started) return;
    const l = this.ctx.listener;
    const p = cam.position;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.x, t, 0.05); l.positionY.setTargetAtTime(p.y, t, 0.05); l.positionZ.setTargetAtTime(p.z, t, 0.05);
      l.forwardX.setTargetAtTime(f.x, t, 0.05); l.forwardY.setTargetAtTime(f.y, t, 0.05); l.forwardZ.setTargetAtTime(f.z, t, 0.05);
      l.upX.setTargetAtTime(u.x, t, 0.05); l.upY.setTargetAtTime(u.y, t, 0.05); l.upZ.setTargetAtTime(u.z, t, 0.05);
    }
  }

  setFireLevel(k: number): void {
    if (this.started) this.fireGain.gain.setTargetAtTime(0.5 * k, this.ctx.currentTime, 0.3);
  }

  // ------------------------------------------------------------------ beds

  private impulse(seconds: number, decay: number): AudioBuffer {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const b = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let s = 1234 + c * 999;
      for (let i = 0; i < len; i++) {
        s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
        d[i] = (((s >>> 0) / 4294967296) * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return b;
  }

  private panner(pos: THREE.Vector3, ref = 1.5): PannerNode {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = 1.2;
    p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    return p;
  }

  private noiseSrc(): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.loopStart = this.rng.range(0, 1);
    return s;
  }

  private startFire(pos: THREE.Vector3): void {
    const ctx = this.ctx;
    this.firePanner = this.panner(pos, 1.8);
    this.fireGain = ctx.createGain();
    this.fireGain.gain.value = 0.5;
    this.fireGain.connect(this.firePanner).connect(this.out);
    const send = ctx.createGain(); send.gain.value = 0.15; this.fireGain.connect(send).connect(this.reverb);
    // low roar
    const roar = this.noiseSrc();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    const rg = ctx.createGain(); rg.gain.value = 0.35;
    roar.connect(lp).connect(rg).connect(this.fireGain);
    roar.start(0, this.rng.range(0, 2));
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.4;
    const lg = ctx.createGain(); lg.gain.value = 0.12;
    lfo.connect(lg).connect(rg.gain); lfo.start();
    // crackles: scheduled random clicks
    const crackle = () => {
      if (!this.started) return;
      const t = ctx.currentTime;
      const n = this.rng.int(1, 4);
      for (let k = 0; k < n; k++) {
        const s = ctx.createBufferSource(); s.buffer = this.noise;
        const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = this.rng.range(1500, 5000); hp.Q.value = 1.5;
        const g = ctx.createGain();
        const at = t + k * this.rng.range(0.01, 0.05);
        g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(this.rng.range(0.25, 0.9), at + 0.002); g.gain.exponentialRampToValueAtTime(0.001, at + this.rng.range(0.01, 0.05));
        s.connect(hp).connect(g).connect(this.fireGain);
        s.start(at, this.rng.range(0, 2.5), 0.08);
      }
      setTimeout(crackle, this.rng.range(40, 420));
    };
    crackle();
  }

  private startWind(): void {
    const ctx = this.ctx;
    const src = this.noiseSrc();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.9;
    const g = ctx.createGain(); g.gain.value = 0.06;
    src.connect(bp).connect(g).connect(this.out);
    const send = ctx.createGain(); send.gain.value = 0.3; g.connect(send).connect(this.reverb);
    src.start();
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = 260;
    lfo.connect(lg).connect(bp.frequency); lfo.start();
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.13;
    const lg2 = ctx.createGain(); lg2.gain.value = 0.035;
    lfo2.connect(lg2).connect(g.gain); lfo2.start();
    // a whistle through the leading
    const whistle = this.noiseSrc();
    const wb = ctx.createBiquadFilter(); wb.type = 'bandpass'; wb.frequency.value = 1400; wb.Q.value = 18;
    const wg = ctx.createGain(); wg.gain.value = 0.0;
    whistle.connect(wb).connect(wg).connect(this.out);
    whistle.start();
    const gust = () => {
      if (!this.started) return;
      const t = ctx.currentTime;
      wb.frequency.setTargetAtTime(this.rng.range(900, 1800), t, 0.8);
      wg.gain.setTargetAtTime(this.rng.range(0.01, 0.03), t, 1.2);
      wg.gain.setTargetAtTime(0, t + this.rng.range(2, 4), 1.5);
      setTimeout(gust, this.rng.range(7000, 16000));
    };
    setTimeout(gust, 4000);
  }

  private startClock(pos: THREE.Vector3): void {
    const ctx = this.ctx;
    this.clockPanner = this.panner(pos, 0.8);
    const g = ctx.createGain(); g.gain.value = 0.25;
    g.connect(this.clockPanner).connect(this.out);
    let tock = false;
    const tick = () => {
      if (!this.started) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = tock ? 1900 : 2400;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = tock ? 2200 : 3000; bp.Q.value = 8;
      const eg = ctx.createGain(); eg.gain.setValueAtTime(0.5, t); eg.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      o.connect(bp).connect(eg).connect(g);
      o.start(t); o.stop(t + 0.04);
      tock = !tock;
      setTimeout(tick, 1000);
    };
    tick();
  }

  /** Slow generative score: sustained strings pad + sparse celesta melody, D aeolian/dorian. */
  private startMusic(): void {
    const ctx = this.ctx;
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.22;
    this.musicGain.connect(this.out);
    const send = ctx.createGain(); send.gain.value = 0.9; this.musicGain.connect(send).connect(this.reverb);
    const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
    // chord progression (roots in MIDI): Dm – B♭ – F – C – Gm – Dm – A(sus) – Dm
    const chords = [[50, 57, 62, 65], [46, 53, 58, 62], [41, 53, 57, 60], [48, 55, 60, 64], [43, 55, 58, 62], [50, 57, 62, 65], [45, 52, 57, 62], [50, 57, 62, 65]];
    const scale = [62, 64, 65, 67, 69, 70, 72, 74, 76, 77, 79, 81];
    let bar = 0;
    const BAR = 6.4;
    const pad = (notes: number[], t: number) => {
      for (const n of notes) {
        for (const det of [-4, 4]) {
          const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = det;
          const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.3;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03, t + 2.2); g.gain.setValueAtTime(0.03, t + BAR - 1.2); g.gain.linearRampToValueAtTime(0, t + BAR + 1.6);
          o.connect(lp).connect(g).connect(this.musicGain);
          o.start(t); o.stop(t + BAR + 1.7);
        }
      }
    };
    const bell = (n: number, t: number, v = 0.12) => {
      for (const [ratio, amp, dec] of [[1, 1, 2.2], [2, 0.35, 1.2], [3.01, 0.18, 0.6], [4.2, 0.08, 0.3]]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = midi(n) * ratio;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * amp, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
        o.connect(g).connect(this.musicGain);
        o.start(t); o.stop(t + dec + 0.05);
      }
    };
    const schedule = () => {
      if (!this.started) return;
      const t0 = ctx.currentTime + 0.1;
      const ch = chords[bar % chords.length];
      pad(ch, t0);
      // celesta phrase: 3–6 notes drifting around chord tones
      let idx = scale.indexOf(ch[2] + 12 <= 81 ? ch[2] + 12 : ch[2]);
      if (idx < 0) idx = this.rng.int(2, 8);
      const n = this.rng.int(3, 6);
      let tt = t0 + this.rng.range(0.2, 1.2);
      for (let k = 0; k < n && tt < t0 + BAR - 0.5; k++) {
        bell(scale[THREE.MathUtils.clamp(idx, 0, scale.length - 1)], tt, 0.06 + this.rng.range(0, 0.04));
        idx += this.rng.pick([-2, -1, 1, 1, 2]);
        tt += this.rng.pick([0.8, 0.8, 1.6, 0.4, 1.2]);
      }
      bar++;
      setTimeout(schedule, BAR * 1000);
    };
    schedule();
  }

  // ------------------------------------------------------------------ one-shots

  private env(node: AudioNode, gain: number, a: number, d: number, at?: number, dest: AudioNode = this.out): GainNode {
    const t = at ?? this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    node.connect(g).connect(dest);
    const s = this.ctx.createGain(); s.gain.value = 0.35; g.connect(s).connect(this.reverb);
    return g;
  }

  knock(): void {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    for (let k = 0; k < 3; k++) {
      const o = this.ctx.createOscillator(); o.type = 'sine';
      const at = t + k * 0.28;
      o.frequency.setValueAtTime(180, at); o.frequency.exponentialRampToValueAtTime(70, at + 0.12);
      this.env(o, 0.8, 0.002, 0.18, at);
      o.start(at); o.stop(at + 0.25);
      const s = this.ctx.createBufferSource(); s.buffer = this.noise;
      const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 3;
      s.connect(bp); this.env(bp, 0.35, 0.001, 0.06, at);
      s.start(at, 0.5, 0.1);
    }
  }

  /** The bronze eagle speaks: a breathy, bell-tinged shimmer. */
  eagleVoice(): void {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    [74, 81, 79, 86].forEach((n, k) => this.chime(n, t + k * 0.13, 0.08));
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 2;
    bp.frequency.setValueAtTime(600, t); bp.frequency.linearRampToValueAtTime(1600, t + 0.9);
    s.connect(bp); this.env(bp, 0.12, 0.2, 0.9, t);
    s.start(t, 1, 1.3);
  }

  private chime(n: number, t: number, v: number): void {
    const f = 440 * Math.pow(2, (n - 69) / 12);
    for (const [r, a, d] of [[1, 1, 1.8], [2.76, 0.4, 0.9], [5.4, 0.15, 0.4]]) {
      const o = this.ctx.createOscillator(); o.frequency.value = f * r;
      this.env(o, v * a, 0.004, d, t);
      o.start(t); o.stop(t + d + 0.05);
    }
  }

  correct(): void { if (!this.started) return; const t = this.ctx.currentTime; [62, 66, 69, 74, 78].forEach((n, k) => this.chime(n, t + k * 0.09, 0.12)); }
  wrong(): void {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.linearRampToValueAtTime(160, t + 0.5);
    this.env(o, 0.25, 0.01, 0.6, t); o.start(t); o.stop(t + 0.7);
  }
  feather(n: number): void { if (!this.started) return; const t = this.ctx.currentTime; [69, 73, 76, 81, 85].slice(0, 3 + (n % 3)).forEach((m, k) => this.chime(m + n, t + k * 0.07, 0.1)); }
  finale(): void {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    [50, 57, 62, 65, 69, 74, 77, 81, 86].forEach((n, k) => this.chime(n, t + k * 0.16, 0.12));
    [62, 65, 69].forEach((n) => this.chime(n, t + 1.8, 0.1));
  }

  door(opening: boolean): void {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    // creak: resonant sawtooth with jittered pitch
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(opening ? 110 : 160, t);
    for (let k = 1; k < 14; k++) o.frequency.linearRampToValueAtTime((opening ? 110 : 160) + Math.sin(k * 2.7) * 25 + (opening ? k * 4 : -k * 4), t + k * 0.09);
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 6;
    o.connect(bp); this.env(bp, 0.12, 0.1, 1.2, t);
    o.start(t); o.stop(t + 1.5);
    if (!opening) {
      const th = this.ctx.createOscillator(); th.frequency.setValueAtTime(90, t + 1.1); th.frequency.exponentialRampToValueAtTime(40, t + 1.4);
      this.env(th, 0.9, 0.002, 0.35, t + 1.1); th.start(t + 1.1); th.stop(t + 1.6);
    }
  }

  step(onCarpet: boolean, stone: boolean): void {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = onCarpet ? 380 : stone ? 1800 : 900;
    s.connect(lp); this.env(lp, onCarpet ? 0.12 : 0.22, 0.004, stone ? 0.06 : 0.09, t);
    s.start(t, this.rng.range(0, 2.5), 0.15);
    if (!onCarpet && !stone && this.rng.chance(0.15)) {
      // a creaky board
      const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(this.rng.range(300, 520), t + 0.02);
      o.frequency.linearRampToValueAtTime(this.rng.range(260, 480), t + 0.25);
      this.env(o, 0.025, 0.05, 0.25, t + 0.02); o.start(t); o.stop(t + 0.35);
    }
  }

  page(): void {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    hp.frequency.setValueAtTime(1800, t); hp.frequency.linearRampToValueAtTime(5000, t + 0.25);
    s.connect(hp); this.env(hp, 0.2, 0.05, 0.25, t);
    s.start(t, 0.2, 0.4);
  }

  whirr(): void {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 4;
    bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(1200, t + 0.4); bp.frequency.exponentialRampToValueAtTime(200, t + 2.5);
    s.connect(bp); this.env(bp, 0.25, 0.1, 2.5, t);
    s.start(t, 0, 3);
  }

  whoosh(): void {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(200, t); lp.frequency.linearRampToValueAtTime(1500, t + 0.3); lp.frequency.linearRampToValueAtTime(300, t + 1.2);
    s.connect(lp); this.env(lp, 0.5, 0.1, 1.3, t, this.fireGain);
    s.start(t, 0, 1.6);
  }

  /** Harp: a rising, then settling, plucked arpeggio (Karplus-like with filtered noise bursts + sines). */
  harp(): void {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const notes = [50, 57, 62, 65, 69, 74, 77, 81, 77, 74];
    notes.forEach((n, k) => {
      const at = t + k * 0.11;
      const f = 440 * Math.pow(2, (n - 69) / 12);
      for (const [r, a] of [[1, 1], [2, 0.3], [3, 0.12]]) {
        const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f * r;
        this.env(o, 0.09 * a, 0.003, 1.6, at);
        o.start(at); o.stop(at + 1.7);
      }
    });
  }

  /** A soft two-note hoot: low sine with breathy noise, the second note longer. */
  hoot(): void {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    for (const [at, f, d] of [[0, 410, 0.18], [0.32, 380, 0.5]] as const) {
      const o = this.ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f * 1.05, t + at); o.frequency.linearRampToValueAtTime(f * 0.95, t + at + d);
      this.env(o, 0.28, 0.04, d, t + at); o.start(t + at); o.stop(t + at + d + 0.1);
      const s = this.ctx.createBufferSource(); s.buffer = this.noise;
      const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 6;
      s.connect(bp); this.env(bp, 0.08, 0.04, d, t + at); s.start(t + at, 0.3, d + 0.1);
    }
  }

  /** Purr: low noise amplitude-modulated at ~25 Hz. */
  purr(): void {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    const am = this.ctx.createGain(); am.gain.value = 0;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 24;
    const lg = this.ctx.createGain(); lg.gain.value = 0.5;
    lfo.connect(lg).connect(am.gain);
    s.connect(lp).connect(am); this.env(am, 0.9, 0.3, 2.4, t);
    s.start(t, 0, 2.8); lfo.start(t); lfo.stop(t + 2.8);
  }

  clockChime(): void {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    [76, 72, 74, 67].forEach((n, k) => this.chime(n, t + k * 0.6, 0.1));
  }
}
