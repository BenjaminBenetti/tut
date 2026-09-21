/// <reference types="node" />
import { readFileSync } from "node:fs";
import { Box3, Group, InstancedMesh, Matrix4, Mesh, Vector3 } from "three";
import type { Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { beforeAll, describe, expect, it } from "vitest";
import { PROP_DEFINITIONS, PropKindIds } from "../../mapgen/data/props";
import { CoverLevel } from "../../mapgen/model/cover";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { INTERIOR_FURNITURE_STYLE } from "../data/interior-furniture-style";
import { propModel } from "../data/map-model-table";
import { MODEL_MANIFEST } from "../data/model-manifest";
import { TacticalMapView, tileTop } from "../view/tactical-map-view";
import { resolveMapModels } from "./map-model-resolver";

/** The new interior kit; dimensions, cover and asset paths come from production data. */
const FURNITURE_KINDS = [
  PropKindIds.MARBLE_PILLAR,
  PropKindIds.PRODUCE_BIN,
  PropKindIds.CHILLED_DISPLAY,
  PropKindIds.BAKERY_CASE,
  PropKindIds.CAFE_TABLE,
  PropKindIds.COFFEE_COUNTER,
  PropKindIds.CLOTHING_RACK,
  PropKindIds.ELECTRONICS_DISPLAY,
  PropKindIds.HARDWARE_SHELF,
  PropKindIds.PHARMACY_SHELF,

  PropKindIds.RETAIL_SHELF,
  PropKindIds.CHECKOUT,
  PropKindIds.DESK_COMPUTER,
  PropKindIds.FILING_CABINET,
  PropKindIds.MEETING_TABLE,
  PropKindIds.WORKBENCH,
  PropKindIds.SOFA,
  PropKindIds.BED,
  PropKindIds.KITCHEN_COUNTER,
  PropKindIds.DINING_TABLE,
  PropKindIds.BATHROOM_VANITY,
  PropKindIds.PLANTER,
  PropKindIds.TOILET,
  PropKindIds.REFRIGERATOR,
  PropKindIds.WARDROBE,
  PropKindIds.BOOKCASE,
] as const;

const TOLERANCE = 0.00001;
const BACK_WALLS = ["n", "e", "s", "w"] as const;
const SIDE_WALLS = ["e", "s", "w", "n"] as const;

/** Counts the actual shipped triangles, including separately transformed mesh parts. */
function trianglesIn(root: Object3D): number {
  let count = 0;
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const geometry = (object as Mesh).geometry;
    count +=
      (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
  });
  return count;
}

/** Bounds one rendered instance across every material and mesh part of the GLB. */
function instanceBounds(parts: readonly InstancedMesh[], index: number): Box3 {
  const bounds = new Box3();
  for (const part of parts) {
    part.geometry.computeBoundingBox();
    const transform = new Matrix4();
    part.getMatrixAt(index, transform);
    transform.premultiply(part.matrixWorld);
    bounds.union(part.geometry.boundingBox!.clone().applyMatrix4(transform));
  }
  return bounds;
}

