import type { Renderer } from '../core/Renderer';

/** Dev-only overlay, toggled with F. Tree-shaken from production by the DEV guard in main. */
export class FpsMeter {
  private el = document.createElement('pre');
  private on = false;
  private acc = 0;
  private frames = 0;

  constructor(private renderer: Renderer) {
    this.el.className = 'fps mono';
    this.el.hidden = true;
    document.body.append(this.el);
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() !== 'f' || e.metaKey || e.ctrlKey || e.altKey) return;
      this.on = !this.on;
      this.el.hidden = !this.on;
    });
  }

  update(dt: number): void {
    if (!this.on) return;
    this.acc += dt;
    this.frames++;
    if (this.acc < 0.25) return;
    const info = this.renderer.gl.info.render;
    this.el.textContent = `${Math.round(this.frames / this.acc)} fps  ${this.renderer.tier}\n${info.calls} calls  ${info.triangles} tris  dpr ${this.renderer.dpr}`;
    this.acc = 0;
    this.frames = 0;
  }
}
