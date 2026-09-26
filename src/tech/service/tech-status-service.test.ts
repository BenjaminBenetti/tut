import { describe, expect, it } from "vitest";

import {
  CONDITIONAL_TECH_NODES,
  FX_FIELD_NOTES,
  FX_PHEROMONE_ANALYSIS,
  FX_POD_TELEMETRY,
  FX_SQUAD_ARMOUR,
  HIVE_CORE_SAMPLE,
  SPORE_SAMPLE,
  withFlags,
} from "../data/conditional-tech-tree.test-helper";
import { TECH_NODES } from "../data/tech-tree";
import { NO_TECH_CONDITIONS } from "../model/tech-conditions";
import {
  isTechNodeHidden,
  missingFlags,
  missingPrerequisites,
  techNodeStatus,
} from "./tech-status-service";

const JUMP = TECH_NODES.find((n) => n.id === "tech.jump-jets")!;
const SPRINT = TECH_NODES.find((n) => n.id === "tech.sprint-frame")!;
const fixture = (id: string) =>
  CONDITIONAL_TECH_NODES.find((n) => n.id === id)!;
const PHEROMONE = fixture(FX_PHEROMONE_ANALYSIS);
const POD = fixture(FX_POD_TELEMETRY);
const NOTES = fixture(FX_FIELD_NOTES);
const ARMOUR = fixture(FX_SQUAD_ARMOUR);

describe("techNodeStatus", () => {
  it("classifies unlocked, locked, unaffordable and available in the service's order", () => {
    const none = NO_TECH_CONDITIONS;
    expect(
      techNodeStatus(
        JUMP,
        { unlocked: ["tech.jump-jets"] },
        { techPoints: 0 },
        none,
      ),
    ).toBe("unlocked");
    expect(
      techNodeStatus(SPRINT, { unlocked: [] }, { techPoints: 999 }, none),
    ).toBe("locked");
    expect(
      techNodeStatus(
        SPRINT,
        { unlocked: ["tech.all-terrain"] },
        { techPoints: SPRINT.cost - 1 },
        none,
      ),
    ).toBe("unaffordable");
    expect(
      techNodeStatus(
        SPRINT,
        { unlocked: ["tech.all-terrain"] },
        { techPoints: SPRINT.cost },
        none,
      ),
    ).toBe("available");
    expect(
      techNodeStatus(JUMP, { unlocked: [] }, { techPoints: JUMP.cost }, none),
    ).toBe("available");
  });

  it("hides a node while any flag it requires is missing, before every other check (ADR 0013 §2.7)", () => {
    const rich = { techPoints: 999 };
    const fresh = { unlocked: [] };
    expect(techNodeStatus(PHEROMONE, fresh, rich, NO_TECH_CONDITIONS)).toBe(
      "hidden",
    );
    expect(
      techNodeStatus(PHEROMONE, fresh, rich, withFlags(SPORE_SAMPLE)),
    ).toBe("available");
    // One of two flags is not enough.
    expect(techNodeStatus(POD, fresh, rich, withFlags(SPORE_SAMPLE))).toBe(
      "hidden",
    );
    expect(
      techNodeStatus(
        POD,
        fresh,
        rich,
        withFlags(SPORE_SAMPLE, HIVE_CORE_SAMPLE),
      ),
    ).toBe("locked");
    // Hidden wins even over a node already bought.
    expect(
      techNodeStatus(
        PHEROMONE,
        { unlocked: [FX_PHEROMONE_ANALYSIS] },
        rich,
        NO_TECH_CONDITIONS,
      ),
    ).toBe("hidden");
  });

  it("treats a flag-effect node and an infantry node like any other visible node", () => {
    const none = NO_TECH_CONDITIONS;
    expect(
      techNodeStatus(NOTES, { unlocked: [] }, { techPoints: 25 }, none),
    ).toBe("available");
    expect(
      techNodeStatus(ARMOUR, { unlocked: [] }, { techPoints: 29 }, none),
    ).toBe("unaffordable");
  });
});

describe("missingFlags and isTechNodeHidden", () => {
  it("list the flags still missing in the node's order, and a node without flags is never hidden", () => {
    expect(missingFlags(POD, NO_TECH_CONDITIONS)).toEqual([
      SPORE_SAMPLE,
      HIVE_CORE_SAMPLE,
    ]);
    expect(missingFlags(POD, withFlags(HIVE_CORE_SAMPLE))).toEqual([
      SPORE_SAMPLE,
    ]);
    expect(isTechNodeHidden(POD, withFlags(HIVE_CORE_SAMPLE))).toBe(true);
    expect(
      isTechNodeHidden(POD, withFlags(SPORE_SAMPLE, HIVE_CORE_SAMPLE, "x")),
    ).toBe(false);
    expect(missingFlags(JUMP, NO_TECH_CONDITIONS)).toEqual([]);
    expect(isTechNodeHidden(JUMP, NO_TECH_CONDITIONS)).toBe(false);
  });
});

describe("missingPrerequisites", () => {
  it("lists what is not yet unlocked in the node's order", () => {
    expect(missingPrerequisites(SPRINT, { unlocked: [] })).toEqual([
      "tech.all-terrain",
    ]);
    expect(
      missingPrerequisites(SPRINT, { unlocked: ["tech.all-terrain"] }),
    ).toEqual([]);
    expect(missingPrerequisites(JUMP, { unlocked: [] })).toEqual([]);
  });
});
