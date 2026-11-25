/**
 * The alley's procedural, spatial soundscape — every sound synthesized with
 * Web Audio from seeded noise and oscillators (zero audio files).
 *
 * Beds (looping, non-spatial):
 *  - crowd murmur: pink noise through three wandering "formant" band-passes
 *    with syllabic amplitude flutter, heavily low-passed (muffled by stone)
 *  - wind: a high-Q whistle band drifting between the roofs + low rumble, gusting
 *  - rain: hiss + a synthesized droplet-patter loop, tied to the preset's rain
 *
 * Events (HRTF-panned at their world position unless noted):
 *  - distant owl hoots, creaking wrought-iron signs, cobble footsteps (head)
 *  - spell chimes (inharmonic bell partials + shimmer), Lumos / Nox
 *  - firework whistle, boom (speed-of-sound delayed) and crackle; thunder
 */
import * as THREE from 'three';
import { AudioEngine } from './index';
import type { SfxName } from '../shops/interior';
import { SeededRandom } from '../core/random';

export interface Weather { rain: number; wind: number; crowd: number; wetness: number }

interface SignLike { pivot: THREE.Object3D; readonly speed: number }

export class Soundscape {
  readonly engine = new AudioEngine();
  private ctx!: AudioContext;
  private sfx!: GainNode;
  private amb!: GainNode;
  private ambLP!: BiquadFilterNode;
  private indoors = 0;
  private music: { pos: THREE.Vector3; on: boolean; panner: PannerNode | null; gain: GainNode | null; next: number; step: number; tune: number } = { pos: new THREE.Vector3(), on: true, panner: null, gain: null, next: 0, step: 0, tune: 0 };
  private started = false;
  private muted = false;
  private readonly rng = new SeededRandom('soundscape');
  private white!: AudioBuffer; private pink!: AudioBuffer; private brown!: AudioBuffer;
  private crowdGain!: GainNode; private windGain!: GainNode; private rainGain!: GainNode; private patterGain!: GainNode;
  private windBand!: BiquadFilterNode; private crowdBands: { f: BiquadFilterNode; g: GainNode; base: number }[] = [];
  private weather: Weather = { rain: 0, wind: 0.5, crowd: 1, wetness: 0.5 };
  private nextOwl = 9; private nextCreak = 4; private nextFlutter = 0; private nextGust = 0;
  private readonly listenerPos = new THREE.Vector3();

  get isStarted(): boolean { return this.started; }
  get isMuted(): boolean { return this.muted; }

