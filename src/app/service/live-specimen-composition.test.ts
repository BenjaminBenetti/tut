import { describe, expect, it } from "vitest";

import { LURKER } from "../../bugs/data/species";
import { CAPTURE_NET } from "../../tactical/data/equipment";
import { advanceDay } from "../../overworld/model/advance-day-command";
import { CAMPAIGN_FLAG_SET } from "../../overworld/model/campaign-flag-set-event";
import type { Mission } from "../../overworld/model/mission";
import { MISSION_EXPIRED } from "../../overworld/model/mission-expired-event";
import { MISSION_WITHDRAWN } from "../../overworld/model/mission-withdrawn-event";
import { unlockTech } from "../../overworld/model/unlock-tech-command";
import { missionAt } from "../../overworld/service/missions/mission-fixtures.test-helper";
import type { GameState } from "../../save/model/game-state";
import { PHEROMONE_ANALYSIS_COST } from "../../tech/data/tech-tree";
import { MemoryKeyValueStore } from "../../save/repository/memory-key-value-store";
import { extract } from "../../tactical/model/extract-command";
import { finishMission } from "../../tactical/model/finish-mission-command";
import { move } from "../../tactical/model/move-command";
import { startMission } from "../../tactical/model/start-mission-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import { useEquipment } from "../../tactical/model/use-equipment-command";
import {
  buildMoveGraph,
  occupiedKeys,
  pathTo,
  searchMoves,
} from "../../tactical/service/movement-service";
import { decidingObjectives } from "../../tactical/service/objectives/objective-status";
import { withVision } from "../../tactical/service/vision-service";
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

/**
 * A fresh campaign four missions into Act I with First Skyfall won and
 * Pheromone Analysis bought: the spore sample recovered, the capture
 * net researched (so every squad carries one), and the board cleared
 * for the director.
 */
function netResearched(game: GameComposition): void {
  const fresh = game.createCampaign({ seed: 7, createdAt: NOW });
  game.session.start({
    ...fresh,
    tech: { ...fresh.tech, unlocked: ["tech.pheromone-analysis"] },
    overworld: {
      ...fresh.overworld,
      missions: [],
      progress: {
        ...fresh.overworld.progress,
        missionsPlayed: 4,
        flags: ["spore-sample", "capture-net"],
        storyWon: ["first-skyfall"],
      },
    },
  });
}

/** Live Specimen on the board, if pinned. */
function specimen(state: GameState): Mission | undefined {
  return state.overworld.missions.find((m) => m.storyId === "live-specimen");
}

/** Advances the day; throws when it is refused. */
function nextDay(game: GameComposition) {
  const advanced = game.session.store?.dispatch(advanceDay());
  if (!advanced?.ok) throw new Error("the day did not advance");
  return advanced.value.events;
}

/** Starts `offer` with every starter squad; returns the first squad on the map. */
function launch(game: GameComposition, offer: Mission): Unit {
  const started = game.session.store?.dispatch(
    startMission(offer.id, {
      missionId: offer.id,
      squadIds: live(game).roster.squads.map((s) => s.id),
      mechIds: [],
    }),
  );
  if (!started?.ok) throw new Error("the mission did not start");
  const squad = active(game).units.find((u) => u.kind === "squad");
  if (squad === undefined) throw new Error("no squad on the map");
  return squad;
}

/**
 * Leaves `squadId` as the force's only unit on the map, with full AP,
 * the bugs as they are, standing a short walk (two or three movement
 * points) off the drop ship's ramp so the walk home is a real move: the
 * rest of the force is not part of the story being told.
 */
function aloneOffTheRamp(game: GameComposition, squadId: string): Unit {
  const state = live(game);
  const mission = active(game);
  const squad = mission.units.find((u) => u.id === squadId);
  if (squad === undefined) throw new Error(`no unit ${squadId}`);
  const solo: TacticalState = {
    ...mission,
    units: [
      { ...squad, ap: squad.maxAp },
      ...mission.units.filter((u) => u.team === "bugs"),
    ],
  };
  const ramp = new Set(
    mission.extraction.map(
      (t) => `${String(t.x)},${String(t.y)},${String(t.z)}`,
    ),
  );
  const search = searchMoves(solo, { ...squad, ap: squad.maxAp });
  const near = [...search.costs].find(([key, cost]) => {
    const tile = search.tiles.get(key);
    return (
      tile !== undefined &&
      cost >= 2 &&
      cost <= 3 &&
      !ramp.has(`${String(tile.x)},${String(tile.y)},${String(tile.z)}`)
    );
  });
  const tile = near === undefined ? undefined : search.tiles.get(near[0]);
  if (tile === undefined)
    throw new Error("no ground a short walk off the ramp");
  const ready = {
    ...squad,
    ap: squad.maxAp,
    pos: { x: tile.x, y: tile.y, z: tile.z },
  };
  game.session.replace({
    ...state,
    activeMission: withVision({
      state: { ...solo, units: [ready, ...solo.units.slice(1)] },
      events: [],
    }).state,
  });
  return ready;
}

