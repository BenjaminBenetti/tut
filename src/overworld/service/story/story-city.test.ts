import { describe, expect, it } from "vitest";

import type { City } from "../../model/city";
import type { Mission } from "../../model/mission";
import type { OverworldState } from "../../model/overworld-state";
import { countsAgainstCap } from "../mission-generation-service";
import {
  fixtureState,
  missionAt,
} from "../missions/mission-fixtures.test-helper";
import { MISSION_OFFER_RULES } from "../missions/mission-offer-rules";
import type { StoryCityPreference } from "./story-city";
import { pickStoryCity } from "./story-city";

// ===========================================
// Fixtures
// ===========================================

/** The shipped director's answer: ordinary offers only. */
const SHIPPED = {
  displaceable: (mission: Mission) =>
    countsAgainstCap(mission, MISSION_OFFER_RULES),
};

/** The worst of `cities`, the first on a tie: Live Specimen's taste. */
const worst: StoryCityPreference = (cities) =>
  cities.reduce<City | undefined>(
    (found, city) =>
      found === undefined || city.infestation > found.infestation
        ? city
        : found,
    undefined,
  );

/** The fixture board (low 10, mid 50, full 100) holding `missions`. */
function board(...missions: readonly Mission[]): OverworldState {
  return fixtureState({ missions });
}

/** The infested fixture cities, in map order: low, mid, full. */
function infested(state: OverworldState): readonly City[] {
  return state.map.cities.filter((city) => city.infestation > 0);
}

/** The city `pickStoryCity` picks on `state` for the infested candidates. */
function picked(state: OverworldState): string | undefined {
  return pickStoryCity(state, SHIPPED, infested(state), worst)?.id;
}

/** A pinned offer on `cityId`: another story mission or a hive. */
function pinnedAt(cityId: string): Mission {
  return { ...missionAt(cityId, 30), pinned: true };
}

// ===========================================
// pickStoryCity
// ===========================================

describe("pickStoryCity (ADR 0013 §2.5, #1179)", () => {
  it("picks among the free candidates by the rule's preference while any is free", () => {
    expect(picked(board())).toBe("full");
    // full and mid hold ordinary offers, low is free: low, not the worst.
    expect(picked(board(missionAt("full", 30), missionAt("mid", 30)))).toBe(
      "low",
    );
  });

  it("takes the preferred candidate holding an ordinary offer when none is free", () => {
    const crowded = board(
      missionAt("low", 30),
      missionAt("mid", 30, 10, "crash-site"),
      missionAt("full", 30),
    );
    expect(picked(crowded)).toBe("full");
  });

  it("never takes a candidate whose offer is pinned or triggered", () => {
    const guarded = board(
      missionAt("low", 30),
      missionAt("mid", 30, 10, "defend-installation"),
      pinnedAt("full"),
    );
    // full is a story offer, mid a defence: low is the only claimable.
    expect(picked(guarded)).toBe("low");
    expect(
      picked(
        board(
          pinnedAt("low"),
          missionAt("mid", 30, 10, "defend-installation"),
          pinnedAt("full"),
        ),
      ),
    ).toBeUndefined();
  });

  it("finds nothing without a candidate", () => {
    const state = board();
    expect(pickStoryCity(state, SHIPPED, [], worst)).toBeUndefined();
  });

  it("asks the director's displaceable, not its own idea of an ordinary offer", () => {
    const crowded = board(
      missionAt("low", 30),
      missionAt("mid", 30),
      missionAt("full", 30),
    );
    const nothing = { displaceable: () => false };
    expect(
      pickStoryCity(crowded, nothing, infested(crowded), worst),
    ).toBeUndefined();
  });
});
