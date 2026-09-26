import { describe, expect, it } from "vitest";

import type { Deployment } from "../../overworld/model/deployment";
import { HIVE_TUNING } from "../../overworld/data/hive-tuning";
import type { Hive } from "../../overworld/model/hive";
import type { Mission } from "../../overworld/model/mission";
import { advanceDay } from "../../overworld/model/overworld-command";
import { citiesInRegion } from "../../overworld/service/earth-map-query-service";
import { MemoryKeyValueStore } from "../../save/repository/memory-key-value-store";
import type { GameState } from "../../save/model/game-state";
import { OBJECTIVE_TUNING } from "../../tactical/data/objective-tuning";
import { endTurn } from "../../tactical/model/end-turn-command";
import { finishMission } from "../../tactical/model/finish-mission-command";
import { startMission } from "../../tactical/model/start-mission-command";
import type {
  Spawner,
  TacticalState,
} from "../../tactical/model/tactical-state";
import { spawnerAttackTarget } from "../../tactical/service/attack-target-service";
import {
  homewardAction,
  nextActionAgainst,
  positionsWithin,
} from "../../tactical/service/mission-driver.test-helper";
import type { MoveGraph } from "../../tactical/service/movement-service";
import {
  buildMoveGraph,
  occupiedKeys,
} from "../../tactical/service/movement-service";
import { objectiveComplete } from "../../tactical/service/objectives/objective-status";
import type { GameComposition } from "./game-composition";
import { composeGame } from "./game-composition";

// ===========================================
// Fixtures
// ===========================================

const NOW = "2026-09-26T00:00:00.000Z";

/** Turns the run may take before it counts as stuck. */
const TURN_CAP = 40;

/** The shipped composition over an in-memory store. */
function build(): GameComposition {
  return composeGame({
    storage: new MemoryKeyValueStore(),
    clock: { now: () => NOW },
    newSeed: () => 7,
    onAutosaveFailure: () => undefined,
  });
}

/**
 * A fresh seed-7 campaign with a hive formed today in the region of its
 * most infested city, and no offers on the board yet.
 */
function campaignWithHive(game: GameComposition): {
  readonly state: GameState;
  readonly hive: Hive;
} {
  const fresh = game.createCampaign({ seed: 7, createdAt: NOW });
  const worst = [...fresh.overworld.map.cities]
    .filter((city) => city.infestation > 0)
    .sort((a, b) => b.infestation - a.infestation)[0];
  if (worst === undefined) throw new Error("fixture needs an infested city");
  const hive: Hive = {
    id: "hive-1",
    regionId: worst.regionId,
    formedDay: fresh.overworld.day,
  };
  const state: GameState = {
    ...fresh,
    overworld: { ...fresh.overworld, missions: [], hives: [hive] },
  };
  game.session.start(state);
  return { state, hive };
}

/** The live mission, or a thrown error: the run has no business without one. */
function live(game: GameComposition): TacticalState {
  const mission = game.session.state?.activeMission;
  if (mission === undefined) throw new Error("no mission in progress");
  return mission;
}

/** The mission's hive core. */
function coreOf(mission: TacticalState): Spawner {
  const core = mission.spawners.find((s) => s.variant === "hive-core");
  if (core === undefined) throw new Error("the cavern has no hive core");
  return core;
}

/**
 * Stands every squad on a free tile within three of the core with a clear
 * sight line to it. The cavern puts the core the whole map's depth from
 * the drop ship, which is a march, not a rule; the guards stay where the
 * setup put them, so the fight at the core is the shipped one.
 */
function standBesideTheCore(game: GameComposition, graph: MoveGraph): void {
  const state = game.session.state;
  const mission = live(game);
  if (state === undefined) throw new Error("no campaign");
  const core = spawnerAttackTarget(coreOf(mission));
  const taken = new Set(occupiedKeys(mission, graph.index));
  const units = mission.units.map((unit) => {
    if (unit.team !== "tdf") return unit;
    const spot = positionsWithin(mission, unit, core, 3, true, graph)
      .filter((p) => !taken.has(graph.index.keyOf(p.tile)))
      .sort(
        (a, b) =>
          a.distance - b.distance ||
          a.tile.z - b.tile.z ||
          a.tile.x - b.tile.x ||
          a.tile.y - b.tile.y,
      )[0];
    if (spot === undefined) throw new Error(`no room for ${unit.id}`);
    taken.add(graph.index.keyOf(spot.tile));
    return { ...unit, pos: spot.tile };
  });
  game.session.replace({ ...state, activeMission: { ...mission, units } });
}

/**
 * Stands every living squad on its own tile of the extraction zone, as
 * the march back from the core would, had it been played.
 */
function standOnTheRamp(game: GameComposition): void {
  const state = game.session.state;
  const mission = live(game);
  if (state === undefined) throw new Error("no campaign");
  const ramp = [...mission.extraction];
  const units = mission.units.map((unit) => {
    if (unit.team !== "tdf" || unit.hp <= 0) return unit;
    const tile = ramp.shift();
    if (tile === undefined) throw new Error(`no room aboard for ${unit.id}`);
    return { ...unit, pos: tile };
  });
  game.session.replace({ ...state, activeMission: { ...mission, units } });
}

/**
 * One TDF turn through the store: every squad goes at the core while it
 * stands (charges from beside it, else a walk in), then home to the drop
 * ship once it has fallen; then the real `EndTurn`, so the guards and
 * the nests answer.
 */
