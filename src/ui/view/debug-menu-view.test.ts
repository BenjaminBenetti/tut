// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlaceableUnit } from "../../tactical/model/place-unit-command";
import { armedStatus, DebugMenuView } from "./debug-menu-view";

// ===========================================
// Fixtures
// ===========================================

const ENTRIES: readonly PlaceableUnit[] = [
  { kind: "squad", id: "rifle", name: "Rifle Squad" },
  { kind: "squad", id: "rocket", name: "Rocket Squad" },
  { kind: "mech", id: "starter", name: "Mech (starter)" },
  { kind: "bug", id: "swarmer", name: "Swarmer" },
  { kind: "bug", id: "brute", name: "Brute" },
];

let root: HTMLElement;

/** A mounted menu over the fixture entries, with its handlers recorded. */
function setup() {
  const onArm = vi.fn<(entry: PlaceableUnit | undefined) => void>();
  const onClose = vi.fn();
  const menu = new DebugMenuView({ onArm, onClose }, ENTRIES);
  menu.mount(root);
  return { menu, onArm, onClose };
}

const panel = (): HTMLElement | null =>
  root.querySelector<HTMLElement>('[data-testid="debug-menu"]');
const entry = (kind: string, id: string): HTMLButtonElement | null =>
  root.querySelector<HTMLButtonElement>(
    `[data-testid="debug-place-${kind}-${id}"]`,
  );
const names = (side: string): string[] =>
  [
    ...root.querySelectorAll<HTMLElement>(
      `[data-side="${side}"] .tut-btn__label`,
    ),
  ].map((label) => label.textContent ?? "");

beforeEach(() => {
  document.body.innerHTML = "";
  root = document.createElement("div");
  document.body.appendChild(root);
});

// ===========================================
// Tests
// ===========================================

describe("DebugMenuView (#1136)", () => {
  it("mounts closed, titled Debug, with the friendly and hostile lists from the entries", () => {
    setup();
    expect(panel()?.hidden).toBe(true);
    expect(panel()?.querySelector(".tut-panel__title")?.textContent).toBe(
      "Debug",
    );
    expect(names("friendly")).toEqual([
      "Rifle Squad",
      "Rocket Squad",
      "Mech (starter)",
    ]);
    expect(names("hostile")).toEqual(["Swarmer", "Brute"]);
  });

  it("opens and closes on update, and marks the armed entry pressed with its instruction", () => {
    const { menu } = setup();
    menu.update({ open: true, armed: undefined });
    expect(panel()?.hidden).toBe(false);
    expect(entry("bug", "swarmer")?.getAttribute("aria-pressed")).toBe("false");
    menu.update({ open: true, armed: ENTRIES[3] });
    expect(entry("bug", "swarmer")?.getAttribute("aria-pressed")).toBe("true");
    expect(entry("bug", "brute")?.getAttribute("aria-pressed")).toBe("false");
    expect(
      root.querySelector<HTMLElement>('[data-role="debug-armed"]')?.textContent,
    ).toBe(armedStatus({ kind: "bug", id: "swarmer", name: "Swarmer" }));
    menu.update({ open: false, armed: undefined });
    expect(panel()?.hidden).toBe(true);
  });

  it("reports the pressed entry to arm, and the armed entry pressed again as a disarm", () => {
    const { menu, onArm } = setup();
    menu.update({ open: true, armed: undefined });
    entry("squad", "rocket")?.click();
    expect(onArm).toHaveBeenLastCalledWith({
      kind: "squad",
      id: "rocket",
      name: "Rocket Squad",
    });
    menu.update({ open: true, armed: ENTRIES[1] });
    entry("squad", "rocket")?.click();
    expect(onArm).toHaveBeenLastCalledWith(undefined);
  });

  it("reports the close button, and unmounts cleanly", () => {
    const { menu, onClose } = setup();
    menu.update({ open: true, armed: undefined });
    root
      .querySelector<HTMLButtonElement>('[data-action="debug-menu-close"]')
      ?.click();
    expect(onClose).toHaveBeenCalledTimes(1);
    menu.unmount();
    expect(panel()).toBeNull();
  });

  it("words the instruction with the entry's name", () => {
    expect(armedStatus({ kind: "bug", id: "swarmer", name: "Swarmer" })).toBe(
      "Place: Swarmer — click the map, Esc cancels",
    );
  });
});
