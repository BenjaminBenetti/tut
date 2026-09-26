import { describe, expect, it } from "vitest";

import { TECH_FAMILIES } from "../data/tech-families";
import { TECH_NODES } from "../data/tech-tree";
import type { TechNode } from "../model/tech-node";
import { StaticTechCatalogue } from "./static-tech-catalogue";

const NODE: TechNode = {
  id: "tech.a",
  name: "A",
  description: "",
  family: "mobility",
  kind: "part",
  tier: 2,
  cost: 1,
  requires: [],
  effects: [{ kind: "part", partId: "legs-jumper" }],
};

describe("StaticTechCatalogue", () => {
  it("serves the shipped tree by id and lists nodes and families in order", () => {
    const catalogue = new StaticTechCatalogue(
      TECH_NODES,
      Object.values(TECH_FAMILIES),
    );
    expect(catalogue.listNodes()).toEqual(TECH_NODES);
    expect(catalogue.listFamilies()).toEqual(Object.values(TECH_FAMILIES));
    expect(catalogue.getNode("tech.jump-jets")?.name).toBe("Jump Jets");
    expect(catalogue.getNode("tech.nope")).toBeUndefined();
  });

  it("rejects a duplicate id at construction", () => {
    expect(() => new StaticTechCatalogue([NODE, NODE], [])).toThrow(/tech/);
  });

  it("rejects a prerequisite that names no node", () => {
    const orphan: TechNode = { ...NODE, id: "tech.b", requires: ["tech.z"] };
    expect(() => new StaticTechCatalogue([NODE, orphan], [])).toThrow(
      /requires unknown tech "tech.z"/,
    );
  });
});
