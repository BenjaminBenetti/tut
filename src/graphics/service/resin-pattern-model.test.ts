/// <reference types="node" />
import { readFileSync } from "node:fs";
import { Box3, Mesh, Texture } from "three";
import type { Object3D, Group, BufferGeometry, Material } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { beforeAll, describe, expect, it } from "vitest";
import { MODEL_MANIFEST } from "../data/model-manifest";
import { ResinPatternModelFactory } from "./resin-pattern-model";
import type { ResinPatternAppearance } from "../model/resin-pattern-appearance";

/** Loads actual production geometry without decoding its external atlas. */
async function source(name: "a" | "b"): Promise<Group> {
  const bytes = readFileSync(
    `public/${MODEL_MANIFEST[`infestation.resin.ground-${name}`].path}`,
  );
  const loader = new GLTFLoader().register(() => ({
    name: "resin-test-texture",
    loadTexture: () => Promise.resolve(new Texture()),
  }));
  return (
    await loader.parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    )
  ).scene;
}

/** Unique seam samples in the shared coordinate system, including source material. */
function seam(root: Object3D, axis: "x" | "z", at: number): string[] {
  const samples = new Set<string>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const mesh = object as Mesh<BufferGeometry, Material>;
    const position = mesh.geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) {
      const along = axis === "x" ? position.getX(i) : position.getZ(i);
      if (Math.abs(along - at) > 1e-6) continue;
      const cross = axis === "x" ? position.getZ(i) : position.getX(i);
      if (Math.abs(cross) > 0.49999) continue;
      samples.add(
        `${mesh.material.name}:${cross.toFixed(4)}:${position.getY(i).toFixed(4)}`,
      );
    }
  });
  return [...samples].sort();
}

/** Disposes only the owned slice geometry, as the production cache does. */
function release(root: Object3D): void {
  root.traverse((object) => {
    if (object instanceof Mesh) (object as Mesh).geometry.dispose();
  });
}

describe("continuous authored resin network", () => {
  let sparse: Group, mature: Group;
  let factory: ResinPatternModelFactory;
  beforeAll(async () => {
    [sparse, mature] = await Promise.all([source("a"), source("b")]);
    factory = new ResinPatternModelFactory(sparse);
  });
  const base: ResinPatternAppearance = {
    x: 2,
    z: 2,
    turns: 0,
    neighbours: 255,
    growth: 0.6,
  };

  it("retains authored vertex identity through its growth morph", () => {
    const grown = sparse.clone(true);
    grown.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const mesh = o as Mesh;
      const target = mesh.geometry.morphAttributes.position?.[0];
      expect(target?.count).toBe(mesh.geometry.getAttribute("position").count);
      expect(mesh.geometry.morphTargetsRelative).toBe(true);
      o.morphTargetInfluences![0] = 1;
    });
    const expected = new Box3().setFromObject(mature, true);
    const actual = new Box3().setFromObject(grown, true);
    for (const axis of ["x", "y", "z"] as const) {
      expect(actual.min[axis]).toBeCloseTo(expected.min[axis], 4);
      expect(actual.max[axis]).toBeCloseTo(expected.max[axis], 4);
    }
  });

  it("joins real strands exactly across cells, rotations and the six-tile wrap", () => {
    for (const turns of [0, 1, 2, 3] as const)
      for (const x of [2, 5]) {
        const left = factory.create({ ...base, turns, x });
        const right = factory.create({
          ...base,
          turns,
          x: (x + 1) % 6,
        });
        expect(seam(left, "x", 0.5).length).toBeGreaterThan(0);
        expect(seam(left, "x", 0.5)).toEqual(seam(right, "x", -0.5));
        release(left);
        release(right);
      }
    const north = factory.create({ ...base, z: 5 });
    const south = factory.create({ ...base, z: 0 });
    expect(seam(north, "z", 0.5)).toEqual(seam(south, "z", -0.5));
    release(north);
    release(south);
  });

  it("tapers isolated growth inside the marked tile and keeps connected edges intact", () => {
    const isolated = factory.create({ ...base, neighbours: 0 });
    const connected = factory.create(base);
    const bounds = new Box3().setFromObject(isolated);
    expect(bounds.min.x).toBeGreaterThanOrEqual(-0.40001);
    expect(bounds.max.x).toBeLessThanOrEqual(0.40001);
    expect(bounds.min.z).toBeGreaterThanOrEqual(-0.40001);
    expect(bounds.max.z).toBeLessThanOrEqual(0.40001);
    expect(seam(connected, "x", 0.5).length).toBeGreaterThan(0);
    expect(seam(isolated, "x", 0.5)).toEqual([]);
    release(isolated);
    release(connected);
  });

  it("keeps a tapered boundary connected beside a concave clean corner", () => {
    // Both cells connect east/west; only the western one has a northern neighbour.
    const west = factory.create({ ...base, neighbours: 1 | 4 });
    const east = factory.create({ ...base, x: 3, neighbours: 64 | 128 });
    expect(seam(west, "x", 0.5)).toEqual(seam(east, "x", -0.5));
    release(west);
    release(east);
  });

  it("gives every marked cell visible geometry even in the sparse endpoint", () => {
    for (let z = 0; z < 6; z++)
      for (let x = 0; x < 6; x++) {
        const patch = factory.create({
          ...base,
          x,
          z,
          growth: 0,
          neighbours: 0,
        });
        const bounds = new Box3().setFromObject(patch);
        expect(bounds.isEmpty(), `empty resin cell ${x},${z}`).toBe(false);
        expect(bounds.max.y - bounds.min.y).toBeGreaterThan(0.003);
        release(patch);
      }
  });

  it("samples a shared half-ramp from the same network instead of squeezing a full tile", () => {
    const whole = factory.create(base);
    const half = factory.create({
      ...base,
      width: 0.5,
      offsetX: 0.25,
    });
    const bounds = new Box3().setFromObject(half);
    expect(bounds.min.x).toBeCloseTo(-0.25);
    expect(bounds.max.x).toBeCloseTo(0.25);
    expect(seam(whole, "x", 0.5)).toEqual(seam(half, "x", 0.25));
    release(whole);
    release(half);
  });
});
