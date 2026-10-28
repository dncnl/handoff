import {
  BoxGeometry,
  Euler,
  Group,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Vector3,
} from 'three';
import { gsap } from 'gsap';
import type { PointerState } from '../core/Input';
import { buildHandRig, FINGERS, type FingerName } from './handGeometry';
import { createHandMaterial, createNailMaterial } from './handMaterial';

export const POSES = [
  'idle',
  'offer',
  'grip',
  'palmUp',
  'hold',
  'tap',
  'pinch',
  'point',
  'thumbsUp',
] as const;
export type PoseName = (typeof POSES)[number];

/** The contract both the procedural hand and a real hand.glb satisfy. */
export interface Hand {
  readonly object: Object3D;
  /** Meshes the gate raycasts against for "press the palm". */
  readonly hitTargets: Object3D[];
  /** A point floating above the palm; the screen follows it. */
  readonly palmAnchor: Object3D;
  /** Breathing and cursor follow; off under reduced motion. */
  motion: boolean;
  setPose(name: PoseName, duration?: number): void;
  setGrip(t: number): void;
  setGlow(v: number): void;
  update(dt: number, pointer: PointerState): void;
}

// ---------------------------------------------------------------------------
// Shared behaviour: cursor follow + breathing sit above whatever drives the pose.

export abstract class HandBase implements Hand {
  readonly object = new Group();
  protected readonly follow = new Group();
  abstract readonly hitTargets: Object3D[];
  abstract readonly palmAnchor: Object3D;
  motion = true;
  protected time = 0;
  private look = { x: 0, y: 0 };

  constructor() {
    this.object.add(this.follow);
  }

  abstract setPose(name: PoseName, duration?: number): void;
  abstract setGrip(t: number): void;
  abstract setGlow(v: number): void;

  update(dt: number, pointer: PointerState): void {
    this.time += dt;
    const k = 1 - Math.exp(-dt * 3.2);
    const tx = this.motion ? -pointer.ndc.y * 0.12 : 0;
    const ty = this.motion ? pointer.ndc.x * 0.22 : 0;
    this.look.x += (tx - this.look.x) * k;
    this.look.y += (ty - this.look.y) * k;
    const breath = this.motion ? Math.sin(this.time * 1.25) : 0;
    this.follow.rotation.set(this.look.x + breath * 0.012, this.look.y, breath * 0.008);
    this.follow.position.y = breath * 0.025;
  }
}

// ---------------------------------------------------------------------------
// Poses, shared by every hand: authored once, retargeted onto each rig.

/** Degrees: [spread, mcp curl, pip curl, dip curl]. */
type FingerPose = [number, number, number, number];

interface PoseDef {
  /** Direction the fingers point, in hand-object space. */
  dir: [number, number, number];
  /** Direction the palm faces. Orthogonalised against dir. */
  palm: [number, number, number];
  offset?: [number, number, number];
  fingers: Record<FingerName, FingerPose>;
  /** cmc [x,y,z], mcp [x,z], ip [x] — degrees. */
  thumb: [number, number, number, number, number, number];
}

const relaxed = (c: number): Record<FingerName, FingerPose> => ({
  index: [-4, c, c * 1.1, c * 0.7],
  middle: [0, c, c * 1.15, c * 0.7],
  ring: [4, c * 1.1, c * 1.2, c * 0.75],
  pinky: [9, c * 1.25, c * 1.3, c * 0.8],
});

const fist = (): Record<FingerName, FingerPose> => ({
  index: [0, 82, 98, 55],
  middle: [0, 86, 100, 58],
  ring: [2, 88, 100, 58],
  pinky: [4, 90, 98, 55],
});

