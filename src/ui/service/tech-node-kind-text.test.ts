import { describe, expect, it } from "vitest";

import { BUG_SPECIES } from "../../bugs/data/species";
import { createSpeciesLookup } from "../../bugs/service/species-lookup";
import { AUTOPSY_NODES } from "../../tech/data/autopsy-nodes";
import { TECH_NODES } from "../../tech/data/tech-tree";
import { killedFlag } from "../../tech/model/tech-conditions";
import { techNodeKindText } from "./tech-node-kind-text";

const SPECIES = { speciesOf: createSpeciesLookup(BUG_SPECIES) };

describe("techNodeKindText (ADR 0013 §2.7)", () => {
  it("names the species an autopsy studies, by its shipped name", () => {
    const spitter = AUTOPSY_NODES.find(
      (node) => node.id === "tech.spitter-autopsy",
    );
    const guard = AUTOPSY_NODES.find(
      (node) => node.id === "tech.hive-guard-autopsy",
    );
    expect(spitter && techNodeKindText(spitter, SPECIES)).toBe(
      "Autopsy: Spitter",
    );
    expect(guard && techNodeKindText(guard, SPECIES)).toBe(
      "Autopsy: Hive Guard",
    );
  });

  it("names the burrower, the Broodmother and the armoured carapace (campaign arc §10.2)", () => {
    const kindOf = (id: string): string | undefined => {
      const node = AUTOPSY_NODES.find((each) => each.id === id);
      return node && techNodeKindText(node, SPECIES);
    };
    expect(kindOf("tech.burrower-autopsy")).toBe("Autopsy: Burrower");
    expect(kindOf("tech.broodmother-autopsy")).toBe("Autopsy: Broodmother");
    // A kill group is no species, so its id's words name it.
    expect(kindOf("tech.armoured-autopsy")).toBe("Autopsy: Armoured carapace");
  });

  it("falls back to the species id's words, or to the kind alone without a kill flag", () => {
    const autopsy = {
      kind: "autopsy",
      requiresFlags: [killedFlag("hive-guard")],
    } as const;
    expect(techNodeKindText(autopsy)).toBe("Autopsy: Hive guard");
    expect(
      techNodeKindText({ kind: "autopsy", requiresFlags: ["spore-sample"] }),
    ).toBe("Autopsy");
  });

  it("says nothing for a part node, nor for the other shipped kinds", () => {
    for (const node of TECH_NODES.filter((n) => n.kind !== "autopsy")) {
      expect(techNodeKindText(node, SPECIES), node.id).toBeUndefined();
    }
  });
});
