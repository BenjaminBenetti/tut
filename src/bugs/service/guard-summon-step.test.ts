import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import type { BugSpeciesId } from "../../content/model/bug-species-id";
import { GUARDS_SUMMONED } from "../../tactical/model/guards-summoned-event";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import { footprintTiles } from "../../tactical/service/footprint-service";
import {
  riggedRng,
  unitAt,
} from "../../tactical/service/tactical-fixtures.test-helper";
import { SOVEREIGN_TUNING } from "../data/sovereign-tuning";
import { BUG_SPECIES } from "../data/species";
import { fieldMap, walledFieldAt } from "./broodmother.test-helper";
import { createGuardSummonStep, summonGuards } from "./guard-summon-step";
import { groundGap, isSovereign } from "./sovereign-service";
import { sovereignMission } from "./sovereign.test-helper";

// ===========================================
// Fixtures
// ===========================================

/** Her anchor: her block covers x 10–13, z 10–13. */
const ANCHOR = { x: 10, y: 0, z: 10 };

/** The escort species from the shipped catalogue. */
const speciesOf = (id: BugSpeciesId) => BUG_SPECIES[id];

/** A context whose ids start at 700. */
function ctx() {
  return {
    rng: riggedRng(true),
    ids: new SequentialIdGenerator({ counters: { unit: 700 } }),
  };
}

/** The Sovereign on a 30×30 field on the bugs' phase of `turn`. */
function field(turn: number, units: readonly Unit[] = []): TacticalState {
  return sovereignMission(fieldMap(30, 30).build(), units, ANCHOR, {
    turn,
  }).mission;
}

/** The units a summons added. */
function added(before: TacticalState, after: TacticalState): Unit[] {
  const had = new Set(before.units.map((u) => u.id));
  return after.units.filter((u) => !had.has(u.id));
}

// ===========================================
// Tests
// ===========================================

describe("summonGuards (#1179, campaign arc §9)", () => {
  it("calls two escorts on the bugs' phase of every third turn, and never between", () => {
    expect(SOVEREIGN_TUNING.summon.interval).toBe(3);
    const counts = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((turn) => {
      const mission = field(turn);
      return added(mission, summonGuards(mission, ctx(), { speciesOf }).state)
        .length;
    });
    expect(counts).toEqual([0, 0, 2, 0, 0, 2, 0, 0, 2]);
  });

  it("calls nobody as the player's phase opens, even on a third turn", () => {
    const mission = { ...field(3), phase: "player" as const };
    const applied = summonGuards(mission, ctx(), { speciesOf });
    expect(applied.state).toBe(mission);
    expect(applied.events).toEqual([]);
  });

  it("stands the finale's armoured escort beside her, on free tiles, with no action points, and says so", () => {
    const mission = field(3);
    const her = mission.units.find(isSovereign)!;
    const applied = createGuardSummonStep({ speciesOf })(mission, ctx());
    const guards = added(mission, applied.state);
    expect(guards.map((g) => g.sourceId)).toEqual([
      "swarmer-armoured",
      "lurker-armoured",
    ]);
    expect(guards.map((g) => g.id)).toEqual(["unit-700", "unit-701"]);
    expect(applied.events).toEqual([
      {
        type: GUARDS_SUMMONED,
        payload: { unitId: her.id, guardIds: ["unit-700", "unit-701"] },
      },
    ]);
    const hers = new Set(
      footprintTiles(her.pos, 4).map((t) => `${String(t.x)},${String(t.z)}`),
    );
    const seen = new Set<string>();
    for (const guard of guards) {
      const key = `${String(guard.pos.x)},${String(guard.pos.z)}`;
      expect(hers.has(key)).toBe(false);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      expect(guard.ap).toBe(0);
      expect(groundGap(her.pos, 4, guard.pos, 1)).toBeLessThanOrEqual(
        SOVEREIGN_TUNING.summon.radius,
      );
      expect(applied.state.templates[guard.templateId]).toBeDefined();
    }
  });

  it("passes over tiles already held and places the guards on the next free ones", () => {
    const empty = field(3);
    const firstTwo = added(
      empty,
      summonGuards(empty, ctx(), { speciesOf }).state,
    ).map((g) => g.pos);
    // Stand squads on exactly the tiles the guards took.
    const blockers = firstTwo.map((pos, i) =>
      unitAt(`blocker-${String(i)}`, "infantry", pos),
    );
    const crowded = field(3, blockers);
    const guards = added(
      crowded,
      summonGuards(crowded, ctx(), { speciesOf }).state,
    );
    expect(guards).toHaveLength(2);
    for (const guard of guards) {
      for (const pos of firstTwo) {
        expect(guard.pos).not.toEqual(pos);
      }
    }
  });

  it("calls nobody, draws no id and logs nothing when no tile near her is free", () => {
    const mission = field(3);
    const her = mission.units.find(isSovereign)!;
    // A ring of squads on every tile within the summons' reach.
    const ring: Unit[] = [];
    for (let x = 0; x < 30; x++) {
      for (let z = 0; z < 30; z++) {
        const pos = { x, y: 0, z };
        const gap = groundGap(her.pos, 4, pos, 1);
        if (gap >= 1 && gap <= SOVEREIGN_TUNING.summon.radius) {
          ring.push(unitAt(`r-${String(x)}-${String(z)}`, "infantry", pos));
        }
      }
    }
    const boxed = field(3, ring);
    const ids = new SequentialIdGenerator({ counters: { unit: 700 } });
    const applied = summonGuards(
      boxed,
      { rng: riggedRng(true), ids },
      { speciesOf },
    );
    expect(applied.state).toBe(boxed);
    expect(applied.events).toEqual([]);
    expect(ids.nextId("unit")).toBe("unit-700");
  });

  it("never calls a guard across a wall from her", () => {
    // A solid wall along the east side of column 14, right against her
    // block's east edge (x 13): the tiles beyond it are nearer as the
    // crow flies than many on her side, but no guard walks round.
    const mission = sovereignMission(walledFieldAt(30, 30, 13), [], ANCHOR, {
      turn: 3,
    }).mission;
    const guards = added(
      mission,
      summonGuards(mission, ctx(), {
        speciesOf,
        summon: { ...SOVEREIGN_TUNING.summon, count: 40 },
      }).state,
    );
    expect(guards.length).toBeGreaterThan(20);
    for (const guard of guards) {
      expect(guard.pos.x).toBeLessThanOrEqual(13);
    }
  });

  it("leaves a mission without a Sovereign as it was", () => {
    const mission = field(3);
    const without: TacticalState = {
      ...mission,
      units: mission.units.filter((u) => !isSovereign(u)),
    };
    expect(summonGuards(without, ctx(), { speciesOf }).state).toBe(without);
  });
});
