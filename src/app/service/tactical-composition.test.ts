import { describe, expect, it } from "vitest";

import {
  startedMission,
  walkableTileNear,
  withBug,
} from "../../bugs/ai/bug-mission.test-helper";
import { BUG_SPECIES, SWARMER } from "../../bugs/data/species";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { ok } from "../../core/model/result";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { MISSION_TYPES } from "../../content/data/mission-types";
import { createOverworldCommandDispatcher } from "../../overworld/service/command-dispatcher";
import { MECH_RATING_TUNING } from "../../roster/data/mech-rating-tuning";
import { STARTER_PARTS } from "../../roster/data/parts";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { UPGRADE_TUNING } from "../../roster/data/upgrade-tuning";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import { StaticPartCatalogue } from "../../roster/repository/static-part-catalogue";
import type { GameState } from "../../save/model/game-state";
import { ATTACK } from "../../tactical/model/attack-command";
import { BUGS_SPAWNED } from "../../tactical/model/bugs-spawned-event";
import { MOVE } from "../../tactical/model/move-command";
import { OVERWATCH } from "../../tactical/model/overwatch-command";
import { RELOAD } from "../../tactical/model/reload-command";
import { EXTRACT, extract } from "../../tactical/model/extract-command";
import { INTERACT } from "../../tactical/model/interact-command";
import { END_TURN, endTurn } from "../../tactical/model/end-turn-command";
import type { TacticalHandler } from "../../tactical/model/tactical-handler";
import { TURN_STARTED } from "../../tactical/model/turn-started-event";
import { startTacticalMission } from "../../tactical/service/mission-start-service";
import { NO_ACTIVE_MISSION } from "../../tactical/service/tactical-command-handlers";
import { TacticalMissionResolver } from "../../tactical/service/tactical-mission-resolver";
import {
  campaignOnDay,
  missionAt,
} from "../../ui/view/mission-fixtures.test-helper";
import { GameStore } from "./game-store";
import type { TacticalContent } from "./tactical-composition";
import {
  composeTactical,
  createSheetLookup,
  shippedBugBehaviours,
  shippedTacticalHandlers,
} from "./tactical-composition";
import { MapBehaviourRegistry } from "../../bugs/ai/behaviour-registry";

// ===========================================
// Fixtures
// ===========================================

const CONTENT: TacticalContent = {
  squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
  parts: new StaticPartCatalogue(STARTER_PARTS),
  rating: MECH_RATING_TUNING,
  upgrades: UPGRADE_TUNING,
  missionTypes: MISSION_TYPES,
};

/** A stub EndTurn rule: bumps the turn and reports it. */
const bumpTurn: TacticalHandler = (mission) =>
  ok({
    state: { ...mission, turn: mission.turn + 1 },
    events: [
      {
        type: TURN_STARTED,
        payload: { turn: mission.turn + 1, phase: "player" },
      },
    ],
  });

/** A campaign on day 4 with one offered mission at Lagos. */
function campaignWithMission(): { state: GameState; missionId: string } {
  const missionId = "mission-2";
  return {
    state: campaignOnDay(4, [missionAt(missionId, "lagos", 9, 5)]),
    missionId,
  };
}

// ===========================================
// Tests
// ===========================================

