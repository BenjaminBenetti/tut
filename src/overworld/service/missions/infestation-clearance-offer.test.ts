import { describe, expect, it } from "vitest";

import { ACTS } from "../../data/acts";
import type { EarthMap } from "../../model/earth-map";
import { getCity } from "../earth-map-query-service";
import { INFESTATION_CLEARANCE_OFFER } from "./infestation-clearance-offer";
import {
  boardMap,
  fixtureState,
  missionAt,
  offerContext,
  progressIn,
} from "./mission-fixtures.test-helper";
import { buildOffer } from "./mission-offer-builder";

describe("INFESTATION_CLEARANCE_OFFER", () => {
  it("is a director-drawn type there from the first day", () => {
    expect(INFESTATION_CLEARANCE_OFFER.kind).toBe("offer");
    expect(INFESTATION_CLEARANCE_OFFER.typeId).toBe("infestation-clearance");
    expect(INFESTATION_CLEARANCE_OFFER.debut).toEqual({
      act: "act-1",
      missionsInAct: 0,
    });
  });

  it("is eligible at a detected city from 10 in Act I and from 20 after (arc §6.1)", () => {
    // c0..c4 at 0, 9, 10, 19, 20: c0 is clean and so undetected.
    const map = boardMap([0, 9, 10, 19, 20]);
    const sitesIn = (act: "act-1" | "act-2" | "act-3") =>
      INFESTATION_CLEARANCE_OFFER.eligible(
        fixtureState({ map, progress: progressIn(act) }),
        offerContext(1, ACTS[act]),
      ).map((site) => site.cityId);
    expect(sitesIn("act-1")).toEqual(["c2", "c3", "c4"]);
    expect(sitesIn("act-2")).toEqual(["c4"]);
    expect(sitesIn("act-3")).toEqual(["c4"]);
  });

  it("weights each site by its city's infestation", () => {
    const sites = INFESTATION_CLEARANCE_OFFER.eligible(
      fixtureState({ map: boardMap([20, 80]) }),
      offerContext(1, ACTS["act-1"]),
    );
    expect(sites).toEqual([
      { cityId: "c0", weight: 20 },
      { cityId: "c1", weight: 80 },
    ]);
  });

  it("skips a city the player has not detected, however infested (GDD §5.3)", () => {
    const map = withHiddenCity("mid");
    const sites = INFESTATION_CLEARANCE_OFFER.eligible(
      fixtureState({ map }),
      offerContext(1, ACTS["act-1"]),
    );
    expect(sites.map((site) => site.cityId)).toEqual(["low", "full"]);
  });

  it("skips a city that already holds an offer", () => {
    const sites = INFESTATION_CLEARANCE_OFFER.eligible(
      fixtureState({ missions: [missionAt("mid", 20)] }),
      offerContext(1, ACTS["act-1"]),
    );
    expect(sites.map((site) => site.cityId)).toEqual(["low", "full"]);
  });

  it("creates the clearance at the site's city", () => {
    const state = fixtureState();
    const site = { cityId: "full", weight: 100 };
    const created = INFESTATION_CLEARANCE_OFFER.create(
      state,
      site,
      offerContext(4, ACTS["act-1"]),
    );
    expect(created).toEqual(
      buildOffer(
        state,
        getCity(state.map, "full"),
        "infestation-clearance",
        offerContext(4, ACTS["act-1"]),
      ),
    );
    expect(created.cityId).toBe("full");
    expect(created.typeId).toBe("infestation-clearance");
  });
});

/** The fixture map with `cityId` undetected. */
function withHiddenCity(cityId: string): EarthMap {
  const map = fixtureState().map;
  return {
    ...map,
    cities: map.cities.map((city) =>
      city.id === cityId ? { ...city, detected: false } : city,
    ),
  };
}
