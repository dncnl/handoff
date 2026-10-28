import { gsap } from 'gsap';
import { D } from '../core/ease';
import type { Content } from '../content/content';
import { fetchActivity, timeAgo, type ActivityItem } from '../content/github';

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

function panelBody(c: Content, id: Content['sections'][number]['id']): string {
  switch (id) {
    case 'build':
      return `
        <p class="lead">${esc(c.whatIBuild.intro)}</p>
        <p class="note"><span class="mono note__label">How I work</span>${esc(c.whatIBuild.howIWork)}</p>`;
    case 'skills':
      return `<dl class="skills">${c.skills
        .map(
          (g) =>
            `<div class="skills__group"><dt class="mono">${esc(g.name)}</dt><dd><ul class="chips">${g.items
              .map(
                (i) =>
                  `<li${i.slug ? ` data-slug="${esc(i.slug)}"` : ''}><span>${esc(i.name)}</span></li>`,
              )
              .join('')}</ul></dd></div>`,
        )
        .join('')}</dl>`;
    case 'certs':
      return `<ul class="certs">${c.certifications
        .map(
          (x, i) =>
            `<li><img class="certs__badge" src="${esc(x.badge)}" alt="" width="96" height="96" decoding="async" style="animation-delay:${-i * 280}ms" /><div class="certs__text"><span class="mono certs__issuer">${esc(x.issuer)}</span><span class="certs__name">${esc(x.name)}</span>${
              x.issued ? `<span class="mono certs__date">Issued ${esc(x.issued)}</span>` : ''
            }<a class="btn mono" href="${esc(x.href)}" target="_blank" rel="noopener">View credential ↗</a></div></li>`,
        )
        .join('')}</ul>`;
    case 'github':
      return `
        <dl class="stats">
          <div><dt class="mono">Public repositories</dt><dd>${c.github.publicRepos}</dd></div>
        </dl>
        <div class="activity">
          <p class="mono activity__label">Recent activity</p>
          <ol class="activity__list" aria-live="polite" aria-busy="true">
            <li class="mono activity__status">Loading…</li>
          </ol>
        </div>
        <a class="link mono" href="${esc(c.github.url)}" target="_blank" rel="noopener">github.com/${esc(c.github.username)} ↗</a>`;
    case 'contact':
      return `
        <p class="lead">${esc(c.contact.line)}</p>
        <ul class="contact">${c.contact.links
          .map(
            (l) =>
              `<li><span class="mono contact__label">${esc(l.label)}</span><a class="link" href="${esc(l.href)}"${
                l.href.startsWith('http') ? ' target="_blank" rel="noopener"' : ''
              }>${esc(l.display)}</a></li>`,
          )
          .join('')}</ul>`;
  }
}

/**
 * Five stacked panels with one visible at a time. Navigation is discrete
 * (wheel, swipe, drag, keys) because each step also drives a hand pose.
 */
export class Sections {
  readonly el: HTMLElement;
  private panels: HTMLElement[] = [];
  current = -1;
  private changeCb: ((i: number, prev: number) => void) | null = null;
  private enabled = false;
  private lockedUntil = 0;
  private wheelAcc = 0;
  private touchStart: { x: number; y: number; down: boolean; up: boolean } | null = null;

  constructor(
    root: HTMLElement,
    content: Content,
    private reduced: () => boolean,
  ) {
    this.el = document.createElement('main');
    this.el.id = 'main';
    this.el.className = 'sections';
    this.el.tabIndex = -1;
    content.sections.forEach((s) => {
      const p = document.createElement('section');
      p.className = `panel panel--${s.id}`;
      p.id = `section-${s.id}`;
      p.setAttribute('aria-labelledby', `${p.id}-title`);
      p.innerHTML = `
        <header class="panel__head">
          <span class="panel__index mono">${s.index}</span>
          <h2 class="panel__title" id="${p.id}-title">${esc(s.title)}</h2>
        </header>
        <div class="panel__body">${panelBody(content, s.id)}</div>`;
      p.hidden = true;
      this.el.append(p);
      this.panels.push(p);
    });
    root.append(this.el);
    void this.loadActivity(content.github.username);
    // Stack logos are code-split: the skills panel is never the first one shown.
    void import('./techIcon').then(({ techIcon }) =>
      this.el
        .querySelectorAll<HTMLElement>('[data-slug]')
        .forEach((li) => li.insertAdjacentHTML('afterbegin', techIcon(li.dataset.slug))),
    );

    window.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('touchstart', this.onTouchStart, { passive: true });
    window.addEventListener('touchend', this.onTouchEnd, { passive: true });
    window.addEventListener('pointerdown', this.onDragStart);
  }

  /** Fills the GitHub panel's feed; if GitHub can't be reached the block just goes away. */
  private async loadActivity(user: string): Promise<void> {
    const block = this.el.querySelector<HTMLElement>('.activity');
    const list = block?.querySelector<HTMLElement>('.activity__list');
    if (!block || !list) return;
    let items: ActivityItem[] = [];
    try {
      items = await fetchActivity(user);
    } catch {
      /* rate-limited or offline */
    }
    if (!items.length) {
      block.remove();
      return;
    }
    list.innerHTML = items
      .map(
        (a) =>
          `<li><span class="activity__line">${esc(a.verb)} <a class="link" href="${esc(a.repoUrl)}" target="_blank" rel="noopener">${esc(a.repo)}</a>${
            a.detail ? `<span class="activity__detail"> · ${esc(a.detail)}</span>` : ''
          }</span><time class="mono activity__time" datetime="${esc(a.at)}">${esc(timeAgo(a.at))}</time></li>`,
      )
      .join('');
    list.setAttribute('aria-busy', 'false');
  }