const POSE_DEFS: Record<PoseName, PoseDef> = {
  idle: {
    dir: [0.18, 1, 0.12],
    palm: [-0.35, -0.1, 1],
    fingers: relaxed(14),
    thumb: [12, 0, -38, 0, 0, 10],
  },
  offer: {
    dir: [-1, 0.06, 0.78],
    palm: [0.6, -0.08, 0.8],
    offset: [0, -0.1, 0],
    fingers: {
      index: [-1, 8, 10, 6],
      middle: [0, 9, 11, 6],
      ring: [1, 11, 12, 7],
      pinky: [3, 14, 14, 8],
    },
    thumb: [6, 0, -58, 0, 0, 6],
  },
  grip: {
    dir: [-0.95, 0.02, 0.8],
    palm: [0.62, -0.05, 0.78],
    offset: [0.05, -0.12, 0.12],
    fingers: {
      index: [0, 52, 68, 38],
      middle: [0, 56, 72, 40],
      ring: [1, 58, 72, 40],
      pinky: [2, 60, 70, 38],
    },
    thumb: [34, 0, -22, 14, 8, 26],
  },
  palmUp: {
    dir: [-1, 0.18, 0.28],
    palm: [0.05, 1, 0.42],
    offset: [0, -0.35, 0],
    fingers: {
      index: [-7, 5, 6, 4],
      middle: [-1, 4, 6, 4],
      ring: [5, 6, 7, 4],
      pinky: [11, 8, 8, 5],
    },
    thumb: [0, 0, -50, 0, 0, 0],
  },
  hold: {
    dir: [-0.92, 0.3, 0.38],
    palm: [0.15, 1, 0.5],
    offset: [0, -0.55, 0],
    fingers: relaxed(22),
    thumb: [16, 0, -34, 4, 0, 10],
  },
  tap: {
    dir: [-0.32, -0.92, 0.12],
    palm: [-0.1, -0.15, -1],
    offset: [0, 0.15, 0],
    fingers: {
      index: [0, 4, 10, 6],
      middle: [2, 80, 96, 55],
      ring: [3, 86, 98, 56],
      pinky: [5, 88, 96, 54],
    },
    thumb: [28, 0, 4, 10, 12, 22],
  },
  pinch: {
    dir: [-0.35, 1, 0.15],
    palm: [0.45, 0.1, 1],
    fingers: {
      index: [2, 42, 58, 32],
      middle: [-2, 12, 14, 8],
      ring: [4, 16, 16, 10],
      pinky: [12, 20, 18, 10],
    },
    thumb: [34, 12, -12, 10, 6, 22],
  },
  point: {
    dir: [-1, 0.12, 0.3],
    palm: [0.1, -1, 0.1],
    fingers: { ...fist(), index: [0, 2, 4, 2] },
    thumb: [26, 0, 12, 10, 14, 22],
  },
  thumbsUp: {
    dir: [-1, 0, 0.35],
    palm: [0.33, 0, 0.94],
    fingers: fist(),
    thumb: [0, 0, -78, 0, 0, 0],
  },
};

/** Where the visual mass of the hand sits in wrist space; poses orbit around it. */
const MASS_CENTER = new Vector3(0, 0.95, 0);
const POSE_LEN = 4 + FINGERS.length * 4 + 6;

interface CompiledPose {
  quat: Quaternion;
  values: Float32Array;
}

function compile(def: PoseDef): CompiledPose {
  const y = new Vector3(...def.dir).normalize();
  const p = new Vector3(...def.palm);
  const z = p.sub(y.clone().multiplyScalar(p.dot(y))).normalize();
  const x = new Vector3().crossVectors(y, z);
  const quat = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
  const v = new Float32Array(POSE_LEN);
  const o = def.offset ?? [0, 0, 0];
  v.set([o[0], o[1], o[2], 0], 0);
  FINGERS.forEach((f, i) => v.set(def.fingers[f], 4 + i * 4));
  v.set(def.thumb, 4 + FINGERS.length * 4);
  return { quat, values: v };
}

const COMPILED = Object.fromEntries(POSES.map((n) => [n, compile(POSE_DEFS[n])])) as Record<
  PoseName,
  CompiledPose
>;

/**
 * A joint the pose driver can bend. Pose angles are authored in a canonical frame
 * (x: curl axis, y: along the bone, z: palm normal); `left` and `right` carry them
 * into the bone's own space: quaternion = left · Euler(ZXY) · right. For a bone that
 * already uses the canonical frame both are identity.
 */
export interface PoseJoint {
  bone: Object3D;
  left: Quaternion;
  right: Quaternion;
}

export const plainJoint = (bone: Object3D): PoseJoint => ({
  bone,
  left: new Quaternion(),
  right: new Quaternion(),
});

type Chain = [PoseJoint, PoseJoint, PoseJoint];

/** Blends between compiled poses and writes them onto a wrist group and its joints. */
export abstract class PosedHand extends HandBase {
  readonly palmAnchor = new Object3D();
  /** Wrist space: fingers +Y, palm +Z, thumb +X. */
  protected readonly wrist = new Group();
  protected fingers: Chain[] = [];
  protected thumb: Chain | null = null;
  protected abstract rim: { value: number };

  private cur: CompiledPose = { quat: new Quaternion(), values: new Float32Array(POSE_LEN) };
  private from: CompiledPose = { quat: new Quaternion(), values: new Float32Array(POSE_LEN) };
  private to: CompiledPose = COMPILED.idle;
  private blend = { t: 1 };
  private tween: gsap.core.Tween | null = null;
  private tmp = new Vector3();
  private euler = new Euler(0, 0, 0, 'ZXY');
  private q = new Quaternion();

  constructor() {
    super();
    this.follow.add(this.wrist);
    this.palmAnchor.position.set(0, 0.55, 1.35);
    this.wrist.add(this.palmAnchor);
  }

  /** Subclasses call this once their joints are in place. */
  protected start(): void {
    this.copyPose(COMPILED.idle, this.cur);
    this.apply();
  }

  setPose(name: PoseName, duration = 0.8): void {
    this.tween?.kill();
    this.copyPose(this.cur, this.from);
    this.to = COMPILED[name];
    if (duration <= 0) {
      this.blend.t = 1;
      this.lerpInto(1);
      return;
    }
    this.blend.t = 0;
    this.tween = gsap.to(this.blend, {
      t: 1,
      duration,
      onUpdate: () => this.lerpInto(this.blend.t),
    });
  }

