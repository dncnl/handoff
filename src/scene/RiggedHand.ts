import {
  Float32BufferAttribute,
  Matrix3,
  Matrix4,
  Quaternion,
  SkinnedMesh,
  Vector3,
  type Object3D,
} from 'three';
import { addPalmHitTarget, PosedHand, type Hand, type PoseJoint } from './Hand';
import { FINGERS, padCreases, tint } from './handGeometry';
import { createHandMaterial } from './handMaterial';

/*
 * A real rigged hand: the MIT-licensed WebXR "generic-hand" (see
 * public/models/README.md), posed by the same pose table as the procedural hand.
 *
 * On load the model is turned into wrist space (fingers +Y, palm +Z, thumb +X,
 * wrist-to-middle-tip = LENGTH), each joint gets the quaternions that carry
 * canonical pose angles into its own bone space, and the per-vertex data the skin
 * shader needs (creases, palm/back side, nails, wrist fade) is baked from the rig.
 */

const LENGTH = 2.0;
const WRIST_Y = -0.07;
/** The pose table's thumb rest: along +Y, pad turned toward the index finger. */
const THUMB_PAD = new Vector3(-0.62, 0, 0.78).normalize();
const Z = new Vector3(0, 0, 1);

type Chain = [PoseJoint, PoseJoint, PoseJoint];
const FINGER_JOINTS = [
  'metacarpal',
  'phalanx-proximal',
  'phalanx-intermediate',
  'phalanx-distal',
  'tip',
];
const THUMB_JOINTS = ['metacarpal', 'phalanx-proximal', 'phalanx-distal', 'tip'];

const g = (x: number, w: number) => Math.exp(-(x / w) * (x / w));
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Rotation whose columns are x = y × z, y, z (z made perpendicular to y). */
function frame(y: Vector3, zHint: Vector3): Quaternion {
  const yy = y.clone().normalize();
  const z = zHint.clone().addScaledVector(yy, -zHint.dot(yy)).normalize();
  const x = new Vector3().crossVectors(yy, z);
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, yy, z));
}

interface Digit {
  /** Joint positions in wrist space, base to tip (the thumb has one fewer). */
  pts: Vector3[];
  dirs: Vector3[];
  cum: number[];
  /** Pad direction (palm side) for this digit. */
  pad: Vector3;
  creases: [number, number, number];
  /** Bone name → segment index along the digit. */
  segOf: Map<string, number>;
  thumb: boolean;
}

class RiggedHand extends PosedHand {
  readonly hitTargets: Object3D[] = [];
  protected rim: { value: number };

