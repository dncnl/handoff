import { AnimationMixer, Object3D, type AnimationAction, type Mesh } from 'three';
import type { PointerState } from '../core/Input';
import { HandBase, POSES, type Hand, type PoseName } from './Hand';
import { createHandMaterial } from './handMaterial';

/** Real model: /models/hand.glb with one clip per pose name. Split out so the
 * animation system and loaders only download when a model actually exists. */
class GltfHand extends HandBase {
  readonly hitTargets: Object3D[] = [];
  readonly palmAnchor = new Object3D();
  private actions = new Map<PoseName, AnimationAction>();
  private current: AnimationAction | null = null;
  private rim: { value: number };

  constructor(
    root: Object3D,
    private mixer: AnimationMixer,
    clips: Map<string, AnimationAction>,
  ) {
    super();
    const { material, rim } = createHandMaterial();
    this.rim = rim;
    root.traverse((o) => {
      if ((o as Mesh).isMesh) {
        (o as Mesh).material = material;
        this.hitTargets.push(o);
      }
    });
    const anchor = root.getObjectByName('palmAnchor');
    if (anchor) anchor.add(this.palmAnchor);
    else {
      this.palmAnchor.position.set(0, 0.6, 1.2);
      root.add(this.palmAnchor);
    }
    this.follow.add(root);
    for (const name of POSES) {
      const a = clips.get(name);
      if (a) this.actions.set(name, a);
    }
    this.setPose('idle', 0);
  }

  setPose(name: PoseName, duration = 0.8): void {
    const next = this.actions.get(name);
    if (!next || next === this.current) return;
    this.actions.forEach((a) => a !== next && a !== this.current && a.stop());
    next.reset().setEffectiveWeight(1).play();
    if (this.current && duration > 0) this.current.crossFadeTo(next, duration, false);
    else this.current?.stop();
    this.current = next;
  }

  setGrip(t: number): void {
    const offer = this.actions.get('offer');
    const grip = this.actions.get('grip');
    if (!offer || !grip) return;
    this.actions.forEach((a) => a !== offer && a !== grip && a.stop());
    offer.play().setEffectiveWeight(1 - t);
    grip.play().setEffectiveWeight(t);
    this.current = t > 0.5 ? grip : offer;
  }

  setGlow(v: number): void {
    this.rim.value = 0.18 + v;
  }

  override update(dt: number, pointer: PointerState): void {
    super.update(dt, pointer);
    this.mixer.update(dt);
  }
}

export async function loadGltfHand(url: string, onProgress: (p: number) => void): Promise<Hand> {
  // Loaders are split out: with no hand.glb they are never downloaded.
  const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/loaders/DRACOLoader.js'),
  ]);
  const draco = new DRACOLoader();
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const gltf = await loader.loadAsync(url, (e) => e.total && onProgress(e.loaded / e.total));
  draco.dispose();
  const mixer = new AnimationMixer(gltf.scene);
  const actions = new Map<string, AnimationAction>();
  gltf.animations.forEach((clip) => actions.set(clip.name, mixer.clipAction(clip)));
  return new GltfHand(gltf.scene, mixer, actions);
}
