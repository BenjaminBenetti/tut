import { describe, expect, it } from "vitest";

import type { TechNode } from "../../tech/model/tech-node";
import { isTechNodeHidden } from "../../tech/service/tech-status-service";
import { campaignTechConditions } from "./campaign-tech-conditions";
import { createInitialCampaignProgress } from "./campaign-progress-factory";

// ===========================================
// Fixtures
// ===========================================

/** An autopsy-style node hidden until the first spitter dies. */
const SPITTER_AUTOPSY: TechNode = {
  id: "tech.fx-spitter-autopsy",
  name: "Spitter Autopsy",
  description: "What the first spitter was made of.",
  family: "support",
  kind: "story",
  tier: 2,
  cost: 40,
  requires: [],
  requiresFlags: ["killed:spitter"],
  effects: [],
};

// ===========================================
// Conditions
// ===========================================

describe("campaignTechConditions", () => {
  it("holds the story's flags and a killed:<species> flag per species killed", () => {
    const conditions = campaignTechConditions({
      ...createInitialCampaignProgress(),
      flags: ["spore-sample"],
      speciesKilled: ["swarmer", "spitter"],
    });
    expect([...conditions.flags].sort()).toEqual([
      "killed:spitter",
      "killed:swarmer",
      "spore-sample",
    ]);
  });

  it("is empty for a fresh campaign", () => {
    expect(
      campaignTechConditions(createInitialCampaignProgress()).flags.size,
    ).toBe(0);
  });

  it("reveals an autopsy node with the first kill of its species", () => {
    const fresh = createInitialCampaignProgress();
    const node = SPITTER_AUTOPSY;
    expect(isTechNodeHidden(node, campaignTechConditions(fresh))).toBe(true);
    expect(
      isTechNodeHidden(
        node,
        campaignTechConditions({ ...fresh, speciesKilled: ["swarmer"] }),
      ),
    ).toBe(true);
    expect(
      isTechNodeHidden(
        node,
        campaignTechConditions({ ...fresh, speciesKilled: ["spitter"] }),
      ),
    ).toBe(false);
  });
});
