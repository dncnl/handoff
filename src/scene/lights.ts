import {
  DirectionalLight,
  Group,
  HemisphereLight,
  PMREMGenerator,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { gsap } from 'gsap';
import type { ScenePalette } from './palette';

/**
 * Soft studio rig for the skin: warm key from upper left, cool low fill, and a
 * back light that rims the fingers. Paper gets more ambient than night.
 */
export class Lights {
  readonly group = new Group();
  readonly environment: Texture;
  private hemi = new HemisphereLight('#fff4e8', '#3a2c24', 1);
  private key = new DirectionalLight('#fff1e2', 1);
  private fill = new DirectionalLight('#c9d6ff', 1);
  private back = new DirectionalLight('#ffe2c4', 1);

  constructor(gl: WebGLRenderer, palette: ScenePalette) {
    this.key.position.set(-3, 4, 5);
    this.fill.position.set(4, -1.5, 3);
    this.back.position.set(2.5, 3, -4);
    this.group.add(this.hemi, this.key, this.fill, this.back);

    const pmrem = new PMREMGenerator(gl);
    this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.setPalette(palette, 0);
  }

  setPalette(p: ScenePalette, duration: number): void {
    const to = p.light
      ? { hemi: 1.3, key: 2.4, fill: 0.5, back: 1.2 }
      : { hemi: 0.75, key: 2.4, fill: 0.35, back: 2.0 };
    const set = (l: { intensity: number }, v: number) =>
      duration > 0 ? gsap.to(l, { intensity: v, duration }) : (l.intensity = v);
    set(this.hemi, to.hemi);
    set(this.key, to.key);
    set(this.fill, to.fill);
    set(this.back, to.back);
  }
}
