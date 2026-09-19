import { describe, expect, it } from "vitest";

import { MISSION_TYPES } from "../../content/data/mission-types";
import { MISSION_TUNING } from "../../overworld/data/mission-tuning";
import { STARTER_PARTS } from "../../roster/data/parts";
import { TECH_FAMILY_IDS } from "../model/tech-node";
import { TECH_FAMILIES } from "./tech-families";
import { TECH_NODES, TIER_2_COST, TIER_3_COST } from "./tech-tree";

const NODE_IDS = new Set(TECH_NODES.map((node) => node.id));
const byId = (id: string) => TECH_NODES.find((node) => node.id === id);

describe("TECH_NODES", () => {
  it("has unique ids and non-empty copy", () => {
    expect(NODE_IDS.size).toBe(TECH_NODES.length);
    for (const node of TECH_NODES) {
      expect(node.id).toMatch(/^tech\.[a-z0-9-]+$/);
      expect(node.name.trim()).not.toBe("");
      expect(node.description.trim()).not.toBe("");
      expect(node.unlocks.length).toBeGreaterThan(0);
    }
  });

  it("unlocks every tier 2 and tier 3 part exactly once and no tier 1 part", () => {
    const seen = new Map<string, string>();
    for (const node of TECH_NODES) {
      for (const partId of node.unlocks) {
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

  it("prices each node by its tier and files it under a real family", () => {
    for (const node of TECH_NODES) {
      expect(node.cost).toBe(node.tier === 2 ? TIER_2_COST : TIER_3_COST);
      expect(TECH_FAMILY_IDS).toContain(node.family);
      expect(TECH_FAMILIES[node.family].id).toBe(node.family);
    }
    for (const family of TECH_FAMILY_IDS) {
      expect(TECH_NODES.some((node) => node.family === family)).toBe(true);
    }
  });

  it("unlocks parts of its own tier", () => {
    for (const node of TECH_NODES) {
      for (const partId of node.unlocks) {
        const part = STARTER_PARTS.find((p) => p.id === partId);
        expect(part?.tier, `${partId} in ${node.id}`).toBe(node.tier);
      }
    }
  });

  it("opens every tier 2 node at once and reaches each tier 3 node through one node of its family", () => {
    for (const node of TECH_NODES) {
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

  it("costs about what 25 clearance missions and their carcasses pay (#1171)", () => {
    // The campaign model the tree is paced against: difficulty ramps
    // from 2 to 8 over 25 missions, every one is won, and a carcass turns
    // up on the tuned share of maps and is always harvested.
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
    const treeCost = TECH_NODES.reduce((sum, node) => sum + node.cost, 0);
    // Within a mission or two either way: the tree is finished close to
    // the 25th mission, not long before and not long after.
    expect(treeCost).toBeGreaterThan(income * 0.9);
    expect(treeCost).toBeLessThan(income * 1.1);
  });
});
