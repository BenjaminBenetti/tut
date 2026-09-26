import { describe, expect, it } from "vitest";

import { MISSION_TYPES } from "../../content/data/mission-types";
import { CAMPAIGN_FLAG_IDS } from "../../content/model/campaign-flag-id";
import type { ActId } from "../../content/model/act-id";
import { ACT_IDS } from "../../content/model/act-id";
import { ACTS } from "../../overworld/data/acts";
import { GREAT_HIVE_TUNING } from "../../overworld/data/great-hive-tuning";
import { MISSION_TUNING } from "../../overworld/data/mission-tuning";
import { greatHiveTechPoints } from "../../overworld/service/story/great-hive-pin-trigger";
import { STARTER_PARTS } from "../../roster/data/parts";
import { partIdsOf } from "../model/tech-effect";
import type { TechNode } from "../model/tech-node";
import { NO_TECH_CONDITIONS } from "../model/tech-conditions";
import { TECH_FAMILY_IDS, TECH_NODE_KINDS } from "../model/tech-node";
import { techNodeStatus } from "../service/tech-status-service";
import { CONDITIONAL_TECH_NODES } from "./conditional-tech-tree.test-helper";
import { TECH_FAMILIES } from "./tech-families";
import {
  PHEROMONE_ANALYSIS_COST,
  TECH_NODES,
  TIER_2_COST,
  TIER_3_COST,
} from "./tech-tree";

const NODE_IDS = new Set(TECH_NODES.map((node) => node.id));
const byId = (id: string) => TECH_NODES.find((node) => node.id === id);
/** The ADR 0011 nodes: mech parts, priced by tier. */
const PART_NODES = TECH_NODES.filter((node) => node.kind === "part");

/**
 * The flag invariant of ADR 0013 §2.7 over any tree: every flag a
 * prerequisite needs, the node needs too, so a visible node never names
 * a hidden one as missing. Returns one line per violation.
 */
function flagLeaks(nodes: readonly TechNode[]): string[] {
  const leaks: string[] = [];
  for (const node of nodes) {
    const own = new Set(node.requiresFlags ?? []);
    for (const requiredId of node.requires) {
      const required = nodes.find((n) => n.id === requiredId);
      for (const flag of required?.requiresFlags ?? []) {
        if (!own.has(flag)) {
          leaks.push(
            `${node.id} shows without ${flag} but needs ${requiredId}`,
          );
        }
      }
    }
  }
  return leaks;
}

/**
 * Missions per act on arc §3's fifty-mission campaign, in act order.
 * The Great Hives are the last `GREAT_HIVE_TUNING.count` of Act III's.
 */
const ARC_ACT_MISSIONS: Readonly<Record<ActId, number>> = {
  "act-1": 12,
  "act-2": 20,
  "act-3": 15,
  finale: 3,
};

/**
 * The tech points a campaign has earned after each of arc §3's fifty
 * missions, cumulatively (index 0 is mission 1): each act's missions
 * ramp evenly across its difficulty band, and each is a won
 * Infestation Clearance plus a carcass on the tuned share of maps,
 * except the Great Hives that close Act III, which pay their own award.
 *
 * ```
 *   act-1 ×12  d1 ──► d4   clearance + chance × carcass
 *   act-2 ×20  d3 ──► d7
 *   act-3 ×12  d5 ──► d9,  then 3 Great Hives at their fixed difficulty
 *   finale ×3  d8 ──► d10
 * ```
 */
function campaignIncome(): number[] {
  const clearance = MISSION_TYPES["infestation-clearance"];
  const carcass = MISSION_TUNING.techCarcass;
  const ctx = { tuning: MISSION_TUNING, missionTypes: MISSION_TYPES };
  const earned: number[] = [];
  let total = 0;
  const pay = (points: number): void => {
    total += points;
    earned.push(total);
  };
  for (const act of ACT_IDS) {
    const band = ACTS[act].difficultyBand;
    const hives = act === GREAT_HIVE_TUNING.act ? GREAT_HIVE_TUNING.count : 0;
    const missions = ARC_ACT_MISSIONS[act] - hives;
    for (let i = 0; i < missions; i += 1) {
      const difficulty = Math.round(
        band.min + ((band.max - band.min) * i) / (missions - 1),
      );
      pay(
        clearance.techRewardBase +
          clearance.techRewardPerDifficulty * difficulty +
          carcass.chance *
            (carcass.basePoints + carcass.pointsPerDifficulty * difficulty),
      );
    }
    for (let i = 0; i < hives; i += 1) {
      pay(greatHiveTechPoints(GREAT_HIVE_TUNING.difficulty, ctx));
    }
  }
  return earned;
}

