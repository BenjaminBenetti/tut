// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StageTransition } from "../service/stage-transition";
import { StageTransitionView } from "./stage-transition-view";

// ===========================================
// Fixtures
// ===========================================

const TRANSITION: StageTransition = {
  headline: "Hull cleared. The squad boards the core.",
  next: "Next: The core, stage 2 of 2",
  note: "No repairs, no re-arm, no swaps: the squad goes on as it stands.",
  survivors: [
    {
      unitId: "mech-1",
      name: "Hammerhead",
      hp: "7 / 10",
      wounded: true,
      stores: ["Autocannon · heat 2 / 4", "Laser · heat 3 / 3"],
    },
    {
      unitId: "squad-1",
      name: "Alpha",
      hp: "6 / 6",
      wounded: false,
      stores: [],
    },
  ],
};

// ===========================================
// StageTransitionView
// ===========================================

describe("StageTransitionView (#1179)", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  const panel = () =>
    root.querySelector<HTMLElement>('[data-role="stage-transition"]');
  const text = (field: string) =>
    root.querySelector(`[data-field="${field}"]`)?.textContent;

  it("is hidden until shown, then says what was cleared, what is next and that nothing mends", () => {
    const view = new StageTransitionView({ onContinue: vi.fn() });
    view.mount(root);
    expect(panel()?.hidden).toBe(true);
    expect(view.open).toBe(false);
    view.show(TRANSITION);
    expect(view.open).toBe(true);
    expect(text("stage-headline")).toBe(TRANSITION.headline);
    expect(text("stage-next")).toBe(TRANSITION.next);
    expect(text("stage-note")).toBe(TRANSITION.note);
  });

  it("lists every survivor with its health and each pool on its own line", () => {
    const view = new StageTransitionView({ onContinue: vi.fn() });
    view.mount(root);
    view.show(TRANSITION);
    const rows = [
      ...root.querySelectorAll<HTMLTableRowElement>(
        '[data-role="stage-survivors"] > tr',
      ),
    ];
    expect(rows.map((row) => row.dataset.unitId)).toEqual([
      "mech-1",
      "squad-1",
    ]);
    const [mech, squad] = rows;
    expect(mech?.cells[0]?.textContent).toBe("Hammerhead");
    const hp = mech?.querySelector<HTMLElement>('[data-field="survivor-hp"]');
    expect(hp?.textContent).toBe("7 / 10");
    expect(hp?.dataset.wounded).toBe("true");
    expect(
      [
        ...(mech?.querySelectorAll('[data-field="survivor-stores"] > div') ??
          []),
      ].map((line) => line.textContent),
    ).toEqual(["Autocannon · heat 2 / 4", "Laser · heat 3 / 3"]);
    expect(
      squad?.querySelector<HTMLElement>('[data-field="survivor-hp"]')?.dataset
        .wounded,
    ).toBeUndefined();
    expect(
      squad?.querySelector('[data-field="survivor-stores"]')?.textContent,
    ).toBe("—");
  });

  it("offers one way on, Continue, and no cancel: Escape does nothing", () => {
    const onContinue = vi.fn();
    const view = new StageTransitionView({ onContinue });
    view.mount(root);
    view.show(TRANSITION);
    const buttons = [...(panel()?.querySelectorAll("button") ?? [])];
    expect(buttons.map((button) => button.dataset.action)).toEqual([
      "stage-continue",
    ]);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(view.open).toBe(true);
    buttons[0]?.click();
    expect(onContinue).toHaveBeenCalledTimes(1);
    // The owner closes it once the next stage is under way.
    expect(view.open).toBe(true);
    view.hide();
    expect(view.open).toBe(false);
  });

  it("shows a refusal under the list, and clears it on the next showing", () => {
    const view = new StageTransitionView({ onContinue: vi.fn() });
    view.mount(root);
    view.show(TRANSITION);
    const status = () =>
      root.querySelector<HTMLElement>('[data-field="stage-status"]');
    expect(status()?.hidden).toBe(true);
    view.showStatus("The mission has no won stage to move on from");
    expect(status()?.hidden).toBe(false);
    expect(status()?.textContent).toBe(
      "The mission has no won stage to move on from",
    );
    view.show(TRANSITION);
    expect(status()?.hidden).toBe(true);
  });

  it("unmounts cleanly, and a click after it reaches nobody", () => {
    const onContinue = vi.fn();
    const view = new StageTransitionView({ onContinue });
    view.mount(root);
    const button = root.querySelector<HTMLButtonElement>(
      '[data-action="stage-continue"]',
    );
    view.unmount();
    expect(panel()).toBeNull();
    button?.click();
    expect(onContinue).not.toHaveBeenCalled();
    view.show(TRANSITION);
    expect(view.open).toBe(false);
  });
});