describe.each(FURNITURE_KINDS)("shipped interior furniture: %s", (kind) => {
  let source: Object3D;
  let bytes: number;

  beforeAll(async () => {
    const modelId = propModel(kind);
    if (modelId === undefined) throw new Error(`No model mapped for ${kind}`);
    const file = new URL(
      `../../../public/${MODEL_MANIFEST[modelId].path}`,
      import.meta.url,
    );
    const data = readFileSync(file);
    bytes = data.byteLength;
    source = (
      await new GLTFLoader().parseAsync(
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
        "",
      )
    ).scene;
  });

  it("registers final art whose real geometry fits its one-tile footprint and prop budgets", () => {
    const entry = MODEL_MANIFEST[propModel(kind)!];
    const bounds = new Box3().setFromObject(source);
    expect(entry.category).toBe("props");
    expect(entry.quality).toBe("final");
    expect(entry.footprint).toEqual({ w: 1, d: 1 });
    expect(bytes).toBeLessThanOrEqual(60 * 1024);
    expect(trianglesIn(source)).toBeGreaterThan(0);
    expect(trianglesIn(source)).toBeLessThanOrEqual(300);
    expect(bounds.min.y).toBeCloseTo(0, 5);
    expect(Math.abs(bounds.max.y - entry.height)).toBeLessThanOrEqual(0.011);
    for (const axis of ["x", "z"] as const) {
      expect(bounds.min[axis]).toBeGreaterThanOrEqual(-0.5 - TOLERANCE);
      expect(bounds.max[axis]).toBeLessThanOrEqual(0.5 + TOLERANCE);
    }
    const rearExtent = INTERIOR_FURNITURE_STYLE.rearExtents[kind];
    if (rearExtent !== undefined) {
      expect(rearExtent).toBeGreaterThanOrEqual(-bounds.min.z - TOLERANCE);
      expect(rearExtent + bounds.min.z).toBeLessThan(0.001);
    }
  });

  it("keeps furniture indoors and makes high cover visibly taller than low cover", () => {
    const definition = PROP_DEFINITIONS.find((prop) => prop.id === kind);
    expect(definition).toBeDefined();
    expect(definition!.placements).toEqual(["interior"]);
    expect(definition!.footprint ?? { w: 1, d: 1 }).toEqual({ w: 1, d: 1 });
    const height = new Box3().setFromObject(source).getSize(new Vector3()).y;
    expect(height).toBeGreaterThan(0.2);
    expect(height).toBeLessThan(1.5);
    if (definition!.cover === CoverLevel.HIGH) {
      expect(height).toBeGreaterThanOrEqual(1 - TOLERANCE);
      expect(definition!.blocksLos).toBe(true);
    } else {
      expect(definition!.cover).toBe(CoverLevel.LOW);
      expect(height).toBeLessThan(1);
      expect(definition!.blocksLos).toBe(false);
    }
  });

  it("renders every quarter turn on the elevated tile without spilling into an adjacent aisle", async () => {
    const rotations = [0, 1, 2, 3] as const;
    const floorLevel = 2;
    const builder = new FixtureMapBuilder(4, 1, 3).fillGround(
      floorLevel,
      "floor",
    );
    for (const rotation of rotations) {
      builder.prop(kind, { x: rotation, y: floorLevel, z: 0 }, rotation);
    }
    const map = builder.build();
    const before = JSON.stringify(map);
    const view = new TacticalMapView(map);
    try {
      await view.loadModels({
        load: (id) =>
          Promise.resolve(
            id === propModel(kind) ? source.clone(true) : new Group(),
          ),
        preload: () => Promise.resolve(),
      });
      view.root.updateMatrixWorld(true);
      const parts: InstancedMesh[] = [];
      view.root.traverse((object) => {
        if (
          object instanceof InstancedMesh &&
          object.name.startsWith("props-model:")
        ) {
          parts.push(object as InstancedMesh);
        }
      });
      expect(parts.length).toBeGreaterThan(0);
      expect(parts.every((part) => part.count === rotations.length)).toBe(true);
      const size = new Box3().setFromObject(source).getSize(new Vector3());
      for (const rotation of rotations) {
        const bounds = instanceBounds(parts, rotation);
        expect(bounds.min.x).toBeGreaterThanOrEqual(rotation - TOLERANCE);
        expect(bounds.max.x).toBeLessThanOrEqual(rotation + 1 + TOLERANCE);
        expect(bounds.min.z).toBeGreaterThanOrEqual(-TOLERANCE);
        expect(bounds.max.z).toBeLessThanOrEqual(1 + TOLERANCE);
        expect(bounds.min.y).toBeCloseTo(tileTop(floorLevel), 5);
        expect(bounds.max.y).toBeCloseTo(tileTop(floorLevel) + size.y, 5);
        const placedSize = bounds.getSize(new Vector3());
        expect(placedSize.x).toBeCloseTo(rotation % 2 ? size.z : size.x, 5);
        expect(placedSize.z).toBeCloseTo(rotation % 2 ? size.x : size.z, 5);
      }
      expect(JSON.stringify(map)).toBe(before);
    } finally {
      view.dispose();
    }
  });

  it.each(["solid", "window"] as const)(
    "fits against its %s rear wall in every orientation without a sideways corner shift",
    async (wall) => {
      const rotations = [0, 1, 2, 3] as const;
      const floorLevel = 2;
      const builder = new FixtureMapBuilder(12, 3, 3).fillGround(
        floorLevel,
        "floor",
      );
      for (const rotation of rotations) {
        const tile = { x: 1 + rotation * 3, y: floorLevel, z: 1 };
        builder.patchTile(tile, { buildingId: "interior" });
        builder.wall(tile, BACK_WALLS[rotation], wall);
        builder.wall(tile, SIDE_WALLS[rotation], "solid");
        builder.prop(kind, tile, rotation);
      }
      const map = builder.build();
      const before = JSON.stringify(map);
      const placements = resolveMapModels(map).props;
      const view = new TacticalMapView(map);
      try {
        await view.loadModels({
          load: (id) =>
            Promise.resolve(
              id === propModel(kind) ? source.clone(true) : new Group(),
            ),
          preload: () => Promise.resolve(),
        });
        view.root.updateMatrixWorld(true);
        const parts: InstancedMesh[] = [];
        view.root.traverse((object) => {
          if (
            object instanceof InstancedMesh &&
            object.name.startsWith("props-model:")
          )
            parts.push(object as InstancedMesh);
        });
        expect(parts.length).toBeGreaterThan(0);
        expect(parts.every((part) => part.count === rotations.length)).toBe(
          true,
        );
        const style = INTERIOR_FURNITURE_STYLE;
        const rear = style.rearExtents[kind];
        const fitsWall = rear !== undefined && rear < 0.5 - style.wallClearance;
        for (const rotation of rotations) {
          const tile = map.props[rotation]!.tile;
          const bounds = instanceBounds(parts, rotation);
          const placement = placements[rotation]!;
          expect(placement.turns).toBe(rotation);
          expect(placement.tile).toEqual(tile);
          expect(bounds.min.x).toBeGreaterThanOrEqual(tile.x - TOLERANCE);
          expect(bounds.max.x).toBeLessThanOrEqual(tile.x + 1 + TOLERANCE);
          expect(bounds.min.z).toBeGreaterThanOrEqual(tile.z - TOLERANCE);
          expect(bounds.max.z).toBeLessThanOrEqual(tile.z + 1 + TOLERANCE);
          expect(bounds.min.y).toBeCloseTo(tileTop(floorLevel), 5);
          if (fitsWall) {
            const clearance = [
              bounds.min.z - tile.z,
              tile.x + 1 - bounds.max.x,
              tile.z + 1 - bounds.max.z,
              bounds.min.x - tile.x,
            ][rotation];
            expect(clearance).toBeCloseTo(style.wallClearance, 4);
            const sideways = rotation % 2 === 0 ? "x" : "z";
            expect(placement.position[sideways]).toBe(tile[sideways] + 0.5);
          } else {
            expect(placement.position).toEqual({
              x: tile.x + 0.5,
              y: tileTop(floorLevel),
              z: tile.z + 0.5,
            });
          }
        }
        expect(JSON.stringify(map)).toBe(before);
      } finally {
        view.dispose();
      }
    },
  );

  it("leaves pivots unchanged beside doorways, half walls, or walls on the wrong side", () => {
    const scenarios = [
      { side: "n", wall: "door" },
      { side: "n", wall: "half" },
      { side: "s", wall: "solid" },
      { side: "e", wall: "window" },
    ] as const;
    for (const { side, wall } of scenarios) {
      const tile = { x: 1, y: 0, z: 1 };
      const builder = new FixtureMapBuilder(3, 3, 1).fillGround(0, "floor");
      builder.patchTile(tile, { buildingId: "interior" });
      builder.wall(tile, side, wall);
      builder.prop(kind, tile);
      expect(resolveMapModels(builder.build()).props[0]!.position).toEqual({
        x: 1.5,
        y: tileTop(0),
        z: 1.5,
      });
    }
  });
});

