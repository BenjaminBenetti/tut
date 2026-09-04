import { describe, expect, it } from "vitest";
import { MeshStandardMaterial, Vector3 } from "three";

import {
  applyGhostCutaway,
  createGhostUniforms,
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

    expect(uniforms.uGhostCentres.value).toHaveLength(MAX_GHOSTS);
    expect(uniforms.uGhostCentres.value[0]).toBeInstanceOf(Vector3);
    expect(uniforms.uGhostCount.value).toBe(0);
  });
});
