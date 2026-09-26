import { describe, expect, it } from "vitest";

import { TECH_POINTS_CHANGED } from "../../economy/model/economy-event";
import type { EconomyState } from "../../economy/model/economy-state";
import { TechPointTreasury } from "../../economy/service/tech-point-service";
import {
  CONDITIONAL_TECH_NODES,
  conditionalTechCatalogue,
  FX_FIELD_NOTES,
  FX_PHEROMONE_ANALYSIS,
  FX_POD_TELEMETRY,
  HIVE_CORE_SAMPLE,
  SPORE_SAMPLE,
  withFlags,
} from "../data/conditional-tech-tree.test-helper";
import { TECH_FAMILIES } from "../data/tech-families";
import { TECH_NODES, TIER_2_COST, TIER_3_COST } from "../data/tech-tree";
import type { TechConditions } from "../model/tech-conditions";
import { NO_TECH_CONDITIONS } from "../model/tech-conditions";
import type { TechErrorCode } from "../model/tech-error";
import { describeTechError } from "../model/tech-error";
import { TECH_UNLOCKED } from "../model/tech-event";
import { StaticTechCatalogue } from "../repository/static-tech-catalogue";
import type { TechNodeStatus } from "./tech-status-service";
import { techNodeStatus } from "./tech-status-service";
import type { TechSlices, UnlockServiceDeps } from "./unlock-service";
import { unlockTech } from "./unlock-service";

const DEPS: UnlockServiceDeps = {
  catalogue: new StaticTechCatalogue(TECH_NODES, Object.values(TECH_FAMILIES)),
  techPoints: new TechPointTreasury(),
};
const FIXTURE_DEPS: UnlockServiceDeps = {
  catalogue: conditionalTechCatalogue(),
  techPoints: new TechPointTreasury(),
};
const DAY = 9;
const NONE = NO_TECH_CONDITIONS;

function slices(techPoints: number, unlocked: string[] = []): TechSlices {
  const economy: EconomyState = { credits: 100, ledger: [], techPoints };
  return { tech: { unlocked }, economy };
}

describe("unlockTech", () => {
  it("spends the node's cost, records it and emits TechPointsChanged then TechUnlocked", () => {
    const before = slices(50);
    const snapshot = structuredClone(before);
    const result = unlockTech(before, "tech.jump-jets", DAY, NONE, DEPS);
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
    const result = unlockTech(slices(999), "tech.warp", DAY, NONE, DEPS);
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
      NONE,
      DEPS,
    );
    expect(result).toEqual({
      ok: false,
      error: { code: "tech-already-unlocked", nodeId: "tech.jump-jets" },
    });
  });

  it("rejects a tier 3 node before its prerequisite, naming what is missing", () => {
    const result = unlockTech(
      slices(999),
      "tech.sprint-frame",
      DAY,
      NONE,
      DEPS,
    );
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
      NONE,
      DEPS,
    );
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.value.economy.techPoints).toBe(999 - TIER_3_COST);
  });

  it("rejects an unaffordable node with both numbers and changes nothing", () => {
    const before = slices(TIER_2_COST - 1);
    const result = unlockTech(before, "tech.jump-jets", DAY, NONE, DEPS);
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
    const result = unlockTech(
      slices(TIER_2_COST),
      "tech.railgun",
      DAY,
      NONE,
      DEPS,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.economy.techPoints).toBe(0);
  });
});

