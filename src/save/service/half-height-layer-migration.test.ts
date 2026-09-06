import { describe, expect, it } from "vitest";

import { gridKey } from "../../core/service/grid-math";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { TileGridSource } from "../../mapgen/model/tactical-map";
import { GAME_STATE_MIGRATIONS } from "../data/migrations";
import { HALF_HEIGHT_LAYERS } from "./half-height-layer-migration";
import { MigrationRunner } from "./migration-runner";

const low = { x: 1, y: 1, z: 2 };
const high = { x: 2, y: 2, z: 2 };
const lowLayer = { x: 1, y: 2, z: 2 };
const highLayer = { x: 2, y: 4, z: 2 };
const width = 5;
const depth = 3;
const levels = 4;
const oldKeys = [gridKey(low, width, depth), gridKey(high, width, depth)];
const newKeys = [
  gridKey(lowLayer, width, depth),
  gridKey(highLayer, width, depth),
];

/** A legacy mission with every persisted vertical field populated. */
function legacyState() {
  const hook = { tiles: [low, high], meta: { y: 7, hatchRadius: 3 } };
  const unit = { id: "u1", pos: high, hp: 20, ap: 2 };
  const vision = {
    visible: oldKeys,
    explored: [0, ...oldKeys, width * depth * levels - 1],
    spotted: ["u1"],
    lastSeen: { u1: high },
  };
  return {
    meta: { seed: 7 },
    overworld: { day: 2, map: { cities: [{ layout: { x: 0.1, y: 0.7 } }] } },
    activeMission: {
      map: {
        version: 1,
        width,
        depth,
        levels,
        recipe: { seed: "old", params: { hooks: [{ meta: { y: 9 } }] } },
        tiles: [
          {
            ...low,
            slope: { kind: "straight", turns: 1 },
            naturalEdge: true,
            walls: { e: "half" },
          },
          {
            ...high,
            surface: "floor",
            floorIndex: 1,
            buildingId: "b1",
            walls: { w: "door" },
          },
        ],
        buildings: [
          {
            groundLevel: 1,
            floors: [
              { index: 0, y: 1, rooms: [] },
              { index: 1, y: 2, rooms: [] },
            ],
            entrances: [{ tile: low, side: "s" }],
            roof: { kind: "flat", walkable: true },
          },
        ],
        connectors: ["slope", "ramp", "stairs", "ladder"].map((kind) => ({
          kind,
          from: low,
          to: high,
          pass: 3,
        })),
        props: [{ id: "p1", tile: high, rotation: 2 }],
        hooks: {
          deployZones: [hook],
          objectives: [hook],
          edgeSpawns: [hook],
          extraction: hook,
        },
      },
      units: [unit],
      extracted: [unit],
      spawners: [{ pos: high, hp: 20 }],
      extraction: [low],
      vision: { tdf: vision, bugs: { ...vision, lastSeen: { u2: low } } },
      templates: { rifle: { move: 6, sightRange: 10 } },
      commandSeq: 3,
      log: [
        {
          type: "tactical:unit-moved",
          payload: { unitId: "u1", from: low, to: high, path: [low, high] },
        },
      ],
    },
  };
}

