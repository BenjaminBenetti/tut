import { describe, expect, it } from "vitest";

import { HIVE_TUNING } from "../../overworld/data/hive-tuning";
import { GREAT_HIVE_TUNING } from "../../overworld/data/great-hive-tuning";
import { GREAT_HIVE_DESTROYED } from "../../overworld/model/great-hive-destroyed-event";
import { GREAT_HIVES_REVEALED } from "../../overworld/model/great-hives-revealed-event";
import { advanceDay } from "../../overworld/model/overworld-command";
import { citiesInRegion } from "../../overworld/service/earth-map-query-service";
import { GREAT_HIVES_DESTROYED_FLAG } from "../../overworld/service/great-hive-service";
import { GREAT_HIVE_SETUP_TUNING } from "../../tactical/data/great-hive-setup-tuning";
import { OBJECTIVE_TUNING } from "../../tactical/data/objective-tuning";
import { endTurn } from "../../tactical/model/end-turn-command";
import { finishMission } from "../../tactical/model/finish-mission-command";
import { startMission } from "../../tactical/model/start-mission-command";
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
import type { GameComposition } from "./game-composition";
import {
  composeGreatHiveGame,
  everyoneOn,
  greatHiveOffers,
  greatHivesOf,
  hiveCoreOf,
  liveMission,
  startAfterUplink,
} from "./great-hive-campaign.test-helper";

// ===========================================
// Fixtures
// ===========================================

/** Turns the fight at the core may take before the run counts as stuck. */
const TURN_CAP = 40;

/**
 * Stands every squad and mech on a free tile within three of the core
 * with a clear sight line to it. The march down the 184-deep cavern is
 * the win-rate sim's business (`great-hive.sim.test.ts`); the guards stay
 * where the setup put them, so the fight at the core is the shipped one.
 */