describe("TECH_NODES", () => {
  it("has unique ids, non-empty copy and at least one effect per node", () => {
    expect(NODE_IDS.size).toBe(TECH_NODES.length);
    for (const node of TECH_NODES) {
      expect(node.id).toMatch(/^tech\.[a-z0-9-]+$/);
      expect(node.name.trim()).not.toBe("");
      expect(node.description.trim()).not.toBe("");
      expect(node.effects.length, node.id).toBeGreaterThan(0);
      expect(TECH_NODE_KINDS).toContain(node.kind);
    }
  });

  it("gives a part node only part effects", () => {
    for (const node of PART_NODES) {
      expect(
        node.effects.every((effect) => effect.kind === "part"),
        node.id,
      ).toBe(true);
    }
  });

  it("unlocks every tier 2 and tier 3 part exactly once and no tier 1 part", () => {
    const seen = new Map<string, string>();
    for (const node of TECH_NODES) {
      for (const partId of partIdsOf(node)) {
        expect(seen.get(partId), `${partId} unlocked twice`).toBeUndefined();
        seen.set(partId, node.id);
      }
    }
    for (const part of STARTER_PARTS) {
      if (part.tier === 1) {
        expect(seen.has(part.id), `${part.id} is tier 1`).toBe(false);
      } else {
        expect(seen.has(part.id), `${part.id} has no tech`).toBe(true);
      }
    }
    for (const partId of seen.keys()) {
      expect(
        STARTER_PARTS.some((part) => part.id === partId),
        `${partId} is not in the catalogue`,
      ).toBe(true);
    }
  });

  it("prices each part node by its tier, every node positively, and files it under a real family", () => {
    for (const node of TECH_NODES) {
      expect(Number.isInteger(node.cost) && node.cost > 0, node.id).toBe(true);
      if (node.kind === "part") {
        expect(node.cost, node.id).toBe(
          node.tier === 2 ? TIER_2_COST : TIER_3_COST,
        );
      }
      expect(TECH_FAMILY_IDS).toContain(node.family);
      expect(TECH_FAMILIES[node.family].id).toBe(node.family);
    }
    for (const family of TECH_FAMILY_IDS) {
      expect(TECH_NODES.some((node) => node.family === family)).toBe(true);
    }
  });

  it("gives a part node parts of its own tier", () => {
    for (const node of PART_NODES) {
      for (const partId of partIdsOf(node)) {
        const part = STARTER_PARTS.find((p) => p.id === partId);
        expect(part?.tier, `${partId} in ${node.id}`).toBe(node.tier);
      }
    }
  });

  it("opens every tier 2 part node at once and reaches each tier 3 part node through one node of its family", () => {
    for (const node of PART_NODES) {
      if (node.tier === 2) {
        expect(node.requires).toEqual([]);
        continue;
      }
      expect(node.requires).toHaveLength(1);
      const required = byId(node.requires[0]!);
      expect(required, `${node.id} requires an unknown node`).toBeDefined();
      expect(required?.family).toBe(node.family);
      expect(required?.tier).toBe(2);
    }
  });

  it("names only known nodes as prerequisites, and never in a cycle", () => {
    // Depth-first over `requires`: a node met again while still on the
    // path is a cycle, and a cycle would leave every node on it locked.
    const done = new Set<string>();
    const cycles: string[] = [];
    const visit = (id: string, path: readonly string[]): void => {
      if (path.includes(id)) {
        cycles.push([...path, id].join(" -> "));
        return;
      }
      if (done.has(id)) {
        return;
      }
      for (const requiredId of byId(id)?.requires ?? []) {
        expect(NODE_IDS.has(requiredId), `${id} requires ${requiredId}`).toBe(
          true,
        );
        visit(requiredId, [...path, id]);
      }
      done.add(id);
    };
    for (const node of TECH_NODES) {
      visit(node.id, []);
    }
    expect(cycles).toEqual([]);
    expect(done.size).toBe(TECH_NODES.length);
  });

  it("never shows a node whose prerequisite can still be hidden (ADR 0013 §2.7)", () => {
    expect(flagLeaks(TECH_NODES)).toEqual([]);
    for (const node of TECH_NODES) {
      const flags = node.requiresFlags ?? [];
      expect(new Set(flags).size, node.id).toBe(flags.length);
      for (const flag of flags) {
        expect(flag.trim(), node.id).not.toBe("");
      }
    }
  });

  it("the flag invariant check catches a leak and passes the conditional fixture", () => {
    // The fixture chains two intel nodes the right way round.
    expect(flagLeaks(CONDITIONAL_TECH_NODES)).toEqual([]);
    // Dropping the inherited flag from the child is the leak.
    const leaky = CONDITIONAL_TECH_NODES.map((node) =>
      node.requiresFlags && node.requires.length > 0
        ? { ...node, requiresFlags: node.requiresFlags.slice(1) }
        : node,
    );
    expect(flagLeaks(leaky)).toHaveLength(1);
  });

  it("prices the whole tree at 1.3–1.6× what a campaign earns, and the part nodes at about what it has earned by mission 35 (#1171, campaign arc §10)", () => {
    // The campaign model the tree is paced against (`campaignIncome`):
    // arc §3's fifty missions, each act's difficulty ramping across its
    // band, every one a won clearance with a carcass on the tuned share
    // of maps, and the three Great Hives closing Act III. The campaign
    // sweep measures the modelled players against the same two targets
    // (app/service/campaign-sweep.sim.test.ts); this holds the prices
    // against the income data without playing a campaign.
    const income = campaignIncome();
    const cost = (nodes: readonly TechNode[]): number =>
      nodes.reduce((sum, node) => sum + node.cost, 0);
    const whole = income[income.length - 1] ?? 0;
    // More than a campaign can buy, so research is a real choice, but
    // not so much that most of it is out of reach.
    expect(cost(TECH_NODES) / whole).toBeGreaterThanOrEqual(1.3);
    expect(cost(TECH_NODES) / whole).toBeLessThanOrEqual(1.6);
    // Within a mission or two either way: the income pays for the part
    // nodes close to the 35th mission, not long before and not long after.
    const by35 = income[34] ?? 0;
    expect(cost(PART_NODES)).toBeGreaterThan(by35 * 0.9);
    expect(cost(PART_NODES)).toBeLessThan(by35 * 1.1);
  });
});

