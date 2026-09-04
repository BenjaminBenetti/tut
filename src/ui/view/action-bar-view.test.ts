// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ActionBarView } from "./action-bar-view";

let root: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = "";
  root = document.createElement("div");
  document.body.appendChild(root);
});
// ===========================================
// One button per weapon (#532)
// ===========================================

describe("ActionBarView weapons", () => {
  const ARM = { id: "arm-weapon", name: "Autocannon", ready: true };
  const BACK = { id: "back-weapon", name: "Mortar", ready: true };

  /** Every attack button currently in the bar, in order. */
  const attackButtons = (): HTMLButtonElement[] => [
    ...root.querySelectorAll<HTMLButtonElement>(
      '#action-bar [data-action="attack"]',
    ),
  ];

  it("keeps one Attack button for a unit carrying one weapon", () => {
    const view = new ActionBarView({ onAction: vi.fn() });
    view.mount(root);
    view.update({
      canAct: true,
      playerPhase: true,
      mode: undefined,
      weapons: [{ id: "primary", name: "Attack", ready: true }],
    });
    const buttons = attackButtons();
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.dataset.weaponId).toBeUndefined();
  });

  it("offers one button per weapon, named after it, when a unit carries several", () => {
    const view = new ActionBarView({ onAction: vi.fn() });
    view.mount(root);
    view.update({
      canAct: true,
      playerPhase: true,
      mode: undefined,
      weapons: [ARM, BACK],
    });
    const buttons = attackButtons();
    expect(buttons.map((b) => b.dataset.weaponId)).toEqual([
      "arm-weapon",
      "back-weapon",
    ]);
    expect(
      buttons.map((b) => b.querySelector(".tut-btn__label")?.textContent),
    ).toEqual(["Autocannon", "Mortar"]);
  });

  it("reports which weapon was pressed", () => {
    const onAction = vi.fn();
    const view = new ActionBarView({ onAction });
    view.mount(root);
    view.update({
      canAct: true,
      playerPhase: true,
      mode: undefined,
      weapons: [ARM, BACK],
    });
    attackButtons()[1]?.click();
    expect(onAction).toHaveBeenCalledWith("attack", "back-weapon");
  });

  it("disables a weapon that is not ready but still shows it", () => {
    const view = new ActionBarView({ onAction: vi.fn() });
    view.mount(root);
    view.update({
      canAct: true,
      playerPhase: true,
      mode: undefined,
      weapons: [{ ...ARM, ready: false }, BACK],
    });
    const buttons = attackButtons();
    // Shown, so the player can see the gun exists and is empty.
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.disabled).toBe(true);
    expect(buttons[1]?.disabled).toBe(false);
  });

  it("marks only the armed weapon as pressed", () => {
    const view = new ActionBarView({ onAction: vi.fn() });
    view.mount(root);
    view.update({
      canAct: true,
      playerPhase: true,
      mode: "attack",
      weapons: [ARM, BACK],
      armedWeaponId: "back-weapon",
    });
    const buttons = attackButtons();
    expect(buttons[0]?.getAttribute("aria-pressed")).toBe("false");
    expect(buttons[1]?.getAttribute("aria-pressed")).toBe("true");
  });

  it("goes back to a single Attack button when the selection changes", () => {
    const view = new ActionBarView({ onAction: vi.fn() });
    view.mount(root);
    view.update({
      canAct: true,
      playerPhase: true,
      mode: undefined,
      weapons: [ARM, BACK],
    });
    expect(attackButtons()).toHaveLength(2);
    view.update({
      canAct: true,
      playerPhase: true,
      mode: undefined,
      weapons: [{ id: "primary", name: "Attack", ready: true }],
    });
    expect(attackButtons()).toHaveLength(1);
  });
});
