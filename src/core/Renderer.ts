import {
  NoToneMapping,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Vector2,
  WebGLRenderer,
} from 'three';
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import type { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export type QualityTier = 'high' | 'low';

const FPS_FLOOR = 50;
const FPS_GRACE_S = 2;

function detectInitialTier(): QualityTier {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 768;
  return coarse && small ? 'low' : 'high';
}

/**
 * Owns the GL context, camera framing and the quality tier.
 * Tier only ever steps down: flapping between tiers is worse than staying low.
 */
export class Renderer {
  readonly gl: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(32, 1, 0.1, 60);
  readonly size = new Vector2(1, 1);
  tier: QualityTier;

  /** Lens shift in fractions of the viewport, so the subject can sit off-centre without perspective skew. */
  readonly framing = { x: 0, y: 0 };

  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private tierListeners = new Set<(t: QualityTier) => void>();
  private resizeListeners = new Set<(w: number, h: number) => void>();
  private lowFor = 0;
  private fpsEma = 60;
  private warmup = 1.5;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.tier = detectInitialTier();
    this.gl = new WebGLRenderer({
      canvas,
      antialias: this.tier === 'high',
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.gl.outputColorSpace = SRGBColorSpace;
    this.gl.toneMapping = NoToneMapping;
    this.camera.position.set(0, 0.35, 8);
    this.camera.lookAt(0, 0.1, 0);

    window.addEventListener('resize', this.resize);
    this.resize();
  }

  get dpr(): number {
    return Math.min(window.devicePixelRatio || 1, this.tier === 'high' ? 2 : 1.5);
  }

  /** Bloom is code-split: low-tier devices never download it. */
  async enablePost(): Promise<void> {
    if (this.tier !== 'high' || this.composer) return;
    const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] =
      await Promise.all([
        import('three/examples/jsm/postprocessing/EffectComposer.js'),
        import('three/examples/jsm/postprocessing/RenderPass.js'),
        import('three/examples/jsm/postprocessing/UnrealBloomPass.js'),
        import('three/examples/jsm/postprocessing/OutputPass.js'),
      ]);
    const composer = new EffectComposer(this.gl);
    composer.addPass(new RenderPass(this.scene, this.camera));
    // Half-res bloom: the glow is soft anyway and it halves the blur cost.
    const bloom = new UnrealBloomPass(
      new Vector2(this.size.x / 2, this.size.y / 2),
      0.55,
      0.6,
      0.62,
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    this.composer = composer;
    this.bloom = bloom;
    this.resize();
  }

  setBloomStrength(s: number): void {
    if (this.bloom) this.bloom.strength = s;
  }

  onTier(cb: (t: QualityTier) => void): void {
    this.tierListeners.add(cb);
  }

  onResize(cb: (w: number, h: number) => void): void {
    this.resizeListeners.add(cb);
    cb(this.size.x, this.size.y);
  }

  /** Feeds the FPS watchdog; drops to low tier after sustained slow frames. */
  sample(dt: number): void {
    if (document.hidden || dt <= 0) return;
    if (this.warmup > 0) {
      this.warmup -= dt;
      return;
    }
    const fps = 1 / dt;
    this.fpsEma += (fps - this.fpsEma) * Math.min(1, dt * 4);
    if (this.tier === 'high' && this.fpsEma < FPS_FLOOR) {
      this.lowFor += dt;
      if (this.lowFor >= FPS_GRACE_S) this.downgrade();
    } else {
      this.lowFor = 0;
    }
  }

  get fps(): number {
    return this.fpsEma;
  }

  downgrade(): void {
    if (this.tier === 'low') return;
    this.tier = 'low';
    this.composer?.dispose();
    this.composer = null;
    this.bloom = null;
    this.resize();
    this.tierListeners.forEach((cb) => cb('low'));
  }

  render(): void {
    if (this.composer) this.composer.render();
    else this.gl.render(this.scene, this.camera);
  }

  /** Applies lens shift; called every frame so tweened framing stays live. */
  applyFraming(): void {
    const { x: w, y: h } = this.size;
    this.camera.setViewOffset(w, h, -this.framing.x * w, this.framing.y * h, w, h);
  }

  private resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.size.set(w, h);
    this.gl.setPixelRatio(this.dpr);
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Portrait screens need more vertical room for the hand to fit.
    this.camera.fov = w / h < 0.8 ? 44 : 32;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(this.dpr);
      this.composer.setSize(w, h);
      this.bloom?.resolution.set(w / 2, h / 2);
    }
    this.resizeListeners.forEach((cb) => cb(w, h));
  };
}
