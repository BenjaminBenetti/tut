import { describe, expect, it } from "vitest";
import { MeshStandardMaterial, Vector3 } from "three";

import {
  applyGhostCutaway,
  createGhostUniforms,
  GHOST_FOOT_MARGIN,
  GHOST_PLAN_MARGIN,
  ghostPlanDepth,
  ghostsInFrontOf,
  MAX_GHOSTS,
} from "./ghost-cutaway";

/** The tactical camera's pitch: `atan(1 / √2)`, ADR 0005. */
const PITCH = Math.atan(1 / Math.SQRT2);

/** View-space depth gained per world unit of height at the tactical pitch. */
const UP_DEPTH = Math.sin(PITCH);

/**
 * View-space `z` of a point `ahead` tiles toward the camera across the
 * ground and `rise` world units above the unit's feet, relative to the
 * unit's own `z`. Nearer is larger.
 */
function viewZ(ahead: number, rise: number): number {
  return ahead * Math.cos(PITCH) + rise * UP_DEPTH;
}

/** A stand-in for the shader object three hands to `onBeforeCompile`. */
function shaderStub(): {
  uniforms: Record<string, unknown>;
  vertexShader: string;
  fragmentShader: string;
} {
  return {
    uniforms: {},
    vertexShader:
      "#include <common>\nvoid main(){\n#include <project_vertex>\n}",
    fragmentShader:
      "#include <common>\nvoid main(){\n#include <dithering_fragment>\n}",
  };
}

