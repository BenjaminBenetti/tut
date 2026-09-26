import { describe, expect, it } from "vitest";

import { manhattanDistance } from "../../core/service/grid-math";
import { advanceDay } from "../../overworld/model/advance-day-command";
import { CAMPAIGN_FLAG_SET } from "../../overworld/model/campaign-flag-set-event";
import { CITY_INFESTATION_CHANGED } from "../../overworld/model/city-infestation-changed-event";
import type { Mission } from "../../overworld/model/mission";
import { MISSION_OFFERED } from "../../overworld/model/mission-offered-event";
import type { GameState } from "../../save/model/game-state";
import { MemoryKeyValueStore } from "../../save/repository/memory-key-value-store";
import { OBJECTIVE_TUNING } from "../../tactical/data/objective-tuning";
import { SPAWN_TUNING } from "../../tactical/data/spawn-tuning";
import { extract } from "../../tactical/model/extract-command";
import { finishMission } from "../../tactical/model/finish-mission-command";
import { interact } from "../../tactical/model/interact-command";
import { startMission } from "../../tactical/model/start-mission-command";
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

/**
 * A fresh campaign that has played its first mission: the second is
 * the one First Skyfall waits for (arc §3, §6.9).
 */
function afterMissionOne(game: GameComposition): void {
  const fresh = game.createCampaign({ seed: 7, createdAt: NOW });
  game.session.start({
    ...fresh,
    overworld: {
      ...fresh.overworld,
      missions: [],
      progress: { ...fresh.overworld.progress, missionsPlayed: 1 },
    },
  });
}

/** First Skyfall on the board, if pinned. */
function skyfall(state: GameState): Mission | undefined {
  return state.overworld.missions.find((m) => m.storyId === "first-skyfall");
}

/** The landing city's infestation now. */
function infestationAt(state: GameState, cityId: string): number {
  const city = state.overworld.map.cities.find((c) => c.id === cityId);
  if (city === undefined) throw new Error(`no city ${cityId}`);
  return city.infestation;
}

/**
 * Starts `offer` with the whole starter squad list, then stands one squad
 * beside the pod: the scripted map brings it within 14 of the drop zone,
 * which is two turns' walk, not a rule. Everything after is the shipped
 * path.
 */
function startBesidePod(game: GameComposition, offer: Mission): string {
  const squads = live(game).roster.squads.map((s) => s.id);
  const started = game.session.store?.dispatch(
    startMission(offer.id, {
      missionId: offer.id,
      squadIds: squads,
      mechIds: [],
    }),
  );
  expect(started?.ok).toBe(true);
  const state = live(game);
  const active = state.activeMission;
  const pod = active?.spawners.find((s) => s.variant === "spore-pod");
  const unit = active?.units.find((u) => u.team === "tdf");
  if (!active || !pod || !unit) throw new Error("no pod or no squad");
  game.session.replace({
    ...state,
    activeMission: {
      ...active,
      units: [{ ...unit, pos: { ...pod.pos, x: pod.pos.x + 1 }, ap: 2 }],
    },
  });
  return unit.id;
}

/** Plants charges on the pod until it falls, refreshing AP between goes. */
function wreckPod(game: GameComposition, unitId: string): void {
  const objectiveId = live(game).activeMission?.objectives.find(
    (o) => o.kind === "destroy-pod",
  )?.id;
  if (objectiveId === undefined) throw new Error("no destroy-pod objective");
  for (let guard = 0; guard < 20; guard++) {
    const state = live(game);
    const active = state.activeMission;
    if (!active || active.objectives.every((o) => o.complete)) return;
    if ((active.units[0]?.ap ?? 0) < OBJECTIVE_TUNING.interactApCost) {
      game.session.replace({
        ...state,
        activeMission: {
          ...active,
          units: active.units.map((u) => ({ ...u, ap: u.maxAp })),
        },
      });
    }
    expect(
      game.session.store?.dispatch(interact(unitId, objectiveId))?.ok,
    ).toBe(true);
  }
  throw new Error("the pod did not fall");
}

/** Walks the force onto the ramp and boards it, then finishes the mission. */
function boardAndFinish(game: GameComposition, unitId: string, offer: Mission) {
  const state = live(game);
  const active = state.activeMission;
  const ramp = active?.extraction[0];
  if (!active || !ramp) throw new Error("no extraction zone");
  game.session.replace({
    ...state,
    activeMission: {
      ...active,
      units: active.units.map((u) => ({ ...u, pos: ramp, ap: u.maxAp })),
    },
  });
  expect(game.session.store?.dispatch(extract(unitId))?.ok).toBe(true);
  const finished = game.session.store?.dispatch(finishMission(offer.id));
  if (!finished?.ok) throw new Error("the mission did not finish");
  return finished.value.events;
}

