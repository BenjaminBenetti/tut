import { describe, expect, it } from "vitest";

import { MISSION_TYPES } from "../../content/data/mission-types";
import { err, ok } from "../../core/model/result";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { createDefaultRegistries } from "../../mapgen/service/default-registries";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import { UNKNOWN_COMMAND } from "../../overworld/model/command-dispatcher";
import type { Mission } from "../../overworld/model/mission";
import { createOverworldCommandDispatcher } from "../../overworld/service/command-dispatcher";
import { MECH_RATING_TUNING } from "../../roster/data/mech-rating-tuning";
import { STARTER_PARTS } from "../../roster/data/parts";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { UPGRADE_TUNING } from "../../roster/data/upgrade-tuning";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import { StaticPartCatalogue } from "../../roster/repository/static-part-catalogue";
import { validateLoadout } from "../../roster/service/loadout-validation-service";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import { UNIT_TUNING } from "../data/unit-tuning";
import { SPAWN_TUNING } from "../data/spawn-tuning";
import { attack } from "../model/attack-command";
import type { EndTurnCommand } from "../model/end-turn-command";
import { END_TURN, endTurn } from "../model/end-turn-command";
import type { MoveCommand } from "../model/move-command";
import { MOVE, move } from "../model/move-command";
import type { TacticalHandler } from "../model/tactical-handler";
import { TURN_STARTED } from "../model/turn-started-event";
import { UNIT_MOVED } from "../model/unit-moved-event";
import { startTacticalMission } from "./mission-start-service";
import {
  MISSION_OVER,
  NO_ACTIVE_MISSION,
  registerTacticalCommands,
} from "./tactical-command-handlers";

// ===========================================
// Fixtures
// ===========================================

const PARTS = new StaticPartCatalogue(STARTER_PARTS);

/** A campaign with a small clearance mission in progress. */
function inMission(): GameState {
  const base = createNewGame(
    { seed: 7, createdAt: "2026-09-03T00:00:00.000Z" },
    {
      map: EARTH_MAP,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      starterRoster: STARTER_ROSTER,
      newGameTuning: NEW_GAME_TUNING,
      threatTuning: THREAT_TUNING,
      economyTuning: ECONOMY_TUNING,
    },
  );
  const city =
    base.overworld.map.cities.find((c) => c.infestation > 0) ??
    base.overworld.map.cities[0];
  if (!city) throw new Error("fixture needs a city");
  const region = base.overworld.map.regions.find((r) => r.id === city.regionId);
  if (!region) throw new Error("fixture needs a region");
  const mission: Mission = {
    id: "mission-1",
    typeId: "infestation-clearance",
    cityId: city.id,
    difficulty: 1,
    mapParams: {
      biome: region.biome,
      settlement: city.scale,
      size: "small",
      seed: "cmd-1",
    },
    rewards: { credits: 300 },
    createdDay: 1,
    expiresDay: 6,
    ignorePenalty: 10,
  };
  const withMission: GameState = {
    ...base,
    overworld: { ...base.overworld, missions: [mission] },
  };
  const started = startTacticalMission(
    withMission,
    mission.id,
    {
      missionId: mission.id,
      squadIds: base.roster.squads.map((s) => s.id),
      mechIds: base.roster.mechs.map((m) => m.id),
    },
    {
      missionTypes: MISSION_TYPES,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      sheetFor: (mech) => {
        const r = validateLoadout(
          mech.loadout,
          PARTS,
          MECH_RATING_TUNING,
          UPGRADE_TUNING,
        );
        return r.ok ? r.value : undefined;
      },
      unitTuning: UNIT_TUNING,
      spawnTuning: SPAWN_TUNING,
      ids: new SequentialIdGenerator(),
      registries: createDefaultRegistries(),
    },
  );
  if (!started.ok) throw new Error(started.error.kind);
  return started.value;
}

/** Bumps the turn and announces it. */
const fakeEndTurn: TacticalHandler<EndTurnCommand> = (mission) =>
  ok({
    state: { ...mission, turn: mission.turn + 1 },
    events: [
      {
        type: TURN_STARTED,
        payload: { turn: mission.turn + 1, phase: "player" },
      },
    ],
  });

