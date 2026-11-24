import type * as THREE from 'three';

/**
 * Minimal debug HUD: FPS (0.5 s rolling window) and draw calls / triangles.
 * renderer.info.autoReset is disabled so counts cover the whole composer frame;
 * call `beginFrame()` before rendering and `endFrame()` after.
 */
export class DebugHud {
  private readonly el: HTMLDivElement;
  private frames = 0;
  private lastSample = performance.now();
  private fps = 0;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    renderer.info.autoReset = false;
    this.el = document.createElement('div');
    Object.assign(this.el.style, {
      position: 'fixed', top: '8px', left: '8px', padding: '6px 9px',
      font: '11px/1.35 ui-monospace, Menlo, monospace', color: '#cfe3ff',
      background: 'rgba(8,10,16,0.72)', border: '1px solid rgba(120,150,200,0.25)',
      borderRadius: '4px', pointerEvents: 'none', whiteSpace: 'pre', zIndex: '10',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.el);
  }

  beginFrame(): void {
    this.renderer.info.reset();
  }

  endFrame(): void {
    this.frames++;
    const now = performance.now();
    const dt = now - this.lastSample;
    if (dt >= 500) {
      this.fps = (this.frames * 1000) / dt;
      this.frames = 0;
      this.lastSample = now;
      const r = this.renderer.info.render;
      this.el.textContent =
        `FPS   ${this.fps.toFixed(0)}\n` +
        `draws ${r.calls}\n` +
        `tris  ${r.triangles.toLocaleString()}`;
    }
  }

  setVisible(v: boolean): void {
    this.el.style.display = v ? 'block' : 'none';
  }
}
