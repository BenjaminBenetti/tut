import { describe, expect, it } from "vitest";

import { ACTS } from "../../data/acts";
import { INFESTATION_TUNING } from "../../data/infestation-tuning";
import type { EarthMap } from "../../model/earth-map";
import type { OverworldState } from "../../model/overworld-state";
import { getCity } from "../earth-map-query-service";
import {
  boardMap,
  fixtureState,
  missionAt,
  offerContext,
  progressIn,
} from "./mission-fixtures.test-helper";
import { buildOffer } from "./mission-offer-builder";
import { MISSION_OFFER_RULES } from "./mission-offer-rules";
import { createTunnelSabotageOffer } from "./tunnel-sabotage-offer";

// ===========================================
// Fixtures
// ===========================================

const OFFER = createTunnelSabotageOffer(INFESTATION_TUNING);

/** Act II's context: the band is d3–7. */
const CTX = () => offerContext(1, ACTS["act-2"]);

/** An Act II overworld on day 20 over `map`. */
function stateOn(
  map: EarthMap,
  overrides: Partial<OverworldState> = {},
): OverworldState {
  return fixtureState({
    day: 20,
    map,
    progress: progressIn("act-2", 5),
    ...overrides,
  });
}

/** The ids of the eligible sites. */
function eligibleIds(state: OverworldState): readonly string[] {
  return OFFER.eligible(state, CTX()).map((site) => site.cityId);
}

/** `map` with `cityId` undetected. */
function hidden(map: EarthMap, cityId: string): EarthMap {
  return {
    ...map,
    cities: map.cities.map((city) =>
      city.id === cityId ? { ...city, detected: false } : city,
    ),
  };
}

// ===========================================
// Tests
// ===========================================

describe("createTunnelSabotageOffer", () => {
  it("is a director-drawn type from the fifth mission of Act II, in the shipped table", () => {
    expect(OFFER.kind).toBe("offer");
    expect(OFFER.typeId).toBe("tunnel-sabotage");
    expect(OFFER.debut).toEqual({ act: "act-2", missionsInAct: 5 });
    expect(MISSION_OFFER_RULES["tunnel-sabotage"].typeId).toBe(
      "tunnel-sabotage",
    );
  });

  it("is eligible only at the spread threshold (60)", () => {
    // c0..c3 at 30, 59, 60, 80, a chain: each has a neighbour below 100.
    expect(eligibleIds(stateOn(boardMap([30, 59, 60, 80])))).toEqual([
      "c2",
      "c3",
    ]);
  });

  it("is eligible only while the next spread is due within 2 days", () => {
    const map = boardMap([30, 60, 70, 80]);
    const state = stateOn(map, {
      // c1 due tomorrow (1), c2 in two days (2), c3 in three (3).
      spreadCooldowns: { c1: 1, c2: 2, c3: 3 },
    });
    expect(eligibleIds(state)).toEqual(["c1", "c2"]);
    // Off cooldown is due tomorrow.
    expect(eligibleIds(stateOn(map))).toEqual(["c1", "c2", "c3"]);
  });

  it("is eligible only for a detected city", () => {
    const map = hidden(boardMap([30, 60, 80]), "c2");
    expect(eligibleIds(stateOn(map))).toEqual(["c1"]);
  });

  it("skips a city that cannot spread: no neighbour below 100, or its region paused", () => {
    expect(eligibleIds(stateOn(boardMap([100, 100])))).toEqual([]);
    const paused = stateOn(boardMap([30, 80]), {
      growthPausedUntil: { north: 25 },
    });
    expect(eligibleIds(paused)).toEqual([]);
  });

  it("skips a city that already holds an offer, and weights by infestation", () => {
    const state = stateOn(boardMap([30, 60, 80]), {
      missions: [missionAt("c2", 30)],
    });
    expect(OFFER.eligible(state, CTX())).toEqual([
      { cityId: "c1", weight: 60 },
    ]);
  });

  it("creates the clearance-scale offer, lapsing on the day the spread is due", () => {
    // Due tomorrow: the type's own expiry (2 days) would outlast the spread.
    const state = stateOn(boardMap([30, 60, 80]), {
      spreadCooldowns: { c2: 1 },
    });
    const created = OFFER.create(state, { cityId: "c2", weight: 80 }, CTX());
    const plain = buildOffer(
      state,
      getCity(state.map, "c2"),
      "tunnel-sabotage",
      CTX(),
    );
    expect(created).toEqual({
      ...plain,
      expiresDay: 21,
      tunnelSabotage: { cityId: "c2", spreadDueDay: 21 },
    });
    expect(created.rewards.credits).toBe(created.difficulty * 300);
    expect(created.rewards.techPoints).toBe(8 + created.difficulty * 3);
    expect(created.ignorePenalty).toBe(0);
  });
});
