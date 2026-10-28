import { D } from '../core/ease';
import type { Content } from '../content/content';
import { Odometer } from './Odometer';

/** Persistent chrome: section index, progress segments, contributions, theme, sound. */
export class Hud {
  private el: HTMLElement;
  private odo = new Odometer(3, 'odometer--hud');
  private segs: HTMLButtonElement[] = [];
  private indexEl: HTMLElement;
  private soundBtn: HTMLButtonElement;
  private counter = { v: 0 };
  private selectCb: ((i: number) => void) | null = null;
  private soundCb: ((on: boolean) => void) | null = null;
  private soundOn = false;
  private themeLabel: HTMLElement;
  private themeCb: (() => void) | null = null;

  constructor(
    root: HTMLElement,
    private content: Content,
  ) {
    const total = String(content.sections.length).padStart(2, '0');
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.innerHTML = `
      <nav class="hud__nav" aria-label="Sections">
        <span class="hud__index mono"><span class="hud__current">01</span> / ${total}</span>
        <ol class="hud__segments"></ol>
      </nav>
      <a class="hud__counter mono" href="${content.github.url}" target="_blank" rel="noopener">
        <span class="hud__counter-num"></span>
        <span class="hud__counter-label">contributions<br />last 12 months</span>
      </a>
      <div class="hud__controls">
        <button class="hud__theme mono" type="button" aria-label="Switch colour theme">
          <span class="hud__theme-dot" aria-hidden="true"></span>
          <span class="hud__theme-label"></span>
        </button>
        <button class="hud__sound mono" type="button" aria-pressed="false">
          <span class="hud__sound-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <span class="hud__sound-label">Sound off</span>
        </button>
      </div>`;
    root.append(this.el);

    this.indexEl = this.el.querySelector('.hud__current') as HTMLElement;
    const list = this.el.querySelector('.hud__segments') as HTMLElement;
    content.sections.forEach((s, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hud__seg';
      b.setAttribute('aria-label', `${s.index} ${s.title}`);
      b.innerHTML = `<span class="hud__seg-fill"></span>`;
      b.addEventListener('click', () => this.selectCb?.(i));
      li.append(b);
      list.append(li);
      this.segs.push(b);
    });
    const num = this.el.querySelector('.hud__counter-num') as HTMLElement;
    num.append(this.odo.el);
    num.setAttribute('aria-label', String(content.github.contributions));

    this.soundBtn = this.el.querySelector('.hud__sound') as HTMLButtonElement;
    this.soundBtn.addEventListener('click', () => {
      this.soundOn = !this.soundOn;
      this.soundBtn.setAttribute('aria-pressed', String(this.soundOn));
      (this.soundBtn.querySelector('.hud__sound-label') as HTMLElement).textContent = this.soundOn
        ? 'Sound on'
        : 'Sound off';
      this.soundCb?.(this.soundOn);
    });

    this.themeLabel = this.el.querySelector('.hud__theme-label') as HTMLElement;
    this.el.querySelector('.hud__theme')?.addEventListener('click', () => this.themeCb?.());
  }

  onTheme(cb: () => void): void {
    this.themeCb = cb;
  }

  /** Label names the theme you'd switch to, like the Portfolio toggle. */
  setTheme(t: 'light' | 'dark'): void {
    this.themeLabel.textContent = t === 'dark' ? 'Light' : 'Dark';
  }

  onSelect(cb: (i: number) => void): void {
    this.selectCb = cb;
  }

  onSound(cb: (on: boolean) => void): void {
    this.soundCb = cb;
  }

  /** Each block slides in from its nearest edge; the counter rolls up after it lands. */
  enterTween(tl: gsap.core.Timeline, at: number, reduced = false): void {
    const dy = reduced ? 0 : 24;
    tl.fromTo(
      this.el.querySelector('.hud__nav'),
      { opacity: 0, y: dy },
      { opacity: 1, y: 0, duration: D.m },
      at,
    )
      .fromTo(
        this.el.querySelectorAll('.hud__counter, .hud__controls'),
        { opacity: 0, y: (i: number) => (i === 0 ? dy : -dy) },
        { opacity: 1, y: 0, duration: D.m, stagger: 0.1 },
        at + 0.1,
      )
      .fromTo(
        this.counter,
        { v: 0 },
        {
          v: this.content.github.contributions,
          duration: D.l,
          onUpdate: () => this.odo.set(this.counter.v),
        },
        at + 0.4,
      )
      .call(() => this.el.classList.add('is-ready'), [], at);
  }

  setSection(i: number): void {
    this.indexEl.textContent = String(i + 1).padStart(2, '0');
    this.segs.forEach((b, j) => {
      b.classList.toggle('is-done', j < i);
      b.classList.toggle('is-current', j === i);
      if (j === i) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
    });
  }
}