describe("interior wall fitting compatibility", () => {
  it("preserves exterior props, legacy furniture, roofs and untagged saved floors", () => {
    const scenarios = [
      { kind: PropKindIds.SOFA, surface: "grass", buildingId: undefined },
      { kind: PropKindIds.SOFA, surface: "floor", buildingId: undefined },
      { kind: PropKindIds.SOFA, surface: "roof", buildingId: "building" },
      { kind: PropKindIds.CAR, surface: "road", buildingId: undefined },
      { kind: PropKindIds.CRATE, surface: "floor", buildingId: "building" },
      { kind: PropKindIds.TABLE, surface: "floor", buildingId: "building" },
      { kind: PropKindIds.SHELVING, surface: "floor", buildingId: "building" },
    ];
    for (const { kind, surface, buildingId } of scenarios) {
      const tile = { x: 1, y: 0, z: 1 };
      const builder = new FixtureMapBuilder(3, 3, 1).fillGround(0, surface);
      if (buildingId !== undefined) builder.patchTile(tile, { buildingId });
      builder.wall(tile, "n", "solid");
      builder.prop(kind, tile);
      const map = builder.build();
      const before = JSON.stringify(map);
      expect(resolveMapModels(map).props[0]!.position).toEqual({
        x: 1.5,
        y: tileTop(0),
        z: 1.5,
      });
      expect(JSON.stringify(map)).toBe(before);
    }
  });
});
