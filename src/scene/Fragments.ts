import {
  Color,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
  type Camera,
  type IUniform,
} from 'three';
import { gsap } from 'gsap';
import { D, EASE_GLSL } from '../core/ease';
import { tweenColor, type ScenePalette } from './palette';

const COLS = 15;
const ROWS = 8;
export const FRAGMENT_COUNT = COLS * ROWS;
const SIZE = new Vector2(2.1, 1.2);

// All motion lives in the vertex shader: one draw call, zero per-frame CPU work per tile.
const vert = /* glsl */ `
${EASE_GLSL}
attribute vec2 aCell;
attribute vec3 aFar;
attribute vec3 aCloud;
attribute vec4 aRand;
uniform float uTime;
uniform float uIn;
uniform float uProgress;
uniform float uFuse;
uniform float uFlip;
uniform vec2 uSize;
uniform vec2 uCell;
varying vec2 vScreenUv;
varying vec2 vTileUv;
varying float vSettle;
varying float vAlpha;
varying float vFlip;

mat3 rotAxis(vec3 a, float t) {
  float s = sin(t), c = cos(t), o = 1.0 - c;
  return mat3(
    a.x*a.x*o + c,     a.y*a.x*o + a.z*s, a.z*a.x*o - a.y*s,
    a.x*a.y*o - a.z*s, a.y*a.y*o + c,     a.z*a.y*o + a.x*s,
    a.x*a.z*o + a.y*s, a.y*a.z*o - a.x*s, a.z*a.z*o + c
  );
}

void main() {
  float delay = aRand.x;
  float tIn = easeCurve(clamp((uIn - delay * 0.5) / 0.5, 0.0, 1.0));
  // Centre-out stagger reads as the screen "growing" from the palm.
  float order = mix(delay, length(aCell - 0.5) * 1.3, 0.6);
  float tAs = easeCurve(clamp((uProgress - order * 0.45) / 0.55, 0.0, 1.0));

  float ang = uTime * (0.06 + aRand.y * 0.1);
  float ca = cos(ang), sa = sin(ang);
  vec3 cloud = vec3(ca * aCloud.x - sa * aCloud.z, aCloud.y, sa * aCloud.x + ca * aCloud.z);
  cloud.y += sin(uTime * 0.7 + aRand.z * 6.2831) * 0.06;

  vec3 from = mix(aFar, cloud, tIn);
  vec3 target = vec3((aCell - 0.5) * uSize, 0.0);
  vec3 pos = mix(from, target, tAs);
  pos.z += sin(tAs * 3.14159) * 0.4 * (aRand.w - 0.35);

  vec3 axis = normalize(aRand.yzw * 2.0 - 1.0 + vec3(0.001));
  float spin = (1.0 - tAs) * (2.4 + aRand.y * 3.0 + uTime * 0.5 * aRand.z);

  // Card-flip wave sweeping left to right when the screen content changes.
  float phase = aCell.x * 0.7 + aCell.y * 0.15;
  float f = easeCurve(clamp(uFlip * 1.85 - phase, 0.0, 1.0));
  vFlip = f;

  float gap = mix(0.78, 1.004, uFuse * tAs);
  vec3 local = vec3(position.xy * uCell * gap * mix(0.6, 1.0, tAs), 0.0);
  local = rotAxis(vec3(0.0, 1.0, 0.0), f * 3.14159) * local;
  local = rotAxis(axis, spin) * local;

  // Past 90 degrees we see the tile's back; mirror its UVs so content isn't reversed.
  float mx = cos(f * 3.14159) < 0.0 ? -1.0 : 1.0;
  vScreenUv = aCell + vec2(position.x * mx, position.y) * (uCell / uSize) * gap;
  vTileUv = uv;
  vSettle = tAs;
  vAlpha = tIn;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos + local, 1.0);
}
`;

const frag = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uTint;
uniform float uTime;
uniform float uFuse;
uniform float uPulse;
uniform float uVisible;
uniform float uMode;
uniform float uModePrev;
uniform vec2 uSize;
varying vec2 vScreenUv;
varying vec2 vTileUv;
varying float vSettle;
varying float vAlpha;
varying float vFlip;

float sdBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float fill(float d) { float w = fwidth(d); return 1.0 - smoothstep(-w, w, d); }
float stroke(float d, float t) { return fill(abs(d) - t); }