describe("Intel I, Pheromone Analysis (#1179, campaign arc §4)", () => {
  const node = byId("tech.pheromone-analysis");
  const rich = { techPoints: 10_000 };
  const fresh = { unlocked: [] };

  it("is an intel node at its retuned price on a real family", () => {
    expect(node?.kind).toBe("intel");
    expect(node?.cost).toBe(PHEROMONE_ANALYSIS_COST);
    // Arc §4's starting price was 180; the campaign retune (arc §12) set
    // 80, so the Average player ends Act I at about mission 13, not 21.
    expect(PHEROMONE_ANALYSIS_COST).toBe(80);
    expect(TECH_FAMILY_IDS).toContain(node?.family);
    expect(node?.requires).toEqual([]);
  });

  it("stays hidden until the spore sample is in hand, then can be bought", () => {
    if (node === undefined) {
      throw new Error("Pheromone Analysis is missing");
    }
    expect(node.requiresFlags).toEqual(["spore-sample"]);
    expect(techNodeStatus(node, fresh, rich, NO_TECH_CONDITIONS)).toBe(
      "hidden",
    );
    expect(
      techNodeStatus(node, fresh, rich, {
        flags: new Set(["capture-net", "hive-core-sample"]),
      }),
    ).toBe("hidden");
    expect(
      techNodeStatus(node, fresh, rich, { flags: new Set(["spore-sample"]) }),
    ).toBe("available");
  });

  it("grants the capture net as squad kit and sets the flag the story pins Live Specimen on", () => {
    expect(node?.effects).toEqual([
      { kind: "infantry-upgrade", upgradeId: "capture-net" },
      { kind: "flag", flag: "capture-net" },
    ]);
    const flags = (node?.effects ?? []).flatMap((effect) =>
      effect.kind === "flag" ? [effect.flag] : [],
    );
    for (const flag of [...flags, ...(node?.requiresFlags ?? [])]) {
      expect(CAMPAIGN_FLAG_IDS as readonly string[]).toContain(flag);
    }
  });

  it("leaves the parts pacing untouched: only part nodes are paced (#1171)", () => {
    expect(PART_NODES.map((n) => n.id)).not.toContain(
      "tech.pheromone-analysis",
    );
  });
});
