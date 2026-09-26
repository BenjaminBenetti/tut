import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { OBJECTIVE_TUNING } from "../../data/objective-tuning";
import { PLATFORM_ASSAULT_TUNING } from "../../data/platform-assault-tuning";
import { interact } from "../../model/interact-command";
import { MISSION_ENDED } from "../../model/mission-ended-event";
import { OBJECTIVE_UPDATED } from "../../model/objective-updated-event";
import type {
  DestroyPlatformCoreObjective,
  Spawner,
  TacticalState,
} from "../../model/tactical-state";
import { missionOutcome } from "../mission-end-service";
import { missionFinished, stagePending } from "../mission-stage-service";
import {
  createInteractHandler,
  reachableObjectives,
} from "../objective-service";
import { damageSpawner } from "../spawner-damage-service";
import {
  ctxWith,
  missionWith,
  openField,
  unitAt,
} from "../tactical-fixtures.test-helper";
import { DESTROY_PLATFORM_CORE_OBJECTIVE } from "./destroy-platform-core-objective";
import { objectiveComplete, objectiveFailed } from "./objective-status";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number): TileCoord => ({ x, y: 0, z });

/**
 * The core, filling the 3×3 in the middle of the 8 × 8 chamber (anchored
 * at its lowest corner, so its middle is (4, 4)), at the shipped hit
 * points.
 */
const CORE: Spawner = {
  id: "spawner-1",
  variant: "platform-core",
  pos: at(3, 3),
  hatchRadius: 3,
  hp: PLATFORM_ASSAULT_TUNING.coreHp,
  timer: 0,
  destroyed: false,
};

const OBJECTIVE: DestroyPlatformCoreObjective = {
  id: "objective-1",
  kind: "destroy-platform-core",
  targetId: CORE.id,
  coreHp: PLATFORM_ASSAULT_TUNING.coreHp,
  complete: false,
};

/**
 * The core chamber, stage 2 of 2, set up as the platform's setup sets
 * it: no extraction, ending on its objective, a squad beside the core's
 * west face (or at `squad`).
 */
function chamber(
  core: Partial<Spawner> = {},
  squad: TileCoord = at(2, 4),
): TacticalState {
  return {
    ...missionWith(
      openField().build(),
      [unitAt("u", "infantry", squad), unitAt("m", "mech", at(0, 0))],
      { spawners: [{ ...CORE, ...core }], objectives: [OBJECTIVE] },
    ),
    extraction: [],
    endsOnObjectives: true,
    stage: { index: 1, count: 2, earlier: [] },
  };
}

const objectiveOf = (state: TacticalState) =>
  state.objectives[0] as DestroyPlatformCoreObjective;

// ===========================================
// The rule
// ===========================================

describe("destroy-platform-core (campaign arc §6.9)", () => {
  const plant = createInteractHandler(OBJECTIVE_TUNING);
  const ctx = ctxWith(new Mulberry32Rng(1));

  it("takes a charge's damage off the core without finishing anything", () => {
    const planted = plant(chamber(), interact("u", OBJECTIVE.id), ctx);
    expect(planted.ok).toBe(true);
    if (!planted.ok) return;
    const core = planted.value.state.spawners[0];
    expect(core?.hp).toBe(CORE.hp - OBJECTIVE_TUNING.chargeDamage);
    expect(objectiveOf(planted.value.state).complete).toBe(false);
    expect(planted.value.state.outcome).toBeUndefined();
  });

  it("wins the finale the moment the core falls, with the force still on the map", () => {
    const planted = plant(
      chamber({ hp: OBJECTIVE_TUNING.chargeDamage }),
      interact("u", OBJECTIVE.id),
      ctx,
    );
    expect(planted.ok).toBe(true);
    if (!planted.ok) return;
    const state = planted.value.state;
    expect(state.spawners[0]).toMatchObject({ hp: 0, destroyed: true });
    expect(objectiveOf(state).complete).toBe(true);
    expect(objectiveComplete(state, objectiveOf(state))).toBe(true);
    expect(state.units.filter((unit) => unit.hp > 0)).toHaveLength(2);
    expect(state.outcome).toBe("won");
    expect(stagePending(state)).toBe(false);
    expect(missionFinished(state)).toBe(true);
    expect(planted.value.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([OBJECTIVE_UPDATED, MISSION_ENDED]),
    );
  });

  it("counts gunfire, blasts and fire as a charge, through the shared spawner damage", () => {
    const shot = damageSpawner(chamber(), CORE.id, CORE.hp, "m");
    expect(objectiveOf(shot.state).complete).toBe(true);
    expect(missionOutcome(shot.state)).toBe("won");
  });

  it("does not end a stage that is not marked to end on its objectives", () => {
    const { endsOnObjectives: _dropped, ...ordinary } = chamber();
    const shot = damageSpawner(ordinary, CORE.id, CORE.hp, "m");
    expect(objectiveOf(shot.state).complete).toBe(true);
    expect(missionOutcome(shot.state)).toBeUndefined();
  });

  it("never fails by its own rule, and tracks the core's hit points", () => {
    expect(objectiveFailed(chamber(), OBJECTIVE)).toBe(false);
    expect(
      DESTROY_PLATFORM_CORE_OBJECTIVE.tally?.(OBJECTIVE, chamber()),
    ).toEqual({
      done: 0,
      total: 1,
    });
    expect(
      DESTROY_PLATFORM_CORE_OBJECTIVE.tally?.(
        { ...OBJECTIVE, complete: true },
        chamber(),
      ),
    ).toEqual({ done: 1, total: 1 });
  });

  it("is offered to a unit beside any face of the core, and pointed at on its middle tile", () => {
    for (const squad of [at(2, 4), at(6, 4), at(4, 6)]) {
      expect(
        reachableObjectives(chamber({}, squad), "u", OBJECTIVE_TUNING).map(
          (reachable) => reachable.objective.id,
        ),
        `${String(squad.x)},${String(squad.z)}`,
      ).toEqual([OBJECTIVE.id]);
    }
    expect(reachableObjectives(chamber(), "m", OBJECTIVE_TUNING)).toEqual([]);
    expect(
      DESTROY_PLATFORM_CORE_OBJECTIVE.destination?.(OBJECTIVE, chamber()),
    ).toEqual({ position: at(4, 4) });
  });
});
