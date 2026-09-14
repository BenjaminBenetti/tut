import type {
  Material,
  Object3D,
  WebGLProgramParametersWithUniforms,
} from "three";
import { Vector3 } from "three";

// ===========================================
// Types
// ===========================================

/**
 * The cutaway's shader inputs, shared by every ghosted material so one
 * write per frame updates them all. Everything is in **view space**, so
 * the shader compares fragments with units without a matrix per pixel.
 *
 * Each ghost is a box: the unit's feet centre and, since #1134, the
 * sample points its rays leave from. The controller builds those on the
 * CPU (`ghostSamples`) from the box's edges and hands the shader the
 * finished spots, so the fragment loop reads a uniform instead of
 * rebuilding eleven points per ghost per pixel.
 *
 * ```
 *   uGhostSpots   [ ghost 0: s0 … s10 ][ ghost 1: s0 … s10 ] … ×MAX_GHOSTS
 *                   └─ index i * GHOST_SAMPLES + s, in ghostSamples order
 *   uGhostReach   [ r0 ][ r1 ] …   bounding circle per ghost on the view plane
 * ```
 */
export interface GhostUniforms {
  /** How many entries of the arrays are live this frame. */
  readonly uGhostCount: { value: number };
  /** Feet centres in view space, one per unit being kept visible. */
  readonly uGhostCentres: { value: Vector3[] };
  /**
   * Every ghost's sample points in view space, flat: ghost `i`'s sample
   * `s` sits at `i * GHOST_SAMPLES + s`, in the order `ghostSamples`
   * returns them (#1134).
   */
  readonly uGhostSpots: { value: Vector3[] };
  /**
   * Per ghost, the radius on the view plane, from the feet centre, past
   * which no fragment can stand on any of its rays: the farthest sample
   * from the centre plus `uGhostRadius` (#1134). The shader rejects a
   * fragment outside it with one distance instead of eleven.
   */
  readonly uGhostReach: { value: number[] };
  /**
   * Radius of each ray in world units, measured across the view plane:
   * how far from a sample point's projection a fragment may lie and
   * still count as on the ray to the camera.
   */
  readonly uGhostRadius: { value: number };
  /** Alpha a fully cut-away fragment keeps, so a wall reads as glass and not a hole. */
  readonly uGhostFloor: { value: number };
  /** Per-ghost ramp in `[0, 1]`, so a cutaway fades in and out rather than snapping. */
  readonly uGhostStrength: { value: number[] };
  /**
   * World height of each unit's feet. Nothing at or below a unit's feet
   * ghosts for it, so the floor it stands on stays solid (#1118).
   */
  readonly uGhostFeet: { value: number[] };
}

/** A unit the cutaway keeps visible: where it is drawn, and how big it is. */
export interface GhostSubject {
  /** The drawn object; its world position is the unit's feet centre. */
  readonly object: Object3D;
  /** Half the footprint's side in world units (`footprint / 2`). */
  readonly halfWidth: number;
  /** The unit's height in world units. */
  readonly height: number;
}

/** A point in view space: `x`/`y` across the view plane, `z` toward the camera (larger is nearer). */
export interface ViewPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

// ===========================================
// Constants
// ===========================================

/**
 * Ghosts the shader makes room for. A deployed force is a handful of
 * units, and the arrays are fixed-size uniforms, so this is sized for
 * the roster rather than grown.
 */
export const MAX_GHOSTS = 8;

/**
 * Rays per ghost (#1134): the four corners of the footprint at foot and
 * head height, and the centre at the feet, the waist and the head.
 *
 * ```
 *   head   4───────5      8  head centre
 *          │       │      9  waist centre
 *          │   ◉   │     10  feet centre
 *   feet   0───────1
 *          (2, 3 and 6, 7 are the far corners)
 * ```
 */
export const GHOST_SAMPLES = 11;

/** Softness of a ray's edge in world units, inward from the radius (style guide §12.4). */
export const GHOST_SOFT_EDGE = 0.25;

