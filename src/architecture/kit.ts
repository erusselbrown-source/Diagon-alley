/**
 * Architecture kit — reusable, richly detailed procedural builders.
 *
 *  - Bowed mullioned bay windows / flat shop windows ......... kit/bay.ts
 *  - Panelled Victorian doors (brass, transoms, thresholds) ... kit/door.ts
 *  - Jettied, leaning, sagging storeys + downpipes ........... kit/townhouse.ts
 *  - Steep slate roofs, dormers, gutters, crooked chimneys .... kit/roof.ts
 *  - Wrought-iron scroll brackets with swinging signs ......... kit/sign.ts
 *  - Shopfronts (pilasters, consoles, gilded fascia) ......... kit/shopfront.ts
 *  - Walls with recessed openings, timber framing, geometry ... kit/wall.ts, kit/timber.ts, kit/geometry.ts
 *
 * Everything shares one `Kit` context (materials, instance collector, smoke
 * emitters, animators) so detail stays cheap in draw calls.
 */
export * from './kit/context';
export * from './kit/geometry';
export * from './kit/wall';
export * from './kit/timber';
export * from './kit/bay';
export * from './kit/door';
export * from './kit/roof';
export * from './kit/sign';
export * from './kit/townhouse';
export * from './kit/shopfront';
export * from './kit/lettering';
export * from './kit/instances';
export * from './kit/materials';
