import { describe, expect, it } from "vitest";

import { isMissionExpired } from "../../model/mission";
import type { OverworldState } from "../../model/overworld-state";
import {
  boardMap,
  fixtureState,
  missionAt,
  offerContext,
} from "../missions/mission-fixtures.test-helper";
import {
  buildStoryDefenceOffer,
  storyDefenceCity,
} from "./story-defence-offer";
import { pinContext } from "./story-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

/**
 * The fixture overworld (west: clean 0 undetected, low 10; east: mid 50,
 * full 100) with a hive in each of `hiveRegions`.
 */
function withHives(hiveRegions: readonly string[]): OverworldState {
  return fixtureState({
    hives: hiveRegions.map((regionId, index) => ({
      id: `hive-${String(index + 1)}`,
      regionId,
      formedDay: 1,
    })),
  });
}

/** `state` with an ordinary offer on each of `cityIds`. */
function occupied(
  state: OverworldState,
  cityIds: readonly string[],
): OverworldState {
  return { ...state, missions: cityIds.map((id) => missionAt(id, 30)) };
}

/** `storyDefenceCity` as the shipped director asks it: only ordinary offers may be taken. */
function siteOf(state: OverworldState) {
  return storyDefenceCity(state, pinContext(1));
}

// ===========================================
// The offer
// ===========================================

describe("buildStoryDefenceOffer", () => {
  it("is a pinned story defend-installation of the story facility, with its compound's generators and no deployable", () => {
    const state = fixtureState();
    const city = state.map.cities[1];
    if (city === undefined) {
      throw new Error("fixture map has cities");
    }
    const offer = buildStoryDefenceOffer(
      state,
      city,
      {
        storyId: "uplink",
        difficulty: 6,
        act: "act-3",
        site: "tracking-array",
        waves: 5,
      },
      offerContext(1),
    );
    expect(offer).toMatchObject({
      typeId: "defend-installation",
      cityId: city.id,
      storyId: "uplink",
      pinned: true,
      difficulty: 6,
      act: "act-3",
    });
    expect(offer.defence).toEqual({
      installation: "tracking-array",
      generators: 2,
      waves: 5,
    });
    expect(isMissionExpired(offer, offer.expiresDay + 1000)).toBe(false);

    const launch = buildStoryDefenceOffer(
      state,
      city,
      {
        storyId: "launch-window",
        difficulty: 8,
        act: "act-3",
        site: "launch-site",
        waves: 7,
      },
      offerContext(1),
    );
    expect(launch.defence).toEqual({
      installation: "launch-site",
      generators: 4,
      waves: 7,
    });
  });
});

// ===========================================
// The site
// ===========================================

describe("storyDefenceCity", () => {
  it("takes the least infested detected city in a region without a hive", () => {
    // No hives: low (10) beats mid and full; clean is undetected.
    expect(siteOf(withHives([]))?.id).toBe("low");
    // West hives: east's mid (50) is the quietest unhived ground.
    expect(siteOf(withHives(["west"]))?.id).toBe("mid");
  });

  it("falls back to the least infested detected city when every region hives", () => {
    expect(siteOf(withHives(["west", "east"]))?.id).toBe("low");
  });

  it("skips cities holding an offer, and lands anywhere free when nothing detected is", () => {
    expect(siteOf(occupied(withHives([]), ["low"]))?.id).toBe("mid");
    const blind = occupied(withHives([]), ["low", "mid", "full"]);
    expect(siteOf(blind)?.id).toBe("clean");
  });

  it("with every city holding an offer, takes the quietest ordinary offer's city, never a pinned or triggered one's (#1179)", () => {
    const crowded = occupied(withHives([]), ["clean", "low", "mid", "full"]);
    expect(siteOf(crowded)?.id).toBe("low");
    // low holds a Defend Installation and mid a pinned offer: of the
    // ordinary offers left, full is detected and clean is not.
    const guarded: OverworldState = {
      ...crowded,
      missions: [
        missionAt("clean", 30),
        missionAt("low", 30, 10, "defend-installation"),
        { ...missionAt("mid", 30), pinned: true },
        missionAt("full", 30),
      ],
    };
    expect(siteOf(guarded)?.id).toBe("full");
    const locked: OverworldState = {
      ...guarded,
      missions: guarded.missions.map((mission) => ({
        ...mission,
        pinned: true,
      })),
    };
    expect(siteOf(locked)).toBeUndefined();
  });

  it("breaks a tie by map order", () => {
    const state = fixtureState({ map: boardMap([30, 20, 20]) });
    expect(siteOf(state)?.id).toBe("c1");
  });
});
