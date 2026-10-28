import { gsap } from 'gsap';
import { ease } from './ease';

gsap.defaults({ ease, duration: 0.8 });

export type SegmentName = 'enter' | 'grip' | 'build' | 'reveal';

interface Segment {
  start: number;
  end: number;
}

/**
 * One master timeline, authored as named segments laid end to end.
 * Interactive moments (the gate) live *between* segments, so the playhead
 * only ever advances one segment at a time and skipping is just a seek.
 */
export class Timeline {
  readonly master = gsap.timeline({ paused: true });
  private segments = new Map<SegmentName, Segment>();
  private playhead: gsap.core.Tween | null = null;

  segment(name: SegmentName, build: (tl: gsap.core.Timeline) => void): void {
    const tl = gsap.timeline();
    build(tl);
    const start = this.master.duration();
    this.master.addLabel(name, start);
    this.master.add(tl, start);
    this.segments.set(name, { start, end: start + tl.duration() });
  }

  play(name: SegmentName): Promise<void> {
    const seg = this.get(name);
    this.playhead?.kill();
    if (this.master.time() !== seg.start) this.master.seek(seg.start, false);
    return new Promise((resolve) => {
      this.playhead = this.master.tweenFromTo(seg.start, seg.end, {
        ease: 'none',
        onComplete: () => resolve(),
      });
    });
  }

  /**
   * Jumps to the start of a segment. Callbacks in skipped segments still fire
   * so side effects (poses, UI state) end up where they would have been.
   */
  skipTo(name: SegmentName): void {
    this.playhead?.kill();
    this.playhead = null;
    this.master.seek(this.get(name).start, false);
  }

  isPast(name: SegmentName): boolean {
    return this.master.time() >= this.get(name).end;
  }

  private get(name: SegmentName): Segment {
    const seg = this.segments.get(name);
    if (!seg) throw new Error(`Unknown segment: ${name}`);
    return seg;
  }
}
