// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { RANK_TUNING } from "../../roster/data/rank-tuning";
import {
  RANK_ANCHOR_CLASS,
  RankTooltipView,
  attachRankTooltip,
  rankTooltipFor,
} from "./rank-tooltip-view";

const tooltip = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[data-role="rank-tooltip"]');

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("RankTooltipView (#1134)", () => {
  it("shows the lines under the anchor and hides on request", () => {
    const view = new RankTooltipView(document);
    const anchor = document.createElement("span");
    anchor.getBoundingClientRect = () =>
      ({
        left: 40,
        top: 100,
        bottom: 120,
        right: 90,
        width: 50,
        height: 20,
      }) as DOMRect;
    document.body.appendChild(anchor);
    expect(tooltip()).toBeNull();
    view.show(anchor, ["one", "two"]);
    const el = tooltip();
    expect(el?.hidden).toBe(false);
    expect(
      [...(el?.querySelectorAll("p") ?? [])].map((p) => p.textContent),
    ).toEqual(["one", "two"]);
    expect(el?.style.left).toBe("40px");
    expect(el?.style.top).toBe("126px");
    // A leave for another anchor is not this one's.
    view.hide(document.createElement("span"));
    expect(view.open).toBe(true);
    view.hide(anchor);
    expect(view.open).toBe(false);
    view.dispose();
  });

  it("closes on Escape", () => {
    const view = new RankTooltipView(document);
    const anchor = document.createElement("span");
    document.body.appendChild(anchor);
    view.show(anchor, ["one"]);
    expect(view.open).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(view.open).toBe(false);
    view.dispose();
  });

  it("shares one popover per document", () => {
    expect(rankTooltipFor(document)).toBe(rankTooltipFor(document));
  });

  it("attaches the popover to a rank name for hover and focus", () => {
    const name = document.createElement("span");
    document.body.appendChild(name);
    attachRankTooltip(name, 2, RANK_TUNING);
    expect(name.classList.contains(RANK_ANCHOR_CLASS)).toBe(true);
    expect(name.tabIndex).toBe(0);
    expect(name.dataset.rankIndex).toBe("2");
    name.dispatchEvent(new Event("mouseenter"));
    expect(tooltip()?.hidden).toBe(false);
    expect(tooltip()?.textContent).toContain(
      "Corporal · 30 xp — +1 move · +4 accuracy · +0 AP",
    );
    expect(tooltip()?.textContent).toContain("Sergeant at 60 xp");
    name.dispatchEvent(new Event("mouseleave"));
    expect(tooltip()?.hidden).toBe(true);
    name.dispatchEvent(new Event("focus"));
    expect(tooltip()?.hidden).toBe(false);
    name.dispatchEvent(new Event("blur"));
    expect(tooltip()?.hidden).toBe(true);
    rankTooltipFor(document).dispose();
  });
});
