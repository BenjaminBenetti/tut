// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MISSION_TYPES } from "../../content/data/mission-types";
import { campaignOnDay, missionAt } from "./mission-fixtures.test-helper";
import { MissionListView, sortByExpiry } from "./mission-list-view";

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
      { onSelectMission: vi.fn() },
    );
    view.mount(root);
    view.update(campaignOnDay(4, []), {
      cityId: undefined,
      missionId: undefined,
    });
    expect(rows()).toHaveLength(0);
    expect(
      root.querySelector<HTMLElement>('[data-role="no-missions"]')?.hidden,
    ).toBe(false);
  });

  it("renders one row per mission, soonest expiry first, with the columns filled", () => {
    const view = new MissionListView(
      { missionTypes: MISSION_TYPES },
      { onSelectMission: vi.fn() },
    );
    view.mount(root);
    view.update(
      campaignOnDay(4, [
        missionAt("mission-2", "lagos", 9, 5),
        missionAt("mission-1", "cairo", 6, 2),
      ]),
      { cityId: undefined, missionId: undefined },
    );
    const [first, second] = rows();
    expect(first?.dataset.missionId).toBe("mission-1");
    expect(first?.dataset.cityId).toBe("cairo");
    expect(cell(first!, "city")).toBe("Cairo");
    expect(cell(first!, "type")).toBe("Infestation Clearance");
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
      { onSelectMission },
    );
    view.mount(root);
    const state = campaignOnDay(4, [missionAt("mission-1", "cairo", 6)]);
    view.update(state, { cityId: "cairo", missionId: "mission-1" });
    expect(rows()[0]?.classList.contains("is-selected")).toBe(true);
    rows()[0]?.querySelector<HTMLElement>('[data-field="reward"]')?.click();
    expect(onSelectMission).toHaveBeenCalledWith("mission-1", "cairo");
  });

  it("reuses rows across updates and drops missions that vanished", () => {
    const view = new MissionListView(
      { missionTypes: MISSION_TYPES },
      { onSelectMission: vi.fn() },
    );
    view.mount(root);
    const a = missionAt("mission-1", "cairo", 6);
    const b = missionAt("mission-2", "lagos", 9);
    view.update(campaignOnDay(4, [a, b]), {
      cityId: undefined,
      missionId: undefined,
    });
    const before = rows()[0];
    view.update(campaignOnDay(5, [a]), {
      cityId: undefined,
      missionId: undefined,
    });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toBe(before);
    expect(cell(rows()[0]!, "days-left")).toBe("1 d");
  });

  it("unmount removes the section and stops reporting clicks", () => {
    const onSelectMission = vi.fn();
    const view = new MissionListView(
      { missionTypes: MISSION_TYPES },
      { onSelectMission },
    );
    view.mount(root);
    view.update(campaignOnDay(4, [missionAt("mission-1", "cairo", 6)]), {
      cityId: undefined,
      missionId: undefined,
    });
    const row = rows()[0];
    view.unmount();
    expect(root.children).toHaveLength(0);
    row?.click();
    expect(onSelectMission).not.toHaveBeenCalled();
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
