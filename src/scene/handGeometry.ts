import {
  Bone,
  BufferGeometry,
  Float32BufferAttribute,
  Uint16BufferAttribute,
  Vector3,
} from 'three';

/*
 * The procedural hand as one skinned surface, sculpted in code.
 *
 * Rest pose, wrist space: fingers point +Y, the palm faces +Z, the thumb sits on +X.
 * Fingers and thumb are lofted tubes whose bases sink into a lofted palm; skin
 * weights blend smoothly across every joint, so bends stay round with no seams.
 * Per-vertex `aDetail` (distance to nearest crease, palm/back side, region) lets
 * the skin shader draw creases and knuckle wrinkles without a texture.
 */

export type FingerName = 'index' | 'middle' | 'ring' | 'pinky';
export const FINGERS: FingerName[] = ['index', 'middle', 'ring', 'pinky'];
type DigitName = FingerName | 'thumb';

interface DigitSpec {
  base: [number, number, number];
  radius: number;
  len: [number, number, number];
  /** Direction the pad faces at rest, in the xz plane. */
  palmar: [number, number];
  /** How far the tube continues below its base joint, buried in the palm. */
  ext: number;
  width: number;
  /** Skin-weight blend half-widths at each joint. */
  blend: [number, number, number];
}

const DIGITS: Record<DigitName, DigitSpec> = {
  index: {
    base: [0.31, 0.97, 0],
    radius: 0.088,
    len: [0.4, 0.25, 0.19],
    palmar: [0, 1],
    ext: 0.18,
    width: 1.06,
    blend: [0.08, 0.045, 0.035],
  },
  middle: {
    base: [0.105, 1.01, 0],
    radius: 0.09,
    len: [0.44, 0.28, 0.2],
    palmar: [0, 1],
    ext: 0.18,
    width: 1.06,
    blend: [0.08, 0.045, 0.035],
  },
  ring: {
    base: [-0.1, 0.98, 0],
    radius: 0.085,
    len: [0.41, 0.26, 0.19],
    palmar: [0, 1],
    ext: 0.18,
    width: 1.06,
    blend: [0.08, 0.045, 0.035],
  },
  pinky: {
    base: [-0.3, 0.9, 0],
    radius: 0.074,
    len: [0.32, 0.2, 0.16],
    palmar: [0.08, 1],
    ext: 0.16,
    width: 1.05,
    blend: [0.07, 0.04, 0.03],
  },
  // The thumb is pronated: its pad turns toward the index finger.
  thumb: {
    base: [0.3, 0.22, 0.04],
    radius: 0.112,
    len: [0.34, 0.27, 0.22],
    palmar: [-0.62, 0.78],
    ext: 0.14,
    width: 1.1,
    blend: [0.1, 0.06, 0.045],
  },
};

const g = (x: number, w: number) => Math.exp(-(x / w) * (x / w));
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** Piecewise curve through sorted [x, y] keys, eased between keys. */
function curve(keys: [number, number][], x: number): number {
  const first = keys[0] as [number, number];
  if (x <= first[0]) return first[1];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1] as [number, number];
    const b = keys[i] as [number, number];
    if (x <= b[0]) return a[1] + (b[1] - a[1]) * smooth(a[0], b[0], x);
  }
  return (keys[keys.length - 1] as [number, number])[1];
}

// ---------------------------------------------------------------------------
// Accumulates every part into one indexed geometry.

class Builder {
  pos: number[] = [];
  col: number[] = [];
  det: number[] = [];
  fade: number[] = [];
  si: number[] = [];
  sw: number[] = [];
  idx: number[] = [];

  get count(): number {
    return this.pos.length / 3;
  }

  vert(
    p: Vector3,
    c: [number, number, number],
    d: [number, number, number],
    fade: number,
    w: [number, number][],
  ): number {
    this.pos.push(p.x, p.y, p.z);
    this.col.push(...c);
    this.det.push(...d);
    this.fade.push(fade);
    // Keep the four strongest influences, normalised.
    const top = w
      .filter(([, x]) => x > 1e-4)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    const sum = top.reduce((a, [, x]) => a + x, 0) || 1;
    for (let i = 0; i < 4; i++) {
      const e = top[i];
      this.si.push(e ? e[0] : 0);
      this.sw.push(e ? e[1] / sum : 0);
    }
    return this.count - 1;
  }

