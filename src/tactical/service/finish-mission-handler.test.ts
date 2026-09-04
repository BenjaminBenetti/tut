import { describe, expect, it } from "vitest";

import { commandError } from "../../core/model/command-error";
import { err, ok } from "../../core/model/result";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { CommandContext } from "../../overworld/model/command-handler";
import type { CommandHandler } from "../../overworld/model/command-handler";
import type { LaunchMissionCommand } from "../../overworld/model/launch-mission-command";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import { finishMission } from "../model/finish-mission-command";
import type { TacticalState } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import {
  createFinishMissionHandler,
  deploymentOf,
  NO_ACTIVE_MISSION,
} from "./finish-mission-handler";
import {
  missionWith,
  openField,
  unitAt,
} from "./tactical-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

const CTX: CommandContext = {
  rng: new Mulberry32Rng(1),
  ids: new SequentialIdGenerator(),
};
const MAP = openField().build();

function campaign(mission?: TacticalState): GameState {
  const base = createNewGame(
    { seed: 7, createdAt: "2026-09-04T00:00:00.000Z" },
    {
      map: EARTH_MAP,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      starterRoster: STARTER_ROSTER,
      newGameTuning: NEW_GAME_TUNING,
      threatTuning: THREAT_TUNING,
      economyTuning: ECONOMY_TUNING,
    },
  );
  return mission === undefined ? base : { ...base, activeMission: mission };
}

/** A unit of a kind, standing for a roster entry. */
function tokenFor(id: string, kind: Unit["kind"], sourceId: string): Unit {
  return {
    ...unitAt(id, kind === "mech" ? "mech" : "infantry", { x: 1, y: 0, z: 1 }),
    kind,
    sourceId,
  };
}

/** A finished mission with the given force and outcome. */
function played(
  units: readonly Unit[],
  extracted: readonly Unit[] = [],
): TacticalState {
  return missionWith(MAP, units, { outcome: "won", extracted });
}

/** A launch handler that records its command and pretends to apply a result. */
function fakeLaunch(): {
  readonly launch: CommandHandler<GameState, LaunchMissionCommand>;
  readonly seen: LaunchMissionCommand[];
} {
  const seen: LaunchMissionCommand[] = [];
  const launch: CommandHandler<GameState, LaunchMissionCommand> = (
    state,
    command,
  ) => {
    seen.push(command);
    return ok({
      state: {
        ...state,
        overworld: { ...state.overworld, missions: [] },
      },
      events: [],
    });
  };
  return { launch, seen };
}

// ===========================================
// Tests
// ===========================================

describe("createFinishMissionHandler", () => {
  it("hands the finished mission to LaunchMission and empties the slot", () => {
    const { launch, seen } = fakeLaunch();
    const mission = played([tokenFor("unit-1", "squad", "squad-1")]);
    const outcome = createFinishMissionHandler<GameState>({ launch })(
      campaign(mission),
      finishMission("mission-fixture"),
      CTX,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.state.activeMission).toBeUndefined();
    expect(seen).toHaveLength(1);
    expect(seen[0]?.payload.missionId).toBe("mission-fixture");
    expect(seen[0]?.payload.deployment.squadIds).toEqual(["squad-1"]);
  });

  it("passes the launch's events straight through", () => {
    const launch: CommandHandler<GameState, LaunchMissionCommand> = (state) =>
      ok({
        state,
        events: [{ type: "overworld:credits-changed", payload: {} } as never],
      });
    const outcome = createFinishMissionHandler<GameState>({ launch })(
      campaign(played([tokenFor("unit-1", "squad", "squad-1")])),
      finishMission("mission-fixture"),
      CTX,
    );
    expect(outcome.ok && outcome.value.events).toHaveLength(1);
  });

  it("refuses when no mission is in progress", () => {
    const { launch, seen } = fakeLaunch();
    const outcome = createFinishMissionHandler<GameState>({ launch })(
      campaign(),
      finishMission("mission-fixture"),
      CTX,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe(NO_ACTIVE_MISSION);
    expect(seen).toEqual([]);
  });

  it("refuses to end a mission other than the one that is live", () => {
    const { launch, seen } = fakeLaunch();
    const outcome = createFinishMissionHandler<GameState>({ launch })(
      campaign(played([tokenFor("unit-1", "squad", "squad-1")])),
      finishMission("mission-9"),
      CTX,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("mission-mismatch");
    expect(seen).toEqual([]);
  });

  it("refuses a mission that is still being fought", () => {
    const { launch, seen } = fakeLaunch();
    const running = missionWith(MAP, [
      tokenFor("unit-1", "squad", "squad-1"),
    ]);
    const outcome = createFinishMissionHandler<GameState>({ launch })(
      campaign(running),
      finishMission("mission-fixture"),
      CTX,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("mission-not-over");
    expect(seen).toEqual([]);
  });

  it("leaves the mission in progress when the launch refuses", () => {
    const launch: CommandHandler<GameState, LaunchMissionCommand> = () =>
      err(commandError("mission-expired", "Mission expired on day 6"));
    const state = campaign(played([tokenFor("unit-1", "squad", "squad-1")]));
    const outcome = createFinishMissionHandler<GameState>({ launch })(
      state,
      finishMission("mission-fixture"),
      CTX,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("mission-expired");
    expect(state.activeMission).toBeDefined();
  });
});

// ===========================================
// deploymentOf
// ===========================================

describe("deploymentOf", () => {
  it("reads the force back off the mission, extracted units included", () => {
    const mission = played(
      [
        tokenFor("unit-1", "squad", "squad-1"),
        tokenFor("unit-2", "mech", "mech-1"),
        unitAt("unit-3", "infantry", { x: 5, y: 0, z: 5 }, { team: "bugs" }),
      ],
      [tokenFor("unit-4", "squad", "squad-2")],
    );
    expect(deploymentOf(mission)).toEqual({
      missionId: "mission-fixture",
      squadIds: ["squad-1", "squad-2"],
      mechIds: ["mech-1"],
    });
  });

  it("counts the dead: a wiped squad still deployed", () => {
    const mission = played([
      { ...tokenFor("unit-1", "squad", "squad-1"), hp: 0 },
    ]);
    expect(deploymentOf(mission).squadIds).toEqual(["squad-1"]);
  });

  it("is empty for a mission nobody was sent on", () => {
    expect(deploymentOf(played([]))).toEqual({
      missionId: "mission-fixture",
      squadIds: [],
      mechIds: [],
    });
  });
});
