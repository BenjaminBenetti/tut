import { describe, expect, it } from "vitest";

import { BUG_SPECIES_IDS } from "../../content/model/bug-species-id";
import {
  ACID_RESISTANT_PLATING,
  AUTOPSY_PARTS,
  SPINE_PLATE_ARMOUR,
} from "../../roster/data/autopsy-parts";
import { killedFlag, killedSpeciesOf } from "../model/tech-conditions";
import { partIdsOf } from "../model/tech-effect";
import { AUTOPSY_NODES } from "./autopsy-nodes";
import { TECH_NODES } from "./tech-tree";

/** The species whose kill reveals `node`, read off its one flag. */
const speciesOf = (node: (typeof AUTOPSY_NODES)[number]): string | undefined =>
  killedSpeciesOf(node.requiresFlags?.[0] ?? "");

describe("AUTOPSY_NODES (campaign arc §8, §10.2)", () => {
  it("is every autopsy of the shipped tree, each in it", () => {
    for (const node of AUTOPSY_NODES) {
      expect(TECH_NODES, node.id).toContain(node);
    }
    expect(TECH_NODES.filter((node) => node.kind === "autopsy")).toEqual([
      ...AUTOPSY_NODES,
    ]);
  });

  it("hides each behind exactly one kill flag, of a species the game ships", () => {
    for (const node of AUTOPSY_NODES) {
      expect(node.requiresFlags, node.id).toHaveLength(1);
      const species = speciesOf(node);
      expect(BUG_SPECIES_IDS, node.id).toContain(species);
      expect(node.requiresFlags).toEqual([killedFlag(species ?? "")]);
    }
  });

  it("gives each species at most one autopsy", () => {
    const species = AUTOPSY_NODES.map(speciesOf);
    expect(new Set(species).size).toBe(species.length);
  });

  it("files each under xenobiology on the inner ring, at 20–40 TP, with no prerequisite but the kill", () => {
    for (const node of AUTOPSY_NODES) {
      expect(node.kind, node.id).toBe("autopsy");
      expect(node.family, node.id).toBe("xenobiology");
      expect(node.tier, node.id).toBe(2);
      expect(node.requires, node.id).toEqual([]);
      expect(node.cost, node.id).toBeGreaterThanOrEqual(20);
      expect(node.cost, node.id).toBeLessThanOrEqual(40);
    }
  });

  it("unlocks one counter part each, and every counter from exactly one autopsy", () => {
    const counters = AUTOPSY_NODES.map((node) => {
      expect(node.effects, node.id).toHaveLength(1);
      expect(node.effects[0]?.kind, node.id).toBe("part");
      return partIdsOf(node)[0];
    });
    expect([...counters].sort()).toEqual(
      AUTOPSY_PARTS.map((part) => part.id).sort(),
    );
  });

  it("counters the spitter with acid plating and the Hive Guard with spine plate", () => {
    const counterOf = (species: string): string | undefined =>
      AUTOPSY_NODES.filter((node) => speciesOf(node) === species).flatMap(
        partIdsOf,
      )[0];
    expect(counterOf("spitter")).toBe(ACID_RESISTANT_PLATING);
    expect(counterOf("hive-guard")).toBe(SPINE_PLATE_ARMOUR);
  });
});