  /** Quad strip between two rings, wound so normals face outward. */
  strip(a0: number, b0: number, n: number, wrap: boolean): void {
    const m = wrap ? n : n - 1;
    for (let j = 0; j < m; j++) {
      const j1 = (j + 1) % n;
      this.idx.push(a0 + j, b0 + j, a0 + j1, b0 + j, b0 + j1, a0 + j1);
    }
  }

  geometry(): BufferGeometry {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    geo.setAttribute('aDetail', new Float32BufferAttribute(this.det, 3));
    geo.setAttribute('aFade', new Float32BufferAttribute(this.fade, 1));
    geo.setAttribute('skinIndex', new Uint16BufferAttribute(this.si, 4));
    geo.setAttribute('skinWeight', new Float32BufferAttribute(this.sw, 4));
    geo.setIndex(this.idx);
    geo.computeVertexNormals();
    return geo;
  }
}

// ---------------------------------------------------------------------------
// Digits

class Digit {
  readonly L: number;
  readonly joints: [number, number, number];
  readonly cap: number;
  readonly P: Vector3;
  readonly W: Vector3;
  readonly base: Vector3;
  readonly creases: number[];
  private mids: number[];

  constructor(
    readonly spec: DigitSpec,
    readonly bones: [number, number, number, number],
    thumb: boolean,
  ) {
    const [l0, l1, l2] = spec.len;
    this.L = l0 + l1 + l2;
    this.joints = [0, l0, l0 + l1];
    this.cap = spec.radius * 0.8 * 1.05;
    this.P = new Vector3(spec.palmar[0], 0, spec.palmar[1]).normalize();
    this.W = new Vector3(this.P.z, 0, -this.P.x);
    this.base = new Vector3(...spec.base);
    this.mids = [l0 * 0.5, l0 + l1 * 0.5, l0 + l1 + l2 * 0.4];
    // Palm-side flexion creases: the base crease sits a little above the knuckle.
    this.creases = thumb ? [l0, l0 + l1] : [0.07, l0, l0 + l1];
  }

  radius(s: number): number {
    const { radius: R, ext } = this.spec;
    const [, j1, j2] = this.joints;
    const [m0, m1] = this.mids as [number, number, number];
    let r = R * (1 - 0.2 * Math.min(1, Math.max(0, s / this.L)));
    if (s < 0) r *= 1 + 0.22 * smooth(0, -ext, s);
    r *= 1 + 0.06 * g(s - j1, 0.045) + 0.045 * g(s - j2, 0.035);
    r *= 1 - 0.028 * (g(s - m0, this.spec.len[0] * 0.2) + g(s - m1, this.spec.len[1] * 0.2));
    const c0 = this.L - this.cap;
    if (s > c0) {
      const k = (s - c0) / this.cap;
      r *= Math.sqrt(Math.max(0, 1 - k * k));
    }
    return r;
  }

  /** Surface point at distance s along the digit and angle phi (sin phi > 0 is the pad side). */
  point(s: number, phi: number, out = new Vector3()): Vector3 {
    const [, j1, j2] = this.joints;
    const [m0, m1] = this.mids as [number, number, number];
    const cs = Math.cos(phi);
    const sn = Math.sin(phi);
    const r = this.radius(s);
    let depth: number;
    if (sn > 0) {
      // Fleshy pads mid-phalanx and at the tip, pinched in at each crease.
      const tip = this.L - this.cap * 0.9;
      depth =
        0.9 +
        0.09 * (g(s - m0, this.spec.len[0] * 0.3) + g(s - m1, this.spec.len[1] * 0.3)) +
        0.14 * g(s - tip, this.cap * 0.9);
      for (const c of this.creases) depth -= 0.1 * g(s - c, 0.018);
    } else {
      // Flatter back with raised knuckles.
      depth = 0.78 + 0.08 * g(s, 0.05) + 0.1 * g(s - j1, 0.04) + 0.08 * g(s - j2, 0.035);
    }
    // The tip pad pushes past the nail, so the end of the finger leans palm-ward.
    const lean = this.spec.radius * 0.14 * smooth(this.L - this.cap - 0.1, this.L, s);
    return out
      .copy(this.base)
      .addScaledVector(this.W, r * this.spec.width * cs)
      .addScaledVector(this.P, r * depth * sn + lean)
      .setY(this.base.y + s);
  }

