import { describe, expect, it } from "vitest";

import { STARTER_PARTS } from "../../roster/data/parts";
import type { MechLoadout } from "../../roster/model/mech-loadout";
import { MODEL_MANIFEST } from "./model-manifest";
import { PART_MODELS, mechAssemblyFor, partModels } from "./part-model-table";

// ===========================================
// Fixtures
// ===========================================

/** A loadout naming one part in every single-part slot. */
const LOADOUT: MechLoadout = {
  name: "Test",
  chassisId: "chassis-atlas",
  legsId: "legs-jumper",
  armsId: "arms-brace",
  armWeaponId: "arm-weapon-railgun",
  backWeaponId: "back-weapon-mortar",
  utilityIds: ["utility-radiator"],
};

// ===========================================
// Tests
// ===========================================

describe("PART_MODELS", () => {
  it("gives every part with a visual slot a model, and utilities none", () => {
    // The guard that matters: a part added to the catalogue without a
    // model silently draws nothing in the bay, and the stat sheet next
    // to it goes on looking complete. Utilities are the one slot with
    // no visual, so they are asserted absent rather than skipped.
    for (const part of STARTER_PARTS) {
      const models = partModels(part.id);
      if (part.slot === "utility") {
        expect(models, part.id).toBeUndefined();
      } else {
        expect(models, part.id).toBeDefined();
      }
    }
  });

  it("names only registered models", () => {
    const registered = Object.keys(MODEL_MANIFEST);
    for (const [partId, models] of Object.entries(PART_MODELS)) {
      const ids =
        models?.kind === "pair" ? [models.left, models.right] : [models?.model];
      for (const id of ids) {
        expect(registered, `${partId} -> ${String(id)}`).toContain(id);
      }
    }
  });

  it("maps no part the catalogue does not have", () => {
    // Otherwise a renamed part leaves a dead row that looks like cover.
    const catalogue = STARTER_PARTS.map((part) => part.id);
    for (const partId of Object.keys(PART_MODELS)) {
      expect(catalogue, partId).toContain(partId);
    }
  });

  it("gives arms a left and a right, and everything else one model", () => {
    for (const part of STARTER_PARTS) {
      const models = partModels(part.id);
      if (models === undefined) {
        continue;
      }
      expect(models.kind, part.id).toBe(
        part.slot === "arms" ? "pair" : "single",
      );
    }
  });
});

describe("mechAssemblyFor", () => {
  it("resolves every slot of a loadout", () => {
    expect(mechAssemblyFor(LOADOUT)).toEqual({
      legs: "tdf.mech.legs.jumper",
      chassis: "tdf.mech.chassis.atlas",
      armLeft: "tdf.mech.arms.brace-l",
      armRight: "tdf.mech.arms.brace-r",
      armWeapon: "tdf.mech.weapon-arm.railgun",
      backWeapon: "tdf.mech.weapon-back.mortar",
    });
  });

  it("leaves a slot undefined when the part has no model", () => {
    // A draft mid-edit, or a part from a later tier that has no art
    // yet: the rest of the mech still resolves.
    const assembly = mechAssemblyFor({
      ...LOADOUT,
      legsId: "legs-nonexistent",
    });
    expect(assembly.legs).toBeUndefined();
    expect(assembly.chassis).toBe("tdf.mech.chassis.atlas");
  });

  it("fits the arm weapon once, not to both arms", () => {
    // The loadout buys one arm weapon and the sheet counts it once;
    // drawing two would show a gun the player never paid for.
    const assembly = mechAssemblyFor(LOADOUT);
    expect(assembly.armWeapon).toBe("tdf.mech.weapon-arm.railgun");
    expect(
      Object.values(assembly).filter((id) => id === assembly.armWeapon),
    ).toHaveLength(1);
  });
});
