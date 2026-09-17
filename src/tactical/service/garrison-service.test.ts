import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { HookKinds } from "../../mapgen/model/hook";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { GARRISON_TUNING } from "../data/garrison-tuning";
import type { GarrisonTuning } from "../model/garrison-tuning";
import type { Spawner, TacticalState } from "../model/tactical-state";
import {
  GARRISON_TURRET_SOURCE_ID,
  turretHasBattery,
  turretIsActive,
} from "../model/turret";
import { TURRET_DEPLOYED } from "../model/turret-deployed-event";
import type { Unit } from "../model/unit";
import { garrisonCandidates, placeGarrisonTurrets } from "./garrison-service";
import { missionWith, unitAt } from "./tactical-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number): TileCoord => ({ x, y: 0, z });

/** The deploy zone: the west edge, four tiles. */
const DEPLOY = [at(0, 0), at(0, 1), at(0, 2), at(0, 3)];
/** The nest: the far east corner. */
const NEST = at(19, 19);
/** A bug's way in: the south-east tile. */
const EDGE = [at(10, 19)];

/**
 * A flat 20×20 field with the squad's zone on the west edge, an egg
 * spawner in the far corner, one edge-spawn tile and extraction on the
 * deploy zone; wide enough that the clearances leave real room.
 */
function fieldMap(): TacticalMap {
  return new FixtureMapBuilder(20, 20, 2)
    .fillGround()
    .deploy(DEPLOY)
    .objective(HookKinds.EGG_SPAWNER, [NEST])
    .edgeSpawn(EDGE)
    .extraction(DEPLOY)
    .build();
}

/** The mission before the garrison: a squad in the zone, the nest live. */
function field(units: readonly Unit[] = []): TacticalState {
  const spawner: Spawner = {
    id: "spawner-1",
    pos: NEST,
    hatchRadius: 3,
    hp: 20,
    timer: 5,
    destroyed: false,
  };
  return missionWith(
    fieldMap(),
    [unitAt("s1", "infantry", at(0, 1)), ...units],
    { spawners: [spawner] },
  );
}

