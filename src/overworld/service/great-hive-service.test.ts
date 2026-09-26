import { describe, expect, it } from "vitest";

import type { CampaignFlagId } from "../../content/model/campaign-flag-id";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { CONTINENTS } from "../data/continents";
import { EARTH_MAP } from "../data/earth-map";
import { GREAT_HIVE_TUNING } from "../data/great-hive-tuning";
import { HIVE_TUNING } from "../data/hive-tuning";
import { CAMPAIGN_FLAG_SET } from "../model/campaign-flag-set-event";
import { withInfestation } from "../model/city";
import { CITY_INFESTATION_CHANGED } from "../model/city-infestation-changed-event";
import type { ContinentId } from "../model/continent";
import type { GreatHive } from "../model/great-hive";
import { greatHiveTally } from "../model/great-hive";
import { GREAT_HIVE_DESTROYED } from "../model/great-hive-destroyed-event";
import { GREAT_HIVES_REVEALED } from "../model/great-hives-revealed-event";
import type { Hive } from "../model/hive";
import type { OverworldState } from "../model/overworld-state";
import { STORY_RETRY_DAYS } from "../model/story-mission-rule";
import {
  chooseGreatHiveContinents,
  destroyGreatHive,
  GREAT_HIVES_DESTROYED_FLAG,
  isGreatHiveDue,
  recordGreatHiveDefeat,
  revealGreatHives,
} from "./great-hive-service";
import {
  fixtureState,
  progressIn,
} from "./missions/mission-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

/** Act III on the Earth map on `day`, with `flags` and `hives`. */
function earth(
  flags: readonly CampaignFlagId[],
  hives: readonly Hive[] = [],
  day = 200,
): OverworldState {
  return fixtureState({
    day,
    map: EARTH_MAP,
    hives,
    progress: { ...progressIn("act-3", 0), flags },
  });
}

/** An ordinary hive in `regionId`. */
function hiveIn(regionId: string, n: number): Hive {
  return { id: `hive-${String(n)}`, regionId, formedDay: 100 };
}

/** The reveal on `state` with `seed`. */
function reveal(state: OverworldState, seed = 1) {
  return revealGreatHives(
    state,
    state.day,
    new Mulberry32Rng(seed),
    new SequentialIdGenerator(),
    { continents: CONTINENTS, tuning: GREAT_HIVE_TUNING },
  );
}

/** The continents the reveal on `state` with `seed` chose, in order. */
function continentsOf(state: OverworldState, seed: number): ContinentId[] {
  return (reveal(state, seed).state.greatHives ?? []).map((h) => h.continentId);
}

/** `state` with every city of `regionId` at `infestation`. */
function withRegionAt(
  state: OverworldState,
  regionId: string,
  infestation: number,
): OverworldState {
  return {
    ...state,
    map: {
      ...state.map,
      cities: state.map.cities.map((city) =>
        city.regionId === regionId ? withInfestation(city, infestation) : city,
      ),
    },
  };
}

/** The revealed Earth with every city at 50, so liberation has something to cut. */
function revealedAt50(seed = 1): OverworldState {
  let state = earth(["uplink-won"]);
  state = {
    ...state,
    map: {
      ...state.map,
      cities: state.map.cities.map((city) => withInfestation(city, 50)),
    },
  };
  return reveal(state, seed).state;
}

/** The Great Hives of `state`, which must have been revealed. */
function greatHivesOf(state: OverworldState): readonly GreatHive[] {
  if (state.greatHives === undefined) {
    throw new Error("The Great Hives must have been revealed");
  }
  return state.greatHives;
}

// ===========================================
// The reveal
// ===========================================

