import { MeshStandardMaterial } from "three";
import { describe, expect, it } from "vitest";

import { applyGhostCutaway, createGhostUniforms } from "./ghost-cutaway";
import { withUnexploredMist } from "./unexplored-fog-material";
import { UNEXPLORED_FOG_STRENGTH } from "../data/unexplored-fog";

describe("unexplored mist material", () => {
  it("preserves the cutaway shader, opaque depth, and prototype ownership", () => {
    const source = new MeshStandardMaterial();
    const ghost = createGhostUniforms(2, 0.15);
    const cutaway = applyGhostCutaway(source, ghost);
    const mist = withUnexploredMist(cutaway);
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: "#include <common>\n#include <project_vertex>",
      fragmentShader:
        "#include <common>\n#include <colorspace_fragment>\n#include <dithering_fragment>",
    };
    mist.onBeforeCompile(shader as never, null as never);
    expect(shader.uniforms.uGhostCount).toBe(ghost.uGhostCount);
    expect(shader.uniforms.uMistStrength).toEqual({
      value: UNEXPLORED_FOG_STRENGTH,
    });
    expect(shader.fragmentShader).toContain("ghostDither");
    expect(shader.vertexShader).toContain("vGhostView = mvPosition.xyz");
    expect(mist.transparent).toBe(false);
    expect(mist.depthWrite).toBe(true);
    expect(mist).not.toBe(cutaway);
    expect(mist.customProgramCacheKey()).not.toBe(
      cutaway.customProgramCacheKey(),
    );
    expect(cutaway.customProgramCacheKey()).toBe("ghost-cutaway");
    mist.dispose();
    cutaway.dispose();
    source.dispose();
  });
});
