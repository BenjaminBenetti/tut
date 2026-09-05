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

  it("marks seven rows with a glyph and leaves the two derived figures bare", () => {
    // #673 unblocked the sheet's glyphs. Power balance and combat rating
    // stay bare on purpose: they are sums, not a part's contribution,
    // and there is no registered glyph that means either.
    const root = document.createElement("div");
    new StatSheetView().mount(root);
    const glyphOf = (field: string): string | undefined =>
      root
        .querySelector<HTMLElement>(`[data-field="${field}"]`)
        ?.previousElementSibling?.querySelector<HTMLElement>("[data-icon]")
        ?.dataset.icon;
    expect(glyphOf("armor")).toBe("armor");
    expect(glyphOf("mobility")).toBe("move");
    expect(glyphOf("heat")).toBe("heat");
    expect(glyphOf("accuracy")).toBe("accuracy");
    expect(glyphOf("firepower")).toBe("firepower");
    expect(glyphOf("weight")).toBe("weight");
    expect(glyphOf("totalCost")).toBe("credits");
    expect(glyphOf("powerBalance")).toBeUndefined();
    expect(glyphOf("combatRating")).toBeUndefined();
    // Decorative: the label beside it is the accessible name.
    for (const glyph of root.querySelectorAll("[data-icon]")) {
      expect(glyph.getAttribute("aria-hidden")).toBe("true");
    }
  });
});
