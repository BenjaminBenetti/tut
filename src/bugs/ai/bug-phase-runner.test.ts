import { describe, expect, it, vi } from "vitest";

import type { Rng } from "../../core/model/rng";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { ok } from "../../core/model/result";
import { ATTACK, attack } from "../../tactical/model/attack-command";
import { INTERACT, interact } from "../../tactical/model/interact-command";
import { ATTACK_RESOLVED } from "../../tactical/model/attack-resolved-event";
import { MOVE, move } from "../../tactical/model/move-command";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { UnitId } from "../../tactical/model/unit";
import { UNIT_DIED } from "../../tactical/model/unit-died-event";
import { UNIT_MOVED } from "../../tactical/model/unit-moved-event";
import { createAttackHandler } from "../../tactical/service/combat-service";
import type { MoveGraph } from "../../tactical/service/movement-service";
import * as movement from "../../tactical/service/movement-service";
import { createMoveHandler } from "../../tactical/service/move-handler";
import {
  ctxWith,
  missionWith,
  openField,
  riggedRng,
  unitAt,
} from "../../tactical/service/tactical-fixtures.test-helper";
import type { TacticalHandlers } from "../../tactical/service/tactical-command-handlers";
import {
  createOverwatchReaction,
  missionOutcome,
} from "../../tactical/service/turn-service";
import { BUG_SPECIES, LURKER, SWARMER } from "../data/species";
import {
  startedMission,
  walkableTileNear,
  withBug,
} from "./bug-mission.test-helper";
import { LurkerBehaviour } from "./lurker-behaviour";
import { createSpeciesLookup } from "../service/species-lookup";
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