// ===========================================
// Tests
// ===========================================

describe("First Skyfall through the composition root (#1179)", () => {
  it("pins after mission one, lands, plays on the crater, and a win erases the landing and recovers the sample", () => {
    const game = build();
    afterMissionOne(game);
    const day = live(game).overworld.day;

    // The day turns: the director pins First Skyfall and the pod lands.
    const advanced = game.session.store?.dispatch(advanceDay());
    if (!advanced?.ok) throw new Error("the day did not advance");
    const board = live(game);
    const offer = skyfall(board);
    if (offer?.crashSite === undefined) {
      throw new Error("First Skyfall must be pinned with its landing");
    }
    expect(offer).toMatchObject({
      typeId: "crash-site",
      difficulty: 1,
      pinned: true,
      createdDay: day + 1,
    });
    const { landingCityId, preLandingInfestation } = offer.crashSite;
    expect(offer.cityId).toBe(landingCityId);
    expect(infestationAt(board, landingCityId)).toBe(
      preLandingInfestation + 10,
    );
    const offered = advanced.value.events.findIndex(
      (e) => e.type === MISSION_OFFERED && e.payload.mission.id === offer.id,
    );
    expect(advanced.value.events[offered + 1]).toEqual({
      type: CITY_INFESTATION_CHANGED,
      payload: {
        cityId: landingCityId,
        from: preLandingInfestation,
        to: preLandingInfestation + 10,
      },
    });

    // Started: the crater, the pod close to deploy on its clock, and
    // two edge waves.
    const unitId = startBesidePod(game, offer);
    const active = live(game).activeMission;
    if (!active) throw new Error("no active mission");
    expect(active.map.recipe.params.archetype).toBe("crash-site");
    expect(active.objectives).toEqual([
      expect.objectContaining({
        kind: "destroy-pod",
        deadlineTurn: SPAWN_TUNING.podMaturityTurn,
        complete: false,
      }),
    ]);
    expect(SPAWN_TUNING.podMaturityTurn).toBe(8);
    expect(active.edgeSpawn.totalWaves).toBe(2);
    const pod = active.map.hooks.objectives.find((h) => h.kind === "spore-pod");
    const deploy = active.map.hooks.deployZones.flatMap((z) => z.tiles);
    const podTile = pod?.tiles[0];
    if (podTile === undefined) throw new Error("no pod hook");
    expect(
      Math.min(...deploy.map((t) => manhattanDistance(t, podTile))),
    ).toBeLessThanOrEqual(14);

    // Wreck the pod, board, finish.
    wreckPod(game, unitId);
    const events = boardAndFinish(game, unitId, offer);
    const after = live(game);
    expect(after.overworld.lastMissionResult?.outcome).toBe("won");
    expect(infestationAt(after, landingCityId)).toBe(preLandingInfestation);
    expect(after.overworld.progress.flags).toContain("spore-sample");
    expect(after.overworld.progress.storyWon).toContain("first-skyfall");
    expect(
      events.filter(
        (e) =>
          e.type === CAMPAIGN_FLAG_SET && e.payload.flag === "spore-sample",
      ),
    ).toHaveLength(1);

    // Never pinned again.
    for (let i = 0; i < 7; i++) {
      game.session.store?.dispatch(advanceDay());
      expect(skyfall(live(game))).toBeUndefined();
    }
  });

  it("roots the landing when the force leaves the pod standing, and pins it again five days on", () => {
    const game = build();
    afterMissionOne(game);
    game.session.store?.dispatch(advanceDay());
    const offer = skyfall(live(game));
    if (offer?.crashSite === undefined) throw new Error("not pinned");
    const landed = infestationAt(live(game), offer.crashSite.landingCityId);
    const unitId = startBesidePod(game, offer);

    // Straight home, the pod untouched.
    boardAndFinish(game, unitId, offer);
    const after = live(game);
    const day = after.overworld.day;
    expect(after.overworld.lastMissionResult?.outcome).toBe("extracted");
    expect(infestationAt(after, offer.crashSite.landingCityId)).toBe(
      Math.min(100, landed + 15),
    );
    expect(after.overworld.progress.flags).not.toContain("spore-sample");
    expect(after.overworld.progress.storyRetryDay?.["first-skyfall"]).toBe(
      day + 5,
    );

    // Off the board until the retry day, then pinned again.
    const pinnedOn: number[] = [];
    for (let i = 0; i < 6; i++) {
      game.session.store?.dispatch(advanceDay());
      if (skyfall(live(game)) !== undefined) {
        pinnedOn.push(live(game).overworld.day);
      }
    }
    expect(pinnedOn[0]).toBe(day + 5);
  });
});
