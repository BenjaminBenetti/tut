import { describe, expect, it } from "vitest";
import {
  BoxGeometry,
  type InstancedMesh,
  Mesh,
  MeshStandardMaterial,
} from "three";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { TileIndex } from "../../mapgen/service/tile-index";
import { resolveMapModels } from "./map-model-resolver";
import { TacticalMapView, tileTop } from "../view/tactical-map-view";
import { createGhostUniforms } from "./ghost-cutaway";

/** One non-walkable roof, with stable ids selecting both supported roof geometries. */
function house(id: string) {
  const builder = new FixtureMapBuilder(10, 12, 3).fillGround();
  for (let x = 1; x < 9; x++)
    for (let z = 1; z < 11; z++)
      builder.tile({ x, y: 0, z }, "floor", { buildingId: id });
  builder.building({
    id,
    kind: "house",
    footprint: [{ x: 1, z: 1, w: 8, d: 10 }],
    groundLevel: 0,
    floors: [{ index: 0, y: 0, rooms: [] }],
    roof: { kind: "pitched", walkable: false },
    entrances: [],
    connectorIds: [],
  });
  return builder.build();
}

describe("pitched roof details", () => {
  it("ghosts rooftop hardware with its supporting roof while keeping ground cover opaque", async () => {
    const map = new FixtureMapBuilder(4, 4, 3)
      .fillGround()
      .tile({ x: 1, y: 2, z: 1 }, "roof")
      .tile({ x: 2, y: 2, z: 1 }, "roof")
      .prop("rooftop-hvac", { x: 1, y: 2, z: 1 })
      .prop("rooftop-water-tank", { x: 2, y: 2, z: 1 })
      .prop("crate", { x: 0, y: 0, z: 0 })
      .build();
    const prototype = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    const view = new TacticalMapView(map, createGhostUniforms(4, 0.175));
    await view.loadModels({
      preload: () => Promise.resolve(),
      load: () => Promise.resolve(prototype.clone()),
    });
    for (const id of ["rooftop-hvac", "rooftop-water-tank"]) {
      const equipment = view.root.getObjectByName(
        `props-model:prop.${id}:2:0`,
      ) as InstancedMesh;
      expect((equipment.material as MeshStandardMaterial).name).toContain(
        "ghosted",
      );
    }
    const crate = view.root.getObjectByName(
      "props-model:prop.crate:0:0",
    ) as InstancedMesh;
    expect((crate.material as MeshStandardMaterial).name).not.toContain(
      "ghosted",
    );
    view.dispose();
    prototype.geometry.dispose();
    prototype.material.dispose();
  });
  it.each(["gabled-house", "building-1"])(
    "fits %s chimney flashing into its actual roof surface without changing the map",
    (id) => {
      const map = house(id);
      const original = JSON.stringify(map);
      const placements = resolveMapModels(map);
      const chimneys = placements.frontages.filter(
        (placement) => placement.modelId === "building.chimney",
      );
      expect(chimneys).toHaveLength(1);
      const chimney = chimneys[0]!;
      const support = placements.roofs.find(
        (roof) =>
          roof.position.x === chimney.position.x &&
          roof.position.z === chimney.position.z,
      )!;
      const height = Math.min(
        support.roof!.heights[1],
        support.roof!.depthHeights?.[1] ?? Infinity,
      );
      expect(chimney.position.y).toBeLessThan(tileTop(support.level) + height);
      expect(chimney.position.y + 0.08).toBeGreaterThan(
        tileTop(support.level) + height,
      );
      expect(chimney.tile).toEqual(support.tile);
      expect(chimney.level).toBe(support.level);
      expect(resolveMapModels(map).frontages).toEqual(placements.frontages);
      expect(JSON.stringify(map)).toBe(original);
      const flat = {
        ...map,
        buildings: map.buildings.map((building) => ({
          ...building,
          roof: { kind: "flat" as const, walkable: true },
        })),
      };
      expect(
        resolveMapModels(flat).frontages.some(
          (p) => p.modelId === "building.chimney",
        ),
      ).toBe(false);
    },
  );

  it("shares the roof's ghosting, owner mist and level cut instead of leaving a floating chimney", async () => {
    const map = house("gabled-house");
    const index = new TileIndex(map);
    const view = new TacticalMapView(map, createGhostUniforms(4, 0.175));
    const prototype = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    view.setVision({ visible: [], explored: [], spotted: [], lastSeen: {} });
    await view.loadModels({
      preload: () => Promise.resolve(),
      load: () => Promise.resolve(prototype.clone()),
    });
    const chimney = view.root.getObjectByName(
      "frontages-model:building.chimney:2:0",
    ) as InstancedMesh;
    expect(chimney).toBeDefined();
    expect((chimney.material as MeshStandardMaterial).name).toContain(
      "ghosted",
    );
    expect(chimney.geometry.getAttribute("unexploredMist").getW(0)).toBe(1);
    const owner = resolveMapModels(map).frontages.find(
      (p) => p.modelId === "building.chimney",
    )!.tile;
    view.setVision({
      visible: [index.keyOf(owner)],
      explored: [],
      spotted: [],
      lastSeen: {},
    });
    expect(chimney.geometry.getAttribute("unexploredMist").getW(0)).toBe(0);
    view.setMaxLevel(1);
    expect(chimney.parent?.visible).toBe(false);
    view.setMaxLevel(undefined);
    expect(chimney.parent?.visible).toBe(true);
    view.dispose();
    prototype.geometry.dispose();
    prototype.material.dispose();
  });
});
