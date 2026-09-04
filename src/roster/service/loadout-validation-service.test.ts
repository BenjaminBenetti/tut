import { describe, expect, it } from "vitest";

import { MECH_RATING_TUNING } from "../data/mech-rating-tuning";
import { STARTER_PARTS } from "../data/parts";
import { UPGRADE_TUNING } from "../data/upgrade-tuning";
import { STARTER_LOADOUT } from "../data/starter-roster";
import type { LoadoutErrorCode } from "../model/loadout-error";
import type { MechLoadout } from "../model/mech-loadout";
import type {
  ChassisPart,
  ComponentPart,
  ComponentSlot,
  PartStats,
} from "../model/mech-part";
import type { MechRatingTuning } from "../model/mech-rating-tuning";
import { StaticPartCatalogue } from "../repository/static-part-catalogue";
import {
  computeCombatRating,
  validateLoadout,
} from "./loadout-validation-service";

// ===========================================
// Fixtures
// ===========================================

/** Zero stats with the given overrides. */
function stats(overrides: Partial<PartStats>): PartStats {
  return {
    armor: 0,
    mobility: 0,
    heat: 0,
    power: 0,
    accuracy: 0,
    firepower: 0,
    weight: 0,
    ...overrides,
  };
}

/** A component with the given id, slot, cost and stats. */
function component(
  id: string,
  slot: ComponentSlot,
  cost: number,
  overrides: Partial<PartStats>,
): ComponentPart {
  return {
    id,
    name: id,
    slot,
    tier: 1,
    cost,
    stats: stats(overrides),
    description: "",
  };
}

const CHASSIS: ChassisPart = {
  id: "chassis",
  name: "Frame",
  slot: "chassis",
  tier: 1,
  cost: 1000,
  stats: stats({ armor: 20, mobility: 5, heat: -2, power: 30, weight: 20 }),
  capacity: { maxWeight: 40, powerOutput: 30, utilitySlots: 2 },
  description: "",
};

const CATALOGUE = new StaticPartCatalogue([
  CHASSIS,
  component("legs", "legs", 100, {
    armor: 5,
    mobility: 2,
    power: -4,
    weight: 8,
  }),
  component("arms", "arms", 100, { accuracy: 5, power: -3, weight: 6 }),
  component("gun", "arm-weapon", 200, {
    heat: 3,
    power: -6,
    firepower: 18,
    weight: 10,
  }),
  component("pod", "back-weapon", 200, {
    heat: 4,
    power: -5,
    firepower: 22,
    weight: 12,
  }),
  component("radiator", "utility", 50, { heat: -4, power: -2, weight: 4 }),
  component("anvil", "utility", 50, { armor: 10, weight: 30 }),
  component("reactor-hog", "utility", 50, { power: -25, weight: 1 }),
  component("chip", "utility", 10, {}),
]);

const VALID: MechLoadout = {
  name: "Test",
  chassisId: "chassis",
  legsId: "legs",
  armsId: "arms",
  armWeaponId: "gun",
  backWeaponId: "pod",
  utilityIds: ["radiator"],
};

const TUNING: MechRatingTuning = {
  armorWeight: 1,
  mobilityWeight: 3,
  accuracyWeight: 0.5,
  firepowerWeight: 2,
  heatPenalty: 2,
};

/** Runs validation and returns the error codes, failing the test on success. */
function errorCodes(loadout: MechLoadout): LoadoutErrorCode[] {
  const result = validateLoadout(loadout, CATALOGUE, TUNING, UPGRADE_TUNING);
  if (result.ok) {
    throw new Error("expected validation to fail");
  }
  return result.error.map((e) => e.code);
}

// ===========================================
// Valid loadout
// ===========================================