/**
 * Brings one of the placed lurkers to the squad's side, worn down to
 * the net's threshold: the fight that gets it there is not the story
 * this test tells. Its tile is the first free one beside the squad,
 * east, west, south, north, that infantry can stand on.
 */
function lurkerBeside(game: GameComposition, squad: Unit): Unit {
  const state = live(game);
  const mission = active(game);
  const graph = buildMoveGraph(mission.map);
  const taken = new Set(occupiedKeys(mission, graph.index));
  const beside = [
    { x: 1, z: 0 },
    { x: -1, z: 0 },
    { x: 0, z: 1 },
    { x: 0, z: -1 },
  ]
    .map((d) => ({
      x: squad.pos.x + d.x,
      y: squad.pos.y,
      z: squad.pos.z + d.z,
    }))
    .find((tile) => {
      const found = graph.index.getAt(tile);
      return (
        found !== undefined &&
        (found.pass & 1) !== 0 &&
        !taken.has(graph.index.keyOf(tile))
      );
    });
  const lurker = mission.units.find((u) => u.sourceId === "lurker");
  if (beside === undefined || lurker === undefined) {
    throw new Error("no lurker, or no free tile beside the squad");
  }
  const threshold = CAPTURE_NET.net?.captureAtHpFraction;
  if (threshold === undefined) throw new Error("the capture net must net");
  const worn = {
    ...lurker,
    pos: beside,
    hp: Math.floor(LURKER.hp * threshold),
  };
  const staged: TacticalState = {
    ...mission,
    units: mission.units.map((u) => (u.id === lurker.id ? worn : u)),
  };
  // Seen, as a bug beside the squad would be: vision is recomputed on
  // commands, and this staging is not one.
  game.session.replace({
    ...state,
    activeMission: withVision({ state: staged, events: [] }).state,
  });
  return worn;
}

/**
 * Walks `squadId` to the nearest extraction tile it can reach this turn
 * (a real move, carrying whatever it carries), boards, and finishes.
 * Returns the finish's events and how many tiles the walk took.
 */
function walkHomeAndFinish(
  game: GameComposition,
  squadId: string,
  offer: Mission,
) {
  const mission = active(game);
  const graph = buildMoveGraph(mission.map);
  const unit = mission.units.find((u) => u.id === squadId);
  if (unit === undefined) throw new Error(`no unit ${squadId}`);
  const onRamp = mission.extraction.some(
    (t) => t.x === unit.pos.x && t.y === unit.pos.y && t.z === unit.pos.z,
  );
  let walked = 0;
  if (!onRamp) {
    const paths = mission.extraction
      .map((tile) => pathTo(mission, squadId, tile, graph))
      .filter((path): path is NonNullable<typeof path> => path !== undefined)
      .sort((a, b) => a.length - b.length);
    const path = paths[0];
    if (path === undefined) throw new Error("no ramp within a turn's walk");
    const moved = game.session.store?.dispatch(move(squadId, path));
    if (!moved?.ok) throw new Error("the walk home was refused");
    walked = path.length;
  }
  const boarded = game.session.store?.dispatch(extract(squadId));
  if (!boarded?.ok) throw new Error("boarding was refused");
  const finished = game.session.store?.dispatch(finishMission(offer.id));
  if (!finished?.ok) throw new Error("the mission did not finish");
  return { events: finished.value.events, walked };
}

// ===========================================
// Tests
// ===========================================