  weights(s: number): [number, number][] {
    const [b0, b1, b2] = this.spec.blend;
    const [, j1, j2] = this.joints;
    const t0 = smooth(-b0, b0, s);
    const t1 = smooth(-b1, b1, s - j1);
    const t2 = smooth(-b2, b2, s - j2);
    const [p, m, q, d] = this.bones;
    return [
      [p, 1 - t0],
      [m, t0 - t1],
      [q, t1 - t2],
      [d, t2],
    ];
  }

  creaseDist(s: number): number {
    let best = 9;
    for (const c of this.creases) if (Math.abs(s - c) < Math.abs(best)) best = s - c;
    return best;
  }
}

const RED: [number, number, number] = [0.97, 0.79, 0.75];
const PALM: [number, number, number] = [0.98, 0.92, 0.88];
const BASE: [number, number, number] = [0.94, 0.93, 0.92];
function tint(red: number, palm: number): [number, number, number] {
  const r = Math.min(1, red);
  const p = Math.min(1, palm) * (1 - r);
  return [0, 1, 2].map(
    (i) => (BASE[i] as number) * (1 - r - p) + (RED[i] as number) * r + (PALM[i] as number) * p,
  ) as [number, number, number];
}

function buildDigit(b: Builder, d: Digit, region: number): void {
  const NU = 26;
  const main = 46;
  const capRings = 9;
  const { ext } = d.spec;
  const c0 = d.L - d.cap;
  const rings: number[] = [];
  for (let i = 0; i < main; i++) rings.push(-ext + ((c0 + ext) * i) / (main - 1));
  for (let i = 1; i <= capRings; i++)
    rings.push(c0 + d.cap * Math.sin((i / capRings) * 0.985 * (Math.PI / 2)));

  const p = new Vector3();
  const [, j1, j2] = d.joints;
  let prev = -1;
  for (const s of rings) {
    const start = b.count;
    for (let j = 0; j < NU; j++) {
      const phi = (j / NU) * Math.PI * 2;
      const sn = Math.sin(phi);
      d.point(s, phi, p);
      const knuckle = (g(s, 0.05) * 0.5 + g(s - j1, 0.04) + g(s - j2, 0.03)) * Math.max(0, -sn);
      const tip = smooth(d.L - 0.13, d.L, s) * 0.75;
      b.vert(
        p,
        tint(knuckle * 0.55 + tip, Math.max(0, sn) * 0.9),
        [d.creaseDist(s), sn, region],
        1,
        d.weights(s),
      );
    }
    if (prev >= 0) b.strip(prev, start, NU, true);
    prev = start;
  }
  // Close the fingertip with a fan to a single pole.
  const tipIdx = b.vert(d.point(d.L, 0), tint(0.75, 0.4), [9, 0, region], 1, d.weights(d.L));
  for (let j = 0; j < NU; j++) b.idx.push(prev + j, tipIdx, prev + ((j + 1) % NU));
}