// Abstract glyphs for each kind of work. Decoration only: the words are HTML.
float pattern(float mode, vec2 uv) {
  vec2 a = vec2(uSize.x / uSize.y, 1.0);
  vec2 p = uv * a;
  float v = 0.0;
  if (mode < -0.5) {
    v = 0.25 + 0.1 * sin(uv.y * 80.0 - uTime * 2.0);
  } else if (mode < 0.5) {
    // Web: browser chrome, hero block, sidebar rows.
    v += 0.5 * fill(sdBox(p - vec2(0.5, 0.9) * a, vec2(0.46 * a.x, 0.035), 0.02));
    for (int i = 0; i < 3; i++) v += fill(length(p - vec2(0.07 + float(i) * 0.035, 0.9) * a) - 0.011);
    v += 0.8 * fill(sdBox(p - vec2(0.33, 0.69) * a, vec2(0.25 * a.x, 0.11), 0.03));
    for (int i = 0; i < 3; i++)
      v += 0.6 * fill(sdBox(p - vec2(0.76, 0.76 - float(i) * 0.08) * a, vec2(0.16 * a.x, 0.022), 0.02));
  } else if (mode < 1.5) {
    // Machine learning: noisy scatter around a fitted curve.
    float curve = 0.62 + 0.14 * sin(uv.x * 5.2 + 0.6);
    v += stroke(uv.y - curve, 0.006);
    vec2 cell = floor(uv * vec2(28.0, 12.0));
    vec2 jitter = fract(sin(vec2(dot(cell, vec2(12.9, 78.2)), dot(cell, vec2(39.3, 11.1)))) * 43758.5);
    vec2 c = (cell + jitter) / vec2(28.0, 12.0);
    float cc = 0.62 + 0.14 * sin(c.x * 5.2 + 0.6);
    float near = step(abs(c.y - cc), 0.09) * step(0.45, c.y);
    v += near * 0.9 * fill(length((uv - c) * a) - 0.012);
  } else if (mode < 2.5) {
    // Interfaces: a phone frame beside a grid of app tiles.
    v += stroke(sdBox(p - vec2(0.22, 0.68) * a, vec2(0.08 * a.x, 0.22), 0.04), 0.006);
    for (int i = 0; i < 6; i++) {
      vec2 g = vec2(float(i - (i / 3) * 3), float(i / 3));
      v += 0.75 * fill(sdBox(p - vec2(0.5 + g.x * 0.16, 0.78 - g.y * 0.2) * a, vec2(0.06 * a.x, 0.07), 0.025));
    }
  } else {
    // Documentation: paragraph lines and a two-box architecture sketch.
    for (int i = 0; i < 5; i++) {
      float len = 0.18 + 0.12 * fract(float(i) * 0.618);
      v += 0.6 * fill(sdBox(p - vec2(0.06 + len * 0.5, 0.86 - float(i) * 0.075) * a, vec2(len * 0.5 * a.x, 0.012), 0.01));
    }
    v += stroke(sdBox(p - vec2(0.68, 0.8) * a, vec2(0.09 * a.x, 0.06), 0.015), 0.005);
    v += stroke(sdBox(p - vec2(0.68, 0.56) * a, vec2(0.09 * a.x, 0.06), 0.015), 0.005);
    v += fill(sdBox(p - vec2(0.68, 0.68) * a, vec2(0.003, 0.06), 0.0));
  }
  // Keep the lower band calm: that's where the HTML caption sits.
  return clamp(v, 0.0, 1.0) * smoothstep(0.38, 0.5, uv.y);
}

