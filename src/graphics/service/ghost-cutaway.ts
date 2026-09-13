import type { Material, WebGLProgramParametersWithUniforms } from "three";
import { Vector3 } from "three";

// ===========================================
// Types
// ===========================================

/**
 * The cutaway's shader inputs, shared by every ghosted material so one
 * write per frame updates them all.
 */
export interface GhostUniforms {
  /** How many entries of `uGhostCentres` are live this frame. */
  readonly uGhostCount: { value: number };
  /** Ghost centres in **view space**, one per unit being kept visible. */
  readonly uGhostCentres: { value: Vector3[] };
  /** Radius of the cutaway in world units, measured across the view plane. */
  readonly uGhostRadius: { value: number };
  /** Alpha a fully cut-away fragment keeps, so a wall reads as glass and not a hole. */
  readonly uGhostFloor: { value: number };
  /** Per-centre ramp in `[0, 1]`, so a cutaway fades in and out rather than snapping. */
  readonly uGhostStrength: { value: number[] };
  /**
   * World height of each centre's feet. Nothing at or below a unit's
   * feet ghosts for it, so the floor it stands on stays solid (#1118).
   */
  readonly uGhostFeet: { value: number[] };
  /**
   * View-space depth gained per world unit of height: the world up
   * vector's view-space `z` (#1132). The shader subtracts a fragment's
   * rise above the unit's feet times this from its depth, so the depth
   * it compares is the fragment's **plan** depth — where its footprint
   * stands — and a tall wall behind the unit is not "nearer" for rising.
   */
  readonly uGhostUp: { value: number };
}

// ===========================================
// Constants
// ===========================================

/**
 * Ghost centres the shader makes room for. A deployed force is a handful
 * of units, and the array is a fixed-size uniform, so this is sized for
 * the roster rather than grown.
 */
export const MAX_GHOSTS = 8;

/** Softness of the edge in world units, from the style guide (§12.4). */
const SOFT_EDGE_UNITS = 0.65;

/**
 * How far above a unit's feet, in world units, a fragment has to be
 * before it may ghost for that unit (#1118). The floor a unit stands on
 * tops out exactly at its feet, and float noise on that plane must not
 * flicker it; a wall rises 1.5 u from the same plane and fades from the
 * shins up. A half-layer ledge is 0.75 u and still fades.
 */
export const GHOST_FOOT_MARGIN = 0.3;

/**
 * How far in front of a unit, in view-space depth, a fragment's footprint
 * has to stand before it ghosts (#1132). Keeps float noise on the unit's
 * own row from flickering, and leaves the wall running through the
 * unit's tile cut at the unit rather than a hair behind it: at the
 * tactical pitch a depth of 0.05 is 0.06 of a tile across the ground.
 */
export const GHOST_PLAN_MARGIN = 0.05;

// ===========================================
// Uniforms
// ===========================================

/**
 * Builds the uniform block a set of ghosted materials share.
 *
 * @param radius - Cutaway radius in world units.
 * @param floor - Alpha kept at the centre of the cutaway, in `[0, 1]`.
 * @returns Uniforms to hand to `applyGhostCutaway` and update per frame.
 */
export function createGhostUniforms(
  radius: number,
  floor: number,
): GhostUniforms {
  return {
    uGhostCount: { value: 0 },
    uGhostCentres: {
      value: Array.from({ length: MAX_GHOSTS }, () => new Vector3()),
    },
    uGhostRadius: { value: radius },
    uGhostFloor: { value: floor },
    uGhostStrength: { value: Array.from({ length: MAX_GHOSTS }, () => 0) },
    uGhostFeet: { value: Array.from({ length: MAX_GHOSTS }, () => 0) },
    uGhostUp: { value: 0 },
  };
}

// ===========================================
// Rule
// ===========================================

/**
 * A fragment's depth with its rise above a unit's feet taken out: the
 * view-space depth of the point on the unit's floor plane directly
 * beneath it, which is where its footprint stands (#1132).
 *
 * @param viewZ - The fragment's view-space `z`; larger is nearer the camera.
 * @param worldY - The fragment's world height.
 * @param feetY - The unit's feet, in world height.
 * @param upDepth - View-space depth per world unit of height (`uGhostUp`).
 * @returns The plan depth, comparable with the unit's own view `z`.
 */
export function ghostPlanDepth(
  viewZ: number,
  worldY: number,
  feetY: number,
  upDepth: number,
): number {
  return viewZ - (worldY - feetY) * upDepth;
}

/**
 * Whether a fragment stands between the camera and a unit (#1132): its
 * footprint is on the camera's side of the unit's, and it rises above
 * the unit's feet. The CPU mirror of the shader's test, so the maths is
 * pinned where a test can reach it; the radius and the soft edge are
 * applied on top of this in the shader.
 *
 * ```
 *   camera                        rule: plan(fragment) > plan(unit)
 *      ╲                          rise(fragment) > GHOST_FOOT_MARGIN
 *       ╲   ┌────┐ front wall ──► ghosts: in front, above the feet
 *        ╲  │    │
 *         ╲ │ ◉ unit   ┌────┐ back wall ──► solid: behind, however tall
 *   ───────┴────┴──────┴────┴───── floor ──► solid: never above the feet
 * ```
 *
 * Depth alone got this wrong (#526 through #1130): the tactical camera
 * looks down at 35°, so a wall a tile behind the unit is nearer the
 * camera than the unit's feet from 1.4 u up, and the far wall of every
 * room faded from the shins up. Taking the height back out compares
 * footprints instead.
 *
 * @param fragment - The fragment.
 * @param fragment.viewZ - Its view-space `z`; larger is nearer the camera.
 * @param fragment.worldY - Its world height.
 * @param centre - The unit.
 * @param centre.viewZ - The unit's view-space `z`.
 * @param centre.feetY - The unit's feet, in world height.
 * @param upDepth - View-space depth per world unit of height.
 * @returns True when the fragment should fade for this unit.
 */