/**
 * How far above a unit's feet, in world units, a fragment has to be
 * before it may ghost for that unit (#1118). The floor a unit stands on
 * tops out exactly at its feet, and float noise on that plane must not
 * flicker it; a wall rises 1.5 u from the same plane and fades from the
 * shins up. A half-layer ledge is 0.75 u and still fades.
 */
export const GHOST_FOOT_MARGIN = 0.3;

/**
 * How much nearer the camera than a sample point, in view-space depth,
 * a fragment has to be before it is "on the ray" (#1134). Keeps float
 * noise on the unit's own surfaces from flickering.
 */
export const GHOST_RAY_MARGIN = 0.05;

// ===========================================
// Uniforms
// ===========================================

/**
 * Builds the uniform block a set of ghosted materials share.
 *
 * @param radius - Ray radius in world units across the view plane.
 * @param floor - Alpha kept on the ray, in `[0, 1]`.
 * @returns Uniforms to hand to `applyGhostCutaway` and update per frame.
 */
export function createGhostUniforms(
  radius: number,
  floor: number,
): GhostUniforms {
  const vectors = (length: number): Vector3[] =>
    Array.from({ length }, () => new Vector3());
  const numbers = (): number[] => Array.from({ length: MAX_GHOSTS }, () => 0);
  return {
    uGhostCount: { value: 0 },
    uGhostCentres: { value: vectors(MAX_GHOSTS) },
    uGhostSpots: { value: vectors(MAX_GHOSTS * GHOST_SAMPLES) },
    uGhostReach: { value: numbers() },
    uGhostRadius: { value: radius },
    uGhostFloor: { value: floor },
    uGhostStrength: { value: numbers() },
    uGhostFeet: { value: numbers() },
  };
}

// ===========================================
// Rule
// ===========================================

/**
 * The sample points a ghost's rays leave from, in the order the shader
 * enumerates them (#1134): the footprint's corners at the feet and at
 * the head, then the centre at the head, the waist and the feet.
 *
 * @param centre - The feet centre, in view space.
 * @param right - Half the footprint along world x, in view space.
 * @param forward - Half the footprint along world z, in view space.
 * @param up - The unit's height along world y, in view space.
 * @returns `GHOST_SAMPLES` points.
 */
export function ghostSamples(
  centre: ViewPoint,
  right: ViewPoint,
  forward: ViewPoint,
  up: ViewPoint,
): ViewPoint[] {
  const at = (a: number, b: number, k: number): ViewPoint => ({
    x: centre.x + a * right.x + b * forward.x + k * up.x,
    y: centre.y + a * right.y + b * forward.y + k * up.y,
    z: centre.z + a * right.z + b * forward.z + k * up.z,
  });
  const samples: ViewPoint[] = [];
  for (const k of [0, 1]) {
    for (const [a, b] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      samples.push(at(a, b, k));
    }
  }
  samples.push(at(0, 0, 1), at(0, 0, 0.5), at(0, 0, 0));
  return samples;
}

/**
 * Whether the ray from `sample` to the camera passes through `fragment`
 * (#1134). Under an orthographic camera every ray to the camera runs
 * along the view axis, so the test is two-dimensional: the fragment
 * projects within `radius` of the sample on the view plane, and it is
 * nearer the camera than the sample.
 *
 * ```
 *   camera ◄────────── fragment ◄────────── sample on the unit
 *                      same spot on the view plane (within the radius),
 *                      nearer along the view axis ──► on the ray
 * ```
 *
 * @param sample - A point on the unit, in view space.
 * @param fragment - The fragment, in view space.
 * @param radius - Ray radius across the view plane.
 * @returns True when the fragment stands on the ray.
 */
export function ghostsAlongRay(
  sample: ViewPoint,
  fragment: ViewPoint,
  radius: number,
): boolean {
  return (
    fragment.z > sample.z + GHOST_RAY_MARGIN &&
    Math.hypot(fragment.x - sample.x, fragment.y - sample.y) < radius
  );
}

