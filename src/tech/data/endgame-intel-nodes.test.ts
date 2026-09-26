import { describe, expect, it } from "vitest";

import { CAMPAIGN_FLAG_IDS } from "../../content/model/campaign-flag-id";
import type { CampaignFlagId } from "../../content/model/campaign-flag-id";
import { NO_TECH_CONDITIONS } from "../model/tech-conditions";
import type { TechNode } from "../model/tech-node";
import { techNodeStatus } from "../service/tech-status-service";
import {
  ENDGAME_INTEL_NODES,
  LAST_HOPE_COST,
  PLATFORM_APPROACH_COST,
} from "./endgame-intel-nodes";
import { PHEROMONE_ANALYSIS_COST, TECH_NODES } from "./tech-tree";

// ===========================================
// Fixtures
// ===========================================

/** The shipped node `id`; throws when the tree lacks it. */
function shipped(id: string): TechNode {
  const node = TECH_NODES.find((n) => n.id === id);
  if (node === undefined) throw new Error(`the tree ships ${id}`);
  return node;
}

const rich = { techPoints: 10_000 };
const fresh = { unlocked: [] };

/** `node`'s status for a campaign holding `flags`, with points to spare. */
function statusWith(node: TechNode, flags: readonly CampaignFlagId[]) {
  return techNodeStatus(node, fresh, rich, { flags: new Set(flags) });
}

/** Every other campaign flag than `flag`: none of them reveals the node. */
function allBut(flag: CampaignFlagId): CampaignFlagId[] {
  return CAMPAIGN_FLAG_IDS.filter((f) => f !== flag);
}

/** The flags `node`'s effects set. */
function flagsSetBy(node: TechNode): string[] {
  return node.effects.flatMap((e) => (e.kind === "flag" ? [e.flag] : []));
}

// ===========================================
// The tree
// ===========================================

describe("ENDGAME_INTEL_NODES", () => {
  it("are in the tree, on the support spoke beside Intel I, with no prerequisite node", () => {
    expect(ENDGAME_INTEL_NODES.map((n) => n.id)).toEqual([
      "tech.platform-approach",
      "tech.last-hope",
    ]);
    const intelOne = shipped("tech.pheromone-analysis");
    for (const node of ENDGAME_INTEL_NODES) {
      expect(TECH_NODES).toContain(node);
      expect(node.family).toBe(intelOne.family);
      expect(node.tier).toBe(intelOne.tier);
      expect(node.requires).toEqual([]);
      for (const flag of [...flagsSetBy(node), ...(node.requiresFlags ?? [])]) {
        expect(CAMPAIGN_FLAG_IDS as readonly string[]).toContain(flag);
      }
    }
  });
});

describe("Intel III, Platform Approach (campaign arc §4)", () => {
  const node = shipped("tech.platform-approach");

  it("is an intel node at 280, dearer than Intel I", () => {
    expect(node.kind).toBe("intel");
    expect(node.cost).toBe(PLATFORM_APPROACH_COST);
    expect(PLATFORM_APPROACH_COST).toBe(280);
    expect(PLATFORM_APPROACH_COST).toBeGreaterThan(PHEROMONE_ANALYSIS_COST);
  });

  it("stays hidden until Uplink is won, then can be bought", () => {
    expect(techNodeStatus(node, fresh, rich, NO_TECH_CONDITIONS)).toBe(
      "hidden",
    );
    expect(statusWith(node, allBut("uplink-won"))).toBe("hidden");
    expect(statusWith(node, ["uplink-won"])).toBe("available");
  });

  it("sets platform-approach, half of Launch Window's pin", () => {
    expect(node.effects).toEqual([{ kind: "flag", flag: "platform-approach" }]);
  });
});

describe("Last Hope (campaign arc §4, D7)", () => {
  const node = shipped("tech.last-hope");

  it("is a story node at about 100", () => {
    expect(node.kind).toBe("story");
    expect(node.cost).toBe(LAST_HOPE_COST);
    expect(LAST_HOPE_COST).toBe(100);
  });

  it("stays hidden until the platform has failed, then can be bought", () => {
    expect(techNodeStatus(node, fresh, rich, NO_TECH_CONDITIONS)).toBe(
      "hidden",
    );
    expect(statusWith(node, allBut("platform-failed"))).toBe("hidden");
    expect(statusWith(node, ["platform-failed"])).toBe("available");
  });

  it("sets last-hope, the flag D7 holds the platform back on", () => {
    expect(node.effects).toEqual([{ kind: "flag", flag: "last-hope" }]);
  });
});
