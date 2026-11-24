import * as THREE from 'three';

export interface SceneBundle {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
}

/** Dark placeholder scene: night fog, moody hemisphere fill, one shadow caster. */
export function createScene(): SceneBundle {
  const scene = new THREE.Scene();
  const night = new THREE.Color(0x0a0c12);
  scene.background = night;
  scene.fog = new THREE.FogExp2(night, 0.02);

  scene.add(new THREE.HemisphereLight(0x3a4a6a, 0x120c08, 0.6));

  const sun = new THREE.DirectionalLight(0x9fb4ff, 0.8); // cool moonlight
  sun.position.set(-12, 20, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3; // soft PCF penumbra width
  const s = sun.shadow.camera;
  s.left = -30; s.right = 30; s.top = 30; s.bottom = -30; s.near = 1; s.far = 80;
  scene.add(sun);

  return { scene, sun };
}

/** Temporary ground + grid for orientation until the street is built. */
export function createPlaceholderGround(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'placeholder-ground';

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const grid = new THREE.GridHelper(40, 40, 0x8a9cc4, 0x3c4458);
  grid.position.y = 0.001;
  group.add(grid);

  return group;
}
