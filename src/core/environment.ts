/**
 * Procedural night environment map for reflections (wet cobbles, puddles,
 * glass, brass). Built from a tiny scene — no HDR files, fully offline.
 */
import * as THREE from 'three';

export function createNightEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const env = new THREE.Scene();

  // Sky dome: deep navy zenith → smoky warm horizon glow (city light).
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(50, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        varying vec3 vDir;
        void main() {
          float h = vDir.y;
          vec3 zenith = vec3(0.012, 0.018, 0.045);
          vec3 horizon = vec3(0.11, 0.075, 0.05);
          vec3 ground = vec3(0.02, 0.016, 0.014);
          vec3 c = h > 0.0 ? mix(horizon, zenith, pow(h, 0.45)) : mix(horizon, ground, pow(-h, 0.35));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  env.add(dome);

  // Warm "windows and lanterns" around the horizon so wet surfaces catch glints.
  const warm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.62, 0.28).multiplyScalar(6) });
  const cool = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.7, 1.0).multiplyScalar(1.5) });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.3 * Math.sin(i * 7.1);
    const y = 2 + 6 * ((i * 0.618) % 1);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.2 + (i % 3) * 0.6, 1.6), i % 5 === 0 ? cool : warm);
    blob.position.set(Math.cos(a) * 30, y, Math.sin(a) * 30);
    blob.lookAt(0, y, 0);
    env.add(blob);
  }
  // Moon
  const moon = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 0.86, 1).multiplyScalar(4) }));
  moon.position.set(-20, 32, 14);
  moon.lookAt(0, 0, 0);
  env.add(moon);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.02).texture;
  pmrem.dispose();
  return tex;
}
