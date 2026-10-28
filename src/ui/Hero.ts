import { D } from '../core/ease';
import type { Content } from '../content/content';
import { resolveText } from './TextResolve';

/** Name and tagline. Built hidden; the reveal segment decodes them. */
export class Hero {
  private el: HTMLElement;
  private name: HTMLElement;
  private tagline: HTMLElement;

  constructor(
    root: HTMLElement,
    private content: Content,
  ) {
    this.el = document.createElement('header');
    this.el.className = 'hero';
    this.el.innerHTML = `
      <h1 class="hero__name"></h1>
      <p class="hero__tagline mono"></p>`;
    root.append(this.el);
    this.name = this.el.querySelector('.hero__name') as HTMLElement;
    this.tagline = this.el.querySelector('.hero__tagline') as HTMLElement;
  }

  enterTween(tl: gsap.core.Timeline, at: number, reduced: boolean): void {
    tl.add(resolveText(this.name, this.content.name, D.l, reduced), at + 0.1).add(
      resolveText(this.tagline, this.content.tagline, D.l, reduced),
      at + D.s,
    );
  }
}
