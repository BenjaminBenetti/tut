import { describe, expect, it } from "vitest";

import { commandError } from "../../core/model/command-error";
import { err, ok } from "../../core/model/result";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type {
  CommandContext,
  CommandHandler,
} from "../../overworld/model/command-handler";
import { MAX_DEPLOYED_UNITS } from "../../overworld/model/deployment";
import type { LaunchMissionCommand } from "../../overworld/model/launch-mission-command";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import type { RosterState } from "../../roster/model/roster-state";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import type { TacticalState } from "../model/tactical-state";
import { winMissionInstantly } from "../model/win-mission-instantly-command";
import {
  missionWith,
  openField,
  unitAt,
} from "./tactical-fixtures.test-helper";
import {
  createWinMissionInstantlyHandler,
  instantWinDeployment,
} from "./win-mission-instantly-handler";

// ===========================================
// Fixtures
// ===========================================

const CTX: CommandContext = {
  rng: new Mulberry32Rng(1),
  ids: new SequentialIdGenerator(),
};

/** A new campaign on the starter roster (four squads, one mech), with `mission` live when given. */
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
      state: { ...state, overworld: { ...state.overworld, missions: [] } },
      events: [],
    });
  };
  return { launch, seen };
}

/** `roster` with `squads` squads and `mechs` mechs, each a renamed copy of its first. */
function rosterOf(
  roster: RosterState,
  squads: number,
  mechs: number,
): Pick<RosterState, "squads" | "mechs"> {
  const squad = roster.squads[0];
  const mech = roster.mechs[0];
  if (squad === undefined || mech === undefined) {
    throw new Error("the starter roster has a squad and a mech");
  }
  return {
    squads: Array.from({ length: squads }, (_, i) => ({
      ...squad,
      id: `squad-${String(i + 1)}`,
    })),
    mechs: Array.from({ length: mechs }, (_, i) => ({
      ...mech,
      id: `mech-${String(i + 1)}`,
    })),
  };
}

// ===========================================
// Tests
// ===========================================

describe("createWinMissionInstantlyHandler (#1235)", () => {
  it("refuses outside a dev build, without launching anything", () => {
    const { launch, seen } = fakeLaunch();
    const outcome = createWinMissionInstantlyHandler<GameState>({
      launch,
      enabled: false,
    })(campaign(), winMissionInstantly("mission-1"), CTX);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("debug-disabled");
    expect(seen).toHaveLength(0);
  });

  it("refuses while a mission is in progress, so the live one is never orphaned", () => {
    const { launch, seen } = fakeLaunch();
    const live = missionWith(openField().build(), [
      unitAt("unit-1", "infantry", { x: 1, y: 0, z: 1 }),
    ]);
    const outcome = createWinMissionInstantlyHandler<GameState>({
      launch,
      enabled: true,
    })(campaign(live), winMissionInstantly("mission-1"), CTX);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("mission-active");
    expect(seen).toHaveLength(0);
  });

  it("launches the offer with every squad, then every mech, in roster order", () => {
    const { launch, seen } = fakeLaunch();
    const state = campaign();
    const outcome = createWinMissionInstantlyHandler<GameState>({
      launch,
      enabled: true,
    })(state, winMissionInstantly("mission-1"), CTX);

    expect(outcome.ok).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.payload.missionId).toBe("mission-1");
    expect(seen[0]?.payload.deployment).toEqual({
      missionId: "mission-1",
      squadIds: state.roster.squads.map((squad) => squad.id),
      mechIds: state.roster.mechs.map((mech) => mech.id),
    });
    expect(seen[0]?.payload.deployment.squadIds).toHaveLength(4);
    expect(seen[0]?.payload.deployment.mechIds).toHaveLength(1);
  });

  it("returns the launch's refusal unchanged", () => {
    const refusal = commandError("mission-not-found", "No such mission.");
    const outcome = createWinMissionInstantlyHandler<GameState>({
      launch: () => err(refusal),
      enabled: true,
    })(campaign(), winMissionInstantly("mission-gone"), CTX);

    expect(outcome).toEqual(err(refusal));
  });
});

describe("instantWinDeployment (#1235)", () => {
  const roster = campaign().roster;

  it("fills the deployment cap with squads first, then mechs", () => {
    const deployment = instantWinDeployment(
      "mission-1",
      rosterOf(roster, 6, 4),
    );

    expect(deployment.squadIds).toEqual([
      "squad-1",
      "squad-2",
      "squad-3",
      "squad-4",
      "squad-5",
      "squad-6",
    ]);
    expect(deployment.mechIds).toEqual(["mech-1", "mech-2"]);
    expect(deployment.squadIds.length + deployment.mechIds.length).toBe(
      MAX_DEPLOYED_UNITS,
    );
  });

  it("sends no mech when the squads alone fill the cap", () => {
    const deployment = instantWinDeployment(
      "mission-1",
      rosterOf(roster, MAX_DEPLOYED_UNITS + 1, 2),
    );

    expect(deployment.squadIds).toHaveLength(MAX_DEPLOYED_UNITS);
    expect(deployment.mechIds).toEqual([]);
  });

  it("sends nobody from an empty roster, which the launch then refuses", () => {
    expect(instantWinDeployment("mission-1", rosterOf(roster, 0, 0))).toEqual({
      missionId: "mission-1",
      squadIds: [],
      mechIds: [],
    });
  });
});