/** Ground distance between two tiles. */
function apart(a: TileCoord, b: TileCoord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

/** Places `count` with a fresh seeded stream and fresh ids. */
function garrison(
  mission: TacticalState,
  count: number,
  seed = 11,
  tuning: GarrisonTuning = GARRISON_TUNING,
) {
  return placeGarrisonTurrets(
    mission,
    count,
    tuning,
    new Mulberry32Rng(seed),
    new SequentialIdGenerator(),
  );
}

/** The turrets a placement stood. */
function turrets(mission: TacticalState): Unit[] {
  return mission.units.filter((unit) => unit.kind === "turret");
}

// ===========================================
// Candidates
// ===========================================

describe("garrisonCandidates", () => {
  it("keeps clear of the deploy zone, the nest, the hooks and the units, and stays on reachable ground", () => {
    const mission = field([unitAt("s2", "infantry", at(9, 9))]);
    const candidates = garrisonCandidates(mission, GARRISON_TUNING);
    expect(candidates.length).toBeGreaterThan(100);
    for (const tile of candidates) {
      expect(
        DEPLOY.every((zone) => apart(tile, zone) >= 4),
        `${String(tile.x)},${String(tile.z)} is inside the deploy clearance`,
      ).toBe(true);
      expect(apart(tile, NEST)).toBeGreaterThanOrEqual(6);
      expect(EDGE.some((edge) => edge.x === tile.x && edge.z === tile.z)).toBe(
        false,
      );
      expect(tile.x === 9 && tile.z === 9).toBe(false);
    }
    // The clearance is a Manhattan ring around the zone: (3, 1) is three
    // from (0, 1) and out; (4, 1) is four and in; (0, 7) is four from the
    // zone's last tile and in.
    const has = (x: number, z: number) =>
      candidates.some((tile) => tile.x === x && tile.z === z);
    expect(has(3, 1)).toBe(false);
    expect(has(4, 1)).toBe(true);
    expect(has(0, 7)).toBe(true);
    expect(has(0, 6)).toBe(false);
  });

  it("drops ground the deploy zone cannot walk to, and counts a destroyed nest as no longer in the way", () => {
    const builder = new FixtureMapBuilder(20, 20, 2)
      .fillGround()
      .deploy(DEPLOY)
      .objective(HookKinds.EGG_SPAWNER, [NEST])
      .extraction(DEPLOY);
    // An island: (15, 5) walled in on every side.
    for (const side of ["n", "e", "s", "w"] as const) {
      builder.wall(at(15, 5), side, "solid");
    }
    const walled = missionWith(builder.build(), [], {
      spawners: [
        {
          id: "spawner-1",
          pos: NEST,
          hatchRadius: 3,
          hp: 0,
          timer: 5,
          destroyed: true,
        },
      ],
    });
    const candidates = garrisonCandidates(walled, GARRISON_TUNING);
    expect(candidates.some((tile) => tile.x === 15 && tile.z === 5)).toBe(
      false,
    );
    expect(candidates.some((tile) => apart(tile, NEST) < 6)).toBe(true);
    expect(
      candidates.some((tile) => tile.x === NEST.x && tile.z === NEST.z),
    ).toBe(false);
  });
});

// ===========================================
// Placement
// ===========================================

describe("placeGarrisonTurrets", () => {
  it("stands the count as armed turrets on mains, spaced apart, each with its own template and a TurretDeployed", () => {
    const before = field();
    const placed = garrison(before, 3);
    const stood = turrets(placed.state);
    expect(stood).toHaveLength(3);
    for (const turret of stood) {
      expect(turret).toMatchObject({
        team: "tdf",
        sourceId: GARRISON_TURRET_SOURCE_ID,
        templateId: `turret:${GARRISON_TURRET_SOURCE_ID}`,
        hp: 30,
        status: ["overwatch"],
        overwatchShots: 2,
      });
      expect(turretHasBattery(turret)).toBe(false);
      expect(turretIsActive(turret)).toBe(true);
      expect("turnsLeft" in turret).toBe(false);
    }
    for (const a of stood) {
      for (const b of stood) {
        if (a !== b) {
          expect(apart(a.pos, b.pos)).toBeGreaterThanOrEqual(
            GARRISON_TUNING.spacing,
          );
        }
      }
    }
    expect(
      placed.state.templates[`turret:${GARRISON_TURRET_SOURCE_ID}`],
    ).toMatchObject({
      name: "Garrison turret",
      maxAp: 0,
      move: 0,
      armor: 2,
      construction: "mechanical",
    });
    expect(placed.events).toEqual(
      stood.map((turret) => ({
        type: TURRET_DEPLOYED,
        payload: { turretId: turret.id, tile: turret.pos, overwatchShots: 2 },
      })),
    );
    // The squad and its template are untouched, and the input is not.
    expect(placed.state.units[0]).toBe(before.units[0]);
    expect(before.units).toHaveLength(1);
  });

  it("is a pure function of the stream: the same seed stands the same turrets, another seed moves them", () => {
    const a = garrison(field(), 4, 5);
    const b = garrison(field(), 4, 5);
    const c = garrison(field(), 4, 6);
    expect(b.state).toEqual(a.state);
    expect(b.events).toEqual(a.events);
    expect(turrets(c.state).map((t) => t.pos)).not.toEqual(
      turrets(a.state).map((t) => t.pos),
    );
  });

  it("places none for a zero count and as many as the spacing allows for a count the map cannot hold", () => {
    const before = field();
    const none = garrison(before, 0);
    expect(none.state).toBe(before);
    expect(none.events).toEqual([]);
    const crowded = garrison(field(), 200, 3, {
      ...GARRISON_TUNING,
      spacing: 12,
    });
    const stood = turrets(crowded.state);
    expect(stood.length).toBeGreaterThan(0);
    expect(stood.length).toBeLessThan(200);
    for (const a of stood) {
      for (const b of stood) {
        if (a !== b) {
          expect(apart(a.pos, b.pos)).toBeGreaterThanOrEqual(12);
        }
      }
    }
  });
});