describe("unlockTech with conditions (ADR 0013 §2.7)", () => {
  it("refuses a hidden node as hidden, however rich, and changes nothing", () => {
    const before = slices(999);
    const result = unlockTech(
      before,
      FX_PHEROMONE_ANALYSIS,
      DAY,
      NONE,
      FIXTURE_DEPS,
    );
    expect(result).toEqual({
      ok: false,
      error: { code: "tech-hidden", nodeId: FX_PHEROMONE_ANALYSIS },
    });
    expect(before.economy.techPoints).toBe(999);
  });

  it("buys the same node once its flag is set, emitting no parts for a flag effect", () => {
    const result = unlockTech(
      slices(200),
      FX_PHEROMONE_ANALYSIS,
      DAY,
      withFlags(SPORE_SAMPLE),
      FIXTURE_DEPS,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.tech.unlocked).toEqual([FX_PHEROMONE_ANALYSIS]);
    expect(result.value.economy.techPoints).toBe(20);
    expect(result.value.events.at(-1)).toEqual({
      type: TECH_UNLOCKED,
      payload: { nodeId: FX_PHEROMONE_ANALYSIS, cost: 180, parts: [] },
    });
  });

  it("checks hidden before already-unlocked and before prerequisites", () => {
    expect(
      unlockTech(
        slices(999, [FX_PHEROMONE_ANALYSIS]),
        FX_PHEROMONE_ANALYSIS,
        DAY,
        NONE,
        FIXTURE_DEPS,
      ),
    ).toMatchObject({ ok: false, error: { code: "tech-hidden" } });
    // Pod Telemetry needs both flags; with one it is hidden, not locked.
    expect(
      unlockTech(
        slices(999),
        FX_POD_TELEMETRY,
        DAY,
        withFlags(SPORE_SAMPLE),
        FIXTURE_DEPS,
      ),
    ).toMatchObject({ ok: false, error: { code: "tech-hidden" } });
    expect(
      unlockTech(
        slices(999),
        FX_POD_TELEMETRY,
        DAY,
        withFlags(SPORE_SAMPLE, HIVE_CORE_SAMPLE),
        FIXTURE_DEPS,
      ),
    ).toMatchObject({
      ok: false,
      error: {
        code: "tech-prerequisite-locked",
        missing: [FX_PHEROMONE_ANALYSIS],
      },
    });
  });

  it("still calls an id no node has unknown, whatever the flags", () => {
    expect(
      unlockTech(slices(999), "tech.nope", DAY, NONE, FIXTURE_DEPS),
    ).toEqual({
      ok: false,
      error: { code: "unknown-tech", nodeId: "tech.nope" },
    });
  });

  it("buys a visible flag-effect node with no flags at all", () => {
    const result = unlockTech(
      slices(25),
      FX_FIELD_NOTES,
      DAY,
      NONE,
      FIXTURE_DEPS,
    );
    expect(result.ok).toBe(true);
  });
});

describe("unlockTech and techNodeStatus agree", () => {
  /** The unlock outcome each status promises. */
  const PROMISE: Readonly<Record<TechNodeStatus, TechErrorCode | "ok">> = {
    hidden: "tech-hidden",
    unlocked: "tech-already-unlocked",
    locked: "tech-prerequisite-locked",
    unaffordable: "insufficient-tech-points",
    available: "ok",
  };

  it("on every node, flag set, unlocked set and pool: the status names the outcome the command gives", () => {
    const conditionSets: TechConditions[] = [
      NONE,
      withFlags(SPORE_SAMPLE),
      withFlags(HIVE_CORE_SAMPLE),
      withFlags(SPORE_SAMPLE, HIVE_CORE_SAMPLE),
    ];
    const everything = CONDITIONAL_TECH_NODES.map((node) => node.id);
    const unlockedSets: string[][] = [
      [],
      everything,
      // Every prerequisite bought, nothing else.
      [...new Set(CONDITIONAL_TECH_NODES.flatMap((node) => node.requires))],
    ];
    const seen = new Set<TechNodeStatus>();
    for (const node of CONDITIONAL_TECH_NODES) {
      for (const conditions of conditionSets) {
        for (const unlocked of unlockedSets) {
          for (const points of [0, node.cost - 1, node.cost, 999]) {
            const state = slices(points, unlocked);
            const status = techNodeStatus(
              node,
              state.tech,
              state.economy,
              conditions,
            );
            const result = unlockTech(
              state,
              node.id,
              DAY,
              conditions,
              FIXTURE_DEPS,
            );
            const outcome = result.ok ? "ok" : result.error.code;
            expect(
              outcome,
              `${node.id} with [${[...conditions.flags].join(",")}] unlocked [${unlocked.join(",")}] at ${String(points)} TP`,
            ).toBe(PROMISE[status]);
            seen.add(status);
          }
        }
      }
    }
    // The sweep exercised every status, so every arm of the order is compared.
    expect([...seen].sort()).toEqual(Object.keys(PROMISE).sort());
  });
});

describe("describeTechError", () => {
  it("names the node and the numbers for every code", () => {
    expect(describeTechError({ code: "tech-hidden", nodeId: "x" })).toMatch(
      /"x".*not been discovered/,
    );
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
