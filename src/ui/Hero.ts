import { D } from '../core/ease';
import type { Content } from '../content/content';
import { resolveText } from './TextResolve';

/** Wordmark, kicker, name and tagline. Built hidden; the reveal segment decodes it. */
export class Hero {
  private el: HTMLElement;
  private mark: HTMLElement;
  private kicker: HTMLElement;
  private name: HTMLElement;
  private tagline: HTMLElement;

  constructor(
    root: HTMLElement,
    private content: Content,
  ) {
    this.el = document.createElement('header');
    this.el.className = 'hero';
    this.el.innerHTML = `
      <p class="hero__mark">dncnl.dev</p>
      <p class="hero__kicker mono"></p>
      <h1 class="hero__name"></h1>
      <p class="hero__tagline mono"></p>`;
    root.append(this.el);
    this.mark = this.el.querySelector('.hero__mark') as HTMLElement;
    this.kicker = this.el.querySelector('.hero__kicker') as HTMLElement;
    this.name = this.el.querySelector('.hero__name') as HTMLElement;
    this.tagline = this.el.querySelector('.hero__tagline') as HTMLElement;
    this.kicker.textContent = content.kicker;
  }

  enterTween(tl: gsap.core.Timeline, at: number, reduced: boolean): void {
    tl.fromTo(
      [this.mark, this.kicker],
      { opacity: 0, y: reduced ? 0 : 12 },
      { opacity: 1, y: 0, duration: D.m, stagger: 0.08 },
      at,
    )
      .add(resolveText(this.name, this.content.name, D.l, reduced), at + 0.1)
      .add(resolveText(this.tagline, this.content.tagline, D.l, reduced), at + D.s);
  }
}
