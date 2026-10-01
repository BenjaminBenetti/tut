import { describe, expect, it } from "vitest";

import { bugMixFor } from "../../bugs/service/bestiary-service";
import { tileDistance } from "../../bugs/ai/utility";
import { PassMask } from "../../mapgen/model/pass-mask";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { hatchTiles, snapshotMap } from "../../mapgen/service/hatch-space";
import { ACT_ADVANCED } from "../../overworld/model/act-advanced-event";
import { advanceDay } from "../../overworld/model/advance-day-command";
import { CAMPAIGN_FLAG_SET } from "../../overworld/model/campaign-flag-set-event";
import type { Deployment } from "../../overworld/model/deployment";
import { MAX_DEPLOYED_UNITS } from "../../overworld/model/deployment";
import { launchMission } from "../../overworld/model/launch-mission-command";
import type { Mission } from "../../overworld/model/mission";
import { unlockTech } from "../../overworld/model/unlock-tech-command";
import { missionsInAct } from "../../overworld/service/campaign-progress-service";
import { STORY_MISSION_RULES } from "../../overworld/service/story/story-mission-rules";
import type { Mech } from "../../roster/model/mech";
import type { GameState } from "../../save/model/game-state";
import { MemoryKeyValueStore } from "../../save/repository/memory-key-value-store";
import { endTurn } from "../../tactical/model/end-turn-command";
import { extract } from "../../tactical/model/extract-command";
import { finishMission } from "../../tactical/model/finish-mission-command";
import { move } from "../../tactical/model/move-command";
import { POD_RECOVERED } from "../../tactical/model/pod-recovered-event";
import { startMission } from "../../tactical/model/start-mission-command";
import type { TacticalEvent } from "../../tactical/model/tactical-event";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import {
  buildMoveGraph,
  pathTo,
} from "../../tactical/service/movement-service";
import { decidingObjectives } from "../../tactical/service/objectives/objective-status";
import { withVision } from "../../tactical/service/vision-service";
import { isTechNodeHidden } from "../../tech/service/tech-status-service";
import type { GameComposition } from "./game-composition";
import { composeGame } from "./game-composition";

// ===========================================
// Fixtures
// ===========================================

const NOW = "2026-09-26T00:00:00.000Z";

const POD_TELEMETRY = "tech.pod-telemetry";
const PLATFORM_APPROACH = "tech.platform-approach";

/**
 * The shipped game over memory storage: played tactically, or with
 * every launch auto-resolved.
 */
