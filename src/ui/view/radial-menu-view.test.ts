// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RadialMenuItem } from "./radial-menu-view";
import { RadialMenuView } from "./radial-menu-view";

// ===========================================
// Fixtures
// ===========================================

const ITEMS: readonly RadialMenuItem[] = [
  { id: "fire", label: "Fire", icon: "attack", detail: "8-13", primary: true },
  { id: "move", label: "Move", icon: "move" },
  {
    id: "vent",
    label: "Vent",
    icon: "reload",
    disabled: true,
    reason: "No heat",
  },
];

describe("RadialMenuView", () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.replaceChildren(host);
  });

  const buttons = () => [
    ...host.querySelectorAll<HTMLButtonElement>("button[data-item]"),
  ];

  it("lays the items on a ring, the first at the top", () => {
    const view = new RadialMenuView({ onSelect: vi.fn(), onDismiss: vi.fn() });
    view.mount(host);
    view.open(ITEMS, undefined, { x: 400, y: 300 });
    const [first, second, third] = buttons();
    // Twelve o'clock: no horizontal offset, a whole radius above centre.
    expect(Math.round(Number.parseFloat(first?.style.left ?? "0"))).toBe(0);
    expect(Number.parseFloat(first?.style.top ?? "0")).toBeLessThan(0);
    // The other two sit either side, so no two share a position.
    expect(second?.style.left).not.toBe(third?.style.left);
    const root = host.querySelector<HTMLElement>("#radial-menu");
    expect(root?.style.left).toBe("400px");
    expect(root?.style.top).toBe("300px");
  });

  it("marks the primary, disables what cannot be picked, and says why", () => {
    const view = new RadialMenuView({ onSelect: vi.fn(), onDismiss: vi.fn() });
    view.mount(host);
    view.open(ITEMS, undefined, { x: 0, y: 0 });
    const [fire, , vent] = buttons();
    expect(fire?.className).toContain("tut-btn--primary");
    expect(vent?.disabled).toBe(true);
    expect(vent?.title).toBe("No heat");
  });

  it("reports an enabled choice and ignores a disabled one", () => {
    const onSelect = vi.fn<(id: string) => void>();
    const view = new RadialMenuView({ onSelect, onDismiss: vi.fn() });
    view.mount(host);
    view.open(ITEMS, undefined, { x: 0, y: 0 });
    const [fire, , vent] = buttons();
    fire?.click();
    vent?.click();
    expect(onSelect.mock.calls.map((c) => c[0])).toEqual(["fire"]);
  });

  it("puts the decision's number at the centre, and nothing when there is none", () => {
    const view = new RadialMenuView({ onSelect: vi.fn(), onDismiss: vi.fn() });
    view.mount(host);
    view.open(
      ITEMS,
      { value: "62%", caption: "hit chance", tone: "ok" },
      { x: 0, y: 0 },
    );
    const hub = host.querySelector<HTMLElement>('[data-role="radial-hub"]');
    expect(hub?.hidden).toBe(false);
    expect(host.querySelector('[data-field="hub-value"]')?.textContent).toBe(
      "62%",
    );
    expect(host.querySelector('[data-field="hub-value"]')?.className).toContain(
      "tut-radial__value--ok",
    );
    view.open(ITEMS, undefined, { x: 0, y: 0 });
    expect(hub?.hidden).toBe(true);
  });

  it("dismisses on Escape and on a click outside the ring", () => {
    const onDismiss = vi.fn();
    const view = new RadialMenuView({ onSelect: vi.fn(), onDismiss });
    view.mount(host);
    view.open(ITEMS, undefined, { x: 0, y: 0 });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    document.body.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true }),
    );
    expect(onDismiss).toHaveBeenCalledTimes(2);

    // Closed, it answers to neither.
    view.close();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onDismiss).toHaveBeenCalledTimes(2);
    expect(view.isOpen).toBe(false);
  });

  it("keeps the ring to six choices rather than crowding it", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      id: `a${String(i)}`,
      label: `A${String(i)}`,
      icon: "attack" as const,
    }));
    const view = new RadialMenuView({ onSelect: vi.fn(), onDismiss: vi.fn() });
    view.mount(host);
    view.open(many, undefined, { x: 0, y: 0 });
    expect(buttons().length).toBe(6);
  });

  it("marks each choice with its icon", () => {
    const view = new RadialMenuView({ onSelect: vi.fn(), onDismiss: vi.fn() });
    view.mount(host);
    view.open(ITEMS, undefined, { x: 0, y: 0 });
    // `iconUrl` already yields `url(…)`; wrapping it again degrades the mask
    // to a solid block (#495).
    expect(
      host
        .querySelector<HTMLElement>("button[data-item] .tut-icon")
        ?.style.getPropertyValue("--icon"),
    ).toBe("url(/assets/ui/icons/attack.svg)");
  });
});