describe("Live Specimen through the composition root (#1179)", () => {
  it("pins once the net is researched, and starts with its lurkers and the capture deciding", () => {
    const game = build();
    netResearched(game);
    const day = live(game).overworld.day;
    nextDay(game);
    const offer = specimen(live(game));
    expect(offer).toMatchObject({
      typeId: "infestation-clearance",
      difficulty: 3,
      pinned: true,
      act: "act-1",
      createdDay: day + 1,
    });
    if (offer === undefined) throw new Error("Live Specimen must be pinned");

    const squad = launch(game, offer);
    const mission = active(game);
    expect(mission.templates[squad.templateId]?.equipment ?? []).toContain(
      "capture-net",
    );
    expect(
      mission.units.filter((u) => u.sourceId === "lurker").length,
    ).toBeGreaterThanOrEqual(1);
    expect(decidingObjectives(mission.objectives)).toEqual([
      expect.objectContaining({ kind: "capture-specimen", species: "lurker" }),
    ]);
    expect(mission.spawners.length).toBeGreaterThan(0);
  });

  it("is won when a netted lurker is carried home with every nest still standing, and the win ends the campaign", () => {
    const game = build();
    netResearched(game);
    nextDay(game);
    const offer = specimen(live(game));
    if (offer === undefined) throw new Error("Live Specimen must be pinned");
    const squad = aloneOffTheRamp(game, launch(game, offer).id);
    const lurker = lurkerBeside(game, squad);

    // Net it: off the map and into the squad's hands.
    const netted = game.session.store?.dispatch(
      useEquipment(squad.id, "capture-net", lurker.pos),
    );
    if (!netted?.ok)
      throw new Error(`the net was refused: ${JSON.stringify(netted)}`);
    const carrying = active(game).units.find((u) => u.id === squad.id);
    expect(carrying?.carrying).toMatchObject({
      unitId: lurker.id,
      species: "lurker",
    });
    expect(active(game).units.some((u) => u.id === lurker.id)).toBe(false);

    // Home with it, the nests untouched.
    const standing = active(game).spawners.filter((s) => !s.destroyed);
    expect(standing.length).toBeGreaterThan(0);
    const { events, walked } = walkHomeAndFinish(game, squad.id, offer);
    // The squad walked home with its catch; it did not start on the ramp.
    expect(walked).toBeGreaterThan(0);

    const after = live(game);
    expect(after.overworld.lastMissionResult).toMatchObject({
      outcome: "won",
      specimenCaptured: "lurker",
    });
    expect(after.overworld.progress.storyWon).toEqual([
      "first-skyfall",
      "live-specimen",
    ]);
    expect(after.overworld.progress.flags).toContain("campaign-won");
    expect(
      events.filter(
        (e) =>
          e.type === CAMPAIGN_FLAG_SET && e.payload.flag === "campaign-won",
      ),
    ).toHaveLength(1);
    expect(after.overworld.outcome).toBeUndefined();

    // The outcome step makes it victory the next day.
    nextDay(game);
    expect(live(game).overworld.outcome).toMatchObject({
      kind: "victory",
      cause: "story",
    });
  });

  it("is extracted without the specimen when the squad comes home empty-handed, and pinned again five days on", () => {
    const game = build();
    netResearched(game);
    nextDay(game);
    const offer = specimen(live(game));
    if (offer === undefined) throw new Error("Live Specimen must be pinned");
    const squad = aloneOffTheRamp(game, launch(game, offer).id);

    walkHomeAndFinish(game, squad.id, offer);
    const after = live(game);
    const day = after.overworld.day;
    expect(after.overworld.lastMissionResult?.outcome).toBe("extracted");
    expect(after.overworld.lastMissionResult?.specimenCaptured).toBeUndefined();
    expect(after.overworld.progress.storyWon).toEqual(["first-skyfall"]);
    expect(after.overworld.progress.storyRetryDay?.["live-specimen"]).toBe(
      day + 5,
    );

    const pinnedOn: number[] = [];
    for (let i = 0; i < 6; i++) {
      nextDay(game);
      if (specimen(live(game)) !== undefined) {
        pinnedOn.push(live(game).overworld.day);
      }
    }
    expect(pinnedOn[0]).toBe(day + 5);
    expect(live(game).overworld.outcome).toBeUndefined();
  });
});

describe("Live Specimen on a crowded board, through the composition root (arc D2, #1179)", () => {
  it("is pinned the day after the net is bought, taking an ordinary offer's city, which lapses for nothing", () => {
    const game = build();
    const fresh = game.createCampaign({ seed: 7, createdAt: NOW });
    const day = fresh.overworld.day;
    // An ordinary clearance on every city, so no city the hunt could use
    // is free, whatever the day's spread and detection bring.
    const ordinary = fresh.overworld.map.cities.map((city) =>
      missionAt(city.id, day + 10),
    );
    game.session.start({
      ...fresh,
      economy: { ...fresh.economy, techPoints: PHEROMONE_ANALYSIS_COST },
      overworld: {
        ...fresh.overworld,
        missions: ordinary,
        progress: {
          ...fresh.overworld.progress,
          missionsPlayed: 4,
          flags: ["spore-sample"],
          storyWon: ["first-skyfall"],
        },
      },
    });

    const bought = game.session.store?.dispatch(
      unlockTech("tech.pheromone-analysis"),
    );
    expect(bought?.ok).toBe(true);
    expect(live(game).overworld.progress.flags).toContain("capture-net");
    const events = nextDay(game);

    const offer = specimen(live(game));
    expect(offer).toBeDefined();
    const displaced = ordinary.find((m) => m.cityId === offer?.cityId);
    const withdrawn = events.filter((e) => e.type === MISSION_WITHDRAWN);
    expect(withdrawn.map((e) => e.payload)).toEqual([
      {
        missionId: displaced?.id,
        typeId: "infestation-clearance",
        cityId: offer?.cityId,
        replacedBy: offer?.id,
      },
    ]);
    // Gone from the board, and never expired: no ignore penalty.
    const board = live(game).overworld.missions;
    expect(board.map((m) => m.id)).not.toContain(displaced?.id);
    expect(events.map((e) => e.type)).not.toContain(MISSION_EXPIRED);
    // Every other ordinary offer is still there.
    expect(board).toHaveLength(ordinary.length);
    // The worst detected infested city on the day it was pinned.
    const city = live(game).overworld.map.cities.find(
      (c) => c.id === offer?.cityId,
    );
    const worst = Math.max(
      ...live(game)
        .overworld.map.cities.filter((c) => c.detected && c.infestation > 0)
        .map((c) => c.infestation),
    );
    expect(city?.detected).toBe(true);
    expect(city?.infestation).toBe(worst);
  });
});
