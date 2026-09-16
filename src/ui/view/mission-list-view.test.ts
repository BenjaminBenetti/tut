// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MISSION_TYPES } from "../../content/data/mission-types";
import { campaignOnDay, missionAt } from "./mission-fixtures.test-helper";
import type { OverworldSelectionSnapshot } from "../model/overworld-selection";
import {
  MissionListView,
  missionsInRegion,
  sortByExpiry,
} from "./mission-list-view";

/** Nothing selected: the list shows every mission. */
const NONE: OverworldSelectionSnapshot = {
  regionId: undefined,
  cityId: undefined,
  missionId: undefined,
};

describe("MissionListView", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  const rows = (): HTMLElement[] => [
    ...root.querySelectorAll<HTMLElement>("[data-mission-id]"),
  ];
  const cell = (row: HTMLElement, field: string): string =>
    row.querySelector(`[data-field="${field}"]`)?.textContent ?? "";

  it("shows the empty state until missions exist", () => {
    const view = new MissionListView(
      { missionTypes: MISSION_TYPES },
      { onSelectMission: vi.fn(), onShowAll: vi.fn() },
    );
    view.mount(root);
    view.update(campaignOnDay(4, []), NONE);
    expect(rows()).toHaveLength(0);
    expect(
      root.querySelector<HTMLElement>('[data-role="no-missions"]')?.hidden,
    ).toBe(false);
  });

  it("renders one row per mission, soonest expiry first, with the columns filled", () => {
    const view = new MissionListView(
      { missionTypes: MISSION_TYPES },
      { onSelectMission: vi.fn(), onShowAll: vi.fn() },
    );
    view.mount(root);
    view.update(
      campaignOnDay(4, [
        missionAt("mission-2", "lagos", 9, 5),
        missionAt("mission-1", "cairo", 6, 2),
      ]),
      NONE,
    );
    const [first, second] = rows();
    expect(first?.dataset.missionId).toBe("mission-1");
    expect(first?.dataset.cityId).toBe("cairo");
    expect(cell(first!, "city")).toBe("Cairo");
    // The type is a glyph, not a column of truncated text: it was the
    // same on every row and never fitted (one mission type exists), so
    // it kept its name in the tooltip and gave the width to the city.
    const glyph = first?.querySelector<HTMLElement>('[data-field="type"]');
    expect(glyph?.title).toBe("Infestation Clearance");
    expect(glyph?.className).toContain("tut-icon");
    expect(glyph?.style.getPropertyValue("--icon")).toContain("infestation");
    expect(glyph?.textContent).toBe("");
    expect(cell(first!, "difficulty")).toBe("D2");
    expect(cell(first!, "reward")).toBe("¢600");
    expect(cell(first!, "days-left")).toBe("2 d");
    expect(second?.dataset.missionId).toBe("mission-2");
    expect(
      root.querySelector<HTMLElement>('[data-role="no-missions"]')?.hidden,
    ).toBe(true);
  });

  it("highlights the selected mission and reports clicks with the city", () => {
    const onSelectMission = vi.fn();
    const view = new MissionListView(
      { missionTypes: MISSION_TYPES },
      { onSelectMission, onShowAll: vi.fn() },
    );
    view.mount(root);
    const state = campaignOnDay(4, [missionAt("mission-1", "cairo", 6)]);
    view.update(state, {
      regionId: "middle-east",
      cityId: "cairo",
      missionId: "mission-1",
    });
    expect(rows()[0]?.classList.contains("is-selected")).toBe(true);
    rows()[0]?.querySelector<HTMLElement>('[data-field="reward"]')?.click();
    expect(onSelectMission).toHaveBeenCalledWith("mission-1", "cairo");
  });

  it("reuses rows across updates and drops missions that vanished", () => {
    const view = new MissionListView(
      { missionTypes: MISSION_TYPES },
      { onSelectMission: vi.fn(), onShowAll: vi.fn() },
    );
    view.mount(root);
    const a = missionAt("mission-1", "cairo", 6);
    const b = missionAt("mission-2", "lagos", 9);
    view.update(campaignOnDay(4, [a, b]), NONE);
    const before = rows()[0];
    view.update(campaignOnDay(5, [a]), NONE);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toBe(before);
    expect(cell(rows()[0]!, "days-left")).toBe("1 d");
  });

  it("shows every mission under 'Missions · all' when no region is selected (#1154)", () => {
    const view = new MissionListView(
      { missionTypes: MISSION_TYPES },
      { onSelectMission: vi.fn(), onShowAll: vi.fn() },
    );
    view.mount(root);
    view.update(
      campaignOnDay(4, [
        missionAt("mission-1", "cairo", 6),
        missionAt("mission-2", "lagos", 9),
      ]),
      NONE,
    );
    expect(
      root.querySelector('[data-field="missions-heading"]')?.textContent,
    ).toBe("Missions · all");
    expect(rows().map((r) => r.dataset.cityId)).toEqual(["cairo", "lagos"]);
  });

  it("filters to the selected region and names it in the heading (#1154)", () => {
    const view = new MissionListView(
      { missionTypes: MISSION_TYPES },
      { onSelectMission: vi.fn(), onShowAll: vi.fn() },
    );
    view.mount(root);
    const state = campaignOnDay(4, [
      missionAt("mission-1", "cairo", 6),
      missionAt("mission-2", "lagos", 9),
    ]);
    view.update(state, {
      regionId: "sub-saharan-africa",
      cityId: undefined,
      missionId: undefined,
    });
    expect(
      root.querySelector('[data-field="missions-heading"]')?.textContent,
    ).toBe("Missions · Sub-Saharan Africa");
    expect(rows().map((r) => r.dataset.cityId)).toEqual(["lagos"]);
    expect(
      root.querySelector<HTMLElement>('[data-role="no-missions"]')?.hidden,
    ).toBe(true);

    // A region with nothing on offer says so, without telling the player
    // to advance the day when missions exist elsewhere.
    view.update(state, {
      regionId: "east-asia",
      cityId: "tokyo",
      missionId: undefined,
    });
    expect(rows()).toHaveLength(0);
    const empty = root.querySelector<HTMLElement>('[data-role="no-missions"]');
    expect(empty?.hidden).toBe(false);
    expect(empty?.textContent).toBe("No missions in East Asia.");

    // Back to all: the rows return and the heading follows.
    view.update(state, NONE);
    expect(rows()).toHaveLength(2);
    expect(
      root.querySelector('[data-field="missions-heading"]')?.textContent,
    ).toBe("Missions · all");
    expect(empty?.textContent).toBe("No missions on offer. Advance the day.");
  });

  it("offers Show all only while a region narrows the list, and reports it", () => {
    const onShowAll = vi.fn();
    const view = new MissionListView(
      { missionTypes: MISSION_TYPES },
      { onSelectMission: vi.fn(), onShowAll },
    );
    view.mount(root);
    const state = campaignOnDay(4, [missionAt("mission-1", "cairo", 6)]);
    const showAll = root.querySelector<HTMLButtonElement>(
      '[data-action="show-all-missions"]',
    );
    view.update(state, NONE);
    expect(showAll?.hidden).toBe(true);
    view.update(state, {
      regionId: "east-asia",
      cityId: undefined,
      missionId: undefined,
    });
    expect(showAll?.hidden).toBe(false);
    showAll?.click();
    expect(onShowAll).toHaveBeenCalledTimes(1);
  });

  it("unmount removes the section and stops reporting clicks", () => {
    const onSelectMission = vi.fn();
    const view = new MissionListView(
      { missionTypes: MISSION_TYPES },
      { onSelectMission, onShowAll: vi.fn() },
    );
    view.mount(root);
    view.update(campaignOnDay(4, [missionAt("mission-1", "cairo", 6)]), NONE);
    const row = rows()[0];
    view.unmount();
    expect(root.children).toHaveLength(0);
    row?.click();
    expect(onSelectMission).not.toHaveBeenCalled();
  });
});

describe("missionsInRegion", () => {
  it("keeps the missions whose city is in the region, or all with no region", () => {
    const state = campaignOnDay(4, [
      missionAt("mission-1", "cairo", 6),
      missionAt("mission-2", "lagos", 9),
      missionAt("mission-3", "atlantis", 9),
    ]);
    expect(missionsInRegion(state, undefined).map((m) => m.id)).toEqual([
      "mission-1",
      "mission-2",
      "mission-3",
    ]);
    expect(missionsInRegion(state, "middle-east").map((m) => m.id)).toEqual([
      "mission-1",
    ]);
    expect(missionsInRegion(state, "oceania")).toEqual([]);
  });
});

describe("sortByExpiry", () => {
  it("orders by expiry, then creation day, then id", () => {
    const sorted = sortByExpiry([
      { ...missionAt("mission-3", "a", 8), createdDay: 2 },
      { ...missionAt("mission-2", "a", 8), createdDay: 1 },
      missionAt("mission-1", "a", 5),
      { ...missionAt("mission-0", "a", 8), createdDay: 2 },
    ]);
    expect(sorted.map((m) => m.id)).toEqual([
      "mission-1",
      "mission-2",
      "mission-0",
      "mission-3",
    ]);
  });
});
