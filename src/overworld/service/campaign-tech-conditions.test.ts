import { describe, expect, it } from "vitest";

import type { KillGroup } from "../../bugs/model/kill-group";
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

/** A group of two plated species, like the armoured carapace. */
const PLATED: KillGroup = {
  id: "armoured-carapace",
  members: ["lurker-armoured", "brute-armoured"],
};

/** An autopsy-style node hidden until any plated species dies. */
const PLATED_AUTOPSY: TechNode = {
  ...SPITTER_AUTOPSY,
  id: "tech.fx-plated-autopsy",
  requiresFlags: ["killed:armoured-carapace"],
};

// ===========================================
// Conditions
// ===========================================

describe("campaignTechConditions", () => {
  it("holds the story's flags and a killed:<species> flag per species killed", () => {
    const conditions = campaignTechConditions(
      {
        ...createInitialCampaignProgress(),
        flags: ["spore-sample"],
        speciesKilled: ["swarmer", "spitter"],
      },
      [PLATED],
    );
    expect([...conditions.flags].sort()).toEqual([
      "killed:spitter",
      "killed:swarmer",
      "spore-sample",
    ]);
  });

  it("is empty for a fresh campaign", () => {
    expect(
      campaignTechConditions(createInitialCampaignProgress(), [PLATED]).flags
        .size,
    ).toBe(0);
  });

  it("reveals an autopsy node with the first kill of its species", () => {
    const fresh = createInitialCampaignProgress();
    const node = SPITTER_AUTOPSY;
    expect(isTechNodeHidden(node, campaignTechConditions(fresh, []))).toBe(
      true,
    );
    expect(
      isTechNodeHidden(
        node,
        campaignTechConditions({ ...fresh, speciesKilled: ["swarmer"] }, []),
      ),
    ).toBe(true);
    expect(
      isTechNodeHidden(
        node,
        campaignTechConditions({ ...fresh, speciesKilled: ["spitter"] }, []),
      ),
    ).toBe(false);
  });

  it("sets a group's flag on the first kill of any one member, beside the member's own", () => {
    const fresh = createInitialCampaignProgress();
    expect(
      isTechNodeHidden(PLATED_AUTOPSY, campaignTechConditions(fresh, [PLATED])),
    ).toBe(true);
    expect(
      isTechNodeHidden(
        PLATED_AUTOPSY,
        campaignTechConditions({ ...fresh, speciesKilled: ["swarmer"] }, [
          PLATED,
        ]),
      ),
    ).toBe(true);
    for (const member of PLATED.members) {
      const conditions = campaignTechConditions(
        { ...fresh, speciesKilled: ["swarmer", member] },
        [PLATED],
      );
      expect(isTechNodeHidden(PLATED_AUTOPSY, conditions), member).toBe(false);
      expect([...conditions.flags].sort(), member).toEqual(
        [
          "killed:armoured-carapace",
          `killed:${member}`,
          "killed:swarmer",
        ].sort(),
      );
    }
  });

  it("sets a group's flag once, however many of its members have died", () => {
    const conditions = campaignTechConditions(
      {
        ...createInitialCampaignProgress(),
        speciesKilled: ["lurker-armoured", "brute-armoured"],
      },
      [PLATED],
    );
    expect(
      [...conditions.flags].filter(
        (flag) => flag === "killed:armoured-carapace",
      ),
    ).toHaveLength(1);
  });
});
