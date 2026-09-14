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
  GHOST_BODY_SAMPLES,
  GHOST_FOOT_MARGIN,
  GHOST_RAY_MARGIN,
  GHOST_RING_MARGIN,
  GHOST_RING_SAMPLES,
  GHOST_SAMPLES,
  GHOST_SOFT_EDGE,
  ghostFade,
  ghostReach,
  ghostRingSpread,
  ghostSamples,
  ghostsAlongRay,
  MAX_GHOSTS,
} from "./ghost-cutaway";
import { GhostController } from "./ghost-controller";

/** The tactical camera's pitch: `atan(1 / √2)`, ADR 0005. */
const PITCH = Math.atan(1 / Math.SQRT2);

/** The ray radius the scene ships with (`tactical-scene-builder`), since #1138. */
const RADIUS = 1.2;

/** The waist ring's distance in half-footprints for a one-tile unit (#1138). */
const SQUAD_SPREAD = ghostRingSpread(0.5);

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

  it("binds the precomputed spots and reach, and the old plane test is gone (#1134)", () => {
    const uniforms = createGhostUniforms(2, 0.15);
    const ghosted = applyGhostCutaway(new MeshStandardMaterial(), uniforms);
    const shader = shaderStub();

    ghosted.onBeforeCompile(shader as never, null as never);

    // The sample points arrive as one flat uniform, built on the CPU
    // once per unit per frame; the shader no longer derives them from
    // the box edges per fragment, which cost SwiftShader half its
    // frame budget on the e2e shard.
    expect(shader.uniforms.uGhostSpots).toBe(uniforms.uGhostSpots);
    expect(shader.uniforms.uGhostReach).toBe(uniforms.uGhostReach);
    expect(shader.fragmentShader).toContain(
      "uniform vec3 uGhostSpots[MAX_GHOSTS * GHOST_SAMPLES];",
    );
    expect(shader.fragmentShader).toContain(
      "uniform float uGhostReach[MAX_GHOSTS];",
    );
    expect(shader.fragmentShader).toContain(
      "vec3 spot = uGhostSpots[i * GHOST_SAMPLES + s];",
    );
    expect(shader.fragmentShader).not.toContain("ghostSampleOffset");
    for (const name of ["uGhostRight", "uGhostForward", "uGhostUpVec"]) {
      expect(shader.fragmentShader).not.toContain(name);
    }
    // The bounding-circle reject sits after the feet test and before
    // the sample loop, so most fragments pay one length per ghost.
    const body = shader.fragmentShader;
    const reject = body.indexOf(
      "if (length(vGhostView.xy - uGhostCentres[i].xy) > uGhostReach[i]) continue;",
    );
    expect(reject).toBeGreaterThan(
      body.indexOf(`if (rise <= ${GHOST_FOOT_MARGIN.toFixed(2)}) continue;`),
    );
    expect(reject).toBeLessThan(
      body.indexOf("for (int s = 0; s < GHOST_SAMPLES; s++)"),
    );
    // A plane through the unit faded walls off to the side; a radius
    // around its centre faded the wall behind it. Neither test remains.
    expect(shader.fragmentShader).not.toContain("uGhostUp;");
    expect(shader.fragmentShader).not.toContain("vGhostView.z > centre.z");
    expect(shader.fragmentShader).not.toContain(
      "length(vGhostView.xy - centre.xy)",
    );
  });

  it("keeps the GLSL free of reserved words, since no test compiles it (#1134)", () => {
    const uniforms = createGhostUniforms(2, 0.15);
    const ghosted = applyGhostCutaway(new MeshStandardMaterial(), uniforms);
    const shader = shaderStub();

    ghosted.onBeforeCompile(shader as never, null as never);

    const glsl = `${shader.vertexShader}\n${shader.fragmentShader}`
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    for (const word of [
      "sample",
      "input",
      "output",
      "filter",
      "cast",
      "namespace",
      "using",
      "sizeof",
    ]) {
      expect(glsl).not.toMatch(new RegExp(`\\b${word}\\b`));
    }
  });

  describe("ghostReach, the bounding circle the shader rejects outside (#1134)", () => {
    const centre = { x: 0, y: 0, z: 0 };
    const spots = ghostSamples(
      centre,
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0.5, z: 0.5 },
      { x: 0, y: 2, z: -1 },
      2,
    );

    it("is the farthest sample across the view plane plus the ray radius", () => {
      // The far head corner: x = 1, y = 0.5 + 2, depth ignored. The ring
      // at two half-footprints reaches y = 2 at most, inside that.
      expect(ghostReach(centre, spots, RADIUS)).toBeCloseTo(
        Math.hypot(1, 2.5) + RADIUS,
        9,
      );
    });

    it("covers every sample's ray, so the reject never drops a fragment the loop would fade", () => {
      const reach = ghostReach(centre, spots, RADIUS);
      for (const spot of spots) {
        expect(Math.hypot(spot.x, spot.y) + RADIUS).toBeLessThanOrEqual(
          reach + 1e-9,
        );
      }
    });
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
      const samples = ghostSamples(centre, right, forward, up, 2);
      expect(samples).toHaveLength(GHOST_SAMPLES);
      expect(samples[0]).toEqual({ x: -1, y: 0, z: -1 });
      expect(samples[3]).toEqual({ x: 1, y: 0, z: 1 });
      expect(samples[4]).toEqual({ x: -1, y: 2, z: -1 });
      expect(samples[7]).toEqual({ x: 1, y: 2, z: 1 });
      expect(samples[8]).toEqual({ x: 0, y: 2, z: 0 });
      expect(samples[9]).toEqual({ x: 0, y: 1, z: 0 });
      expect(samples[10]).toEqual({ x: 0, y: 0, z: 0 });
    });

    it("then leaves from a ring at waist height, `spread` half-footprints out (#1138)", () => {
      const centre = { x: 0, y: 0, z: 0 };
      const right = { x: 1, y: 0, z: 0 };
      const forward = { x: 0, y: 0, z: 1 };
      const up = { x: 0, y: 2, z: 0 };
      const samples = ghostSamples(centre, right, forward, up, 2);
      const ring = samples.slice(GHOST_BODY_SAMPLES);
      expect(ring).toHaveLength(GHOST_RING_SAMPLES);
      expect(GHOST_SAMPLES).toBe(GHOST_BODY_SAMPLES + GHOST_RING_SAMPLES);
      // Evenly spaced from +right toward +forward, every point at the
      // waist and two half-footprints from the centre.
      const near = (
        point: { x: number; y: number; z: number },
        x: number,
        z: number,
      ): void => {
        expect(point.x).toBeCloseTo(x, 9);
        expect(point.y).toBeCloseTo(1, 9);
        expect(point.z).toBeCloseTo(z, 9);
      };
      near(ring[0]!, 2, 0);
      near(ring[2]!, 0, 2);
      near(ring[4]!, -2, 0);
      near(ring[6]!, 0, -2);
      near(ring[1]!, Math.SQRT2, Math.SQRT2);
      for (const point of ring) {
        expect(Math.hypot(point.x, point.z)).toBeCloseTo(2, 9);
      }
    });

    it("puts the ring a fixed margin outside the footprint, whatever the unit's size (#1138)", () => {
      // A one-tile squad's ring is a tile and a quarter out; a two-tile
      // mech's is not two and a half, because the margin is in world
      // units and the spread is what scales it back to the box edges.
      expect(ghostRingSpread(0.5) * 0.5).toBeCloseTo(
        0.5 + GHOST_RING_MARGIN,
        9,
      );
      expect(ghostRingSpread(1) * 1).toBeCloseTo(1 + GHOST_RING_MARGIN, 9);
      expect(GHOST_RING_MARGIN).toBeGreaterThan(0);
      expect(GHOST_RING_MARGIN).toBeLessThan(1);
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
      spots: uniforms.uGhostSpots.value.slice(0, GHOST_SAMPLES),
      reach: uniforms.uGhostReach.value[0]!,
      feetY: 0,
    };
    /** Fade for a fragment at a world point. */
    const fadeAt = (x: number, y: number, z: number): number => {
      const view = new Vector3(x, y, z).applyMatrix4(cam.matrixWorldInverse);
      return ghostFade(ghost, { view, worldY: y }, RADIUS);
    };

    it("fills the ring from the unit's own footprint (#1138)", () => {
      // The controller derives the spread from the subject's half width,
      // so the ring sits GHOST_RING_MARGIN outside a one-tile footprint.
      const ring = ghost.spots.slice(GHOST_BODY_SAMPLES);
      expect(ring).toHaveLength(GHOST_RING_SAMPLES);
      expect(SQUAD_SPREAD * 0.5).toBeCloseTo(0.5 + GHOST_RING_MARGIN, 9);
      // The reach covers the ring: the farthest ring point across the
      // view plus the radius is within it.
      for (const spot of ring) {
        expect(
          Math.hypot(spot.x - ghost.centre.x, spot.y - ghost.centre.y) + RADIUS,
        ).toBeLessThanOrEqual(ghost.reach + 1e-9);
      }
    });

    it("fades the wall directly in front of the unit", () => {
      expect(fadeAt(0, 1, 1)).toBeGreaterThan(0.9);
      expect(fadeAt(0.4, 0.8, 1)).toBeGreaterThan(0.5);
    });

    it("opens the cone: a wall in front and two tiles to the side fades with the ring (#1138)", () => {
      // The body rays alone left this solid, and the Executive Director
      // saw a window the shape of the unit with nothing around it. The
      // ring's ray from a tile and a quarter out passes through it.
      expect(fadeAt(2, 1, 1)).toBeGreaterThan(0);
      expect(fadeAt(-2, 0.5, 1)).toBeGreaterThan(0);
    });

    it("keeps a wall in front but three tiles to the side solid", () => {
      // Nearer the camera than every sample, and it would have faded
      // under the plane rule; no ray from the unit or its ring passes
      // through it, so the building keeps its shape past the cone.
      expect(fadeAt(3, 1, 1)).toBe(0);
      expect(fadeAt(-3, 0.5, 1)).toBe(0);
      expect(fadeAt(3, 1.4, 0.5)).toBe(0);
    });

    it("keeps a wall well behind the unit solid, however tall", () => {
      // Farther from the camera than every sample, the ring's back
      // included: nothing there is on a ray.
      expect(fadeAt(0, 1, -3)).toBe(0);
      expect(fadeAt(0, 1.5, -3)).toBe(0);
      expect(fadeAt(0, 3, -2)).toBe(0);
    });

    it("opens the wall a tile behind the unit above its base, so the tiles beyond read (#1138)", () => {
      // The ring's back point is a tile and a quarter behind the unit,
      // so the wall a tile behind is in front of it and fades from the
      // waist band up; its base holds through the foot margin.
      expect(fadeAt(0, 1, -1)).toBeGreaterThan(0);
      expect(fadeAt(0, GHOST_FOOT_MARGIN, -1)).toBe(0);
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

    it("opens the wall on the far edge of the tile beside the unit, and keeps the next one solid (#1138)", () => {
      // The tile beside the unit is inside the cone the ring opens: its
      // far edge, a tile and a half out, fades at every height above
      // the feet. The far edge of the second tile out is past every
      // ray, so the room's shape survives.
      for (const y of [0.5, 1, 1.4]) {
        expect(fadeAt(1.5, y, 0)).toBeGreaterThan(0);
        expect(fadeAt(2.5, y, 0)).toBe(0);
      }
    });

    it("fades the wall on the unit's own tile edge where its rays cross it", () => {
      // The east edge at the unit's row: the ray from the back-east corner
      // of the feet reaches the camera through it, a little way up.
      expect(fadeAt(0.5, 0.4, 0)).toBeGreaterThan(0.5);
    });

    it("rejects outside the reach exactly where the full loop would find nothing (#1134)", () => {
      // The early reject must not change the picture: over a grid around
      // the unit, the fade with the reach applied equals the fade with
      // the reach lifted, so every fragment it drops was zero anyway.
      const lifted = { ...ghost, reach: Number.POSITIVE_INFINITY };
      let rejected = 0;
      let faded = 0;
      for (let x = -4; x <= 4; x += 0.25) {
        for (let y = 0.5; y <= 3; y += 0.25) {
          for (let z = -3; z <= 4; z += 0.25) {
            const view = new Vector3(x, y, z).applyMatrix4(
              cam.matrixWorldInverse,
            );
            const fragment = { view, worldY: y };
            const withReach = ghostFade(ghost, fragment, RADIUS);
            const withoutReach = ghostFade(lifted, fragment, RADIUS);
            expect(withReach).toBe(withoutReach);
            if (
              Math.hypot(view.x - ghost.centre.x, view.y - ghost.centre.y) >
              ghost.reach
            ) {
              rejected++;
            }
            if (withReach > 0) faded++;
          }
        }
      }
      // The grid exercises both branches, or the equality proves nothing.
      expect(rejected).toBeGreaterThan(0);
      expect(faded).toBeGreaterThan(0);
    });

    it("softens over the last part of the radius rather than cutting", () => {
      // Sliding a fragment in front of the unit sideways: full fade
      // inside, nothing outside, something in between. The rim is now
      // the ring's (#1138): its side point is a tile and a quarter out,
      // so the soft band lies between ring + radius − soft and ring +
      // radius across the view.
      const ring = 0.5 + GHOST_RING_MARGIN;
      const inside = fadeAt(0, 1, 1);
      const rim = fadeAt(ring + RADIUS - GHOST_SOFT_EDGE / 2, 1, 1);
      const outside = fadeAt(ring + RADIUS + 0.15, 1, 1);
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
