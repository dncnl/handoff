// The single motion curve, cubic-bezier(.22,1,.36,1), shared by GSAP, CSS and GLSL.
// Solving the bezier ourselves (instead of CustomEase) keeps GSAP core-only.

const X1 = 0.22;
const Y1 = 1;
const X2 = 0.36;
const Y2 = 1;

const cx = 3 * X1;
const bx = 3 * (X2 - X1) - cx;
const ax = 1 - cx - bx;
const cy = 3 * Y1;
const by = 3 * (Y2 - Y1) - cy;
const ay = 1 - cy - by;

const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

function solveT(x: number): number {
  // Newton converges in a few steps for this curve; bisection is the safety net.
  let t = x;
  for (let i = 0; i < 6; i++) {
    const err = sampleX(t) - x;
    if (Math.abs(err) < 1e-6) return t;
    const d = slopeX(t);
    if (Math.abs(d) < 1e-6) break;
    t -= err / d;
  }
  let lo = 0;
  let hi = 1;
  t = x;
  for (let i = 0; i < 20; i++) {
    const v = sampleX(t);
    if (Math.abs(v - x) < 1e-6) break;
    if (v < x) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return t;
}

export function ease(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return sampleY(solveT(x));
}

export const EASE_CSS = 'cubic-bezier(.22,1,.36,1)';

/** The only durations allowed anywhere (seconds). */
export const D = { xs: 0.2, s: 0.4, m: 0.8, l: 1.2 } as const;

/** Same curve for shaders, so GPU-driven motion matches DOM motion. */
export const EASE_GLSL = /* glsl */ `
float easeCurve(float x) {
  x = clamp(x, 0.0, 1.0);
  float cx = ${(3 * X1).toFixed(4)};
  float bx = ${(3 * (X2 - X1) - 3 * X1).toFixed(4)};
  float ax = 1.0 - cx - bx;
  float cy = ${(3 * Y1).toFixed(4)};
  float by = ${(3 * (Y2 - Y1) - 3 * Y1).toFixed(4)};
  float ay = 1.0 - cy - by;
  float t = x;
  for (int i = 0; i < 5; i++) {
    float e = ((ax * t + bx) * t + cx) * t - x;
    float d = (3.0 * ax * t + 2.0 * bx) * t + cx;
    t -= e / max(d, 1e-4);
    t = clamp(t, 0.0, 1.0);
  }
  return ((ay * t + by) * t + cy) * t;
}
`;