/**
 * The bounding circle of a ghost's rays on the view plane (#1134): how
 * far from the feet centre, across the view, the farthest sample sits,
 * plus the ray radius. No fragment outside it is within the radius of
 * any sample, so the shader can drop it after one distance test rather
 * than eleven — which is what most fragments of most walls are, and
 * what made the ray cutaway affordable on a CPU rasterizer.
 *
 * ```
 *          ╭───────────╮   reach = max |spot.xy − centre.xy| + radius
 *        ╭─┤ ◦   ◦   ◦ ├─╮
 *        │ │     ◉     │ │  ◉ centre, ◦ samples, ─ the ray radius
 *        ╰─┤ ◦   ◦   ◦ ├─╯
 *          ╰───────────╯
 * ```
 *
 * @param centre - The feet centre, in view space.
 * @param spots - The ghost's `GHOST_SAMPLES` sample points, in view space.
 * @param radius - Ray radius across the view plane.
 * @returns The reject radius, measured across the view plane.
 */
export function ghostReach(
  centre: ViewPoint,
  spots: readonly ViewPoint[],
  radius: number,
): number {
  let farthest = 0;
  for (const spot of spots) {
    farthest = Math.max(
      farthest,
      Math.hypot(spot.x - centre.x, spot.y - centre.y),
    );
  }
  return farthest + radius;
}

/**
 * How strongly a fragment fades for one ghost, in `[0, 1]`: the CPU
 * mirror of the shader's rule, so the maths is pinned where a test can
 * reach it (#1134). It takes exactly what the shader is given — the
 * centre, the precomputed spots and the reach — and rejects in the
 * same order: zero for anything at or below the unit's feet (#1118),
 * zero outside the bounding circle, otherwise the soft-edged coverage
 * of the nearest ray the fragment stands on.
 *
 * @param ghost - The ghost as the shader sees it, and its feet height.
 * @param ghost.centre - The feet centre, in view space.
 * @param ghost.spots - Its `GHOST_SAMPLES` sample points, in view space.
 * @param ghost.reach - Its bounding circle on the view plane (`ghostReach`).
 * @param ghost.feetY - The feet, in world height.
 * @param fragment - The fragment in view space, with its world height.
 * @param fragment.view - Its view-space position.
 * @param fragment.worldY - Its world height.
 * @param radius - Ray radius across the view plane.
 * @returns The fade in `[0, 1]`; `1` is fully cut away.
 */
export function ghostFade(
  ghost: {
    readonly centre: ViewPoint;
    readonly spots: readonly ViewPoint[];
    readonly reach: number;
    readonly feetY: number;
  },
  fragment: { readonly view: ViewPoint; readonly worldY: number },
  radius: number,
): number {
  if (fragment.worldY - ghost.feetY <= GHOST_FOOT_MARGIN) {
    return 0;
  }
  if (
    Math.hypot(
      fragment.view.x - ghost.centre.x,
      fragment.view.y - ghost.centre.y,
    ) > ghost.reach
  ) {
    return 0;
  }
  let nearest = Number.POSITIVE_INFINITY;
  for (const spot of ghost.spots) {
    if (fragment.view.z > spot.z + GHOST_RAY_MARGIN) {
      nearest = Math.min(
        nearest,
        Math.hypot(fragment.view.x - spot.x, fragment.view.y - spot.y),
      );
    }
  }
  return smoothstep(radius, radius - GHOST_SOFT_EDGE, nearest);
}

/** GLSL's `smoothstep`, with the edges in either order. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// ===========================================
// Material
// ===========================================

/**
 * Returns a clone of `material` that fades where a ray from a unit to
 * the camera passes through it (#526, rays since #1134).
 *
 * ```
 *   camera ◄──── wall fragment ◄──── sample on the unit (corner, head…)
 *                nearer than the sample, and within the ray's radius
 *                on the view plane ──► alpha falls to uGhostFloor
 * ```
 *
 * Only what actually stands between the camera and the unit's body
 * fades. A wall in front of the unit but off to the side does not: no
 * ray from the unit passes through it, however near it stands. Before
 * #1134 the test was a plane through the unit — anything on the
 * camera's side within a radius faded — and the Executive Director saw
 * walls off to the side dissolve along with the one in front.
 *
 * Three rules still hold from the earlier cutaways: the floor a unit
 * stands on never fades (#1118: only fragments above the feet are
 * tested), the wall behind the unit never fades (it is farther than
 * every sample), and the edge is soft.
 *
 * Working in view space rather than screen space is exact here because
 * the game draws through one orthographic camera (ADR 0004 §3, ADR 0005):
 * under an orthographic projection, view-space `xy` is a linear function
 * of screen position, so a world-unit radius is a stable on-screen circle
 * at every zoom, and view-space `z` orders fragments by distance from the
 * camera directly — which is what makes "along the ray" a 2-D test.
 *
 * The material is **cloned**: building materials belong to the model
 * loader's cached prototypes and are shared by every instance of that
 * model, so ghosting them in place would leak across missions.
 *
 * @param material - The prototype material; never modified.
 * @param uniforms - Shared uniform block, updated once per frame.
 * @returns The clone to give to the mesh.
 */