  onChange(cb: (i: number, prev: number) => void): void {
    this.changeCb = cb;
  }

  enable(): void {
    this.enabled = true;
  }

  get count(): number {
    return this.panels.length;
  }

  goTo(i: number, at?: gsap.core.Timeline, offset = 0): void {
    const next = Math.max(0, Math.min(this.panels.length - 1, i));
    if (next === this.current) return;
    const prev = this.current;
    const out = this.panels[prev];
    const inn = this.panels[next];
    if (!inn) return;
    this.current = next;
    this.lockedUntil = performance.now() + D.m * 1000;
    const dir = prev < 0 ? 1 : Math.sign(next - prev);
    const dy = this.reduced() ? 0 : 28;

    const tl = at ?? gsap.timeline();
    if (out) {
      tl.to(
        out,
        { opacity: 0, y: -dy * dir, duration: D.s, onComplete: () => void (out.hidden = true) },
        offset,
      );
    }
    const kids = inn.querySelectorAll('.panel__head, .panel__body > *');
    tl.call(() => void (inn.hidden = false), [], offset + (out ? D.xs : 0))
      .fromTo(inn, { opacity: 0 }, { opacity: 1, duration: D.s }, offset + (out ? D.xs : 0))
      .fromTo(
        kids,
        { opacity: 0, y: dy * dir },
        { opacity: 1, y: 0, duration: D.m, stagger: 0.06 },
        offset + (out ? D.xs : 0),
      );
    this.changeCb?.(next, prev);
  }

  step(d: number): void {
    if (!this.enabled || performance.now() < this.lockedUntil) return;
    this.goTo(this.current + d);
  }

  private onWheel = (e: WheelEvent): void => {
    if (!this.enabled) return;
    const scroller = this.scrollerFor(e.target, Math.sign(e.deltaY));
    if (scroller) return;
    // Trackpad inertia keeps firing after a step; extend the lock while it does.
    if (performance.now() < this.lockedUntil) {
      this.lockedUntil = Math.max(this.lockedUntil, performance.now() + 120);
      this.wheelAcc = 0;
      return;
    }
    this.wheelAcc += e.deltaY;
    if (Math.abs(this.wheelAcc) > 40) {
      this.step(Math.sign(this.wheelAcc));
      this.wheelAcc = 0;
    }
  };

  private onKey = (e: KeyboardEvent): void => {
    if (!this.enabled || e.defaultPrevented) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest('input, textarea')) return;
    const keys: Record<string, () => void> = {
      ArrowDown: () => this.step(1),
      PageDown: () => this.step(1),
      ArrowRight: () => this.step(1),
      ArrowUp: () => this.step(-1),
      PageUp: () => this.step(-1),
      ArrowLeft: () => this.step(-1),
      Home: () => this.goTo(0),
      End: () => this.goTo(this.panels.length - 1),
    };
    const action = keys[e.key];
    if (!action) return;
    e.preventDefault();
    action();
  };

  private onTouchStart = (e: TouchEvent): void => {
    const t = e.touches[0];
    if (!t) return;
    // Edge state is captured at touch start, so a swipe that scrolls a panel
    // to its end doesn't also page in the same gesture.
    this.touchStart = {
      x: t.clientX,
      y: t.clientY,
      down: !this.scrollerFor(e.target, 1),
      up: !this.scrollerFor(e.target, -1),
    };
  };

  private onTouchEnd = (e: TouchEvent): void => {
    const s = this.touchStart;
    const t = e.changedTouches[0];
    this.touchStart = null;
    if (!s || !t || !this.enabled) return;
    const dy = s.y - t.clientY;
    const dx = s.x - t.clientX;
    if (Math.abs(dy) < 50 || Math.abs(dy) < Math.abs(dx) * 1.2) return;
    if ((dy > 0 && !s.down) || (dy < 0 && !s.up)) return;
    this.step(Math.sign(dy));
  };

  private onDragStart = (e: PointerEvent): void => {
    if (!this.enabled || e.pointerType !== 'mouse' || e.button !== 0) return;
    if ((e.target as HTMLElement | null)?.closest('a, button, .panel')) return;
    const y0 = e.clientY;
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointerup', up);
      const dy = y0 - ev.clientY;
      if (Math.abs(dy) > 60) this.step(Math.sign(dy));
    };
    window.addEventListener('pointerup', up);
  };

  /** Returns the panel body if it can scroll further in `dir` (so we shouldn't page). */
  private scrollerFor(target: EventTarget | null, dir: number): HTMLElement | null {
    const body = (target as HTMLElement | null)?.closest?.('.panel') as HTMLElement | null;
    if (!body || body.scrollHeight <= body.clientHeight + 1) return null;
    const atTop = body.scrollTop <= 0;
    const atEnd = body.scrollTop + body.clientHeight >= body.scrollHeight - 1;
    return (dir > 0 && !atEnd) || (dir < 0 && !atTop) ? body : null;
  }
}
