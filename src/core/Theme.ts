export type ThemeName = 'light' | 'dark';

const KEY = 'dncnl-theme';
const META_COLOR: Record<ThemeName, string> = { light: '#f6f3e8', dark: '#0e0d0b' };

/**
 * Light/dark, shared with the Portfolio through the same storage key. index.html
 * applies the stored value before first paint; this keeps it in sync afterwards.
 */
export class Theme {
  private cbs: ((t: ThemeName) => void)[] = [];
  current: ThemeName;

  constructor() {
    this.current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    this.apply();
  }

  toggle(): void {
    this.set(this.current === 'dark' ? 'light' : 'dark');
  }

  set(t: ThemeName): void {
    if (t === this.current) return;
    this.current = t;
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* storage blocked; the choice just won't persist */
    }
    this.apply();
    this.cbs.forEach((cb) => cb(t));
  }

  onChange(cb: (t: ThemeName) => void): void {
    this.cbs.push(cb);
  }

  private apply(): void {
    document.documentElement.dataset.theme = this.current;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', META_COLOR[this.current]);
  }
}