/** Records one draw and moves a unit to the end of its path; unknown units are refused. */
function fakeMove(draws: number[]): TacticalHandler<MoveCommand> {
  return (mission, command, ctx) => {
    const unit = mission.units.find((u) => u.id === command.payload.unitId);
    if (!unit) {
      return err({ kind: "unit-not-found", unitId: command.payload.unitId });
    }
    draws.push(ctx.rng.nextInt(0, 1_000_000));
    const to = command.payload.path.at(-1) ?? unit.pos;
    return ok({
      state: {
        ...mission,
        units: mission.units.map((u) =>
          u.id === unit.id ? { ...u, pos: to } : u,
        ),
      },
      events: [
        {
          type: UNIT_MOVED,
          payload: {
            unitId: unit.id,
            from: unit.pos,
            to,
            path: command.payload.path,
          },
        },
      ],
    });
  };
}

function dispatcherWith(draws: number[] = []) {
  const dispatcher = createOverworldCommandDispatcher<GameState>();
  registerTacticalCommands(dispatcher, {
    [END_TURN]: fakeEndTurn,
    [MOVE]: fakeMove(draws),
  });
  return dispatcher;
}

// ===========================================
// Tests
// ===========================================

describe("registerTacticalCommands", () => {
  it("rejects a tactical command with a typed error when no mission is in progress", () => {
    const dispatcher = dispatcherWith();
    const state = inMission();
    const idle: GameState = { ...state, activeMission: undefined };
    const result = dispatcher.process(idle, endTurn());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(NO_ACTIVE_MISSION);
    expect(result.error.message).toBe("No mission is in progress");
  });

  it("lifts the mission, applies the handler and writes it back with the events logged", () => {
    const dispatcher = dispatcherWith();
    const state = inMission();
    const result = dispatcher.process(state, endTurn());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const mission = result.value.state.activeMission;
    expect(mission?.turn).toBe(2);
    expect(mission?.log).toEqual([
      { type: TURN_STARTED, payload: { turn: 2, phase: "player" } },
    ]);
    expect(result.value.events).toEqual(mission?.log);
    expect(result.value.state.overworld).toBe(state.overworld);
    expect(result.value.state.roster).toBe(state.roster);
    expect(state.activeMission?.turn).toBe(1);
  });

  it("folds a handler's TacticalError into a CommandError and writes nothing back", () => {
    const dispatcher = dispatcherWith();
    const state = inMission();
    const result = dispatcher.process(state, move("unit-99", []));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("unit-not-found");
    expect(result.error.message).toContain("unit-99");
  });

  it("leaves unregistered tactical commands to the dispatcher's unknown-command error", () => {
    const dispatcher = dispatcherWith();
    const result = dispatcher.process(inMission(), attack("unit-1", "unit-2"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(UNKNOWN_COMMAND);
    const none = createOverworldCommandDispatcher<GameState>();
    registerTacticalCommands(none, {});
    expect(none.process(inMission(), endTurn()).ok).toBe(false);
  });

  it("forks a stream per command that replays for the same state and moves on with the log", () => {
    const state = inMission();
    const unit = state.activeMission?.units[0];
    if (!unit) throw new Error("fixture needs a unit");
    const command = move(unit.id, [unit.pos]);

    const first: number[] = [];
    const second: number[] = [];
    dispatcherWith(first).process(state, command);
    dispatcherWith(second).process(state, command);
    expect(first).toEqual(second);

    const chained: number[] = [];
    const dispatcher = dispatcherWith(chained);
    const once = dispatcher.process(state, command);
    if (!once.ok) throw new Error(once.error.message);
    dispatcher.process(once.value.state, command);
    expect(chained).toHaveLength(2);
    expect(chained[0]).not.toBe(chained[1]);
    expect(once.value.state.activeMission?.log.map((e) => e.type)).toEqual([
      UNIT_MOVED,
    ]);
  });

  it("refuses every tactical command once the mission has an outcome", () => {
    const dispatcher = dispatcherWith();
    const state = inMission();
    if (!state.activeMission) throw new Error("fixture needs a mission");
    const ended: GameState = {
      ...state,
      activeMission: { ...state.activeMission, outcome: "won" },
    };
    const result = dispatcher.process(ended, endTurn());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(MISSION_OVER);
    expect(result.error.message).toContain("won");
  });
});
