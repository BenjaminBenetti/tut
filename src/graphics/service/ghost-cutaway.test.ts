import { describe, expect, it } from "vitest";
import {
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  Vector3,
} from "three";

import {
  applyGhostCutaway,
  createGhostUniforms,
  GHOST_FOOT_MARGIN,
  GHOST_RAY_MARGIN,
  GHOST_SAMPLES,
  GHOST_SOFT_EDGE,
  ghostFade,
  ghostSamples,
  ghostsAlongRay,
  MAX_GHOSTS,
} from "./ghost-cutaway";
import { GhostController } from "./ghost-controller";

/** The tactical camera's pitch: `atan(1 / √2)`, ADR 0005. */
const PITCH = Math.atan(1 / Math.SQRT2);

/** The ray radius the scene ships with (`tactical-scene-builder`). */
const RADIUS = 0.6;

/**
 * A camera at the tactical pitch looking at the origin from +z, so
 * "toward the camera" is +z in world space and "up" is +y.
 */
function pitchedCamera(): OrthographicCamera {
  const cam = new OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
  cam.position.set(0, 20 * Math.sin(PITCH), 20 * Math.cos(PITCH));
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  return cam;
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
    // Rays, not a plane (#1134): every sample is tried, and a fragment
    // is on a ray when it is nearer the camera than that sample.
    expect(shader.fragmentShader).toContain(
      `#define GHOST_SAMPLES ${GHOST_SAMPLES}`,
    );
    expect(shader.fragmentShader).toContain(
      `vGhostView.z > spot.z + ${GHOST_RAY_MARGIN.toFixed(2)}`,
    );
    expect(shader.fragmentShader).toContain(
      "nearest = min(nearest, length(vGhostView.xy - spot.xy));",
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
    // The feet test runs before any ray is tried: a slab in front of the
    // unit at its own level is nearer the camera and still must not fade.
    expect(shader.fragmentShader).toContain(
      "float rise = vGhostWorldY - uGhostFeet[i];",
    );
    expect(shader.fragmentShader).toContain(
      `if (rise <= ${GHOST_FOOT_MARGIN.toFixed(2)}) continue;`,
    );
    // Below a wall's height and above float noise on the floor plane.
    expect(GHOST_FOOT_MARGIN).toBeGreaterThan(0);
    expect(GHOST_FOOT_MARGIN).toBeLessThan(0.75);
  });

  it("binds the unit's box edges, and the old plane test is gone (#1134)", () => {
    const uniforms = createGhostUniforms(2, 0.15);
    const ghosted = applyGhostCutaway(new MeshStandardMaterial(), uniforms);
    const shader = shaderStub();

    ghosted.onBeforeCompile(shader as never, null as never);

    for (const name of ["uGhostRight", "uGhostForward", "uGhostUpVec"]) {
      expect(shader.uniforms[name]).toBe(
        uniforms[name as keyof typeof uniforms],
      );
      expect(shader.fragmentShader).toContain(
        `uniform vec3 ${name}[MAX_GHOSTS];`,
      );
    }
    // A plane through the unit faded walls off to the side; a radius
    // around its centre faded the wall behind it. Neither test remains.
    expect(shader.fragmentShader).not.toContain("uGhostUp;");
    expect(shader.fragmentShader).not.toContain("vGhostView.z > centre.z");
    expect(shader.fragmentShader).not.toContain(
      "length(vGhostView.xy - centre.xy)",
    );
  });

  describe("ghostsAlongRay, the CPU mirror of the shader's test (#1134)", () => {
    const sample = { x: 1, y: 2, z: -20 };

    it("is on the ray when nearer the camera and within the radius on the view plane", () => {
      expect(ghostsAlongRay(sample, { x: 1.2, y: 2.1, z: -19 }, RADIUS)).toBe(
        true,
      );
    });

    it("is off the ray when farther from the camera, however close across the view", () => {
      expect(ghostsAlongRay(sample, { x: 1, y: 2, z: -21 }, RADIUS)).toBe(
        false,
      );
      expect(ghostsAlongRay(sample, { x: 1, y: 2, z: -20 }, RADIUS)).toBe(
        false,
      );
      expect(
        ghostsAlongRay(
          sample,
          { x: 1, y: 2, z: -20 + GHOST_RAY_MARGIN * 0.9 },
          RADIUS,
        ),
      ).toBe(false);
    });

    it("is off the ray when beside it on the view plane, however near", () => {
      expect(
        ghostsAlongRay(sample, { x: 1 + RADIUS * 1.1, y: 2, z: -10 }, RADIUS),
      ).toBe(false);
    });

    it("leaves from the corners and the spine of the unit, in the shader's order", () => {
      const centre = { x: 0, y: 0, z: 0 };
      const right = { x: 1, y: 0, z: 0 };
      const forward = { x: 0, y: 0, z: 1 };
      const up = { x: 0, y: 2, z: 0 };
      const samples = ghostSamples(centre, right, forward, up);
      expect(samples).toHaveLength(GHOST_SAMPLES);
      expect(samples[0]).toEqual({ x: -1, y: 0, z: -1 });
      expect(samples[3]).toEqual({ x: 1, y: 0, z: 1 });
      expect(samples[4]).toEqual({ x: -1, y: 2, z: -1 });
      expect(samples[7]).toEqual({ x: 1, y: 2, z: 1 });
      expect(samples[8]).toEqual({ x: 0, y: 2, z: 0 });
      expect(samples[9]).toEqual({ x: 0, y: 1, z: 0 });
      expect(samples[10]).toEqual({ x: 0, y: 0, z: 0 });
    });
  });

  describe("ghostFade on a room, through the tactical camera (#1134)", () => {
    /**
     * A one-tile squad at the origin, a unit tall, seen through the
     * pitched camera: the controller fills the uniforms exactly as the
     * scene does, and world fragments are judged through the same
     * camera. Toward the camera is +z.
     */
    const cam = pitchedCamera();
    const uniforms = createGhostUniforms(RADIUS, 0.15);
    const object = new Object3D();
    object.updateMatrixWorld(true);
    new GhostController(
      cam,
      () => [{ object, halfWidth: 0.5, height: 1 }],
      uniforms,
    ).update(1);
    const ghost = {
      centre: uniforms.uGhostCentres.value[0]!,
      right: uniforms.uGhostRight.value[0]!,
      forward: uniforms.uGhostForward.value[0]!,
      up: uniforms.uGhostUpVec.value[0]!,
      feetY: 0,
    };
    /** Fade for a fragment at a world point. */
    const fadeAt = (x: number, y: number, z: number): number => {
      const view = new Vector3(x, y, z).applyMatrix4(cam.matrixWorldInverse);
      return ghostFade(ghost, { view, worldY: y }, RADIUS);
    };

    it("fades the wall directly in front of the unit", () => {
      expect(fadeAt(0, 1, 1)).toBeGreaterThan(0.9);
      expect(fadeAt(0.4, 0.8, 1)).toBeGreaterThan(0.5);
    });

    it("keeps a wall in front but two tiles to the side solid", () => {
      // Nearer the camera than every sample, and it would have faded
      // under the plane rule; no ray from the unit passes through it.
      expect(fadeAt(2, 1, 1)).toBe(0);
      expect(fadeAt(-2, 0.5, 1)).toBe(0);
      expect(fadeAt(2, 1.4, 0.5)).toBe(0);
    });

    it("keeps the wall behind the unit solid, however tall", () => {
      expect(fadeAt(0, 1, -1)).toBe(0);
      expect(fadeAt(0, 1.5, -1)).toBe(0);
      expect(fadeAt(0, 3, -2)).toBe(0);
    });

    it("never fades the floor the unit stands on, even in front of it (#1118)", () => {
      expect(fadeAt(0, 0, 0.4)).toBe(0);
      expect(fadeAt(0.3, GHOST_FOOT_MARGIN, 0.3)).toBe(0);
    });

    it("fades a roof over the unit", () => {
      // Straight over the head the roof sits on the rim of the head ray
      // (half a unit up projects 0.41 across the view); the slab just in
      // front of the head, where the camera actually looks through, is
      // fully on it.
      expect(fadeAt(0, 1.5, 0)).toBeGreaterThan(0.5);
      expect(fadeAt(0, 1.5, 0.5)).toBeGreaterThan(0.9);
    });

    it("keeps the wall on the far edge of the tile beside the unit solid at every height", () => {
      for (const y of [0.5, 1, 1.4]) {
        expect(fadeAt(1.5, y, 0)).toBe(0);
      }
    });

    it("fades the wall on the unit's own tile edge where its rays cross it", () => {
      // The east edge at the unit's row: the ray from the back-east corner
      // of the feet reaches the camera through it, a little way up.
      expect(fadeAt(0.5, 0.4, 0)).toBeGreaterThan(0.5);
    });

    it("softens over the last part of the radius rather than cutting", () => {
      // Sliding a fragment in front of the unit sideways: full fade
      // inside, nothing outside, something in between.
      const inside = fadeAt(0, 1, 1);
      const rim = fadeAt(RADIUS + 0.5 - GHOST_SOFT_EDGE / 2, 1, 1);
      const outside = fadeAt(RADIUS + 0.5 + 0.1, 1, 1);
      expect(inside).toBeGreaterThan(rim);
      expect(rim).toBeGreaterThan(0);
      expect(outside).toBe(0);
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
