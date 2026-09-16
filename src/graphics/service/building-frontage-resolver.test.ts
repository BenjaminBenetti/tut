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
import { wallPart } from "../model/map-part";

/** A real perimeter, two floors, roof and central door, with room outside all four sides. */
function fixture(
  kind = "apartment",
  side: Direction = "s",
  interiorStyle?: string,
): TacticalMap {
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
    ...(interiorStyle === undefined ? {} : { interiorStyle }),
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
  it("varies shop entrances by seed and keeps every domestic facade in a coherent window style", () => {
    const choices = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const map = fixture("shop");
      const varied = {
        ...map,
        recipe: { ...map.recipe, seed: `shop-style-${i}` },
      };
      const result = resolve(varied);
      choices.add(result[0]!.modelId);
      expect(resolve(varied)).toEqual(result);
    }
    expect([...choices].sort()).toEqual([
      "building.shop-awning",
      "building.shop-awning-sign",
    ]);
    const windows = resolve(fixture()).filter((p) =>
      p.modelId.startsWith("building.residential-window"),
    );
    for (const turns of [0, 1, 2, 3])
      expect(
        new Set(windows.filter((p) => p.turns === turns).map((p) => p.modelId))
          .size,
      ).toBe(1);
    expect(resolve(fixture("warehouse")).map((p) => p.modelId)).toEqual([
      "building.business-depot",
    ]);
  });

  it("mounts air conditioning on solid upper bays and clears its entire ladder column", () => {
    const map = fixture();
    const solid = {
      ...map,
      tiles: map.tiles.map((tile) =>
        tile.y === 4
          ? {
              ...tile,
              walls: Object.fromEntries(
                Object.entries(tile.walls).map(([side]) => [
                  side,
                  "solid" as const,
                ]),
              ),
            }
          : tile,
      ),
    };
    const result = resolve(solid).filter(
      (p) => p.modelId === "building.wall-ac-unit",
    );
    expect(result.length).toBeGreaterThan(0);
    expect(
      new Set(result.map((module) => module.turns)).size,
    ).toBeLessThanOrEqual(2);
    expect(new Set(result.map((module) => module.turns % 2)).size).toBe(1);
    const unit = result[0]!;
    const side = ["s", "w", "n", "e"][unit.turns] as Direction;
    for (const module of result) {
      expect(module.level).toBe(4);
      expect(
        new TileIndex(solid).getAt(module.tile)?.walls[
          ["s", "w", "n", "e"][module.turns] as Direction
        ],
      ).toBe("solid");
    }
    const outside = stepGridPos(unit.tile, side);
    const obstructed = {
      ...solid,
      connectors: [
        {
          id: "ladder",
          kind: "ladder" as const,
          from: { ...outside, y: 2 },
          to: { ...unit.tile, y: 6 },
          pass: 1,
        },
      ],
    };
    expect(
      resolve(obstructed).some(
        (p) =>
          p.modelId === unit.modelId &&
          p.turns === unit.turns &&
          p.tile.x === unit.tile.x &&
          p.tile.z === unit.tile.z,
      ),
    ).toBe(false);
  });
  it.each(DIRECTIONS)(
    "faces the %s exterior and retains the entrance's owner",
    (side) => {
      const map = fixture("shop", side);
      const placement = resolve(map).find((p) =>
        p.modelId.startsWith("building.shop-awning"),
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
        "building.residential-window-shutters",
      ]),
    );
    expect(JSON.stringify(map)).toBe(before);
    expect(
      resolve(fixture("shop")).every((p) =>
        p.modelId.startsWith("building.shop-awning"),
      ),
    ).toBe(true);
    expect(resolve(fixture("tower")).map((p) => p.modelId)).toEqual([
      "building.business-offices",
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
    expect(resolve(next).map((p) => p.modelId)).toEqual([
      "building.shop-awning-narrow",
    ]);
  });

  it("fits a one-bay shop awning beside an exterior ladder without occupying its column", () => {
    const map = fixture("shop");
    const next: TacticalMap = {
      ...map,
      connectors: [
        {
          id: "adjacent-ladder",
          kind: "ladder",
          pass: 1,
          buildingId: "home",
          from: { x: 6, y: 2, z: 8 },
          to: { x: 6, y: 6, z: 7 },
        },
      ],
    };
    expect(resolve(next).map((p) => p.modelId)).toEqual([
      "building.shop-awning-narrow",
    ]);
    const acrossDoor: TacticalMap = {
      ...next,
      connectors: next.connectors.map((c) => ({
        ...c,
        from: { ...c.from, x: 5 },
        to: { ...c.to, x: 5 },
      })),
    };
    expect(resolve(acrossDoor)).toEqual([]);
  });

  it("gives rural houses the same fitted, use-specific detail as urban houses", () => {
    const map = fixture("house");
    const rural = {
      ...map,
      recipe: {
        ...map.recipe,
        params: { ...map.recipe.params, settlement: "rural" as const },
      },
    };
    expect(resolve(rural)).toEqual(resolve(map));
    expect(resolve(rural).length).toBeGreaterThan(0);
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
    expect(frontages).toHaveLength(4);
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
    view.setLayerFocus({ storey: 0, storeyCount: 2 });
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

describe("business identity frontages", () => {
  it.each([
    ["grocery", "building.business-grocery"],
    ["bakery-cafe", "building.business-bakery-cafe"],
    ["pharmacy", "building.business-pharmacy"],
    ["clothing", "building.business-clothing"],
    ["electronics", "building.business-electronics"],
    ["hardware", "building.business-hardware"],
    ["bookshop", "building.business-bookshop"],
  ])(
    "matches the %s business on the saved building without changing the map",
    (identity, modelId) => {
      const map = fixture("shop", "s", identity);
      const before = JSON.stringify(map);
      const result = resolve(map);
      expect(result.map((placement) => placement.modelId)).toEqual([modelId]);
      expect(resolve(map)).toEqual(result);
      const door = map.buildings[0]!.entrances[0]!.tile;
      expect(result[0]!.part).toBe(
        wallPart(new TileIndex(map).keyOf(door), "s"),
      );
      expect(result[0]!.tile).toEqual(door);
      expect(result[0]!.level).toBe(door.y);
      expect(result[0]!.position.y).toBeCloseTo(door.y * 0.75 + 0.15 + 1.08);
      expect(JSON.stringify(map)).toBe(before);
    },
  );

  it("keeps generic shop styling for absent or unknown interior identities", () => {
    for (const identity of [
      "future-business",
      "constructor",
      "toString",
      "__proto__",
    ]) {
      expect(resolve(fixture("shop", "s", identity))).toEqual(
        resolve(fixture("shop")),
      );
    }
    expect(resolve(fixture("house", "s", "grocery"))).toEqual(
      resolve(fixture("house")),
    );
    expect(resolve(fixture("constructor"))).toEqual([]);
  });

  it.each(DIRECTIONS)(
    "orients a business canopy away from the %s facade",
    (side) => {
      const map = fixture("shop", side, "pharmacy");
      const placement = resolve(map)[0]!;
      const direction = new Vector3(0, 0, 1).applyAxisAngle(
        new Vector3(0, 1, 0),
        (-placement.turns * Math.PI) / 2,
      );
      const outward = stepGridPos({ x: 0, y: 0, z: 0 }, side);
      expect(direction.x).toBeCloseTo(outward.x);
      expect(direction.z).toBeCloseTo(outward.z);
      expect(placement.modelId).toBe("building.business-pharmacy");
    },
  );

  it.each([
    ["shop", "grocery", "grocery"],
    ["shop", "bakery-cafe", "bakery-cafe"],
    ["shop", "pharmacy", "pharmacy"],
    ["shop", "clothing", "clothing"],
    ["shop", "electronics", "electronics"],
    ["shop", "hardware", "hardware"],
    ["shop", "bookshop", "bookshop"],
    ["tower", undefined, "offices"],
    ["warehouse", undefined, "depot"],
  ])(
    "retains %s/%s identity in a compact module beside a ladder",
    (kind, identity, expected) => {
      const map = fixture(kind, "s", identity);
      const next: TacticalMap = {
        ...map,
        connectors: [
          {
            id: "ladder",
            kind: "ladder",
            pass: 1,
            buildingId: "home",
            from: { x: 6, y: 2, z: 8 },
            to: { x: 6, y: 6, z: 7 },
          },
        ],
      };
      expect(resolve(next).map((placement) => placement.modelId)).toEqual([
        `building.business-${expected}-compact`,
      ]);
      const blocked = {
        ...next,
        connectors: next.connectors.map((connector) => ({
          ...connector,
          from: { ...connector.from, x: 5 },
          to: { ...connector.to, x: 5 },
        })),
      };
      expect(resolve(blocked)).toEqual([]);
    },
  );

  it("uses the compact identity at a corner and does not overlap adjacent entrance canopies", () => {
    const map = fixture("shop", "s", "electronics");
    const corner = { x: 3, y: 2, z: 7 };
    const cornerMap: TacticalMap = {
      ...map,
      buildings: map.buildings.map((building) => ({
        ...building,
        entrances: [{ tile: corner, side: "s" }],
      })),
      tiles: map.tiles.map((tile) =>
        tile.x === 3 && tile.y === 2 && tile.z === 7
          ? { ...tile, walls: { ...tile.walls, s: "door" } }
          : tile,
      ),
    };
    expect(resolve(cornerMap).map((placement) => placement.modelId)).toEqual([
      "building.business-electronics-compact",
    ]);
    const adjacent = { x: 6, y: 2, z: 7 };
    const twoDoors: TacticalMap = {
      ...map,
      buildings: map.buildings.map((building) => ({
        ...building,
        entrances: [...building.entrances, { tile: adjacent, side: "s" }],
      })),
      tiles: map.tiles.map((tile) =>
        tile.x === 6 && tile.y === 2 && tile.z === 7
          ? { ...tile, walls: { ...tile.walls, s: "door" } }
          : tile,
      ),
    };
    expect(resolve(twoDoors).map((placement) => placement.modelId)).toEqual([
      "building.business-electronics",
    ]);
  });

  it("rejects canopies that would collide across a narrow passage", () => {
    const builder = new FixtureMapBuilder(12, 18, 4).fillGround(2, "grass");
    for (const [id, front, side] of [
      ["one", 3, "s"],
      ["two", 9, "n"],
    ] as const) {
      for (let z = front; z < front + 5; z++)
        for (let x = 3; x <= 7; x++) {
          const tile = { x, y: 2, z };
          builder.tile(tile, "floor", { buildingId: id, floorIndex: 0 });
          if (x === 3) builder.wall(tile, "w", "solid");
          if (x === 7) builder.wall(tile, "e", "solid");
          if (z === front) builder.wall(tile, "n", "solid");
          if (z === front + 4) builder.wall(tile, "s", "solid");
        }
      const tile = { x: 5, y: 2, z: side === "s" ? front + 4 : front };
      builder.wall(tile, side, "door");
      builder.building({
        id,
        kind: "shop",
        interiorStyle: "grocery",
        groundLevel: 2,
        footprint: [{ x: 3, z: front, w: 5, d: 5 }],
        floors: [{ index: 0, y: 2, rooms: [] }],
        entrances: [{ tile, side }],
        roof: { kind: "flat", walkable: false },
        connectorIds: [],
      });
    }
    const result = resolve(builder.build());
    expect(result.map((placement) => placement.modelId)).toEqual([
      "building.business-grocery",
    ]);
  });

  it("keeps the identity when a tall prop requires the compact fallback", () => {
    const map = fixture("shop", "s", "hardware");
    const blocked: TacticalMap = {
      ...map,
      props: [
        {
          id: "obstruction",
          kind: "tree-pine",
          tile: { x: 6, y: 2, z: 8 },
          rotation: 0,
        },
      ],
    };
    expect(resolve(blocked).map((placement) => placement.modelId)).toEqual([
      "building.business-hardware-compact",
    ]);
    expect(
      resolve({
        ...blocked,
        props: blocked.props.map((prop) => ({
          ...prop,
          tile: { ...prop.tile, x: 5 },
        })),
      }),
    ).toEqual([]);
  });

  it("uses owner fog and storey cuts and falls permanently with its entrance wall", async () => {
    const map = fixture("shop", "s", "pharmacy");
    const index = new TileIndex(map);
    const door = map.buildings[0]!.entrances[0]!.tile;
    const prototype = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    const view = new TacticalMapView(map, createGhostUniforms(4, 0.175));
    view.setVision({ visible: [], explored: [], spotted: [], lastSeen: {} });
    await view.loadModels({
      preload: () => Promise.resolve(),
      load: () => Promise.resolve(prototype.clone()),
    });
    let sign: InstancedMesh | undefined;
    view.root.traverse((object) => {
      if (
        object instanceof InstancedMesh &&
        object.name.startsWith("frontages-model:building.business-pharmacy:")
      )
        sign = object;
    });
    expect(sign).toBeDefined();
    const instance = sign!;
    expect((instance.material as MeshStandardMaterial).name).toContain(
      "ghosted",
    );
    expect(instance.geometry.getAttribute("unexploredMist").getW(0)).toBe(1);
    view.setVision({
      visible: [index.keyOf(door)],
      explored: [],
      spotted: [],
      lastSeen: {},
    });
    expect(instance.geometry.getAttribute("unexploredMist").getW(0)).toBe(0);
    view.setLayerFocus({ storey: 0, storeyCount: 2 });
    const matrix = new Matrix4();
    instance.getMatrixAt(0, matrix);
    expect(matrix.determinant()).not.toBe(0);
    view.setMaxLevel(door.y - 1);
    expect(view.root.getObjectByName(`level-${door.y}`)?.visible).toBe(false);
    view.setMaxLevel(undefined);
    const destroyed = {
      ...map,
      tiles: map.tiles.map((tile) => {
        if (tile.x === door.x && tile.y === door.y && tile.z === door.z)
          return { ...tile, walls: { ...tile.walls, s: undefined } };
        if (tile.x === door.x && tile.y === door.y && tile.z === door.z + 1)
          return { ...tile, walls: { ...tile.walls, n: undefined } };
        return tile;
      }),
    };
    view.applyMap(destroyed);
    expect(view.demolishedParts()).toContain(wallPart(index.keyOf(door), "s"));
    instance.getMatrixAt(0, matrix);
    expect(matrix.determinant()).toBe(0);
    view.setLayerFocus(undefined);
    view.setVision(undefined);
    instance.getMatrixAt(0, matrix);
    expect(matrix.determinant()).toBe(0);
    expect(resolve(destroyed)).toEqual([]);
    view.dispose();
    prototype.geometry.dispose();
    prototype.material.dispose();
  });
});
