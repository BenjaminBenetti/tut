import { describe, expect, it } from "vitest";

import { MISSION_TYPES } from "../../../content/data/mission-types";
import { STARTER_LOADOUT } from "../../../roster/data/starter-roster";
import { createMech } from "../../../roster/service/mech-factory";
import { HIVE_TUNING } from "../../data/hive-tuning";
import { MISSION_TUNING } from "../../data/mission-tuning";
import { isMissionExpired } from "../../model/mission";
import type { OverworldState } from "../../model/overworld-state";
import type { WreckRecoverySpec } from "../../model/wreck-recovery-spec";
import { countsAgainstCap } from "../mission-generation-service";
import { expireMissions } from "../mission-expiry-service";
import { wreckOf } from "../wreck-service";
import { MISSION_CONSEQUENCE_RULES } from "./mission-consequence-rules";
import {
  fixtureState,
  missionAt,
  offerContext,
} from "./mission-fixtures.test-helper";
import { MISSION_OFFER_RULES } from "./mission-offer-rules";
import { WRECK_RECOVERY_TRIGGER } from "./wreck-recovery-trigger";

// ===========================================
// Fixtures
// ===========================================

const LOST_ON = missionAt("mid", 9);

/** The wreck of a starter mech called `name` lost at `cityId` on `lostDay`. */
function wreck(
  mechId: string,
  cityId = "mid",
  lostDay = 4,
  name = "Hammerhead",
): WreckRecoverySpec {
  return wreckOf(
    createMech(STARTER_LOADOUT, mechId, name),
    { ...LOST_ON, cityId },
    lostDay,
    MISSION_TUNING.wreck.stripTurns,
  );
}

/** The fixture overworld on day 5 holding `wrecks`. */
function withWrecks(
  wrecks: readonly WreckRecoverySpec[],
  overrides: Partial<OverworldState> = {},
): OverworldState {
  return fixtureState({ wrecks, ...overrides });
}

// ===========================================
// Trigger
// ===========================================

describe("WRECK_RECOVERY_TRIGGER", () => {
  it("is the table's trigger rule for the wreck type, outside the cap", () => {
    expect(MISSION_OFFER_RULES["wreck-recovery"]).toBe(WRECK_RECOVERY_TRIGGER);
    expect(WRECK_RECOVERY_TRIGGER.kind).toBe("trigger");
    const [offer] = WRECK_RECOVERY_TRIGGER.trigger(
      withWrecks([wreck("mech-1")]),
      offerContext(1),
    );
    expect(offer).toBeDefined();
    if (offer !== undefined) {
      expect(countsAgainstCap(offer, MISSION_OFFER_RULES)).toBe(false);
    }
  });

  it("offers nothing without a recorded wreck", () => {
    expect(
      WRECK_RECOVERY_TRIGGER.trigger(fixtureState(), offerContext(1)),
    ).toEqual([]);
  });

  it("offers one recovery at the city the mech fell in, carrying the wreck and paying its parts", () => {
    const lost = wreck("mech-1");
    const offered = WRECK_RECOVERY_TRIGGER.trigger(
      withWrecks([lost]),
      offerContext(1),
    );
    expect(offered).toHaveLength(1);
    const [offer] = offered;
    expect(offer?.typeId).toBe("wreck-recovery");
    expect(offer?.cityId).toBe("mid");
    expect(offer?.wreck).toEqual(lost);
    expect(offer?.rewards).toEqual({
      credits: 0,
      techPoints: 0,
      parts: lost.parts,
    });
    expect(offer?.pinned).toBeUndefined();
  });

  it("expires exactly three days after the offer, whatever the intel bonus", () => {
    const [offer] = WRECK_RECOVERY_TRIGGER.trigger(
      withWrecks([wreck("mech-1")]),
      offerContext(1, undefined, { east: 4 }),
    );
    expect(MISSION_TYPES["wreck-recovery"].expiryDays).toBe(3);
    expect(offer?.createdDay).toBe(5);
    expect(offer?.expiresDay).toBe(8);
  });

  it("fires once per wreck: a wreck already on offer is not offered again", () => {
    const lost = wreck("mech-1");
    const state = withWrecks([lost]);
    const [first] = WRECK_RECOVERY_TRIGGER.trigger(state, offerContext(1));
    expect(first).toBeDefined();
    if (first === undefined) {
      return;
    }
    // The same wreck on the board, and its city even freed for the test.
    const onBoard = { ...first, cityId: "low" };
    expect(
      WRECK_RECOVERY_TRIGGER.trigger(
        { ...state, day: 6, missions: [onBoard] },
        offerContext(2),
      ),
    ).toEqual([]);
  });

  it("waits while the city holds another offer, then offers inside the window", () => {
    const state = withWrecks([wreck("mech-1")], {
      missions: [missionAt("mid", 20)],
    });
    expect(WRECK_RECOVERY_TRIGGER.trigger(state, offerContext(1))).toEqual([]);
    const freed = { ...state, day: 6, missions: [] };
    expect(WRECK_RECOVERY_TRIGGER.trigger(freed, offerContext(1))).toHaveLength(
      1,
    );
  });

  it("gives up on a wreck whose window passed before its city came free", () => {
    const lostDay = 4;
    const day = lostDay + MISSION_TUNING.wreck.offerWindowDays;
    expect(
      WRECK_RECOVERY_TRIGGER.trigger(
        withWrecks([wreck("mech-1", "mid", lostDay)], { day }),
        offerContext(1),
      ),
    ).toEqual([]);
  });

  it("offers two wrecks lost at two cities, and one of two lost at the same city", () => {
    const apart = WRECK_RECOVERY_TRIGGER.trigger(
      withWrecks([wreck("mech-1", "mid"), wreck("mech-2", "low")]),
      offerContext(1),
    );
    expect(apart.map((offer) => offer.cityId)).toEqual(["mid", "low"]);
    const together = WRECK_RECOVERY_TRIGGER.trigger(
      withWrecks([wreck("mech-1", "mid"), wreck("mech-2", "mid")]),
      offerContext(1),
    );
    expect(together.map((offer) => offer.wreck?.mechId)).toEqual(["mech-1"]);
  });

  it("lapses after three days through the expiry step, spending the attempt", () => {
    const lost = wreck("mech-1");
    const state = withWrecks([lost]);
    const [offer] = WRECK_RECOVERY_TRIGGER.trigger(state, offerContext(1));
    expect(offer).toBeDefined();
    if (offer === undefined) {
      return;
    }
    const onBoard = { ...state, missions: [offer] };
    for (const day of [5, 6, 7]) {
      expect(isMissionExpired(offer, day), `day ${String(day)}`).toBe(false);
    }
    expect(isMissionExpired(offer, 8)).toBe(true);
    const expired = expireMissions(
      { ...onBoard, day: 8 },
      {
        consequences: MISSION_CONSEQUENCE_RULES,
        context: { tuning: MISSION_TUNING, hive: HIVE_TUNING },
      },
    );
    expect(expired.state.missions).toEqual([]);
    expect(expired.state.wrecks).toBeUndefined();
    // Nothing left to offer: the one attempt is spent.
    expect(
      WRECK_RECOVERY_TRIGGER.trigger(
        { ...expired.state, day: 6 },
        offerContext(3),
      ),
    ).toEqual([]);
  });
});
