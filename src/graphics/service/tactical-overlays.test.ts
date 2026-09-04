import { InstancedMesh } from "three";
import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { MISSION_TYPES } from "../../content/data/mission-types";
import { createDefaultRegistries } from "../../mapgen/service/default-registries";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { MECH_RATING_TUNING } from "../../roster/data/mech-rating-tuning";
import { STARTER_PARTS } from "../../roster/data/parts";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { UPGRADE_TUNING } from "../../roster/data/upgrade-tuning";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import { StaticPartCatalogue } from "../../roster/repository/static-part-catalogue";
import { validateLoadout } from "../../roster/service/loadout-validation-service";
import { UNIT_TUNING } from "../../tactical/data/unit-tuning";
import { SPAWN_TUNING } from "../../tactical/data/spawn-tuning";
import type { TacticalState } from "../../tactical/model/tactical-state";
import { startTacticalMission } from "../../tactical/service/mission-start-service";
import {
  missionWith,
  unitAt,
} from "../../tactical/service/tactical-fixtures.test-helper";
import {
  campaignOnDay,
  missionAt,
} from "../../ui/view/mission-fixtures.test-helper";
import {
  EMPTY_OVERLAYS,
  TacticalOverlays,
  overlaysFor,
} from "./tactical-overlays";

/** A live mission with the whole starter roster deployed. */
function mission(): TacticalState {
  const state = campaignOnDay(4, [missionAt("mission-2", "lagos", 9, 5)]);
  const parts = new StaticPartCatalogue(STARTER_PARTS);
  const started = startTacticalMission(
    state,
    "mission-2",
    {
      missionId: "mission-2",
      squadIds: state.roster.squads.map((s) => s.id),
      mechIds: state.roster.mechs.map((m) => m.id),
    },
    {
      missionTypes: MISSION_TYPES,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      sheetFor: (mech) => {
        const sheet = validateLoadout(
          mech.loadout,
          parts,
          MECH_RATING_TUNING,
          UPGRADE_TUNING,
        );
        return sheet.ok ? sheet.value : undefined;
      },
      unitTuning: UNIT_TUNING,
      spawnTuning: SPAWN_TUNING,
      ids: new SequentialIdGenerator(),
      registries: createDefaultRegistries(),
    },
  );
  if (!started.ok || !started.value.activeMission)
    throw new Error("fixture must start");
  return started.value.activeMission;
}

describe("overlaysFor", () => {
  it("lists the reachable tiles of a living unit without its own tile, with cover and LOS subsets", () => {
    const m = mission();
    const squad = m.units.find((u) => u.kind === "squad")!;
    const state = overlaysFor(m, squad.id);
    expect(state.moveRange.length).toBeGreaterThan(0);
    expect(
      state.moveRange.some(
        ({ tile: t }) =>
          t.x === squad.pos.x && t.z === squad.pos.z && t.y === squad.pos.y,
      ),
    ).toBe(false);
    const keys = new Set(
      state.moveRange.map(({ tile: t }) => `${t.x},${t.y},${t.z}`),
    );
    for (const marker of state.cover) {
      expect(
        keys.has(`${marker.tile.x},${marker.tile.y},${marker.tile.z}`),
      ).toBe(true);
      expect(marker.level).toBeGreaterThan(0);
    }
    for (const tile of state.lineOfSight) {
      expect(keys.has(`${tile.x},${tile.y},${tile.z}`)).toBe(true);
    }
  });

  it("is empty for no selection, an unknown unit, or a dead one", () => {
    const m = mission();
    expect(overlaysFor(m, undefined)).toBe(EMPTY_OVERLAYS);
    expect(overlaysFor(m, "ghost")).toBe(EMPTY_OVERLAYS);
    const dead = {
      ...m,
      units: m.units.map((u, i) => (i === 0 ? { ...u, hp: 0 } : u)),
    };
    expect(overlaysFor(dead, m.units[0]!.id)).toBe(EMPTY_OVERLAYS);
  });
});

describe("TacticalOverlays", () => {
  it("draws one instance per tile on the matching layer and clears to zero", () => {
    const overlays = new TacticalOverlays();
    expect(overlays.layers().every((l) => l instanceof InstancedMesh)).toBe(
      true,
    );
    overlays.show({
      moveRange: [
        { tile: { x: 1, y: 0, z: 1 }, apCost: 1 },
        { tile: { x: 2, y: 0, z: 1 }, apCost: 1 },
        { tile: { x: 3, y: 0, z: 1 }, apCost: 2 },
      ],
      cover: [
        { tile: { x: 2, y: 0, z: 1 }, level: 1 },
        { tile: { x: 3, y: 0, z: 1 }, level: 2 },
      ],
      lineOfSight: [{ x: 3, y: 0, z: 1 }],
    });
    expect(overlays.counts()).toEqual({
      rangeOneAp: 2,
      rangeTwoAp: 1,
      coverLow: 1,
      coverHigh: 1,
      los: 1,
    });
    overlays.clear();
    expect(overlays.counts()).toEqual({
      rangeOneAp: 0,
      rangeTwoAp: 0,
      coverLow: 0,
      coverHigh: 0,
      los: 0,
    });
    overlays.dispose();
    expect(overlays.root.children).toHaveLength(0);
  });

  it("grows its buffers past the initial capacity", () => {
    const overlays = new TacticalOverlays();
    const many = Array.from({ length: 300 }, (_, i) => ({
      tile: { x: i % 20, y: 0, z: Math.floor(i / 20) },
      apCost: 1,
    }));
    overlays.show({ moveRange: many, cover: [], lineOfSight: [] });
    expect(overlays.counts().rangeOneAp).toBe(300);
    overlays.dispose();
  });
});

