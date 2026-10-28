import { CanvasTexture, Color, MeshMatcapMaterial, SRGBColorSpace, type IUniform } from 'three';

/** Paints a clay-with-a-hint-of-chrome matcap so no image asset is needed. */
function createMatcap(size = 256): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  const s = size;

  g.fillStyle = '#1d1a17';
  g.fillRect(0, 0, s, s);

  // Key light from upper left; the long falloff is what makes it read as clay.
  const body = g.createRadialGradient(s * 0.4, s * 0.36, s * 0.02, s * 0.5, s * 0.5, s * 0.52);
  body.addColorStop(0, '#f6f1e8');
  body.addColorStop(0.35, '#d9d0c2');
  body.addColorStop(0.7, '#8c8276');
  body.addColorStop(0.92, '#3c3630');
  body.addColorStop(1, '#1d1a17');
  g.fillStyle = body;
  g.beginPath();
  g.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
  g.fill();

  // A soft horizon band gives the chrome hint without going full mirror.
  g.globalCompositeOperation = 'multiply';
  const band = g.createLinearGradient(0, s * 0.5, 0, s * 0.72);
  band.addColorStop(0, 'rgba(255,255,255,1)');
  band.addColorStop(0.5, 'rgba(150,146,140,1)');
  band.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = band;
  g.fillRect(0, s * 0.5, s, s * 0.22);

  // Accent-tinted bounce from below ties the hand to the glowing screen.
  g.globalCompositeOperation = 'screen';
  const bounce = g.createRadialGradient(s * 0.55, s * 0.98, 0, s * 0.55, s * 0.98, s * 0.42);
  bounce.addColorStop(0, 'rgba(160,190,90,0.45)');
  bounce.addColorStop(1, 'rgba(160,190,90,0)');
  g.fillStyle = bounce;
  g.fillRect(0, 0, s, s);

  const spec = g.createRadialGradient(s * 0.33, s * 0.27, 0, s * 0.33, s * 0.27, s * 0.13);
  spec.addColorStop(0, 'rgba(255,255,255,0.9)');
  spec.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = spec;
  g.fillRect(0, 0, s, s);

  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export interface HandMaterial {
  material: MeshMatcapMaterial;
  rim: IUniform<number>;
}

/** Matcap plus a fresnel rim; the rim is what bloom catches during the pulse. */
export function createHandMaterial(): HandMaterial {
  const rim: IUniform<number> = { value: 0.18 };
  const rimColor: IUniform<Color> = { value: new Color('#d9ff8a') };
  const material = new MeshMatcapMaterial({ matcap: createMatcap() });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = rim;
    shader.uniforms.uRimColor = rimColor;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        'uniform float uRim;\nuniform vec3 uRimColor;\n#include <common>',
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
        float fres = 1.0 - clamp(dot(normal, viewDir), 0.0, 1.0);
        outgoingLight += uRimColor * pow(fres, 2.6) * uRim;
        #include <opaque_fragment>`,
      );
  };
  return { material, rim };
}
