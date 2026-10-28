export type CursorState = 'default' | 'open' | 'grab';

const OPEN_HAND = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11m0-6.5V4a1.5 1.5 0 0 1 3 0v7m0-5.5a1.5 1.5 0 0 1 3 0V12m0-4.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.2a6 6 0 0 1-4.9-2.5L4.4 14a1.5 1.5 0 0 1 2.4-1.8L8 13.6"/></svg>`;
const GRAB_HAND = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 11V9.5a1.5 1.5 0 0 1 3 0V11m0-1.5V9a1.5 1.5 0 0 1 3 0v2m0-1.5a1.5 1.5 0 0 1 3 0V11m0-.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.2a6 6 0 0 1-4.9-2.5L4.4 15a1.5 1.5 0 0 1 2.4-1.8L8 14.6V11"/></svg>`;

/**
 * Custom cursor for fine pointers only. Position is smoothed in rAF so it
 * glides, but the lag is short enough that it never feels detached.
 */
export class Cursor {
  readonly enabled = matchMedia('(pointer: fine)').matches;
  private el: HTMLElement;
  private x = -100;
  private y = -100;
  private tx = -100;
  private ty = -100;
  private hover = false;
  private forced: CursorState | null = null;
  private palmHover = false;
  private state: CursorState = 'default';

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'cursor';
    this.el.innerHTML = `<span class="cursor__dot"></span><span class="cursor__icon cursor__icon--open">${OPEN_HAND}</span><span class="cursor__icon cursor__icon--grab">${GRAB_HAND}</span>`;
    if (!this.enabled) return;
    root.append(this.el);
    document.documentElement.classList.add('has-cursor');

    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.tx = e.clientX;
      this.ty = e.clientY;
      if (this.x < 0) {
        this.x = this.tx;
        this.y = this.ty;
      }
      this.el.classList.add('is-visible');
    });
    document.addEventListener('pointerleave', () => this.el.classList.remove('is-visible'));
    document.addEventListener('pointerover', (e) => {
      this.hover = !!(e.target as HTMLElement | null)?.closest('a, button, [data-cursor="open"]');
      this.sync();
    });
  }

  /** Overrides hover-derived state (e.g. 'grab' while a hold is active). */
  force(state: CursorState | null): void {
    this.forced = state;
    this.sync();
  }

  setPalmHover(v: boolean): void {
    if (v === this.palmHover) return;
    this.palmHover = v;
    this.sync();
  }

  update(dt: number): void {
    if (!this.enabled) return;
    const k = 1 - Math.exp(-dt * 28);
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    this.el.style.transform = `translate3d(${this.x}px, ${this.y}px, 0)`;
  }

  private sync(): void {
    const next = this.forced ?? (this.hover || this.palmHover ? 'open' : 'default');
    if (next === this.state) return;
    this.el.classList.remove(`is-${this.state}`);
    this.state = next;
    this.el.classList.add(`is-${next}`);
  }
}
