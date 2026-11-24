/**
 * Per-instance UV jitter for InstancedMesh: every instance samples a different
 * window of the (tileable) texture, so thousands of stones sharing one
 * material and geometry don't look cloned. Offset is hashed from the
 * instance translation, so it is stable and needs no extra attribute.
 */
import type * as THREE from 'three';

const UV_VARYINGS = ['vMapUv', 'vNormalMapUv', 'vRoughnessMapUv', 'vMetalnessMapUv', 'vAoMapUv', 'vEmissiveMapUv'];
const DEFINES: Record<string, string> = {
  vMapUv: 'USE_MAP', vNormalMapUv: 'USE_NORMALMAP', vRoughnessMapUv: 'USE_ROUGHNESSMAP',
  vMetalnessMapUv: 'USE_METALNESSMAP', vAoMapUv: 'USE_AOMAP', vEmissiveMapUv: 'USE_EMISSIVEMAP',
};

export function withInstanceUvJitter<T extends THREE.Material>(material: T, tag = 'uvjit'): T {
  const m = material.clone() as T;
  const prev = material.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    const lines = UV_VARYINGS.map((v) => `#ifdef ${DEFINES[v]}\n  ${v} += uvJit;\n#endif`).join('\n');
    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      #ifdef USE_INSTANCING
        vec3 jt = instanceMatrix[3].xyz;
        vec2 uvJit = fract(sin(vec2(dot(jt, vec3(12.9898, 78.233, 37.719)), dot(jt, vec3(39.346, 11.135, 83.155)))) * 43758.5453);
        ${lines}
      #endif`,
    );
  };
  m.customProgramCacheKey = () => `${material.customProgramCacheKey()}|${tag}`;
  return m;
}
