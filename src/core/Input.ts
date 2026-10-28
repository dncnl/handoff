import { Vector2 } from 'three';

export interface PointerState {
  /** Normalised device coords, -1..1, y up — ready for raycasting. */
  ndc: Vector2;
  /** CSS pixels. */
  x: number;
  y: number;
  isTouch: boolean;
  down: boolean;
}

type DownHandler = (e: PointerEvent) => void;

/**
 * Time-based hold. Progress is linear in time; consumers shape it.
 * Kept separate from pointer handling so keyboard and pointer share one hold.
 */
export class Hold {
  progress = 0;
  active = false;
  enabled = false;
  private completed = false;
  private listeners = {
    start: new Set<() => void>(),
    release: new Set<(p: number) => void>(),
    complete: new Set<() => void>(),
  };

  constructor(readonly duration: number) {}

  begin(): void {
    if (!this.enabled || this.active || this.completed) return;
    this.active = true;
    this.progress = 0;
    this.listeners.start.forEach((cb) => cb());
  }

  end(): void {
    if (!this.active) return;
    this.active = false;
    if (!this.completed) this.listeners.release.forEach((cb) => cb(this.progress));
  }

  update(dt: number): void {
    if (!this.active || this.completed) return;
    this.progress = Math.min(1, this.progress + dt / this.duration);
    if (this.progress >= 1) {
      this.completed = true;
      this.active = false;
      this.listeners.complete.forEach((cb) => cb());
    }
  }

  reset(): void {
    this.active = false;
    this.completed = false;
    this.progress = 0;
  }

  on(type: 'start' | 'complete', cb: () => void): void;
  on(type: 'release', cb: (p: number) => void): void;
  on(type: keyof Hold['listeners'], cb: (p: number) => void): void {
    (this.listeners[type] as Set<(p: number) => void>).add(cb);
  }
}

export class Input {
  readonly pointer: PointerState = {
    ndc: new Vector2(0, 0),
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    isTouch: false,
    down: false,
  };
  readonly hold = new Hold(1.2);
  private downHandlers = new Set<DownHandler>();
  private keyHolding = false;

  constructor() {
    window.addEventListener('pointermove', this.onMove, { passive: true });
    window.addEventListener('pointerdown', this.handleDown);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    window.addEventListener('blur', () => this.hold.end());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  onDown(cb: DownHandler): void {
    this.downHandlers.add(cb);
  }

  update(dt: number): void {
    this.hold.update(dt);
  }

  private setFrom(e: PointerEvent): void {
    this.pointer.x = e.clientX;
    this.pointer.y = e.clientY;
    this.pointer.ndc.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
    this.pointer.isTouch = e.pointerType === 'touch';
  }

  private onMove = (e: PointerEvent): void => {
    this.setFrom(e);
  };

  private handleDown = (e: PointerEvent): void => {
    this.setFrom(e);
    this.pointer.down = true;
    this.downHandlers.forEach((cb) => cb(e));
  };

  private onUp = (e: PointerEvent): void => {
    this.setFrom(e);
    this.pointer.down = false;
    if (!this.keyHolding) this.hold.end();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat || !this.hold.enabled) return;
    if (e.code !== 'Space' && e.code !== 'Enter') return;
    // Let Enter/Space activate links and the skip control normally.
    const t = e.target as HTMLElement | null;
    if (t?.closest('a, [data-hold-ignore]')) return;
    e.preventDefault();
    this.keyHolding = true;
    this.hold.begin();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (!this.keyHolding || (e.code !== 'Space' && e.code !== 'Enter')) return;
    this.keyHolding = false;
    this.hold.end();
  };
}
