import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { abandonMission } from "../model/abandon-mission-command";
import { MISSION_ENDED } from "../model/mission-ended-event";
import type { TacticalState } from "../model/tactical-state";
import { UNIT_ABANDONED } from "../model/unit-abandoned-event";
import {
  createAbandonMissionHandler,
  leaveMissionSummary,
} from "./abandon-mission-handler";
import {
  ctxWith,
  missionWith,
  openField,
  unitAt,
} from "./tactical-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number) => ({ x, y: 0, z });

/** Two squads and a mech on the field, one squad already aboard, one objective. */
function fieldMission(options: {
  readonly complete?: boolean;
  readonly aboard?: boolean;
  readonly phase?: TacticalState["phase"];
}): TacticalState {
  const alpha = {
    ...unitAt("unit-1", "infantry", at(2, 2)),
    sourceId: "squad-1",
  };
  const bravo = {
    ...unitAt("unit-2", "infantry", at(3, 2)),
    sourceId: "squad-2",
  };
  const mech = { ...unitAt("unit-3", "mech", at(4, 2)), sourceId: "mech-1" };
  const bug = unitAt("bug-1", "infantry", at(8, 8), { team: "bugs" });
  const aboard = options.aboard ?? true;
  return missionWith(
    openField().build(),
    aboard ? [alpha, mech, bug] : [alpha, bravo, mech, bug],
    {
      phase: options.phase ?? "player",
      extracted: aboard ? [bravo] : [],
      objectives: [
        {
          id: "objective-1",
          kind: "destroy-spawner",
          targetId: "spawner-1",
          complete: options.complete ?? false,
        },
      ],
    },
  );
}

const handler = createAbandonMissionHandler();
const ctx = ctxWith(new Mulberry32Rng(1));

// ===========================================
// Summary
// ===========================================

describe("leaveMissionSummary (#1132)", () => {
  it("names the living TDF units still on the map, by roster entry, and counts open objectives", () => {
    const summary = leaveMissionSummary(fieldMission({}));
    expect(summary.leftBehind).toEqual([
      { unitId: "unit-1", sourceId: "squad-1" },
      { unitId: "unit-3", sourceId: "mech-1" },
    ]);
    expect(summary.objectivesOpen).toBe(1);
    expect(summary.outcome).toBe("lost");
    expect(summary.free).toBe(false);
  });

  it("is a win when the job is done and someone is aboard, whoever is left behind", () => {
    const summary = leaveMissionSummary(fieldMission({ complete: true }));
    expect(summary.outcome).toBe("won");
    expect(summary.free).toBe(false);
  });

  it("is lost when the job is done but nobody got out", () => {
    const summary = leaveMissionSummary(
      fieldMission({ complete: true, aboard: false }),
    );
    expect(summary.outcome).toBe("lost");
    expect(summary.leftBehind.map((unit) => unit.unitId)).toEqual([
      "unit-1",
      "unit-2",
      "unit-3",
    ]);
  });

  it("ignores the dead and the bugs", () => {
    const mission = fieldMission({});
    const fallen: TacticalState = {
      ...mission,
      units: mission.units.map((unit) =>
        unit.id === "unit-1" ? { ...unit, hp: 0 } : unit,
      ),
    };
    expect(
      leaveMissionSummary(fallen).leftBehind.map((unit) => unit.unitId),
    ).toEqual(["unit-3"]);
  });

  it("costs nothing once everyone is aboard and every objective is done", () => {
    const mission = fieldMission({ complete: true });
    const clear: TacticalState = {
      ...mission,
      units: mission.units.filter((unit) => unit.team === "bugs"),
      extracted: [
        ...mission.extracted,
        ...mission.units.filter((u) => u.team === "tdf"),
      ],
    };
    const summary = leaveMissionSummary(clear);
    expect(summary.free).toBe(true);
    expect(summary.outcome).toBe("won");
  });
});

// ===========================================
// Handler
// ===========================================

