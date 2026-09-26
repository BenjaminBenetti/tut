import { describe, expect, it } from "vitest";

import { CAMPAIGN_FLAG_IDS } from "../../content/model/campaign-flag-id";
import type { CampaignFlagId } from "../../content/model/campaign-flag-id";
import { NO_TECH_CONDITIONS } from "../model/tech-conditions";
import type { TechNode } from "../model/tech-node";
import { techNodeStatus } from "../service/tech-status-service";
import { PLATFORM_APPROACH_COST } from "./endgame-intel-nodes";
import { POD_TELEMETRY_COST, POD_TELEMETRY_NODE } from "./pod-telemetry-node";
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

// ===========================================
// Intel II
// ===========================================

describe("Intel II, Pod Telemetry (campaign arc §4)", () => {
  const node = shipped("tech.pod-telemetry");

  it("is the shipped node, Intel I's twin on the support spoke with no prerequisite node", () => {
    expect(node).toBe(POD_TELEMETRY_NODE);
    const intelOne = shipped("tech.pheromone-analysis");
    expect(node.kind).toBe("intel");
    expect(node.family).toBe(intelOne.family);
    expect(node.tier).toBe(intelOne.tier);
    expect(node.requires).toEqual([]);
  });

  it("costs 240, between Intel I and Intel III, 600 for the three", () => {
    expect(node.cost).toBe(POD_TELEMETRY_COST);
    expect(POD_TELEMETRY_COST).toBe(240);
    expect(PHEROMONE_ANALYSIS_COST).toBeLessThan(POD_TELEMETRY_COST);
    expect(POD_TELEMETRY_COST).toBeLessThan(PLATFORM_APPROACH_COST);
    // Arc C3's 700 was 180 + 240 + 280. The campaign retune (arc §12) cut
    // Intel I to 80; 600 is about 41% of an Average campaign's income,
    // near arc §10's 45%.
    expect(
      PHEROMONE_ANALYSIS_COST + POD_TELEMETRY_COST + PLATFORM_APPROACH_COST,
    ).toBe(600);
  });

  it("stays hidden until the first Hive Assault brings home a core sample", () => {
    expect(techNodeStatus(node, fresh, rich, NO_TECH_CONDITIONS)).toBe(
      "hidden",
    );
    const allBut = CAMPAIGN_FLAG_IDS.filter((f) => f !== "hive-core-sample");
    expect(statusWith(node, allBut)).toBe("hidden");
    expect(statusWith(node, ["hive-core-sample"])).toBe("available");
  });

  it("sets pod-telemetry, the flag Intact Pod pins on, and nothing else", () => {
    expect(node.effects).toEqual([{ kind: "flag", flag: "pod-telemetry" }]);
    expect(CAMPAIGN_FLAG_IDS).toContain("pod-telemetry");
  });
});