export function applyGhostCutaway(
  material: Material,
  uniforms: GhostUniforms,
): Material {
  const ghosted = material.clone();
  // Deliberately still opaque, still writing depth. Making these
  // materials transparent turns every wall in the city see-through,
  // because walls stop occluding each other and the renderer draws
  // interiors over exteriors in whatever order it likes. The cutaway
  // therefore *discards* fragments rather than blending them, which
  // writes no depth exactly where it should and leaves the rest of the
  // building solid.
  ghosted.name = `${material.name}-ghosted`;
  ghosted.onBeforeCompile = (
    shader: WebGLProgramParametersWithUniforms,
  ): void => {
    shader.uniforms.uGhostCount = uniforms.uGhostCount;
    shader.uniforms.uGhostCentres = uniforms.uGhostCentres;
    shader.uniforms.uGhostSpots = uniforms.uGhostSpots;
    shader.uniforms.uGhostReach = uniforms.uGhostReach;
    shader.uniforms.uGhostRadius = uniforms.uGhostRadius;
    shader.uniforms.uGhostFloor = uniforms.uGhostFloor;
    shader.uniforms.uGhostStrength = uniforms.uGhostStrength;
    shader.uniforms.uGhostFeet = uniforms.uGhostFeet;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_HEAD}`)
      // After project_vertex, so instanced transforms are already applied.
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>\n${VERTEX_BODY}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${fragmentHead()}`)
      .replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>\n${FRAGMENT_BODY}`,
      );
  };
  // Materials with different programs must not share a cache entry.
  ghosted.customProgramCacheKey = (): string => "ghost-cutaway";
  ghosted.needsUpdate = true;
  return ghosted;
}

// ===========================================
// Shader source
// ===========================================

const VERTEX_HEAD = "varying vec3 vGhostView;\nvarying float vGhostWorldY;";

/**
 * The view-space position for the ray tests, and the world height for
 * the feet test. The height is rebuilt the way three's own
 * `worldpos_vertex` does it, batching and instancing included, because
 * that chunk is only compiled in when a map or shadow asks for it.
 */
const VERTEX_BODY = `
  vGhostView = mvPosition.xyz;
  vec4 ghostWorld = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    ghostWorld = batchingMatrix * ghostWorld;
  #endif
  #ifdef USE_INSTANCING
    ghostWorld = instanceMatrix * ghostWorld;
  #endif
  ghostWorld = modelMatrix * ghostWorld;
  vGhostWorldY = ghostWorld.y;
