import { describe, expect, it } from "vitest";

import { advanceDay } from "../../overworld/model/advance-day-command";
import type { Mission } from "../../overworld/model/mission";
import { MISSION_RESOLVED } from "../../overworld/model/mission-resolved-event";
import {
  EVACUATION_LOST_SOURCE,
  EVACUATION_SAVED_SOURCE,
} from "../../overworld/service/missions/evacuation-consequence";
import type { GameState } from "../../save/model/game-state";
import { MemoryKeyValueStore } from "../../save/repository/memory-key-value-store";
import { extract } from "../../tactical/model/extract-command";
import { finishMission } from "../../tactical/model/finish-mission-command";
import { interact } from "../../tactical/model/interact-command";
import { startMission } from "../../tactical/model/start-mission-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import type { GameComposition } from "./game-composition";
import { composeGame } from "./game-composition";

// ===========================================
// Fixtures
// ===========================================

const NOW = "2026-09-26T00:00:00.000Z";

/** The shipped game, played tactically, over memory storage. */
function build(): GameComposition {
  return composeGame({
    storage: new MemoryKeyValueStore(),
    clock: { now: () => NOW },
    newSeed: () => 7,
    onAutosaveFailure: (error) => {
      throw new Error(`autosave failed: ${error.kind}`);
    },
  });
}

/** The campaign the session holds; throws when there is none. */
function live(game: GameComposition): GameState {
  const state = game.session.state;
  if (state === undefined) throw new Error("no campaign in the session");
  return state;
}

/** The active mission; throws when there is none. */
function active(game: GameComposition): TacticalState {
  const mission = live(game).activeMission;
  if (mission === undefined) throw new Error("no active mission");
  return mission;
}

/** Replaces the active mission with `edit` of it, the cheap way past the turn engine. */
function edit(
  game: GameComposition,
  change: (mission: TacticalState) => TacticalState,
): void {
  const state = live(game);
  game.session.replace({ ...state, activeMission: change(active(game)) });
}

/**
 * A fresh campaign two missions into Act I, the board empty, advanced
 * day by day until the director offers an evacuation. The draw is the
 * shipped director's on seed 7.
 */
function firstEvacuation(game: GameComposition): Mission {
  const fresh = game.createCampaign({ seed: 7, createdAt: NOW });
  game.session.start({
    ...fresh,
    overworld: {
      ...fresh.overworld,
      missions: [],
      progress: { ...fresh.overworld.progress, missionsPlayed: 2 },
    },
  });
  for (let day = 0; day < 30; day++) {
    const offer = live(game).overworld.missions.find(
      (m) => m.typeId === "evacuation",
    );
    if (offer !== undefined) return offer;
    expect(game.session.store?.dispatch(advanceDay())?.ok).toBe(true);
  }
  throw new Error("no evacuation offered in thirty days");
}

/** Starts `offer` with the whole starter squad list. */
function start(game: GameComposition, offer: Mission): void {
  const squadIds = live(game).roster.squads.map((s) => s.id);
  const started = game.session.store?.dispatch(
    startMission(offer.id, { missionId: offer.id, squadIds, mechIds: [] }),
  );
  if (!started?.ok) throw new Error("the evacuation did not start");
}

/** The civilian groups on the map. */
function groups(mission: TacticalState): readonly Unit[] {
  return mission.units.filter((u) => u.kind === "civilian");
}

/**
 * Frees the first `count` groups through Interact, each by a squad stood
 * beside it (the walk is not the subject), then stands each freed group
 * and the squad on the ramp and boards them all.
 */
function freeAndBoard(game: GameComposition, count: number): void {
  const rescue = active(game).objectives.find(
    (o) => o.kind === "rescue-civilians",
  );
  const squad = active(game).units.find((u) => u.kind === "squad");
  if (rescue === undefined || squad === undefined) {
    throw new Error("no rescue or no squad");
  }
  const chosen = groups(active(game)).slice(0, count);
  for (const group of chosen) {
    edit(game, (mission) => ({
      ...mission,
      units: mission.units.map((u) =>
        u.id === squad.id
          ? { ...u, pos: { ...group.pos, x: group.pos.x + 1 }, ap: u.maxAp }
          : u,
      ),
    }));
    const freed = game.session.store?.dispatch(interact(squad.id, rescue.id));
    if (!freed?.ok) throw new Error(`could not free ${group.id}`);
  }
  const ramp = active(game).extraction[0];
  if (ramp === undefined) throw new Error("no extraction zone");
  const boarding = new Set([squad.id, ...chosen.map((g) => g.id)]);
  edit(game, (mission) => ({
    ...mission,
    units: mission.units
      .filter((u) => u.kind !== "squad" || u.id === squad.id)
      .map((u) => (boarding.has(u.id) ? { ...u, pos: ramp, ap: u.maxAp } : u)),
  }));
  for (const group of chosen) {
    expect(game.session.store?.dispatch(extract(group.id))?.ok).toBe(true);
  }
  expect(game.session.store?.dispatch(extract(squad.id))?.ok).toBe(true);
}

