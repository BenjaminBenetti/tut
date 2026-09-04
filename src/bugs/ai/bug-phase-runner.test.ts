import { describe, expect, it } from "vitest";

import type { Rng } from "../../core/model/rng";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { ATTACK, attack } from "../../tactical/model/attack-command";
import { ATTACK_RESOLVED } from "../../tactical/model/attack-resolved-event";
import { MOVE, move } from "../../tactical/model/move-command";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { UnitId } from "../../tactical/model/unit";
import { UNIT_DIED } from "../../tactical/model/unit-died-event";
import { UNIT_MOVED } from "../../tactical/model/unit-moved-event";
import { createAttackHandler } from "../../tactical/service/combat-service";
import { createMoveHandler } from "../../tactical/service/move-handler";
import {
  ctxWith,
  missionWith,
  openField,
  riggedRng,
  unitAt,
} from "../../tactical/service/tactical-fixtures.test-helper";
import type { TacticalHandlers } from "../../tactical/service/tactical-command-handlers";
import { createOverwatchReaction } from "../../tactical/service/turn-service";
import { SWARMER } from "../data/species";
import type { BehaviourContext, BugBehaviour } from "./bug-behaviour";
import { MapBehaviourRegistry } from "./behaviour-registry";
import { createBugPhaseRunner, livingBugIds } from "./bug-phase-runner";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number): TileCoord => ({ x, y: 0, z });

/** The shipped action rules; no `EndTurn`, as the composition root passes them. */
const HANDLERS: TacticalHandlers = {
  [ATTACK]: createAttackHandler(COMBAT_TUNING),
  [MOVE]: createMoveHandler(createOverwatchReaction(COMBAT_TUNING)),
};

/** Every fixture bug is a swarmer, whose tag is `rush`. */
const speciesOf = () => SWARMER;

/** A `rush` behaviour that returns whatever `plan` says for the unit. */
function rush(
  plan: (
    mission: TacticalState,
    unitId: UnitId,
    ctx: BehaviourContext,
  ) => readonly TacticalCommand[],
): BugBehaviour {
  return { tag: "rush", choose: plan };
}

/** One step west then a shot at the squad. */
const stepAndShoot = rush((mission, unitId) => {
  const unit = mission.units.find((u) => u.id === unitId);
  if (unit === undefined) throw new Error(`fixture lost unit ${unitId}`);
  return [move(unitId, [at(unit.pos.x - 1, unit.pos.z)]), attack(unitId, "u")];
});

/** A bugs-phase mission: the squad at the west edge, bugs three tiles east. */
function bugsPhase(hp = 10): TacticalState {
  return missionWith(
    openField().build(),
    [
      unitAt("u", "infantry", at(0, 0), { hp }),
      unitAt("b1", "infantry", at(3, 0), { team: "bugs" }),
      unitAt("b2", "infantry", at(3, 1), { team: "bugs" }),
    ],
    { phase: "bugs" },
  );
}

/** The rigged rng, recording every fork label it is asked for. */
function recordingRng(labels: string[]): Rng {
  const base = riggedRng(true, "low");
  const rng: Rng = {
    ...base,
    fork: (label) => (labels.push(label ?? "?"), rng),
  };
  return rng;
}

/** A runner over the handlers with the one behaviour registered. */
function runner(behaviour: BugBehaviour) {
  return createBugPhaseRunner({
    handlers: HANDLERS,
    registry: new MapBehaviourRegistry([behaviour]),
    speciesOf,
    combat: COMBAT_TUNING,
  });
}

// ===========================================
// Tests
// ===========================================

