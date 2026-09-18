import { describe, expect, it } from "vitest";
import { UNIT_TUNING } from "../../tactical/data/unit-tuning";
import { mechCombatProfile } from "../../tactical/service/mech-combat-profile";
import { PART_SLOTS } from "../model/mech-part";
import { StaticPartCatalogue } from "../repository/static-part-catalogue";
import { fitPart } from "../service/loadout-fit-service";
import { validateLoadout } from "../service/loadout-validation-service";
import { MECH_BLUEPRINTS } from "./mech-blueprints";
import { MECH_RATING_TUNING } from "./mech-rating-tuning";
import { STARTER_PARTS } from "./parts";
import { STARTER_LOADOUT } from "./starter-roster";
import { UPGRADE_TUNING } from "./upgrade-tuning";

const PARTS = new StaticPartCatalogue(STARTER_PARTS);

describe("complete mech roster", () => {
  it("offers all 48 approved parts in the six existing slots and all three tiers", () => {
    expect(STARTER_PARTS).toHaveLength(48);
    expect(PART_SLOTS.map((slot) => PARTS.partsForSlot(slot).length)).toEqual([
      6, 6, 6, 10, 8, 12,
    ]);
    expect(new Set(STARTER_PARTS.map((part) => part.tier))).toEqual(
      new Set([1, 2, 3]),
    );
  });

  it.each(MECH_BLUEPRINTS)(
    "builds $name inside every budget with its advertised systems",
    (loadout) => {
      const result = validateLoadout(
        loadout,
        PARTS,
        MECH_RATING_TUNING,
        UPGRADE_TUNING,
      );
      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (!result.ok) return;
      const profile = mechCombatProfile(result.value, UNIT_TUNING.mech);
      expect(profile.weapons).toHaveLength(2);
      expect(
        profile.weapons.every(
          (weapon) =>
            (weapon.profile.heat ?? 0) <= (profile.systems?.heatCapacity ?? 0),
        ),
      ).toBe(true);
      expect(profile.systems?.cooling).toBeGreaterThan(
        profile.systems?.idleHeat ?? Infinity,
      );
    },
  );

  it("lets every part fit into at least one complete working machine", () => {
    const baseline = {
      ...STARTER_LOADOUT,
      chassisId: "chassis-atlas",
      armWeaponId: "arm-weapon-flamer",
      backWeaponId: "back-weapon-smoke-launcher",
      utilityIds: [],
    };
    for (const part of STARTER_PARTS) {
      const fitted = fitPart(baseline, part, PARTS);
      expect(
        validateLoadout(fitted, PARTS, MECH_RATING_TUNING, UPGRADE_TUNING).ok,
        part.id,
      ).toBe(true);
    }
  });

  it("makes the Courser's mobility visible on the battlefield", () => {
    const vanguard = validateLoadout(
      STARTER_LOADOUT,
      PARTS,
      MECH_RATING_TUNING,
      UPGRADE_TUNING,
    );
    const courser = validateLoadout(
      { ...STARTER_LOADOUT, chassisId: "chassis-courser" },
      PARTS,
      MECH_RATING_TUNING,
      UPGRADE_TUNING,
    );
    if (!vanguard.ok || !courser.ok)
      throw new Error("starter frames should fit");
    expect(
      mechCombatProfile(courser.value, UNIT_TUNING.mech).move,
    ).toBeGreaterThan(mechCombatProfile(vanguard.value, UNIT_TUNING.mech).move);
  });

  it("prevents duplicate active utilities while allowing multiple passive radiators", () => {
    const baseline = { ...STARTER_LOADOUT, chassisId: "chassis-atlas" };
    const duplicates = validateLoadout(
      {
        ...baseline,
        utilityIds: [
          "utility-emergency-coolant-injector",
          "utility-emergency-coolant-injector",
        ],
      },
      PARTS,
      MECH_RATING_TUNING,
      UPGRADE_TUNING,
    );
    expect(duplicates.ok).toBe(false);
    if (!duplicates.ok)
      expect(
        duplicates.error.some(
          (error) => error.code === "duplicate-active-utility",
        ),
      ).toBe(true);
    expect(
      validateLoadout(
        { ...baseline, utilityIds: ["utility-radiator", "utility-radiator"] },
        PARTS,
        MECH_RATING_TUNING,
        UPGRADE_TUNING,
      ).ok,
    ).toBe(true);
  });

  it("reduces energy heat with Conduit arms without reducing ballistic heat", () => {
    const result = validateLoadout(
      {
        ...STARTER_LOADOUT,
        chassisId: "chassis-atlas",
        armsId: "arms-conduit",
        armWeaponId: "arm-weapon-thermal-lance",
      },
      PARTS,
      MECH_RATING_TUNING,
      UPGRADE_TUNING,
    );
    if (!result.ok) throw new Error("expected a conduit loadout");
    const profile = mechCombatProfile(result.value, UNIT_TUNING.mech);
    expect(profile.weapons[0]?.profile.heat).toBe(9);
    expect(profile.weapons[1]?.profile.heat).toBe(4);
    expect(
      profile.weapons.every((weapon) => weapon.charges === undefined),
    ).toBe(true);
  });
});