  constructor(model: Object3D) {
    super();
    const get = (name: string) => {
      const o = model.getObjectByName(name);
      if (!o) throw new Error(`hand.glb is missing joint "${name}"`);
      return o;
    };
    let mesh: SkinnedMesh | null = null;
    model.traverse((o) => {
      if ((o as SkinnedMesh).isSkinnedMesh) mesh ??= o as SkinnedMesh;
    });
    if (!mesh) throw new Error('hand.glb has no skinned mesh');
    const skin: SkinnedMesh = mesh;

    // --- Normalise into wrist space -------------------------------------------
    model.updateMatrixWorld(true);
    const at = (name: string) => get(name).getWorldPosition(new Vector3());
    const wrist = at('wrist');
    const y = at('middle-finger-tip').sub(wrist);
    const scale = LENGTH / y.length();
    const across = at('index-finger-phalanx-proximal').sub(at('pinky-finger-phalanx-proximal'));
    // Model axes of the canonical frame; z = x × y faces out of a right palm.
    const toModel = frame(y, new Vector3().crossVectors(across, y));
    const n = new Matrix4()
      .makeTranslation(0, WRIST_Y, 0)
      .multiply(new Matrix4().makeScale(scale, scale, scale))
      .multiply(new Matrix4().makeRotationFromQuaternion(toModel.clone().invert()))
      .multiply(new Matrix4().makeTranslation(-wrist.x, -wrist.y, -wrist.z));
    model.applyMatrix4(n);
    this.wrist.add(model);
    // WebXR hands are flat: every joint is a sibling, posed directly. Chain them
    // (keeping world transforms, so the skin binding is unchanged) so a bend at
    // the knuckle carries the rest of the finger with it.
    model.updateMatrixWorld(true);
    for (const digit of ['thumb', ...FINGERS.map((f) => `${f}-finger`)]) {
      const chain = digit === 'thumb' ? THUMB_JOINTS : FINGER_JOINTS;
      let parent = get('wrist');
      for (const j of chain) {
        const bone = get(`${digit}-${j}`);
        parent.attach(bone);
        parent = bone;
      }
    }
    // The hand object sits at the origin while building, so world space is wrist space.
    this.object.updateMatrixWorld(true);
    const P = (name: string) => get(name).getWorldPosition(new Vector3());
    const W = (name: string) => get(name).getWorldQuaternion(new Quaternion());

    // --- Retarget --------------------------------------------------------------
    const joint = (name: string, canonical: Quaternion, align?: Quaternion): PoseJoint => {
      const bone = get(name);
      const rest = W(name);
      const f = rest.clone().invert().multiply(canonical);
      if (!align) {
        return { bone, left: bone.quaternion.clone().multiply(f), right: f.clone().invert() };
      }
      // Thumb base: bend about wrist axes, starting from the pose table's thumb rest.
      return {
        bone,
        left: bone.quaternion.clone().multiply(rest.clone().invert()),
        right: align.clone().multiply(rest),
      };
    };

    const digits: Digit[] = [];
    this.fingers = FINGERS.map((f) => {
      const names = ['phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'].map(
        (j) => `${f}-finger-${j}`,
      );
      const pts = names.map(P);
      digits.push(this.digit(names, pts, Z, false));
      return names
        .slice(0, 3)
        .map((nm, i) =>
          joint(nm, frame((pts[i + 1] as Vector3).clone().sub(pts[i] as Vector3), Z)),
        ) as Chain;
    });

    const tn = ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'];
    const tp = tn.map(P);
    const tDir = (tp[1] as Vector3)
      .clone()
      .sub(tp[0] as Vector3)
      .normalize();
    const toIndex = P('index-finger-phalanx-proximal')
      .sub(tp[1] as Vector3)
      .normalize();
    const pad = toIndex.multiplyScalar(0.62).addScaledVector(Z, 0.78);
    pad.addScaledVector(tDir, -pad.dot(tDir)).normalize();
    // Rotation taking the model's thumb rest onto the pose table's thumb rest.
    const align = frame(new Vector3(0, 1, 0), THUMB_PAD).multiply(frame(tDir, pad).invert());
    const thumbAxes = align.clone().invert();
    this.thumb = [
      joint(tn[0] as string, new Quaternion(), align),
      joint(tn[1] as string, thumbAxes),
      joint(tn[2] as string, thumbAxes),
    ];
    digits.push(this.digit(tn.slice(1), tp.slice(1), pad, true));

    // --- Material and baked surface data ---------------------------------------
    const { material, rim } = createHandMaterial({
      detail: true,
      rest: true,
      nails: true,
      creases: digits.map((d) => d.creases),
    });
    this.rim = rim;
    this.bake(skin, digits);
    skin.material = material;
    skin.frustumCulled = false;

    this.hitTargets.push(addPalmHitTarget(this.wrist));
    this.start();
  }

  private digit(names: string[], pts: Vector3[], padHint: Vector3, thumb: boolean): Digit {
    const segs = pts.length - 1;
    const dirs: Vector3[] = [];
    const cum = [0];
    for (let i = 0; i < segs; i++) {
      const d = (pts[i + 1] as Vector3).clone().sub(pts[i] as Vector3);
      cum.push((cum[i] as number) + d.length());
      dirs.push(d.normalize());
    }
    const [, l0 = 0, l01 = 0] = cum;
    const segOf = new Map<string, number>();
    names.forEach((nm, i) => segOf.set(nm, Math.min(i, segs - 1)));
    const mid = (dirs[1] as Vector3).clone();
    const pad = padHint.clone().addScaledVector(mid, -padHint.dot(mid)).normalize();
    // Flexion creases; the base crease sits a quarter of the way up the first phalanx.
    const creases = padCreases(thumb ? [0, l0] : [l0 * 0.28, l0, l01]);
    return { pts, dirs, cum, pad, creases, segOf, thumb };
  }

