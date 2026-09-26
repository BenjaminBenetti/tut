import { describe, expect, it } from "vitest";

import { CAMPAIGN_FLAG_IDS, isCampaignFlagId } from "./campaign-flag-id";

describe("CAMPAIGN_FLAG_IDS", () => {
  it("lists each id once", () => {
    expect(new Set(CAMPAIGN_FLAG_IDS).size).toBe(CAMPAIGN_FLAG_IDS.length);
  });
});

describe("isCampaignFlagId", () => {
  it("accepts every listed flag and nothing else", () => {
    for (const flag of CAMPAIGN_FLAG_IDS) {
      expect(isCampaignFlagId(flag)).toBe(true);
    }
    expect(isCampaignFlagId("killed:spitter")).toBe(false);
    expect(isCampaignFlagId("")).toBe(false);
  });
});
