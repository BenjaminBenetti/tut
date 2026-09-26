import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { ACTS } from "../../data/acts";
import { CONTINENTS } from "../../data/continents";
import { EARTH_MAP } from "../../data/earth-map";
import { GREAT_HIVE_TUNING } from "../../data/great-hive-tuning";
import { HIVE_TUNING } from "../../data/hive-tuning";
import { MISSION_TUNING } from "../../data/mission-tuning";
import { withInfestation } from "../../model/city";
import { CITY_INFESTATION_CHANGED } from "../../model/city-infestation-changed-event";
import type { GreatHive } from "../../model/great-hive";
import { GREAT_HIVE_DESTROYED } from "../../model/great-hive-destroyed-event";
import type { Mission } from "../../model/mission";
import type { MissionConsequenceContext } from "../../model/mission-consequence-rule";
import type { MissionOutcome } from "../../model/mission-result";
import type { OverworldState } from "../../model/overworld-state";
import { STORY_RETRY_DAYS } from "../../model/story-mission-rule";
import { revealGreatHives } from "../great-hive-service";
import { GREAT_HIVE_PIN_TRIGGER } from "../story/great-hive-pin-trigger";
import { pinContext } from "../story/story-fixtures.test-helper";
import { withGreatHiveConsequences } from "./great-hive-consequence";
import { HIVE_ASSAULT_CONSEQUENCE } from "./hive-assault-consequence";
import { MISSION_CONSEQUENCE_RULES } from "./mission-consequence-rules";
import {
  fixtureState,
  missionAt,
  progressIn,
  resultFor,
} from "./mission-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

const CTX: MissionConsequenceContext = {
  tuning: MISSION_TUNING,
  hive: HIVE_TUNING,
};

/** Act III on the Earth map, every city at 50, the Great Hives revealed and offered. */
function offered(): { state: OverworldState; offers: readonly Mission[] } {
  const base = fixtureState({
    day: 200,
    map: {
      ...EARTH_MAP,
      cities: EARTH_MAP.cities.map((city) => withInfestation(city, 50)),
    },
    progress: { ...progressIn("act-3", 0), flags: ["uplink-won"] },
  });
  const state = revealGreatHives(
    base,
    base.day,
    new Mulberry32Rng(1),
    new SequentialIdGenerator(),
    { continents: CONTINENTS, tuning: GREAT_HIVE_TUNING },
  ).state;
  const offers = GREAT_HIVE_PIN_TRIGGER.pin(
    state,
    pinContext(1, ACTS["act-3"]),
  );
  return { state, offers };
}

/** The Great Hive `offer` assaults. */
function hiveOf(state: OverworldState, offer: Mission): GreatHive {
  const hive = state.greatHives?.find((h) => h.id === offer.hive?.hiveId);
  if (hive === undefined) {
    throw new Error("The offer names a Great Hive");
  }
  return hive;
}

/** The first Great Hive offer. */
function firstOffer(offers: readonly Mission[]): Mission {
  const [offer] = offers;
  if (offer === undefined) {
    throw new Error("A Great Hive offer is pinned");
  }
  return offer;
}

/** `offer` played to `outcome` through the shipped table's rule. */
function play(state: OverworldState, offer: Mission, outcome: MissionOutcome) {
  const delta = outcome === "won" ? -10 : outcome === "lost" ? 5 : 0;
  return MISSION_CONSEQUENCE_RULES["hive-assault"].onResolved(
    state,
    offer,
    resultFor(offer, outcome, delta),
    CTX,
  );
}

// ===========================================
// The decorator
// ===========================================

describe("withGreatHiveConsequences", () => {
  it("is what the shipped table runs for hive-assault", () => {
    const { state, offers } = offered();
    const offer = firstOffer(offers);
    const direct = withGreatHiveConsequences(
      HIVE_ASSAULT_CONSEQUENCE,
    ).onResolved(state, offer, resultFor(offer, "won", -10), CTX);
    expect(play(state, offer, "won")).toEqual(direct);
  });

  it("a win moves the host city, destroys the Great Hive and liberates its continent", () => {
    const { state, offers } = offered();
    const offer = firstOffer(offers);
    const hive = hiveOf(state, offer);
    const won = play(state, offer, "won");
    expect(hiveOf(won.state, offer).destroyedDay).toBe(200);
    expect(hiveOf(won.state, offer).lastAssaultId).toBe(offer.id);
    for (const city of won.state.map.cities) {
      const onContinent = hive.regionIds.includes(city.regionId);
      const expected = city.id === offer.cityId ? 20 : onContinent ? 30 : 50;
      expect(city.infestation, city.id).toBe(expected);
    }
    const destroyed = won.events.filter((e) => e.type === GREAT_HIVE_DESTROYED);
    expect(destroyed).toHaveLength(1);
    expect(destroyed[0]?.payload).toMatchObject({
      greatHiveId: hive.id,
      destroyed: 1,
      total: 3,
    });
    expect(
      won.events.filter((e) => e.type === CITY_INFESTATION_CHANGED).length,
    ).toBeGreaterThan(1);
  });

  it.each(["lost", "extracted"] as const)(
    "a %s assault leaves the Great Hive standing a level up, held back STORY_RETRY_DAYS",
    (outcome) => {
      const { state, offers } = offered();
      const offer = firstOffer(offers);
      const played = play(state, offer, outcome);
      const hive = hiveOf(played.state, offer);
      expect(hive.destroyedDay).toBeUndefined();
      expect(hive.level).toBe(1);
      expect(hive.retryDay).toBe(200 + STORY_RETRY_DAYS);
      expect(hive.lastAssaultId).toBe(offer.id);
      expect(played.events.some((e) => e.type === GREAT_HIVE_DESTROYED)).toBe(
        false,
      );
    },
  );

  it("passes an ordinary Hive Assault through untouched", () => {
    const { state } = offered();
    const ordinary: Mission = {
      ...missionAt("london", 300, 0, "hive-assault"),
      pinned: true,
      hive: { hiveId: "hive-1", regionId: "western-europe", level: 1 },
    };
    const withHive: OverworldState = {
      ...state,
      hives: [{ id: "hive-1", regionId: "western-europe", formedDay: 150 }],
    };
    for (const outcome of ["won", "lost"] as const) {
      const result = resultFor(ordinary, outcome, -10);
      expect(
        MISSION_CONSEQUENCE_RULES["hive-assault"].onResolved(
          withHive,
          ordinary,
          result,
          CTX,
        ),
      ).toEqual(
        HIVE_ASSAULT_CONSEQUENCE.onResolved(withHive, ordinary, result, CTX),
      );
    }
  });
});
