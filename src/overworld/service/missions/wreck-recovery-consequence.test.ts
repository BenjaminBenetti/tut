import { describe, expect, it } from "vitest";

import { STARTER_LOADOUT } from "../../../roster/data/starter-roster";
import { createMech } from "../../../roster/service/mech-factory";
import { MISSION_TUNING } from "../../data/mission-tuning";
import type { Mission } from "../../model/mission";
import { wreckOf } from "../wreck-service";
import { MISSION_CONSEQUENCE_RULES } from "./mission-consequence-rules";
import {
  fixtureState,
  missionAt,
  resultFor,
} from "./mission-fixtures.test-helper";
import { WRECK_RECOVERY_CONSEQUENCE } from "./wreck-recovery-consequence";

// ===========================================
// Fixtures
// ===========================================

const CTX = { tuning: MISSION_TUNING };
const LOST = wreckOf(
  createMech(STARTER_LOADOUT, "mech-1", "Hammerhead"),
  missionAt("mid", 9),
  4,
  MISSION_TUNING.wreck.stripTurns,
);
const OTHER = wreckOf(
  createMech(STARTER_LOADOUT, "mech-2", "Anvil"),
  missionAt("low", 9),
  4,
  MISSION_TUNING.wreck.stripTurns,
);

/** The wreck recovery offer for `LOST` at its city. */
const OFFER: Mission = {
  ...missionAt("mid", 8, 0, "wreck-recovery"),
  wreck: LOST,
  rewards: { credits: 0, techPoints: 0, parts: LOST.parts },
};

// ===========================================
// Consequences
// ===========================================

describe("WRECK_RECOVERY_CONSEQUENCE", () => {
  it("is the table's rule for the wreck type", () => {
    expect(MISSION_CONSEQUENCE_RULES["wreck-recovery"]).toBe(
      WRECK_RECOVERY_CONSEQUENCE,
    );
  });

  it("spends the attempt on every outcome, leaves the city alone and says nothing", () => {
    for (const outcome of ["won", "extracted", "lost"] as const) {
      const state = fixtureState({ wrecks: [LOST, OTHER] });
      const applied = WRECK_RECOVERY_CONSEQUENCE.onResolved(
        state,
        OFFER,
        resultFor(OFFER, outcome, -12),
        CTX,
      );
      expect(applied.state.wrecks, outcome).toEqual([OTHER]);
      expect(applied.state.map, outcome).toBe(state.map);
      expect(applied.events, outcome).toEqual([]);
    }
  });

  it("spends the attempt when the offer lapses, at no cost to the city", () => {
    const state = fixtureState({ wrecks: [LOST] });
    const applied = WRECK_RECOVERY_CONSEQUENCE.onExpired(state, OFFER, CTX);
    expect(applied.state.wrecks).toBeUndefined();
    expect(applied.state.map).toBe(state.map);
    expect(applied.events).toEqual([]);
  });

  it("leaves the overworld alone for an offer that carries no wreck", () => {
    const state = fixtureState({ wrecks: [LOST] });
    const bare = missionAt("mid", 8, 0, "wreck-recovery");
    expect(WRECK_RECOVERY_CONSEQUENCE.onExpired(state, bare, CTX).state).toBe(
      state,
    );
  });
});
