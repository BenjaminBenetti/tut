import { describe, expect, it } from "vitest";

import { TECH_NODES } from "../data/tech-tree";
import { missingPrerequisites, techNodeStatus } from "./tech-status-service";

const JUMP = TECH_NODES.find((n) => n.id === "tech.jump-jets")!;
const SPRINT = TECH_NODES.find((n) => n.id === "tech.sprint-frame")!;

describe("techNodeStatus", () => {
  it("classifies unlocked, locked, unaffordable and available in the service's order", () => {
    expect(
      techNodeStatus(JUMP, { unlocked: ["tech.jump-jets"] }, { techPoints: 0 }),
    ).toBe("unlocked");
    expect(techNodeStatus(SPRINT, { unlocked: [] }, { techPoints: 999 })).toBe(
      "locked",
    );
    expect(
      techNodeStatus(
        SPRINT,
        { unlocked: ["tech.all-terrain"] },
        { techPoints: SPRINT.cost - 1 },
      ),
    ).toBe("unaffordable");
    expect(
      techNodeStatus(
        SPRINT,
        { unlocked: ["tech.all-terrain"] },
        { techPoints: SPRINT.cost },
      ),
    ).toBe("available");
    expect(
      techNodeStatus(JUMP, { unlocked: [] }, { techPoints: JUMP.cost }),
    ).toBe("available");
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
