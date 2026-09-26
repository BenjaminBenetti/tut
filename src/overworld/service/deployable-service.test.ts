import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { CREDITS_CHANGED } from "../../economy/model/economy-event";
import { LedgerTransactionService } from "../../economy/service/transaction-service";
import { DEPLOYABLE_TYPES } from "../data/deployable-types";
import type { CampaignState } from "../model/campaign-state";
import type { Deployable } from "../model/deployable";
import { DEPLOYABLE_BUILT } from "../model/deployable-built-event";
import type { DeployableLevel } from "../model/deployable-level";
import { DEPLOYABLE_REMOVED } from "../model/deployable-removed-event";
import { DEPLOYABLE_UPGRADED } from "../model/deployable-upgraded-event";
import type { DeployableType } from "../model/deployable-type";
import { DEPLOYABLE_TYPE_IDS } from "../model/deployable-type";
import { DataDeployableTypeCatalogue } from "../repository/deployable-type-catalogue";
import { createInitialCampaignProgress } from "./campaign-progress-factory";
import type { DeployableServiceDeps } from "./deployable-service";
import {
  buildDeployable,
  decommissionDeployable,
  upgradeDeployable,
} from "./deployable-service";
import { buildEarthMap } from "./earth-map-builder";

// ===========================================
// Fixtures
// ===========================================

const BATTERY = DEPLOYABLE_TYPES["defensive-battery"];
const SENSOR = DEPLOYABLE_TYPES["sensor-array"];
const BATTERY_COST = BATTERY.levels[1].buildCost;
const SENSOR_COST = SENSOR.levels[1].buildCost;
const DAY = 9;

const CATALOGUE = new DataDeployableTypeCatalogue(
  DEPLOYABLE_TYPE_IDS.map((id) => DEPLOYABLE_TYPES[id]),
);

function deployable(
  id: string,
  typeId: DeployableType["id"],
  regionId: string,
  level: DeployableLevel = 1,
): Deployable {
  return { id, typeId, regionId, level, builtDay: 1, online: true };
}

function campaign(
  deployables: readonly Deployable[],
  credits: number,
): CampaignState {
  return {
    meta: {
      rng: new Mulberry32Rng(1).getState(),
      ids: new SequentialIdGenerator().getState(),
    },
    overworld: {
      day: DAY,
      map: buildEarthMap({
        regions: [
          {
            id: "west",
            name: "West",
            biome: "temperate",
            cities: [{ id: "a", name: "A", layout: { x: 0.1, y: 0.1 } }],
          },
          {
            id: "east",
            name: "East",
            biome: "desert",
            cities: [{ id: "b", name: "B", layout: { x: 0.8, y: 0.1 } }],
          },
        ],
        links: [["a", "b"]],
      }),
      threat: 0,
      threatOffset: 0,
      spreadCooldowns: {},
      missions: [],
      pendingEvents: [],
      deployables,
      hives: [],
      progress: createInitialCampaignProgress(),
    },
    roster: { squads: [], mechs: [], savedLoadouts: [], graveyard: [] },
    economy: { credits, ledger: [], techPoints: 0 },
    tech: { unlocked: [] },
  };
}

function deps(catalogue = CATALOGUE): DeployableServiceDeps {
  const ids = new SequentialIdGenerator();
  return { catalogue, transactions: new LedgerTransactionService(ids), ids };
}

// ===========================================
// Build
// ===========================================

