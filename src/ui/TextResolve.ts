import { gsap } from 'gsap';
import { D } from '../core/ease';

const GLYPHS = '#%&*+=<>/\\[]{}01abcdefghijklmnopqrstuvwxyz';

/**
 * Prepares an element for a left-to-right "decode" of its text. The real
 * string is set as aria-label so screen readers never hear the scramble.
 */
export function resolveText(
  el: HTMLElement,
  text: string,
  duration = D.l,
  reduced = false,
): gsap.core.Tween {
  el.setAttribute('aria-label', text);
  el.textContent = '';
  // Characters are grouped per word so lines only break between words.
  const spans: HTMLSpanElement[] = [];
  let word: HTMLSpanElement | null = null;
  for (const ch of text) {
    if (ch === ' ' || !word) {
      word = document.createElement('span');
      word.className = 'rw';
      el.append(word);
    }
    const s = document.createElement('span');
    s.className = 'rc';
    s.setAttribute('aria-hidden', 'true');
    s.textContent = ch === ' ' ? ' ' : ch;
    s.style.opacity = '0';
    if (ch === ' ') el.insertBefore(s, word);
    else word.append(s);
    spans.push(s);
  }

  if (reduced) {
    return gsap.fromTo(spans, { opacity: 0 }, { opacity: 1, duration: D.m });
  }

  const n = spans.length;
  // Each character spends this many "slots" scrambling before it settles.
  const window = 6;
  const state = { p: 0 };
  let tick = 0;
  return gsap.to(state, {
    p: 1,
    duration,
    ease: 'none',
    onUpdate: () => {
      // Re-roll glyphs every other frame: every frame is noise, slower feels stuck.
      const roll = tick++ % 2 === 0;
      const head = state.p * (n + window);
      for (let i = 0; i < n; i++) {
        const s = spans[i];
        const ch = text[i];
        if (!s || ch === undefined) continue;
        const local = Math.min(1, Math.max(0, (head - i) / window));
        if (local <= 0) continue;
        s.style.opacity = String(Math.min(1, local * 1.6));
        s.style.transform = local < 1 ? `translate3d(0, ${(1 - local) * 0.35}em, 0)` : '';
        if (ch === ' ') continue;
        if (local >= 1) s.textContent = ch;
        else if (roll) s.textContent = GLYPHS[(Math.random() * GLYPHS.length) | 0] ?? ch;
      }
    },
    onComplete: () =>
      spans.forEach((s, i) => (s.textContent = text[i] === ' ' ? ' ' : (text[i] ?? ''))),
  });
}
