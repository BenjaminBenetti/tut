import { describe, expect, it } from "vitest";
import { MeshStandardMaterial, Vector3 } from "three";

import {
  applyGhostCutaway,
  createGhostUniforms,
  GHOST_FOOT_MARGIN,
  MAX_GHOSTS,
} from "./ghost-cutaway";

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
    // Only fragments nearer the camera than the centre fade, or the wall
    // behind the unit would be cut away too.
    expect(shader.fragmentShader).toContain("vGhostView.z > centre.z");
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
      `vGhostView.z > centre.z && vGhostWorldY > uGhostFeet[i] + ${GHOST_FOOT_MARGIN.toFixed(2)}`,
    );
    // Below a wall's height and above float noise on the floor plane.
    expect(GHOST_FOOT_MARGIN).toBeGreaterThan(0);
    expect(GHOST_FOOT_MARGIN).toBeLessThan(0.75);
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