  /** Bakes aRest, aDetail, aNail, aFade and vertex colours from the rest pose. */
  private bake(skin: SkinnedMesh, digits: Digit[]): void {
    const geo = skin.geometry;
    const pos = geo.getAttribute('position');
    const nor = geo.getAttribute('normal');
    const si = geo.getAttribute('skinIndex');
    const sw = geo.getAttribute('skinWeight');
    const bones = skin.skeleton.bones;
    const count = pos.count;
    const m = skin.matrixWorld;
    const nm = new Matrix3().getNormalMatrix(m);
    const p = new Vector3();
    const nrm = new Vector3();
    const v = new Vector3();

    const rest = new Float32Array(count * 3);
    const detail = new Float32Array(count * 4);
    const nail = new Float32Array(count * 2);
    const fade = new Float32Array(count);
    const color = new Float32Array(count * 3);
    const knuckles = digits.slice(0, 4).map((d) => d.pts[0] as Vector3);

    let minY = Infinity;
    for (let i = 0; i < count; i++)
      minY = Math.min(minY, p.fromBufferAttribute(pos, i).applyMatrix4(m).y);

    for (let i = 0; i < count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(m);
      nrm.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      rest.set([p.x, p.y, p.z], i * 3);
      fade[i] = smooth(minY + 0.02, minY + 0.32, p.y);

      // Strongest influence decides which digit segment (if any) this vertex rides.
      let best = 0;
      let bestW = -1;
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k);
        if (w > bestW) {
          bestW = w;
          best = si.getComponent(i, k);
        }
      }
      const name = bones[best]?.name ?? '';
      const di = digits.findIndex((d) => d.segOf.has(name));
      const d = digits[di];
      let red: number;
      let palm: number;
      nail.set([0, -1], i * 2);

      if (d) {
        const seg = d.segOf.get(name) as number;
        const dir = d.dirs[seg] as Vector3;
        const s =
          (d.cum[seg] as number) +
          v
            .copy(p)
            .sub(d.pts[seg] as Vector3)
            .dot(dir);
        const side = nrm.dot(d.pad);
        detail.set([s, side, d.thumb ? 2 : 1, di], i * 4);
        const last = d.dirs.length - 1;
        const L = d.cum[last + 1] as number;
        const jl = d.cum[last] as number;
        const knuckle = d.cum.slice(0, last + 1).reduce((a, j) => a + g(s - j, 0.04), 0);
        red = knuckle * Math.max(0, -side) * 0.5 + smooth(L - 0.13, L, s) * 0.75;
        palm = Math.max(0, side) * 0.9;
        if (seg === last) {
          // Around the distal segment: 0 at the last knuckle, 1 at the tip.
          const axisPt = (d.pts[last] as Vector3).clone().addScaledVector(dir, s - jl);
          const radial = v.copy(p).sub(axisPt);
          radial.addScaledVector(dir, -radial.dot(dir)).normalize();
          const back = d.pad.clone().negate();
          back.addScaledVector(dir, -back.dot(dir)).normalize();
          nail.set([(s - jl) / (L - jl), radial.dot(back)], i * 2);
        }
      } else {
        const side = nrm.z;
        detail.set([0, side, 0, 0], i * 4);
        red = knuckles.reduce((a, k) => a + g(p.distanceTo(k), 0.12), 0) * Math.max(0, -side) * 0.5;
        palm = Math.max(0, side) * (0.6 + 0.4 * smooth(-0.2, 0.3, p.y));
      }
      color.set(tint(red, palm), i * 3);
    }

    geo.setAttribute('aRest', new Float32BufferAttribute(rest, 3));
    geo.setAttribute('aDetail', new Float32BufferAttribute(detail, 4));
    geo.setAttribute('aNail', new Float32BufferAttribute(nail, 2));
    geo.setAttribute('aFade', new Float32BufferAttribute(fade, 1));
    geo.setAttribute('color', new Float32BufferAttribute(color, 3));
  }
}

export async function loadRiggedHand(url: string, onProgress: (p: number) => void): Promise<Hand> {
  // The loader is split out with the model, so it only downloads alongside it.
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().loadAsync(
    url,
    (e) => e.total && onProgress(e.loaded / e.total),
  );
  onProgress(1);
  return new RiggedHand(gltf.scene);
}