  setGrip(t: number): void {
    this.tween?.kill();
    this.tween = null;
    this.to = COMPILED.grip;
    const a = COMPILED.offer;
    const b = COMPILED.grip;
    this.cur.quat.slerpQuaternions(a.quat, b.quat, t);
    for (let i = 0; i < POSE_LEN; i++) {
      this.cur.values[i] = MathUtils.lerp(a.values[i] ?? 0, b.values[i] ?? 0, t);
    }
  }

  setGlow(v: number): void {
    this.rim.value = 0.18 + v;
  }

  override update(dt: number, pointer: PointerState): void {
    super.update(dt, pointer);
    this.apply();
  }

  private lerpInto(t: number): void {
    this.cur.quat.slerpQuaternions(this.from.quat, this.to.quat, t);
    for (let i = 0; i < POSE_LEN; i++) {
      this.cur.values[i] = MathUtils.lerp(this.from.values[i] ?? 0, this.to.values[i] ?? 0, t);
    }
  }

  private copyPose(src: CompiledPose, dst: CompiledPose): void {
    dst.quat.copy(src.quat);
    dst.values.set(src.values);
  }

  private bend(j: PoseJoint, x: number, y: number, z: number): void {
    const d = MathUtils.DEG2RAD;
    this.q.setFromEuler(this.euler.set(x * d, y * d, z * d));
    j.bone.quaternion.copy(j.left).multiply(this.q).multiply(j.right);
  }

  /** Writes the current pose vector onto the joints. */
  private apply(): void {
    const v = this.cur.values;
    const breath = this.motion ? Math.sin(this.time * 1.25) * 1.2 : 0;

    this.wrist.quaternion.copy(this.cur.quat);
    // Re-centre so every pose rotates around the hand's visual mass, not the wrist.
    this.tmp.copy(MASS_CENTER).applyQuaternion(this.cur.quat).negate();
    this.wrist.position.set(
      this.tmp.x + (v[0] ?? 0),
      this.tmp.y + (v[1] ?? 0),
      this.tmp.z + (v[2] ?? 0),
    );

    this.fingers.forEach((joints, i) => {
      const o = 4 + i * 4;
      const [a, b, c] = joints;
      this.bend(a, (v[o + 1] ?? 0) + breath, 0, v[o] ?? 0);
      this.bend(b, (v[o + 2] ?? 0) + breath * 0.6, 0, 0);
      this.bend(c, v[o + 3] ?? 0, 0, 0);
    });

    if (!this.thumb) return;
    const t = 4 + FINGERS.length * 4;
    const [cmc, mcp, ip] = this.thumb;
    this.bend(cmc, v[t] ?? 0, v[t + 1] ?? 0, v[t + 2] ?? 0);
    this.bend(mcp, v[t + 3] ?? 0, 0, v[t + 4] ?? 0);
    this.bend(ip, v[t + 5] ?? 0, 0, 0);
  }
}

class ProceduralHand extends PosedHand {
  readonly hitTargets: Object3D[] = [];
  protected rim: { value: number };

  constructor() {
    super();
    const rig = buildHandRig();
    const { material, rim } = createHandMaterial({ detail: true, creases: rig.creases });
    this.rim = rim;

    this.fingers = rig.fingers.map((f) => f.map(plainJoint) as Chain);
    this.thumb = rig.thumb.map(plainJoint) as Chain;
    const skin = new SkinnedMesh(rig.skin, material);
    const nails = new SkinnedMesh(rig.nails, createNailMaterial(rim));
    skin.add(rig.root);
    this.wrist.add(skin, nails);
    // Bind in the rest pose; both meshes share one skeleton.
    this.object.updateMatrixWorld(true);
    const skeleton = new Skeleton(rig.bones);
    skin.bind(skeleton);
    nails.bind(skeleton, skin.bindMatrix);
    // Bones move the vertices on the GPU, so rest-pose bounds are meaningless.
    skin.frustumCulled = nails.frustumCulled = false;

    this.hitTargets.push(addPalmHitTarget(this.wrist));
    this.start();
  }
}

/** Generous invisible proxy: "anywhere on the palm" should not need precision. */
export function addPalmHitTarget(wrist: Object3D): Object3D {
  const hit = new Mesh(new BoxGeometry(1.25, 1.9, 0.7), new MeshBasicMaterial({ visible: false }));
  hit.position.set(0, 0.95, 0);
  wrist.add(hit);
  return hit;
}

async function hasModel(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    // Vite's dev server answers missing files with index.html, so check the type too.
    return res.ok && !(res.headers.get('content-type') ?? '').includes('text/html');
  } catch {
    return false;
  }
}

/** The rigged model in /models/hand.glb; the procedural hand if it can't load. */
export async function createHand(onProgress: (p: number) => void = () => {}): Promise<Hand> {
  const url = '/models/hand.glb';
  if (await hasModel(url)) {
    try {
      const { loadRiggedHand } = await import('./RiggedHand');
      return await loadRiggedHand(url, onProgress);
    } catch (err) {
      console.warn('[hand] hand.glb failed to load, using the procedural hand', err);
    }
  }
  onProgress(1);
  return new ProceduralHand();
}
