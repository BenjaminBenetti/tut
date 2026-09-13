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
 * Each ghost is a box: the unit's feet centre and three edge vectors —
 * half its footprint along world x and z, and its full height along
 * world y — which the shader turns into the sample points its rays
 * leave from (#1134).
 */
export interface GhostUniforms {
  /** How many entries of the arrays are live this frame. */
  readonly uGhostCount: { value: number };
  /** Feet centres in view space, one per unit being kept visible. */
  readonly uGhostCentres: { value: Vector3[] };
  /** Half the footprint along world x, as a view-space vector. */
  readonly uGhostRight: { value: Vector3[] };
  /** Half the footprint along world z, as a view-space vector. */
  readonly uGhostForward: { value: Vector3[] };
  /** The unit's height along world y, as a view-space vector. */
  readonly uGhostUpVec: { value: Vector3[] };
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
  const vectors = (): Vector3[] =>
    Array.from({ length: MAX_GHOSTS }, () => new Vector3());
  return {
    uGhostCount: { value: 0 },
    uGhostCentres: { value: vectors() },
    uGhostRight: { value: vectors() },
    uGhostForward: { value: vectors() },
    uGhostUpVec: { value: vectors() },
    uGhostRadius: { value: radius },
    uGhostFloor: { value: floor },
    uGhostStrength: { value: Array.from({ length: MAX_GHOSTS }, () => 0) },
    uGhostFeet: { value: Array.from({ length: MAX_GHOSTS }, () => 0) },
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
 * How strongly a fragment fades for one ghost, in `[0, 1]`: the CPU
 * mirror of the shader's rule, so the maths is pinned where a test can
 * reach it (#1134). Zero for anything at or below the unit's feet
 * (#1118), otherwise the soft-edged coverage of the nearest ray the
 * fragment stands on.
 *
 * @param ghost - The ghost's box in view space, and its feet height.
 * @param ghost.centre - The feet centre.
 * @param ghost.right - Half the footprint along world x.
 * @param ghost.forward - Half the footprint along world z.
 * @param ghost.up - The unit's height along world y.
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
    readonly right: ViewPoint;
    readonly forward: ViewPoint;
    readonly up: ViewPoint;
    readonly feetY: number;
  },
  fragment: { readonly view: ViewPoint; readonly worldY: number },
  radius: number,
): number {
  if (fragment.worldY - ghost.feetY <= GHOST_FOOT_MARGIN) {
    return 0;
  }
  let nearest = Number.POSITIVE_INFINITY;
  for (const sample of ghostSamples(
    ghost.centre,
    ghost.right,
    ghost.forward,
    ghost.up,
  )) {
    if (fragment.view.z > sample.z + GHOST_RAY_MARGIN) {
      nearest = Math.min(
        nearest,
        Math.hypot(fragment.view.x - sample.x, fragment.view.y - sample.y),
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
    shader.uniforms.uGhostRight = uniforms.uGhostRight;
    shader.uniforms.uGhostForward = uniforms.uGhostForward;
    shader.uniforms.uGhostUpVec = uniforms.uGhostUpVec;
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

const FRAGMENT_BODY = `
  float ghostAlpha = 1.0;
  for (int i = 0; i < MAX_GHOSTS; i++) {
    if (i >= uGhostCount) break;
    // Only what rises above the unit's feet may fade: the floor it
    // stands on stays solid (#1118).
    float rise = vGhostWorldY - uGhostFeet[i];
    if (rise <= ${GHOST_FOOT_MARGIN.toFixed(2)}) continue;
    // The nearest ray this fragment stands on (#1134): a sample's ray
    // to the camera runs along the view axis, so the fragment is on it
    // when it is nearer than the sample and within the radius of the
    // sample's spot on the view plane. View space looks down -z, so a
    // larger z is nearer the camera.
    float nearest = 1e9;
    for (int s = 0; s < GHOST_SAMPLES; s++) {
      vec3 sample = uGhostCentres[i] + ghostSampleOffset(s, uGhostRight[i], uGhostForward[i], uGhostUpVec[i]);
      if (vGhostView.z > sample.z + ${GHOST_RAY_MARGIN.toFixed(2)}) {
        nearest = min(nearest, length(vGhostView.xy - sample.xy));
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
 * `ghostSampleOffset` enumerates the samples in the order `ghostSamples`
 * does on the CPU: corners at the feet, corners at the head, then the
 * centre at the head, the waist and the feet.
 */
function fragmentHead(): string {
  return `
    #define MAX_GHOSTS ${String(MAX_GHOSTS)}
    #define GHOST_SAMPLES ${String(GHOST_SAMPLES)}
    varying vec3 vGhostView;
    varying float vGhostWorldY;
    uniform int uGhostCount;
    uniform vec3 uGhostCentres[MAX_GHOSTS];
    uniform vec3 uGhostRight[MAX_GHOSTS];
    uniform vec3 uGhostForward[MAX_GHOSTS];
    uniform vec3 uGhostUpVec[MAX_GHOSTS];
    uniform float uGhostRadius;
    uniform float uGhostFloor;
    uniform float uGhostStrength[MAX_GHOSTS];
    uniform float uGhostFeet[MAX_GHOSTS];

    vec3 ghostSampleOffset(int s, vec3 right, vec3 forward, vec3 up) {
      if (s < 8) {
        float a = (s == 1 || s == 3 || s == 5 || s == 7) ? 1.0 : -1.0;
        float b = (s == 2 || s == 3 || s == 6 || s == 7) ? 1.0 : -1.0;
        float k = (s >= 4) ? 1.0 : 0.0;
        return a * right + b * forward + k * up;
      }
      if (s == 8) return up;
      if (s == 9) return 0.5 * up;
      return vec3(0.0);
    }

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
