import type { BoxGeometry } from "three";
import { InstancedMesh, Mesh } from "three";
import { describe, expect, it } from "vitest";

import {
  PLACEHOLDER_MAP_SIZE,
  PlaceholderTacticalView,
  SCALE_REFERENCES,
} from "./placeholder-tactical-view";

describe("PlaceholderTacticalView", () => {
  it("lays out a 16×16 checkerboard as two instanced meshes", () => {
    const view = new PlaceholderTacticalView();
    const ground = view.root.children.filter(
      (child): child is InstancedMesh => child instanceof InstancedMesh,
    );
    expect(ground.map((mesh) => mesh.name).sort()).toEqual([
      "ground-env-dirt",
      "ground-env-grass",
    ]);
    const total = ground.reduce((sum, mesh) => sum + mesh.count, 0);
    expect(total).toBe(PLACEHOLDER_MAP_SIZE * PLACEHOLDER_MAP_SIZE);
  });

  it("centres the camera target on the map", () => {
    expect(new PlaceholderTacticalView().centre).toEqual({ x: 8, y: 0, z: 8 });
    expect(new PlaceholderTacticalView(10).centre).toEqual({
      x: 5,
      y: 0,
      z: 5,
    });
  });

  it("stands scale boxes of 0.9, 1.5 and 2.6 units on the ground", () => {
    const view = new PlaceholderTacticalView();
    const heights = SCALE_REFERENCES.map((reference) => {
      const mesh = view.root.getObjectByName(`scale-${reference.id}`);
      if (!(mesh instanceof Mesh)) {
        throw new Error(`Missing scale box ${reference.id}`);
      }
      const geometry = mesh.geometry as BoxGeometry;
      // Bottom face sits on y = 0.
      expect(mesh.position.y - geometry.parameters.height / 2).toBeCloseTo(0);
      expect(mesh.position.x).toBe(reference.tile.x + 0.5);
      expect(mesh.position.z).toBe(reference.tile.z + 0.5);
      return geometry.parameters.height;
    });
    expect(heights).toEqual([0.9, 1.5, 2.6]);
  });

  it("names materials after their palette tokens", () => {
    const view = new PlaceholderTacticalView();
    const names = new Set<string>();
    view.root.traverse((object) => {
      if (object instanceof Mesh) {
        const material = object.material as { name: string };
        names.add(material.name);
      }
    });
    expect([...names].sort()).toEqual([
      "env-concrete",
      "env-dirt",
      "env-grass",
      "tdf-grey-mid",
      "tdf-olive",
    ]);
  });

  it("dispose empties the group", () => {
    const view = new PlaceholderTacticalView();
    expect(view.root.children.length).toBeGreaterThan(0);
    view.dispose();
    expect(view.root.children).toHaveLength(0);
  });
});
