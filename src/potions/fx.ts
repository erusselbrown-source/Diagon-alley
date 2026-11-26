/**
 * GPU-drawn, CPU-simulated particle pools: one additive (sparks, flames, magic)
 * and one alpha-blended (steam, smoke, water spray).
 */
import * as THREE from 'three';

interface P {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  r: number; g: number; b: number;
  a: number; size: number; grow: number;
  life: number; age: number; drag: number; grav: number;
}

export interface EmitOpts {
  pos: THREE.Vector3 | { x: number; y: number; z: number };
  vel?: { x: number; y: number; z: number };
  spread?: number;
  color: THREE.Color | number;
  intensity?: number;
  size?: number;
  grow?: number;
  life?: number;
  drag?: number;
  grav?: number;
  alpha?: number;
  jitter?: number;
}

const tmpC = new THREE.Color();

export class ParticlePool {
  readonly points: THREE.Points;
  private readonly ps: P[] = [];
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly siz: Float32Array;
  private readonly geo = new THREE.BufferGeometry();
  readonly material: THREE.ShaderMaterial;

  constructor(private readonly max: number, additive: boolean) {
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.siz = new Float32Array(max);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.siz, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: /* glsl */ `
        attribute vec4 aColor;
        attribute float aSize;
        uniform float uScale;
        varying vec4 vColor;
        void main() {
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: additive ? /* glsl */ `
        varying vec4 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          a *= a;
          gl_FragColor = vec4(vColor.rgb * a * vColor.a, 1.0);
        }` : /* glsl */ `
        varying vec4 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.1, d);
          gl_FragColor = vec4(vColor.rgb, a * vColor.a);
        }`,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
  }

  emit(o: EmitOpts, count = 1): void {
    const c = typeof o.color === 'number' ? tmpC.set(o.color) : tmpC.copy(o.color);
    const k = o.intensity ?? 1;
    for (let i = 0; i < count; i++) {
      if (this.ps.length >= this.max) this.ps.shift();
      const sp = o.spread ?? 0;
      const j = o.jitter ?? 0;
      this.ps.push({
        x: o.pos.x + (Math.random() - 0.5) * j, y: o.pos.y + (Math.random() - 0.5) * j * 0.5, z: o.pos.z + (Math.random() - 0.5) * j,
        vx: (o.vel?.x ?? 0) + (Math.random() - 0.5) * sp,
        vy: (o.vel?.y ?? 0) + (Math.random() - 0.5) * sp,
        vz: (o.vel?.z ?? 0) + (Math.random() - 0.5) * sp,
        r: c.r * k, g: c.g * k, b: c.b * k,
        a: o.alpha ?? 1,
        size: (o.size ?? 0.1) * (0.7 + Math.random() * 0.6),
        grow: o.grow ?? 0,
        life: (o.life ?? 1) * (0.7 + Math.random() * 0.6),
        age: 0,
        drag: o.drag ?? 0.5,
        grav: o.grav ?? 0,
      });
    }
  }

  update(dt: number): void {
    let n = 0;
    for (let i = 0; i < this.ps.length; i++) {
      const p = this.ps[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy = p.vy * d - p.grav * dt; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      this.ps[n++] = p;
    }
    this.ps.length = n;
    for (let i = 0; i < n; i++) {
      const p = this.ps[i];
      const t = p.age / p.life;
      const fade = Math.min(1, t * 8) * (1 - t) * (1 - t);
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.col[i * 4] = p.r; this.col[i * 4 + 1] = p.g; this.col[i * 4 + 2] = p.b; this.col[i * 4 + 3] = p.a * fade;
      this.siz[i] = p.size * (1 + p.grow * t);
    }
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'aColor', 'aSize']) (this.geo.getAttribute(k) as THREE.BufferAttribute).needsUpdate = true;
  }

  clear(): void { this.ps.length = 0; this.geo.setDrawRange(0, 0); }
}

/** Convenience effects on top of the two pools. */
export class Fx {
  readonly glow = new ParticlePool(2500, true);
  readonly soft = new ParticlePool(1200, false);

  constructor(scene: THREE.Scene) {
    scene.add(this.glow.points, this.soft.points);
  }

  setScale(px: number): void {
    this.glow.material.uniforms.uScale.value = px;
    this.soft.material.uniforms.uScale.value = px;
  }

  update(dt: number): void { this.glow.update(dt); this.soft.update(dt); }
  clear(): void { this.glow.clear(); this.soft.clear(); }

  flame(x: number, y: number, z: number, scale = 1): void {
    this.glow.emit({ pos: { x, y, z }, vel: { x: 0, y: 0.9 * scale, z: 0 }, spread: 0.25 * scale, jitter: 0.12 * scale, color: 0xff7a1a, intensity: 3.2, size: 0.22 * scale, grow: -0.6, life: 0.55, drag: 1.5 });
    if (Math.random() < 0.5) this.glow.emit({ pos: { x, y: y + 0.05, z }, vel: { x: 0, y: 0.7 * scale, z: 0 }, spread: 0.15, jitter: 0.06 * scale, color: 0xffd27a, intensity: 3, size: 0.12 * scale, grow: -0.5, life: 0.4, drag: 1 });
  }

  fire(x: number, y: number, z: number, k: number): void {
    for (let i = 0; i < 3; i++) this.flame(x + (Math.random() - 0.5) * 0.7, y, z + (Math.random() - 0.5) * 0.7, 1.4 * k + 0.4);
    if (Math.random() < 0.35 * k) this.soft.emit({ pos: { x, y: y + 0.6, z }, vel: { x: 0, y: 0.9, z: 0 }, spread: 0.3, jitter: 0.5, color: 0x1a1612, size: 0.6, grow: 2, life: 2, drag: 0.6, alpha: 0.55 });
    if (Math.random() < 0.3) this.glow.emit({ pos: { x, y: y + 0.3, z }, vel: { x: 0, y: 1.8, z: 0 }, spread: 1, jitter: 0.6, color: 0xffa040, intensity: 4, size: 0.04, life: 1.2, drag: 0.8 });
  }

  steam(x: number, y: number, z: number, color: THREE.Color, k = 1): void {
    this.soft.emit({ pos: { x, y, z }, vel: { x: 0, y: 0.45, z: 0 }, spread: 0.15, jitter: 0.5, color: tmpC.copy(color).lerp(new THREE.Color(0xdde6ee), 0.6), size: 0.35, grow: 2.4, life: 2.2, drag: 0.4, alpha: 0.22 * k });
  }

  sparkle(x: number, y: number, z: number, color: THREE.Color | number, n = 12, speed = 1.6, intensity = 3): void {
    this.glow.emit({ pos: { x, y, z }, spread: speed * 2, color, intensity, size: 0.07, life: 0.7, drag: 2.2, grav: -0.3 }, n);
  }

  burst(x: number, y: number, z: number, color: THREE.Color | number): void {
    this.glow.emit({ pos: { x, y, z }, spread: 6, color, intensity: 4, size: 0.1, life: 1.1, drag: 2.4, grav: 1.4 }, 50);
    this.glow.emit({ pos: { x, y, z }, spread: 2, color: 0xffffff, intensity: 3, size: 0.06, life: 0.6, drag: 3 }, 20);
  }

  puff(x: number, y: number, z: number, color = 0xb8b0c8, n = 10): void {
    this.soft.emit({ pos: { x, y, z }, spread: 1.4, jitter: 0.3, color, size: 0.35, grow: 1.6, life: 0.9, drag: 3, alpha: 0.55 }, n);
  }

  water(x: number, y: number, z: number, dx: number, dz: number): void {
    for (let i = 0; i < 3; i++) {
      this.soft.emit({ pos: { x, y, z }, vel: { x: dx * 5, y: 1.2, z: dz * 5 }, spread: 1.2, color: 0x9fd8ff, size: 0.12, grow: 1.2, life: 0.45, drag: 1, grav: 6, alpha: 0.7 });
      this.glow.emit({ pos: { x, y, z }, vel: { x: dx * 5.5, y: 1, z: dz * 5.5 }, spread: 0.8, color: 0x4fb8ff, intensity: 1.6, size: 0.06, life: 0.4, drag: 1, grav: 5 });
    }
  }

  trail(x: number, y: number, z: number, color: THREE.Color | number): void {
    this.glow.emit({ pos: { x, y, z }, spread: 0.3, color, intensity: 2.5, size: 0.08, life: 0.35, drag: 2 });
  }
}
