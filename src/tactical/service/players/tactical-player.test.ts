import { describe, expect, it } from "vitest";

import { err, ok } from "../../../core/model/result";
import { ABANDON_MISSION } from "../../model/abandon-mission-command";
import { END_TURN } from "../../model/end-turn-command";
import { reload } from "../../model/reload-command";
import type { TacticalCommand } from "../../model/tactical-command";
import type { TacticalState } from "../../model/tactical-state";
import { unitAt } from "../tactical-fixtures.test-helper";
import { OBJECTIVE_STRATEGIES } from "./objective-strategies.test-helper";
import { lookingMission } from "./player-fixtures.test-helper";
import type { PlayerPolicy } from "./player-policy.test-helper";
import type {
  CommandApplier,
  TacticalPlayer,
} from "./tactical-player.test-helper";
import {
  playMission,
  playPlayerPhase,
  STALL_TURNS,
} from "./tactical-player.test-helper";

/** A policy that reloads every unit, forever. */
const RELOADER: PlayerPolicy = {
  id: "reloader",
  assign: (view) =>
    new Map(view.own.map((unit) => [unit.id, { kind: "hunt", goals: [] }])),
  actingOrder: (view) => view.own.map((unit) => unit.id),
  next: (unit) => reload(unit.id),
};

/** A policy that never acts. */
const IDLE: PlayerPolicy = { ...RELOADER, id: "idle", next: () => undefined };

/** A player over `policy` and the shipped strategies. */
function playerOf(policy: PlayerPolicy): TacticalPlayer {
  return { policy, strategies: OBJECTIVE_STRATEGIES };
}

/** Two squads on the open field, no bugs. */
function twoSquads(): TacticalState {
  return lookingMission([
    unitAt("alpha", "infantry", { x: 2, y: 0, z: 2 }),
    unitAt("bravo", "infantry", { x: 3, y: 0, z: 3 }),
  ]);
}

describe("the modelled player's driver", () => {
  it("records a refusal and moves on to the next unit", () => {
    const applier: CommandApplier = () => err("no-ammo-pool");
    const phase = playPlayerPhase(twoSquads(), playerOf(RELOADER), applier);
    expect(phase.commands).toBe(2);
    expect(phase.refused).toEqual([
      "tactical:reload:no-ammo-pool",
      "tactical:reload:no-ammo-pool",
    ]);
  });

  it("stops a unit whose policy never says it is done", () => {
    const applier: CommandApplier = (mission) => ok(mission);
    const phase = playPlayerPhase(twoSquads(), playerOf(RELOADER), applier, {
      perUnit: 3,
      perPhase: 100,
    });
    expect(phase.commands).toBe(6);
    expect(phase.refused).toEqual([]);
  });

  it("abandons the mission at the turn cap, so every run has a result", () => {
    const seen: string[] = [];
    const applier: CommandApplier = (mission, command: TacticalCommand) => {
      seen.push(command.type);
      if (command.type === END_TURN)
        return ok({ ...mission, turn: mission.turn + 1 });
      if (command.type === ABANDON_MISSION)
        return ok({ ...mission, outcome: "lost" });
      return err("unexpected");
    };
    const play = playMission(twoSquads(), playerOf(IDLE), applier, 3);
    expect(play.capped).toBe(true);
    expect(play.abandoned).toBe("cap");
    expect(play.mission.outcome).toBe("lost");
    expect(seen).toEqual([END_TURN, END_TURN, END_TURN, ABANDON_MISSION]);
  });

  it("gives up on the stragglers once the job is done and nobody gets out", () => {
    const applier: CommandApplier = (mission, command: TacticalCommand) => {
      if (command.type === END_TURN)
        return ok({ ...mission, turn: mission.turn + 1 });
      if (command.type === ABANDON_MISSION)
        return ok({ ...mission, outcome: "won" });
      return err("unexpected");
    };
    // No objectives: the plan is settled from the first turn.
    const play = playMission(twoSquads(), playerOf(IDLE), applier, 60);
    expect(play.abandoned).toBe("stall");
    expect(play.turns).toBe(STALL_TURNS + 1);
  });
});