describe("buildDeployable", () => {
  it("charges the level 1 cost, places the installation online at level 1 and reports both", () => {
    const state = campaign([], 5000);
    const result = buildDeployable(
      state,
      "defensive-battery",
      "west",
      DAY,
      deps(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { overworld, economy, events } = result.value;
    expect(overworld.deployables).toEqual([
      {
        id: "deployable-1",
        typeId: "defensive-battery",
        regionId: "west",
        level: 1,
        builtDay: DAY,
        online: true,
      },
    ]);
    expect(economy.credits).toBe(5000 - BATTERY_COST);
    expect(economy.ledger.map((t) => [t.kind, t.ref, t.amount, t.day])).toEqual(
      [["purchase", "deployable-1", -BATTERY_COST, DAY]],
    );
    expect(events.map((e) => e.type)).toEqual([
      CREDITS_CHANGED,
      DEPLOYABLE_BUILT,
    ]);
    expect(events[1]?.payload).toEqual({
      deployable: overworld.deployables[0],
      cost: BATTERY_COST,
    });
    expect(overworld.map).toBe(state.overworld.map);
  });

  it("enforces the cap per type per region, counting offline installations", () => {
    const full = campaign(
      [{ ...deployable("d1", "defensive-battery", "west"), online: false }],
      99_999,
    );
    expect(BATTERY.maxPerRegion).toBe(1);
    const refused = buildDeployable(
      full,
      "defensive-battery",
      "west",
      DAY,
      deps(),
    );
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error).toEqual({
      code: "region-cap-reached",
      typeId: "defensive-battery",
      regionId: "west",
      cap: 1,
    });

    const otherRegion = buildDeployable(
      full,
      "defensive-battery",
      "east",
      DAY,
      deps(),
    );
    expect(otherRegion.ok).toBe(true);
    const otherType = buildDeployable(
      full,
      "sensor-array",
      "west",
      DAY,
      deps(),
    );
    expect(otherType.ok).toBe(true);
  });

  it("refuses an unaffordable build without touching state", () => {
    const state = campaign([], SENSOR_COST - 1);
    const result = buildDeployable(state, "sensor-array", "west", DAY, deps());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      code: "insufficient-credits",
      required: SENSOR_COST,
      available: SENSOR_COST - 1,
    });
    expect(state.overworld.deployables).toEqual([]);
    expect(state.economy.ledger).toEqual([]);
  });

  it("refuses an unknown region", () => {
    const result = buildDeployable(
      campaign([], 5000),
      "sensor-array",
      "mars",
      DAY,
      deps(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ code: "unknown-region", regionId: "mars" });
  });

  it("refuses a type the catalogue lacks", () => {
    const withoutSensor = new DataDeployableTypeCatalogue([BATTERY]);
    const result = buildDeployable(
      campaign([], 5000),
      "sensor-array",
      "west",
      DAY,
      deps(withoutSensor),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      code: "unknown-deployable-type",
      typeId: "sensor-array",
    });
  });

  it("never mutates its input", () => {
    const state = campaign([deployable("d1", "sensor-array", "east")], 5000);
    const before = JSON.parse(JSON.stringify(state)) as CampaignState;
    buildDeployable(state, "defensive-battery", "west", DAY, deps());
    expect(state).toEqual(before);
  });
});

// ===========================================
// Upgrade
// ===========================================