describe("createBugPhaseRunner", () => {
  it("acts for every living bug in units order, each on its own labelled fork, applying its commands through the handlers", () => {
    const labels: string[] = [];
    const applied = runner(stepAndShoot)(
      bugsPhase(),
      ctxWith(recordingRng(labels)),
    );
    expect(applied.events.map((e) => e.type)).toEqual([
      UNIT_MOVED,
      ATTACK_RESOLVED,
      UNIT_MOVED,
      ATTACK_RESOLVED,
    ]);
    expect(labels).toEqual([
      "bug:b1",
      "choose",
      "command:0",
      "command:1",
      "bug:b2",
      "choose",
      "command:0",
      "command:1",
    ]);
    const next = applied.state;
    expect(next.units.find((u) => u.id === "b1")?.pos).toEqual(at(2, 0));
    expect(next.units.find((u) => u.id === "b2")?.pos).toEqual(at(2, 1));
    expect(next.units.find((u) => u.id === "b1")?.ap).toBe(0);
    expect(next.units.find((u) => u.id === "u")?.hp).toBe(6);
    expect(next.phase).toBe("bugs");
  });

  it("stops a bug at its first refused command and still runs the next bug", () => {
    const shootThenStep = rush((mission, unitId) =>
      unitId === "b1"
        ? [attack(unitId, "far"), move(unitId, [at(2, 0)])]
        : stepAndShoot.choose(mission, unitId, {
            rng: riggedRng(true),
            combat: COMBAT_TUNING,
          }),
    );
    const mission: TacticalState = {
      ...bugsPhase(),
      units: [...bugsPhase().units, unitAt("far", "infantry", at(0, 7))],
    };
    const applied = runner(shootThenStep)(mission, ctxWith(riggedRng(true)));
    expect(applied.events.map((e) => e.type)).toEqual([
      UNIT_MOVED,
      ATTACK_RESOLVED,
    ]);
    expect(applied.state.units.find((u) => u.id === "b1")).toBe(
      mission.units[1],
    );
    expect(applied.state.units.find((u) => u.id === "b2")?.pos).toEqual(
      at(2, 1),
    );
  });

  it("is deterministic per seed: the same mission and seed replay the same phase", () => {
    const dither = rush((mission, unitId, ctx) => {
      const unit = mission.units.find((u) => u.id === unitId);
      if (unit === undefined) throw new Error(`fixture lost unit ${unitId}`);
      const step = ctx.rng.pick([
        at(unit.pos.x - 1, unit.pos.z),
        at(unit.pos.x + 1, unit.pos.z),
      ]);
      return [move(unitId, [step]), attack(unitId, "u")];
    });
    const run = (seed: number) =>
      runner(dither)(bugsPhase(), ctxWith(new Mulberry32Rng(seed)));
    const first = run(42);
    const again = run(42);
    expect(again.state).toEqual(first.state);
    expect(again.events).toEqual(first.events);
    expect(first.events.length).toBeGreaterThan(0);
  });

  it("stops acting once the phase has decided the mission", () => {
    const applied = runner(stepAndShoot)(
      bugsPhase(2),
      ctxWith(riggedRng(true)),
    );
    expect(applied.events.map((e) => e.type)).toEqual([
      UNIT_MOVED,
      ATTACK_RESOLVED,
      UNIT_DIED,
    ]);
    expect(applied.state.units.find((u) => u.id === "b2")?.ap).toBe(2);
  });

  it("leaves the mission alone outside the bugs phase and when no behaviour is registered", () => {
    const playerPhase = { ...bugsPhase(), phase: "player" as const };
    expect(runner(stepAndShoot)(playerPhase, ctxWith(riggedRng(true)))).toEqual(
      { state: playerPhase, events: [] },
    );
    const idle = createBugPhaseRunner({
      handlers: HANDLERS,
      registry: new MapBehaviourRegistry(),
      speciesOf,
      combat: COMBAT_TUNING,
    });
    const mission = bugsPhase();
    expect(idle(mission, ctxWith(riggedRng(true)))).toEqual({
      state: mission,
      events: [],
    });
  });
});

describe("livingBugIds", () => {
  it("lists the living bugs in units order and skips the dead and the squad", () => {
    const mission = missionWith(openField().build(), [
      unitAt("b2", "infantry", at(3, 1), { team: "bugs" }),
      unitAt("u", "infantry", at(0, 0)),
      unitAt("corpse", "infantry", at(4, 4), { team: "bugs", hp: 0 }),
      unitAt("b1", "infantry", at(3, 0), { team: "bugs" }),
    ]);
    expect(livingBugIds(mission)).toEqual(["b2", "b1"]);
  });
});
