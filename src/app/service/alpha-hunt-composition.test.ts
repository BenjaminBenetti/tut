import { describe, expect, it } from "vitest";

import { BROODMOTHER_TUNING } from "../../bugs/data/broodmother-tuning";
import { isBroodmother } from "../../bugs/service/broodmother-service";
import type { Mission } from "../../overworld/model/mission";
import type { Nemesis } from "../../overworld/model/nemesis";
import { chronicleOf } from "../../overworld/service/campaign-chronicle-service";
import type { GameState } from "../../save/model/game-state";
import { MemoryKeyValueStore } from "../../save/repository/memory-key-value-store";
import { attack } from "../../tactical/model/attack-command";
import { endTurn } from "../../tactical/model/end-turn-command";
import { extract } from "../../tactical/model/extract-command";
import { finishMission } from "../../tactical/model/finish-mission-command";
import { startMission } from "../../tactical/model/start-mission-command";
import type {
  KillBroodmotherObjective,
  TacticalState,
} from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import { findAttackTarget } from "../../tactical/service/attack-target-service";
import { positionsWithin } from "../../tactical/service/mission-driver.test-helper";
import {
  buildMoveGraph,
  occupiedKeys,
} from "../../tactical/service/movement-service";
import { objectiveComplete } from "../../tactical/service/objectives/objective-status";
import { TECH_NODES } from "../../tech/data/tech-tree";
import { revealedTechNodes } from "../../tech/service/tech-reveal-service";
import type { GameComposition } from "./game-composition";
import { composeGame } from "./game-composition";

// ===========================================
// Fixtures
// ===========================================

const NOW = "2026-09-26T00:00:00.000Z";

/** Turns an escape may take before the run counts as stuck. */
const TURN_CAP = 8;

/** The shipped composition over an in-memory store. */
function build(): GameComposition {
  return composeGame({
    storage: new MemoryKeyValueStore(),
    clock: { now: () => NOW },
    newSeed: () => 7,
    onAutosaveFailure: () => undefined,
  });
}

/** The campaign the session holds. */
function campaign(game: GameComposition): GameState {
  const state = game.session.state;
  if (state === undefined) throw new Error("no campaign in the session");
  return state;
}

/** The live mission. */
function live(game: GameComposition): TacticalState {
  const mission = campaign(game).activeMission;
  if (mission === undefined) throw new Error("no mission in progress");
  return mission;
}

/**
 * A fresh seed-7 campaign with one Alpha Hunt on the board, for Old
 * Scald, a level-1 nemesis with one escape behind her, in the region of
 * the campaign's first city. Started with the whole starter roster.
 */
function huntStarted(game: GameComposition): {
  offer: Mission;
  nemesis: Nemesis;
} {
  const fresh = game.createCampaign({ seed: 7, createdAt: NOW });
  const city = fresh.overworld.map.cities[0];
  if (city === undefined) throw new Error("the map has no city");
  const nemesis: Nemesis = {
    id: "nemesis-old-scald",
    speciesId: "broodmother",
    name: "Old Scald",
    scar: "burned along the flank",
    regionId: city.regionId,
    level: 1,
    escapes: 1,
  };
  const offer: Mission = {
    id: "mission-hunt",
    typeId: "alpha-hunt",
    cityId: city.id,
    difficulty: 4,
    mapParams: {
      biome: "temperate",
      settlement: "town",
      size: "medium",
      seed: "alpha-hunt-live",
    },
    rewards: { credits: 1200, techPoints: 20 },
    createdDay: fresh.overworld.day,
    expiresDay: fresh.overworld.day + 4,
    ignorePenalty: 15,
    alphaHunt: {
      nemesisId: nemesis.id,
      name: nemesis.name,
      scar: nemesis.scar,
      scars: nemesis.escapes,
      level: nemesis.level,
    },
  };
  game.session.start({
    ...fresh,
    overworld: {
      ...fresh.overworld,
      missions: [offer],
      progress: { ...fresh.overworld.progress, nemeses: [nemesis] },
    },
  });
  const started = game.session.store?.dispatch(
    startMission(offer.id, {
      missionId: offer.id,
      squadIds: fresh.roster.squads.map((squad) => squad.id),
      mechIds: fresh.roster.mechs.map((mech) => mech.id),
    }),
  );
  expect(started?.ok).toBe(true);
  return { offer, nemesis };
}

/** Her unit on the live mission. */
function motherOf(mission: TacticalState): Unit {
  const mother = mission.units.find(isBroodmother);
  if (mother === undefined) throw new Error("she is not on the map");
  return mother;
}

/** The hunt's objective on the live mission. */
function huntOf(mission: TacticalState): KillBroodmotherObjective {
  const objective = mission.objectives.find(
    (candidate) => candidate.kind === "kill-broodmother",
  );
  if (objective?.kind !== "kill-broodmother") {
    throw new Error("the mission has no hunt");
  }
  return objective;
}

/** Replaces the live mission with `next`. */
function replaceMission(game: GameComposition, next: TacticalState): void {
  game.session.replace({ ...campaign(game), activeMission: next });
}

/**
 * Stands every unit of the force on a free tile within four of her
 * block, with a clear sight line, and drops her to `hp`. Finding her is
 * a march, not a rule; the kill that follows is the shipped attack.
 */
function cornerHer(game: GameComposition, hp: number): void {
  const mission = live(game);
  const mother = motherOf(mission);
  const target = findAttackTarget(mission, mother.id);
  if (target === undefined) throw new Error("she is not a target");
  const graph = buildMoveGraph(mission.map);
  const taken = new Set(occupiedKeys(mission, graph.index));
  const units = mission.units.map((unit) => {
    if (unit.id === mother.id) return { ...unit, hp };
    if (unit.team !== "tdf") return unit;
    const spot = positionsWithin(mission, unit, target, 4, true, graph)
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
    return { ...unit, pos: spot.tile, ap: unit.maxAp };
  });
  replaceMission(game, { ...mission, units });
}