function buildNail(b: Builder, d: Digit, thumb: boolean): void {
  const NA = 9;
  const NB = 10;
  const [, , j2] = d.joints;
  const l2 = d.spec.len[2];
  const s0 = j2 + l2 * (thumb ? 0.34 : 0.38);
  const s1 = d.L - d.cap * 0.6;
  const half = thumb ? 0.86 : 0.8;
  const axis = new Vector3();
  const p = new Vector3();
  const dip = d.bones[3];
  let prev = -1;
  for (let i = 0; i < NB; i++) {
    const t = i / (NB - 1);
    const start = b.count;
    for (let j = 0; j < NA; j++) {
      const a = (j / (NA - 1)) * 2 - 1;
      // Cuticle curves toward the knuckle; the free edge rounds off at the corners.
      const sStart = s0 + 0.02 * a * a;
      const sEnd = s1 - 0.014 * a * a;
      const s = sStart + (sEnd - sStart) * t;
      d.point(s, -Math.PI / 2 + a * half, p);
      axis.copy(d.base).setY(d.base.y + s);
      // Crowned across, and settling into the skin at the cuticle and free edge.
      const lift = (0.002 + 0.004 * (1 - a * a)) * Math.sin(Math.PI * (0.15 + 0.7 * t));
      p.add(axis.sub(p).normalize().multiplyScalar(-lift));
      b.vert(p, [1, 1, 1], [9, -1, 3], 1, [[dip, 1]]);
    }
    if (prev >= 0) b.strip(prev, start, NA, false);
    prev = start;
  }
}

// ---------------------------------------------------------------------------
// Palm and wrist

const WIDTH: [number, number][] = [
  [-0.95, 0.27],
  [-0.5, 0.26],
  [-0.15, 0.29],
  [0.15, 0.4],
  [0.4, 0.445],
  [0.7, 0.45],
  [0.93, 0.43],
];
const THICK: [number, number][] = [
  [-0.95, 0.17],
  [-0.5, 0.155],
  [-0.15, 0.135],
  [0.2, 0.15],
  [0.5, 0.15],
  [0.93, 0.12],
];
/** Knuckle line: the palm's top edge slopes down toward the pinky and the thumb web. */
const KNUCKLES: [number, number][] = [
  [-0.5, 0.76],
  [-0.3, 0.88],
  [-0.1, 0.96],
  [0.105, 0.99],
  [0.31, 0.95],
  [0.5, 0.8],
];

function buildPalm(b: Builder, fingerMcp: number[], thumbCmc: number, root: number): void {
  const NU = 64;
  const NV = 60;
  const CAP = 6;
  const exp = 2 / 2.25; // superellipse: boxier than a tube, softer than a box
  const fx = FINGERS.map((f) => DIGITS[f].base[0]);
  const p = new Vector3();
  let prev = -1;

  for (let v = 0; v < NV + CAP; v++) {
    const yNom = -0.95 + (Math.min(v, NV - 1) / (NV - 1)) * (0.93 + 0.95);
    const k = v < NV ? 0 : (v - NV + 1) / CAP;
    const W = curve(WIDTH, yNom);
    const T = curve(THICK, yNom);
    const cx = 0.02 * smooth(-0.95, 0.2, yNom);
    const start = b.count;
    for (let u = 0; u < NU; u++) {
      const th = (u / NU) * Math.PI * 2;
      const cs = Math.cos(th);
      const sn = Math.sin(th);
      const x = cx + W * Math.sign(cs) * Math.abs(cs) ** exp;
      let z = T * Math.sign(sn) * Math.abs(sn) ** exp * (sn > 0 ? 1 : 0.86);
      const yk = curve(KNUCKLES, x);
      let y = yNom + (yk - 0.93) * smooth(0.5, 0.93, yNom);

      const palmSide = Math.max(0, sn);
      const back = Math.max(0, -sn);
      // Thenar and hypothenar mounds, the hollow between them, pads under the fingers.
      z += 0.085 * Math.exp(-((x - 0.21) ** 2) / 0.03 - (y - 0.32) ** 2 / 0.05) * palmSide;
      z += 0.05 * Math.exp(-((x + 0.3) ** 2) / 0.02 - (y - 0.4) ** 2 / 0.09) * palmSide;
      z -= 0.035 * Math.exp(-((x - 0.0) ** 2) / 0.04 - (y - 0.58) ** 2 / 0.03) * palmSide;
      // Knuckles, extensor tendons and the wrist bone on the back.
      let tendon = 0;
      fx.forEach((f, i) => {
        z += 0.022 * g(x - f, 0.07) * g(y - 0.86, 0.06) * palmSide;
        z -=
          0.035 *
          g(x - f, 0.06) *
          g(y - ((KNUCKLES[i + 1] as [number, number])[1] - 0.05), 0.06) *
          back;
        const lineX = 0.02 + f * 0.3 + (f - 0.02 - f * 0.3) * smooth(-0.1, 0.88, y);
        tendon += g(x - lineX, 0.016) * smooth(0.0, 0.35, y) * (1 - smooth(0.75, 0.9, y));
      });
      z -= 0.009 * Math.min(1, tendon) * back;
      z -= 0.025 * g(x + 0.25, 0.05) * g(y + 0.12, 0.05) * back;

      if (k > 0) {
        // Close the top: flatten front and back onto the knuckle ridge.
        z *= Math.cos(k * (Math.PI / 2));
        y = yk + (sn > 0 ? 0.12 : 0.06) * Math.sin(k * (Math.PI / 2));
      }
      p.set(x, y, z);

      // Skin weights: the thenar mound rides with the thumb, the knuckle ridge with each finger.
      const w: [number, number][] = [];
      const wT =
        0.32 *
        Math.exp(-((x - 0.3) ** 2 + (y - 0.27) ** 2) / (2 * 0.16 * 0.16)) *
        smooth(0.08, 0.25, x);
      w.push([thumbCmc, wT]);
      let wf = 0;
      fx.forEach((f, i) => {
        const wi = 0.5 * smooth(yk - 0.15, yk, y) * g(x - f, 0.08);
        wf += wi;
        w.push([fingerMcp[i] as number, wi]);
      });
      w.push([root, Math.max(0, 1 - wT - wf)]);

      const knuckle = fx.reduce((a, f) => a + g(x - f, 0.06) * g(y - yk + 0.05, 0.06), 0) * back;
      const palmTint = palmSide * (0.6 + 0.4 * smooth(-0.2, 0.3, y));
      const red = knuckle * 0.5 + 0.18 * palmSide * g(x - 0.22, 0.12) * g(y - 0.3, 0.15);
      b.vert(p, tint(red, palmTint), [9, sn, 0], smooth(-0.95, -0.45, y), w);
    }
    if (prev >= 0) b.strip(prev, start, NU, true);
    prev = start;
  }
}