describe("ghost cutaway (#526)", () => {
  it("clones the material rather than ghosting the loader's prototype", () => {
    const prototype = new MeshStandardMaterial({ name: "brick" });
    const uniforms = createGhostUniforms(2, 0.15);

    const ghosted = applyGhostCutaway(prototype, uniforms);

    // Building materials are shared by every instance of a model, so
    // ghosting in place would leak across missions.
    expect(ghosted).not.toBe(prototype);
    expect(prototype.transparent).toBe(false);
    expect(prototype.onBeforeCompile.toString()).not.toContain("uGhostCount");
    // Deliberately opaque: making walls transparent stops them occluding
    // each other and the whole city turns see-through. The cutaway
    // discards instead.
    expect(ghosted.transparent).toBe(false);
    expect(ghosted.depthWrite).toBe(true);
  });

  it("shares one uniform block, so a frame update reaches every material", () => {
    const uniforms = createGhostUniforms(2, 0.15);
    const a = applyGhostCutaway(new MeshStandardMaterial(), uniforms);
    const b = applyGhostCutaway(new MeshStandardMaterial(), uniforms);
    const shaderA = shaderStub();
    const shaderB = shaderStub();

    a.onBeforeCompile(shaderA as never, null as never);
    b.onBeforeCompile(shaderB as never, null as never);

    expect(shaderA.uniforms.uGhostCentres).toBe(shaderB.uniforms.uGhostCentres);
    expect(shaderA.uniforms.uGhostCount).toBe(uniforms.uGhostCount);
    // The controller updates this live array; without its binding the GPU
    // keeps every centre at zero strength, so an indoor unit stays hidden.
    expect(shaderA.uniforms.uGhostStrength).toBe(uniforms.uGhostStrength);
    expect(shaderB.uniforms.uGhostStrength).toBe(uniforms.uGhostStrength);
  });

  it("declares the loop bound as a constant and reads view position", () => {
    const uniforms = createGhostUniforms(2, 0.15);
    const ghosted = applyGhostCutaway(new MeshStandardMaterial(), uniforms);
    const shader = shaderStub();

    ghosted.onBeforeCompile(shader as never, null as never);

    // GLSL requires a compile-time bound on the loop.
    expect(shader.fragmentShader).toContain(`#define MAX_GHOSTS ${MAX_GHOSTS}`);
    // The varying must be written after project_vertex or instanced
    // buildings would all ghost at the prototype's origin.
    const vertex = shader.vertexShader;
    expect(vertex.indexOf("vGhostView = mvPosition.xyz;")).toBeGreaterThan(
      vertex.indexOf("#include <project_vertex>"),
    );
    // Only fragments whose footprint is nearer the camera than the centre
    // fade, or the wall behind the unit would be cut away too (#1132).
    expect(shader.fragmentShader).toContain(
      "float plan = vGhostView.z - rise * uGhostUp;",
    );
    expect(shader.fragmentShader).toContain(
      `plan > centre.z + ${GHOST_PLAN_MARGIN.toFixed(2)}`,
    );
    // Discard, not blend, so surviving fragments still write depth.
    expect(shader.fragmentShader).toContain("discard");
  });

  it("fades only what rises above the unit's feet, so the floor it stands on stays solid (#1118)", () => {
    const uniforms = createGhostUniforms(2, 0.15);
    const ghosted = applyGhostCutaway(new MeshStandardMaterial(), uniforms);
    const shader = shaderStub();

    ghosted.onBeforeCompile(shader as never, null as never);

    // The feet heights reach the program through the shared block, like
    // the centres, so the controller's per-frame write lands.
    expect(shader.uniforms.uGhostFeet).toBe(uniforms.uGhostFeet);
    expect(uniforms.uGhostFeet.value).toHaveLength(MAX_GHOSTS);
    // World height is rebuilt with the instance transform applied, or
    // every instanced slab would be judged at the prototype's origin.
    const vertex = shader.vertexShader;
    expect(vertex).toContain("ghostWorld = instanceMatrix * ghostWorld;");
    expect(vertex).toContain("vGhostWorldY = ghostWorld.y;");
    expect(vertex.indexOf("vGhostWorldY = ghostWorld.y;")).toBeGreaterThan(
      vertex.indexOf("#include <project_vertex>"),
    );
    // Depth and height are one conjunction: a slab in front of the unit
    // at its own level is nearer the camera and still must not fade.
    expect(shader.fragmentShader).toContain(
      "float rise = vGhostWorldY - uGhostFeet[i];",
    );
    expect(shader.fragmentShader).toContain(
      `plan > centre.z + ${GHOST_PLAN_MARGIN.toFixed(2)} && rise > ${GHOST_FOOT_MARGIN.toFixed(2)}`,
    );
    // Below a wall's height and above float noise on the floor plane.
    expect(GHOST_FOOT_MARGIN).toBeGreaterThan(0);
    expect(GHOST_FOOT_MARGIN).toBeLessThan(0.75);
  });

  it("compares plan depth, so a tall wall behind the unit stays solid (#1132)", () => {
    const uniforms = createGhostUniforms(2, 0.15);
    const ghosted = applyGhostCutaway(new MeshStandardMaterial(), uniforms);
    const shader = shaderStub();

    ghosted.onBeforeCompile(shader as never, null as never);

    // The per-frame up-depth reaches the program through the shared block.
    expect(shader.uniforms.uGhostUp).toBe(uniforms.uGhostUp);
    expect(shader.fragmentShader).toContain("uniform float uGhostUp;");
    // And the old test — raw view depth against the centre — is gone: it
    // is exactly what faded the far wall of every room.
    expect(shader.fragmentShader).not.toContain("vGhostView.z > centre.z");
  });

  describe("ghostsInFrontOf, the CPU mirror of the shader's test (#1132)", () => {
    const centre = { viewZ: -20, feetY: 0 };
    /** A fragment `ahead` tiles toward the camera and `rise` above the feet. */
    const fragment = (
      ahead: number,
      rise: number,
    ): { viewZ: number; worldY: number } => ({
      viewZ: centre.viewZ + viewZ(ahead, rise),
      worldY: centre.feetY + rise,
    });

    it("takes the rise back out of the depth", () => {
      // Whatever height a fragment stands at, its plan depth is its
      // footprint's: a tile ahead across the ground.
      for (const rise of [0, 0.75, 1.5, 3]) {
        const f = fragment(1, rise);
        expect(
          ghostPlanDepth(f.viewZ, f.worldY, centre.feetY, UP_DEPTH),
        ).toBeCloseTo(centre.viewZ + Math.cos(PITCH), 6);
      }
    });

    it("fades a wall a tile in front of the unit", () => {
      expect(ghostsInFrontOf(fragment(1, 1), centre, UP_DEPTH)).toBe(true);
      expect(ghostsInFrontOf(fragment(1, 0.5), centre, UP_DEPTH)).toBe(true);
    });

    it("keeps a wall a tile behind the unit solid, however tall", () => {
      // At the tactical pitch a 1.5 u wall a tile behind is nearer the
      // camera than the feet by 0.05 from its top — the old rule faded
      // it; the plan rule reads it as behind.
      const behind = fragment(-1, 1.5);
      expect(behind.viewZ).toBeGreaterThan(centre.viewZ);
      expect(ghostsInFrontOf(behind, centre, UP_DEPTH)).toBe(false);
      expect(ghostsInFrontOf(fragment(-1, 3), centre, UP_DEPTH)).toBe(false);
      expect(ghostsInFrontOf(fragment(-2, 6), centre, UP_DEPTH)).toBe(false);
    });

    it("keeps what stands on the unit's own row solid, at the centre's depth", () => {
      expect(ghostsInFrontOf(fragment(0, 1.5), centre, UP_DEPTH)).toBe(false);
      // Just inside the margin: not yet; just past it: fades.
      const edge = (GHOST_PLAN_MARGIN / Math.cos(PITCH)) * 0.9;
      expect(ghostsInFrontOf(fragment(edge, 1), centre, UP_DEPTH)).toBe(false);
      expect(ghostsInFrontOf(fragment(edge / 0.81, 1), centre, UP_DEPTH)).toBe(
        true,
      );
    });

    it("never fades the floor the unit stands on, even in front of it (#1118)", () => {
      expect(ghostsInFrontOf(fragment(2, 0), centre, UP_DEPTH)).toBe(false);
      expect(
        ghostsInFrontOf(fragment(2, GHOST_FOOT_MARGIN), centre, UP_DEPTH),
      ).toBe(false);
    });
  });

  it("gives the ghosted program its own cache key", () => {
    const uniforms = createGhostUniforms(2, 0.15);
    const plain = new MeshStandardMaterial();
    const ghosted = applyGhostCutaway(plain, uniforms);

    expect(ghosted.customProgramCacheKey()).not.toBe(
      plain.customProgramCacheKey(),
    );
  });

  it("sizes the centre array for the whole force up front", () => {
    const uniforms = createGhostUniforms(2, 0.15);

    expect(MAX_GHOSTS).toBe(8);
    expect(uniforms.uGhostCentres.value).toHaveLength(MAX_GHOSTS);
    expect(uniforms.uGhostCentres.value[0]).toBeInstanceOf(Vector3);
    expect(uniforms.uGhostCount.value).toBe(0);
  });
});
