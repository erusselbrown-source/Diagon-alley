/** Cached material variants for the kit (tints, UV-jittered instancing variants, interiors). */
import * as THREE from 'three';
import { withInstanceUvJitter, type MaterialId, type MaterialLibrary } from '../../materials';

export class KitMaterials {
  private readonly cache = new Map<string, THREE.Material>();
  constructor(readonly lib: MaterialLibrary) {}

  get(id: MaterialId): THREE.MeshStandardMaterial { return this.lib.get(id); }
  worldSize(id: MaterialId): number { return this.lib.recipe(id).worldSize; }

  /** Clone of a library material with a colour multiplier (e.g. rose brick, sooty brick). */
  tinted(id: MaterialId, color: THREE.ColorRepresentation, key = String(color)): THREE.MeshStandardMaterial {
    return this.memo(`tint:${id}:${key}`, () => {
      const m = this.lib.get(id).clone();
      m.color.set(color);
      m.name = `${id}~${key}`;
      return m;
    }) as THREE.MeshStandardMaterial;
  }

  /** Per-instance UV jitter variant for InstancedMesh use. */
  jitter(id: MaterialId, base?: THREE.Material): THREE.MeshStandardMaterial {
    return this.memo(`jit:${id}:${base?.uuid ?? ''}`, () => withInstanceUvJitter(base ?? this.lib.get(id), `kit-${id}`)) as THREE.MeshStandardMaterial;
  }

  /**
   * Shop interior surfaces: textured, with a warm emissive glow so window
   * displays read at night without dozens of point lights.
   */
  interior(id: MaterialId, glow: THREE.ColorRepresentation = 0xffb066, intensity = 0.55): THREE.MeshStandardMaterial {
    return this.memo(`int:${id}:${glow}:${intensity}`, () => {
      const m = this.lib.get(id).clone();
      m.side = THREE.BackSide;
      m.emissive = new THREE.Color(glow);
      m.emissiveIntensity = intensity;
      m.emissiveMap = m.map;
      m.name = `interior:${id}`;
      return m;
    }) as THREE.MeshStandardMaterial;
  }

  /**
   * Display-prop material: instance colours also tint a faint emissive term,
   * as if lit by the shop's lamps (no per-shop lights needed).
   */
  display(id: MaterialId, glow = 0.35): THREE.MeshStandardMaterial {
    return this.displayFrom(`lib:${id}`, this.lib.get(id), glow);
  }

  displayFrom(key: string, base: THREE.Material, glow = 0.35): THREE.MeshStandardMaterial {
    return this.memo(`disp:${key}:${glow}`, () => {
      const m = withInstanceUvJitter(base, `disp-${key}`) as THREE.MeshStandardMaterial;
      m.emissive = new THREE.Color(1, 0.85, 0.65).multiplyScalar(glow);
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = (shader, r) => {
        prev.call(m, shader, r);
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n  totalEmissiveRadiance *= diffuseColor.rgb * 1.4;\n#else\n  totalEmissiveRadiance *= diffuseColor.rgb;\n#endif',
        );
      };
      const prevKey = m.customProgramCacheKey.bind(m);
      m.customProgramCacheKey = () => `${prevKey()}|disp`;
      return m;
    }) as THREE.MeshStandardMaterial;
  }

  /** Plain glowing material (bulbs, lantern glass, rabbit). */
  glow(color: THREE.ColorRepresentation, intensity = 3): THREE.MeshStandardMaterial {
    return this.memo(`glow:${color}:${intensity}`, () => new THREE.MeshStandardMaterial({
      color: 0x000000, emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: 0.4,
    })) as THREE.MeshStandardMaterial;
  }

  memo(key: string, make: () => THREE.Material): THREE.Material {
    let m = this.cache.get(key);
    if (!m) this.cache.set(key, (m = make()));
    return m;
  }
}
