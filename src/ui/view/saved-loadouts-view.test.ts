// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { STARTER_LOADOUT } from "../../roster/data/starter-roster";
import { SavedLoadoutsView } from "./saved-loadouts-view";

// ===========================================
// Fixtures
// ===========================================

/** A mounted view with spies on every handler. */
function mountView() {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const handlers = {
    onLoad: vi.fn(),
    onDelete: vi.fn(),
    onSave: vi.fn(),
    onNameChange: vi.fn(),
  };
  const view = new SavedLoadoutsView(handlers);
  view.mount(root);
  return { root, view, handlers };
}

// ===========================================
// Tests
// ===========================================

describe("SavedLoadoutsView", () => {
  it("lists templates with Load and Delete and shows the empty note when there are none", () => {
    const { root, view, handlers } = mountView();
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
    expect(handlers.onLoad).toHaveBeenCalledWith(brawler);
    rows[0]!
      .querySelector<HTMLButtonElement>('[data-action="delete"]')!
      .click();
    expect(handlers.onDelete).toHaveBeenCalledWith(STARTER_LOADOUT.name);

    view.unmount();
    expect(root.childElementCount).toBe(0);
  });

  it("opens from the bottom-bar button, names the draft on it, and closes on Escape or a click outside (#1145)", () => {
    const { root, view } = mountView();
    const toggle = root.querySelector<HTMLButtonElement>(
      '[data-action="toggle-loadouts"]',
    )!;
    const popover = root.querySelector<HTMLElement>(
      '[data-role="loadout-popover"]',
    )!;
    expect(popover.hidden).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    view.setName("Skirmisher");
    expect(toggle.textContent).toContain("Skirmisher");

    toggle.click();
    expect(view.open).toBe(true);
    expect(popover.hidden).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(view.open).toBe(false);

    toggle.click();
    expect(view.open).toBe(true);
    // A click inside keeps it open; one outside closes it.
    popover.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(view.open).toBe(true);
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(view.open).toBe(false);
    view.unmount();
  });

  it("reports the name as it is typed and Save when pressed, and honours setSaveEnabled", () => {
    const { root, view, handlers } = mountView();
    const name = root.querySelector<HTMLInputElement>(
      '[data-field="loadout-name"]',
    )!;
    name.value = "Brawler";
    name.dispatchEvent(new Event("input"));
    expect(handlers.onNameChange).toHaveBeenCalledWith("Brawler");

    const save = root.querySelector<HTMLButtonElement>(
      '[data-action="save-loadout"]',
    )!;
    view.setSaveEnabled(false);
    expect(save.disabled).toBe(true);
    view.setSaveEnabled(true);
    save.click();
    expect(handlers.onSave).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});
