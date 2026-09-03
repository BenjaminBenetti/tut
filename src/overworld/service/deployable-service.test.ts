import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { CREDITS_CHANGED } from "../../economy/model/economy-event";
import { LedgerTransactionService } from "../../economy/service/transaction-service";
import { DEPLOYABLE_TYPES } from "../data/deployable-types";
import type { CampaignState } from "../model/campaign-state";
import type { Deployable } from "../model/deployable";
import { DEPLOYABLE_BUILT } from "../model/deployable-built-event";
import { DEPLOYABLE_REMOVED } from "../model/deployable-removed-event";
import type { DeployableType } from "../model/deployable-type";
import { DEPLOYABLE_TYPE_IDS } from "../model/deployable-type";
import { DataDeployableTypeCatalogue } from "../repository/deployable-type-catalogue";
import type { DeployableServiceDeps } from "./deployable-service";
import { buildDeployable, decommissionDeployable } from "./deployable-service";
import { buildEarthMap } from "./earth-map-builder";

// ===========================================
// Fixtures
// ===========================================

const BATTERY = DEPLOYABLE_TYPES["defensive-battery"];
const SENSOR = DEPLOYABLE_TYPES["sensor-array"];
const DAY = 9;

const CATALOGUE = new DataDeployableTypeCatalogue(
  DEPLOYABLE_TYPE_IDS.map((id) => DEPLOYABLE_TYPES[id]),
);

function deployable(
  id: string,
  typeId: DeployableType["id"],
  regionId: string,
): Deployable {
  return { id, typeId, regionId, builtDay: 1, online: true };
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
      spreadCooldowns: {},
      missions: [],
      pendingEvents: [],
      deployables,
      hives: [],
    },
    roster: { squads: [], mechs: [], savedLoadouts: [], graveyard: [] },
    economy: { credits, ledger: [] },
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
  it("charges the build cost, places the installation online and reports both", () => {
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
        builtDay: DAY,
        online: true,
      },
    ]);
    expect(economy.credits).toBe(5000 - BATTERY.buildCost);
    expect(economy.ledger.map((t) => [t.kind, t.ref, t.amount, t.day])).toEqual(
      [["purchase", "deployable-1", -BATTERY.buildCost, DAY]],
    );
    expect(events.map((e) => e.type)).toEqual([
      CREDITS_CHANGED,
      DEPLOYABLE_BUILT,
    ]);
    expect(events[1]?.payload).toEqual({
      deployable: overworld.deployables[0],
      cost: BATTERY.buildCost,
    });
    expect(overworld.map).toBe(state.overworld.map);
  });

  it("enforces the cap per type per region, counting offline installations", () => {
    const full = campaign(
      [
        deployable("d1", "defensive-battery", "west"),
        { ...deployable("d2", "defensive-battery", "west"), online: false },
      ],
      99_999,
    );
    expect(BATTERY.maxPerRegion).toBe(2);
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
      cap: 2,
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
    const state = campaign([], SENSOR.buildCost - 1);
    const result = buildDeployable(state, "sensor-array", "west", DAY, deps());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      code: "insufficient-credits",
      required: SENSOR.buildCost,
      available: SENSOR.buildCost - 1,
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
