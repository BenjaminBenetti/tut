import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { TECH_POINTS_CHANGED } from "../../economy/model/economy-event";
import { TechPointTreasury } from "../../economy/service/tech-point-service";
import {
  CAPTURE_NET,
  conditionalTechCatalogue,
  FX_PHEROMONE_ANALYSIS,
  SPORE_SAMPLE,
  withFlags,
} from "../../tech/data/conditional-tech-tree.test-helper";
import { TECH_FAMILIES } from "../../tech/data/tech-families";
import { TECH_NODES, TIER_2_COST } from "../../tech/data/tech-tree";
import type { TechConditions } from "../../tech/model/tech-conditions";
import { NO_TECH_CONDITIONS } from "../../tech/model/tech-conditions";
import { TECH_UNLOCKED } from "../../tech/model/tech-event";
import type { TechNode } from "../../tech/model/tech-node";
import { StaticTechCatalogue } from "../../tech/repository/static-tech-catalogue";
import type { CampaignApplied } from "../model/campaign-event";
import type { CampaignState } from "../model/campaign-state";
import { grantTechPoints } from "../model/grant-tech-points-command";
import { THREAT_CHANGED } from "../model/threat-changed-event";
import { UNLOCK_TECH, unlockTech } from "../model/unlock-tech-command";
import { createInitialCampaignProgress } from "./campaign-progress-factory";
import { createOverworldCommandDispatcher } from "./command-dispatcher";
import {
  DEV_TOOLS_DISABLED,
  INVALID_GRANT,
  registerTechCommands,
} from "./tech-command-handlers";

const BASE: CampaignState = {
  meta: {
    rng: new Mulberry32Rng(1).getState(),
    ids: { counters: {} },
  },
  overworld: {
    day: 6,
    map: { regions: [], cities: [] },
    threat: 0,
    threatOffset: 0,
    spreadCooldowns: {},
    missions: [],
    pendingEvents: [],
    deployables: [],
    hives: [],
    progress: createInitialCampaignProgress(),
  },
  roster: { squads: [], mechs: [], savedLoadouts: [], graveyard: [] },
  economy: { credits: 1, ledger: [], techPoints: 30 },
  tech: { unlocked: [] },
};

function dispatcher(devTools?: boolean) {
  const d = createOverworldCommandDispatcher<CampaignState>();
  registerTechCommands(d, {
    catalogue: new StaticTechCatalogue(
      TECH_NODES,
      Object.values(TECH_FAMILIES),
    ),
    techPoints: new TechPointTreasury(),
    conditionsOf: () => NO_TECH_CONDITIONS,
    ...(devTools === undefined ? {} : { devTools }),
  });
  return d;
}

/** A dispatcher over the conditional fixture tree, with the given conditions source and hook. */
function conditionalDispatcher(
  conditionsOf: (state: CampaignState) => TechConditions,
  onUnlocked?: (
    state: CampaignState,
    node: TechNode,
  ) => CampaignApplied<CampaignState>,
) {
  const d = createOverworldCommandDispatcher<CampaignState>();
  registerTechCommands(d, {
    catalogue: conditionalTechCatalogue(),
    techPoints: new TechPointTreasury(),
    conditionsOf,
    ...(onUnlocked === undefined ? {} : { onUnlocked }),
  });
  return d;
}

const RICH: CampaignState = {
  ...BASE,
  economy: { ...BASE.economy, techPoints: 500 },
};

