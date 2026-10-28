import { gsap } from 'gsap';
import { D } from '../core/ease';
import type { WorkKind } from '../content/content';

/**
 * HTML pinned onto the floating 3D screen. Text stays real DOM (selectable,
 * accessible, crisp); only its position is driven by the 3D projection.
 */
export class ScreenCaption {
  private el: HTMLElement;
  private title: HTMLElement;
  private body: HTMLElement;
  private dots: HTMLElement[] = [];
  private visible = false;

  constructor(
    root: HTMLElement,
    private kinds: WorkKind[],
  ) {
    this.el = document.createElement('div');
    this.el.className = 'caption';
    this.el.setAttribute('aria-live', 'polite');
    this.el.innerHTML = `
      <div class="caption__inner">
        <p class="caption__count mono"><span class="caption__dots"></span></p>
        <h3 class="caption__title"></h3>
        <p class="caption__body"></p>
      </div>`;
    root.append(this.el);
    this.title = this.el.querySelector('.caption__title') as HTMLElement;
    this.body = this.el.querySelector('.caption__body') as HTMLElement;
    const dots = this.el.querySelector('.caption__dots') as HTMLElement;
    kinds.forEach(() => {
      const d = document.createElement('i');
      dots.append(d);
      this.dots.push(d);
    });
  }

  show(on: boolean): void {
    if (on === this.visible) return;
    this.visible = on;
    gsap.to(this.el, { opacity: on ? 1 : 0, duration: on ? D.m : D.s, delay: on ? D.s : 0 });
  }

  set(i: number, instant = false): void {
    const k = this.kinds[i];
    if (!k) return;
    const lines = [this.title, this.body];
    const apply = () => {
      this.title.textContent = k.title;
      this.body.textContent = k.body;
      this.dots.forEach((d, j) => d.classList.toggle('is-on', j === i));
    };
    if (instant) return apply();
    gsap
      .timeline()
      .to(lines, { opacity: 0, y: -6, duration: D.xs, stagger: 0.04 })
      .call(apply)
      .fromTo(lines, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: D.s, stagger: 0.06 });
  }

  /** Pins the caption to the projected rect of the screen (CSS px). */
  place(r: { x: number; y: number; w: number; h: number }): void {
    if (!this.visible && this.el.style.opacity === '0') return;
    this.el.style.transform = `translate3d(${r.x}px, ${r.y}px, 0)`;
    // Size changes reflow the text, so only write them when they really change.
    if (Math.abs(r.w - this.w) > 0.5 || Math.abs(r.h - this.h) > 0.5) {
      this.w = r.w;
      this.h = r.h;
      this.el.style.width = `${r.w}px`;
      this.el.style.height = `${r.h}px`;
    }
  }

  private w = 0;
  private h = 0;
}
