import { describe, expect, it } from "vitest";

import { STARTER_PARTS } from "../../roster/data/parts";
import { StaticPartCatalogue } from "../../roster/repository/static-part-catalogue";
import { TECH_FAMILIES } from "../data/tech-families";
import { TECH_NODES } from "../data/tech-tree";
import { StaticTechCatalogue } from "../repository/static-tech-catalogue";
import {
  createPartAvailability,
  unlockedPartIds,
} from "./part-availability-service";

const TECH = new StaticTechCatalogue(TECH_NODES, Object.values(TECH_FAMILIES));
const PARTS = new StaticPartCatalogue(STARTER_PARTS);

describe("unlockedPartIds", () => {
  it("unions the parts of every unlocked node and ignores an unknown node", () => {
    const ids = unlockedPartIds(TECH, {
      unlocked: ["tech.jump-jets", "tech.advanced-cooling", "tech.gone"],
    });
    expect([...ids].sort()).toEqual([
      "arms-conduit",
      "legs-jumper",
      "utility-active-heat-exchanger",
      "utility-emergency-coolant-injector",
    ]);
  });
});

describe("createPartAvailability", () => {
  it("always allows tier 1, allows a higher tier only once its node is unlocked, and refuses an unknown id", () => {
    const fresh = createPartAvailability(TECH, PARTS, { unlocked: [] });
    expect(fresh.isAvailable("chassis-vanguard")).toBe(true);
    expect(fresh.isAvailable("legs-jumper")).toBe(false);
    expect(fresh.isAvailable("legs-sprint")).toBe(false);
    expect(fresh.isAvailable("nope")).toBe(false);

    const later = createPartAvailability(TECH, PARTS, {
      unlocked: ["tech.jump-jets"],
    });
    expect(later.isAvailable("legs-jumper")).toBe(true);
    expect(later.isAvailable("legs-sprint")).toBe(false);
  });

  it("makes every catalogue part available once the whole tree is unlocked", () => {
    const all = createPartAvailability(TECH, PARTS, {
      unlocked: TECH_NODES.map((node) => node.id),
    });
    for (const part of STARTER_PARTS) {
      expect(all.isAvailable(part.id), part.id).toBe(true);
    }
  });
});
