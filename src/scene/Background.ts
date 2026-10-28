import { Color, Mesh, PlaneGeometry, ShaderMaterial, Vector2 } from 'three';

const vert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  // Pinned to clip space at the far plane: no camera, no culling, always behind.
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}
`;

const frag = /* glsl */ `
uniform float uTime;
uniform float uPulse;
uniform float uGrain;
uniform vec2 uRes;
uniform vec2 uFocus;
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uGlow;
varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

void main() {
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  vec2 p = (vUv - 0.5) * asp;
  vec2 f = (uFocus - 0.5) * asp;

  // Slow drifting light pool behind the subject; it reads as depth, not decoration.
  float drift = sin(uTime * 0.11) * 0.04;
  float d = length(p - f - vec2(drift, drift * 0.5));
  vec3 col = mix(uMid, uDeep, smoothstep(0.0, 1.05, d));
  // Values are linear: tiny numbers here become very visible after sRGB encoding.
  col += uGlow * (0.006 + 0.06 * uPulse) * exp(-d * d * (3.2 - 1.6 * uPulse));

  // Vertical falloff keeps the floor darker so overlay text has contrast.
  col *= mix(0.78, 1.0, smoothstep(-0.6, 0.4, p.y));

  // Multiplicative grain: additive noise in linear space blows out the darks.
  // It also dithers away gradient banding.
  float g = hash(gl_FragCoord.xy + fract(uTime * 7.0) * 113.0) - 0.5;
  col *= 1.0 + g * uGrain;

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export class Background {
  readonly mesh: Mesh;
  private mat: ShaderMaterial;

  constructor() {
    this.mat = new ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0 },
        uGrain: { value: 0.32 },
        uRes: { value: new Vector2(1, 1) },
        uFocus: { value: new Vector2(0.5, 0.52) },
        uDeep: { value: new Color('#08090c') },
        uMid: { value: new Color('#1c1f27') },
        uGlow: { value: new Color('#c8f560') },
      },
    });
    this.mesh = new Mesh(new PlaneGeometry(2, 2), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
  }

  get uniforms() {
    return this.mat.uniforms as {
      uTime: { value: number };
      uPulse: { value: number };
      uGrain: { value: number };
      uRes: { value: Vector2 };
      uFocus: { value: Vector2 };
    };
  }

  resize(w: number, h: number): void {
    this.uniforms.uRes.value.set(w, h);
  }

  update(dt: number): void {
    this.uniforms.uTime.value += dt;
  }
}