/** Steps one tile east or west on the draw, then bites the squad. */
const DITHER = rush((mission, unitId, ctx) => {
  const unit = mission.units.find((u) => u.id === unitId);
  if (unit === undefined) throw new Error(`fixture lost unit ${unitId}`);
  const step = ctx.rng.pick([
    at(unit.pos.x - 1, unit.pos.z),
    at(unit.pos.x + 1, unit.pos.z),
  ]);
  return [move(unitId, [step]), attack(unitId, "u")];
});

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
    const run = (seed: number) =>
      runner(DITHER)(bugsPhase(), ctxWith(new Mulberry32Rng(seed)));
    const first = run(42);
    const again = run(42);
    expect(again.state).toEqual(first.state);
    expect(again.events).toEqual(first.events);
    expect(first.events.length).toBeGreaterThan(0);
  });

  it("draws from the phase's own stream: some other seed plays the phase differently", () => {
    const walk = (seed: number) =>
      runner(DITHER)(bugsPhase(), ctxWith(new Mulberry32Rng(seed)))
        .state.units.filter((u) => u.team === "bugs")
        .map((u) => `${String(u.pos.x)},${String(u.pos.z)}`)
        .join(" ");
    const seeds = [1, 2, 3, 4, 5, 42];
    expect(new Set(seeds.map(walk)).size).toBeGreaterThan(1);
  });

  it("forks each bug independently: how much one bug draws never shifts the next bug's", () => {
    // b1 dithers `draws` times before settling, b2 always once. On
    // labelled per-unit forks b2 lands on the same tile either way; on a
    // single stream shared down the phase, b1's extra draws move it.
    const chatty = (draws: number) =>
      rush((mission, unitId, ctx) => {
        const unit = mission.units.find((u) => u.id === unitId);
        if (unit === undefined) throw new Error(`fixture lost unit ${unitId}`);
        const west = at(unit.pos.x - 1, unit.pos.z);
        const east = at(unit.pos.x + 1, unit.pos.z);
        let step = west;
        for (let i = 0; i < (unitId === "b1" ? draws : 1); i++) {
          step = ctx.rng.pick([west, east]);
        }
        return [move(unitId, [step]), attack(unitId, "u")];
      });
    const b2After = (draws: number) =>
      runner(chatty(draws))(
        bugsPhase(),
        ctxWith(new Mulberry32Rng(42)),
      ).state.units.find((u) => u.id === "b2")?.pos;
    expect(b2After(3)).toEqual(b2After(1));
  });

  it("builds the move graph once a phase, and not at all when nobody reads it", () => {
    const built = vi.spyOn(movement, "buildMoveGraph");

    const blind = rush(() => []);
    runner(blind)(bugsPhase(), ctxWith(riggedRng(true)));
    expect(built).not.toHaveBeenCalled();

    const graphs: (MoveGraph | undefined)[] = [];
    const peek = rush((_mission, _unitId, ctx) => (graphs.push(ctx.graph), []));
    runner(peek)(bugsPhase(), ctxWith(riggedRng(true)));
    expect(built).toHaveBeenCalledTimes(1);
    expect(graphs).toHaveLength(2);
    expect(graphs[0]).toBe(graphs[1]);
    built.mockRestore();
  });

  it("skips a bug that died earlier in the phase", () => {
    const overwatching = missionWith(
      openField().build(),
      [
        unitAt("u", "infantry", at(0, 0), { status: ["overwatch"] }),
        unitAt("b1", "infantry", at(2, 0), { team: "bugs" }),
        unitAt("b2", "infantry", at(2, 1), { team: "bugs", hp: 1 }),
      ],
      { phase: "bugs" },
    );
    // b1 walks past the watcher, whose reaction shot drops b2 instead of
    // itself; b2 must then be passed over rather than acting at 0 hp.
    const suicidalEscort = rush((_mission, unitId) =>
      unitId === "b1" ? [move("b2", [at(1, 1)])] : [attack(unitId, "u")],
    );
    const applied = runner(suicidalEscort)(
      overwatching,
      ctxWith(riggedRng(true, "high")),
    );
    expect(applied.state.units.find((u) => u.id === "b2")?.hp).toBe(0);
    expect(
      applied.events.filter((e) => e.type === ATTACK_RESOLVED),
    ).toHaveLength(1);
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

  it("stops when a bug's own action decides the mission mid-phase, not at the next turn boundary", () => {
    // #425 ends a mission the moment the last objective completes. The
    // runner asks `missionOutcome` between bugs, so b2 must never act.
    // A stub Interact keeps this about the runner's guard rather than
    // the objective rules' own reach and cost checks.
    const demolish: TacticalHandlers = {
      ...HANDLERS,
      [INTERACT]: (mission, command) =>
        ok({
          state: {
            ...mission,
            // Bills the action like the real rule, so a bug that acts
            // after the mission is decided leaves a mark to assert on.
            units: mission.units.map((u) =>
              u.id === command.payload.unitId ? { ...u, ap: u.ap - 1 } : u,
            ),
            objectives: mission.objectives.map((o) => ({
              ...o,
              complete: true,
            })),
          },
          events: [],
        }),
    };
    const mission: TacticalState = {
      ...bugsPhase(),
      objectives: [
        {
          id: "obj-1",
          kind: "destroy-spawner",
          targetId: "spawner-1",
          complete: false,
        },
      ],
    };
    const plant = rush((_mission, unitId) => [interact(unitId, "obj-1")]);
    const applied = createBugPhaseRunner({
      handlers: demolish,
      registry: new MapBehaviourRegistry([plant]),
      speciesOf,
      combat: COMBAT_TUNING,
    })(mission, ctxWith(riggedRng(true)));
    expect(applied.state.objectives[0]?.complete).toBe(true);
    expect(missionOutcome(applied.state)).toBe("won");
    // b2 still has both actions: the phase stopped before reaching it.
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

describe("createBugPhaseRunner with a shipped behaviour", () => {
  it("stalks for real: a lurker on a generated map acts through the shipped rules and the species catalogue", () => {
    const started = startedMission("bugs");
    const squad = started.units.find((u) => u.team === "tdf");
    if (squad === undefined) throw new Error("fixture mission has no squad");
    const placed = withBug(
      started,
      LURKER,
      walkableTileNear(started, {
        x: squad.pos.x + 6,
        y: squad.pos.y,
        z: squad.pos.z + 6,
      }),
    );
    const shipped = createBugPhaseRunner({
      handlers: HANDLERS,
      registry: new MapBehaviourRegistry([new LurkerBehaviour()]),
      speciesOf: createSpeciesLookup(BUG_SPECIES),
      combat: COMBAT_TUNING,
    });
    const applied = shipped(placed.mission, ctxWith(new Mulberry32Rng(7)));
    const after = applied.state.units.find((u) => u.id === placed.bug.id);
    expect(applied.events.map((e) => e.type)).toContain(UNIT_MOVED);
    expect(after?.pos).not.toEqual(placed.bug.pos);
    expect(after?.ap).toBeLessThan(placed.bug.ap);
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
