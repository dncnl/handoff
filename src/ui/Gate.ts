import { Raycaster } from 'three';
import { D, ease } from '../core/ease';
import type { Input } from '../core/Input';
import type { Renderer } from '../core/Renderer';
import type { Hand } from '../scene/Hand';
import type { Cursor } from './Cursor';

const RING_R = 22;
const RING_C = 2 * Math.PI * RING_R;

/**
 * The handshake gate. Owns its DOM and the hold → grip mapping; the outcome
 * (shake, pulse, transition) is the timeline's job once `onComplete` fires.
 */
export class Gate {
  private el: HTMLElement;
  private hint: HTMLButtonElement;
  private skipLink: HTMLAnchorElement;
  private ring: HTMLElement;
  private ringArc: SVGCircleElement;
  private raycaster = new Raycaster();
  private active = false;
  /** Grip value the hand shows; springs back to 0 on early release. */
  private grip = 0;
  private vel = 0;
  private ringAlpha = 0;
  private completeCb: (() => void) | null = null;
  private skipCb: (() => void) | null = null;

  constructor(
    root: HTMLElement,
    private input: Input,
    private renderer: Renderer,
    private hand: Hand,
    private cursor: Cursor,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'gate';
    this.el.innerHTML = `
      <button class="gate__hint mono" type="button" data-cursor="open" aria-describedby="gate-help">
        <span class="gate__hint-label">Hold to shake hands</span>
        <span class="gate__hint-fill" aria-hidden="true"></span>
      </button>
      <p id="gate-help" class="sr-only">Press and hold the palm, this button, or the Space or Enter key for about one second.</p>
      <a class="gate__skip mono" href="#main" data-hold-ignore>Skip intro</a>`;
    this.ring = document.createElement('div');
    this.ring.className = 'gate__ring';
    this.ring.innerHTML = `<svg viewBox="0 0 56 56" aria-hidden="true"><circle class="gate__ring-track" cx="28" cy="28" r="${RING_R}"/><circle class="gate__ring-arc" cx="28" cy="28" r="${RING_R}" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"/></svg>`;
    root.append(this.el, this.ring);

    this.hint = this.el.querySelector('.gate__hint') as HTMLButtonElement;
    this.skipLink = this.el.querySelector('.gate__skip') as HTMLAnchorElement;
    this.ringArc = this.ring.querySelector('.gate__ring-arc') as SVGCircleElement;

    this.skipLink.addEventListener('click', (e) => {
      e.preventDefault();
      this.skipCb?.();
    });
    // Touch holds would otherwise trigger the long-press context menu.
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    input.onDown((e) => this.onDown(e));
    input.hold.on('start', () => this.cursor.force('grab'));
    input.hold.on('release', () => this.cursor.force(null));
    input.hold.on('complete', () => {
      this.cursor.force(null);
      this.grip = 1;
      this.vel = 0;
      this.completeCb?.();
    });
  }

  onComplete(cb: () => void): void {
    this.completeCb = cb;
  }

  onSkip(cb: () => void): void {
    this.skipCb = cb;
  }

  /** Builds the fade-in for the timeline's 'enter' segment. */
  enterTween(tl: gsap.core.Timeline, at: number): void {
    tl.fromTo(
      this.el.querySelectorAll('.gate__hint, .gate__skip'),
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: D.m, stagger: 0.12 },
      at,
    );
  }

  exitTween(tl: gsap.core.Timeline, at: number): void {
    tl.to(
      this.el.querySelectorAll('.gate__hint, .gate__skip'),
      { opacity: 0, y: -12, duration: D.s },
      at,
    );
  }

  setActive(v: boolean): void {
    this.active = v;
    this.input.hold.enabled = v;
    this.el.classList.toggle('is-active', v);
    if (v) this.hint.focus({ preventScroll: true });
    else {
      this.cursor.setPalmHover(false);
      this.cursor.force(null);
    }
  }

  remove(): void {
    this.setActive(false);
    this.el.remove();
    this.ring.remove();
  }

  update(dt: number): void {
    if (!this.active) return;
    const hold = this.input.hold;
    const p = this.input.pointer;

    if (!p.isTouch) this.cursor.setPalmHover(this.hitsPalm());

    if (hold.active) {
      // Direct mapping while held: the hand must answer the press instantly.
      const target = ease(hold.progress);
      this.vel = (target - this.grip) / Math.max(dt, 1e-3);
      this.grip = target;
    } else if (this.grip !== 0) {
      // Underdamped spring on release: a slight overshoot reads as relief.
      const k = 170;
      const c = 15;
      this.vel += (-k * this.grip - c * this.vel) * dt;
      this.grip += this.vel * dt;
      if (Math.abs(this.grip) < 1e-4 && Math.abs(this.vel) < 1e-3) this.grip = this.vel = 0;
    }

    this.hand.setGrip(Math.max(-0.12, this.grip));
    this.hand.setGlow(Math.max(0, this.grip) * 0.35);

    // Ring follows the pointer; with the keyboard there is no pointer, so it sits on the hint.
    const usingKeys = hold.active && !this.input.pointer.down;
    let x = p.x;
    let y = p.y;
    if (usingKeys) {
      const r = this.hint.getBoundingClientRect();
      x = r.left + r.width / 2;
      y = r.top - 40;
    }
    const want = hold.active ? 1 : 0;
    this.ringAlpha += (want - this.ringAlpha) * (1 - Math.exp(-dt * 12));
    const g = Math.max(0, Math.min(1, this.grip));
    this.ring.style.opacity = String(this.ringAlpha);
    this.ring.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${0.7 + this.ringAlpha * 0.3})`;
    this.ringArc.style.strokeDashoffset = String(RING_C * (1 - g));
    this.hint.style.setProperty('--fill', String(g));
  }

  private onDown(e: PointerEvent): void {
    if (!this.active || e.button > 0) return;
    const onHint = (e.target as HTMLElement | null)?.closest('.gate__hint');
    if (onHint || this.hitsPalm()) {
      e.preventDefault();
      this.input.hold.begin();
    }
  }

  private hitsPalm(): boolean {
    this.raycaster.setFromCamera(this.input.pointer.ndc, this.renderer.camera);
    return this.raycaster.intersectObjects(this.hand.hitTargets, false).length > 0;
  }
}