describe("registerTechCommands", () => {
  it("unlocks a node through the dispatcher, replacing the tech and economy slices on the current day", () => {
    const result = dispatcher().process(BASE, unlockTech("tech.railgun"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state).toEqual({
      ...BASE,
      economy: { ...BASE.economy, techPoints: 30 - TIER_2_COST },
      tech: { unlocked: ["tech.railgun"] },
    });
    expect(result.value.events.map((e) => e.type)).toEqual([
      TECH_POINTS_CHANGED,
      TECH_UNLOCKED,
    ]);
    expect(result.value.events[0]).toMatchObject({
      payload: { day: 6, ref: "tech.railgun" },
    });
  });

  it("folds a tech error into a command error carrying the tech code", () => {
    const result = dispatcher().process(BASE, {
      type: UNLOCK_TECH,
      payload: { nodeId: "tech.siege-railgun" },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("tech-prerequisite-locked");
    expect(result.error.message).toContain("tech.railgun");
  });

  describe("conditions and the unlock hook (ADR 0013 §2.7, §2.5)", () => {
    it("asks conditionsOf about the state it is handed, and refuses a hidden node as tech-hidden", () => {
      const asked: CampaignState[] = [];
      const hidden = conditionalDispatcher((state) => {
        asked.push(state);
        return NO_TECH_CONDITIONS;
      }).process(RICH, unlockTech(FX_PHEROMONE_ANALYSIS));
      expect(hidden.ok).toBe(false);
      if (hidden.ok) return;
      expect(hidden.error.code).toBe("tech-hidden");
      expect(asked).toHaveLength(1);
      expect(asked[0]?.economy.techPoints).toBe(500);

      const shown = conditionalDispatcher(() =>
        withFlags(SPORE_SAMPLE),
      ).process(RICH, unlockTech(FX_PHEROMONE_ANALYSIS));
      expect(shown.ok).toBe(true);
    });

    it("hands the unlocked state and the node to onUnlocked, and appends its state and events", () => {
      const calls: { unlocked: readonly string[]; node: TechNode }[] = [];
      const result = conditionalDispatcher(
        () => withFlags(SPORE_SAMPLE),
        (state, node) => {
          calls.push({ unlocked: state.tech.unlocked, node });
          return {
            state: { ...state, overworld: { ...state.overworld, threat: 7 } },
            events: [{ type: THREAT_CHANGED, payload: { from: 0, to: 7 } }],
          };
        },
      ).process(RICH, unlockTech(FX_PHEROMONE_ANALYSIS));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(calls).toHaveLength(1);
      expect(calls[0]?.unlocked).toEqual([FX_PHEROMONE_ANALYSIS]);
      expect(calls[0]?.node.effects).toEqual([
        { kind: "flag", flag: CAPTURE_NET },
      ]);
      expect(result.value.state.overworld.threat).toBe(7);
      expect(result.value.state.tech.unlocked).toEqual([FX_PHEROMONE_ANALYSIS]);
      expect(result.value.events.map((e) => e.type)).toEqual([
        TECH_POINTS_CHANGED,
        TECH_UNLOCKED,
        THREAT_CHANGED,
      ]);
    });

    it("never calls onUnlocked for a refused unlock", () => {
      let called = 0;
      const result = conditionalDispatcher(
        () => NO_TECH_CONDITIONS,
        (state) => {
          called += 1;
          return { state, events: [] };
        },
      ).process(RICH, unlockTech(FX_PHEROMONE_ANALYSIS));
      expect(result.ok).toBe(false);
      expect(called).toBe(0);
    });
  });

  describe("GrantTechPoints (#1171)", () => {
    it("in a dev build earns the amount on the current day and touches nothing else", () => {
      const result = dispatcher(true).process(BASE, grantTechPoints(10));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.state).toEqual({
        ...BASE,
        economy: { ...BASE.economy, techPoints: 40 },
      });
      expect(result.value.events.map((e) => e.type)).toEqual([
        TECH_POINTS_CHANGED,
      ]);
    });

    it("is refused outside a dev build, and by default", () => {
      for (const d of [dispatcher(), dispatcher(false)]) {
        const result = d.process(BASE, grantTechPoints(10));
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.code).toBe(DEV_TOOLS_DISABLED);
      }
    });

    it("refuses a grant that is not a positive whole number", () => {
      for (const amount of [0, -5, 2.5, Number.NaN]) {
        const result = dispatcher(true).process(BASE, grantTechPoints(amount));
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.code).toBe(INVALID_GRANT);
      }
    });
  });
});
