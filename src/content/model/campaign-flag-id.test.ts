import { describe, expect, it } from "vitest";

import { CAMPAIGN_FLAG_IDS } from "./campaign-flag-id";

describe("CAMPAIGN_FLAG_IDS", () => {
  it("lists each id once", () => {
    expect(new Set(CAMPAIGN_FLAG_IDS).size).toBe(CAMPAIGN_FLAG_IDS.length);
  });
});
