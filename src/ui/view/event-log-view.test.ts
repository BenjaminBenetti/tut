// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import type { TacticalEvent } from "../../tactical/model/tactical-event";
import type { TacticalState } from "../../tactical/model/tactical-state";
import { EventLogView } from "./event-log-view";

// ===========================================
// Fixtures
// ===========================================

/** A mission with one named squad and one named bug, enough for phrasing. */
function mission(): TacticalState {
  return {
    missionId: "mission-1",
    units: [
      { id: "unit-1", templateId: "rifle" },
      { id: "unit-2", templateId: "swarmer" },
    ],
    templates: {
      rifle: { name: "Rifle Squad" },
      swarmer: { name: "Swarmer" },
    },
  } as unknown as TacticalState;
}

const HIT: TacticalEvent = {
  type: "tactical:attack-resolved",
  payload: {
    attackerId: "unit-1",
    targetId: "unit-2",
    hit: true,
    damage: 4,
    targetHp: 2,
  },
};
const MISS: TacticalEvent = {
  type: "tactical:attack-resolved",
  payload: {
    attackerId: "unit-2",
    targetId: "unit-1",
    hit: false,
    damage: 0,
    targetHp: 10,
  },
};
const TURN = {
  type: "tactical:turn-started",
  payload: { turn: 3, phase: "bugs" },
} as unknown as TacticalEvent;

describe("EventLogView", () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.replaceChildren(host);
  });

  const lines = (): string[] =>
    [...host.querySelectorAll('[data-role="event-log-list"] li')].map(
      (li) => li.textContent ?? "",
    );

  it("phrases events as sentences a player can read, newest last", () => {
    const view = new EventLogView();
    view.mount(host);
    view.append([TURN, HIT, MISS], mission());
    expect(lines()).toEqual([
      "Turn 3 — bug phase",
      "Rifle Squad hit Swarmer for 4",
      "Swarmer missed Rifle Squad",
    ]);
  });

  it("skips events it has nothing to say about", () => {
    const view = new EventLogView();
    view.mount(host);
    view.append(
      [{ type: "tactical:nothing", payload: {} } as unknown as TacticalEvent],
      mission(),
    );
    expect(lines()).toEqual([]);
  });

  it("collapses to its header and back, and remembers which for the session", () => {
    const view = new EventLogView();
    view.mount(host);
    const panel = host.querySelector("#event-log");
    const toggle = host.querySelector<HTMLButtonElement>(
      '[data-action="toggle-log"]',
    );
    expect(panel?.getAttribute("data-collapsed")).toBe("false");
    toggle?.click();
    expect(panel?.getAttribute("data-collapsed")).toBe("true");

    // A second mission mounts a fresh view; the choice persists.
    view.unmount();
    const next = new EventLogView();
    next.mount(host);
    expect(
      host.querySelector("#event-log")?.getAttribute("data-collapsed"),
    ).toBe("true");
    host
      .querySelector<HTMLButtonElement>('[data-action="toggle-log"]')
      ?.click();
  });

  it("falls back to the unit id when the mission has no name for it", () => {
    const view = new EventLogView();
    view.mount(host);
    view.append([HIT], undefined);
    expect(lines()).toEqual(["unit-1 hit unit-2 for 4"]);
  });

  it("collapses a run of identical lines into a count", () => {
    const view = new EventLogView();
    view.mount(host);
    const move = {
      type: "tactical:unit-moved",
      payload: { unitId: "unit-2", from: {}, to: {}, path: [{}] },
    } as unknown as TacticalEvent;
    view.append([move, move, move, HIT], mission());
    // Three identical moves are one row with a count, not three rows.
    expect(lines()).toEqual([
      "Swarmer moved 1 tile ×3",
      "Rifle Squad hit Swarmer for 4",
    ]);
  });

  it("marks each line with the icon for its event", () => {
    const view = new EventLogView();
    view.mount(host);
    view.append([HIT], mission());
    const icon = host.querySelector<HTMLElement>(
      '[data-role="event-log-list"] .tut-icon',
    );
    // `iconUrl` already yields `url(…)`; wrapping it again silently renders a
    // solid block, which is exactly what shipped in the first cut.
    expect(icon?.style.getPropertyValue("--icon")).toBe(
      "url(/assets/ui/icons/attack.svg)",
    );
  });

  it("clears between missions", () => {
    const view = new EventLogView();
    view.mount(host);
    view.append([HIT], mission());
    expect(lines().length).toBe(1);
    view.clear();
    expect(lines()).toEqual([]);
  });
});
