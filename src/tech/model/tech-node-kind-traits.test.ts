import { describe, expect, it } from "vitest";

import { CONDITIONAL_TECH_NODES } from "../data/conditional-tech-tree.test-helper";
import { TECH_NODES } from "../data/tech-tree";
import { TECH_NODE_KINDS } from "./tech-node";
import {
  isStoryTechNode,
  TECH_NODE_KIND_TRAITS,
} from "./tech-node-kind-traits";

describe("TECH_NODE_KIND_TRAITS (ADR 0013 §2.7, #1237)", () => {
  it("says for every kind whether it moves the story on: intel and story do, the rest do not", () => {
    expect(Object.keys(TECH_NODE_KIND_TRAITS).sort()).toEqual(
      [...TECH_NODE_KINDS].sort(),
    );
    expect(
      TECH_NODE_KINDS.filter(
        (kind) => TECH_NODE_KIND_TRAITS[kind].advancesStory,
      ),
    ).toEqual(["intel", "story"]);
  });
});

describe("isStoryTechNode", () => {
  it("finds exactly the three Intel projects and Last Hope in the shipped tree, by kind", () => {
    expect(
      TECH_NODES.filter((node) => isStoryTechNode(node)).map((node) => node.id),
    ).toEqual([
      "tech.pheromone-analysis",
      "tech.platform-approach",
      "tech.last-hope",
      "tech.pod-telemetry",
    ]);
  });

  it("reads the kind, not the id: any intel or story node is story, a part node never", () => {
    expect(isStoryTechNode({ kind: "intel" })).toBe(true);
    expect(isStoryTechNode({ kind: "story" })).toBe(true);
    expect(isStoryTechNode({ kind: "part" })).toBe(false);
    expect(isStoryTechNode({ kind: "autopsy" })).toBe(false);
    expect(isStoryTechNode({ kind: "infantry" })).toBe(false);
    expect(
      CONDITIONAL_TECH_NODES.filter((node) => isStoryTechNode(node)).map(
        (node) => node.kind,
      ),
    ).toEqual(["intel", "intel", "story"]);
  });

  it("every shipped story node is hidden behind a flag and sets a flag for the story to read", () => {
    for (const node of TECH_NODES.filter((each) => isStoryTechNode(each))) {
      expect(node.requiresFlags?.length, node.id).toBeGreaterThan(0);
      const flags = node.effects.flatMap((effect) =>
        effect.kind === "flag" ? [effect.flag] : [],
      );
      expect(flags.length, node.id).toBeGreaterThan(0);
    }
  });
});
