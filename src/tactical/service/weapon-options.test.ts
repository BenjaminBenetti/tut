import { describe, expect, it } from "vitest";

import { COMBAT_TUNING } from "../data/combat-tuning";
import { attack } from "../model/attack-command";
import type { TacticalState } from "../model/tactical-state";
import type { UnitTemplate } from "../model/unit-template";
import { DEFAULT_WEAPON_NAME, PRIMARY_WEAPON_ID } from "../model/unit-weapon";
import { previewAttack, weaponOptions } from "./combat-service";
import {
  missionWith,
  openField,
  unitAt,
} from "./tactical-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

const T = COMBAT_TUNING;
const at = (x: number, z: number) => ({ x, y: 0, z });

/** A mech template carrying an arm gun and a back gun with different reach. */
function twoWeaponTemplate(base: UnitTemplate): UnitTemplate {
  return {
    ...base,
    weapons: [
      {
        id: "arm-weapon",
        name: "Autocannon",
        profile: { range: 4, accuracy: 70, damage: 8, armorPen: 2 },
        charges: 2,
      },
      {
        id: "back-weapon",
        name: "Mortar",
        profile: { range: 12, accuracy: 50, damage: 14, armorPen: 0 },
        charges: 1,
      },
    ],
  };
}

/** A mission with one two-weapon TDF unit and a bug `gap` tiles east of it. */
function armed(gap: number): TacticalState {
  const shooter = unitAt("s1", "infantry", at(1, 1));
  const bug = unitAt("b1", "infantry", at(1 + gap, 1), { team: "bugs" });
  const base = missionWith(openField().build(), [shooter, bug]);
  return {
    ...base,
    templates: {
      ...base.templates,
      [shooter.templateId]: twoWeaponTemplate(
        base.templates[shooter.templateId]!,
      ),
    },
  };
}

/** The stock single-weapon fixture, unchanged by #532. */
function plain(): TacticalState {
  return missionWith(openField().build(), [
    unitAt("s1", "infantry", at(1, 1)),
    unitAt("b1", "infantry", at(3, 1), { team: "bugs" }),
  ]);
}

// ===========================================
// Tests
// ===========================================

describe("one attack per weapon (#532)", () => {
  it("offers every weapon a unit carries, in template order", () => {
    const options = weaponOptions(armed(2), "s1", T);
    expect(options.map((o) => o.weapon.name)).toEqual(["Autocannon", "Mortar"]);
    expect(options.every((o) => o.ready)).toBe(true);
    expect(options.map((o) => o.charges)).toEqual([2, 1]);
  });

  it("resolves each weapon with its own range, accuracy and damage", () => {
    // Six tiles out: beyond the autocannon, inside the mortar.
    const mission = armed(6);
    const close = previewAttack(mission, "s1", "b1", T, "arm-weapon");
    expect(close.ok).toBe(false);
    if (!close.ok) {
      expect(close.error.kind).toBe("out-of-range");
    }
    const far = previewAttack(mission, "s1", "b1", T, "back-weapon");
    expect(far.ok).toBe(true);
    if (!far.ok) return;
    // The mortar's own accuracy and damage, not an average of the two.
    expect(far.value.damage[1]).toBeGreaterThan(far.value.damage[0]);
    expect(far.value.hitChance).toBeLessThan(70);
  });

  it("names the weapon on the command, and defaults to the first", () => {
    expect(attack("s1", "b1", "back-weapon").payload).toMatchObject({
      weaponId: "back-weapon",
    });
    // A bare attack carries no weapon and means the first one.
    expect("weaponId" in attack("s1", "b1").payload).toBe(false);
    const mission = armed(2);
    const bare = previewAttack(mission, "s1", "b1", T);
    const first = previewAttack(mission, "s1", "b1", T, "arm-weapon");
    expect(bare.ok && first.ok && bare.value).toEqual(
      first.ok ? first.value : undefined,
    );
  });

  it("counts charges per weapon, so an empty gun does not silence the other", () => {
    const mission = armed(2);
    const spent: TacticalState = {
      ...mission,
      units: mission.units.map((u) =>
        u.id === "s1" ? { ...u, charges: { "arm-weapon": 0 } } : u,
      ),
    };
    const options = weaponOptions(spent, "s1", T);
    expect(options[0]).toMatchObject({ ready: false, charges: 0 });
    expect(options[0]?.refusal?.kind).toBe("no-charges");
    // The back gun is untouched and still fires.
    expect(options[1]).toMatchObject({ ready: true, charges: 1 });
    expect(previewAttack(spent, "s1", "b1", T, "back-weapon").ok).toBe(true);
    expect(previewAttack(spent, "s1", "b1", T, "arm-weapon").ok).toBe(false);
  });

  it("refuses a weapon the unit does not carry", () => {
    const refused = previewAttack(armed(2), "s1", "b1", T, "nose-cannon");
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.kind).toBe("no-such-weapon");
  });

  it("lists an unready weapon rather than hiding it, so a menu can explain", () => {
    // #529 renders this list; a menu that drops the entry teaches nothing.
    const mission = armed(2);
    const spent: TacticalState = {
      ...mission,
      units: mission.units.map((u) => (u.id === "s1" ? { ...u, ap: 0 } : u)),
    };
    const options = weaponOptions(spent, "s1", T);
    expect(options).toHaveLength(2);
    expect(options.every((o) => !o.ready)).toBe(true);
    expect(options.every((o) => o.refusal?.kind === "no-action-points")).toBe(
      true,
    );
  });
});

describe("single-weapon units are unchanged by #532", () => {
  it("a squad still carries exactly one weapon, named as it always was", () => {
    const mission = plain();
    const options = weaponOptions(mission, "s1", T);
    expect(options).toHaveLength(1);
    expect(options[0]?.weapon.id).toBe(PRIMARY_WEAPON_ID);
    expect(options[0]?.weapon.name).toBe(DEFAULT_WEAPON_NAME);
  });

  it("a bare attack and its explicit weapon give the identical preview", () => {
    const mission = plain();
    const bare = previewAttack(mission, "s1", "b1", T);
    const named = previewAttack(mission, "s1", "b1", T, PRIMARY_WEAPON_ID);
    expect(bare.ok).toBe(true);
    expect(named.ok).toBe(true);
    if (!bare.ok || !named.ok) return;
    expect(bare.value).toEqual(named.value);
  });

  it("a weapon with no pool reports no charges and stays ready", () => {
    const options = weaponOptions(plain(), "s1", T);
    expect(options[0]?.charges).toBeUndefined();
    expect(options[0]?.ready).toBe(true);
  });
});
