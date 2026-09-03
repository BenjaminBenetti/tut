// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { STARTER_LOADOUT } from "../../roster/data/starter-roster";
import { SavedLoadoutsView } from "./saved-loadouts-view";

describe("SavedLoadoutsView", () => {
  it("lists templates with Load and Delete and shows the empty note when there are none", () => {
    const root = document.createElement("div");
    const onLoad = vi.fn();
    const onDelete = vi.fn();
    const view = new SavedLoadoutsView({ onLoad, onDelete });
    view.mount(root);

    view.update([]);
    expect(
      root.querySelector<HTMLElement>('[data-role="no-saved"]')?.hidden,
    ).toBe(false);

    const brawler = { ...STARTER_LOADOUT, name: "Brawler" };
    view.update([STARTER_LOADOUT, brawler]);
    expect(
      root.querySelector<HTMLElement>('[data-role="no-saved"]')?.hidden,
    ).toBe(true);
    const rows = [...root.querySelectorAll<HTMLElement>("li")];
    expect(rows.map((r) => r.dataset.loadoutName)).toEqual([
      STARTER_LOADOUT.name,
      "Brawler",
    ]);
    rows[1]!.querySelector<HTMLButtonElement>('[data-action="load"]')!.click();
    expect(onLoad).toHaveBeenCalledWith(brawler);
    rows[0]!
      .querySelector<HTMLButtonElement>('[data-action="delete"]')!
      .click();
    expect(onDelete).toHaveBeenCalledWith(STARTER_LOADOUT.name);

    view.unmount();
    expect(root.childElementCount).toBe(0);
  });
});
