import { describe, expect, it } from "vitest";

import {
  conditionalTechCatalogue,
  FX_JUMP_JETS,
  FX_PHEROMONE_ANALYSIS,
  FX_POD_TELEMETRY,
  HIVE_CORE_SAMPLE,
  SPORE_SAMPLE,
  withFlags,
} from "../data/conditional-tech-tree.test-helper";
import { AUTOPSY_NODES } from "../data/autopsy-nodes";
import { TECH_NODES } from "../data/tech-tree";
import { killedFlag, NO_TECH_CONDITIONS } from "../model/tech-conditions";
import { revealedTechNodes } from "./tech-reveal-service";

const ids = (nodes: readonly { readonly id: string }[]): string[] =>
  nodes.map((node) => node.id);

describe("revealedTechNodes (ADR 0013 §2.7)", () => {
  it("reports the spitter autopsy when the spitter's first kill lands, and nothing else", () => {
    expect(
      ids(
        revealedTechNodes(
          TECH_NODES,
          NO_TECH_CONDITIONS,
          withFlags(killedFlag("spitter")),
        ),
      ),
    ).toEqual(["tech.spitter-autopsy"]);
    expect(AUTOPSY_NODES.map((node) => node.id)).toContain(
      "tech.spitter-autopsy",
    );
  });

  it("reports nothing when no node changes side, in either direction", () => {
    const killed = withFlags(killedFlag("spitter"));
    expect(revealedTechNodes(TECH_NODES, killed, killed)).toEqual([]);
    expect(revealedTechNodes(TECH_NODES, killed, NO_TECH_CONDITIONS)).toEqual(
      [],
    );
  });

  it("reports every node a change reveals at once, in tree order, and never a node shown all along", () => {
    const nodes = conditionalTechCatalogue().listNodes();
    const revealed = ids(
      revealedTechNodes(
        nodes,
        NO_TECH_CONDITIONS,
        withFlags(SPORE_SAMPLE, HIVE_CORE_SAMPLE),
      ),
    );
    expect(revealed).toEqual(
      ids(nodes).filter(
        (id) => id === FX_PHEROMONE_ANALYSIS || id === FX_POD_TELEMETRY,
      ),
    );
    expect(revealed).not.toContain(FX_JUMP_JETS);
  });
});
