import { describe, expect, it } from "vitest";

import { TECH_POINTS_CHANGED } from "../../economy/model/economy-event";
import type { EconomyState } from "../../economy/model/economy-state";
import { TechPointTreasury } from "../../economy/service/tech-point-service";
import { TECH_FAMILIES } from "../data/tech-families";
import { TECH_NODES, TIER_2_COST, TIER_3_COST } from "../data/tech-tree";
import { describeTechError } from "../model/tech-error";
import { TECH_UNLOCKED } from "../model/tech-event";
import { StaticTechCatalogue } from "../repository/static-tech-catalogue";
import type { TechSlices, UnlockServiceDeps } from "./unlock-service";
import { unlockTech } from "./unlock-service";

const DEPS: UnlockServiceDeps = {
  catalogue: new StaticTechCatalogue(TECH_NODES, Object.values(TECH_FAMILIES)),
  techPoints: new TechPointTreasury(),
};
const DAY = 9;

function slices(techPoints: number, unlocked: string[] = []): TechSlices {
  const economy: EconomyState = { credits: 100, ledger: [], techPoints };
  return { tech: { unlocked }, economy };
}

describe("unlockTech", () => {
  it("spends the node's cost, records it and emits TechPointsChanged then TechUnlocked", () => {
    const before = slices(50);
    const snapshot = structuredClone(before);
    const result = unlockTech(before, "tech.jump-jets", DAY, DEPS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.tech).toEqual({ unlocked: ["tech.jump-jets"] });
    expect(result.value.economy).toEqual({
      credits: 100,
      ledger: [],
      techPoints: 50 - TIER_2_COST,
    });
    expect(result.value.events).toEqual([
      {
        type: TECH_POINTS_CHANGED,
        payload: {
          before: 50,
          after: 50 - TIER_2_COST,
          amount: -TIER_2_COST,
          ref: "tech.jump-jets",
          day: DAY,
        },
      },
      {
        type: TECH_UNLOCKED,
        payload: {
          nodeId: "tech.jump-jets",
          cost: TIER_2_COST,
          parts: ["legs-jumper"],
        },
      },
    ]);
    expect(before).toEqual(snapshot);
  });

  it("rejects an unknown node", () => {
    const result = unlockTech(slices(999), "tech.warp", DAY, DEPS);
    expect(result).toEqual({
      ok: false,
      error: { code: "unknown-tech", nodeId: "tech.warp" },
    });
  });

  it("rejects a node already unlocked", () => {
    const result = unlockTech(
      slices(999, ["tech.jump-jets"]),
      "tech.jump-jets",
      DAY,
      DEPS,
    );
    expect(result).toEqual({
      ok: false,
      error: { code: "tech-already-unlocked", nodeId: "tech.jump-jets" },
    });
  });

  it("rejects a tier 3 node before its prerequisite, naming what is missing", () => {
    const result = unlockTech(slices(999), "tech.sprint-frame", DAY, DEPS);
    expect(result).toEqual({
      ok: false,
      error: {
        code: "tech-prerequisite-locked",
        nodeId: "tech.sprint-frame",
        missing: ["tech.all-terrain"],
      },
    });
    const after = unlockTech(
      slices(999, ["tech.all-terrain"]),
      "tech.sprint-frame",
      DAY,
      DEPS,
    );
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.value.economy.techPoints).toBe(999 - TIER_3_COST);
  });

  it("rejects an unaffordable node with both numbers and changes nothing", () => {
    const before = slices(TIER_2_COST - 1);
    const result = unlockTech(before, "tech.jump-jets", DAY, DEPS);
    expect(result).toEqual({
      ok: false,
      error: {
        code: "insufficient-tech-points",
        nodeId: "tech.jump-jets",
        required: TIER_2_COST,
        available: TIER_2_COST - 1,
      },
    });
    expect(before.tech.unlocked).toEqual([]);
  });

  it("can spend the exact balance", () => {
    const result = unlockTech(slices(TIER_2_COST), "tech.railgun", DAY, DEPS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.economy.techPoints).toBe(0);
  });
});

describe("describeTechError", () => {
  it("names the node and the numbers for every code", () => {
    expect(describeTechError({ code: "unknown-tech", nodeId: "x" })).toContain(
      "x",
    );
    expect(
      describeTechError({ code: "tech-already-unlocked", nodeId: "x" }),
    ).toMatch(/already/);
    expect(
      describeTechError({
        code: "tech-prerequisite-locked",
        nodeId: "x",
        missing: ["y", "z"],
      }),
    ).toMatch(/y.*z/);
    expect(
      describeTechError({
        code: "insufficient-tech-points",
        nodeId: "x",
        required: 40,
        available: 12,
      }),
    ).toMatch(/40.*12/);
  });
});