describe("validateLoadout on a valid loadout", () => {
  it("returns the summed stat sheet, cost and rating", () => {
    const result = validateLoadout(VALID, CATALOGUE, TUNING, UPGRADE_TUNING);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      armor: 25,
      mobility: 7,
      heat: 1,
      accuracy: 5,
      firepower: 40,
      weight: 60,
      powerBalance: 10,
      totalCost: 1650,
      // 25 + 21 + 2.5 + 80 − 2 = 126.5 → 127
      combatRating: 127,

      weapons: expect.any(Array) as unknown as never,
    });
  });

  it("allows a loadout with no utilities and exactly full weight and power", () => {
    const tight = new StaticPartCatalogue([
      {
        ...CHASSIS,
        capacity: { maxWeight: 36, powerOutput: 18, utilitySlots: 0 },
      },
      ...["legs", "arms", "gun", "pod"].map((id) => CATALOGUE.getPart(id)!),
    ]);
    const result = validateLoadout(
      { ...VALID, utilityIds: [] },
      tight,
      TUNING,
      UPGRADE_TUNING,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.weight).toBe(56);
    expect(result.value.powerBalance).toBe(0);
  });

  it("applies recorded upgrade levels to the stat sheet and its cost", () => {
    const upgraded: MechLoadout = {
      ...VALID,
      upgrades: { gun: 2, chassis: 1, legs: 9 },
    };
    const result = validateLoadout(upgraded, CATALOGUE, TUNING, UPGRADE_TUNING);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // gun firepower 18 × 1.2 → 22; chassis armor 20 × 1.1 → 22, mobility 5 × 1.1 → 6 (5.5 rounds up);
    // legs clamp to level 3: armor 5 × 1.3 → 7 (6.5 rounds up), mobility 2 × 1.3 → 3 (2.6).
    expect(result.value.armor).toBe(25 + 2 + 2);
    expect(result.value.mobility).toBe(7 + 1 + 1);
    expect(result.value.firepower).toBe(40 + 4);
    // weight and power never change with upgrades
    expect(result.value.weight).toBe(60);
    expect(result.value.powerBalance).toBe(10);
    // cost: base 1650 + gun (100 + 200) + chassis 500 + legs (50 + 100 + 150)
    expect(result.value.totalCost).toBe(1650 + 300 + 500 + 300);
  });

  it("does not mutate the loadout", () => {
    const copy = JSON.parse(JSON.stringify(VALID)) as MechLoadout;
    validateLoadout(VALID, CATALOGUE, TUNING, UPGRADE_TUNING);
    expect(VALID).toEqual(copy);
  });

  it("accepts the starter loadout against the shipped parts", () => {
    const catalogue = new StaticPartCatalogue(STARTER_PARTS);
    const result = validateLoadout(
      STARTER_LOADOUT,
      catalogue,
      MECH_RATING_TUNING,
      UPGRADE_TUNING,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.powerBalance).toBeGreaterThanOrEqual(0);
    expect(result.value.combatRating).toBeGreaterThan(0);
    expect(Number.isInteger(result.value.combatRating)).toBe(true);
  });
});

// ===========================================
// Structural errors
// ===========================================

