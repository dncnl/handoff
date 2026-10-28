import {
  Color,
  DoubleSide,
  MeshPhysicalMaterial,
  ShaderChunk,
  type IUniform,
  type WebGLProgramParametersWithUniforms,
} from 'three';

/** Shared by every hand material so a theme change recolours whichever hand is live. */
export const handRimColor: IUniform<Color> = { value: new Color('#e0b366') };

/** Warm red that light picks up as it scatters under the skin. */
const scatter: IUniform<Color> = { value: new Color(0.55, 0.16, 0.08) };

// Wrap lighting: light bleeds past the terminator, tinted red, the cheap tell of skin.
const skinLights = ShaderChunk.lights_physical_pars_fragment.replace(
  'vec3 irradiance = dotNL * directLight.color;',
  /* glsl */ `vec3 irradiance = dotNL * directLight.color;
	float wrapNL = saturate( ( dot( geometryNormal, directLight.direction ) + 0.45 ) / 1.45 );
	irradiance += uScatter * directLight.color * max( 0.0, wrapNL - dotNL );`,
);

const detailVertex = /* glsl */ `
attribute vec3 aDetail;
attribute float aFade;
varying vec3 vDetail;
varying vec3 vRest;
varying float vFade;
`;

const detailFragment = /* glsl */ `
varying vec3 vDetail;
varying vec3 vRest;
varying float vFade;

float hHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hHash(i), hHash(i + vec3(1, 0, 0)), f.x), mix(hHash(i + vec3(0, 1, 0)), hHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hHash(i + vec3(0, 0, 1)), hHash(i + vec3(1, 0, 1)), f.x), mix(hHash(i + vec3(0, 1, 1)), hHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}
float line3(vec2 p, vec2 a, vec2 b, vec2 c) { return min(sdSeg(p, a, b), sdSeg(p, b, c)); }

// Height field in rest-pose units; creases also return a cavity term for shading.
float skinHeight(out float cavity) {
  vec3 p = vRest;
  float side = vDetail.y;
  float region = vDetail.z;
  float h = (vnoise(p * 55.0) - 0.5) * 0.0011 + (vnoise(p * 21.0) - 0.5) * 0.002;
  cavity = 0.0;
  float palmSide = smoothstep(0.25, 0.85, side);
  float back = smoothstep(0.25, 0.85, -side);
  if (region > 0.5) {
    float jd = vDetail.x;
    float crease = exp(-pow(jd / 0.02, 2.0)) * palmSide;
    h -= crease * 0.0025;
    cavity += crease * 0.6;
    // Wrinkles bunch over the knuckles on the back.
    float env = exp(-pow(jd / 0.045, 2.0)) * back;
    float lines = 0.5 + 0.5 * sin(jd * 170.0 + vnoise(p * 22.0) * 2.5);
    h -= env * lines * 0.0018;
    cavity += env * lines * 0.3;
  } else {
    vec2 q = p.xy;
    float life = min(line3(q, vec2(0.34, 0.64), vec2(0.2, 0.52), vec2(0.13, 0.34)), sdSeg(q, vec2(0.13, 0.34), vec2(0.19, 0.02)));
    float head = line3(q, vec2(0.36, 0.63), vec2(0.06, 0.55), vec2(-0.27, 0.46));
    float heart = line3(q, vec2(-0.43, 0.78), vec2(-0.08, 0.8), vec2(0.26, 0.88));
    float wrist = min(abs(q.y + 0.06), abs(q.y + 0.13)) + max(0.0, abs(q.x) - 0.22);
    float d = min(min(life, head), min(heart, wrist));
    // Depth wanders along each line so it reads as skin, not as a drawing.
    float depth = 0.55 + 0.45 * vnoise(p * 11.0);
    float crease = exp(-pow(d / 0.014, 2.0)) * palmSide * depth;
    float minor = exp(-pow(abs(sin(q.x * 30.0 + q.y * 17.0 + vnoise(p * 7.0) * 4.0)) / 0.08, 2.0));
    minor *= 0.3 * palmSide * smoothstep(0.0, 0.3, q.y);
    h -= crease * 0.005 + minor * 0.0008;
    cavity += crease * 0.8;
  }
  return h;
}

float fadeHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
`;

