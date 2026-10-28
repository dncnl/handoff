import type { Howl } from 'howler';

export type SoundName = 'tick' | 'grip' | 'build' | 'whoosh';

/**
 * Sounds are synthesised into WAV data URIs on first enable, so there are no
 * audio assets to fetch and howler itself is only loaded if sound is wanted.
 */
export class Sound {
  private enabled = false;
  private howls: Partial<Record<SoundName, Howl>> = {};
  private loading: Promise<void> | null = null;

  async setEnabled(on: boolean): Promise<void> {
    this.enabled = on;
    if (on) await this.load();
  }

  play(name: SoundName, volume = 1): void {
    if (!this.enabled) return;
    const h = this.howls[name];
    if (!h) return;
    h.volume(volume);
    h.play();
  }

  private load(): Promise<void> {
    this.loading ??= import('howler').then(({ Howl }) => {
      const make = (samples: Float32Array) => new Howl({ src: [toWav(samples)], format: ['wav'] });
      this.howls = {
        tick: make(synth(0.05, (t) => Math.sin(t * 2 * Math.PI * 1800) * Math.exp(-t * 90) * 0.25)),
        grip: make(
          synth(0.35, (t) => {
            const f = 90 - t * 60;
            return (Math.sin(t * 2 * Math.PI * f) * 0.7 + noise() * 0.08) * Math.exp(-t * 14);
          }),
        ),
        build: make(
          synth(1.2, (t) => {
            const env = Math.sin(Math.min(1, t / 1.2) * Math.PI) ** 2;
            const s = [440, 660, 990].reduce(
              (a, f, i) => a + Math.sin(t * 2 * Math.PI * f * (1 + t * 0.02 * i)),
              0,
            );
            return (s / 3) * env * 0.12;
          }),
        ),
        whoosh: make(synth(0.4, (t) => noise() * Math.sin((t / 0.4) * Math.PI) ** 2 * 0.12)),
      };
    });
    return this.loading;
  }
}

const RATE = 22050;
const noise = () => Math.random() * 2 - 1;

function synth(seconds: number, fn: (t: number) => number): Float32Array {
  const out = new Float32Array(Math.floor(seconds * RATE));
  for (let i = 0; i < out.length; i++) out[i] = fn(i / RATE);
  return out;
}

function toWav(samples: Float32Array): string {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] ?? 0);
  return `data:audio/wav;base64,${btoa(bin)}`;
}
