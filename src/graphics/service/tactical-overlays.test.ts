import { InstancedMesh } from "three";
import { describe, expect, it } from "vitest";

import { startedMission } from "../../bugs/ai/bug-mission.test-helper";

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
import { hasLineOfSight } from "../../tactical/service/sight-service";
import { TileIndex } from "../../mapgen/service/tile-index";
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
  it("lists the reachable tiles of a living unit without its own tile, with cover and blocked-shot subsets", () => {
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
    for (const tile of state.blockedShot) {
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
    // Every per-tile plane is instanced; the weapon envelope is not a
    // per-tile plane at all but one outline mesh, which is the whole
    // point of #624 and is asserted here so it cannot quietly go back.
    const instanced = overlays
      .layers()
      .filter((l) => l instanceof InstancedMesh);
    expect(instanced).toHaveLength(overlays.layers().length - 1);
    const outline = overlays
      .layers()
      .find((l) => l.name === "overlay-weapon-range");
    expect(outline).toBeDefined();
    expect(outline instanceof InstancedMesh).toBe(false);
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
      blockedShot: [{ x: 3, y: 0, z: 1 }],
      weaponRange: [],
    });
    expect(overlays.counts()).toEqual({
      weaponRange: 0,
      rangeOneAp: 2,
      rangeTwoAp: 1,
      coverLow: 1,
      coverHigh: 1,
      blockedShot: 1,
    });
    overlays.clear();
    expect(overlays.counts()).toEqual({
      weaponRange: 0,
      rangeOneAp: 0,
      rangeTwoAp: 0,
      coverLow: 0,
      coverHigh: 0,
      blockedShot: 0,
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
    overlays.show({
      moveRange: many,
      cover: [],
      blockedShot: [],
      weaponRange: [],
    });
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

// ===========================================
// Weapon range (#522)
// ===========================================

describe("overlaysFor weapon range", () => {
  /** An open field with one unit of weapon `range` at (5,0,5). */
  function field(range: number, walled = false): TacticalState {
    const builder = new FixtureMapBuilder(12, 12, 1).fillGround();
    if (walled) {
      // A solid screen due east of the unit, two tiles out.
      for (let z = 0; z < 12; z++) {
        builder.wall({ x: 7, y: 0, z }, "w", "solid");
      }
    }
    const unit = unitAt("u1", "infantry", { x: 5, y: 0, z: 5 });
    const base = missionWith(builder.build(), [unit]);
    const template = base.templates[unit.templateId]!;
    return {
      ...base,
      templates: {
        ...base.templates,
        [unit.templateId]: {
          ...template,
          weapons: [
            {
              ...template.weapons[0]!,
              profile: { ...template.weapons[0]!.profile, range },
            },
          ],
        },
      },
    };
  }

  it("maps the weapon's range to the tiles inside it, by the metric the hit chance uses", () => {
    const state = field(3);
    const tiles = overlaysFor(state, "u1").weaponRange;
    expect(tiles.length).toBeGreaterThan(0);
    // Manhattan, matching validateTargeting; nothing beyond the range.
    for (const tile of tiles) {
      const distance =
        Math.abs(tile.x - 5) + Math.abs(tile.z - 5) + Math.abs(tile.y - 0);
      expect(distance).toBeLessThanOrEqual(3);
    }
    // And the whole diamond is there on open ground: 1 + 4 + 8 + 12 = 25.
    expect(tiles).toHaveLength(25);
  });

  it("grows with the weapon, so a longer gun paints more", () => {
    expect(overlaysFor(field(5), "u1").weaponRange.length).toBeGreaterThan(
      overlaysFor(field(3), "u1").weaponRange.length,
    );
  });

  it("states reach, and lets a wall stop nothing (#624)", () => {
    const tiles = overlaysFor(field(5, true), "u1").weaponRange;
    const keys = new Set(tiles.map((t) => `${t.x},${t.y},${t.z}`));
    // Both are five tiles away and both are inside the reach, even
    // though the screen at x=7 blocks the sight line to the first.
    // Filtering by sight cut the envelope into pockets whose outline
    // drew as disconnected dashes; "how far can I fire" is a property
    // of the weapon, not of where the walls are. Whether a given tile
    // will take the shot is `blockedShot`'s question, asked of a
    // chosen target, and it is tested against the rules below.
    expect(keys.has("8,0,5")).toBe(true);
    expect(keys.has("2,0,5")).toBe(true);
  });

  it("is one flat outline at the firer's level, never a mark per level", () => {
    const tiles = overlaysFor(field(5, true), "u1").weaponRange;
    const unit = field(5, true).units.find((u) => u.id === "u1")!;
    // One tile per column, all at the firer's own height: a boundary
    // that followed the terrain climbed the side of every building and
    // drew a picture of ground the player may never have seen.
    expect(tiles.every((t) => t.y === unit.pos.y)).toBe(true);
    const columns = new Set(tiles.map((t) => `${t.x},${t.z}`));
    expect(columns.size).toBe(tiles.length);
  });

  /** The same field, but `u1` carries a short gun and a long one. */
  function twoGuns(short: number, long: number): TacticalState {
    const base = field(short);
    const unit = base.units.find((u) => u.id === "u1")!;
    const template = base.templates[unit.templateId]!;
    const first = template.weapons[0]!;
    return {
      ...base,
      templates: {
        ...base.templates,
        [unit.templateId]: {
          ...template,
          weapons: [
            { ...first, id: "arm-weapon", name: "Autocannon" },
            {
              ...first,
              id: "back-weapon",
              name: "Missile Pod",
              profile: { ...first.profile, range: long },
            },
          ],
        },
      },
    };
  }

  it("follows the armed weapon, not the unit's first (#532)", () => {
    const state = twoGuns(3, 5);
    // Nothing armed, or a single-weapon unit: the first weapon, as before.
    expect(overlaysFor(state, "u1").weaponRange).toHaveLength(25);
    expect(
      overlaysFor(state, "u1", undefined, "arm-weapon").weaponRange,
    ).toHaveLength(25);
    // Armed with the pod, the boundary reaches as far as the pod does.
    // Drawing the autocannon's ten while the hit preview offered a shot
    // at twelve told the player two different things about one shot.
    const armed = overlaysFor(state, "u1", undefined, "back-weapon");
    expect(armed.weaponRange).toHaveLength(61);
    for (const tile of armed.weaponRange) {
      expect(Math.abs(tile.x - 5) + Math.abs(tile.z - 5)).toBeLessThanOrEqual(
        5,
      );
    }
  });

  it("is empty for a unit whose template carries no reach", () => {
    expect(overlaysFor(field(0), "u1").weaponRange).toEqual([]);
  });

  it("is empty when nothing is selected", () => {
    expect(overlaysFor(field(3), undefined).weaponRange).toEqual([]);
  });
});

describe("TacticalOverlays weapon-range outline", () => {
  /** A 3-tile-wide horizontal strip, whose edge is every tile but the middle. */
  const strip = [
    { x: 1, y: 0, z: 1 },
    { x: 2, y: 0, z: 1 },
    { x: 3, y: 0, z: 1 },
  ];

  function shown(weaponRange: typeof strip): number {
    const overlays = new TacticalOverlays();
    // The layer is off until intent asks for it (#590); these cases are
    // about which tiles the outline picks, so switch it on first.
    overlays.setWeaponRangeVisible(true);
    overlays.show({
      moveRange: [],
      cover: [],
      blockedShot: [],
      weaponRange,
    });
    const count = overlays.counts().weaponRange;
    overlays.dispose();
    return count;
  }

  it("draws one outline around the envelope, not a mark per tile", () => {
    // A 5x5 block has a 20-edge perimeter however many of its 25 tiles
    // are inside it: one fact, one shape (#624).
    const block = [];
    for (let x = 0; x < 5; x++) {
      for (let z = 0; z < 5; z++) {
        block.push({ x, y: 0, z });
      }
    }
    expect(shown(block)).toBe(20);
  });

  it("wraps a thin strip completely, both long sides and both ends", () => {
    // 1 x 3: three exposed sides on each end tile, two on the middle.
    expect(shown(strip)).toBe(8);
  });

  it("draws nothing for an empty envelope", () => {
    expect(shown([])).toBe(0);
  });

  it("starts hidden and follows the toggle, leaving the other layers alone (#590)", () => {
    const overlays = new TacticalOverlays();
    overlays.show({
      moveRange: [{ tile: { x: 9, y: 0, z: 9 }, apCost: 1 }],
      cover: [],
      blockedShot: [],
      weaponRange: strip,
    });
    // Off until asked for: a scene drawn before the screen has pushed
    // any intent must not paint the envelope on its own.
    expect(overlays.isWeaponRangeVisible()).toBe(false);
    expect(overlays.counts().weaponRange).toBe(0);
    overlays.setWeaponRangeVisible(true);
    expect(overlays.counts().weaponRange).toBe(8);
    overlays.setWeaponRangeVisible(false);
    expect(overlays.counts().weaponRange).toBe(0);
    // The movement band is untouched by the toggle.
    expect(overlays.counts().rangeOneAp).toBe(1);
    overlays.setWeaponRangeVisible(true);
    expect(overlays.counts().weaponRange).toBe(8);
    overlays.dispose();
  });
});

describe("the sight cue marks the exception (#517, #624)", () => {
  it("marks the reachable tiles that will refuse the shot, and only those", () => {
    const mission = startedMission("player");
    const unit = mission.units.filter((u) => u.team === "tdf")[1];
    const spawner = mission.spawners[0];
    if (!unit || !spawner) throw new Error("fixture");

    const state = overlaysFor(mission, unit.id, spawner.id);
    const index = new TileIndex(mission.map);
    const blocked = new Set(
      state.blockedShot.map((t) => `${t.x},${t.y},${t.z}`),
    );
    // Every mark is a real refusal, and every refusal is marked: a cue
    // computed a second way could promise a shot the rules then deny.
    for (const { tile } of state.moveRange) {
      const clear = hasLineOfSight(mission.map, tile, spawner.pos, index);
      expect(blocked.has(`${tile.x},${tile.y},${tile.z}`)).toBe(!clear);
    }
  });

  it("draws nothing at all when no target is chosen", () => {
    const mission = startedMission("player");
    const unit = mission.units.filter((u) => u.team === "tdf")[1];
    if (!unit) throw new Error("fixture");

    // The old cue fell back to "any living enemy", which with nine bugs
    // on the board was true on 93 of 93 reachable tiles -- a light
    // always on (#624). No target chosen, no question asked, no marks.
    expect(overlaysFor(mission, unit.id).blockedShot).toEqual([]);
    expect(overlaysFor(mission, unit.id, undefined).blockedShot).toEqual([]);
  });

  it("never marks more tiles than the unit can reach", () => {
    const mission = startedMission("player");
    const unit = mission.units.filter((u) => u.team === "tdf")[1];
    const spawner = mission.spawners[0];
    if (!unit || !spawner) throw new Error("fixture");

    const state = overlaysFor(mission, unit.id, spawner.id);
    expect(state.blockedShot.length).toBeLessThanOrEqual(
      state.moveRange.length,
    );
  });
});
