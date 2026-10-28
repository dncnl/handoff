import { Color } from 'three';
import { gsap } from 'gsap';

/** Scene colours, read from the CSS tokens so the brand lives in one place (tokens.css). */
export interface ScenePalette {
  light: boolean;
  /** Background edge and centre pool. */
  deep: Color;
  mid: Color;
  /** Accent light: background glow, screen content, hand rim. */
  glow: Color;
  /** Body of the floating screen. */
  screen: Color;
}

export function readPalette(): ScenePalette {
  const css = getComputedStyle(document.documentElement);
  const read = (name: string) => new Color(css.getPropertyValue(name).trim() || '#000');
  return {
    light: document.documentElement.dataset.theme !== 'dark',
    deep: read('--c-scene-deep'),
    mid: read('--c-scene-mid'),
    glow: read('--c-glow'),
    screen: read('--c-scene-screen'),
  };
}

/** Eases a uniform colour toward `to` in linear space; duration 0 snaps. */
export function tweenColor(target: Color, to: Color, duration: number): void {
  gsap.killTweensOf(target);
  if (duration <= 0) target.copy(to);
  else gsap.to(target, { r: to.r, g: to.g, b: to.b, duration, ease: 'power2.inOut' });
}
