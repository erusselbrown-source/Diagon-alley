/**
 * Renders the 3D ingredient and flask models into small PNG icons for the
 * order tickets — so the HUD shows exactly what is on the counters.
 */
import * as THREE from 'three';
import { INGREDIENTS, POTIONS, readyState, type IngredientKind, type PotionId } from './data';
import { makeFlask, makeIngredient } from './models';

export type IconKey = `ing:${IngredientKind}` | `prep:${IngredientKind}` | `flask:${PotionId}` | 'flask:empty';

export function renderIcons(): Map<IconKey, string> {
  const out = new Map<IconKey, string>();
  const size = 128;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(size, size, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.15;
  r.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x403020, 1.8));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(1, 2, 2);
  scene.add(key);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 10);

  const shoot = (obj: THREE.Object3D, k: IconKey) => {
    // no bloom here: tame the potion glow so the icon keeps its colour instead of clipping to white
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.name === 'liquid') {
        const lm = (m.material as THREE.MeshStandardMaterial).clone();
        lm.emissiveIntensity = Math.min(lm.emissiveIntensity, 0.55);
        m.material = lm;
      }
    });
    scene.add(obj);
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3()).length() * 0.5;
    cam.position.set(c.x, c.y + s * 1.5, c.z + s * 2.6);
    cam.lookAt(c);
    r.render(scene, cam);
    out.set(k, r.domElement.toDataURL('image/png'));
    scene.remove(obj);
  };

  for (const kind of Object.keys(INGREDIENTS) as IngredientKind[]) {
    const raw = makeIngredient(kind, 'raw');
    if (kind === 'lacewing') raw.rotation.set(1.1, 0.7, 0); // show the wings, not the edge-on body
    shoot(raw, `ing:${kind}`);
    shoot(makeIngredient(kind, readyState(kind)), `prep:${kind}`);
  }
  for (const id of Object.keys(POTIONS) as PotionId[]) shoot(makeFlask(id), `flask:${id}`);
  shoot(makeFlask(null), 'flask:empty');
  r.dispose();
  r.forceContextLoss();
  return out;
}