void main() {
  vec2 tp = vTileUv - 0.5;
  float tile = fill(sdBox(tp, vec2(0.5), mix(0.2, 0.0, uFuse)));
  float tileEdge = stroke(sdBox(tp, vec2(0.46), 0.18), 0.03) * (1.0 - uFuse);

  vec2 sp = (vScreenUv - 0.5) * uSize;
  float sd = sdBox(sp, uSize * 0.5, 0.11);
  float screen = fill(sd);
  float border = stroke(sd + 0.012, 0.006) * uFuse;

  float content = vFlip < 0.5 ? pattern(uModePrev, vScreenUv) : pattern(uMode, vScreenUv);
  // Brief flash on each tile as it lands.
  float land = smoothstep(0.8, 0.96, vSettle) * (1.0 - smoothstep(0.96, 1.0, vSettle));

  vec3 col = uTint * (0.35 + 0.65 * vSettle);
  col += uColor * tileEdge * 0.9;
  col += uColor * content * 0.55 * uFuse;
  col += uColor * border * 0.9;
  col += uColor * (uPulse * 0.8 + land * 0.15);
  // Vertical sheen so the glass doesn't read as a flat card.
  col += uColor * 0.06 * smoothstep(0.2, 1.0, vScreenUv.y);

  float alpha = tile * screen * vAlpha * uVisible * mix(0.55, 1.0, vSettle);
  gl_FragColor = vec4(col, alpha);
}
`;

export interface FragmentUniforms {
  uTime: IUniform<number>;
  uIn: IUniform<number>;
  uProgress: IUniform<number>;
  uFuse: IUniform<number>;
  uFlip: IUniform<number>;
  uPulse: IUniform<number>;
  uVisible: IUniform<number>;
  uMode: IUniform<number>;
  uModePrev: IUniform<number>;
}

/**
 * ~120 tiles that drift in from a scatter, hover as a loose cloud, and snap
 * into a rounded-rect screen. Tiles then fuse (gaps close) into one surface.
 */
export class Fragments {
  readonly group = new Group();
  readonly u: FragmentUniforms;
  private mesh: InstancedMesh;
  private target = new Vector3();
  private flipTween: gsap.core.Tween | null = null;
  private placed = false;

  constructor(palette: ScenePalette) {
    const geo = new PlaneGeometry(1, 1);
    const cell = new Float32Array(FRAGMENT_COUNT * 2);
    const far = new Float32Array(FRAGMENT_COUNT * 3);
    const cloud = new Float32Array(FRAGMENT_COUNT * 3);
    const rand = new Float32Array(FRAGMENT_COUNT * 4);
    // Seeded so the scatter is identical on every visit.
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

    for (let i = 0; i < FRAGMENT_COUNT; i++) {
      cell[i * 2] = ((i % COLS) + 0.5) / COLS;
      cell[i * 2 + 1] = (Math.floor(i / COLS) + 0.5) / ROWS;

      const th = rnd() * Math.PI * 2;
      const r = 3.2 + rnd() * 2.5;
      far.set([Math.cos(th) * r, (rnd() - 0.5) * 3.5, Math.sin(th) * r * 0.6 - 1], i * 3);

      const ct = rnd() * Math.PI * 2;
      const cr = 1.3 + rnd() * 1.1;
      cloud.set([Math.cos(ct) * cr, (rnd() - 0.5) * 1.6, Math.sin(ct) * cr * 0.55], i * 3);

      rand.set([rnd(), rnd(), rnd(), rnd()], i * 4);
    }
    geo.setAttribute('aCell', new InstancedBufferAttribute(cell, 2));
    geo.setAttribute('aFar', new InstancedBufferAttribute(far, 3));
    geo.setAttribute('aCloud', new InstancedBufferAttribute(cloud, 3));
    geo.setAttribute('aRand', new InstancedBufferAttribute(rand, 4));

    this.u = {
      uTime: { value: 0 },
      uIn: { value: 0 },
      uProgress: { value: 0 },
      uFuse: { value: 0 },
      uFlip: { value: 0 },
      uPulse: { value: 0 },
      uVisible: { value: 1 },
      uMode: { value: -1 },
      uModePrev: { value: -1 },
    };
    const mat = new ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      // Normal, not additive: an ink slab has to stay visible on cream paper.
      blending: NormalBlending,
      side: DoubleSide,
      uniforms: {
        ...this.u,
        uSize: { value: SIZE },
        uCell: { value: new Vector2(SIZE.x / COLS, SIZE.y / ROWS) },
        uColor: { value: new Color() },
        uTint: { value: new Color() },
      },
    });
    this.mesh = new InstancedMesh(geo, mat, FRAGMENT_COUNT);
    // Instances move in the shader, so CPU bounds are meaningless.
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    this.setPalette(palette, 0);
  }

  setPalette(p: ScenePalette, duration: number): void {
    const m = this.mesh.material as ShaderMaterial;
    tweenColor(m.uniforms.uColor!.value as Color, p.glow, duration);
    tweenColor(m.uniforms.uTint!.value as Color, p.screen, duration);
  }

  /** Swaps the abstract glyph with a flip wave; mode -1 is the idle shimmer. */
  setMode(mode: number, instant = false): void {
    if (mode === this.u.uMode.value) return;
    this.flipTween?.kill();
    this.u.uModePrev.value = instant ? mode : this.u.uMode.value;
    this.u.uMode.value = mode;
    this.u.uFlip.value = 0;
    this.flipTween = gsap.to(this.u.uFlip, { value: 1, duration: instant ? 0 : D.l, ease: 'none' });
  }

  /** Follows the palm with a soft lag, and keeps facing the camera. */
  update(dt: number, anchor: Vector3, camera: Camera): void {
    this.u.uTime.value += dt;
    if (!this.placed) {
      this.group.position.copy(anchor);
      this.placed = true;
    }
    this.target.copy(anchor);
    this.group.position.lerp(this.target, 1 - Math.exp(-dt * 5));
    this.group.quaternion.slerp(camera.quaternion, 1 - Math.exp(-dt * 4));
  }

  private corner = new Vector3();

  /** Projected screen bounds in CSS px, for pinning HTML onto the glass. */
  screenRect(camera: Camera, w: number, h: number): { x: number; y: number; w: number; h: number } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const sx of [-0.5, 0.5]) {
      for (const sy of [-0.5, 0.5]) {
        this.corner.set(sx * SIZE.x, sy * SIZE.y, 0);
        this.group.localToWorld(this.corner).project(camera);
        const x = (this.corner.x * 0.5 + 0.5) * w;
        const y = (-this.corner.y * 0.5 + 0.5) * h;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
}
