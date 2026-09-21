import { describe, expect, it } from "vitest";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { TileIndex } from "../../mapgen/service/tile-index";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import { PassMask } from "../../mapgen/model/pass-mask";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { TacticalState } from "../model/tactical-state";
import type { JevMapLayer, JevMapMarker } from "../model/jev-navigation";
import {
  missionWith,
  unitAt,
  blockUnitAt,
} from "../service/tactical-fixtures.test-helper";
import { rememberJevTerrain } from "../service/jev-knowledge-service";
import { jevPerception } from "./jev-observation";
import { jevNavigation } from "./jev-map";

/** Observe exactly these cells, independently of sight-range or terrain opacity tuning. */
function observe(
  state: TacticalState,
  positions: readonly TileCoord[],
  spotted: readonly string[] = [],
): TacticalState {
  const index = new TileIndex(state.map);
  const keys = positions.map((pos) => index.keyOf(pos));
  return {
    ...state,
    vision: {
      ...state.vision,
      tdf: { ...state.vision.tdf, visible: keys, explored: keys, spotted },
    },
  };
}

/** Exercise the real knowledge filter before rendering, so missing cells really are hidden. */
function navigation(
  state: TacticalState,
  objectives: readonly JevMapMarker[] = [],
): Readonly<Record<string, unknown>> & {
  readonly layers: readonly JevMapLayer[];
} {
  const actor = state.units[0]!;
  const result = jevNavigation(jevPerception(state, actor), actor, objectives);
  return { ...result, layers: result.layers as readonly JevMapLayer[] };
}