// ---------------------------------------------------------------------------

export interface HandRig {
  root: Bone;
  bones: Bone[];
  fingers: [Bone, Bone, Bone][];
  thumb: [Bone, Bone, Bone];
  skin: BufferGeometry;
  nails: BufferGeometry;
}

function chain(spec: DigitSpec, parent: Bone, bones: Bone[]): [Bone, Bone, Bone] {
  const out: Bone[] = [];
  let p = parent;
  spec.len.forEach((_, i) => {
    const bone = new Bone();
    bone.rotation.order = 'ZXY';
    if (i === 0) bone.position.set(...spec.base);
    else bone.position.y = spec.len[i - 1] ?? 0;
    p.add(bone);
    bones.push(bone);
    out.push(bone);
    p = bone;
  });
  return out as [Bone, Bone, Bone];
}

export function buildHandRig(): HandRig {
  const root = new Bone();
  const bones: Bone[] = [root];
  const fingers = FINGERS.map((f) => chain(DIGITS[f], root, bones));
  const thumb = chain(DIGITS.thumb, root, bones);
  const ix = (bone: Bone) => bones.indexOf(bone);

  const skin = new Builder();
  const nails = new Builder();
  const digits = FINGERS.map(
    (f, i) =>
      new Digit(
        DIGITS[f],
        [0, ...(fingers[i] as [Bone, Bone, Bone]).map(ix)] as [number, number, number, number],
        false,
      ),
  );
  const thumbDigit = new Digit(
    DIGITS.thumb,
    [0, ...thumb.map(ix)] as [number, number, number, number],
    true,
  );

  buildPalm(
    skin,
    fingers.map((f) => ix(f[0])),
    ix(thumb[0]),
    0,
  );
  digits.forEach((d) => buildDigit(skin, d, 1));
  buildDigit(skin, thumbDigit, 2);
  digits.forEach((d) => buildNail(nails, d, false));
  buildNail(nails, thumbDigit, true);

  return { root, bones, fingers, thumb, skin: skin.geometry(), nails: nails.geometry() };
}
