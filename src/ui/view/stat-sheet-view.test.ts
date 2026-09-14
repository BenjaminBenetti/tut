// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { err, ok } from "../../core/model/result";
import type { MechStatSheet } from "../../roster/model/mech-stat-sheet";
import { UNIT_TUNING } from "../../tactical/data/unit-tuning";
import { mechCombatProfile } from "../../tactical/service/mech-combat-profile";
import { StatSheetView } from "./stat-sheet-view";

/** A sheet like the starter mech's: armor 20, two weapons. */
const SHEET: MechStatSheet = {
  armor: 20,
  mobility: 5,
  heat: -1,
  accuracy: 0,
  firepower: 40,
  weight: 60,
  powerBalance: 0,
  totalCost: 2850,
  combatRating: 113,
  weapons: [
    {
      id: "arm-weapon",
      name: "Autocannon",
      range: 10,
      accuracy: 5,
      firepower: 18,
      armorPen: 2,
      demoForce: 1,
    },
    {
      id: "back-weapon",
      name: "Missile Pod",
      range: 14,
      accuracy: 0,
      firepower: 22,
      armorPen: 1,
      aoe: { radius: 1, falloff: 0.5 },
      demoForce: 1,
    },
  ],
};

describe("StatSheetView", () => {
  it("prints the field's own numbers in the Combat block and the build numbers below (#1132)", () => {
    const root = document.createElement("div");
    const view = new StatSheetView(UNIT_TUNING.mech);
    view.mount(root);
    const field = (name: string): HTMLElement =>
      root.querySelector<HTMLElement>(`[data-field="${name}"]`)!;

    view.update(ok(SHEET));
    const profile = mechCombatProfile(SHEET, UNIT_TUNING.mech);
    // What the unit factory would freeze, not the part sums: 20 plate
    // is 6 per hit and 70 hit points, never "20 armor".
    expect(field("combat-hp").textContent).toBe("70");
    expect(field("combat-armor").textContent).toBe("6");
    expect(field("combat-move").textContent).toBe(String(profile.move));
    expect(field("combat-ap").textContent).toBe("2");
    expect(field("combat-sight").textContent).toBe("14");
    const weapons = [
      ...root.querySelectorAll<HTMLElement>('[data-role="combat-weapon"]'),
    ];
    expect(weapons.map((w) => w.dataset.weapon)).toEqual([
      "arm-weapon",
      "back-weapon",
    ]);
    expect(weapons[0]?.textContent).toContain("Autocannon");
    expect(weapons[0]?.textContent).toContain(
      `range 10 · acc ${String(profile.weapons[0]?.profile.accuracy)} · dmg 18 · pen 2 · demo 1`,
    );
    expect(weapons[1]?.textContent).toContain("blast 1");
    // The raw sums are not printed under the field's words.
    expect(root.querySelector('[data-field="armor"]')).toBeNull();
    expect(root.querySelector('[data-field="mobility"]')).toBeNull();
    expect(root.querySelector('[data-field="firepower"]')).toBeNull();
    expect(field("weight").textContent).toBe("60");
    expect(field("combatRating").textContent).toBe("113");
    expect(field("totalCost").textContent).toBe("¢2,850");
    expect(field("verdict").dataset.tone).toBe("ok");
    expect(
      root.querySelector<HTMLElement>('[data-role="errors"]')?.hidden,
    ).toBe(true);

    view.update(
      err([
        { code: "overweight", slot: "chassis", detail: "Too heavy." },
        { code: "missing-part", slot: "legs", detail: "No legs." },
      ]),
    );
    expect(field("combat-hp").textContent).toBe("—");
    expect(field("combat-weapons").textContent).toBe("—");
    expect(field("totalCost").textContent).toBe("—");
    expect(field("verdict").textContent).toContain("2 issues");
    const items = [
      ...root.querySelectorAll<HTMLElement>('[data-role="errors"] li'),
    ];
    expect(
      items.map((li) => [li.dataset.code, li.dataset.slot, li.textContent]),
    ).toEqual([
      ["overweight", "chassis", "Too heavy."],
      ["missing-part", "legs", "No legs."],
    ]);

    view.unmount();
    expect(root.childElementCount).toBe(0);
  });
});
