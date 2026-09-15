import type {
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
} from "three";
import { Box3 } from "three";
import { describe, expect, it } from "vitest";

import { OVERWORLD_SCENE_CONFIG } from "../model/overworld-scene-config";
import type {
  GroundPolygon,
  GroundRing,
} from "../service/coastline-projection";
import {
  AXIS_COLOUR,
  COASTLINE_COLOUR,
  EarthWireframe,
  GRATICULE_COLOUR,
} from "./earth-wireframe";

/** A closed axis-aligned square ring. */
function square(x0: number, z0: number, x1: number, z1: number): GroundRing {
  return [
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 },
    { x: x0, z: z0 },
  ];
}

/** Number of segments in a named `LineSegments` child. */
function segmentsOf(wireframe: EarthWireframe, name: string): number {
  const lines = wireframe.object.getObjectByName(name) as
    LineSegments | undefined;
  if (!lines) throw new Error(`no ${name}`);
  return lines.geometry.getAttribute("position").count / 2;
}

const ISLAND: GroundPolygon = { outer: square(2, 2, 6, 6), holes: [] };

describe("EarthWireframe", () => {
  it("draws one segment per coastline edge, with a glow sharing the geometry", () => {
    const wireframe = new EarthWireframe([ISLAND], OVERWORLD_SCENE_CONFIG);
    expect(segmentsOf(wireframe, "earth-coastlines")).toBe(4);
    const core = wireframe.object.getObjectByName(
      "earth-coastlines",
    ) as LineSegments;
    const glow = wireframe.object.getObjectByName(
      "earth-coastline-glow-0",
    ) as LineSegments;
    expect(glow.geometry).toBe(core.geometry);
    expect(core.position.y).toBeGreaterThan(0);
    expect(core.position.y).toBeLessThan(OVERWORLD_SCENE_CONFIG.plateHeight);
  });

  it("draws hole edges as coast too", () => {
    const wireframe = new EarthWireframe(
      [{ outer: square(1, 1, 10, 10), holes: [square(4, 4, 6, 6)] }],
      OVERWORLD_SCENE_CONFIG,
    );
    expect(segmentsOf(wireframe, "earth-coastlines")).toBe(8);
  });

  it("leaves out edges that run along the map border", () => {
    // Antarctica's shape: a coast, then down the antimeridian, along
    // the south pole and back up the other side.
    const { mapWidth, mapDepth } = OVERWORLD_SCENE_CONFIG;
    const antarctica: GroundPolygon = {
      outer: [
        { x: 0, z: 10 },
        { x: 12, z: 10.5 },
        { x: mapWidth, z: 10 },
        { x: mapWidth, z: mapDepth },
        { x: 0, z: mapDepth },
        { x: 0, z: 10 },
      ],
      holes: [],
    };
    const wireframe = new EarthWireframe([antarctica], OVERWORLD_SCENE_CONFIG);
    expect(segmentsOf(wireframe, "earth-coastlines")).toBe(2);
  });

  it("fills the land as a flat mesh with the coastline colour", () => {
    const wireframe = new EarthWireframe([ISLAND], OVERWORLD_SCENE_CONFIG);
    const land = wireframe.object.getObjectByName("earth-land") as Mesh;
    const bounds = new Box3().setFromObject(land);
    expect(bounds.min.x).toBeCloseTo(2);
    expect(bounds.max.x).toBeCloseTo(6);
    expect(bounds.min.z).toBeCloseTo(2);
    expect(bounds.max.z).toBeCloseTo(6);
    expect(bounds.min.y).toBeCloseTo(bounds.max.y);
    expect(bounds.min.y).toBeGreaterThan(0);
    const material = land.material as MeshBasicMaterial;
    expect(material.color.getHex()).toBe(COASTLINE_COLOUR);
    expect(material.opacity).toBeLessThan(0.5);
  });

  it("draws a 30° graticule with the border, and the two axes brighter", () => {
    const wireframe = new EarthWireframe([], OVERWORLD_SCENE_CONFIG);
    // 13 meridians and 7 parallels, minus the equator and prime meridian.
    expect(segmentsOf(wireframe, "earth-graticule")).toBe(13 + 7 - 2);
    expect(segmentsOf(wireframe, "earth-axes")).toBe(2);
    const grid = wireframe.object.getObjectByName(
      "earth-graticule",
    ) as LineSegments;
    const axes = wireframe.object.getObjectByName("earth-axes") as LineSegments;
    expect((grid.material as LineBasicMaterial).color.getHex()).toBe(
      GRATICULE_COLOUR,
    );
    expect((axes.material as LineBasicMaterial).color.getHex()).toBe(
      AXIS_COLOUR,
    );
    const bounds = new Box3().setFromObject(grid);
    expect(bounds.min.x).toBe(0);
    expect(bounds.max.x).toBe(OVERWORLD_SCENE_CONFIG.mapWidth);
    expect(bounds.min.z).toBe(0);
    expect(bounds.max.z).toBe(OVERWORLD_SCENE_CONFIG.mapDepth);
    // The equator halfway down, the prime meridian halfway across.
    const axisPositions = axes.geometry.getAttribute("position");
    expect(axisPositions.getX(0)).toBe(OVERWORLD_SCENE_CONFIG.mapWidth / 2);
    expect(axisPositions.getZ(2)).toBe(OVERWORLD_SCENE_CONFIG.mapDepth / 2);
  });

  it("dispose releases every geometry and material once", () => {
    const wireframe = new EarthWireframe([ISLAND], OVERWORLD_SCENE_CONFIG);
    const disposed: string[] = [];
    const seen = new Set<object>();
    wireframe.object.traverse((child) => {
      const drawable = child as Partial<Mesh>;
      if (drawable.geometry && !seen.has(drawable.geometry)) {
        seen.add(drawable.geometry);
        drawable.geometry.addEventListener("dispose", () =>
          disposed.push("geometry"),
        );
      }
      const materials = Array.isArray(drawable.material)
        ? drawable.material
        : drawable.material
          ? [drawable.material]
          : [];
      for (const material of materials) {
        if (seen.has(material)) continue;
        seen.add(material);
        material.addEventListener("dispose", () =>
          disposed.push(material.name),
        );
      }
    });
    wireframe.dispose();
    // Fill, graticule, axes, coastlines: four geometries (the glow shares one).
    expect(disposed.filter((name) => name === "geometry")).toHaveLength(4);
    expect(disposed).toContain("earth-coastline-glow");
    expect(disposed).toContain("earth-land-fill");
  });
});
