import { describe, expect, it } from "vitest";

import { STARTER_LOADOUT } from "../../roster/data/starter-roster";
import type { Mech } from "../../roster/model/mech";
import type { MechPricing } from "../../roster/model/mech-pricing";
import type { MissionOutcome, MissionResult } from "../model/mission-result";
import type { MechSalvageDeps } from "./mech-salvage-service";
import { mechSalvageOf, NO_SALVAGE } from "./mech-salvage-service";

// ===========================================
// Fixtures
// ===========================================

/** Prices by loadout name, so each fixture mech has its own price. */
const PRICES: Readonly<Record<string, number>> = {
  cheap: 1001,
  dear: 2851,
};

const PRICING: MechPricing = {
  priceOf: (loadout) => PRICES[loadout.name] ?? 0,
};

const HALF: MechSalvageDeps = { pricing: PRICING, tuning: { fraction: 0.5 } };

function mech(id: string, priced: string): Mech {
  return {
    id,
    name: id,
    loadout: { ...STARTER_LOADOUT, name: priced },
    damage: 0,
    kills: 0,
    missionsSurvived: 0,
    xp: 0,
  };
}

const MECHS: readonly Mech[] = [
  mech("mech-1", "dear"),
  mech("mech-2", "cheap"),
  mech("mech-3", "dear"),
];

function result(
  outcome: MissionOutcome,
  mechsDestroyed: readonly string[],
): MissionResult {
  return {
    missionId: "mission-1",
    cityId: "hub",
    outcome,
    squadCasualties: [],
    squadsWiped: [],
    mechsDestroyed,
    mechDamage: mechsDestroyed.map((mechId) => ({ mechId, damage: 100 })),
    creditsAwarded: 0,
    techPointsAwarded: 0,
    infestationDelta: 0,
  };
}

// ===========================================
// mechSalvageOf
// ===========================================

describe("mechSalvageOf", () => {
  it("pays the share of a destroyed mech's price when the mission was won", () => {
    expect(mechSalvageOf(result("won", ["mech-1"]), MECHS, HALF)).toEqual({
      credits: 1425,
      mechIds: ["mech-1"],
    });
  });

  it("pays it on an extraction too: the force held the field", () => {
    expect(mechSalvageOf(result("extracted", ["mech-2"]), MECHS, HALF)).toEqual(
      { credits: 500, mechIds: ["mech-2"] },
    );
  });

  it("pays nothing on a lost mission, whose wrecks are Wreck Recovery's", () => {
    expect(
      mechSalvageOf(result("lost", ["mech-1", "mech-2"]), MECHS, HALF),
    ).toEqual(NO_SALVAGE);
  });

  it("rounds each mech down, then sums", () => {
    // 1425.5 + 500.5 would round to 1926 as a sum; each is floored first.
    expect(
      mechSalvageOf(result("won", ["mech-1", "mech-2"]), MECHS, HALF),
    ).toEqual({ credits: 1925, mechIds: ["mech-1", "mech-2"] });
  });

  it("reads the share from the tuning", () => {
    const deps = { pricing: PRICING, tuning: { fraction: 0.4 } };
    expect(mechSalvageOf(result("won", ["mech-3"]), MECHS, deps).credits).toBe(
      1140,
    );
  });

  it("skips a destroyed mech the roster does not know", () => {
    expect(
      mechSalvageOf(result("won", ["mech-9", "mech-2"]), MECHS, HALF),
    ).toEqual({ credits: 500, mechIds: ["mech-2"] });
  });

  it("pays nothing when no mech was destroyed", () => {
    expect(mechSalvageOf(result("won", []), MECHS, HALF)).toEqual(NO_SALVAGE);
  });
});
