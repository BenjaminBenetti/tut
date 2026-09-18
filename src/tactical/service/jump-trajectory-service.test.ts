import { describe, expect, it } from "vitest";
import { PropKindIds } from "../../mapgen/data/props";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { TileIndex } from "../../mapgen/service/tile-index";
import { jumpFlightApex, jumpObstruction } from "./mech-jump-service";
import { jumpArcPoint, jumpArcTime } from "./jump-trajectory-service";

const FROM = { x: 1, y: 0, z: 3 };
const TO = { x: 13, y: 0, z: 3 };

describe("continuous jump trajectory", () => {
  it("advances immediately and keeps curving through the former phase boundaries", () => {
    const points = [0, 0.1, 0.2, 0.3, 0.5, 0.7, 0.8, 0.9, 1].map((t) =>
      jumpArcPoint(FROM, TO, 2, t),
    );
    expect(points[0]).toEqual(FROM);
    expect(points.at(-1)).toEqual(TO);
    expect(points[4]).toEqual({ x: 7, y: 2, z: 3 });
    for (let i = 1; i < points.length; i++)
      expect(points[i]!.x).toBeGreaterThan(points[i - 1]!.x);
    expect(points[1]!.y).toBeLessThan(points[2]!.y);
    expect(points[2]!.y).toBeLessThan(points[3]!.y);
    expect(points[5]!.y).toBeGreaterThan(points[6]!.y);
    expect(points[6]!.y).toBeGreaterThan(points[7]!.y);
  });

  it("clears a wall close to takeoff without a vertical leg or a pause at the top", () => {
    const map = new FixtureMapBuilder(16, 7, 5)
      .fillGround()
      .wall(FROM, "e", "solid")
      .build();
    const index = new TileIndex(map);
    expect(jumpObstruction(map, index, FROM, TO)).toBeUndefined();
    const apex = jumpFlightApex(map, index, FROM, TO);
    const t = jumpArcTime(0.5 / 12);
    const crossing = jumpArcPoint(FROM, TO, apex, t);
    expect(crossing.x).toBeCloseTo(1.5);
    expect(crossing.y).toBeGreaterThan(2);
    expect(jumpArcPoint(FROM, TO, apex, t / 2).x).toBeGreaterThan(FROM.x);
  });

  it.each([
    { kind: PropKindIds.INFESTED_CARAPACE_WALL_RIDGE, blocked: true },
    { kind: PropKindIds.INFESTED_CARAPACE_SPINE_BUTTRESS, blocked: true },
    { kind: PropKindIds.INFESTED_CARAPACE_WALL_BROKEN, blocked: false },
    { kind: PropKindIds.BOULDER, blocked: false },
  ])(
    "respects the actual opaque height of $kind in a ground jump",
    ({ kind, blocked }) => {
      const map = new FixtureMapBuilder(16, 7, 5)
        .fillGround()
        .prop(kind, { x: 7, y: 0, z: 3 })
        .build();
      const index = new TileIndex(map);
      for (const [from, to] of [
        [FROM, TO],
        [TO, FROM],
      ] as const) {
        const obstruction = jumpObstruction(map, index, from, to);
        if (blocked) expect(obstruction).toContain("blocks the jump");
        else expect(obstruction).toBeUndefined();
      }
    },
  );

  it.each([
    { kind: PropKindIds.INFESTED_CARAPACE_WALL_RIDGE, height: 3 },
    { kind: PropKindIds.INFESTED_CARAPACE_SPINE_BUTTRESS, height: 4 },
  ])(
    "fits a legal elevated jump above the full $kind shell near either endpoint",
    ({ kind, height }) => {
      const from = { ...FROM, y: 2 };
      const to = { ...TO, y: 2 };
      const map = new FixtureMapBuilder(16, 7, 5)
        .fillGround()
        .tile(from, SurfaceIds.ROCK)
        .tile(to, SurfaceIds.ROCK)
        .prop(kind, { x: 2, y: 0, z: 3 })
        .build();
      const index = new TileIndex(map);
      for (const [start, end] of [
        [from, to],
        [to, from],
      ] as const) {
        expect(jumpObstruction(map, index, start, end)).toBeUndefined();
        const apex = jumpFlightApex(map, index, start, end);
        for (const x of [1.5, 2.5]) {
          const fraction = (x - start.x) / (end.x - start.x);
          const point = jumpArcPoint(start, end, apex, jumpArcTime(fraction));
          expect(point.x).toBeCloseTo(x);
          expect(point.y).toBeGreaterThan(height);
        }
        expect(jumpArcPoint(start, end, apex, 0)).toEqual(start);
        expect(jumpArcPoint(start, end, apex, 1)).toEqual(end);
      }
    },
  );

  it.each([false, true])(
    "clears the roof edge and lands precisely when descending=%s",
    (descending) => {
      const builder = new FixtureMapBuilder(16, 7, 12).fillGround();
      builder.building({
        id: "roof",
        kind: "fixture",
        footprint: [{ x: 7, z: 3, w: 7, d: 1 }],
        groundLevel: 0,
        floors: Array.from({ length: 4 }, (_, index) => ({
          index,
          y: index * 2,
          rooms: [],
        })),
        roof: { kind: "flat", walkable: true },
        entrances: [],
        connectorIds: [],
      });
      for (let x = 7; x <= 13; x++)
        builder.tile({ x, y: 8, z: 3 }, SurfaceIds.ROOF, {
          buildingId: "roof",
        });
      builder.wall({ x: 7, y: 8, z: 3 }, "w", "half");
      const map = builder.build(),
        index = new TileIndex(map);
      const ground = { x: 6, y: 0, z: 3 },
        roof = { x: 13, y: 8, z: 3 };
      const from = descending ? roof : ground,
        to = descending ? ground : roof;
      const apex = jumpFlightApex(map, index, from, to);
      expect(jumpObstruction(map, index, from, to)).toBeUndefined();
      const fraction = descending ? 6.5 / 7 : 0.5 / 7;
      expect(
        jumpArcPoint(from, to, apex, jumpArcTime(fraction)).y,
      ).toBeGreaterThan(9);
      expect(jumpArcPoint(from, to, apex, 0)).toEqual(from);
      expect(jumpArcPoint(from, to, apex, 1)).toEqual(to);
    },
  );
});
