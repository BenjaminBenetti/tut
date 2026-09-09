// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import type { TacticalEvent } from "../../tactical/model/tactical-event";
import type { GameState } from "../../save/model/game-state";
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
    weaponRange: 8,
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
    weaponRange: 8,
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

  it("names nothing after an id when the mission has no name for it", () => {
    const view = new EventLogView();
    view.mount(host);
    // Without a mission there is nothing to name from — and the answer
    // is still never the id (#1035). This assertion used to pin
    // `unit-1 hit unit-2 for 4`, which was the defect written down as
    // an expectation.
    view.append([HIT], undefined);
    expect(lines()).toEqual(["that unit hit that unit for 4"]);
    expect(lines().join(" ")).not.toContain("unit-1");
  });

  it("collapses a run of identical lines into a count", () => {
    const view = new EventLogView();
    view.mount(host);
    // Repeated fire rather than repeated movement: movement no longer
    // reaches the log at all (#1028), and a collapse test written on it
    // would pass by drawing nothing.
    view.append([HIT, HIT, HIT, MISS], mission());
    expect(lines()).toEqual([
      "Rifle Squad hit Swarmer for 4 ×3",
      "Swarmer missed Rifle Squad",
    ]);
  });

  // #1028: the Executive Director asked for movement out of the log.
  it("logs nothing for movement, and still logs what the move provoked", () => {
    const view = new EventLogView();
    view.mount(host);
    const move = {
      type: "tactical:unit-moved",
      payload: { unitId: "unit-2", from: {}, to: {}, path: [{}, {}, {}] },
    } as unknown as TacticalEvent;
    // A move that walked into overwatch: the mover is silent, the shot
    // is not. `move-handler` emits the reaction as its own event, so
    // dropping the move line loses nothing that happened to anybody.
    view.append([move, HIT, move], mission());
    expect(lines()).toEqual(["Rifle Squad hit Swarmer for 4"]);

    // And a turn of nothing but movement leaves the log as it was.
    view.append([move, move], mission());
    expect(lines()).toEqual(["Rifle Squad hit Swarmer for 4"]);
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

// ===========================================
// Squad identity in the log (#1040)
// ===========================================

/** Two roster squads sharing a template, plus a bug, as deployed. */
function twoSquads(): TacticalState {
  return {
    missionId: "mission-1",
    units: [
      { id: "unit-1", sourceId: "squad-1", templateId: "squad:squad-1" },
      { id: "unit-2", sourceId: "squad-2", templateId: "squad:squad-2" },
      { id: "unit-9", sourceId: "bug:swarmer", templateId: "swarmer" },
    ],
    // Each squad gets its **own** template, both named after the squad
    // *type* -- which is what `unit-factory` really builds. The
    // collision is in the name, not the template id; a fixture with one
    // shared template reproduces the symptom but not the mechanism.
    templates: {
      "squad:squad-1": { name: "Rifle Squad" },
      "squad:squad-2": { name: "Rifle Squad" },
      swarmer: { name: "Swarmer" },
    },
    objectives: [],
  } as unknown as TacticalState;
}

/** Alpha and Bravo, as the debrief names them. */
const ROSTER = {
  roster: {
    squads: [
      { id: "squad-1", name: "Alpha" },
      { id: "squad-2", name: "Bravo" },
    ],
    mechs: [],
  },
  overworld: { missions: [], map: { cities: [], regions: [] } },
} as unknown as GameState;

/** One squad firing at the bug. */
const shotBy = (attackerId: string): TacticalEvent => ({
  type: "tactical:attack-resolved",
  payload: {
    attackerId,
    targetId: "unit-9",
    hit: true,
    damage: 4,
    weaponRange: 8,
    targetHp: 2,
  },
});

describe("EventLogView squad identity", () => {
  let host: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    host = document.createElement("div");
    document.body.appendChild(host);
  });

  /** The rendered rows, including any repeat tail. */
  const lines = (): string[] =>
    [...host.querySelectorAll('[data-role="event-log-list"] li')].map(
      (li) => li.textContent ?? "",
    );

  // The reproduction the ticket asks for before any claim: two
  // different squads firing produce one collapsed row, because the
  // template name makes both sentences identical.
  it("reproduces the lost attribution when names come from the template", () => {
    const view = new EventLogView();
    view.mount(host);
    view.append([shotBy("unit-1"), shotBy("unit-2")], twoSquads());
    expect(lines()).toEqual(["Rifle Squad hit Swarmer for 4 ×2"]);
  });

  // And the repair: with the roster identity the two squads say
  // different things, so nothing collapses and the attribution survives.
  it("keeps two squads apart once they carry their roster names", () => {
    const view = new EventLogView();
    view.mount(host);
    view.append([shotBy("unit-1"), shotBy("unit-2")], twoSquads(), ROSTER);
    expect(lines()).toEqual([
      "Alpha hit Swarmer for 4",
      "Bravo hit Swarmer for 4",
    ]);
  });

  // The control: a legitimate repeat by the *same* squad still collapses,
  // which is what #525 added collapsing for.
  it("still collapses a genuine repeat by one squad", () => {
    const view = new EventLogView();
    view.mount(host);
    view.append([shotBy("unit-1"), shotBy("unit-1")], twoSquads(), ROSTER);
    expect(lines()).toEqual(["Alpha hit Swarmer for 4 ×2"]);
  });
});
