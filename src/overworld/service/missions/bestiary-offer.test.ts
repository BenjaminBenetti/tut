import { describe, expect, it } from "vitest";

import { bugMixFor } from "../../../bugs/service/bestiary-service";
import type { CampaignProgress } from "../../model/campaign-progress";
import type { Mission } from "../../model/mission";
import { createInitialCampaignProgress } from "../campaign-progress-factory";
import { withBugMix } from "./bestiary-offer";

// ===========================================
// Fixtures
// ===========================================

const OFFER: Mission = {
  id: "mission-4",
  typeId: "infestation-clearance",
  cityId: "new-york",
  difficulty: 3,
  mapParams: {
    biome: "temperate",
    settlement: "city",
    size: "medium",
    seed: "mission-4:map",
  },
  rewards: { credits: 900, techPoints: 0 },
  createdDay: 3,
  expiresDay: 8,
  ignorePenalty: 10,
  act: "act-1",
};

/** Progress in `act`, begun after `startedAt` missions, with `played` resolved in all. */
function progressAt(
  act: CampaignProgress["act"],
  startedAt: number,
  played: number,
): CampaignProgress {
  return {
    ...createInitialCampaignProgress(),
    act,
    actStartedAt: startedAt,
    missionsPlayed: played,
  };
}

// ===========================================
// withBugMix
// ===========================================

describe("withBugMix", () => {
  it("stamps the act-1 opening mix on a first offer, leaving the rest of the offer and the input alone", () => {
    const before = structuredClone(OFFER);
    const offer = withBugMix(OFFER, createInitialCampaignProgress());
    expect(offer).toEqual({
      ...OFFER,
      bugMix: {
        swarmer: expect.closeTo(60 / 85, 12) as number,
        lurker: expect.closeTo(25 / 85, 12) as number,
      },
    });
    expect(OFFER).toEqual(before);
    expect(OFFER.bugMix).toBeUndefined();
  });

  it("counts missions played in the current act, not the campaign", () => {
    // Twelve played in all, but the act began at eleven: one in act-2.
    const late = progressAt("act-2", 11, 12);
    expect(withBugMix(OFFER, late).bugMix).toEqual(bugMixFor("act-2", 1));
    // Every shipped debut is in act-1, which normally begins at 0, so
    // the two counts only part when the act began later: eight played
    // in all, two of them in this act, is before the brute's debut.
    const recount = withBugMix(OFFER, progressAt("act-1", 6, 8)).bugMix;
    expect(recount).toEqual(bugMixFor("act-1", 2));
    expect(recount?.brute).toBeUndefined();
    // Act-1 after seven played: the spitter's debut.
    const m8 = withBugMix(OFFER, progressAt("act-1", 0, 7)).bugMix;
    expect(m8).toEqual(bugMixFor("act-1", 7));
    expect(m8?.spitter).toBeCloseTo(0.1, 12);
    // Act-1 after six played: not yet.
    const m7 = withBugMix(OFFER, progressAt("act-1", 0, 6)).bugMix;
    expect(m7?.spitter).toBeUndefined();
    expect(m7?.brute).toBeCloseTo(5 / 90, 12);
  });

  it("keeps a mix the offer already carries", () => {
    const authored: Mission = { ...OFFER, bugMix: { brute: 1 } };
    expect(withBugMix(authored, progressAt("act-1", 0, 9))).toBe(authored);
  });

  it("survives a JSON round trip, as the save stores it", () => {
    const offer = withBugMix(OFFER, progressAt("act-3", 30, 34));
    expect(JSON.parse(JSON.stringify(offer))).toEqual(offer);
  });
});