// ===========================================
// Tests
// ===========================================

describe("an evacuation through the composition root (arc §6.4)", () => {
  it("is offered, set up in the town, won with half the groups aboard, and pays +50% for ten days", () => {
    const game = build();
    const offer = firstEvacuation(game);
    const spec = offer.evacuation;
    if (spec === undefined) throw new Error("the offer carries no groups");
    expect(spec.groups).toBeGreaterThanOrEqual(3);
    expect(spec.groups).toBeLessThanOrEqual(5);
    const city = live(game).overworld.map.cities.find(
      (c) => c.id === offer.cityId,
    );
    expect(city?.detected).toBe(true);
    expect(city?.infestation).toBeGreaterThanOrEqual(25);

    // Set up: the settlement, one trapped group per hook, one rescue.
    start(game, offer);
    const mission = active(game);
    expect(mission.map.recipe.params.archetype).toBe("settlement");
    expect(groups(mission)).toHaveLength(spec.groups);
    expect(groups(mission).every((g) => g.trapped === true)).toBe(true);
    expect(mission.objectives.map((o) => o.kind)).toEqual(["rescue-civilians"]);
    expect(mission.spawners.length).toBeGreaterThan(0);

    // Half the groups out, rounded up, and the squad with them.
    const needed = Math.ceil(spec.groups / 2);
    freeAndBoard(game, needed);
    expect(active(game).outcome).toBe("won");
    const before = live(game);
    const finished = game.session.store?.dispatch(finishMission(offer.id));
    if (!finished?.ok) throw new Error("the mission did not finish");
    const after = live(game);
    const result = after.overworld.lastMissionResult;
    expect(result).toMatchObject({
      outcome: "won",
      civiliansRescued: needed,
      civiliansTotal: spec.groups,
      creditsAwarded: offer.rewards.credits + needed * spec.creditsPerGroup,
      infestationDelta: 0,
    });
    expect(finished.value.events[0]).toEqual({
      type: MISSION_RESOLVED,
      payload: { result },
    });
    expect(after.economy.credits - before.economy.credits).toBe(
      offer.rewards.credits + needed * spec.creditsPerGroup,
    );
    expect(
      after.overworld.map.cities.find((c) => c.id === offer.cityId)
        ?.infestation,
    ).toBe(city?.infestation);
    expect(after.overworld.stipendModifiers).toEqual([
      { factor: 1.5, daysLeft: 10, source: EVACUATION_SAVED_SOURCE },
    ]);

    // Ten stipends later the window is spent.
    const wonOn = after.overworld.day;
    const heldThrough: number[] = [];
    for (let i = 0; i < 10; i++) {
      game.session.store?.dispatch(advanceDay());
      const now = live(game).overworld;
      if (
        now.stipendModifiers?.some((m) => m.source === EVACUATION_SAVED_SOURCE)
      ) {
        heldThrough.push(now.day);
      }
    }
    expect(heldThrough.at(-1)).toBe(wonOn + 9);
    expect(
      live(game).overworld.stipendModifiers?.some(
        (m) => m.source === EVACUATION_SAVED_SOURCE,
      ) ?? false,
    ).toBe(false);
  });

  it("cuts the stipend by a tenth when too few groups get out", () => {
    const game = build();
    const offer = firstEvacuation(game);
    start(game, offer);
    freeAndBoard(game, 1);
    expect(active(game).outcome).toBe("extracted");
    game.session.store?.dispatch(finishMission(offer.id));
    const after = live(game).overworld;
    expect(after.lastMissionResult).toMatchObject({
      outcome: "extracted",
      civiliansRescued: 1,
    });
    expect(after.stipendModifiers).toEqual([
      { factor: 0.9, daysLeft: 10, source: EVACUATION_LOST_SOURCE },
    ]);
  });

  it("cuts the stipend by a tenth when the offer is left to lapse", () => {
    const game = build();
    const offer = firstEvacuation(game);
    while (live(game).overworld.day < offer.expiresDay) {
      game.session.store?.dispatch(advanceDay());
    }
    const board = live(game).overworld;
    expect(board.missions.some((m) => m.id === offer.id)).toBe(false);
    expect(board.stipendModifiers).toContainEqual({
      factor: 0.9,
      daysLeft: 9,
      source: EVACUATION_LOST_SOURCE,
    });
  });
});