export interface HandMaterial {
  material: MeshPhysicalMaterial;
  rim: IUniform<number>;
}

function injectRim(shader: WebGLProgramParametersWithUniforms, rim: IUniform<number>): void {
  shader.uniforms.uRim = rim;
  shader.uniforms.uRimColor = handRimColor;
  shader.uniforms.uScatter = scatter;
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      'uniform float uRim;\nuniform vec3 uRimColor;\nuniform vec3 uScatter;\n#include <common>',
    )
    .replace('#include <lights_physical_pars_fragment>', skinLights)
    .replace(
      '#include <opaque_fragment>',
      /* glsl */ `
      // The renderer has no tone mapping; give the skin a soft shoulder so highlights roll off.
      outgoingLight = ( outgoingLight * ( 2.51 * outgoingLight + 0.03 ) ) / ( outgoingLight * ( 2.43 * outgoingLight + 0.59 ) + 0.14 );
      float fres = 1.0 - saturate( dot( normal, geometryViewDir ) );
      outgoingLight += uRimColor * pow( fres, 2.6 ) * uRim;
      #include <opaque_fragment>`,
    );
}

/**
 * Skin: physical shading with sheen, wrap-lit subsurface tint and a fresnel rim
 * (what bloom catches during the pulse). With `detail`, the procedural hand's
 * creases, wrinkles and pores are bump-mapped from its aDetail attribute, and the
 * forearm dissolves out through dithering.
 */
export function createHandMaterial(detail = false): HandMaterial {
  const rim: IUniform<number> = { value: 0.18 };
  const material = new MeshPhysicalMaterial({
    color: new Color('#c4927a'),
    vertexColors: detail,
    roughness: 0.56,
    specularIntensity: 0.55,
    sheen: 0.3,
    sheenRoughness: 0.55,
    sheenColor: new Color('#ffb59c'),
  });
  material.onBeforeCompile = (shader) => {
    injectRim(shader, rim);
    if (!detail) return;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `${detailVertex}\n#include <common>`)
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvRest = position;\nvDetail = aDetail;\nvFade = aFade;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${detailFragment}`)
      .replace(
        '#include <clipping_planes_fragment>',
        '#include <clipping_planes_fragment>\nif ( vFade < 0.999 && vFade < fadeHash( gl_FragCoord.xy ) ) discard;',
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
        {
          float cavity;
          float h = skinHeight( cavity );
          vec3 dpdx = dFdx( -vViewPosition );
          vec3 dpdy = dFdy( -vViewPosition );
          vec3 r1 = cross( dpdy, normal );
          vec3 r2 = cross( normal, dpdx );
          float det = dot( dpdx, r1 ) * faceDirection;
          vec3 grad = sign( det ) * ( dFdx( h ) * r1 + dFdy( h ) * r2 );
          // Cap the tilt: sub-pixel creases otherwise alias into sparkles.
          grad *= min( 1.0, 0.45 * abs( det ) / max( length( grad ), 1e-8 ) );
          normal = normalize( abs( det ) * normal - grad );
          diffuseColor.rgb *= 1.0 - 0.2 * saturate( cavity );
        }`,
      );
  };
  // Distinct program key, since the detail variant rewrites more of the shader.
  material.customProgramCacheKey = () => (detail ? 'skin-detail' : 'skin');
  return { material, rim };
}

/** Nails: glossier, paler and slightly translucent at the free edge. */
export function createNailMaterial(rim: IUniform<number>): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({
    color: new Color('#d4a597'),
    roughness: 0.38,
    clearcoat: 0.3,
    clearcoatRoughness: 0.35,
    side: DoubleSide,
  });
  material.onBeforeCompile = (shader) => injectRim(shader, rim);
  material.customProgramCacheKey = () => 'nail';
  return material;
}
