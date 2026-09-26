import { describe, expect, it } from "vitest";

import {
  fieldMap,
  motherMission,
} from "../../../bugs/service/broodmother.test-helper";
import type {
  KillBroodmotherObjective,
  TacticalState,
} from "../../../tactical/model/tactical-state";
import type { Unit } from "../../../tactical/model/unit";
import { unitAt } from "../../../tactical/service/tactical-fixtures.test-helper";
import type { HuntProgress } from "./kill-broodmother-presentation";
import { KILL_BROODMOTHER_PRESENTATION } from "./kill-broodmother-presentation";
import {
  OBJECTIVE_PRESENTATION,
  objectiveProgress,
} from "./objective-presentation";

// ===========================================
// Fixtures
// ===========================================

/** The squad hunting her. */
const SQUAD: Unit = unitAt("squad-1", "infantry", { x: 1, y: 0, z: 1 });

/**
 * A 16×16 field with the squad and Old Scald, a named Broodmother, on
 * `hp`, and the hunt's objective on her.
 */
function hunt(hp?: number): {
  mission: TacticalState;
  mother: Unit;
  objective: KillBroodmotherObjective;
} {
  const placed = motherMission(
    fieldMap(16, 16).build(),
    [SQUAD],
    { x: 7, y: 0, z: 7 },
    { phase: "player", ...(hp === undefined ? {} : { hp }) },
  );
  const mother: Unit = { ...placed.mother, name: "Old Scald" };
  const objective: KillBroodmotherObjective = {
    id: "objective-1",
    kind: "kill-broodmother",
    targetId: mother.id,
    complete: false,
    failed: false,
  };
  return {
    mission: {
      ...placed.mission,
      units: placed.mission.units.map((unit) =>
        unit.id === mother.id ? mother : unit,
      ),
      objectives: [objective],
    },
    mother,
    objective,
  };
}

/** `mission` with her unit changed by `change`. */
function withHer(
  mission: TacticalState,
  motherId: string,
  change: (unit: Unit) => Unit,
): TacticalState {
  return {
    ...mission,
    units: mission.units.map((unit) =>
      unit.id === motherId ? change(unit) : unit,
    ),
  };
}

/** The tracker's row for the hunt on `mission`, through the HUD's own reading. */
function rowOn(mission: TacticalState, objective: KillBroodmotherObjective) {
  const progress = objectiveProgress(mission).get(objective.id) as
    HuntProgress | undefined;
  return KILL_BROODMOTHER_PRESENTATION.row(objective, {
    ordinal: 1,
    spawners: [],
    progress,
  });
}

// ===========================================
// Tests
// ===========================================

describe("KILL_BROODMOTHER_PRESENTATION (campaign arc §6.8, #1179)", () => {
  it("is the table's kill-broodmother entry, and calls her the Broodmother in a sentence", () => {
    const { objective } = hunt();
    expect(OBJECTIVE_PRESENTATION["kill-broodmother"]).toBe(
      KILL_BROODMOTHER_PRESENTATION,
    );
    expect(KILL_BROODMOTHER_PRESENTATION.name(objective, 2)).toBe(
      "the Broodmother",
    );
  });

  it("names her and shows her health under her name while she stands, and says when she runs", () => {
    const { mission, mother, objective } = hunt();
    expect(rowOn(mission, objective)).toEqual({
      icon: "nemesis",
      label: "Kill Old Scald",
      data: { targetId: mother.id },
      layout: "stacked",
      detail: {
        text: `${String(mother.maxHp)} / ${String(mother.maxHp)} hp`,
        role: "broodmother-hp",
      },
    });
    const running = withHer(mission, mother.id, (unit) => ({
      ...unit,
      hp: 20,
      fleeing: true,
    }));
    expect(rowOn(running, objective).detail?.text).toBe(
      `20 / ${String(mother.maxHp)} hp · fleeing`,
    );
  });

  it("reads her dead as done, whatever the objective's stored flag says", () => {
    const { mission, mother, objective } = hunt();
    const dead = withHer(mission, mother.id, (unit) => ({ ...unit, hp: 0 }));
    const row = rowOn(dead, objective);
    expect(row).toMatchObject({ icon: "check", label: "Killed Old Scald" });
    expect(row.detail).toBeUndefined();
  });

  it("says she escaped once she is off the map, by the name she left with", () => {
    const { mission, mother, objective } = hunt();
    const gone: TacticalState = {
      ...mission,
      units: mission.units.filter((unit) => unit.id !== mother.id),
      escaped: [mother],
    };
    expect(rowOn(gone, objective)).toMatchObject({
      icon: "warning",
      label: "Old Scald escaped: she returns stronger",
    });
  });

  it("says she lives when no force is left to kill her", () => {
    const { mission, mother, objective } = hunt();
    const lost: TacticalState = {
      ...mission,
      units: mission.units.filter((unit) => unit.id === mother.id),
    };
    expect(rowOn(lost, objective).label).toBe(
      "Old Scald lives: she returns stronger",
    );
  });

  it("falls back to the stored flags and her title without a reading", () => {
    const { objective } = hunt();
    const row = (stored: KillBroodmotherObjective) =>
      KILL_BROODMOTHER_PRESENTATION.row(stored, {
        ordinal: 1,
        spawners: [],
        progress: undefined,
      }).label;
    expect(row(objective)).toBe("Kill the Broodmother");
    expect(row({ ...objective, complete: true })).toBe(
      "Killed the Broodmother",
    );
    expect(row({ ...objective, failed: true })).toBe(
      "The Broodmother lives: she returns stronger",
    );
  });
});
