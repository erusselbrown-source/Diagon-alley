/**
 * World-space weathering patches. A tileable texture can't know where the
 * ground is, so effects tied to height (soot/rising damp near a wall base)
 * are applied in the shader from world position.
 */
import * as THREE from 'three';

export interface BaseGrimeOptions {
  /** World Y of the ground plane. */
  groundY?: number;
  /** Height (m) over which grime fades out. */
  height?: number;
  /** 0..1 darkening strength at the very base. */
  strength?: number;
  /** Soot / damp tint (sRGB). */
  color?: THREE.ColorRepresentation;
}

/** Clone `material` with a soot/damp gradient near the base of the wall. */
export function withBaseGrime<T extends THREE.MeshStandardMaterial>(material: T, opts: BaseGrimeOptions = {}): T {
  const m = material.clone() as T;
  const params = new THREE.Vector3(opts.groundY ?? 0, opts.height ?? 1.1, opts.strength ?? 0.7);
  const tint = new THREE.Color(opts.color ?? 0x1a1612);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uGrime = { value: params };
    shader.uniforms.uGrimeTint = { value: tint };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrimeWorld;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 grimePos = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          grimePos = instanceMatrix * grimePos;
        #endif
        vGrimeWorld = (modelMatrix * grimePos).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vGrimeWorld;
        uniform vec3 uGrime;
        uniform vec3 uGrimeTint;
        float grimeAmount() {
          float y = vGrimeWorld.y - uGrime.x;
          // irregular top edge + vertical run-off streaks
          float wob = sin(vGrimeWorld.x * 3.1 + vGrimeWorld.z * 2.3) * 0.12 + sin(vGrimeWorld.x * 11.7) * 0.05;
          float streak = 0.75 + 0.25 * sin(vGrimeWorld.x * 37.0 + sin(vGrimeWorld.x * 5.3) * 3.0);
          float g = 1.0 - smoothstep(0.0, uGrime.y * (1.0 + wob), y);
          return g * g * streak * uGrime.z;
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float grimeK = grimeAmount();
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uGrimeTint * 2.2, grimeK);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 1.0, grimeK * 0.6);`,
      );
  };
  m.customProgramCacheKey = () => `${material.customProgramCacheKey()}|grime`;
  return m;
}
