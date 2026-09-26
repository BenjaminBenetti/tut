import { describe, expect, it } from "vitest";

import { STARTER_LOADOUT } from "../../roster/data/starter-roster";
import type { Mech } from "../../roster/model/mech";
import { createMech } from "../../roster/service/mech-factory";
import { MISSION_TUNING } from "../data/mission-tuning";
import type { MissionOutcome, MissionResult } from "../model/mission-result";
import type { WreckRecoverySpec } from "../model/wreck-recovery-spec";
import {
  fixtureState,
  missionAt,
  resultFor,
} from "./missions/mission-fixtures.test-helper";
import {
  isWreckStale,
  recordWrecks,
  removeWreck,
  wreckOf,
} from "./wreck-service";

// ===========================================
// Fixtures
// ===========================================

const TUNING = MISSION_TUNING.wreck;
const MISSION = missionAt("mid", 9);
const HAMMERHEAD: Mech = createMech(STARTER_LOADOUT, "mech-1", "Hammerhead");
const ANVIL: Mech = createMech(
  { ...STARTER_LOADOUT, utilityIds: ["utility-radiator", "utility-radiator"] },
  "mech-2",
  "Anvil",
);

/** A result for the fixture mission ending in `outcome` with `destroyed` mechs lost. */
function losing(
  outcome: MissionOutcome,
  destroyed: readonly string[],
): MissionResult {
  return { ...resultFor(MISSION, outcome, 0), mechsDestroyed: destroyed };
}

/** A recorded wreck of `mechId` lost on `lostDay`. */
function recorded(mechId: string, lostDay: number): WreckRecoverySpec {
  return {
    ...wreckOf({ ...HAMMERHEAD, id: mechId }, MISSION, lostDay, 2),
  };
}

// ===========================================
// wreckOf
// ===========================================

describe("wreckOf", () => {
  it("pays every fitted part but the chassis, in loadout order, repeats kept (D6)", () => {
    const wreck = wreckOf(ANVIL, MISSION, 5, 2);
    expect(wreck).toEqual({
      mechId: "mech-2",
      mechName: "Anvil",
      chassisId: "chassis-vanguard",
      parts: [
        "legs-strider",
        "arms-manipulator",
        "arm-weapon-autocannon",
        "back-weapon-missile-pod",
        "utility-radiator",
        "utility-radiator",
      ],
      loadout: ANVIL.loadout,
      cityId: "mid",
      missionId: MISSION.id,
      lostDay: 5,
      stripTurns: 2,
    });
    expect(wreck.parts).not.toContain(wreck.chassisId);
  });
});

// ===========================================
// recordWrecks
// ===========================================

describe("recordWrecks", () => {
  it("records a mech destroyed on a lost mission, from the roster as it stood", () => {
    const state = recordWrecks(
      fixtureState(),
      MISSION,
      losing("lost", ["mech-1"]),
      [HAMMERHEAD, ANVIL],
      TUNING,
    );
    expect(state.wrecks).toEqual([
      wreckOf(HAMMERHEAD, MISSION, 5, TUNING.stripTurns),
    ]);
  });

  it("records nothing for a won or extracted mission, even with a mech destroyed", () => {
    for (const outcome of ["won", "extracted"] as const) {
      const before = fixtureState();
      const after = recordWrecks(
        before,
        MISSION,
        losing(outcome, ["mech-1"]),
        [HAMMERHEAD],
        TUNING,
      );
      expect(after, outcome).toBe(before);
      expect(after.wrecks, outcome).toBeUndefined();
    }
  });

  it("records nothing for a lost mission that destroyed no mech", () => {
    const before = fixtureState();
    expect(
      recordWrecks(before, MISSION, losing("lost", []), [HAMMERHEAD], TUNING),
    ).toBe(before);
  });

  it("records one wreck per destroyed mech, in mechsDestroyed order", () => {
    const state = recordWrecks(
      fixtureState(),
      MISSION,
      losing("lost", ["mech-2", "mech-1"]),
      [HAMMERHEAD, ANVIL],
      TUNING,
    );
    expect(state.wrecks?.map((wreck) => wreck.mechName)).toEqual([
      "Anvil",
      "Hammerhead",
    ]);
  });

  it("skips a destroyed mech the roster does not know rather than guessing its parts", () => {
    const before = fixtureState();
    expect(
      recordWrecks(before, MISSION, losing("lost", ["mech-9"]), [], TUNING),
    ).toBe(before);
  });

  it("never records the same mech twice", () => {
    const once = recordWrecks(
      fixtureState(),
      MISSION,
      losing("lost", ["mech-1"]),
      [HAMMERHEAD],
      TUNING,
    );
    const twice = recordWrecks(
      once,
      MISSION,
      losing("lost", ["mech-1"]),
      [HAMMERHEAD],
      TUNING,
    );
    expect(twice.wrecks).toHaveLength(1);
  });

  it("drops records whose offer window has passed, and keeps the rest", () => {
    const state = fixtureState({
      day: 10,
      wrecks: [
        recorded("mech-old", 10 - TUNING.offerWindowDays),
        recorded("mech-new", 10 - TUNING.offerWindowDays + 1),
      ],
    });
    const after = recordWrecks(state, MISSION, losing("won", []), [], TUNING);
    expect(after.wrecks?.map((wreck) => wreck.mechId)).toEqual(["mech-new"]);
  });

  it("drops the field when the last record goes stale", () => {
    const after = recordWrecks(
      fixtureState({ day: 10, wrecks: [recorded("mech-old", 1)] }),
      MISSION,
      losing("won", []),
      [],
      TUNING,
    );
    expect("wrecks" in after).toBe(false);
  });
});

// ===========================================
// removeWreck and isWreckStale
// ===========================================

describe("removeWreck", () => {
  it("removes the record of that mech only", () => {
    const state = fixtureState({
      wrecks: [recorded("mech-1", 5), recorded("mech-2", 5)],
    });
    expect(
      removeWreck(state, "mech-1").wrecks?.map((wreck) => wreck.mechId),
    ).toEqual(["mech-2"]);
  });

  it("hands the state back untouched when there is no such record", () => {
    const state = fixtureState({ wrecks: [recorded("mech-1", 5)] });
    expect(removeWreck(state, "mech-9")).toBe(state);
  });
});

describe("isWreckStale", () => {
  it("is stale from lostDay + offerWindowDays on", () => {
    const wreck = recorded("mech-1", 5);
    const last = 5 + TUNING.offerWindowDays - 1;
    expect(isWreckStale(wreck, last, TUNING)).toBe(false);
    expect(isWreckStale(wreck, last + 1, TUNING)).toBe(true);
  });
});