`;

/**
 * The per-fragment rule. Two things keep it cheap, because every
 * fragment of every wall and roof runs it and the e2e renderer is
 * SwiftShader, a CPU rasterizer (#1134): the sample points come in as a
 * uniform rather than being rebuilt from the box edges per fragment,
 * and a fragment outside a ghost's bounding circle leaves after one
 * distance instead of eleven. Measured on `e2e/tile-attack.spec.ts`
 * under SwiftShader: 19.3 s with the per-fragment rebuild and no
 * reject, 12.4 s with the loop disabled, 11.0 s before the ray cutaway
 * existed — enough that CI's e2e shard ran past its budget.
 */
const FRAGMENT_BODY = `
  float ghostAlpha = 1.0;
  for (int i = 0; i < MAX_GHOSTS; i++) {
    if (i >= uGhostCount) break;
    // Only what rises above the unit's feet may fade: the floor it
    // stands on stays solid (#1118). Cheapest test first.
    float rise = vGhostWorldY - uGhostFeet[i];
    if (rise <= ${GHOST_FOOT_MARGIN.toFixed(2)}) continue;
    // Outside the ghost's bounding circle on the view plane no ray can
    // reach this fragment, so it is dropped after one length (#1134).
    if (length(vGhostView.xy - uGhostCentres[i].xy) > uGhostReach[i]) continue;
    // The nearest ray this fragment stands on (#1134): a sample's ray
    // to the camera runs along the view axis, so the fragment is on it
    // when it is nearer than the sample and within the radius of the
    // sample's spot on the view plane. View space looks down -z, so a
    // larger z is nearer the camera.
    float nearest = 1e9;
    for (int s = 0; s < GHOST_SAMPLES; s++) {
      // 'spot', not 'sample': GLSL ES reserves that word, and no test
      // compiles the chunk; the tests read it as a string (#1134).
      vec3 spot = uGhostSpots[i * GHOST_SAMPLES + s];
      if (vGhostView.z > spot.z + ${GHOST_RAY_MARGIN.toFixed(2)}) {
        nearest = min(nearest, length(vGhostView.xy - spot.xy));
      }
    }
    // Soft edge measured inward from the radius in world units, so the
    // wall gives way around the unit rather than showing a hard cut.
    float f = smoothstep(uGhostRadius, uGhostRadius - ${GHOST_SOFT_EDGE.toFixed(2)}, nearest);
    f *= uGhostStrength[i];
    ghostAlpha = min(ghostAlpha, mix(1.0, uGhostFloor, f));
  }
  if (ghostAlpha < 1.0 && ghostAlpha < ghostDither(gl_FragCoord.xy)) discard;
`;

/**
 * Fragment declarations. The loop bounds must be compile-time constants
 * in GLSL, and the dither is an ordered 4x4 Bayer threshold: the cutaway
 * drops fragments in a fixed screen-space pattern, so a partly faded
 * wall reads as a soft screen-door rather than a hard-edged hole, while
 * every surviving fragment still writes depth normally.
 *
 * `uGhostSpots` is flat, `MAX_GHOSTS * GHOST_SAMPLES` long, in the
 * order `ghostSamples` fills it on the CPU: corners at the feet, corners
 * at the head, then the centre at the head, the waist and the feet. The
 * shader no longer derives them (#1134): a function of the box edges
 * cost eleven vector sums per ghost per fragment.
 */
function fragmentHead(): string {
  return `
    #define MAX_GHOSTS ${String(MAX_GHOSTS)}
    #define GHOST_SAMPLES ${String(GHOST_SAMPLES)}
    varying vec3 vGhostView;
    varying float vGhostWorldY;
    uniform int uGhostCount;
    uniform vec3 uGhostCentres[MAX_GHOSTS];
    uniform vec3 uGhostSpots[MAX_GHOSTS * GHOST_SAMPLES];
    uniform float uGhostReach[MAX_GHOSTS];
    uniform float uGhostRadius;
    uniform float uGhostFloor;
    uniform float uGhostStrength[MAX_GHOSTS];
    uniform float uGhostFeet[MAX_GHOSTS];

    float ghostDither(vec2 fragment) {
      int x = int(mod(fragment.x, 4.0));
      int y = int(mod(fragment.y, 4.0));
      int index = x + y * 4;
      float bayer[16];
      bayer[0]  =  0.0; bayer[1]  =  8.0; bayer[2]  =  2.0; bayer[3]  = 10.0;
      bayer[4]  = 12.0; bayer[5]  =  4.0; bayer[6]  = 14.0; bayer[7]  =  6.0;
      bayer[8]  =  3.0; bayer[9]  = 11.0; bayer[10] =  1.0; bayer[11] =  9.0;
      bayer[12] = 15.0; bayer[13] =  7.0; bayer[14] = 13.0; bayer[15] =  5.0;
      for (int i = 0; i < 16; i++) {
        if (i == index) return (bayer[i] + 0.5) / 16.0;
      }
      return 0.5;
    }
  `;
}
