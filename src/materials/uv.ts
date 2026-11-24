import type * as THREE from 'three';

/**
 * Scale a geometry's UVs so one texture tile spans `worldSize` metres,
 * given the UV-space span of the geometry in metres (e.g. a 3×2 m plane → 3, 2).
 * Set `integerU` for closed surfaces (spheres/cylinders) to avoid a seam.
 */
export function scaleUVsToWorld(
  geometry: THREE.BufferGeometry,
  spanU: number,
  spanV: number,
  worldSize: number,
  integerU = false,
): THREE.BufferGeometry {
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  let su = spanU / worldSize;
  if (integerU) su = Math.max(1, Math.round(su));
  const sv = spanV / worldSize;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geometry;
}

/**
 * Planar world-space projection: uv = position on the chosen axes / worldSize.
 * Keeps texel density consistent across differently sized facade pieces.
 */
export function projectWorldUVs(
  geometry: THREE.BufferGeometry,
  worldSize: number,
  axes: 'xy' | 'xz' | 'zy' = 'xy',
): THREE.BufferGeometry {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const [a, b] = axes === 'xy' ? [x, y] : axes === 'xz' ? [x, -z] : [z, y];
    uv.setXY(i, a / worldSize, b / worldSize);
  }
  uv.needsUpdate = true;
  return geometry;
}