export function ghostsInFrontOf(
  fragment: { readonly viewZ: number; readonly worldY: number },
  centre: { readonly viewZ: number; readonly feetY: number },
  upDepth: number,
): boolean {
  const rise = fragment.worldY - centre.feetY;
  return (
    ghostPlanDepth(fragment.viewZ, fragment.worldY, centre.feetY, upDepth) >
      centre.viewZ + GHOST_PLAN_MARGIN && rise > GHOST_FOOT_MARGIN
  );
}

// ===========================================
// Material
// ===========================================

/**
 * Returns a clone of `material` that fades where it stands between the
 * camera and a ghost centre (#526).
 *
 * ```
 *   camera ──────────► wall fragment ──────────► unit (ghost centre)
 *                      nearer than the centre,
 *                      and within the radius across
 *                      the view plane ──► alpha falls to uGhostFloor
 * ```
 *
 * **Both conditions are load-bearing.** Distance alone would punch a hole
 * through the wall *behind* the unit as well as the one in front of it,
 * which reads as a spotlight rather than a cutaway. The depth comparison
 * is what makes it XCOM's effect — and since #1132 it is a comparison of
 * **plan** depth: the fragment's rise above the unit's feet is taken back
 * out first (`ghostsInFrontOf`), because at the tactical pitch a tall
 * wall behind the unit is nearer the camera than the unit's feet from
 * 1.4 u up, and the far wall of every room faded from the shins up.
 *
 * A third condition keeps the ground under the unit (#1118): a fragment
 * fades only when it is **above the unit's feet**. The floor a unit
 * stands on lies on its own plane, so in front of the unit it is both
 * nearer the camera and inside the radius, and without the height test
 * the cutaway opened the floor and showed the storey below through it.
 * Walls beside the unit and slabs over it still fade, since they rise
 * above the feet; the slab under them never does.
 *
 * Working in view space rather than screen space is exact here because
 * the game draws through one orthographic camera (ADR 0004 §3, ADR 0005):
 * under an orthographic projection, view-space `xy` is a linear function
 * of screen position, so a world-unit radius is a stable on-screen circle
 * at every zoom, and view-space `z` orders fragments by distance from the
 * camera directly.
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
    shader.uniforms.uGhostRadius = uniforms.uGhostRadius;
    shader.uniforms.uGhostFloor = uniforms.uGhostFloor;
    shader.uniforms.uGhostStrength = uniforms.uGhostStrength;
    shader.uniforms.uGhostFeet = uniforms.uGhostFeet;
    shader.uniforms.uGhostUp = uniforms.uGhostUp;
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
 * The view-space position for the depth and radius tests, and the world
 * height for the feet test. The height is rebuilt the way three's own
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
    vec3 centre = uGhostCentres[i];
    // View space looks down -z, so a larger z is nearer the camera. The
    // depth compared is the fragment's plan depth — its rise above the
    // unit's feet taken out — so only what stands in front of the unit
    // fades and a tall wall behind it stays solid (#1132). And only what
    // rises above the unit's feet fades: the floor it stands on stays
    // solid (#1118).
    float rise = vGhostWorldY - uGhostFeet[i];
    float plan = vGhostView.z - rise * uGhostUp;
    if (plan > centre.z + ${GHOST_PLAN_MARGIN.toFixed(2)} && rise > ${GHOST_FOOT_MARGIN.toFixed(2)}) {
      float d = length(vGhostView.xy - centre.xy);
      // Soft edge measured inward from the radius in world units, so the
      // building gives way rather than showing a circle cut in it.
      float f = smoothstep(uGhostRadius, uGhostRadius - ${SOFT_EDGE_UNITS.toFixed(2)}, d);
      f *= uGhostStrength[i];
      ghostAlpha = min(ghostAlpha, mix(1.0, uGhostFloor, f));
    }
  }
  if (ghostAlpha < 1.0 && ghostAlpha < ghostDither(gl_FragCoord.xy)) discard;
`;

/**
 * Fragment declarations. The loop bound must be a compile-time constant
 * in GLSL, and the dither is an ordered 4x4 Bayer threshold: the cutaway
 * drops fragments in a fixed screen-space pattern, so a partly faded
 * wall reads as a soft screen-door rather than a hard-edged hole, while
 * every surviving fragment still writes depth normally.
 */
function fragmentHead(): string {
  return `
    #define MAX_GHOSTS ${String(MAX_GHOSTS)}
    varying vec3 vGhostView;
    varying float vGhostWorldY;
    uniform int uGhostCount;
    uniform vec3 uGhostCentres[MAX_GHOSTS];
    uniform float uGhostRadius;
    uniform float uGhostFloor;
    uniform float uGhostStrength[MAX_GHOSTS];
    uniform float uGhostFeet[MAX_GHOSTS];
    uniform float uGhostUp;

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