describe("composeTactical", () => {
  it("registers the given handlers lifted over activeMission and the store notifies with their events", () => {
    const dispatcher = createOverworldCommandDispatcher<GameState>();
    const tactical = composeTactical(dispatcher, CONTENT, {
      [END_TURN]: bumpTurn,
    });
    const { state, missionId } = campaignWithMission();
    const ids = new SequentialIdGenerator();
    const started = startTacticalMission(
      state,
      missionId,
      {
        missionId,
        squadIds: state.roster.squads.map((s) => s.id),
        mechIds: state.roster.mechs.map((m) => m.id),
      },
      tactical.missionStartDepsFor(ids),
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const store = new GameStore(started.value, dispatcher);
    const seen: string[] = [];
    store.subscribe((change) => {
      seen.push(...change.events.map((e) => e.type));
    });
    const outcome = store.dispatch(endTurn());
    expect(outcome.ok).toBe(true);
    expect(store.getState().activeMission?.turn).toBe(2);
    expect(store.getState().activeMission?.log.map((e) => e.type)).toEqual([
      TURN_STARTED,
    ]);
    expect(seen).toEqual([TURN_STARTED]);
  });

  it("rejects a tactical command with no mission in progress", () => {
    const dispatcher = createOverworldCommandDispatcher<GameState>();
    composeTactical(dispatcher, CONTENT, { [END_TURN]: bumpTurn });
    const store = new GameStore(campaignOnDay(1, []), dispatcher);
    const outcome = store.dispatch(endTurn());
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe(NO_ACTIVE_MISSION);
  });

  it("registers the shipped rules by default", () => {
    const dispatcher = createOverworldCommandDispatcher<GameState>();
    const tactical = composeTactical(dispatcher, CONTENT);
    expect(Object.keys(tactical.handlers)).toEqual([
      ATTACK,
      MOVE,
      OVERWATCH,
      RELOAD,
      INTERACT,
      EXTRACT,
      // EndTurn is registered last because it closes over the action
      // rules above: the bug phase drives them and must not be able to
      // recurse into the turn engine (#335).
      END_TURN,
    ]);
  });

  it("routes a registered rule at the mission, not at unknown-command", () => {
    const dispatcher = createOverworldCommandDispatcher<GameState>();
    composeTactical(dispatcher, CONTENT);
    const outcome = dispatcher.process(campaignOnDay(1, []), extract("unit-1"));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe(NO_ACTIVE_MISSION);
  });

  it("builds a tactical resolver over a source of the finished mission", () => {
    const dispatcher = createOverworldCommandDispatcher<GameState>();
    const tactical = composeTactical(dispatcher, CONTENT);
    const resolver = tactical.resolverFor(() => undefined);
    expect(resolver).toBeInstanceOf(TacticalMissionResolver);
  });

  it("one EndTurn plays the bug phase and hands the next turn back to the player (#412)", () => {
    const dispatcher = createOverworldCommandDispatcher<GameState>();
    const tactical = composeTactical(dispatcher, CONTENT);
    const { state, missionId } = campaignWithMission();
    const started = startTacticalMission(
      state,
      missionId,
      {
        missionId,
        squadIds: state.roster.squads.map((s) => s.id),
        mechIds: state.roster.mechs.map((m) => m.id),
      },
      tactical.missionStartDepsFor(new SequentialIdGenerator()),
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const store = new GameStore(started.value, dispatcher);
    const outcome = store.dispatch(endTurn());
    expect(outcome.ok).toBe(true);
    const mission = store.getState().activeMission;
    expect(mission?.phase).toBe("player");
    expect(mission?.turn).toBe(2);
    expect(mission?.outcome).toBeUndefined();
    expect(
      mission?.log.filter((e) => e.type === TURN_STARTED).map((e) => e.payload),
    ).toEqual([
      { turn: 1, phase: "bugs" },
      { turn: 2, phase: "player" },
    ]);
  });

  it("keeps the spawn steps in the bugs phase alongside the runner: the first edge wave lands on turn 3 (#329, #335)", () => {
    const dispatcher = createOverworldCommandDispatcher<GameState>();
    const tactical = composeTactical(dispatcher, CONTENT);
    const { state, missionId } = campaignWithMission();
    const started = startTacticalMission(
      state,
      missionId,
      {
        missionId,
        squadIds: state.roster.squads.map((s) => s.id),
        mechIds: state.roster.mechs.map((m) => m.id),
      },
      tactical.missionStartDepsFor(new SequentialIdGenerator()),
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const store = new GameStore(started.value, dispatcher);
    for (let turn = 0; turn < 3; turn++) {
      expect(store.dispatch(endTurn()).ok).toBe(true);
    }
    const mission = store.getState().activeMission;
    expect(mission?.turn).toBe(4);
    expect(mission?.phase).toBe("player");
    expect(
      mission?.log.filter((e) => e.type === BUGS_SPAWNED),
    ).not.toHaveLength(0);
    expect(mission?.units.some((u) => u.team === "bugs")).toBe(true);
  });

  it("mission-start deps place the whole starter roster on a generated map", () => {
    const dispatcher = createOverworldCommandDispatcher<GameState>();
    const tactical = composeTactical(dispatcher, CONTENT);
    const { state, missionId } = campaignWithMission();
    const started = startTacticalMission(
      state,
      missionId,
      {
        missionId,
        squadIds: state.roster.squads.map((s) => s.id),
        mechIds: state.roster.mechs.map((m) => m.id),
      },
      tactical.missionStartDepsFor(new SequentialIdGenerator()),
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const mission = started.value.activeMission;
    expect(mission?.missionId).toBe(missionId);
    expect(mission?.map.width).toBeGreaterThan(0);
    expect(mission?.units.filter((u) => u.team === "tdf")).toHaveLength(
      state.roster.squads.length + state.roster.mechs.length,
    );
  });
});

describe("createSheetLookup", () => {
  it("returns the sheet for a mech whose loadout validates and undefined otherwise", () => {
    const sheetFor = createSheetLookup(
      CONTENT.parts,
      CONTENT.rating,
      CONTENT.upgrades,
    );
    const mech = campaignOnDay(1, []).roster.mechs[0]!;
    expect(sheetFor(mech)?.combatRating).toBeGreaterThan(0);
    expect(
      sheetFor({ ...mech, loadout: { ...mech.loadout, legsId: "nope" } }),
    ).toBeUndefined();
  });
});

describe("shippedBugBehaviours", () => {
  // The species whose behaviour has not merged yet. Every other species
  // must be registered, so landing a behaviour class without wiring it
  // into shippedBugBehaviours fails here instead of shipping a bug that
  // stands still for a whole mission.
  const UNLANDED: readonly string[] = ["punish-clumps"];

  it("registers the behaviours that have landed, one tag each", () => {
    const tags = shippedBugBehaviours().map((b) => b.tag);
    // #333 shipped the lurker's flank, #332 the swarmer's rush; #334
    // punish-clumps joins this list as it merges.
    expect(tags).toContain("flank");
    expect(tags).toContain("rush");
    expect(new Set(tags).size).toBe(tags.length);
    expect(
      () => new MapBehaviourRegistry(shippedBugBehaviours()),
    ).not.toThrow();
  });

  it("actually drives a swarmer in a live mission: one shipped EndTurn moves it (#460)", () => {
    // The registry assertions above prove a behaviour is *registered*.
    // This proves the whole seam still carries it through to the board:
    // shipped EndTurn -> bugs phase -> runner -> species catalogue ->
    // SwarmerBehaviour -> the action rules -> a unit that moved.
    const mission = startedMission("player");
    const squad = mission.units.find((u) => u.team === "tdf");
    if (squad === undefined) throw new Error("fixture mission has no squad");
    const placed = withBug(
      mission,
      SWARMER,
      walkableTileNear(mission, {
        x: squad.pos.x + 5,
        y: squad.pos.y,
        z: squad.pos.z + 5,
      }),
    );
    const endTurnHandler = shippedTacticalHandlers()[END_TURN];
    if (endTurnHandler === undefined) throw new Error("EndTurn is not shipped");
    const outcome = endTurnHandler(placed.mission, endTurn(), {
      rng: new Mulberry32Rng(11),
      ids: new SequentialIdGenerator(),
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const after = outcome.value.state.units.find((u) => u.id === placed.bug.id);
    expect(after).toBeDefined();
    expect(after?.pos).not.toEqual(placed.bug.pos);
    expect(after?.ap).toBeLessThan(placed.bug.ap);
    // and the turn still came back to the player
    expect(outcome.value.state.phase).toBe("player");
  });

  it("gives every species a behaviour unless it is known not to have landed", () => {
    const registry = new MapBehaviourRegistry(shippedBugBehaviours());
    for (const species of Object.values(BUG_SPECIES)) {
      const expected = !UNLANDED.includes(species.behaviour);
      expect(
        registry.get(species.behaviour) !== undefined,
        `${species.id} (${species.behaviour}) registered`,
      ).toBe(expected);
    }
  });
});
