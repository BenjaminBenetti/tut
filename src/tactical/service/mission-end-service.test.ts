import { describe, expect, it } from "vitest";

import { MISSION_ENDED } from "../model/mission-ended-event";
import type { Objective } from "../model/tactical-state";
import {
  endIfOver,
  forceExtracted,
  missionOutcome,
  objectivesComplete,
} from "./mission-end-service";
import {
  openField,
  unitAt,
  withCivilian,
} from "./tactical-fixtures.test-helper";
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

  it("plays on with every objective complete while a TDF unit still stands: the force has to extract", () => {
    const map = openField().build();
    expect(
      missionOutcome(
        missionWith(map, [unitAt("u", "infantry", at(0, 0))], {
          objectives: done,
        }),
      ),
    ).toBeUndefined();
  });

  it("is won once the objectives are complete and the survivors have extracted", () => {
    const map = openField().build();
    const bugsOnly = [unitAt("b", "infantry", at(7, 7), { team: "bugs" })];
    expect(
      missionOutcome(
        missionWith(map, bugsOnly, {
          objectives: done,
          extracted: [unitAt("u", "infantry", at(0, 0))],
        }),
      ),
    ).toBe("won");
    // Casualties do not undo it: one out is enough to bring the result home.
    expect(
      missionOutcome(
        missionWith(
          map,
          [unitAt("v", "infantry", at(1, 1), { hp: 0 }), ...bugsOnly],
          {
            objectives: done,
            extracted: [unitAt("u", "infantry", at(0, 0))],
          },
        ),
      ),
    ).toBe("won");
    // Nobody out is lost, whatever they finished before they fell.
    expect(
      missionOutcome(
        missionWith(map, [unitAt("u", "infantry", at(0, 0), { hp: 0 })], {
          objectives: done,
        }),
      ),
    ).toBe("lost");
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
      [unitAt("b", "infantry", at(7, 7), { team: "bugs" })],
      {
        objectives: done,
        turn: 4,
        extracted: [unitAt("u", "infantry", at(0, 0))],
      },
    );
    const applied = endIfOver(mission, []);
    expect(applied.state.outcome).toBe("won");
    expect(applied.events).toEqual([
      { type: MISSION_ENDED, payload: { outcome: "won", turn: 4 } },
    ]);
  });
});

describe("missionOutcome with a deployed turret (#1138)", () => {
  it("does not let a turret keep the mission open once the force is gone", () => {
    const map = openField().build();
    const turret = {
      ...unitAt("t", "infantry", at(2, 2)),
      kind: "turret" as const,
      turnsLeft: 3,
    };
    expect(
      missionOutcome(
        missionWith(map, [
          turret,
          unitAt("u", "infantry", at(0, 0), { hp: 0 }),
        ]),
      ),
    ).toBe("lost");
    expect(
      missionOutcome(
        missionWith(map, [turret, unitAt("u", "infantry", at(0, 0))]),
      ),
    ).toBeUndefined();
  });
});

describe("missionOutcome with optional objectives (#1179)", () => {
  const nest = (complete: boolean, optional: boolean): Objective => ({
    id: "o1",
    kind: "destroy-spawner",
    targetId: "s1",
    complete,
    ...(optional ? { optional: true } : {}),
  });
  const specimen = (complete: boolean): Objective => ({
    id: "o2",
    kind: "destroy-spawner",
    targetId: "s2",
    complete,
  });
  const home = (objectives: readonly Objective[]) =>
    missionWith(
      openField().build(),
      [unitAt("b", "infantry", at(7, 7), { team: "bugs" })],
      { objectives, extracted: [unitAt("u", "infantry", at(0, 0))] },
    );

  it("is won with an optional objective still open once every deciding one is done", () => {
    const mission = home([nest(false, true), specimen(true)]);
    expect(missionOutcome(mission)).toBe("won");
    expect(objectivesComplete(mission)).toBe(true);
  });

  it("is extracted with a deciding objective open, whatever the optional ones say", () => {
    const mission = home([nest(true, true), specimen(false)]);
    expect(missionOutcome(mission)).toBe("extracted");
    expect(objectivesComplete(mission)).toBe(false);
  });

  it("is never won when every objective is optional: nothing decides it", () => {
    const mission = home([nest(true, true)]);
    expect(missionOutcome(mission)).toBe("extracted");
    expect(objectivesComplete(mission)).toBe(false);
    // Unmarked, the same objective decides as it always did.
    expect(missionOutcome(home([nest(true, false)]))).toBe("won");
  });
});

describe("missionOutcome with civilian groups (campaign arc §6.4)", () => {
  const map = openField().build();
  const rescue = [
    {
      id: "o1",
      kind: "rescue-civilians",
      groupIds: ["civ-1", "civ-2"],
      complete: false,
      failed: false,
    },
  ] as const;

  it("does not let a group on the map keep the mission open once the force is gone", () => {
    const fallen = withCivilian(
      missionWith(map, [unitAt("u", "infantry", at(0, 0), { hp: 0 })], {
        objectives: rescue,
      }),
      "civ-1",
      at(3, 3),
      { trapped: false },
    );
    expect(missionOutcome(fallen)).toBe("lost");
    expect(
      missionOutcome(
        withCivilian(
          missionWith(map, [unitAt("u", "infantry", at(0, 0))], {
            objectives: rescue,
          }),
          "civ-1",
          at(3, 3),
        ),
      ),
    ).toBeUndefined();
  });

  it("does not count a group aboard as the force coming home", () => {
    const aboard = withCivilian(
      missionWith(map, [], { objectives: rescue }),
      "civ-1",
      at(0, 0),
      { trapped: false },
    );
    const onlyCivilians = {
      ...aboard,
      units: [unitAt("u", "infantry", at(2, 2), { hp: 0 })],
      extracted: aboard.units,
    };
    expect(forceExtracted(onlyCivilians)).toBe(false);
    expect(missionOutcome(onlyCivilians)).toBe("lost");

    const withSquad = {
      ...onlyCivilians,
      units: [],
      extracted: [...aboard.units, unitAt("u", "infantry", at(0, 0))],
    };
    // With the squad home, the same group aboard is half of two: won.
    expect(forceExtracted(withSquad)).toBe(true);
    expect(missionOutcome(withSquad)).toBe("won");
  });

  it("does not let a group keep a crash site open after its pod burst (campaign arc §6.3)", () => {
    // The pod matured (its objective failed) and burst; the squad got
    // home, and a freed group is still walking.
    const burst = withCivilian(
      missionWith(map, [], {
        objectives: [
          {
            id: "o1",
            kind: "destroy-pod",
            targetId: "pod-1",
            deadlineTurn: 8,
            complete: false,
            failed: true,
          },
        ],
      }),
      "civ-1",
      at(3, 3),
      { trapped: false },
    );
    const home = {
      ...burst,
      extracted: [unitAt("u", "infantry", at(0, 0))],
    };
    expect(missionOutcome(home)).toBe("extracted");
    expect(missionOutcome({ ...home, extracted: [] })).toBe("lost");
  });
});
