import { describe, expect, it } from "vitest";

import { ACT_IDS } from "../../content/model/act-id";
import { createInitialCampaignProgress } from "./campaign-progress-factory";

describe("createInitialCampaignProgress", () => {
  it("starts in the first act with nothing played, earned or remembered", () => {
    expect(createInitialCampaignProgress()).toEqual({
      act: ACT_IDS[0],
      actStartedAt: 0,
      missionsPlayed: 0,
      missionsWon: 0,
      flags: [],
      speciesKilled: [],
      nemeses: [],
    });
  });

  it("returns a fresh object each call", () => {
    expect(createInitialCampaignProgress()).not.toBe(
      createInitialCampaignProgress(),
    );
  });
});