describe("AbandonMission (#1132)", () => {
  it("strands every living TDF unit on the map and records the mission lost with an objective open", () => {
    const mission = fieldMission({});
    const outcome = handler(mission, abandonMission(), ctx);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const { state, events } = outcome.value;
    expect(state.outcome).toBe("lost");
    expect(state.units.find((u) => u.id === "unit-1")?.hp).toBe(0);
    expect(state.units.find((u) => u.id === "unit-3")?.hp).toBe(0);
    // The bug and the unit already aboard are untouched.
    expect(state.units.find((u) => u.id === "bug-1")?.hp).toBeGreaterThan(0);
    expect(state.extracted).toEqual(mission.extracted);
    expect(events.map((e) => e.type)).toEqual([
      UNIT_ABANDONED,
      UNIT_ABANDONED,
      MISSION_ENDED,
    ]);
    expect(events[0]).toEqual({
      type: UNIT_ABANDONED,
      payload: { unitId: "unit-1" },
    });
    expect(events.at(-1)).toEqual({
      type: MISSION_ENDED,
      payload: { outcome: "lost", turn: mission.turn },
    });
    // Pure: the input mission is as it was.
    expect(mission.units.find((u) => u.id === "unit-1")?.hp).toBeGreaterThan(0);
    expect(mission.outcome).toBeUndefined();
  });

  it("records a win when the objectives are done and a unit is aboard, still stranding the rest", () => {
    const outcome = handler(
      fieldMission({ complete: true }),
      abandonMission(),
      ctx,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.state.outcome).toBe("won");
    expect(
      outcome.value.events.filter((e) => e.type === UNIT_ABANDONED),
    ).toHaveLength(2);
  });

  it("ends a mission with nobody left behind at once, with no stranding events", () => {
    const mission = fieldMission({ complete: true });
    const clear: TacticalState = {
      ...mission,
      units: mission.units.filter((unit) => unit.team === "bugs"),
      extracted: [
        ...mission.extracted,
        ...mission.units.filter((u) => u.team === "tdf"),
      ],
    };
    const outcome = handler(clear, abandonMission(), ctx);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.state.outcome).toBe("won");
    expect(outcome.value.events.map((e) => e.type)).toEqual([MISSION_ENDED]);
  });

  it("refuses to leave during the bug phase", () => {
    const outcome = handler(
      fieldMission({ phase: "bugs" }),
      abandonMission(),
      ctx,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toEqual({ kind: "not-player-phase" });
  });
});

// ===========================================
// Defences (#1175)
// ===========================================

describe("leaveMissionSummary on a defence (#1175)", () => {
  /** A squad aboard, one on the field, two generators; `wave` of 3 landed. */
  function defenceMission(options: {
    readonly wave: number;
    readonly generatorsUp?: boolean;
  }): TacticalState {
    const alpha = {
      ...unitAt("unit-1", "infantry", at(2, 2)),
      sourceId: "squad-1",
    };
    const bravo = {
      ...unitAt("unit-2", "infantry", at(3, 2)),
      sourceId: "squad-2",
    };
    const up = options.generatorsUp ?? true;
    const generator = (
      id: string,
      x: number,
    ): TacticalState["units"][number] => ({
      ...unitAt(id, "infantry", at(x, 5), { hp: up ? 40 : 0 }),
      kind: "generator",
      sourceId: "generator",
    });
    return missionWith(
      openField().build(),
      [alpha, generator("gen-1", 4), generator("gen-2", 6)],
      {
        extracted: [bravo],
        edgeSpawn: { nextTurn: 9, wave: options.wave, totalWaves: 3 },
        objectives: [
          {
            id: "objective-1",
            kind: "defend-generators",
            installation: "sensor-array",
            targetIds: ["gen-1", "gen-2"],
            complete: false,
            failed: false,
          },
        ],
      },
    );
  }

  it("never counts a generator as left behind", () => {
    const summary = leaveMissionSummary(defenceMission({ wave: 1 }));
    expect(summary.leftBehind).toEqual([
      { unitId: "unit-1", sourceId: "squad-1" },
    ]);
    expect(summary.objectivesOpen).toBe(1);
    expect(summary.outcome).toBe("lost");
  });

  it("reads the defence live: held through every wave is a win, whatever the stored flag", () => {
    const summary = leaveMissionSummary(defenceMission({ wave: 3 }));
    expect(summary.objectivesOpen).toBe(0);
    expect(summary.outcome).toBe("won");
  });

  it("leaves the generators behind without stranding events when the squad abandons", () => {
    const result = handler(defenceMission({ wave: 1 }), abandonMission(), ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.kind);
    const stranded = result.value.events
      .filter((event) => event.type === UNIT_ABANDONED)
      .map((event) => event.payload.unitId);
    expect(stranded).toEqual(["unit-1"]);
  });
});