describe("upgradeDeployable", () => {
  it("charges the next level's cost against the installation and steps it up", () => {
    const state = campaign(
      [
        deployable("d1", "sensor-array", "east"),
        deployable("d2", "bank", "west"),
      ],
      5000,
    );
    const cost = SENSOR.levels[2].buildCost;
    const result = upgradeDeployable(state, "d1", DAY, deps());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { overworld, economy, events } = result.value;
    expect(overworld.deployables.map((d) => [d.id, d.level])).toEqual([
      ["d1", 2],
      ["d2", 1],
    ]);
    expect(overworld.deployables[1]).toBe(state.overworld.deployables[1]);
    expect(economy.credits).toBe(5000 - cost);
    expect(economy.ledger.map((t) => [t.kind, t.ref, t.amount, t.day])).toEqual(
      [["purchase", "d1", -cost, DAY]],
    );
    expect(events.map((e) => e.type)).toEqual([
      CREDITS_CHANGED,
      DEPLOYABLE_UPGRADED,
    ]);
    expect(events[1]?.payload).toEqual({
      deployable: overworld.deployables[0],
      from: 1,
      to: 2,
      cost,
    });
  });

  it("climbs the whole ladder one level at a time and then refuses", () => {
    let state = campaign([deployable("d1", "sensor-array", "east")], 99_999);
    for (const expected of [2, 3]) {
      const step = upgradeDeployable(state, "d1", DAY, deps());
      expect(step.ok).toBe(true);
      if (!step.ok) return;
      state = {
        ...state,
        overworld: step.value.overworld,
        economy: step.value.economy,
      };
      expect(state.overworld.deployables[0]?.level).toBe(expected);
    }
    const refused = upgradeDeployable(state, "d1", DAY, deps());
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error).toEqual({
      code: "max-level-reached",
      deployableId: "d1",
      level: 3,
    });
    expect(state.economy.credits).toBe(
      99_999 - SENSOR.levels[2].buildCost - SENSOR.levels[3].buildCost,
    );
  });

  it("refuses an unaffordable upgrade without touching state", () => {
    const cost = BATTERY.levels[2].buildCost;
    const state = campaign(
      [deployable("d1", "defensive-battery", "west")],
      cost - 1,
    );
    const result = upgradeDeployable(state, "d1", DAY, deps());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      code: "insufficient-credits",
      required: cost,
      available: cost - 1,
    });
    expect(state.overworld.deployables[0]?.level).toBe(1);
    expect(state.economy.ledger).toEqual([]);
  });

  it("refuses an unknown installation", () => {
    const result = upgradeDeployable(campaign([], 5000), "ghost", DAY, deps());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      code: "unknown-deployable",
      deployableId: "ghost",
    });
  });

  it("upgrades an offline installation without bringing it online", () => {
    const state = campaign(
      [{ ...deployable("d1", "bank", "west"), online: false }],
      5000,
    );
    const result = upgradeDeployable(state, "d1", DAY, deps());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.overworld.deployables[0]).toMatchObject({
      level: 2,
      online: false,
    });
  });

  it("throws on an installation whose type the catalogue lacks", () => {
    const state = campaign([deployable("d1", "sensor-array", "east")], 5000);
    expect(() =>
      upgradeDeployable(
        state,
        "d1",
        DAY,
        deps(new DataDeployableTypeCatalogue([BATTERY])),
      ),
    ).toThrow(/unknown type "sensor-array"/);
  });

  it("never mutates its input", () => {
    const state = campaign([deployable("d1", "sensor-array", "east")], 5000);
    const before = JSON.parse(JSON.stringify(state)) as CampaignState;
    upgradeDeployable(state, "d1", DAY, deps());
    expect(state).toEqual(before);
  });
});

// ===========================================
// Decommission
// ===========================================

describe("decommissionDeployable", () => {
  it("removes the installation, refunds nothing and reports it", () => {
    const state = campaign(
      [
        deployable("d1", "sensor-array", "east"),
        deployable("d2", "defensive-battery", "west"),
      ],
      100,
    );
    const result = decommissionDeployable(state, "d1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.overworld.deployables.map((d) => d.id)).toEqual(["d2"]);
    expect(result.value.economy).toBe(state.economy);
    expect(result.value.events).toEqual([
      {
        type: DEPLOYABLE_REMOVED,
        payload: {
          deployableId: "d1",
          typeId: "sensor-array",
          regionId: "east",
        },
      },
    ]);
  });

  it("refuses an unknown installation", () => {
    const result = decommissionDeployable(campaign([], 100), "ghost");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      code: "unknown-deployable",
      deployableId: "ghost",
    });
  });

  it("frees a cap slot so the type can be rebuilt", () => {
    const full = campaign([deployable("d1", "sensor-array", "west")], 5000);
    const freed = decommissionDeployable(full, "d1");
    expect(freed.ok).toBe(true);
    if (!freed.ok) return;
    const rebuilt = buildDeployable(
      { ...full, overworld: freed.value.overworld },
      "sensor-array",
      "west",
      DAY,
      deps(),
    );
    expect(rebuilt.ok).toBe(true);
  });
});
