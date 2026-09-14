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
const tool = (id: string): HTMLButtonElement | null =>
  root.querySelector<HTMLButtonElement>(`[data-testid="debug-tool-${id}"]`);
const tools = (): string[] =>
  [
    ...root.querySelectorAll<HTMLElement>(
      '[data-role="debug-tools"] .tut-btn__label',
    ),
  ].map((label) => label.textContent ?? "");
const back = (): HTMLButtonElement | null =>
  root.querySelector<HTMLButtonElement>('[data-testid="debug-back"]');
const pageTitle = (): string | undefined =>
  root.querySelector<HTMLElement>('[data-role="debug-page-title"]')
    ?.textContent ?? undefined;
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

describe("DebugMenuView (#1136, #1138)", () => {
  it("mounts closed, titled Debug, on the tool list with Spawn as its one tool", () => {
    setup();
    expect(panel()?.hidden).toBe(true);
    expect(panel()?.querySelector(".tut-panel__title")?.textContent).toBe(
      "Debug",
    );
    expect(tools()).toEqual(["Spawn"]);
    expect(
      tool("spawn")?.querySelector(".tut-debug-menu__tool-description")
        ?.textContent,
    ).toBe("Place a friendly or hostile unit on the map");
    // No page open yet: no lists, no Back.
    expect(entry("bug", "swarmer")).toBeNull();
    expect(back()).toBeNull();
  });

  it("opens and closes on update", () => {
    const { menu } = setup();
    menu.update({ open: true, armed: undefined });
    expect(panel()?.hidden).toBe(false);
    expect(panel()?.dataset.open).toBe("true");
    menu.update({ open: false, armed: undefined });
    expect(panel()?.hidden).toBe(true);
  });

  it("pressing Spawn shows the friendly and hostile lists under the page title, with Back", () => {
    const { menu } = setup();
    menu.update({ open: true, armed: undefined });
    tool("spawn")?.click();
    expect(tool("spawn")).toBeNull();
    expect(pageTitle()).toBe("Spawn");
    expect(back()).not.toBeNull();
    expect(names("friendly")).toEqual([
      "Rifle Squad",
      "Rocket Squad",
      "Mech (starter)",
    ]);
    expect(names("hostile")).toEqual(["Swarmer", "Brute"]);
    expect(
      root.querySelector<HTMLElement>('[data-role="debug-armed"]')?.textContent,
    ).toBe("Pick a unit, then click the map to place it.");
  });

  it("marks the armed entry pressed with its instruction, on open and on refresh", () => {
    const { menu } = setup();
    // Armed before the page is opened: the page reads it on render.
    menu.update({ open: true, armed: ENTRIES[3] });
    tool("spawn")?.click();
    expect(entry("bug", "swarmer")?.getAttribute("aria-pressed")).toBe("true");
    expect(entry("bug", "brute")?.getAttribute("aria-pressed")).toBe("false");
    expect(
      root.querySelector<HTMLElement>('[data-role="debug-armed"]')?.textContent,
    ).toBe(armedStatus({ kind: "bug", id: "swarmer", name: "Swarmer" }));
    menu.update({ open: true, armed: undefined });
    expect(entry("bug", "swarmer")?.getAttribute("aria-pressed")).toBe("false");
  });

  it("reports the pressed entry to arm, and the armed entry pressed again as a disarm", () => {
    const { menu, onArm } = setup();
    menu.update({ open: true, armed: undefined });
    tool("spawn")?.click();
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

  it("Back returns to the tool list and disarms what the page had armed", () => {
    const { menu, onArm } = setup();
    menu.update({ open: true, armed: undefined });
    tool("spawn")?.click();
    back()?.click();
    expect(tools()).toEqual(["Spawn"]);
    expect(entry("squad", "rifle")).toBeNull();
    // Nothing was armed, so nothing to disarm.
    expect(onArm).not.toHaveBeenCalled();

    tool("spawn")?.click();
    menu.update({ open: true, armed: ENTRIES[0] });
    back()?.click();
    expect(onArm).toHaveBeenLastCalledWith(undefined);
    expect(tools()).toEqual(["Spawn"]);
  });

  it("closing resets the panel to the tool list for the next opening", () => {
    const { menu } = setup();
    menu.update({ open: true, armed: undefined });
    tool("spawn")?.click();
    expect(pageTitle()).toBe("Spawn");
    menu.update({ open: false, armed: undefined });
    menu.update({ open: true, armed: undefined });
    expect(tools()).toEqual(["Spawn"]);
    expect(pageTitle()).toBeUndefined();
    expect(entry("bug", "swarmer")).toBeNull();
  });

  it("does not report a stale page's entries after Back", () => {
    const { menu, onArm } = setup();
    menu.update({ open: true, armed: undefined });
    tool("spawn")?.click();
    const button = entry("squad", "rifle");
    back()?.click();
    // The detached button's listener is gone with the page.
    button?.click();
    expect(onArm).not.toHaveBeenCalled();
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
