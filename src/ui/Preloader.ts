import { gsap } from 'gsap';
import { D } from '../core/ease';
import { Odometer } from './Odometer';

/**
 * Weighted tasks feed real progress. The display is paced by a minimum
 * duration so an instant load still reads as a deliberate count, but it can
 * never run ahead of what has actually loaded.
 */
export class Preloader {
  readonly el: HTMLElement;
  private odo = new Odometer(3, 'odometer--xl');
  private tasks = new Map<string, { weight: number; p: number }>();
  private shown = 0;
  private elapsed = 0;
  private resolveDone: (() => void) | null = null;
  readonly done: Promise<void>;

  constructor(
    root: HTMLElement,
    private minDuration = 1.6,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'preloader';
    this.el.setAttribute('role', 'progressbar');
    this.el.setAttribute('aria-label', 'Loading');
    this.el.setAttribute('aria-valuemin', '0');
    this.el.setAttribute('aria-valuemax', '100');
    const mark = document.createElement('p');
    mark.className = 'preloader__mark';
    mark.textContent = 'dncnl.dev';
    const label = document.createElement('p');
    label.className = 'preloader__label mono';
    label.textContent = 'handoff / loading';
    this.el.append(mark, this.odo.el, label);
    root.append(this.el);
    this.done = new Promise((r) => (this.resolveDone = r));
  }

  task(name: string, weight = 1): (p: number) => void {
    this.tasks.set(name, { weight, p: 0 });
    return (p: number) => {
      const t = this.tasks.get(name);
      if (t) t.p = Math.max(t.p, Math.min(1, p));
    };
  }

  private get real(): number {
    let sum = 0;
    let total = 0;
    this.tasks.forEach((t) => {
      sum += t.p * t.weight;
      total += t.weight;
    });
    return total ? sum / total : 1;
  }

  update(dt: number): void {
    if (!this.resolveDone) return;
    this.elapsed += dt;
    const target = Math.min(this.real, this.elapsed / this.minDuration);
    this.shown += (target - this.shown) * (1 - Math.exp(-dt * 7));
    if (target >= 1 && this.shown > 0.995) this.shown = 1;
    const pct = Math.round(this.shown * 100);
    // Fractional value so the units wheel rolls rather than ticks.
    this.odo.set(this.shown * 100);
    this.el.setAttribute('aria-valuenow', String(pct));
    if (this.shown >= 1) {
      this.resolveDone();
      this.resolveDone = null;
    }
  }

  exit(): Promise<void> {
    return new Promise((resolve) => {
      gsap
        .timeline({ onComplete: () => (this.el.remove(), resolve()) })
        .to(this.odo.el, { yPercent: -40, opacity: 0, duration: D.m })
        .to(
          this.el.querySelectorAll('.preloader__label, .preloader__mark'),
          { opacity: 0, duration: D.s },
          0,
        )
        .to(this.el, { opacity: 0, duration: D.m }, D.xs);
    });
  }
}