function playTurn(game: GameComposition, graph: MoveGraph): void {
  const ids = live(game)
    .units.filter((u) => u.team === "tdf")
    .map((u) => u.id);
  for (const unitId of ids) {
    for (let step = 0; step < 6; step++) {
      const mission = live(game);
      if (mission.outcome !== undefined) return;
      const core = coreOf(mission);
      const next = core.destroyed
        ? homewardAction(mission, unitId, graph)
        : nextActionAgainst(mission, unitId, core.id, OBJECTIVE_TUNING, graph);
      if (next.kind === "blocked") break;
      if (!game.session.store?.dispatch(next.command).ok) break;
    }
  }
  if (live(game).outcome === undefined) {
    expect(game.session.store?.dispatch(endTurn()).ok).toBe(true);
  }
}

// ===========================================
// The run
// ===========================================

describe("a Hive Assault through the shipped composition (#1179)", () => {
  it("pins the offer, is won at the core, and liberates the region on the way home", () => {
    const game = build();
    const { state: before, hive } = campaignWithHive(game);

    // The next day's trigger pins one assault against the hive.
    expect(game.session.store?.dispatch(advanceDay()).ok).toBe(true);
    const offers: readonly Mission[] =
      game.session.state?.overworld.missions ?? [];
    const assaults = offers.filter((m) => m.typeId === "hive-assault");
    expect(assaults).toHaveLength(1);
    const assault = assaults[0];
    if (assault === undefined) throw new Error("no assault offered");
    expect(assault.pinned).toBe(true);
    expect(assault.hive).toEqual({
      hiveId: hive.id,
      regionId: hive.regionId,
      level: 0,
    });

    const deployment: Deployment = {
      missionId: assault.id,
      squadIds: before.roster.squads.map((s) => s.id),
      mechIds: [],
    };
    expect(
      game.session.store?.dispatch(startMission(assault.id, deployment)).ok,
    ).toBe(true);

    // The cavern stands the core, its guards and one objective on it.
    const opening = live(game);
    const core = coreOf(opening);
    expect(core.hp).toBe(60);
    expect(opening.objectives).toEqual([
      {
        id: opening.objectives[0]?.id,
        kind: "destroy-hive-core",
        targetId: core.id,
        complete: false,
      },
    ]);
    const guards = opening.units.filter(
      (u) => u.templateId === "bug:hive-guard",
    );
    expect(guards.length).toBeGreaterThanOrEqual(2);
    expect(guards.length).toBeLessThanOrEqual(4);

    const graph = buildMoveGraph(opening.map);
    standBesideTheCore(game, graph);

    // Fight until the core falls: the objective's flag is set, but with
    // nobody aboard it is still open and the mission is not won.
    let turns = 0;
    while (!coreOf(live(game)).destroyed && turns++ < TURN_CAP) {
      playTurn(game, graph);
    }
    const fallen = live(game);
    expect(coreOf(fallen).destroyed).toBe(true);
    const objective = fallen.objectives[0];
    if (objective === undefined) throw new Error("the objective went missing");
    expect(objective.complete).toBe(true);
    expect(fallen.extracted).toEqual([]);
    expect(objectiveComplete(fallen, objective)).toBe(false);
    expect(fallen.outcome).toBeUndefined();

    // Home again: the same march, this time back to the ramp. The first
    // squad aboard is what completes the objective; the rest boarding
    // ends the mission, won.
    standOnTheRamp(game);
    const first = live(game).units.find((u) => u.team === "tdf" && u.hp > 0);
    if (first === undefined) throw new Error("nobody lived to go home");
    const boarding = homewardAction(live(game), first.id, graph);
    expect(boarding.kind).toBe("extract");
    if (boarding.kind !== "extract") return;
    expect(game.session.store?.dispatch(boarding.command).ok).toBe(true);
    const aboard = live(game);
    expect(aboard.extracted.map((u) => u.id)).toEqual([first.id]);
    expect(objectiveComplete(aboard, objective)).toBe(true);
    expect(aboard.outcome).toBeUndefined();

    playTurn(game, graph);
    const home = live(game);
    expect(home.outcome).toBe("won");

    // The result, and the region the win frees.
    const atFinish = game.session.state?.overworld ?? before.overworld;
    const was = new Map(
      citiesInRegion(atFinish.map, hive.regionId).map((c) => [
        c.id,
        c.infestation,
      ]),
    );
    expect(game.session.store?.dispatch(finishMission(assault.id)).ok).toBe(
      true,
    );
    const after = game.session.state;
    const result = after?.overworld.lastMissionResult;
    expect(result?.outcome).toBe("won");
    expect(result?.hiveCoreDestroyed).toBe(true);
    expect(result?.techPointsAwarded).toBe(
      assault.rewards.techPoints + (result?.techPointsBounty ?? 0),
    );
    expect(after?.overworld.hives).toEqual([]);
    expect(after?.overworld.growthPausedUntil?.[hive.regionId]).toBe(
      atFinish.day + HIVE_TUNING.liberationGrowthPauseDays + 1,
    );
    expect(after?.overworld.progress.flags).toContain("hive-core-sample");
    // Every city of the region is cut, the host by the win's delta too.
    expect(was.size).toBeGreaterThan(0);
    for (const city of citiesInRegion(
      after?.overworld.map ?? before.overworld.map,
      hive.regionId,
    )) {
      expect(city.infestation, city.id).toBeLessThanOrEqual(
        Math.max(0, (was.get(city.id) ?? 0) - HIVE_TUNING.liberationCut),
      );
    }

    // With the hive gone, tomorrow pins no new assault.
    expect(game.session.store?.dispatch(advanceDay()).ok).toBe(true);
    expect(
      game.session.state?.overworld.missions.filter(
        (m) => m.typeId === "hive-assault",
      ),
    ).toEqual([]);
  });
});
