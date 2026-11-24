/**
 * Procedural Web Audio soundscapes — synthesized only, zero audio files/URLs.
 * The AudioContext must be created/resumed from a user gesture.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;

  /** Call from a click/keydown handler. */
  async start(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  /** Seeded white-noise buffer — the raw material for wind, crowd, rain. */
  createNoiseBuffer(seconds = 2, seed = 1): AudioBuffer {
    if (!this.ctx) throw new Error('AudioEngine not started');
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let s = seed >>> 0 || 1;
    for (let i = 0; i < len; i++) {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; // xorshift32
      d[i] = ((s >>> 0) / 4294967296) * 2 - 1;
    }
    return buf;
  }
}
