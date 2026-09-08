import { describe, expect, it } from "vitest";
import {
  BoxGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from "three";
import { DIRECTIONS } from "../../core/model/direction";
import type { Direction } from "../../core/model/direction";
import { stepGridPos } from "../../core/service/grid-math";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import type { Building } from "../../mapgen/model/building";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { TileIndex } from "../../mapgen/service/tile-index";
import { resolveBuildingFrontages } from "./building-frontage-resolver";
import { TacticalMapView } from "../view/tactical-map-view";
import { createGhostUniforms } from "./ghost-cutaway";

/** A real perimeter, two floors, roof and central door, with room outside all four sides. */
function fixture(kind = "apartment", side: Direction = "s"): TacticalMap {
  const b = new FixtureMapBuilder(12, 12, 8).fillGround(2, SurfaceIds.GRASS);
  for (let z = 3; z <= 7; z++)
    for (let x = 3; x <= 7; x++) {
      for (const y of [2, 4]) {
        b.tile({ x, y, z }, SurfaceIds.FLOOR, {
          buildingId: "home",
          floorIndex: (y - 2) / 2,
        });
        if (x === 3) b.wall({ x, y, z }, "w", "window");
        if (x === 7) b.wall({ x, y, z }, "e", "window");
        if (z === 3) b.wall({ x, y, z }, "n", "window");
        if (z === 7) b.wall({ x, y, z }, "s", "window");
      }
      b.tile({ x, y: 6, z }, SurfaceIds.ROOF, { buildingId: "home" });
    }
  const outward = stepGridPos({ x: 0, y: 0, z: 0 }, side);
  const door = { x: 5 + outward.x * 2, y: 2, z: 5 + outward.z * 2 };
  b.wall(door, side, "door");
  // One solid bay for the shared mail, independent of the original doorway.
  b.wall(
    {
      ...door,
      x: door.x + (outward.z ? -1 : 0),
      z: door.z + (outward.x ? -1 : 0),
    },
    side,
    "solid",
  );
  const building: Building = {
    id: "home",
    kind,
    footprint: [{ x: 3, z: 3, w: 5, d: 5 }],
    groundLevel: 2,
    floors: [
      { index: 0, y: 2, rooms: [] },
      { index: 1, y: 4, rooms: [] },
    ],
    roof: { kind: "flat", walkable: true },
    entrances: [{ tile: door, side }],
    connectorIds: [],
  };
  b.building(building);
  const map = b.build();
  return {
    ...map,
    recipe: {
      ...map.recipe,
      params: { ...map.recipe.params, settlement: "city" },
    },
  };
}

/** Resolve without touching any part of the saved map. */
function resolve(map: TacticalMap) {
  return resolveBuildingFrontages(map, new TileIndex(map));
}

describe("building use cues", () => {
  it.each(DIRECTIONS)(
    "faces the %s exterior and retains the entrance's owner",
    (side) => {
      const map = fixture("shop", side);
      const placement = resolve(map).find(
        (p) => p.modelId === "building.shop-awning",
      )!;
      const door = map.buildings[0]!.entrances[0]!.tile;
      const outward = stepGridPos({ x: 0, y: 0, z: 0 }, side);
      const direction = new Vector3(0, 0, 1).applyAxisAngle(
        new Vector3(0, 1, 0),
        (-placement.turns * Math.PI) / 2,
      );
      expect(direction.x).toBeCloseTo(outward.x);
      expect(direction.z).toBeCloseTo(outward.z);
      expect(placement.position.x).toBeCloseTo(
        door.x + 0.5 + outward.x * 0.545,
      );
      expect(placement.position.z).toBeCloseTo(
        door.z + 0.5 + outward.z * 0.545,
      );
      expect(placement.tile).toEqual(door);
      expect(placement.level).toBe(door.y);
      expect(placement.position.y).toBeCloseTo(door.y * 0.75 + 0.15 + 1.21);
    },
  );

  it("uses the actual building kind while leaving map walls, props and routes untouched", () => {
    const map = fixture("apartment");
    const before = JSON.stringify(map);
    const result = resolve(map);
    expect(new Set(result.map((p) => p.modelId))).toEqual(
      new Set([
        "building.residential-entry",
        "building.mailbox-bank",
        "building.residential-window",
      ]),
    );
    expect(JSON.stringify(map)).toBe(before);
    expect(
      resolve(fixture("shop")).every(
        (p) => p.modelId === "building.shop-awning",
      ),
    ).toBe(true);
    expect(resolve(fixture("tower")).map((p) => p.modelId)).toEqual([
      "building.workplace-entry",
    ]);
    expect(resolve(fixture("unknown"))).toEqual([]);
  });

  it("mounts mail only on a solid wall and domestic guards only on upper windows", () => {
    const map = fixture();
    const index = new TileIndex(map);
    const result = resolve(map);
    const mailbox = result.find((p) => p.modelId === "building.mailbox-bank")!;
    expect(index.getAt(mailbox.tile)?.walls.s).toBe("solid");
    const windows = result.filter(
      (p) => p.modelId === "building.residential-window",
    );
    expect(windows.length).toBeGreaterThan(0);
    expect(
      windows.every(
        (p) => p.level === 4 && index.getAt(p.tile)?.floorIndex === 1,
      ),
    ).toBe(true);
    expect(result.some((p) => p.level === 6)).toBe(false);
  });

  it("leaves a ladder's complete vertical route clear", () => {
    const map = fixture();
    const next: TacticalMap = {
      ...map,
      connectors: [
        {
          id: "ladder",
          kind: "ladder",
          from: { x: 5, y: 2, z: 8 },
          to: { x: 5, y: 6, z: 7 },
          pass: 1,
          buildingId: "home",
        },
      ],
    };
    expect(
      resolve(next).some(
        (p) => p.tile.x === 5 && p.tile.z === 7 && p.turns === 0,
      ),
    ).toBe(false);
    expect(resolve(next).length).toBeGreaterThan(0);
  });

  it("does not push a wide canopy beyond the building corner", () => {
    const map = fixture("shop");
    const door = { x: 3, y: 2, z: 7 };
    const next: TacticalMap = {
      ...map,
      buildings: map.buildings.map((b) => ({
        ...b,
        entrances: [{ tile: door, side: "s" }],
      })),
      tiles: map.tiles.map((t) =>
        t.x === door.x && t.y === door.y && t.z === door.z
          ? { ...t, walls: { ...t.walls, s: "door" } }
          : t,
      ),
    };
    expect(resolve(next)).toEqual([]);
  });

  it("preserves the rural control", () => {
    const map = fixture();
    const rural = {
      ...map,
      recipe: {
        ...map.recipe,
        params: { ...map.recipe.params, settlement: "rural" as const },
      },
    };
    expect(resolve(rural)).toEqual([]);
  });

  it("loads the attachments through the real scene consumer with owner fog and storey cuts", async () => {
    const map = fixture();
    const index = new TileIndex(map);
    const prototype = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    const view = new TacticalMapView(map, createGhostUniforms(4, 0.175));
    view.setVision({ visible: [], explored: [], spotted: [], lastSeen: {} });
    await view.loadModels({
      preload: () => Promise.resolve(),
      load: () => Promise.resolve(prototype.clone()),
    });
    const frontages: InstancedMesh[] = [];
    view.root.traverse((object) => {
      if (
        object instanceof InstancedMesh &&
        object.name.startsWith("frontages-model:")
      )
        frontages.push(object as InstancedMesh);
    });
    expect(frontages).toHaveLength(3);
    for (const mesh of frontages) {
      expect((mesh.material as MeshStandardMaterial).name).toContain("ghosted");
      const mist = mesh.geometry.getAttribute("unexploredMist");
      expect(
        Array.from({ length: mist.count }, (_, i) => mist.getW(i)),
      ).toEqual(Array.from({ length: mist.count }, () => 1));
    }
    view.setVision({
      visible: map.tiles.map((tile) => index.keyOf(tile)),
      explored: [],
      spotted: [],
      lastSeen: {},
    });
    for (const mesh of frontages) {
      const mist = mesh.geometry.getAttribute("unexploredMist");
      expect(
        Array.from({ length: mist.count }, (_, i) => mist.getW(i)),
      ).toEqual(Array.from({ length: mist.count }, () => 0));
    }
    const window = frontages.find((mesh) =>
      mesh.name.includes("residential-window"),
    )!;
    const entry = frontages.find((mesh) =>
      mesh.name.includes("residential-entry"),
    )!;
    const matrix = new Matrix4();
    view.setLayerFocus({ storey: 0, storeyCount: 2, cutLevel: 3 });
    window.getMatrixAt(0, matrix);
    expect(matrix.determinant()).toBe(0);
    entry.getMatrixAt(0, matrix);
    expect(matrix.determinant()).not.toBe(0);
    view.setLayerFocus(undefined);
    window.getMatrixAt(0, matrix);
    expect(matrix.determinant()).not.toBe(0);
    expect(prototype.material.name).not.toContain("ghosted");
    view.dispose();
    prototype.geometry.dispose();
    prototype.material.dispose();
  });
});
