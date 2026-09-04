import { describe, expect, it } from "vitest";

import { MISSION_ENDED } from "../model/mission-ended-event";
import type { Objective } from "../model/tactical-state";
import { endIfOver, missionOutcome } from "./mission-end-service";
import { openField, unitAt } from "./tactical-fixtures.test-helper";
import { missionWith } from "./tactical-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

/** A tile on the ground plane. */
const at = (x: number, z: number) => ({ x, y: 0, z });

// ===========================================
// Tests
// ===========================================

describe("missionOutcome", () => {
  const open = [
    { id: "o1", kind: "destroy-spawner", targetId: "s1", complete: false },
  ] as const;
  const done = [
    { id: "o1", kind: "destroy-spawner", targetId: "s1", complete: true },
  ] as const;

  it("is undefined while an objective is open and a TDF unit stands, even with no objectives at all", () => {
    const map = openField().build();
    expect(
      missionOutcome(
        missionWith(map, [unitAt("u", "infantry", at(0, 0))], {
          objectives: open,
        }),
      ),
    ).toBeUndefined();
    expect(
      missionOutcome(missionWith(map, [unitAt("u", "infantry", at(0, 0))])),
    ).toBeUndefined();
  });

  it("is won when every objective is complete, whoever is left standing", () => {
    const map = openField().build();
    expect(
      missionOutcome(
        missionWith(map, [unitAt("u", "infantry", at(0, 0))], {
          objectives: done,
        }),
      ),
    ).toBe("won");
    expect(
      missionOutcome(
        missionWith(map, [unitAt("u", "infantry", at(0, 0), { hp: 0 })], {
          objectives: done,
        }),
      ),
    ).toBe("won");
  });

  it("is lost on a wipe with nobody extracted and extracted once the survivors have left", () => {
    const map = openField().build();
    const bugsOnly = [unitAt("b", "infantry", at(7, 7), { team: "bugs" })];
    expect(
      missionOutcome(missionWith(map, bugsOnly, { objectives: open })),
    ).toBe("lost");
    expect(
      missionOutcome(
        missionWith(map, bugsOnly, {
          objectives: open,
          extracted: [unitAt("u", "infantry", at(0, 0))],
        }),
      ),
    ).toBe("extracted");
    const partly = [unitAt("u", "infantry", at(0, 0)), ...bugsOnly];
    expect(
      missionOutcome(
        missionWith(map, partly, {
          objectives: open,
          extracted: [unitAt("v", "infantry", at(0, 0))],
        }),
      ),
    ).toBeUndefined();
  });
});

describe("endIfOver", () => {
  const done: readonly Objective[] = [
    { id: "o1", kind: "destroy-spawner", targetId: "s1", complete: true },
  ];
  const open: readonly Objective[] = [
    { id: "o1", kind: "destroy-spawner", targetId: "s1", complete: false },
  ];

  it("hands the mission back untouched while it is still being played", () => {
    const mission = missionWith(
      openField().build(),
      [unitAt("u", "infantry", at(0, 0))],
      { objectives: open },
    );
    const applied = endIfOver(mission, [
      { type: MISSION_ENDED, payload: { outcome: "won", turn: 1 } },
    ]);
    expect(applied.state).toBe(mission);
    expect(applied.state.outcome).toBeUndefined();
    expect(applied.events).toHaveLength(1);
  });

  it("records the outcome and announces MissionEnded once a terminal condition holds", () => {
    const mission = missionWith(
      openField().build(),
      [unitAt("u", "infantry", at(0, 0))],
      { objectives: done, turn: 4 },
    );
    const applied = endIfOver(mission, []);
    expect(applied.state.outcome).toBe("won");
    expect(applied.events).toEqual([
      { type: MISSION_ENDED, payload: { outcome: "won", turn: 4 } },
    ]);
  });
});
