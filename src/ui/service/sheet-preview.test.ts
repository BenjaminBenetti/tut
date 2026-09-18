import { describe, expect, it } from "vitest";

import { MECH_RATING_TUNING } from "../../roster/data/mech-rating-tuning";
import { STARTER_PARTS } from "../../roster/data/parts";
import { STARTER_LOADOUT } from "../../roster/data/starter-roster";
import { UPGRADE_TUNING } from "../../roster/data/upgrade-tuning";
import type { MechLoadout } from "../../roster/model/mech-loadout";
import { StaticPartCatalogue } from "../../roster/repository/static-part-catalogue";
import { describeLoadout } from "../../roster/service/loadout-validation-service";
import { UNIT_TUNING } from "../../tactical/data/unit-tuning";
import { formatDelta, sheetPreview } from "./sheet-preview";

// ===========================================
// Fixtures
// ===========================================

const PARTS = new StaticPartCatalogue(STARTER_PARTS);

/** The description of a loadout against the shipped content. */
function describe_(loadout: MechLoadout) {
  return describeLoadout(loadout, PARTS, MECH_RATING_TUNING, UPGRADE_TUNING);
}

const STARTER = describe_(STARTER_LOADOUT);

// ===========================================
// Tests
// ===========================================

describe("sheetPreview", () => {
  it("is empty of deltas when the hovered part is the one already fitted", () => {
    const preview = sheetPreview(STARTER.sheet, STARTER, UNIT_TUNING.mech);
    expect(preview.deltas).toEqual([]);
    expect(preview.weapons).toEqual([]);
    expect(preview.warnings).toEqual([]);
  });

  it("prints the field's numbers, not the part sums: plating moves armor by what the ground sees", () => {
    const plated = describe_({
      ...STARTER_LOADOUT,
      utilityIds: [...STARTER_LOADOUT.utilityIds, "utility-armor-plating"],
    });
    const preview = sheetPreview(STARTER.sheet, plated, UNIT_TUNING.mech);
    const armor = preview.deltas.find((d) => d.field === "combat-armor");
    expect(armor).toBeDefined();
    // Sheet armor and field armor differ by the tuning's divisor (#1132);
    // the delta is in the field's units.
    const sheetDelta = (plated.sheet?.armor ?? 0) - (STARTER.sheet?.armor ?? 0);
    expect(sheetDelta).toBeGreaterThan(0);
    expect(armor?.delta).toBeLessThan(sheetDelta);
    expect(armor?.tone).toBe("better");
    // Plate costs money and weighs something: both neutral, both listed.
    expect(preview.deltas.find((d) => d.field === "totalCost")?.tone).toBe(
      "neutral",
    );
    expect(preview.deltas.find((d) => d.field === "weight")?.tone).toBe(
      "neutral",
    );
  });

  it("colours heat the other way round: more heat is worse", () => {
    const hot = describe_({
      ...STARTER_LOADOUT,
      utilityIds: [],
    });
    // Taking the radiator off raises net heat.
    const preview = sheetPreview(STARTER.sheet, hot, UNIT_TUNING.mech);
    const heat = preview.deltas.find((d) => d.field === "heat");
    expect(heat?.delta).toBeGreaterThan(0);
    expect(heat?.tone).toBe("worse");
  });

  it("names the incoming weapon for the slot it refits, and warns when the build would break", () => {
    const railgun = describe_({
      ...STARTER_LOADOUT,
      armWeaponId: "arm-weapon-railgun",
    });
    const preview = sheetPreview(STARTER.sheet, railgun, UNIT_TUNING.mech);
    expect(preview.weapons).toEqual([
      expect.objectContaining({ slot: "arm-weapon", name: "Railgun" }),
    ]);
    expect(preview.weapons[0]?.text).toMatch(/^range \d+ · acc/);
    expect(preview.warnings).toHaveLength(1);
    expect(preview.warnings[0]).toContain("carries at most");
    // The deltas are still there: the sheet is summed over capacity.
    expect(
      preview.deltas.find((d) => d.field === "weight")?.delta,
    ).toBeGreaterThan(0);
  });

  it("previews a chassis capacity change without counting the frame's own mass as equipment", () => {
    const next = describe_({
      ...STARTER_LOADOUT,
      chassisId: "chassis-bulwark",
    });
    const preview = sheetPreview(STARTER.sheet, next, UNIT_TUNING.mech);
    expect(preview.weightBudget).toEqual({ used: 40, limit: 70 });
    expect(
      preview.deltas.find(({ field }) => field === "weight"),
    ).toBeUndefined();
  });

  it("carries only warnings when the draft itself has no sheet", () => {
    const broken = describe_({ ...STARTER_LOADOUT, legsId: "" });
    const preview = sheetPreview(undefined, STARTER, UNIT_TUNING.mech);
    expect(preview.deltas).toEqual([]);
    const other = sheetPreview(STARTER.sheet, broken, UNIT_TUNING.mech);
    expect(other.deltas).toEqual([]);
    expect(other.warnings[0]).toContain("No part selected");
  });
});

describe("formatDelta", () => {
  it("signs every value and uses the typographic minus", () => {
    expect(formatDelta(3)).toBe("+3");
    expect(formatDelta(-2)).toBe("−2");
    expect(formatDelta(0.4)).toBe("+0");
  });
});
