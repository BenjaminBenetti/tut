import { describe, expect, it } from "vitest";

import type {
  DefendGeneratorsObjective,
  DestroySpawnerObjective,
  Spawner,
  TacticalState,
} from "../../../tactical/model/tactical-state";
import { defenceProgress } from "../../../tactical/service/defence-service";
import { ICON_MANIFEST } from "../../data/icon-manifest";
import type { ObjectiveKind } from "../../model/objective-presentation";
import {
  OBJECTIVE_PRESENTATION,
  objectiveProgress,
} from "./objective-presentation";

// ===========================================
// Fixtures
// ===========================================

/**
 * Every objective kind. Keyed by the union, so a new kind cannot join
 * the tactical union without this list (and the table) knowing it.
 */
const KINDS: Readonly<Record<ObjectiveKind, true>> = {
  "destroy-spawner": true,
  "defend-generators": true,
  "destroy-pod": true,
  "capture-specimen": true,
};

const SPAWNER_OBJECTIVE: DestroySpawnerObjective = {
  id: "objective-s",
  kind: "destroy-spawner",
  targetId: "spawner-1",
  complete: false,
};

const DEFENCE_OBJECTIVE: DefendGeneratorsObjective = {
  id: "objective-d",
  kind: "defend-generators",
  installation: "sensor-array",
  targetIds: ["gen-1", "gen-2"],
  complete: false,
  failed: false,
};

const SPAWNER: Spawner = {
  id: "spawner-1",
  pos: { x: 0, y: 0, z: 0 },
  hatchRadius: 3,
  hp: 20,
  timer: 2,
  destroyed: false,
};

/** A defence two waves into three, one generator down, one bug alive. */
const MISSION = {
  objectives: [SPAWNER_OBJECTIVE, DEFENCE_OBJECTIVE],
  units: [
    { id: "gen-1", team: "tdf", hp: 30 },
    { id: "gen-2", team: "tdf", hp: 0 },
    { id: "bug-1", team: "bugs", hp: 5 },
  ],
  spawners: [SPAWNER],
  edgeSpawn: { nextTurn: 5, wave: 2, totalWaves: 3 },
} as unknown as TacticalState;

// ===========================================
// OBJECTIVE_PRESENTATION
// ===========================================

describe("OBJECTIVE_PRESENTATION", () => {
  it("has one entry per objective kind, each keyed by its own kind", () => {
    expect(Object.keys(OBJECTIVE_PRESENTATION).sort()).toEqual(
      Object.keys(KINDS).sort(),
    );
    for (const kind of Object.keys(KINDS) as ObjectiveKind[]) {
      expect(OBJECTIVE_PRESENTATION[kind].kind).toBe(kind);
    }
  });

  it("names a spawner by its ordinal and a defence by what it holds", () => {
    expect(
      OBJECTIVE_PRESENTATION["destroy-spawner"].name(SPAWNER_OBJECTIVE, 2),
    ).toBe("spawner 2");
    expect(
      OBJECTIVE_PRESENTATION["defend-generators"].name(DEFENCE_OBJECTIVE, 1),
    ).toBe("the sensor array");
  });

  it("builds each tracker label on the objective's name, with a registered glyph", () => {
    for (const objective of [SPAWNER_OBJECTIVE, DEFENCE_OBJECTIVE]) {
      const presentation = OBJECTIVE_PRESENTATION[objective.kind];
      const row = presentation.row(objective, {
        ordinal: 3,
        spawners: [SPAWNER],
        progress: undefined,
      });
      expect(row.label).toContain(presentation.name(objective, 3));
      expect(Object.keys(ICON_MANIFEST)).toContain(row.icon);
    }
  });

  it("tracks a spawner's id for refusals that carry it, and nothing for a defence", () => {
    expect(
      OBJECTIVE_PRESENTATION["destroy-spawner"].trackedId?.(SPAWNER_OBJECTIVE),
    ).toBe("spawner-1");
    expect("trackedId" in OBJECTIVE_PRESENTATION["defend-generators"]).toBe(
      false,
    );
  });

  it("shows a standing spawner's hit points beside the label, and none once wrecked", () => {
    const spawner = OBJECTIVE_PRESENTATION["destroy-spawner"];
    expect(
      spawner.row(SPAWNER_OBJECTIVE, {
        ordinal: 1,
        spawners: [SPAWNER],
        progress: undefined,
      }),
    ).toEqual({
      icon: "egg",
      label: "Destroy spawner 1",
      data: { targetId: "spawner-1" },
      layout: "inline",
      detail: { text: "20 hp" },
    });
    expect(
      spawner.row(
        { ...SPAWNER_OBJECTIVE, complete: true },
        {
          ordinal: 1,
          spawners: [{ ...SPAWNER, hp: 0, destroyed: true }],
          progress: undefined,
        },
      ),
    ).toEqual({
      icon: "check",
      label: "Destroyed spawner 1",
      data: { targetId: "spawner-1" },
      layout: "inline",
    });
  });
});

// ===========================================
// objectiveProgress
// ===========================================

describe("objectiveProgress", () => {
  it("reads a defence's live numbers off the mission, and takes nothing for a spawner", () => {
    const readings = objectiveProgress(MISSION);
    expect([...readings.keys()]).toEqual(["objective-d"]);
    expect(readings.get("objective-d")).toEqual(
      defenceProgress(MISSION, DEFENCE_OBJECTIVE),
    );
    expect(readings.get("objective-d")).toMatchObject({
      standing: 1,
      total: 2,
      wave: 2,
      totalWaves: 3,
      bugsLeft: 1,
      status: "open",
    });
  });

  it("hands the defence's own row the reading it took", () => {
    const defence = OBJECTIVE_PRESENTATION["defend-generators"];
    const row = defence.row(DEFENCE_OBJECTIVE, {
      ordinal: 2,
      spawners: [],
      progress: objectiveProgress(MISSION).get("objective-d"),
    });
    expect(row).toEqual({
      icon: "defend",
      label: "Defend the sensor array",
      data: { status: "open", failed: "false" },
      layout: "stacked",
      detail: {
        text: "1 / 2 generators · wave 2 / 3",
        role: "defence-progress",
      },
    });
  });
});
