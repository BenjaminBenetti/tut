import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { reload } from "../model/reload-command";
import type { TacticalContext } from "../model/tactical-handler";
import type { TacticalState } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import { UNIT_RELOADED } from "../model/unit-reloaded-event";
import type { UnitTemplate } from "../model/unit-template";
import { RELOAD_AP_COST, reloadHandler } from "./reload-handler";

const TEMPLATES: Record<string, UnitTemplate> = {
  rifle: template("rifle", 3),
  swarmer: template("swarmer", undefined),
};

function template(id: string, charges: number | undefined): UnitTemplate {
  return {
    id,
    name: id,
    maxHp: 20,
    maxAp: 2,
    move: 5,
    weapon: { range: 8, accuracy: 65, damage: 10, armorPen: 0 },
    armor: 0,
    passClass: "infantry",
    modelId: "tdf.infantry.rifle",
    ...(charges === undefined ? {} : { charges }),
  };
}

function unit(
  id: string,
  team: "tdf" | "bugs",
  templateId: string,
  overrides: Partial<Unit> = {},
): Unit {
  return {
    id,
    kind: team === "tdf" ? "squad" : "bug",
    team,
    sourceId: id,
    templateId,
    pos: { x: 1, y: 0, z: 1 },
    facing: "n",
    hp: 20,
    maxHp: 20,
    ap: 2,
    maxAp: 2,
    status: [],
    passClass: "infantry",
    ...overrides,
  };
}

function mission(
  units: Unit[],
  phase: TacticalState["phase"] = "player",
): TacticalState {
  return {
    missionId: "mission-1",
    seed: 1,
    map: new FixtureMapBuilder(4, 4, 1).fillGround().build(),
    units,
    templates: TEMPLATES,
    difficulty: 1,
    threat: 0,
    turn: 1,
    phase,
    objectives: [],
    spawners: [],
    edgeSpawn: { nextTurn: 3, wave: 0 },
    extraction: [],
    extracted: [],
    log: [],
  };
}

const ctx: TacticalContext = {
  rng: new Mulberry32Rng(1),
  ids: new SequentialIdGenerator(),
};

describe("reloadHandler", () => {
  it("refills the pool for one action and emits UnitReloaded", () => {
    const m = mission([unit("s1", "tdf", "rifle", { charges: 0 })]);
    const result = reloadHandler(m, reload("s1"), ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state.units[0]).toMatchObject({
      ap: 2 - RELOAD_AP_COST,
      charges: 3,
    });
    expect(result.value.events).toEqual([
      { type: UNIT_RELOADED, payload: { unitId: "s1", charges: 3 } },
    ]);
    expect(m.units[0]?.charges).toBe(0);
  });

  it.each([
    [
      "unknown unit",
      [unit("s1", "tdf", "rifle", { charges: 1 })],
      "ghost",
      "player",
      "unit-not-on-map",
    ],
    [
      "dead unit",
      [unit("s1", "tdf", "rifle", { charges: 1, hp: 0 })],
      "s1",
      "player",
      "unit-dead",
    ],
    [
      "wrong phase",
      [unit("s1", "tdf", "rifle", { charges: 1 })],
      "s1",
      "bugs",
      "wrong-phase",
    ],
    [
      "no action points",
      [unit("s1", "tdf", "rifle", { charges: 1, ap: 0 })],
      "s1",
      "player",
      "no-action-points",
    ],
    [
      "already full",
      [unit("s1", "tdf", "rifle", { charges: 3 })],
      "s1",
      "player",
      "charges-full",
    ],
    ["no pool", [unit("b1", "bugs", "swarmer")], "b1", "bugs", "no-reload"],
  ] as const)("refuses %s", (_name, units, id, phase, kind) => {
    const result = reloadHandler(mission([...units], phase), reload(id), ctx);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe(kind);
  });
});