describe("Jev ASCII maps", () => {
  it("renders a full 4x4 map with actor/objective markers without exposing terrain beneath fog", () => {
    const map = new FixtureMapBuilder(4, 4, 2)
      .fillGround()
      .patchTile({ x: 2, y: 0, z: 0 }, { pass: PassMask.NONE })
      .patchTile({ x: 1, y: 0, z: 1 }, { pass: PassMask.NONE })
      .build();
    const base = missionWith(map, [
      unitAt("Alpha", "infantry", { x: 0, y: 0, z: 0 }),
    ]);
    const seen = map.tiles.filter(
      (tile) => !(tile.x === 3 && (tile.z === 0 || tile.z === 3)),
    );
    const result = navigation(observe(base, seen), [
      { symbol: "O", id: "objective-1", position: { x: 3, y: 0, z: 3 } },
    ]);
    expect(result.layers[0]!.rows).toEqual({
      0: "@.#",
      1: ".#..",
      2: "....",
      3: "...O",
    });
    expect(result.layers[0]!.markers).toContainEqual({
      symbol: "O",
      id: "objective-1",
      position: { x: 3, y: 0, z: 3 },
      terrain: "f",
    });
    expect(result.layers[0]!.fill).toBe("f");
    expect(result.layers[1]).toMatchObject({ y: 1, fill: "f" });
    expect(result.layers[1]).not.toHaveProperty("rows");
    expect(result.x_digits).toEqual(["0123"]);
  });

  it("includes distant shared knowledge and each elevation, with class-specific connectors", () => {
    const builder = new FixtureMapBuilder(48, 48, 4)
      .fillGround()
      .tile({ x: 47, y: 2, z: 47 }, SurfaceIds.FLOOR);
    builder.connector("ladder", { x: 47, y: 0, z: 47 }, { x: 47, y: 2, z: 47 });
    const base = missionWith(builder.build(), [
      unitAt("self", "mech", { x: 0, y: 0, z: 0 }),
    ]);
    const seen = [
      { x: 0, y: 0, z: 0 },
      { x: 47, y: 0, z: 47 },
      { x: 47, y: 2, z: 47 },
    ];
    const result = navigation(observe(base, seen));
    expect(result).toMatchObject({ width: 48, depth: 48 });
    expect(result.layers.map((layer) => layer.y)).toEqual([0, 1, 2, 3]);
    for (const y of [0, 2]) {
      const rows = result.layers[y]!.rows!;
      expect(rows["47"]).toBe(y === 0 ? "." : "#");
      expect(result.layers[y]!.row_start_x!["47"]).toBe(47);
      expect(rows).not.toHaveProperty("46");
      expect(result.layers[y]!.fill).toBe("f");
    }
    expect(result.layers[1]).toMatchObject({ fill: "f" });
    expect(result.connectors).toEqual({
      blocked: { ladder: ["47,0,47 -> 47,2,47"] },
    });
    const infantry = { ...base, units: [unitAt("self", "infantry", seen[0]!)] };
    expect(navigation(observe(infantry, seen)).connectors).toEqual({
      usable: { ladder: ["47,0,47 -> 47,2,47"] },
    });
  });

  it("marks unit footprints and retains overlapping identities while hidden enemies stay absent", () => {
    const map = new FixtureMapBuilder(4, 4, 1).fillGround().build();
    const base = missionWith(map, [
      unitAt("self", "infantry", { x: 0, y: 0, z: 0 }),
      unitAt("ally", "infantry", { x: 1, y: 0, z: 0 }),
      blockUnitAt("spotted", { x: 2, y: 0, z: 1 }),
      unitAt("secret", "infantry", { x: 0, y: 0, z: 3 }, { team: "bugs" }),
    ]);
    const state = { ...base, extraction: [{ x: 0, y: 0, z: 0 }] };
    const result = navigation(observe(state, map.tiles, ["spotted"]), [
      { symbol: "O", id: "objective-1", position: { x: 1, y: 0, z: 0 } },
    ]);
    expect(result.layers[0]!.rows).toEqual({
      0: "@a..",
      1: "..ee",
      2: "..ee",
      3: "....",
    });
    expect(result.layers[0]!.markers.map((marker) => marker.id)).toEqual(
      expect.arrayContaining([
        "self",
        "ally",
        "spotted",
        "objective-1",
        "extraction-0",
      ]),
    );
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("distinguishes remembered terrain, cover and opacity without refreshing unseen facts", () => {
    const map = new FixtureMapBuilder(4, 4, 1)
      .fillGround()
      .patchTile(
        { x: 1, y: 0, z: 0 },
        { pass: PassMask.NONE, coverProvided: 1 },
      )
      .patchTile(
        { x: 2, y: 0, z: 0 },
        { pass: PassMask.NONE, coverProvided: 2, blocksLos: true },
      )
      .tile({ x: 3, y: 0, z: 0 }, SurfaceIds.INFESTED)
      .patchTile(
        { x: 1, y: 0, z: 1 },
        { pass: PassMask.INFANTRY, coverProvided: 1, blocksLos: true },
      )
      .build();
    const base = missionWith(map, [
      unitAt("self", "infantry", { x: 0, y: 0, z: 0 }),
    ]);
    const seen = observe(base, map.tiles);
    expect(navigation(seen).layers[0]!.rows!["0"]).toBe("@lh~");
    expect(navigation(seen).layers[0]!.features).toMatchObject({
      cover_provided: { 1: ["1,1"] },
      blocks_sight: { true: ["1,1"] },
    });
    const remembered = rememberJevTerrain({
      ...seen,
      jev: { entities: {}, commanders: { tdf: "", bugs: "" } },
    });
    const hidden = observe(remembered, [base.units[0]!.pos]);
    const before = navigation(hidden);
    expect(before.layers[0]!.rows!["0"]).toBe("@LH=");
    const demolished = {
      ...hidden,
      map: {
        ...map,
        tiles: map.tiles.map((tile) =>
          tile.x
            ? {
                ...tile,
                pass: PassMask.ALL,
                coverProvided: 0 as const,
                blocksLos: false,
              }
            : tile,
        ),
      },
    };
    expect(navigation(demolished)).toEqual(before);
    const refreshed = navigation(observe(demolished, map.tiles));
    expect(refreshed.layers[0]!.rows!["0"]).toBe("@..~");
    const mech = {
      ...seen,
      units: [unitAt("self", "mech", base.units[0]!.pos)],
    };
    expect(navigation(mech).layers[0]!.rows!["1"]![1]).toBe("l");
  });

  it("merges mirrored wall edges without erasing doors, and retains remembered boundaries", () => {
    const builder = new FixtureMapBuilder(4, 4, 1).fillGround();
    for (let z = 0; z < 4; z++)
      builder.wall({ x: 1, y: 0, z }, "e", z === 1 ? "door" : "solid");
    const map = builder.build();
    const base = missionWith(map, [
      unitAt("self", "infantry", { x: 0, y: 0, z: 0 }),
    ]);
    const seen = observe(base, map.tiles);
    const walls = navigation(seen).layers[0]!.walls;
    expect(walls).toEqual({
      vertical: { 0: "  s", 1: "  d", 2: "  s", 3: "  s" },
    });
    const known = rememberJevTerrain({
      ...seen,
      jev: { entities: {}, commanders: { tdf: "", bugs: "" } },
    });
    const hidden = observe(known, [base.units[0]!.pos]);
    expect(navigation(hidden).layers[0]!.walls).toEqual({
      vertical: { 0: "  S", 1: "  D", 2: "  S", 3: "  S" },
    });
    const opened = {
      ...hidden,
      map: { ...map, tiles: map.tiles.map((tile) => ({ ...tile, walls: {} })) },
    };
    expect(navigation(opened)).toEqual(navigation(hidden));
    // Observing one side of a destroyed edge takes precedence over the stale mirrored side.
    const observed = navigation(observe(opened, [{ x: 1, y: 0, z: 1 }]));
    expect(observed.layers[0]!.walls).toEqual({
      vertical: { 0: "  S", 2: "  S", 3: "  S" },
    });
  });

  it("preserves horizontal and vertical walls at every outer map boundary", () => {
    const map = new FixtureMapBuilder(4, 4, 1)
      .fillGround()
      .wall({ x: 0, y: 0, z: 0 }, "n", "half")
      .wall({ x: 0, y: 0, z: 0 }, "w", "window")
      .wall({ x: 3, y: 0, z: 3 }, "e", "solid")
      .wall({ x: 3, y: 0, z: 3 }, "s", "door")
      .build();
    const state = missionWith(map, [
      unitAt("self", "infantry", { x: 1, y: 0, z: 1 }),
    ]);
    expect(navigation(observe(state, map.tiles)).layers[0]!.walls).toEqual({
      vertical: { 0: "w", 3: "    s" },
      horizontal: { 0: "h", 4: "   d" },
    });
  });
});
