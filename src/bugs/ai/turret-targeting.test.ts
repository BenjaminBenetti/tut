import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { GARRISON_TURRET_TUNING } from "../../tactical/data/turret-tuning";
import { ATTACK } from "../../tactical/model/attack-command";
import { ATTACK_RESOLVED } from "../../tactical/model/attack-resolved-event";
import { MOVE } from "../../tactical/model/move-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import {
  GARRISON_TURRET_SOURCE_ID,
  turretDestroyed,
} from "../../tactical/model/turret";
import { TURRET_DESTROYED } from "../../tactical/model/turret-destroyed-event";
import { UNIT_DIED } from "../../tactical/model/unit-died-event";
import { UNIT_MOVED } from "../../tactical/model/unit-moved-event";
import type { Unit } from "../../tactical/model/unit";
import { createAttackHandler } from "../../tactical/service/combat-service";
import { createMoveHandler } from "../../tactical/service/move-handler";
import type { TacticalHandlers } from "../../tactical/service/tactical-command-handlers";
import {
  ctxWith,
  fixtureAttackDeps,
  missionWith,
  openField,
  riggedRng,
  unitAt,
} from "../../tactical/service/tactical-fixtures.test-helper";
import { createOverwatchReaction } from "../../tactical/service/turn-service";
import { armTurret } from "../../tactical/service/turret-service";
import { turretUnit } from "../../tactical/service/unit-factory";
import { BUG_SPECIES, SWARMER } from "../data/species";
import { createSpeciesLookup } from "../service/species-lookup";
import { MapBehaviourRegistry } from "./behaviour-registry";
import { withBug } from "./bug-mission.test-helper";
import { createBugPhaseRunner } from "./bug-phase-runner";
import { SwarmerBehaviour } from "./swarmer-behaviour";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number): TileCoord => ({ x, y: 0, z });

/** The shipped action rules, as the composition root passes them. */
const ATTACK_DEPS = fixtureAttackDeps();
const HANDLERS: TacticalHandlers = {
  [ATTACK]: createAttackHandler(COMBAT_TUNING, ATTACK_DEPS),
  [MOVE]: createMoveHandler(
    createOverwatchReaction(COMBAT_TUNING, ATTACK_DEPS),
  ),
};

/** The shipped swarmer through the shipped bug phase. */
const runPhase = createBugPhaseRunner({
  handlers: HANDLERS,
  registry: new MapBehaviourRegistry([new SwarmerBehaviour()]),
  speciesOf: createSpeciesLookup(BUG_SPECIES),
  combat: COMBAT_TUNING,
});

/**
 * The open 8×8 field in the bug phase with a garrison turret standing
 * armed at `turretAt` on `hp` hit points, a squad at `squadAt`, and one
 * swarmer at `bugAt`.
 */
function field(
  turretAt: TileCoord,
  squadAt: TileCoord,
  bugAt: TileCoord,
  hp = 30,
): { mission: TacticalState; turret: Unit } {
  const built = turretUnit(
    GARRISON_TURRET_TUNING,
    "tdf",
    { pos: turretAt, facing: "e" },
    new SequentialIdGenerator(),
    GARRISON_TURRET_SOURCE_ID,
  );
  const turret: Unit = { ...armTurret(built.unit, GARRISON_TURRET_TUNING), hp };
  const base = missionWith(
    openField().build(),
    [unitAt("squad", "infantry", squadAt), turret],
    { phase: "bugs" },
  );
  const mission = withBug(
    {
      ...base,
      templates: { ...base.templates, [built.template.id]: built.template },
    },
    SWARMER,
    bugAt,
    "swarmer",
  ).mission;
  return { mission, turret };
}

// ===========================================
// Tests
// ===========================================

describe("bugs against turrets (#1155)", () => {
  it("bites the garrison turret beside it when the squad is out of reach, and destroys it", () => {
    const { mission, turret } = field(at(3, 3), at(0, 7), at(4, 3), 1);
    const applied = runPhase(mission, ctxWith(riggedRng(true, "high")));
    const types = applied.events.map((e) => e.type);
    expect(types).toContain(ATTACK_RESOLVED);
    const bite = applied.events.find((e) => e.type === ATTACK_RESOLVED);
    expect(bite?.payload).toMatchObject({
      attackerId: "swarmer",
      targetId: turret.id,
      hit: true,
    });
    expect(types).toContain(TURRET_DESTROYED);
    expect(types).not.toContain(UNIT_DIED);
    const down = applied.state.units.find((u) => u.id === turret.id);
    expect(down?.hp).toBe(0);
    expect(turretDestroyed(down!)).toBe(true);
    // The squad was never touched.
    expect(applied.state.units.find((u) => u.id === "squad")?.hp).toBe(10);
  });

  it("runs at the squad rather than a farther turret, and is shot at by the turret on the way", () => {
    // Squad three tiles east of the bug, turret twelve tiles away by
    // road but within its gun's eight of the run: not the nearest
    // hostile, so it draws no run, and it fires on the runner.
    const { mission, turret } = field(at(6, 6), at(3, 0), at(0, 0));
    const applied = runPhase(mission, ctxWith(riggedRng(true, "high")));
    const moved = applied.events.find((e) => e.type === UNIT_MOVED);
    expect(moved).toBeDefined();
    if (moved?.type !== UNIT_MOVED) return;
    const gap = (a: TileCoord, b: TileCoord) =>
      Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
    const end = moved.payload.path.at(-1)!;
    expect(gap(end, at(3, 0))).toBeLessThan(gap(at(0, 0), at(3, 0)));
    expect(gap(end, turret.pos)).toBeGreaterThan(gap(end, at(3, 0)));
    // The turret on overwatch reacted to the run: shots from the turret, none at it.
    const reactions = applied.events.filter(
      (e) => e.type === ATTACK_RESOLVED && e.payload.attackerId === turret.id,
    );
    expect(reactions.length).toBeGreaterThan(0);
    expect(
      applied.events.some(
        (e) => e.type === ATTACK_RESOLVED && e.payload.targetId === turret.id,
      ),
    ).toBe(false);
  });
});
