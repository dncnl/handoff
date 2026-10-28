import { gsap } from 'gsap';
import { D } from '../core/ease';
import type { Content } from '../content/content';
import { socialIcon } from './socialIcons';

/** Persistent chrome: section index and progress, contact links, theme and sound controls. */
export class Hud {
  private el: HTMLElement;
  private segs: HTMLButtonElement[] = [];
  private indexEl: HTMLElement;
  private soundBtn: HTMLButtonElement;
  private controlsShown = false;
  private selectCb: ((i: number) => void) | null = null;
  private soundCb: ((on: boolean) => void) | null = null;
  private themeLabel: HTMLElement;
  private bars: HTMLElement[];
  private themeCb: (() => void) | null = null;

  constructor(
    root: HTMLElement,
    content: Content,
    private soundOn = false,
  ) {
    const total = String(content.sections.length).padStart(2, '0');
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.innerHTML = `
      <nav class="hud__nav" aria-label="Sections">
        <span class="hud__index mono"><span class="hud__current">01</span> / ${total}</span>
        <ol class="hud__segments"></ol>
      </nav>
      <ul class="hud__social" aria-label="Contact">${content.contact.links
        .map(
          (l) =>
            `<li><a href="${l.href}" aria-label="${l.label}" title="${l.label}"${
              l.href.startsWith('http') ? ' target="_blank" rel="noopener"' : ''
            }>${socialIcon(l.label)}</a></li>`,
        )
        .join('')}</ul>
      <div class="hud__controls">
        <button class="hud__theme mono" type="button" aria-label="Switch colour theme" data-hold-ignore>
          <span class="hud__theme-dot" aria-hidden="true"></span>
          <span class="hud__theme-label"></span>
        </button>
        <button class="hud__sound mono" type="button" aria-pressed="${soundOn}" data-hold-ignore>
          <span class="hud__sound-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <span class="hud__sound-label">${soundOn ? 'Sound on' : 'Sound off'}</span>
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
    this.soundBtn = this.el.querySelector('.hud__sound') as HTMLButtonElement;
    this.soundBtn.addEventListener('click', () => {
      this.soundOn = !this.soundOn;
      this.soundBtn.setAttribute('aria-pressed', String(this.soundOn));
      (this.soundBtn.querySelector('.hud__sound-label') as HTMLElement).textContent = this.soundOn
        ? 'Sound on'
        : 'Sound off';
      this.soundCb?.(this.soundOn);
    });

    this.bars = [...this.el.querySelectorAll<HTMLElement>('.hud__sound-bars i')];
    this.themeLabel = this.el.querySelector('.hud__theme-label') as HTMLElement;
    this.el.querySelector('.hud__theme')?.addEventListener('click', () => this.themeCb?.());
  }

  /** Equaliser bars follow the music: 0–1 per bar. */
  setLevels(levels: number[]): void {
    this.bars.forEach((b, i) => (b.style.height = `${2 + (levels[i] ?? 0) * 8}px`));
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

  /**
   * Theme and sound come in with the gate, so sound can be on before the handshake.
   * Safe to call more than once.
   */
  showControls(reduced = false): void {
    if (this.controlsShown) return;
    this.controlsShown = true;
    gsap.fromTo(
      this.el.querySelector('.hud__controls'),
      { opacity: 0, y: reduced ? 0 : -16 },
      { opacity: 1, y: 0, duration: D.m },
    );
  }

  /** The section nav and contact links slide up from the bottom edge once the site is revealed. */
  enterTween(tl: gsap.core.Timeline, at: number, reduced = false): void {
    tl.fromTo(
      this.el.querySelectorAll('.hud__nav, .hud__social'),
      { opacity: 0, y: reduced ? 0 : 24 },
      { opacity: 1, y: 0, duration: D.m, stagger: 0.1 },
      at,
    )
      .call(() => this.showControls(reduced), [], at)
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
