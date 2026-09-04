// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { err, ok } from "../../core/model/result";
import { StatSheetView } from "./stat-sheet-view";

describe("StatSheetView", () => {
  it("shows every value on success and dashes plus the error list on failure", () => {
    const root = document.createElement("div");
    const view = new StatSheetView();
    view.mount(root);
    const field = (name: string): HTMLElement =>
      root.querySelector<HTMLElement>(`[data-field="${name}"]`)!;

    view.update(
      ok({
        armor: 25,
        mobility: 7,
        heat: 1,
        accuracy: 5,
        firepower: 40,
        weight: 60,
        powerBalance: 10,
        totalCost: 1650,
        weapons: [],
        combatRating: 127,
      }),
    );
    expect(field("armor").textContent).toBe("25");
    expect(field("totalCost").textContent).toBe("¢1,650");
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
    expect(field("armor").textContent).toBe("—");
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
