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

/** Where the falloff reaches full transparency, as a fraction of the radius. */
const CORE_FRACTION = 0.45;

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
  };
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
 * is what makes it XCOM's effect.
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

const VERTEX_HEAD = "varying vec3 vGhostView;";

const VERTEX_BODY = "vGhostView = mvPosition.xyz;";

const FRAGMENT_BODY = `
  float ghostAlpha = 1.0;
  for (int i = 0; i < MAX_GHOSTS; i++) {
    if (i >= uGhostCount) break;
    vec3 centre = uGhostCentres[i];
    // View space looks down -z, so a larger z is nearer the camera.
    if (vGhostView.z > centre.z) {
      float d = length(vGhostView.xy - centre.xy);
      float f = smoothstep(uGhostRadius, uGhostRadius * ${CORE_FRACTION.toFixed(2)}, d);
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
    uniform int uGhostCount;
    uniform vec3 uGhostCentres[MAX_GHOSTS];
    uniform float uGhostRadius;
    uniform float uGhostFloor;

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
