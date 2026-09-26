import { describe, expect, it } from "vitest";

import { MISSION_TYPES } from "../../content/data/mission-types";
import { MISSION_TUNING } from "../../overworld/data/mission-tuning";
import { STARTER_PARTS } from "../../roster/data/parts";
import { partIdsOf } from "../model/tech-effect";
import type { TechNode } from "../model/tech-node";
import { TECH_FAMILY_IDS, TECH_NODE_KINDS } from "../model/tech-node";
import { CONDITIONAL_TECH_NODES } from "./conditional-tech-tree.test-helper";
import { TECH_FAMILIES } from "./tech-families";
import { TECH_NODES, TIER_2_COST, TIER_3_COST } from "./tech-tree";

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

  it("prices the part nodes at about what 25 clearance missions and their carcasses pay (#1171)", () => {
    // The campaign model the part nodes are paced against: difficulty
    // ramps from 2 to 8 over 25 missions, every one is won, and a
    // carcass turns up on the tuned share of maps and is always
    // harvested. Intel, autopsy, infantry and story nodes are left out;
    // the whole-tree ratio of campaign arc §10 arrives with them.
    const type = MISSION_TYPES["infestation-clearance"];
    const carcass = MISSION_TUNING.techCarcass;
    const missions = 25;
    let income = 0;
    for (let i = 0; i < missions; i += 1) {
      const difficulty = Math.round(2 + (6 * i) / (missions - 1));
      income += type.techRewardBase + type.techRewardPerDifficulty * difficulty;
      income +=
        carcass.chance *
        (carcass.basePoints + carcass.pointsPerDifficulty * difficulty);
    }
    const partTreeCost = PART_NODES.reduce((sum, node) => sum + node.cost, 0);
    // Within a mission or two either way: the parts are finished close
    // to the 25th mission, not long before and not long after.
    expect(partTreeCost).toBeGreaterThan(income * 0.9);
    expect(partTreeCost).toBeLessThan(income * 1.1);
  });
});