describe("revealGreatHives", () => {
  it("reveals nothing and draws nothing before Uplink is won", () => {
    const state = earth([]);
    const rng = new Mulberry32Rng(1);
    const before = rng.getState();
    const revealed = revealGreatHives(
      state,
      state.day,
      rng,
      new SequentialIdGenerator(),
      { continents: CONTINENTS, tuning: GREAT_HIVE_TUNING },
    );
    expect(revealed.state).toBe(state);
    expect(revealed.events).toEqual([]);
    expect(rng.getState()).toEqual(before);
  });

  it("reveals three Great Hives on three distinct continents once uplink-won is held", () => {
    const revealed = reveal(earth(["uplink-won"]));
    const hives = greatHivesOf(revealed.state);
    expect(hives).toHaveLength(3);
    expect(new Set(hives.map((h) => h.continentId)).size).toBe(3);
    expect(hives.map((h) => h.id)).toEqual([
      "greathive-1",
      "greathive-2",
      "greathive-3",
    ]);
    for (const hive of hives) {
      const continent = CONTINENTS[hive.continentId];
      expect(hive.name).toBe(continent.name);
      expect(hive.regionIds).toEqual(continent.regionIds);
      expect(continent.regionIds).toContain(hive.regionId);
      expect(hive).toMatchObject({ revealedDay: 200, level: 0 });
      expect(hive.destroyedDay).toBeUndefined();
      expect(hive.retryDay).toBeUndefined();
    }
    expect(revealed.events).toEqual([
      { type: GREAT_HIVES_REVEALED, payload: { greatHives: hives } },
    ]);
  });

  it("is deterministic per seed and varies across seeds", () => {
    const state = earth(["uplink-won"]);
    const draws = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      expect(continentsOf(state, seed)).toEqual(continentsOf(state, seed));
      draws.add(continentsOf(state, seed).join(","));
    }
    expect(draws.size).toBeGreaterThan(3);
  });

  it("lists the chosen continents in map order", () => {
    const order = Object.keys(CONTINENTS);
    for (let seed = 1; seed <= 10; seed++) {
      const chosen = continentsOf(earth(["uplink-won"]), seed);
      const indices = chosen.map((id) => order.indexOf(id));
      expect(indices).toEqual([...indices].sort((a, b) => a - b));
    }
  });

  it("prefers continents without an ordinary hive", () => {
    const hives = [
      hiveIn("north-america-east", 1),
      hiveIn("eastern-europe", 2),
      hiveIn("east-asia", 3),
    ];
    for (let seed = 1; seed <= 10; seed++) {
      expect(continentsOf(earth(["uplink-won"], hives), seed)).toEqual([
        "south-america",
        "africa-middle-east",
        "oceania",
      ]);
    }
  });

  it("falls back to continents holding a hive when too few are free", () => {
    const hives = [
      hiveIn("north-america-west", 1),
      hiveIn("amazon-basin", 2),
      hiveIn("western-europe", 3),
      hiveIn("middle-east", 4),
      hiveIn("south-asia", 5),
    ];
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const chosen = continentsOf(earth(["uplink-won"], hives), seed);
      expect(chosen).toHaveLength(3);
      expect(chosen).toContain("oceania");
      seen.add(chosen.join(","));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("seats each Great Hive in its continent's most infested region", () => {
    const state = withRegionAt(
      withRegionAt(earth(["uplink-won"]), "mediterranean-basin", 70),
      "sub-saharan-africa",
      40,
    );
    for (let seed = 1; seed <= 20; seed++) {
      for (const hive of greatHivesOf(reveal(state, seed).state)) {
        if (hive.continentId === "europe") {
          expect(hive.regionId).toBe("mediterranean-basin");
        }
        if (hive.continentId === "africa-middle-east") {
          expect(hive.regionId).toBe("sub-saharan-africa");
        }
      }
    }
  });

  it("reveals once: a second call changes nothing", () => {
    const once = reveal(earth(["uplink-won"])).state;
    const twice = reveal(once, 2);
    expect(twice.state).toBe(once);
    expect(twice.events).toEqual([]);
  });

  it("refuses to place more Great Hives than there are continents", () => {
    const state = earth(["uplink-won"]);
    expect(() =>
      chooseGreatHiveContinents(state, CONTINENTS, 7, new Mulberry32Rng(1)),
    ).toThrow(RangeError);
  });
});

// ===========================================
// Consequences
// ===========================================

describe("destroyGreatHive", () => {
  it("destroys the Great Hive and liberates every region of its continent", () => {
    const state = revealedAt50();
    const [target] = greatHivesOf(state);
    if (target === undefined) {
      throw new Error("A Great Hive must stand");
    }
    const destroyed = destroyGreatHive(state, target.id, 210, HIVE_TUNING);
    const after = greatHivesOf(destroyed.state).find((h) => h.id === target.id);
    expect(after?.destroyedDay).toBe(210);
    for (const city of destroyed.state.map.cities) {
      const liberated = target.regionIds.includes(city.regionId);
      expect(city.infestation).toBe(liberated ? 30 : 50);
    }
    for (const regionId of target.regionIds) {
      expect(destroyed.state.growthPausedUntil?.[regionId]).toBe(221);
    }
    const cut = destroyed.events.filter(
      (e) => e.type === CITY_INFESTATION_CHANGED,
    );
    const continentCities = state.map.cities.filter((city) =>
      target.regionIds.includes(city.regionId),
    );
    expect(cut).toHaveLength(continentCities.length);
    expect(destroyed.events.at(-1)).toEqual({
      type: GREAT_HIVE_DESTROYED,
      payload: {
        greatHiveId: target.id,
        continentId: target.continentId,
        name: target.name,
        regionIds: target.regionIds,
        pausedUntilDay: 221,
        destroyed: 1,
        total: 3,
      },
    });
    expect(greatHiveTally(destroyed.state)).toEqual({ destroyed: 1, total: 3 });
    expect(destroyed.state.progress.flags).not.toContain(
      GREAT_HIVES_DESTROYED_FLAG,
    );
  });

  it("leaves ordinary hives on the continent standing", () => {
    const state = revealedAt50();
    const [target] = greatHivesOf(state);
    if (target === undefined) {
      throw new Error("A Great Hive must stand");
    }
    const ordinary = hiveIn(target.regionId, 9);
    const destroyed = destroyGreatHive(
      { ...state, hives: [ordinary] },
      target.id,
      210,
      HIVE_TUNING,
    );
    expect(destroyed.state.hives).toEqual([ordinary]);
  });

  it("sets great-hives-destroyed when the third falls, and only then", () => {
    let state = revealedAt50();
    const ids = greatHivesOf(state).map((h) => h.id);
    const flagEvents: number[] = [];
    for (const [n, id] of ids.entries()) {
      const destroyed = destroyGreatHive(state, id, 210 + n, HIVE_TUNING);
      state = destroyed.state;
      flagEvents.push(
        destroyed.events.filter((e) => e.type === CAMPAIGN_FLAG_SET).length,
      );
    }
    expect(flagEvents).toEqual([0, 0, 1]);
    expect(state.progress.flags).toContain(GREAT_HIVES_DESTROYED_FLAG);
    expect(greatHiveTally(state)).toEqual({ destroyed: 3, total: 3 });
  });

  it("changes nothing for a Great Hive already destroyed or unknown", () => {
    const state = revealedAt50();
    const [target] = greatHivesOf(state);
    if (target === undefined) {
      throw new Error("A Great Hive must stand");
    }
    const once = destroyGreatHive(state, target.id, 210, HIVE_TUNING).state;
    const replay = destroyGreatHive(once, target.id, 211, HIVE_TUNING);
    expect(replay.state).toBe(once);
    expect(replay.events).toEqual([]);
    const unknown = destroyGreatHive(state, "greathive-9", 210, HIVE_TUNING);
    expect(unknown.state).toBe(state);
  });
});

describe("recordGreatHiveDefeat", () => {
  it("adds one level up to maxLevel and holds the offer back STORY_RETRY_DAYS", () => {
    let state = revealedAt50();
    const [target] = greatHivesOf(state);
    if (target === undefined) {
      throw new Error("A Great Hive must stand");
    }
    const levels: number[] = [];
    for (let loss = 0; loss < 4; loss++) {
      state = recordGreatHiveDefeat(
        state,
        target.id,
        210 + loss,
        GREAT_HIVE_TUNING,
      );
      const after = greatHivesOf(state).find((h) => h.id === target.id);
      levels.push(after?.level ?? -1);
      expect(after?.retryDay).toBe(210 + loss + STORY_RETRY_DAYS);
      expect(after?.destroyedDay).toBeUndefined();
    }
    expect(levels).toEqual([1, 2, 2, 2]);
  });
});

describe("isGreatHiveDue", () => {
  it("is due while it stands in its act and past any retry day", () => {
    const hive: GreatHive = {
      id: "greathive-1",
      continentId: "oceania",
      name: "Oceania",
      regionId: "oceania",
      regionIds: ["oceania"],
      revealedDay: 200,
      level: 0,
    };
    const act3 = { day: 210, progress: progressIn("act-3") };
    expect(isGreatHiveDue(hive, act3, GREAT_HIVE_TUNING)).toBe(true);
    expect(
      isGreatHiveDue(
        hive,
        { ...act3, progress: progressIn("finale") },
        GREAT_HIVE_TUNING,
      ),
    ).toBe(false);
    expect(
      isGreatHiveDue({ ...hive, retryDay: 211 }, act3, GREAT_HIVE_TUNING),
    ).toBe(false);
    expect(
      isGreatHiveDue({ ...hive, retryDay: 210 }, act3, GREAT_HIVE_TUNING),
    ).toBe(true);
    expect(
      isGreatHiveDue({ ...hive, destroyedDay: 205 }, act3, GREAT_HIVE_TUNING),
    ).toBe(false);
  });
});