function build(autoResolve = false): GameComposition {
  return composeGame({
    storage: new MemoryKeyValueStore(),
    clock: { now: () => NOW },
    newSeed: () => 7,
    onAutosaveFailure: (error) => {
      throw new Error(`autosave failed: ${error.kind}`);
    },
    ...(autoResolve ? { debug: { autoResolve: true } } : {}),
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

/** The pinned offer of story mission `storyId` on the board, if any. */
function storyOffer(state: GameState, storyId: string): Mission | undefined {
  return state.overworld.missions.find((m) => m.storyId === storyId);
}

/** Turns the day; throws if the tick refuses. */
function nextDay(game: GameComposition) {
  const advanced = game.session.store?.dispatch(advanceDay());
  if (!advanced?.ok) throw new Error("the day did not advance");
  return advanced.value.events;
}

/** Credits the campaign exactly the tech points `nodeId` costs. */
function fund(game: GameComposition, nodeId: string): void {
  const node = game.content.tech.getNode(nodeId);
  if (node === undefined) throw new Error(`the tree ships ${nodeId}`);
  const state = live(game);
  game.session.replace({
    ...state,
    economy: { ...state.economy, techPoints: node.cost },
  });
}

/** Whether `nodeId` is hidden in the campaign as it stands. */
function hidden(game: GameComposition, nodeId: string): boolean {
  const node = game.content.tech.getNode(nodeId);
  if (node === undefined) throw new Error(`the tree ships ${nodeId}`);
  return isTechNodeHidden(node, game.techConditionsOf(live(game)));
}

// -------------------------------------------
// Auto-resolved campaign
// -------------------------------------------

/**
 * Replaces the roster's mechs with `MAX_DEPLOYED_UNITS` fresh copies of
 * the starter mech `mech`, so the auto-resolver wins what it is sent
 * into at a chance past 0.999, which `launchAll` asserts before it
 * rolls. Called again before a later launch, it undoes the wear the
 * earlier ones did: the force is not the story being told.
 */
function overwhelm(game: GameComposition, mech: Mech): void {
  const state = live(game);
  game.session.replace({
    ...state,
    roster: {
      ...state.roster,
      mechs: Array.from({ length: MAX_DEPLOYED_UNITS }, (_, n) => ({
        ...mech,
        id: `${mech.id}-x${String(n)}`,
      })),
    },
  });
}

/** Every mech on the roster, deployed on `offer`. */
function everything(state: GameState, offer: Mission): Deployment {
  return {
    missionId: offer.id,
    squadIds: [],
    mechIds: state.roster.mechs.map((m) => m.id),
  };
}

/** Auto-resolves `offer` with `everything`, once its win is all but certain. */
function launchAll(game: GameComposition, offer: Mission) {
  const state = live(game);
  const city = state.overworld.map.cities.find((c) => c.id === offer.cityId);
  if (city === undefined) throw new Error(`no city ${offer.cityId}`);
  const chance = game.assessor.assess(offer, everything(state, offer), {
    squads: state.roster.squads,
    mechs: state.roster.mechs,
    city,
  }).winProbability;
  expect(chance).toBeGreaterThan(0.999);
  const launched = game.session.store?.dispatch(
    launchMission(offer.id, everything(state, offer)),
  );
  if (!launched?.ok) {
    throw new Error(`${offer.id} did not launch: ${JSON.stringify(launched)}`);
  }
  return launched.value.events;
}

/** Turns days until `found` answers, at most `days`; its answer or undefined. */
function daysUntil<T>(
  game: GameComposition,
  days: number,
  found: (state: GameState) => T | undefined,
): T | undefined {
  for (let day = 0; day < days; day++) {
    nextDay(game);
    const answer = found(live(game));
    if (answer !== undefined) return answer;
  }
  return undefined;
}

// -------------------------------------------
// Tactical campaign
// -------------------------------------------

/**
 * A fresh campaign in Act II, Live Specimen won and the first Hive
 * Assault too (the hive core sample), with Pod Telemetry's cost in the
 * bank and an empty board. Buys Pod Telemetry and turns the day, so
 * Intact Pod is pinned; returns its offer.
 */
function podPinned(game: GameComposition): Mission {
  const fresh = game.createCampaign({ seed: 7, createdAt: NOW });
  game.session.start({
    ...fresh,
    overworld: {
      ...fresh.overworld,
      missions: [],
      progress: {
        ...fresh.overworld.progress,
        act: "act-2",
        missionsPlayed: 12,
        flags: ["spore-sample", "capture-net", "hive-core-sample"],
        storyWon: ["first-skyfall", "live-specimen"],
      },
    },
  });
  fund(game, POD_TELEMETRY);
  const bought = game.session.store?.dispatch(unlockTech(POD_TELEMETRY));
  if (!bought?.ok) throw new Error("Pod Telemetry was refused");
  nextDay(game);
  const offer = storyOffer(live(game), "intact-pod");
  if (offer === undefined) throw new Error("Intact Pod must be pinned");
  return offer;
}

/** Starts `offer` with every squad and mech on the roster. */
function launch(game: GameComposition, offer: Mission): void {
  const state = live(game);
  const started = game.session.store?.dispatch(
    startMission(offer.id, {
      missionId: offer.id,
      squadIds: state.roster.squads.map((s) => s.id),
      mechIds: state.roster.mechs.map((m) => m.id),
    }),
  );
  if (!started?.ok) throw new Error("the mission did not start");
}

/** The pod on the map, if it is still there. */
function podOf(mission: TacticalState): Unit | undefined {
  return mission.units.find((u) => u.kind === "generator");
}

/** Replaces the active mission by `edit` of it, with vision recomputed. */
function stage(
  game: GameComposition,
  edit: (mission: TacticalState) => TacticalState,
): void {
  const state = live(game);
  game.session.replace({
    ...state,
    activeMission: withVision({ state: edit(active(game)), events: [] }).state,
  });
}

/**
 * A quiet crater: no bug on the map and no edge wave to come, so what
 * is being told is the drop, not the fight for the pod.
 */
function quiet(mission: TacticalState): TacticalState {
  return {
    ...mission,
    units: mission.units.filter((u) => u.team !== "bugs"),
    edgeSpawn: { ...mission.edgeSpawn, totalWaves: mission.edgeSpawn.wave },
  };
}

/** Ends the player phase (the bugs' runs inside it); returns what it said. */
function endPlayerTurn(game: GameComposition): readonly TacticalEvent[] {
  const ended = game.session.store?.dispatch(endTurn());
  if (!ended?.ok) throw new Error("EndTurn was refused");
  return ended.value.events as readonly TacticalEvent[];
}

/**
 * Boards every force unit still on the map from where it stands (the
 * force never left the ramp), and finishes. Returns the finish's events.
 */
function boardAndFinish(game: GameComposition, offer: Mission) {
  for (const unit of active(game).units) {
    if (unit.team !== "tdf" || unit.kind === "generator") continue;
    const onRamp = active(game).extraction.some(
      (t) => t.x === unit.pos.x && t.y === unit.pos.y && t.z === unit.pos.z,
    );
    if (!onRamp) {
      const graph = buildMoveGraph(active(game).map);
      const path = active(game)
        .extraction.map((tile) => pathTo(active(game), unit.id, tile, graph))
        .filter((p): p is NonNullable<typeof p> => p !== undefined)
        .sort((a, b) => a.length - b.length)[0];
      if (path === undefined) throw new Error(`${unit.id} cannot get home`);
      const moved = game.session.store?.dispatch(move(unit.id, path));
      if (!moved?.ok) throw new Error(`${unit.id}'s walk home was refused`);
    }
    const boarded = game.session.store?.dispatch(extract(unit.id));
    if (!boarded?.ok) throw new Error(`${unit.id} could not board`);
  }
  const finished = game.session.store?.dispatch(finishMission(offer.id));
  if (!finished?.ok) throw new Error("the mission did not finish");
  return finished.value.events;
}

const keyOf = (t: TileCoord): string =>
  `${String(t.x)},${String(t.y)},${String(t.z)}`;

// ===========================================
// The campaign, end to end (auto-resolved)
// ===========================================

describe("the story from Live Specimen to Act III, through the composition root (#1179)", () => {
  it("enters Act II on Live Specimen's win, shows Pod Telemetry after the first Hive Assault, enters Act III on Intact Pod's win, and stops short of the finale", () => {
    const game = build(true);
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
    const starter = live(game).roster.mechs[0];
    if (starter === undefined) throw new Error("the roster fields a mech");
    overwhelm(game, starter);

    // Act I's ending: won, and the real spine opens Act II.
    nextDay(game);
    const specimen = storyOffer(live(game), "live-specimen");
    if (specimen === undefined) throw new Error("Live Specimen must pin");
    const specimenEvents = launchAll(game, specimen);
    expect(live(game).overworld.progress.act).toBe("act-2");
    expect(live(game).overworld.hives).toHaveLength(1);
    expect(
      specimenEvents.filter(
        (e) =>
          e.type === ACT_ADVANCED &&
          e.payload.from === "act-1" &&
          e.payload.to === "act-2",
      ),
    ).toHaveLength(1);
    expect(live(game).overworld.progress.flags).not.toContain("campaign-won");
    const actTwoDay = live(game).overworld.day;

    // The Act II director takes over: its bestiary mixes the new offers,
    // and the scripted hive is assaulted, which Pod Telemetry waits on.
    expect(hidden(game, POD_TELEMETRY)).toBe(true);
    const assault = daysUntil(game, 30, (state) =>
      state.overworld.missions.find((m) => m.typeId === "hive-assault"),
    );
    if (assault === undefined) throw new Error("the hive must be assaultable");
    // Every ordinary offer made since is mixed from Act II's shares
    // (no mission played in the act yet), not Act I's.
    const ordinary = live(game).overworld.missions.filter(
      (m) =>
        m.storyId === undefined &&
        m.typeId !== "hive-assault" &&
        m.createdDay > actTwoDay,
    );
    expect(ordinary.length).toBeGreaterThan(0);
    expect(missionsInAct(live(game).overworld.progress)).toBe(0);
    for (const offer of ordinary) {
      expect(offer.bugMix).toEqual(bugMixFor("act-2", 0));
    }
    expect(bugMixFor("act-2", 0)).not.toEqual(bugMixFor("act-1", 5));
    expect(storyOffer(live(game), "intact-pod")).toBeUndefined();
    overwhelm(game, starter);
    launchAll(game, assault);
    expect(live(game).overworld.progress.flags).toContain("hive-core-sample");
    expect(hidden(game, POD_TELEMETRY)).toBe(false);

    // Intel II bought: Intact Pod is pinned the next day, Act II's d6.
    fund(game, POD_TELEMETRY);
    expect(game.session.store?.dispatch(unlockTech(POD_TELEMETRY))?.ok).toBe(
      true,
    );
    expect(live(game).overworld.progress.flags).toContain("pod-telemetry");
    nextDay(game);
    const pod = storyOffer(live(game), "intact-pod");
    expect(pod).toMatchObject({
      typeId: "crash-site",
      difficulty: 6,
      pinned: true,
      act: "act-2",
    });
    if (pod === undefined) throw new Error("Intact Pod must pin");

    // Act II's ending: won, and the real spine opens Act III, since its
    // ending (Launch Window) is built. No victory.
    overwhelm(game, starter);
    const podEvents = launchAll(game, pod);
    const after = live(game);
    expect(after.overworld.lastMissionResult?.outcome).toBe("won");
    expect(after.overworld.progress.storyWon).toContain("intact-pod");
    expect(after.overworld.progress.act).toBe("act-3");
    expect(
      podEvents.filter(
        (e) =>
          e.type === ACT_ADVANCED &&
          e.payload.from === "act-2" &&
          e.payload.to === "act-3",
      ),
    ).toHaveLength(1);
    expect(
      podEvents.filter(
        (e) =>
          e.type === CAMPAIGN_FLAG_SET && e.payload.flag === "campaign-won",
      ),
    ).toEqual([]);
    expect(after.overworld.outcome).toBeUndefined();

    // Act III: Uplink pins the next day and can be won, and Platform
    // Approach bought, but Launch Window waits on great-hives-destroyed,
    // which no Great Hive destroyed here sets: the story stops here, and
    // nothing reaches the finale, though the Spore Platform is built.
    const uplink = daysUntil(game, 1, (state) => storyOffer(state, "uplink"));
    if (uplink === undefined) throw new Error("Uplink must pin in Act III");
    overwhelm(game, starter);
    launchAll(game, uplink);
    expect(live(game).overworld.progress.flags).toContain("uplink-won");
    fund(game, PLATFORM_APPROACH);
    expect(
      game.session.store?.dispatch(unlockTech(PLATFORM_APPROACH))?.ok,
    ).toBe(true);
    expect(STORY_MISSION_RULES["spore-platform"]).toBeDefined();
    for (let day = 0; day < 10; day++) {
      nextDay(game);
      expect(storyOffer(live(game), "launch-window")).toBeUndefined();
      expect(storyOffer(live(game), "spore-platform")).toBeUndefined();
      expect(live(game).overworld.progress.act).toBe("act-3");
      expect(live(game).overworld.progress.flags).not.toContain(
        "great-hives-destroyed",
      );
    }
    expect(live(game).overworld.outcome).toBeUndefined();
  });
});

// ===========================================
// Intact Pod on the tactical map
// ===========================================

describe("Intact Pod through the composition root (#1179)", () => {
  it("stands the pod up as a unit of ours with recover-pod deciding, and two surging waves more than a crash site", () => {
    const game = build();
    const offer = podPinned(game);
    launch(game, offer);
    const mission = active(game);
    const pod = podOf(mission);
    expect(pod).toMatchObject({
      team: "tdf",
      kind: "generator",
      sourceId: "spore-pod",
      hp: 65,
      maxHp: 65,
    });
    expect(mission.templates[pod?.templateId ?? ""]?.modelId).toBe(
      "bug.spore-pod",
    );
    expect(decidingObjectives(mission.objectives)).toEqual([
      {
        id: mission.objectives[0]?.id,
        kind: "recover-pod",
        targetId: pod?.id,
        complete: false,
        failed: false,
        deadlineTurn: 10,
        huntedAt: pod?.pos,
      },
    ]);
    expect(mission.objectives.map((o) => o.kind)).not.toContain("destroy-pod");
    expect(mission.spawners.filter((s) => s.variant === "spore-pod")).toEqual(
      [],
    );
    expect(mission.edgeSpawn.totalWaves).toBe(4);
    expect(mission.edgeSpawn.surge).toEqual({ sizeScale: 1.5, spillRadius: 2 });
  });

  it("sends a bug that sees nothing at the pod, not at the landing zone", () => {
    const game = build();
    launch(game, podPinned(game));
    // The first wave lands on turn 3.
    while (!active(game).units.some((u) => u.team === "bugs")) {
      endPlayerTurn(game);
    }
    const mission = active(game);
    const pod = podOf(mission);
    const bug = mission.units.find(
      (u) => u.team === "bugs" && u.sourceId === "swarmer",
    );
    if (pod === undefined || bug === undefined) {
      throw new Error("the pod and a swarmer must be on the map");
    }
    const sight = mission.templates[bug.templateId]?.sightRange ?? 0;
    const landing = mission.map.hooks.deployZones.flatMap((z) => z.tiles);
    const force = mission.units.filter(
      (u) => u.team === "tdf" && u.kind !== "generator",
    );
    const nearest = (from: TileCoord, to: readonly TileCoord[]): number =>
      Math.min(...to.map((t) => tileDistance(from, t)));
    // A tile out of sight of the pod and the force, nearer the landing
    // zone than the pod by a wide margin: a bug hunting the landing
    // walks away from the pod, one hunting the pod walks toward it.
    const taken = new Set(mission.units.map((u) => keyOf(u.pos)));
    const ground = hatchTiles(
      snapshotMap(mission.map),
      pod.pos,
      Number.POSITIVE_INFINITY,
      PassMask.INFANTRY,
    );
    const start = ground
      .filter((tile) => !taken.has(keyOf(tile)))
      .map((tile) => ({ x: tile.x, y: tile.y, z: tile.z }))
      .find(
        (tile) =>
          tileDistance(tile, pod.pos) > sight + 4 &&
          nearest(
            tile,
            force.map((u) => u.pos),
          ) >
            sight + 4 &&
          nearest(tile, landing) + 12 < tileDistance(tile, pod.pos),
      );
    if (start === undefined) throw new Error("no tile to stage the bug on");
    stage(game, (m) => ({
      ...m,
      units: [
        ...m.units.filter((u) => u.team !== "bugs"),
        { ...bug, pos: start, ap: bug.maxAp },
      ],
      edgeSpawn: { ...m.edgeSpawn, totalWaves: m.edgeSpawn.wave },
    }));

    endPlayerTurn(game);
    const moved = active(game).units.find((u) => u.id === bug.id);
    if (moved === undefined) throw new Error("the bug must still stand");
    expect(tileDistance(moved.pos, pod.pos)).toBeLessThan(
      tileDistance(start, pod.pos),
    );
    expect(nearest(moved.pos, landing)).toBeGreaterThan(
      nearest(start, landing),
    );
  });

  it("is won when the drop lifts the pod as turn 11 opens and the force goes home, and the win enters Act III", () => {
    const game = build();
    const offer = podPinned(game);
    launch(game, offer);
    stage(game, quiet);
    const pod = podOf(active(game));
    if (pod === undefined) throw new Error("the pod must stand");

    // Through turn 10 the pod waits for the drop.
    const recovered: TacticalEvent[] = [];
    while (active(game).turn < 10) {
      recovered.push(
        ...endPlayerTurn(game).filter((e) => e.type === POD_RECOVERED),
      );
    }
    expect(recovered).toEqual([]);
    expect(podOf(active(game))?.id).toBe(pod.id);

    // Turn 10 ends: the drop lifts it as turn 11 opens.
    const lifted = endPlayerTurn(game);
    expect(active(game).turn).toBe(11);
    expect(lifted.filter((e) => e.type === POD_RECOVERED)).toEqual([
      {
        type: POD_RECOVERED,
        payload: {
          unitId: pod.id,
          objectiveId: active(game).objectives[0]?.id,
          pos: pod.pos,
          hp: 65,
        },
      },
    ]);
    expect(podOf(active(game))).toBeUndefined();
    expect(active(game).objectives).toEqual([
      expect.objectContaining({
        kind: "recover-pod",
        complete: true,
        recoveredHp: 65,
      }),
    ]);
    expect(active(game).outcome).toBeUndefined();

    // Home: the mission is won, and so is Act II.
    const landingCity = offer.crashSite?.landingCityId;
    const events = boardAndFinish(game, offer);
    const after = live(game);
    expect(after.overworld.lastMissionResult).toMatchObject({
      outcome: "won",
      podRecovered: true,
      podHpLeft: 65,
    });
    expect(after.overworld.progress.storyWon).toEqual([
      "first-skyfall",
      "live-specimen",
      "intact-pod",
    ]);
    expect(after.overworld.progress.act).toBe("act-3");
    expect(
      events.filter(
        (e) =>
          e.type === ACT_ADVANCED &&
          e.payload.from === "act-2" &&
          e.payload.to === "act-3",
      ),
    ).toHaveLength(1);
    expect(after.overworld.outcome).toBeUndefined();
    // The pod gone, the landing is erased: the city is back where it was.
    const city = after.overworld.map.cities.find((c) => c.id === landingCity);
    expect(city?.infestation).toBe(offer.crashSite?.preLandingInfestation);

    // The next day Act III's first story mission is pinned.
    nextDay(game);
    expect(storyOffer(live(game), "uplink")?.act).toBe("act-3");
    expect(storyOffer(live(game), "intact-pod")).toBeUndefined();
  });

  it("is lost when the pod falls before the drop: the force goes home, the landing takes root, and telemetry pins it again five days on", () => {
    const game = build();
    const offer = podPinned(game);
    launch(game, offer);
    stage(game, (m) => ({
      ...quiet(m),
      units: quiet(m).units.map((u) =>
        u.kind === "generator" ? { ...u, hp: 0 } : u,
      ),
    }));

    // The phase step records the loss when the next phase opens.
    endPlayerTurn(game);
    expect(active(game).objectives).toEqual([
      expect.objectContaining({
        kind: "recover-pod",
        complete: false,
        failed: true,
      }),
    ]);

    boardAndFinish(game, offer);
    const after = live(game);
    const day = after.overworld.day;
    expect(after.overworld.lastMissionResult).toMatchObject({
      podRecovered: false,
      podHpLeft: 0,
    });
    expect(after.overworld.lastMissionResult?.outcome).not.toBe("won");
    expect(after.overworld.progress.act).toBe("act-2");
    expect(after.overworld.progress.storyWon).not.toContain("intact-pod");
    expect(after.overworld.progress.storyRetryDay?.["intact-pod"]).toBe(
      day + 5,
    );
    const city = after.overworld.map.cities.find(
      (c) => c.id === offer.crashSite?.landingCityId,
    );
    expect(city?.infestation).toBeGreaterThan(
      offer.crashSite?.preLandingInfestation ?? 0,
    );

    const pinnedOn: number[] = [];
    for (let i = 0; i < 6; i++) {
      nextDay(game);
      if (storyOffer(live(game), "intact-pod") !== undefined) {
        pinnedOn.push(live(game).overworld.day);
      }
    }
    expect(pinnedOn[0]).toBe(day + 5);
  });
});