  /** Must run inside a user gesture (click / key). */
  async start(): Promise<void> {
    if (this.started) return;
    await this.engine.start();
    this.ctx = this.engine.ctx!;
    const ctx = this.ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
    this.engine.master!.disconnect();
    this.engine.master!.connect(comp).connect(ctx.destination);
    this.engine.master!.gain.value = 0;
    this.engine.master!.gain.setTargetAtTime(0.75, ctx.currentTime, 0.8); // fade in
    this.amb = ctx.createGain();
    this.ambLP = this.filter('lowpass', 20000, 0.5);
    this.amb.connect(this.ambLP).connect(this.engine.master!);
    this.sfx = ctx.createGain(); this.sfx.connect(this.engine.master!);

    this.white = this.engine.createNoiseBuffer(3, 11);
    this.pink = this.coloured(this.engine.createNoiseBuffer(4, 23), 'pink');
    this.brown = this.coloured(this.engine.createNoiseBuffer(4, 37), 'brown');
    this.buildCrowd();
    this.buildWind();
    this.buildRain();
    this.started = true;
    this.applyWeather(0.01);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.started) this.engine.master!.gain.setTargetAtTime(m ? 0 : 0.75, this.ctx.currentTime, 0.15);
  }

  setWeather(w: Partial<Weather>): void {
    Object.assign(this.weather, w);
    if (this.started) this.applyWeather(0.6);
  }

  // ---------------------------------------------------------------------------
  // Buffers
  // ---------------------------------------------------------------------------

  private coloured(src: AudioBuffer, kind: 'pink' | 'brown'): AudioBuffer {
    const d = src.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = d[i];
      if (kind === 'pink') { // Paul Kellet's refined filter
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    // remove the random-walk drift so the loop point is seamless
    const drift = d[d.length - 1] - d[0];
    for (let i = 0; i < d.length; i++) d[i] -= drift * (i / d.length);
    return src;
  }

  private loop(buf: AudioBuffer, offset = 0): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.loop = true;
    s.start(0, offset % buf.duration);
    return s;
  }

  private filter(type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    return f;
  }

  private gain(v = 0): GainNode { const g = this.ctx.createGain(); g.gain.value = v; return g; }

  // ---------------------------------------------------------------------------
  // Beds
  // ---------------------------------------------------------------------------

  private buildCrowd(): void {
    const ctx = this.ctx;
    this.crowdGain = this.gain(0);
    const lp = this.filter('lowpass', 1100);
    this.crowdGain.connect(lp).connect(this.amb);
    // three voices' worth of wandering formants, panned apart
    [[260, 2.2, -0.5], [540, 2.8, 0.35], [1150, 3.2, 0.05], [380, 2.0, 0.6]].forEach(([f, q, pan], i) => {
      const src = this.loop(this.pink, i * 0.9);
      const bp = this.filter('bandpass', f, q);
      const g = this.gain(0.3);
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      src.connect(bp).connect(g).connect(p).connect(this.crowdGain);
      this.crowdBands.push({ f: bp, g, base: f });
    });
    // a broad, very muffled body under the voices
    const body = this.loop(this.brown, 1.3);
    const bl = this.filter('lowpass', 380);
    const bg = this.gain(0.35);
    body.connect(bl).connect(bg).connect(this.crowdGain);
  }

  private buildWind(): void {
    this.windGain = this.gain(0);
    this.windGain.connect(this.amb);
    const whistle = this.loop(this.white, 0.4);
    this.windBand = this.filter('bandpass', 850, 14);
    const wg = this.gain(0.55);
    whistle.connect(this.windBand).connect(wg).connect(this.windGain);
    const rumble = this.loop(this.brown, 2.2);
    const rl = this.filter('lowpass', 260);
    const rg = this.gain(0.5);
    rumble.connect(rl).connect(rg).connect(this.windGain);
  }

  private buildRain(): void {
    const ctx = this.ctx;
    this.rainGain = this.gain(0);
    const hiss = this.loop(this.white, 1.1);
    const hp = this.filter('highpass', 900), lp = this.filter('lowpass', 7500);
    hiss.connect(hp).connect(lp).connect(this.rainGain).connect(this.amb);
    // droplet patter: thousands of tiny decaying pings on stone, slate and puddles
    const sr = ctx.sampleRate, len = Math.floor(sr * 3.0);
    const buf = ctx.createBuffer(2, len, sr);
    const rng = new SeededRandom('rain-patter');
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      const drops = 2400;
      for (let k = 0; k < drops; k++) {
        const at = Math.floor(rng.next() * len), f = rng.range(1400, 5200), amp = rng.range(0.03, 0.22) * (rng.next() < 0.08 ? 2.5 : 1);
        const dur = Math.floor(sr * rng.range(0.004, 0.018));
        for (let i = 0; i < dur; i++) {
          const j = (at + i) % len;
          d[j] += amp * Math.sin((2 * Math.PI * f * i) / sr) * Math.exp(-i / (dur * 0.28));
        }
      }
    }
    const patter = ctx.createBufferSource();
    patter.buffer = buf; patter.loop = true; patter.start();
    this.patterGain = this.gain(0);
    patter.connect(this.filter('highpass', 600)).connect(this.patterGain).connect(this.amb);
  }

  private applyWeather(tc: number): void {
    const t = this.ctx.currentTime, w = this.weather;
    this.crowdGain.gain.setTargetAtTime(0.16 * w.crowd * (1 - 0.6 * w.rain), t, tc);
    this.windGain.gain.setTargetAtTime(0.05 + 0.13 * w.wind, t, tc);
    this.rainGain.gain.setTargetAtTime(0.16 * w.rain, t, tc);
    this.patterGain.gain.setTargetAtTime(0.55 * w.rain, t, tc);
  }

  // ---------------------------------------------------------------------------
  // Per-frame
  // ---------------------------------------------------------------------------

  update(dt: number, camera: THREE.Camera, signs: readonly SignLike[]): void {
    if (!this.started) return;
    const ctx = this.ctx, now = ctx.currentTime, rng = this.rng;
    // listener follows the camera
    const L = ctx.listener;
    camera.getWorldPosition(this.listenerPos);
    const fwd = camera.getWorldDirection(new THREE.Vector3());
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    if (L.positionX) {
      L.positionX.setTargetAtTime(this.listenerPos.x, now, 0.02); L.positionY.setTargetAtTime(this.listenerPos.y, now, 0.02); L.positionZ.setTargetAtTime(this.listenerPos.z, now, 0.02);
      L.forwardX.setTargetAtTime(fwd.x, now, 0.02); L.forwardY.setTargetAtTime(fwd.y, now, 0.02); L.forwardZ.setTargetAtTime(fwd.z, now, 0.02);
      L.upX.setTargetAtTime(up.x, now, 0.02); L.upY.setTargetAtTime(up.y, now, 0.02); L.upZ.setTargetAtTime(up.z, now, 0.02);
    } else {
      L.setPosition(this.listenerPos.x, this.listenerPos.y, this.listenerPos.z);
      L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
    // crowd syllables: formants wander, amplitudes flutter
    if (now > this.nextFlutter) {
      this.nextFlutter = now + rng.range(0.12, 0.35);
      for (const b of this.crowdBands) {
        b.g.gain.setTargetAtTime(rng.range(0.08, 0.5), now, 0.06);
        b.f.frequency.setTargetAtTime(b.base * rng.range(0.8, 1.25), now, 0.15);
      }
    }
    // wind gusts: the whistle slides between roof gaps
    if (now > this.nextGust) {
      this.nextGust = now + rng.range(1.2, 3.5);
      this.windBand.frequency.setTargetAtTime(rng.range(520, 1350), now, rng.range(0.6, 1.6));
      this.windGain.gain.setTargetAtTime((0.04 + 0.14 * this.weather.wind) * rng.range(0.5, 1.4), now, 0.9);
    }
    // distant owls (fewer in heavy rain)
    if (now > this.nextOwl) {
      this.nextOwl = now + rng.range(14, 34) * (1 + 2 * this.weather.rain);
      const a = rng.range(0, Math.PI * 2), r = rng.range(22, 42);
      this.owl(this.listenerPos.clone().add(new THREE.Vector3(Math.cos(a) * r, rng.range(10, 18), Math.sin(a) * r)));
    }
    // ironwork creaks from nearby swinging signs
    if (now > this.nextCreak) {
      this.nextCreak = now + rng.range(3, 9) / (0.6 + this.weather.wind);
      const near = signs.filter((s) => s.pivot.getWorldPosition(new THREE.Vector3()).distanceTo(this.listenerPos) < 22);
      if (near.length) {
        const s = near[Math.floor(rng.next() * near.length)];
        this.creak(s.pivot.getWorldPosition(new THREE.Vector3()), 0.35 + Math.min(1, s.speed * 1.5));
      }
    }
    this.scheduleMusic();
    void dt;
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  private spatial(pos: THREE.Vector3, ref = 3, rolloff = 1.1): PannerNode {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref; p.rolloffFactor = rolloff; p.maxDistance = 200;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
    p.connect(this.sfx);
    return p;
  }

  private tone(dest: AudioNode, type: OscillatorType, f0: number, f1: number, at: number, attack: number, dur: number, peak: number, glide = dur): void {
    const o = this.ctx.createOscillator(), g = this.gain(0);
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), at + glide);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(dest);
    o.start(at); o.stop(at + dur + 0.05);
  }

  private noiseBurst(dest: AudioNode, buf: AudioBuffer, at: number, attack: number, dur: number, peak: number, filters: BiquadFilterNode[] = []): void {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    const g = this.gain(0);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    let n: AudioNode = s;
    for (const f of filters) n = n.connect(f);
    n.connect(g).connect(dest);
    s.start(at, this.rng.range(0, buf.duration - dur - 0.1));
    s.stop(at + dur + 0.05);
  }

  /** Inharmonic bell: partial ratios of a small struck bar/bell. */
  private bell(dest: AudioNode, f: number, at: number, peak: number, decay = 1.4): void {
    const partials: [number, number, number][] = [[1, 1, 1], [2.0, 0.5, 0.7], [2.76, 0.35, 0.55], [4.07, 0.22, 0.4], [5.4, 0.12, 0.3]];
    const nyq = this.ctx.sampleRate * 0.45;
    for (const [r, a, d] of partials) if (f * r < nyq) this.tone(dest, 'sine', f * r, f * r * 1.002, at, 0.004, decay * d, peak * a);
  }

  private shimmer(dest: AudioNode, at: number, dur: number, peak: number, up = true): void {
    const bp = this.filter('bandpass', up ? 3000 : 9000, 3);
    bp.frequency.setValueAtTime(up ? 3000 : 9000, at);
    bp.frequency.exponentialRampToValueAtTime(up ? 10000 : 2500, at + dur);
    this.noiseBurst(dest, this.white, at, dur * 0.3, dur, peak, [this.filter('highpass', 2500), bp]);
  }

  /** Crisp magical chime when a spell leaves the wand (slightly right: the wand hand). */
  cast(): void {
    if (!this.started) return;
    const now = this.ctx.currentTime, rng = this.rng;
    const pan = this.ctx.createStereoPanner(); pan.pan.value = 0.3; pan.connect(this.sfx);
    const scale = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4];
    const root = rng.pick([880, 987.8, 1046.5, 1174.7]);
    let k = Math.floor(rng.range(0, 3));
    for (let i = 0; i < 4; i++, k += 1 + Math.floor(rng.range(0, 2))) this.bell(pan, root * scale[k % scale.length] * (k >= scale.length ? 2 : 1), now + i * 0.045, 0.06 - i * 0.008, 1.1);
    this.shimmer(pan, now, 0.55, 0.12);
  }

  /** Softer chime and sparkle where the bolt lands. */
  impact(pos: THREE.Vector3): void {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    const p = this.spatial(pos, 4);
    this.bell(p, this.rng.pick([659.3, 784, 880]), now, 0.08, 1.6);
    this.shimmer(p, now, 0.4, 0.14, false);
    this.noiseBurst(p, this.pink, now, 0.003, 0.12, 0.25, [this.filter('bandpass', 1800, 0.8)]);
  }

  lumos(pos: THREE.Vector3, on: boolean): void {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    const p = this.spatial(pos, 4);
    const notes = on ? [523.3, 659.3, 784, 1046.5] : [784, 622.3, 523.3, 392];
    notes.forEach((f, i) => this.bell(p, f, now + i * 0.07, 0.07, on ? 1.5 : 0.9));
    if (on) this.noiseBurst(p, this.brown, now, 0.12, 0.7, 0.5, [this.filter('lowpass', 500)]); // warm "whump" of gas catching
    else this.noiseBurst(p, this.white, now + 0.05, 0.01, 0.35, 0.18, [this.filter('bandpass', 2500, 0.6)]); // "fff"
  }

  /** Wrought-iron creak: stick-slip friction grains through a resonant band. */
  creak(pos: THREE.Vector3, strength = 1): void {
    if (!this.started) return;
    const ctx = this.ctx, now = ctx.currentTime, rng = this.rng;
    const p = this.spatial(pos, 2.5, 1.3);
    const dur = rng.range(0.35, 0.8) * (0.7 + 0.5 * Math.min(1, strength));
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const curve = new Float32Array(32);
    let f = rng.range(70, 150);
    for (let i = 0; i < 32; i++) { f *= rng.range(0.9, 1.12); curve[i] = THREE.MathUtils.clamp(f, 50, 260); }
    o.frequency.setValueCurveAtTime(curve, now, dur);
    const bp = this.filter('bandpass', rng.range(650, 1400), 7);
    const g = this.gain(0);
    const peak = 0.12 * Math.min(1.4, strength);
    // stick-slip flutter
    const env = new Float32Array(48);
    for (let i = 0; i < 48; i++) env[i] = peak * Math.sin(Math.PI * i / 47) * (0.35 + 0.65 * (rng.next() < 0.6 ? 1 : 0.2));
    g.gain.setValueCurveAtTime(env, now, dur);
    o.connect(bp).connect(g).connect(p);
    o.start(now); o.stop(now + dur + 0.05);
  }

  owl(pos: THREE.Vector3): void {
    if (!this.started) return;
    const now = this.ctx.currentTime, rng = this.rng;
    const p = this.spatial(pos, 6, 0.9);
    const lp = this.filter('lowpass', 1600); lp.connect(p);
    const f = rng.range(330, 400);
    const hoots: [number, number][] = rng.chance(0.5) ? [[0, 0.5], [0.75, 0.22], [1.05, 0.55]] : [[0, 0.45], [0.6, 0.6]];
    for (const [at, d] of hoots) {
      this.tone(lp, 'sine', f * 1.04, f * 0.92, now + at, 0.07, d, 0.16);
      this.tone(lp, 'triangle', f * 2.08, f * 1.84, now + at, 0.07, d * 0.8, 0.015);
    }
  }

  /** A cobble footfall at the listener (wetter in the rain). */
  footstep(speed: number): void {
    if (!this.started) return;
    const now = this.ctx.currentTime, w = this.weather.wetness, rng = this.rng;
    const pan = this.ctx.createStereoPanner(); pan.pan.value = rng.range(-0.12, 0.12); pan.connect(this.sfx);
    const k = THREE.MathUtils.clamp(speed / 3.4, 0.4, 1);
    this.noiseBurst(pan, this.pink, now, 0.002, 0.06, 0.09 * k, [this.filter('bandpass', rng.range(1300, 2200), 1.2)]);
    this.tone(pan, 'sine', 110, 60, now, 0.003, 0.07, 0.12 * k);
    if (w > 0.4) this.noiseBurst(pan, this.white, now + 0.01, 0.005, 0.12 + 0.1 * w, 0.05 * w * k, [this.filter('highpass', 3500)]);
  }

  fireworkLaunch(pos: THREE.Vector3): void {
    if (!this.started) return;
    const now = this.ctx.currentTime, rng = this.rng;
    const p = this.spatial(pos.clone().add(new THREE.Vector3(0, 6, 0)), 6);
    const d = rng.range(0.9, 1.2);
    this.tone(p, 'sine', rng.range(700, 1000), rng.range(2400, 3200), now, 0.05, d, 0.05, d);
    this.noiseBurst(p, this.white, now, 0.02, d, 0.07, [this.filter('bandpass', 2500, 1.5)]);
  }

  fireworkBurst(pos: THREE.Vector3, big: boolean): void {
    if (!this.started) return;
    const delay = pos.distanceTo(this.listenerPos) / 343;
    const at = this.ctx.currentTime + delay;
    const p = this.spatial(pos, 10, 0.8);
    this.tone(p, 'sine', big ? 85 : 110, 32, at, 0.005, big ? 1.6 : 1.1, big ? 0.6 : 0.4, 0.5);
    this.noiseBurst(p, this.brown, at, 0.004, big ? 1.4 : 0.9, big ? 0.9 : 0.6, [this.filter('lowpass', 900)]);
    this.noiseBurst(p, this.pink, at, 0.002, 0.18, 0.3, [this.filter('highpass', 1500)]);
  }

  crackle(pos: THREE.Vector3): void {
    if (!this.started) return;
    const at = this.ctx.currentTime + pos.distanceTo(this.listenerPos) / 343;
    const p = this.spatial(pos, 8, 0.9);
    const n = 6 + Math.floor(this.rng.range(0, 8));
    for (let i = 0; i < n; i++) this.noiseBurst(p, this.white, at + this.rng.range(0, 0.35), 0.001, 0.02, this.rng.range(0.08, 0.22), [this.filter('highpass', 2500)]);
  }

  /** The courtyard wall re-laying itself: a cascade of brick clacks over a stony rumble. */
  bricks(pos: THREE.Vector3, seconds: number): void {
    if (!this.started) return;
    const now = this.ctx.currentTime, rng = this.rng;
    const p = this.spatial(pos, 5, 1);
    for (let i = 0; i < 70; i++) {
      const at = now + seconds * Math.pow(rng.next(), 0.8);
      this.noiseBurst(p, this.pink, at, 0.001, rng.range(0.03, 0.07), rng.range(0.05, 0.16), [this.filter('bandpass', rng.range(700, 1900), 2.5)]);
    }
    this.noiseBurst(p, this.brown, now, 0.4, seconds, 0.35, [this.filter('lowpass', 300)]);
  }


  // ---------------------------------------------------------------------------
  // Indoors, the shop's music box, and shop sound effects
  // ---------------------------------------------------------------------------

  /** 0 = street, 1 = inside a shop: the street beds go muffled and quieter. */
  setIndoors(k: number): void {
    if (!this.started || Math.abs(k - this.indoors) < 0.01) return;
    this.indoors = k;
    const t = this.ctx.currentTime;
    this.ambLP.frequency.setTargetAtTime(k > 0.5 ? 650 : 20000, t, 0.35);
    this.amb.gain.setTargetAtTime(k > 0.5 ? 0.45 : 1, t, 0.35);
  }

  /** Where the shop's gramophone sits (world). */
  setMusicSource(pos: THREE.Vector3): void { this.music.pos.copy(pos); if (this.music.panner) this.place(this.music.panner, pos); }

  /** Toggle the gramophone; returns true if playing. */
  toggleMusic(): boolean {
    this.music.on = !this.music.on;
    if (this.music.on) { this.music.tune = (this.music.tune + 1) % TUNES.length; this.music.step = 0; this.music.next = this.started ? this.ctx.currentTime + 0.1 : 0; }
    return this.music.on;
  }

  private place(p: PannerNode, pos: THREE.Vector3): void {
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
  }

  private scheduleMusic(): void {
    const m = this.music;
    if (!m.on || m.pos.lengthSq() === 0) return;
    if (!m.panner) {
      m.panner = this.spatial(m.pos, 1.8, 1.6);
      m.gain = this.gain(0.55);
      m.gain.connect(m.panner);
      m.next = this.ctx.currentTime + 0.2;
    }
    // only bother while within earshot
    if (this.listenerPos.distanceTo(m.pos) > 26) { m.next = this.ctx.currentTime + 0.1; return; }
    const tune = TUNES[m.tune];
    const beat = 60 / tune.bpm;
    while (m.next < this.ctx.currentTime + 0.25) {
      const [semi, len] = tune.notes[m.step % tune.notes.length];
      if (semi !== null) {
        const f = tune.root * Math.pow(2, semi / 12);
        // music-box tine: a sine with a quick, slightly inharmonic overtone and a long decay
        this.tone(m.gain!, 'sine', f, f, m.next, 0.003, 1.4, 0.05);
        this.tone(m.gain!, 'sine', f * 4.02, f * 4.02, m.next, 0.002, 0.25, 0.012);
        if (m.step % 3 === 0) this.tone(m.gain!, 'triangle', tune.root / 2 * Math.pow(2, tune.bass[Math.floor(m.step / 3) % tune.bass.length] / 12), tune.root / 2, m.next, 0.01, 0.9, 0.025, 10);
      }
      m.next += beat * len;
      m.step++;
    }
  }

  /** One-shot shop sounds, at a world position. */
  play(name: SfxName, pos: THREE.Vector3): void {
    if (!this.started) return;
    const now = this.ctx.currentTime, rng = this.rng;
    const p = this.spatial(pos, 2.5, 1.2);
    switch (name) {
      case 'ding': this.bell(p, 1975, now, 0.16, 2.4); break;
      case 'kaching': {
        this.noiseBurst(p, this.white, now, 0.002, 0.08, 0.2, [this.filter('bandpass', 2500, 2)]);
        this.bell(p, 2349, now + 0.12, 0.14, 1.6); this.bell(p, 2960, now + 0.2, 0.1, 1.4);
        for (let i = 0; i < 14; i++) this.bell(p, rng.range(3800, 6200), now + 0.25 + rng.range(0, 0.6), 0.025, 0.25); // coins
        break;
      }
      case 'boing': {
        const o = this.ctx.createOscillator(), g = this.gain(0);
        o.type = 'sine';
        const curve = new Float32Array(64);
        for (let i = 0; i < 64; i++) { const k = i / 63; curve[i] = 220 + 260 * k + 160 * Math.sin(k * 40) * Math.exp(-k * 4); }
        o.frequency.setValueCurveAtTime(curve, now, 0.7);
        g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(0.3, now + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
        o.connect(g).connect(p); o.start(now); o.stop(now + 0.8);
        break;
      }
      case 'squeak': for (let i = 0; i < 3; i++) this.tone(p, 'sine', rng.range(1900, 2400), rng.range(2600, 3200), now + i * 0.11 + rng.range(0, 0.03), 0.01, 0.09, 0.12, 0.06); break;
      case 'whoopee': {
        const o = this.ctx.createOscillator(), g = this.gain(0);
        o.type = 'sawtooth';
        const curve = new Float32Array(80);
        for (let i = 0; i < 80; i++) { const k = i / 79; curve[i] = (150 - 70 * k) * (1 + 0.25 * Math.sin(i * 2.7) * rng.range(0.5, 1)); }
        o.frequency.setValueCurveAtTime(curve, now, 1.1);
        const lp = this.filter('lowpass', 1100, 1.5), bp = this.filter('bandpass', 420, 1.2);
        g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(0.35, now + 0.05); g.gain.setValueAtTime(0.3, now + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, now + 1.15);
        o.connect(lp).connect(bp).connect(g).connect(p); o.start(now); o.stop(now + 1.2);
        break;
      }
      case 'pop': {
        this.noiseBurst(p, this.pink, now, 0.001, 0.08, 0.6, [this.filter('highpass', 400)]);
        this.tone(p, 'sine', 700, 140, now, 0.001, 0.08, 0.3, 0.07);
        for (let i = 0; i < 5; i++) this.noiseBurst(p, this.white, now + 0.1 + rng.range(0, 0.3), 0.001, 0.02, 0.12, [this.filter('highpass', 3000)]);
        break;
      }
      case 'laugh': {
        for (let i = 0; i < 5; i++) {
          const at = now + i * 0.16, f0 = 230 - i * 12;
          const o = this.ctx.createOscillator(), g = this.gain(0);
          o.type = 'sawtooth'; o.frequency.setValueAtTime(f0 * 1.15, at); o.frequency.exponentialRampToValueAtTime(f0, at + 0.12);
          const f1 = this.filter('bandpass', 750, 4), f2 = this.filter('bandpass', 1250, 5);
          g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.25, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.13);
          o.connect(f1).connect(g); o.connect(f2).connect(g); g.connect(p);
          o.start(at); o.stop(at + 0.15);
          this.noiseBurst(p, this.white, at, 0.005, 0.05, 0.05, [this.filter('bandpass', 2500, 2)]); // the "h"
        }
        break;
      }
      case 'honk': {
        const o = this.ctx.createOscillator(), g = this.gain(0);
        o.type = 'sawtooth';
        const curve = new Float32Array(40);
        for (let i = 0; i < 40; i++) { const k = i / 39; curve[i] = 950 - 350 * k + 60 * Math.sin(k * 60); }
        o.frequency.setValueCurveAtTime(curve, now, 0.55);
        const bp = this.filter('bandpass', 1500, 6);
        g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(0.4, now + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
        o.connect(bp).connect(g).connect(p); o.start(now); o.stop(now + 0.65);
        break;
      }
      case 'jingle': for (let i = 0; i < 6; i++) this.bell(p, rng.range(2500, 3500), now + rng.range(0, 0.45), 0.05, 0.6); break;
      case 'thunderlet': {
        this.noiseBurst(p, this.pink, now, 0.003, 0.15, 0.35, [this.filter('lowpass', 2500)]);
        this.noiseBurst(p, this.brown, now + 0.05, 0.08, 1.2, 0.6, [this.filter('lowpass', 380)]);
        break;
      }
      case 'chime': [0, 4, 7, 12, 16].forEach((s, i) => this.bell(p, 1046.5 * Math.pow(2, s / 12), now + i * 0.07, 0.07, 1.6)); this.shimmer(p, now, 0.6, 0.15); break;
      case 'fanfare': [0, 4, 7, 12, 7, 12, 16, 19, 24].forEach((s, i) => this.bell(p, 784 * Math.pow(2, s / 12), now + i * 0.1, 0.08, 1.8)); this.shimmer(p, now, 1.4, 0.2); break;
      case 'whistle': {
        for (const f of [880, 1108]) this.tone(p, 'sine', f, f * 1.01, now, 0.04, 0.7, 0.08, 0.7);
        this.noiseBurst(p, this.white, now, 0.04, 0.65, 0.05, [this.filter('bandpass', 2000, 2)]);
        break;
      }
      case 'crank': for (let i = 0; i < 12; i++) this.noiseBurst(p, this.white, now + i * 0.08, 0.001, 0.025, 0.12, [this.filter('bandpass', 3200, 6)]); break;
      case 'swish': {
        const bp = this.filter('bandpass', 6000, 1.2);
        bp.frequency.setValueAtTime(6000, now); bp.frequency.exponentialRampToValueAtTime(600, now + 0.7);
        this.noiseBurst(p, this.white, now, 0.08, 0.75, 0.3, [bp]);
        break;
      }
      case 'puff': this.noiseBurst(p, this.pink, now, 0.02, 0.3, 0.2, [this.filter('lowpass', 900)]); break;
      case 'creak': this.creak(pos, 1.2); break;
    }
  }

  /** Thunder after a lightning flash: a crack and a long, wandering rumble. */
  thunder(): void {
    if (!this.started) return;
    const ctx = this.ctx, rng = this.rng;
    const at = ctx.currentTime + rng.range(0.5, 2.2);
    const dur = rng.range(4, 6.5);
    const pan = ctx.createStereoPanner(); pan.pan.value = rng.range(-0.5, 0.5); pan.connect(this.sfx);
    this.noiseBurst(pan, this.pink, at, 0.01, 0.6, 0.35, [this.filter('lowpass', 2200)]);
    const s = ctx.createBufferSource(); s.buffer = this.brown;
    const lp = this.filter('lowpass', 420);
    lp.frequency.setValueAtTime(420, at);
    lp.frequency.exponentialRampToValueAtTime(110, at + dur);
    const g = this.gain(0);
    const env = new Float32Array(64);
    let a = 1;
    for (let i = 0; i < 64; i++) { a = THREE.MathUtils.clamp(a * rng.range(0.82, 1.16), 0.2, 1.3); env[i] = 1.3 * a * Math.min(1, i / 3) * Math.pow(1 - i / 63, 1.3); }
    g.gain.setValueCurveAtTime(env, at, dur);
    s.connect(lp).connect(g).connect(pan);
    s.start(at, rng.range(0, 0.5)); s.stop(at + dur + 0.1);
  }
}