function standBesideTheCore(game: GameComposition, graph: MoveGraph): void {
  const state = game.session.state;
  const mission = liveMission(game);
  if (state === undefined) throw new Error("no campaign");
  const core = spawnerAttackTarget(hiveCoreOf(mission));
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

/** Stands every living unit on its own tile of the extraction zone. */
function standOnTheRamp(game: GameComposition): void {
  const state = game.session.state;
  const mission = liveMission(game);
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
 * One TDF turn through the store: everyone at the core while it stands,
 * home once it has fallen; then the real `EndTurn`.
 */
function playTurn(game: GameComposition, graph: MoveGraph): void {
  const ids = liveMission(game)
    .units.filter((u) => u.team === "tdf")
    .map((u) => u.id);
  for (const unitId of ids) {
    for (let step = 0; step < 6; step++) {
      const mission = liveMission(game);
      if (mission.outcome !== undefined) return;
      const core = hiveCoreOf(mission);
      const next = core.destroyed
        ? homewardAction(mission, unitId, graph)
        : nextActionAgainst(mission, unitId, core.id, OBJECTIVE_TUNING, graph);
      if (next.kind === "blocked") break;
      if (!game.session.store?.dispatch(next.command).ok) break;
    }
  }
  if (liveMission(game).outcome === undefined) {
    expect(game.session.store?.dispatch(endTurn()).ok).toBe(true);
  }
}

// ===========================================
// The run
// ===========================================

describe("a Great Hive through the shipped composition (#1179)", () => {
  it("reveals three, fights the last one oversized, and its fall opens the launch window", () => {
    const game = composeGreatHiveGame(7);
    startAfterUplink(game, 7, ["platform-approach"]);

    // The first tick reveals the three and pins one assault each.
    const revealed = game.session.store?.dispatch(advanceDay());
    expect(revealed?.ok).toBe(true);
    expect(revealed?.ok && revealed.value.events.map((e) => e.type)).toContain(
      GREAT_HIVES_REVEALED,
    );
    const hives = greatHivesOf(game);
    expect(hives).toHaveLength(3);
    expect(greatHiveOffers(game)).toHaveLength(3);

    // Two have already fallen; the third assault is the one played.
    const [first, second, last] = hives;
    const before = game.session.state;
    if (!first || !second || !last || before === undefined) {
      throw new Error("three Great Hives stand");
    }
    const day = before.overworld.day;
    game.session.replace({
      ...before,
      overworld: {
        ...before.overworld,
        greatHives: [
          { ...first, destroyedDay: day - 1 },
          { ...second, destroyedDay: day },
          last,
        ],
      },
    });
    const offer = greatHiveOffers(game).find((m) => m.hive?.hiveId === last.id);
    if (offer === undefined) throw new Error("the last Great Hive is offered");
    expect(offer).toMatchObject({ pinned: true, difficulty: 8 });
    expect(offer.hive?.great).toBe(true);

    expect(
      game.session.store?.dispatch(
        startMission(offer.id, everyoneOn(game, offer.id)),
      ).ok,
    ).toBe(true);

    // The oversized cavern: bigger board, 200 hp core, six guards.
    const opening = liveMission(game);
    expect(opening.map.width * opening.map.depth).toBeGreaterThan(64 * 144);
    const core = hiveCoreOf(opening);
    expect(core.maxHp).toBe(GREAT_HIVE_SETUP_TUNING.assault.coreHp);
    expect(opening.objectives.map((o) => o.kind)).toEqual([
      "destroy-hive-core",
    ]);
    expect(
      opening.units.filter((u) => u.templateId === "bug:hive-guard"),
    ).toHaveLength(GREAT_HIVE_SETUP_TUNING.assault.baseGuards);
    expect((opening.broods ?? []).length).toBeGreaterThanOrEqual(7);
    // The Act III mix: the armoured variants sleep among the broods.
    expect(
      opening.units.filter((u) => u.templateId.endsWith("-armoured")).length,
    ).toBeGreaterThan(0);

    const graph = buildMoveGraph(opening.map);
    standBesideTheCore(game, graph);
    let turns = 0;
    while (!hiveCoreOf(liveMission(game)).destroyed && turns++ < TURN_CAP) {
      playTurn(game, graph);
    }
    expect(hiveCoreOf(liveMission(game)).destroyed).toBe(true);

    standOnTheRamp(game);
    playTurn(game, graph);
    expect(liveMission(game).outcome).toBe("won");

    // The result: the Great Hive falls, its continent is liberated, the
    // flag is set, and the award is the Great Hive's.
    const atFinish = game.session.state?.overworld;
    if (atFinish === undefined) throw new Error("no campaign");
    const was = new Map(
      last.regionIds.flatMap((regionId) =>
        citiesInRegion(atFinish.map, regionId).map(
          (c) => [c.id, c.infestation] as const,
        ),
      ),
    );
    const finished = game.session.store?.dispatch(finishMission(offer.id));
    expect(finished?.ok).toBe(true);
    const destroyed =
      finished?.ok === true
        ? finished.value.events.filter((e) => e.type === GREAT_HIVE_DESTROYED)
        : [];
    expect(destroyed).toHaveLength(1);
    const after = game.session.state?.overworld;
    expect(after?.lastMissionResult?.outcome).toBe("won");
    expect(after?.lastMissionResult?.techPointsAwarded).toBe(
      offer.rewards.techPoints +
        (after?.lastMissionResult?.techPointsBounty ?? 0),
    );
    expect(offer.rewards.techPoints).toBe(170);
    expect(after?.greatHives?.find((h) => h.id === last.id)?.destroyedDay).toBe(
      atFinish.day,
    );
    expect(after?.progress.flags).toContain(GREAT_HIVES_DESTROYED_FLAG);
    expect(was.size).toBeGreaterThan(0);
    for (const regionId of last.regionIds) {
      expect(after?.growthPausedUntil?.[regionId]).toBe(
        atFinish.day + HIVE_TUNING.liberationGrowthPauseDays + 1,
      );
      for (const city of citiesInRegion(after?.map ?? atFinish.map, regionId)) {
        expect(city.infestation, city.id).toBeLessThanOrEqual(
          Math.max(0, (was.get(city.id) ?? 0) - HIVE_TUNING.liberationCut),
        );
      }
    }

    // Tomorrow: no Great Hive offer is left, and Launch Window pins.
    expect(game.session.store?.dispatch(advanceDay()).ok).toBe(true);
    expect(greatHiveOffers(game)).toEqual([]);
    const launch = game.session.state?.overworld.missions.find(
      (m) => m.storyId === "launch-window",
    );
    expect(launch?.pinned).toBe(true);
    expect(GREAT_HIVE_TUNING.count).toBe(3);
  }, 120_000);
});
