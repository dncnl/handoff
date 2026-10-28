import type { Music } from './Music';

/**
 * The handshake charge, played on the music's AudioContext so it shares its key
 * (A minor), delay and reverb. Holding builds a filtered A–E swell with climbing
 * pentatonic plucks; letting go early powers it down; completing lands a soft
 * thump, a falling breath of noise and an Am(add9) chord that rings into the room.
 * Silent unless the music is playing, i.e. the visitor turned sound on.
 */

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
/** A-minor pentatonic, one note per stretch of the hold. */
const TICKS: [number, number][] = [
  [0.2, 69],
  [0.4, 72],
  [0.6, 76],
  [0.8, 79],
  [0.95, 81],
];
const STAB = [57, 60, 64, 71];
const SWELL_LEVEL = 0.035;

interface Swell {
  oscs: OscillatorNode[];
  filter: BiquadFilterNode;
  gain: GainNode;
}

export class Charge {
  private swell: Swell | null = null;
  private ticks = 0;
  private noise: AudioBuffer | null = null;

  constructor(private music: Music) {}

  private get ctx(): AudioContext | null {
    return this.music.playing ? this.music.context : null;
  }

  begin(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.fadeSwell(0.03);
    const now = ctx.currentTime;
    const filter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 250, Q: 3 });
    const gain = new GainNode(ctx, { gain: 0 });
    // Root and fifth under the music's Am, each a detuned pair.
    const oscs = [45, 52].flatMap((n) =>
      [-6, 6].map(
        (detune) => new OscillatorNode(ctx, { type: 'sawtooth', frequency: hz(n), detune }),
      ),
    );
    oscs.forEach((o) => {
      o.connect(filter);
      o.start(now);
    });
    filter.connect(gain);
    gain.connect(this.music.fxDry);
    gain.connect(this.music.fxWet);
    this.swell = { oscs, filter, gain };
    this.ticks = 0;
  }

  /** Called every frame while held, with linear hold progress 0–1. */
  set(p: number): void {
    const ctx = this.ctx;
    const s = this.swell;
    if (!ctx || !s) return;
    const now = ctx.currentTime;
    s.filter.frequency.setTargetAtTime(250 * (2800 / 250) ** p, now, 0.04);
    s.gain.gain.setTargetAtTime(SWELL_LEVEL * Math.min(1, p * 1.6), now, 0.06);
    s.oscs.forEach((o, i) => o.detune.setTargetAtTime((i % 2 ? 6 : -6) + 40 * p, now, 0.05));
    this.music.setDuck(1 - 0.4 * p);
    while (this.ticks < TICKS.length && p >= (TICKS[this.ticks] as [number, number])[0]) {
      this.pluck(hz((TICKS[this.ticks] as [number, number])[1]), now);
      this.ticks++;
    }
  }

  /** Let go early: the swell powers down rather than just stopping. */
  release(): void {
    const ctx = this.ctx;
    const s = this.swell;
    if (!ctx || !s) return;
    const now = ctx.currentTime;
    s.filter.frequency.cancelScheduledValues(now);
    s.filter.frequency.setTargetAtTime(160, now, 0.1);
    s.oscs.forEach((o) => o.detune.setTargetAtTime(-150, now, 0.15));
    this.fadeSwell(0.08);
    this.music.setDuck(1, 0.3);
  }

  /** The grip lands: firm, short, and it hands straight back to the music. */
  complete(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    this.fadeSwell(0.015);
    this.thump(now);
    this.breath(now);
    this.stab(now + 0.02);
    this.music.setDuck(1, 0.9);
  }

  private fadeSwell(tc: number): void {
    const ctx = this.music.context;
    const s = this.swell;
    if (!ctx || !s) return;
    this.swell = null;
    const now = ctx.currentTime;
    s.gain.gain.cancelScheduledValues(now);
    s.gain.gain.setTargetAtTime(0, now, tc);
    s.oscs.forEach((o) => o.stop(now + tc * 8 + 0.05));
    s.oscs[0]?.addEventListener('ended', () => s.gain.disconnect());
  }

  private pluck(freq: number, at: number): void {
    const ctx = this.ctx as AudioContext;
    const osc = new OscillatorNode(ctx, { type: 'triangle', frequency: freq });
    const env = new GainNode(ctx, { gain: 0 });
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.045, at + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
    osc.connect(env);
    env.connect(this.music.fxDry);
    env.connect(this.music.fxEcho);
    osc.start(at);
    osc.stop(at + 0.75);
  }

  /** Low sine that drops in pitch: felt more than heard. */
  private thump(at: number): void {
    const ctx = this.ctx as AudioContext;
    const osc = new OscillatorNode(ctx, { type: 'sine', frequency: 70 });
    osc.frequency.setValueAtTime(70, at);
    osc.frequency.exponentialRampToValueAtTime(38, at + 0.35);
    const env = new GainNode(ctx, { gain: 0 });
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.16, at + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.55);
    osc.connect(env).connect(this.music.fxDry);
    osc.start(at);
    osc.stop(at + 0.6);
  }

  /** A short breath of noise, swept down through a band-pass. */
  private breath(at: number): void {
    const ctx = this.ctx as AudioContext;
    this.noise ??= noiseBuffer(ctx, 0.8);
    const src = new AudioBufferSourceNode(ctx, { buffer: this.noise });
    const band = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 3200, Q: 0.9 });
    band.frequency.setValueAtTime(3200, at);
    band.frequency.exponentialRampToValueAtTime(380, at + 0.6);
    const env = new GainNode(ctx, { gain: 0 });
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.05, at + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
    src.connect(band).connect(env);
    env.connect(this.music.fxDry);
    env.connect(this.music.fxWet);
    src.start(at);
    src.stop(at + 0.75);
  }

  /** Am(add9), bright on the attack and closing down as it rings out. */
  private stab(at: number): void {
    const ctx = this.ctx as AudioContext;
    const filter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 2600, Q: 0.7 });
    filter.frequency.setValueAtTime(2600, at);
    filter.frequency.exponentialRampToValueAtTime(700, at + 1.6);
    const env = new GainNode(ctx, { gain: 0 });
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(1, at + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 1.8);
    filter.connect(env);
    env.connect(this.music.fxDry);
    env.connect(this.music.fxWet);
    for (const n of STAB) {
      for (const detune of [-7, 7]) {
        const osc = new OscillatorNode(ctx, { type: 'sawtooth', frequency: hz(n), detune });
        const g = new GainNode(ctx, { gain: 0.011 });
        osc.connect(g).connect(filter);
        osc.start(at);
        osc.stop(at + 1.85);
      }
    }
  }
}

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}