/** Music-box tunes (original): [semitones above root | null for a rest, length in beats]. */
const TUNES: { root: number; bpm: number; notes: [number | null, number][]; bass: number[] }[] = [
  { // a jaunty waltz
    root: 783.99, bpm: 168,
    notes: [[0, 1], [4, 1], [7, 1], [12, 2], [11, 1], [9, 1], [7, 1], [4, 1], [5, 2], [7, 1], [9, 2], [7, 1], [5, 1], [4, 1], [2, 1], [0, 3],
      [7, 1], [9, 1], [11, 1], [12, 2], [14, 1], [16, 2], [12, 1], [9, 1], [11, 1], [7, 1], [5, 2], [4, 1], [2, 1], [4, 1], [0, 3]],
    bass: [0, 0, 5, 7, 0, 0, 5, 0, 7, 7, 0, 0],
  },
  { // a sneaky tiptoe
    root: 659.25, bpm: 150,
    notes: [[0, 0.5], [null, 0.5], [3, 0.5], [null, 0.5], [7, 0.5], [6, 0.5], [7, 1], [null, 0.5], [10, 0.5], [8, 0.5], [7, 0.5], [3, 1.5], [null, 0.5],
      [2, 0.5], [3, 0.5], [5, 0.5], [7, 0.5], [8, 1], [7, 0.5], [5, 0.5], [3, 0.5], [2, 0.5], [0, 2]],
    bass: [0, 0, 3, 7, 5, 0, 7, 0],
  },
];