describe("HALF_HEIGHT_LAYERS", () => {
  it("converts every spatial record without mutating the save or its metadata", () => {
    const before = legacyState();
    const snapshot: unknown = JSON.parse(JSON.stringify(before));
    const after = HALF_HEIGHT_LAYERS.apply(before) as ReturnType<
      typeof legacyState
    >;
    const mission = after.activeMission;
    const map = mission.map;
    expect(map.version).toBe(2);
    expect(map.levels).toBe(8);
    expect(map.tiles).toEqual([
      { ...lowLayer, naturalEdge: true, walls: { e: "half" } },
      {
        ...highLayer,
        surface: "floor",
        floorIndex: 1,
        buildingId: "b1",
        walls: { w: "door" },
      },
    ]);
    expect(map.buildings[0]).toEqual({
      groundLevel: 2,
      floors: [
        { index: 0, y: 2, rooms: [] },
        { index: 1, y: 4, rooms: [] },
      ],
      entrances: [{ tile: lowLayer, side: "s" }],
      roof: { kind: "flat", walkable: true },
    });
    expect(map.connectors).toEqual(
      ["ramp", "ramp", "stairs", "ladder"].map((kind) => ({
        kind,
        from: lowLayer,
        to: highLayer,
        pass: 3,
      })),
    );
    expect(map.props[0]).toEqual({ id: "p1", tile: highLayer, rotation: 2 });
    const hook = {
      tiles: [lowLayer, highLayer],
      meta: { y: 7, hatchRadius: 3 },
    };
    expect(map.hooks).toEqual({
      deployZones: [hook],
      objectives: [hook],
      edgeSpawns: [hook],
      extraction: hook,
    });
    expect(mission.units[0]).toEqual({
      id: "u1",
      pos: highLayer,
      hp: 20,
      ap: 2,
    });
    expect(mission.extracted).toEqual(mission.units);
    expect(mission.spawners[0]).toEqual({ pos: highLayer, hp: 20 });
    expect(mission.extraction).toEqual([lowLayer]);
    expect(mission.log[0]?.payload).toEqual({
      unitId: "u1",
      from: lowLayer,
      to: highLayer,
      path: [lowLayer, highLayer],
    });
    expect(mission.commandSeq).toBe(3);
    expect(mission.templates).toEqual(before.activeMission.templates);
    expect(map.recipe).toEqual(before.activeMission.map.recipe);
    expect(after.overworld).toEqual(before.overworld);
    expect(before).toEqual(snapshot);
    expect(JSON.parse(JSON.stringify(after))).toEqual(after);
  });

  it("re-encodes both sides' vision and round-trips keys through TileIndex", () => {
    const after = HALF_HEIGHT_LAYERS.apply(legacyState()) as ReturnType<
      typeof legacyState
    >;
    const mission = after.activeMission;
    const index = new TileIndex(mission.map as unknown as TileGridSource);
    for (const side of [mission.vision.tdf, mission.vision.bugs]) {
      expect(side.visible).toEqual(newKeys);
      expect(side.explored).toEqual([0, ...newKeys, 104]);
      expect(side.spotted).toEqual(["u1"]);
      for (const [i, pos] of [lowLayer, highLayer].entries()) {
        expect(index.getAt(pos)).toBeDefined();
        expect(index.keyOf(pos)).toBe(side.visible[i]);
      }
    }
    expect(mission.vision.tdf.lastSeen).toEqual({ u1: highLayer });
    expect(mission.vision.bugs.lastSeen).toEqual({ u2: lowLayer });
    expect(HALF_HEIGHT_LAYERS.apply(after)).toBe(after);
  });

  it("migrates from v6 through the existing chain, and leaves between-mission saves alone", () => {
    const runner = new MigrationRunner(
      [
        ...GAME_STATE_MIGRATIONS.filter((step) => step.to <= 15),
        HALF_HEIGHT_LAYERS,
      ],
      16,
    );
    const {
      vision: _vision,
      extracted: _extracted,
      commandSeq: _seq,
      ...mission
    } = legacyState().activeMission;
    const envelope = {
      schemaVersion: 6,
      savedAt: "2026-09-06T00:00:00Z",
      state: { ...legacyState(), activeMission: mission },
    };
    const result = runner.migrate(envelope);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.schemaVersion).toBe(16);
    expect(result.value.savedAt).toBe(envelope.savedAt);
    expect(result.value.state).toMatchObject({
      activeMission: {
        map: { version: 2, levels: 8 },
        extracted: [],
        commandSeq: 1,
        vision: { tdf: { visible: [], explored: [], lastSeen: {} } },
      },
    });
    const idle = { meta: {}, overworld: {} };
    expect(HALF_HEIGHT_LAYERS.apply(idle)).toBe(idle);
    expect(
      runner.migrate({ ...envelope, schemaVersion: 15, state: idle }),
    ).toEqual({
      ok: true,
      value: { ...envelope, schemaVersion: 16, state: idle },
    });
  });

  it("reports corrupt dimensions or packed keys as a migration failure", () => {
    const runner = new MigrationRunner([HALF_HEIGHT_LAYERS], 16);
    for (const invalid of [-1, 0.5, 60]) {
      const state = legacyState();
      state.activeMission.vision.tdf.visible = [invalid];
      expect(
        runner.migrate({ schemaVersion: 15, savedAt: "now", state }),
      ).toMatchObject({ ok: false, error: { kind: "migration-failed" } });
    }
    const state = legacyState();
    state.activeMission.map.depth = 0;
    expect(() => HALF_HEIGHT_LAYERS.apply(state)).toThrow(/dimension/);
  });
});