describe("validateLoadout structural errors", () => {
  it("reports missing-part for an empty single-slot id", () => {
    const result = validateLoadout(
      { ...VALID, legsId: "" },
      CATALOGUE,
      TUNING,
      UPGRADE_TUNING,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject([
      { code: "missing-part", slot: "legs" },
    ]);
    expect(result.error[0]?.detail).toContain("legs");
  });

  it("reports missing-part for a blank utility id", () => {
    const result = validateLoadout(
      { ...VALID, utilityIds: ["  "] },
      CATALOGUE,
      TUNING,
      UPGRADE_TUNING,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual([
      expect.objectContaining({ code: "missing-part", slot: "utility" }),
    ]);
  });

  it("reports unknown-part for an id the catalogue lacks", () => {
    const result = validateLoadout(
      { ...VALID, armWeaponId: "nope" },
      CATALOGUE,
      TUNING,
      UPGRADE_TUNING,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject([
      { code: "unknown-part", slot: "arm-weapon" },
    ]);
    expect(result.error[0]?.detail).toContain("nope");
  });

  it("reports wrong-slot when a part is fitted to another slot", () => {
    const result = validateLoadout(
      { ...VALID, backWeaponId: "gun", utilityIds: ["legs"] },
      CATALOGUE,
      TUNING,
      UPGRADE_TUNING,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual([
      expect.objectContaining({ code: "wrong-slot", slot: "back-weapon" }),
      expect.objectContaining({ code: "wrong-slot", slot: "utility" }),
    ]);
  });

  it("skips capacity checks when the chassis cannot be resolved", () => {
    expect(
      errorCodes({
        ...VALID,
        chassisId: "",
        utilityIds: ["anvil", "anvil", "anvil"],
      }),
    ).toEqual(["missing-part"]);
    expect(errorCodes({ ...VALID, chassisId: "legs" })).toEqual(["wrong-slot"]);
  });
});

// ===========================================
// Capacity errors
// ===========================================

describe("validateLoadout capacity errors", () => {
  it("reports overweight when fitted parts exceed maxWeight", () => {
    // 8 + 6 + 10 + 12 + 30 = 66 > 40
    const result = validateLoadout(
      { ...VALID, utilityIds: ["anvil"] },
      CATALOGUE,
      TUNING,
      UPGRADE_TUNING,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject([
      { code: "overweight", slot: "chassis" },
    ]);
    expect(result.error[0]?.detail).toContain("66t");
  });

  it("reports over-power-budget when draw exceeds supply", () => {
    // 30 − (4 + 3 + 6 + 5 + 25) = −13
    const result = validateLoadout(
      { ...VALID, utilityIds: ["reactor-hog"] },
      CATALOGUE,
      TUNING,
      UPGRADE_TUNING,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject([
      { code: "over-power-budget", slot: "chassis" },
    ]);
    expect(result.error[0]?.detail).toContain("13");
  });

  it("reports too-many-utilities past the chassis' slots", () => {
    expect(
      errorCodes({ ...VALID, utilityIds: ["chip", "chip", "chip"] }),
    ).toEqual(["too-many-utilities"]);
  });

  it("collects structural and capacity errors together", () => {
    expect(
      errorCodes({
        ...VALID,
        armsId: "missing",
        utilityIds: ["anvil", "reactor-hog", "radiator"],
      }),
    ).toEqual([
      "unknown-part",
      "overweight",
      "over-power-budget",
      "too-many-utilities",
    ]);
  });
});

// ===========================================
// Combat rating
// ===========================================

describe("computeCombatRating", () => {
  it("weights each stat by the tuning", () => {
    expect(
      computeCombatRating(
        { armor: 10, mobility: 2, accuracy: 4, firepower: 5, heat: 0 },
        TUNING,
      ),
    ).toBe(28);
  });

  it("penalises only net positive heat", () => {
    const base = { armor: 10, mobility: 0, accuracy: 0, firepower: 0 };
    expect(computeCombatRating({ ...base, heat: 3 }, TUNING)).toBe(4);
    expect(computeCombatRating({ ...base, heat: -3 }, TUNING)).toBe(10);
  });

  it("rounds to an integer and never goes below zero", () => {
    expect(
      computeCombatRating(
        { armor: 1, mobility: 0, accuracy: 1, firepower: 0, heat: 0 },
        TUNING,
      ),
    ).toBe(2);
    expect(
      computeCombatRating(
        { armor: 0, mobility: 0, accuracy: 0, firepower: 0, heat: 50 },
        TUNING,
      ),
    ).toBe(0);
  });

  it("honours substitute tuning", () => {
    const gunsOnly: MechRatingTuning = {
      armorWeight: 0,
      mobilityWeight: 0,
      accuracyWeight: 0,
      firepowerWeight: 1,
      heatPenalty: 0,
    };
    expect(
      computeCombatRating(
        { armor: 99, mobility: 9, accuracy: 9, firepower: 7, heat: 9 },
        gunsOnly,
      ),
    ).toBe(7);
  });
});
