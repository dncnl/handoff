/**
 * Generative ambient synthwave, synthesised live with Web Audio (no files).
 *
 * Am – F – C – G at 72 BPM, two bars a chord, forever: detuned saw pads that
 * crossfade between chords, a soft sine sub, and a sparse triangle arpeggio
 * thrown into a dotted-eighth delay. Everything runs through a slowly breathing
 * low-pass and a generated reverb. No drums: it should sit under the page, not on it.
 */

const BPM = 72;
const BEAT = 60 / BPM;
const CHORD_LEN = BEAT * 8;
const LOOKAHEAD = 1.5;

interface Chord {
  bass: number;
  pad: number[];
  arp: number[];
}

// MIDI notes, voiced so each pad moves by step into the next.
const PROGRESSION: Chord[] = [
  { bass: 45, pad: [57, 60, 64, 71], arp: [69, 72, 76, 79, 81] }, // Am(add9)
  { bass: 41, pad: [53, 57, 60, 64], arp: [65, 69, 72, 76, 77] }, // Fmaj7
  { bass: 48, pad: [55, 60, 64, 67], arp: [67, 72, 76, 79, 84] }, // C
  { bass: 43, pad: [55, 59, 62, 67], arp: [67, 71, 74, 79, 83] }, // G
];

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export class Music {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private duckGain!: GainNode;
  private bus!: BiquadFilterNode;
  private delayIn!: GainNode;
  private analyser!: AnalyserNode;
  private bins = new Uint8Array(0);
  private timer: number | null = null;
  private stopTimer: number | null = null;
  private nextChordAt = 0;
  private chord = 0;
  playing = false;

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx || !this.playing) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  /** Call from a user gesture: browsers only allow audio to start from one. */
  start(): void {
    const ctx = (this.ctx ??= this.build());
    if (this.stopTimer !== null) clearTimeout(this.stopTimer);
    this.stopTimer = null;
    void ctx.resume();
    const now = ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(1, now + 4);
    if (this.playing) return;
    this.playing = true;
    this.nextChordAt = Math.max(this.nextChordAt, now + 0.1);
    this.schedule();
    this.timer = window.setInterval(() => this.schedule(), 250);
  }

  stop(): void {
    if (!this.ctx || !this.playing) return;
    this.playing = false;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0, now + 1.5);
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    const ctx = this.ctx;
    this.stopTimer = window.setTimeout(() => void ctx.suspend(), 1700);
  }

  /** Dips the music briefly so a one-shot sound can sit on top. */
  duck(depth = 0.45, hold = 0.5): void {
    if (!this.ctx || !this.playing) return;
    const g = this.duckGain.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(1 - depth, now, 0.04);
    g.setTargetAtTime(1, now + hold, 0.5);
  }

  /** Four loudness bands, 0–1, for the HUD equaliser. */
  levels(out: number[]): number[] {
    if (!this.ctx || !this.playing) return out.fill(0);
    this.analyser.getByteFrequencyData(this.bins);
    const bands: [number, number][] = [
      [1, 3],
      [3, 7],
      [7, 16],
      [16, 40],
    ];
    bands.forEach(([a, b], i) => {
      let sum = 0;
      for (let k = a; k < b; k++) sum += this.bins[k] ?? 0;
      // Byte data is in dB; stretch the useful range so the bars move instead of pinning.
      out[i] = Math.min(1, Math.max(0, (sum / (b - a) / 255 - 0.3) * 2.2));
    });
    return out;
  }

  private build(): AudioContext {
    const ctx = new AudioContext();
    this.master = new GainNode(ctx, { gain: 0 });
    this.duckGain = new GainNode(ctx, { gain: 1 });
    this.analyser = new AnalyserNode(ctx, { fftSize: 256, smoothingTimeConstant: 0.85 });
    this.bins = new Uint8Array(this.analyser.frequencyBinCount);

    // Breathing low-pass: a 20 s LFO sweeps the cutoff so the pads never sit still.
    this.bus = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 1200, Q: 0.6 });
    const lfo = new OscillatorNode(ctx, { frequency: 0.05 });
    const lfoDepth = new GainNode(ctx, { gain: 450 });
    lfo.connect(lfoDepth).connect(this.bus.frequency);
    lfo.start();

    const reverb = new ConvolverNode(ctx, { buffer: impulse(ctx, 4.2) });
    const wet = new GainNode(ctx, { gain: 0.55 });
    const dry = new GainNode(ctx, { gain: 0.7 });

    // Dotted-eighth echo, darkened on every repeat.
    this.delayIn = new GainNode(ctx, { gain: 1 });
    const delay = new DelayNode(ctx, { delayTime: BEAT * 0.75, maxDelayTime: 2 });
    const feedback = new GainNode(ctx, { gain: 0.38 });
    const tone = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 2200 });
    this.delayIn.connect(delay).connect(tone).connect(feedback).connect(delay);
    tone.connect(this.bus);

    this.bus.connect(dry).connect(this.duckGain);
    this.bus.connect(reverb).connect(wet).connect(this.duckGain);
    this.duckGain.connect(this.master).connect(this.analyser).connect(ctx.destination);
    return ctx;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    while (this.nextChordAt < ctx.currentTime + LOOKAHEAD) {
      const chord = PROGRESSION[this.chord % PROGRESSION.length] as Chord;
      this.playChord(chord, this.nextChordAt);
      this.chord++;
      this.nextChordAt += CHORD_LEN;
    }
  }

  private playChord(c: Chord, t: number): void {
    const end = t + CHORD_LEN;
    // Pads overlap the next chord by their release, so changes crossfade.
    for (const n of c.pad) this.pad(hz(n), t, end + 2.5, 0.011);
    this.voice('sine', hz(c.bass), t, end + 0.6, 0.05, 1.5, 1.2, this.bus);

    // Sparse arpeggio on eighths; about a third of the notes rest.
    for (let i = 0; i < 16; i++) {
      if (Math.random() < 0.38) continue;
      const step = i % 8;
      const idx = step < 5 ? step : 8 - step;
      const note = c.arp[idx] ?? c.arp[0] ?? 69;
      const at = t + i * (BEAT / 2) + (Math.random() - 0.5) * 0.012;
      const vel = 0.018 + Math.random() * 0.008;
      this.voice('triangle', hz(note), at, at + 0.9, vel, 0.008, 0.75, this.delayIn, this.bus);
    }
  }

  /** Three detuned saws per note, with a slow swell. */
  private pad(freq: number, start: number, end: number, level: number): void {
    for (const cents of [-7, 0, 7]) {
      this.voice('sawtooth', freq, start, end, level, 2.6, 2.6, this.bus, undefined, cents);
    }
  }

  private voice(
    type: OscillatorType,
    freq: number,
    start: number,
    end: number,
    level: number,
    attack: number,
    release: number,
    dest: AudioNode,
    dest2?: AudioNode,
    detune = 0,
  ): void {
    const ctx = this.ctx as AudioContext;
    const osc = new OscillatorNode(ctx, { type, frequency: freq, detune });
    const env = new GainNode(ctx, { gain: 0 });
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(level, start + attack);
    const releaseAt = Math.max(start + attack, end - release);
    env.gain.setValueAtTime(level, releaseAt);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(env).connect(dest);
    if (dest2) env.connect(dest2);
    osc.start(start);
    osc.stop(end + 0.05);
    osc.onended = () => env.disconnect();
  }
}

/** Stereo decaying-noise impulse: a soft, dark room with no asset to fetch. */
function impulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // One-pole low-pass on the noise makes the tail warm rather than hissy.
      lp += (Math.random() * 2 - 1 - lp) * 0.35;
      data[i] = lp * (1 - t) ** 3.2;
    }
  }
  return buf;
}
