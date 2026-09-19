import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { TECH_POINTS_CHANGED } from "../../economy/model/economy-event";
import { TechPointTreasury } from "../../economy/service/tech-point-service";
import { TECH_FAMILIES } from "../../tech/data/tech-families";
import { TECH_NODES, TIER_2_COST } from "../../tech/data/tech-tree";
import { TECH_UNLOCKED } from "../../tech/model/tech-event";
import { StaticTechCatalogue } from "../../tech/repository/static-tech-catalogue";
import type { CampaignState } from "../model/campaign-state";
import { UNLOCK_TECH, unlockTech } from "../model/unlock-tech-command";
import { createOverworldCommandDispatcher } from "./command-dispatcher";
import { registerTechCommands } from "./tech-command-handlers";

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
  },
  roster: { squads: [], mechs: [], savedLoadouts: [], graveyard: [] },
  economy: { credits: 1, ledger: [], techPoints: 30 },
  tech: { unlocked: [] },
};

function dispatcher() {
  const d = createOverworldCommandDispatcher<CampaignState>();
  registerTechCommands(d, {
    catalogue: new StaticTechCatalogue(
      TECH_NODES,
      Object.values(TECH_FAMILIES),
    ),
    techPoints: new TechPointTreasury(),
  });
  return d;
}

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
});