/** Fires the force's shipped attacks at her until she falls. */
function killHer(game: GameComposition): void {
  const motherId = motherOf(live(game)).id;
  for (let volley = 0; volley < 20; volley++) {
    for (const unit of live(game).units) {
      if (motherOf(live(game)).hp <= 0) return;
      if (unit.team !== "tdf" || unit.hp <= 0 || unit.ap <= 0) continue;
      game.session.store?.dispatch(attack(unit.id, motherId));
    }
    // Everyone has fired: the next volley on fresh action points.
    const mission = live(game);
    replaceMission(game, {
      ...mission,
      units: mission.units.map((unit) =>
        unit.team === "tdf" ? { ...unit, ap: unit.maxAp } : unit,
      ),
    });
  }
  throw new Error("she did not fall");
}

/**
 * Boards the whole force from the extraction zone, one unit at a time
 * (walking home is a march, not a rule), then finishes the mission.
 */
function boardAndFinish(game: GameComposition, offer: Mission): void {
  for (let guard = 0; guard < 20; guard++) {
    const mission = live(game);
    const ramp = mission.extraction[0];
    const next = mission.units.find(
      (unit) => unit.team === "tdf" && unit.hp > 0 && unit.kind !== "turret",
    );
    if (ramp === undefined) throw new Error("no extraction zone");
    if (next === undefined || mission.outcome !== undefined) break;
    replaceMission(game, {
      ...mission,
      units: mission.units.map((unit) =>
        unit.id === next.id ? { ...unit, pos: ramp, ap: unit.maxAp } : unit,
      ),
    });
    expect(game.session.store?.dispatch(extract(next.id))?.ok).toBe(true);
  }
  const finished = game.session.store?.dispatch(finishMission(offer.id));
  if (!finished?.ok) throw new Error("the mission did not finish");
}

// ===========================================
// Tests
// ===========================================

describe("an Alpha Hunt through the composition root (#1179, campaign arc §6.8)", () => {
  it("kill, then extract: the hunt is won, the nemesis is gone for good but chronicled, and her autopsy is revealed", () => {
    const game = build();
    const { offer, nemesis } = huntStarted(game);
    const before = game.techConditionsOf(campaign(game));
    const huntDay = campaign(game).overworld.day;
    const started = live(game);
    const mother = motherOf(started);
    expect(mother.name).toBe("Old Scald");
    expect(huntOf(started)).toMatchObject({
      targetId: mother.id,
      complete: false,
    });

    cornerHer(game, 6);
    killHer(game);
    const after = live(game);
    expect(objectiveComplete(after, huntOf(after))).toBe(true);
    // Her death is not the end: the force still has to get out.
    expect(after.outcome).toBeUndefined();

    boardAndFinish(game, offer);
    const state = campaign(game);
    expect(state.overworld.lastMissionResult).toMatchObject({
      outcome: "won",
      broodmotherKilled: true,
      broodmotherEscaped: false,
    });
    expect(state.overworld.progress.nemeses).toEqual([]);
    // Struck from the living record, kept in the chronicle the end
    // screen reads her fate from.
    expect(chronicleOf(state.overworld.progress).nemesesKilled).toEqual([
      {
        id: nemesis.id,
        name: "Old Scald",
        speciesId: "broodmother",
        day: huntDay,
      },
    ]);
    expect(
      state.overworld.growthPausedUntil?.[nemesis.regionId],
    ).toBeGreaterThan(state.overworld.day);
    // The seam autopsies-2 hangs her autopsy on: the kill is recorded,
    // and the node hidden behind `killed:broodmother` comes out.
    expect(state.overworld.progress.speciesKilled).toContain("broodmother");
    expect(
      revealedTechNodes(TECH_NODES, before, game.techConditionsOf(state)).map(
        (node) => node.id,
      ),
    ).toContain("tech.broodmother-autopsy");
  });

  it("escape: she runs at half health, leaves by the edge, the hunt fails and she comes back stronger", () => {
    const game = build();
    const { offer, nemesis } = huntStarted(game);
    const hurt = live(game);
    const mother = motherOf(hurt);
    const half = Math.floor(mother.maxHp * BROODMOTHER_TUNING.fleeAtHpFraction);
    replaceMission(game, {
      ...hurt,
      units: hurt.units.map((unit) =>
        unit.id === mother.id ? { ...unit, hp: half } : unit,
      ),
    });

    // The force holds the drop zone; she runs on her own behaviour.
    for (let turn = 0; turn < TURN_CAP; turn++) {
      if (huntOf(live(game)).failed === true) break;
      expect(game.session.store?.dispatch(endTurn())?.ok).toBe(true);
    }
    const after = live(game);
    expect(after.escaped?.map((unit) => unit.id)).toEqual([mother.id]);
    expect(huntOf(after)).toMatchObject({ complete: false, failed: true });

    boardAndFinish(game, offer);
    const state = campaign(game);
    expect(state.overworld.lastMissionResult).toMatchObject({
      outcome: "extracted",
      broodmotherKilled: false,
      broodmotherEscaped: true,
    });
    expect(state.overworld.progress.nemeses).toEqual([
      expect.objectContaining({
        id: nemesis.id,
        name: "Old Scald",
        level: 2,
        escapes: 2,
        regionId: nemesis.regionId,
      }),
    ]);
  });
});
