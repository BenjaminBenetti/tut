import { describe, expect, it } from "vitest";

import type { CommandContext } from "../../overworld/model/command-handler";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { err, ok } from "../../core/model/result";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { Deployment } from "../../overworld/model/deployment";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import type { MissionStarter } from "../model/mission-starter";
import { startMission } from "../model/start-mission-command";
import type { TacticalState } from "../model/tactical-state";
import {
  createStartMissionHandler,
  DEPLOYMENT_MISMATCH,
} from "./start-mission-handler";

// ===========================================
// Fixtures
// ===========================================

const CTX: CommandContext = {
  rng: new Mulberry32Rng(1),
  ids: new SequentialIdGenerator(),
};

const DEPLOYMENT: Deployment = {
  missionId: "mission-1",
  squadIds: ["squad-1"],
  mechIds: [],
};

function campaign(): GameState {
  return createNewGame(
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
}

/** A starter that records its call and hands back the campaign with a stub mission. */
function fakeStarter(mission: TacticalState): {
  readonly starter: MissionStarter;
  readonly calls: { missionId: string; deployment: Deployment }[];
} {
  const calls: { missionId: string; deployment: Deployment }[] = [];
  const starter: MissionStarter = {
    beginMission: (state, missionId, deployment) => {
      calls.push({ missionId, deployment });
      return ok({ ...state, activeMission: mission });
    },
  };
  return { starter, calls };
}

const STUB_MISSION = { missionId: "mission-1" } as TacticalState;

// ===========================================
// Tests
// ===========================================

describe("createStartMissionHandler", () => {
  it("hands the launch to the starter and stores the mission it returns", () => {
    const { starter, calls } = fakeStarter(STUB_MISSION);
    const handler = createStartMissionHandler<GameState>({ starter });

    const outcome = handler(
      campaign(),
      startMission("mission-1", DEPLOYMENT),
      CTX,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.state.activeMission).toBe(STUB_MISSION);
    expect(calls).toEqual([{ missionId: "mission-1", deployment: DEPLOYMENT }]);
  });

  it("emits no events: nothing has happened in the mission yet", () => {
    const { starter } = fakeStarter(STUB_MISSION);
    const outcome = createStartMissionHandler<GameState>({ starter })(
      campaign(),
      startMission("mission-1", DEPLOYMENT),
      CTX,
    );
    expect(outcome.ok && outcome.value.events).toEqual([]);
  });

  it("passes the command's id generator through, so mission ids come from meta", () => {
    let seen: unknown;
    const starter: MissionStarter = {
      beginMission: (state, _missionId, _deployment, ids) => {
        seen = ids;
        return ok(state);
      },
    };
    createStartMissionHandler<GameState>({ starter })(
      campaign(),
      startMission("mission-1", DEPLOYMENT),
      CTX,
    );
    expect(seen).toBe(CTX.ids);
  });

  it("refuses a deployment that names a different mission", () => {
    const { starter, calls } = fakeStarter(STUB_MISSION);
    const outcome = createStartMissionHandler<GameState>({ starter })(
      campaign(),
      startMission("mission-2", DEPLOYMENT),
      CTX,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe(DEPLOYMENT_MISMATCH);
    expect(calls).toEqual([]);
  });

  it("turns the starter's refusal into a command error and changes nothing", () => {
    const starter: MissionStarter = {
      beginMission: () => err({ kind: "mission-active", missionId: "m-9" }),
    };
    const state = campaign();
    const outcome = createStartMissionHandler<GameState>({ starter })(
      state,
      startMission("mission-1", DEPLOYMENT),
      CTX,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("mission-active");
    expect(outcome.error.message).toContain("m-9");
    expect(state.activeMission).toBeUndefined();
  });
});