// ===========================================
// Action-point tiers (#521)
// ===========================================

describe("overlaysFor action-point tiers", () => {
  /**
   * An open field with one infantry unit of `move` tiles per action and
   * `ap` actions, standing at (5,0,5) with room to walk in every
   * direction.
   */
  function field(move: number, ap: number): TacticalState {
    const map = new FixtureMapBuilder(12, 12, 1).fillGround().build();
    const unit = unitAt("u1", "infantry", { x: 5, y: 0, z: 5 }, { ap });
    const base = missionWith(map, [unit]);
    return {
      ...base,
      templates: {
        ...base.templates,
        [unit.templateId]: {
          ...base.templates[unit.templateId]!,
          move,
          maxAp: 2,
        },
      },
    };
  }

  /** Tiers present in the overlay, as a sorted list. */
  function tiers(state: TacticalState): number[] {
    return [
      ...new Set(overlaysFor(state, "u1").moveRange.map((e) => e.apCost)),
    ].sort();
  }

  it("splits the range into a 1 AP and a 2 AP band by the movement service's own cost", () => {
    const state = field(3, 2);
    const range = overlaysFor(state, "u1").moveRange;
    expect(tiers(state)).toEqual([1, 2]);
    // Every tier-1 tile is inside one action's move; every tier-2 tile is
    // beyond it. Manhattan is a lower bound on steps, so a tile at
    // distance > move can never be reachable in one action.
    for (const { tile, apCost } of range) {
      const distance =
        Math.abs(tile.x - 5) + Math.abs(tile.z - 5) + Math.abs(tile.y - 0);
      if (distance > 3) {
        expect(apCost).toBe(2);
      }
      expect(apCost === 1 || apCost === 2).toBe(true);
    }
    // The bands are both non-empty on an open field this size.
    expect(range.filter((e) => e.apCost === 1).length).toBeGreaterThan(0);
    expect(range.filter((e) => e.apCost === 2).length).toBeGreaterThan(0);
  });

  it("shows only the 1 AP band for a unit with one action point left", () => {
    expect(tiers(field(3, 1))).toEqual([1]);
    // And the tiles are the ones a single action reaches, not half the pair.
    const range = overlaysFor(field(3, 1), "u1").moveRange;
    const twoAp = overlaysFor(field(3, 2), "u1").moveRange;
    expect(range.length).toBeLessThan(twoAp.length);
  });

  it("puts nothing in the 2 AP band when one action already covers the map", () => {
    // Move 20 on a 12x12 field: one action reaches everything walkable.
    expect(tiers(field(20, 2))).toEqual([1]);
  });

  it("tiers by real path cost, so a wall makes an adjacent tile cost two actions", () => {
    // A short solid spur beside the unit. (6,0,0) is one step east as the
    // crow flies, but the wall forces a detour south around z=3 and back:
    // 7 steps, which at move 4 is the unit's second action.
    const builder = new FixtureMapBuilder(12, 12, 1).fillGround();
    for (let z = 0; z <= 2; z++) {
      builder.wall({ x: 6, y: 0, z }, "w", "solid");
    }
    const unit = unitAt("u1", "infantry", { x: 5, y: 0, z: 0 }, { ap: 2 });
    const base = missionWith(builder.build(), [unit]);
    const state: TacticalState = {
      ...base,
      templates: {
        ...base.templates,
        [unit.templateId]: {
          ...base.templates[unit.templateId]!,
          move: 4,
          maxAp: 2,
        },
      },
    };
    const range = overlaysFor(state, "u1").moveRange;
    // The tile immediately east is reachable, and costs two actions — a
    // radius approximation would have painted it as one, which is the
    // whole point of tiering by the movement service's cost.
    const behind = range.find((e) => e.tile.x === 6 && e.tile.z === 0);
    expect(behind).toBeDefined();
    expect(behind?.apCost).toBe(2);
    // A tile the same distance away with no wall in the way stays cheap.
    const west = range.find((e) => e.tile.x === 4 && e.tile.z === 0);
    expect(west?.apCost).toBe(1);
  });
});
