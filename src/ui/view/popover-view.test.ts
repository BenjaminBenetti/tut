// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import type { PopoverContent } from "../model/popover-content";
import { POPOVER_ID, PopoverView, attachPopover, popoverFor } from "./popover-view";

const CONTENT: PopoverContent = {
  title: "Sensor array",
  lines: [
    { text: "Finds infested cities sooner", kind: "body" },
    { text: "Build ¢800 · upkeep ¢20/day", kind: "dim" },
  ],
};

const popover = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[data-role="popover"]');

/** Gives `element` a fixed client rect, since jsdom lays nothing out. */
function rectOf(
  element: HTMLElement,
  rect: { left: number; top: number; width: number; height: number },
): void {
  element.getBoundingClientRect = () =>
    ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
    }) as DOMRect;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("PopoverView (#1155)", () => {
  it("shows the title and typed lines beside the anchor, and marks the anchor described by it", () => {
    const view = new PopoverView(document);
    const anchor = document.createElement("button");
    rectOf(anchor, { left: 900, top: 100, width: 200, height: 30 });
    document.body.appendChild(anchor);
    expect(popover()).toBeNull();
    view.show(anchor, CONTENT);
    const el = popover();
    expect(el?.hidden).toBe(false);
    expect(el?.getAttribute("role")).toBe("tooltip");
    expect(el?.id).toBe(POPOVER_ID);
    expect(anchor.getAttribute("aria-describedby")).toBe(POPOVER_ID);
    expect(el?.querySelector(".tut-popover__title")?.textContent).toBe(
      "Sensor array",
    );
    expect(
      [...(el?.querySelectorAll(".tut-popover__line") ?? [])].map((line) => [
        line.textContent,
        line.className,
      ]),
    ).toEqual([
      ["Finds infested cities sooner", "tut-popover__line tut-popover__line--body"],
      ["Build ¢800 · upkeep ¢20/day", "tut-popover__line tut-popover__line--dim"],
    ]);
    // jsdom's popover box is 0×0: it lands GAP left of the anchor, top-aligned.
    expect(el?.style.left).toBe("892px");
    expect(el?.style.top).toBe("100px");
    view.hide(document.createElement("span"));
    expect(view.open).toBe(true);
    view.hide(anchor);
    expect(view.open).toBe(false);
    expect(anchor.hasAttribute("aria-describedby")).toBe(false);
    view.dispose();
  });

  it("falls to the right of an anchor at the left edge and stays inside the viewport", () => {
    const view = new PopoverView(document);
    const anchor = document.createElement("button");
    rectOf(anchor, { left: 10, top: 700, width: 100, height: 30 });
    document.body.appendChild(anchor);
    view.show(anchor, CONTENT);
    const el = view.root;
    if (!el) throw new Error("no popover");
    rectOf(el, { left: 0, top: 0, width: 300, height: 120 });
    view.show(anchor, CONTENT);
    // 10 − 8 − 300 is off screen, so it goes right of the anchor.
    expect(el.style.left).toBe("118px");
    // innerHeight is 768 in jsdom: 700 + 120 + 8 overflows, so it is lifted.
    expect(el.style.top).toBe(`${String(window.innerHeight - 120 - 8)}px`);
    view.dispose();
  });

  it("closes on Escape and when its anchor leaves the document", () => {
    const view = new PopoverView(document);
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);
    view.show(anchor, CONTENT);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(view.open).toBe(false);
    view.show(anchor, CONTENT);
    view.hideIfDetached();
    expect(view.open).toBe(true);
    anchor.remove();
    view.hideIfDetached();
    expect(view.open).toBe(false);
    view.dispose();
  });

  it("attachPopover opens on hover or focus inside the anchor and closes on leave or blur", () => {
    const row = document.createElement("li");
    const button = document.createElement("button");
    row.appendChild(button);
    document.body.appendChild(row);
    let content: PopoverContent | undefined = CONTENT;
    attachPopover(row, () => content);
    const shared = popoverFor(document);
    row.dispatchEvent(new Event("mouseenter"));
    expect(shared.open).toBe(true);
    row.dispatchEvent(new Event("mouseleave"));
    expect(shared.open).toBe(false);
    button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(shared.open).toBe(true);
    expect(row.getAttribute("aria-describedby")).toBe(POPOVER_ID);
    button.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(shared.open).toBe(false);
    content = undefined;
    row.dispatchEvent(new Event("mouseenter"));
    expect(shared.open).toBe(false);
    shared.dispose();
  });
});
