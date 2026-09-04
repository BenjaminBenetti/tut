import { describe, expect, it } from "vitest";

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
import { MOVE } from "../../tactical/model/move-command";
import { OVERWATCH } from "../../tactical/model/overwatch-command";
import { RELOAD } from "../../tactical/model/reload-command";
import { extract } from "../../tactical/model/extract-command";
import { END_TURN, endTurn } from "../../tactical/model/end-turn-command";
import type { TacticalHandler } from "../../tactical/model/tactical-handler";
import { TURN_STARTED } from "../../tactical/model/turn-started-event";
import { startTacticalMission } from "../../tactical/service/mission-start-service";
import { NO_ACTIVE_MISSION } from "../../tactical/service/tactical-command-handlers";
import {
  campaignOnDay,
  missionAt,
} from "../../ui/view/mission-fixtures.test-helper";
import { GameStore } from "./game-store";
import type { TacticalContent } from "./tactical-composition";
import { composeTactical, createSheetLookup } from "./tactical-composition";

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

  it("registers the shipped rules by default and leaves the rest unknown", () => {
    const dispatcher = createOverworldCommandDispatcher<GameState>();
    const tactical = composeTactical(dispatcher, CONTENT);
    expect(Object.keys(tactical.handlers)).toEqual([
      ATTACK,
      MOVE,
      END_TURN,
      OVERWATCH,
      RELOAD,
    ]);
    const outcome = dispatcher.process(campaignOnDay(1, []), extract("unit-1"));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("unknown-command");
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
