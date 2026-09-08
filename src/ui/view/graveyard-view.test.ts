// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { EARTH_MAP } from "../../overworld/data/earth-map";
import { GraveyardView } from "./graveyard-view";

/** The rendered rows, newest first. */
function rows(root: HTMLElement): string[] {
  return [...root.querySelectorAll("li")].map((li) => li.textContent ?? "");
}

describe("GraveyardView", () => {
  it("shows the empty note before any loss and lists losses newest first", () => {
    const root = document.createElement("div");
    const view = new GraveyardView();
    view.mount(root);
    view.update([], EARTH_MAP);
    const empty = root.querySelector<HTMLElement>('[data-role="no-losses"]');
    expect(empty?.hidden).toBe(false);

    view.update(
      [
        { kind: "squad", name: "Alpha", day: 2, missionId: "m1" },
        { kind: "mech", name: "Anvil", day: 4, missionId: "m2" },
      ],
      EARTH_MAP,
    );
    expect(empty?.hidden).toBe(true);
    expect(
      [...root.querySelectorAll("li")].map((li) => li.dataset.kind),
    ).toEqual(["mech", "squad"]);
    view.unmount();
    expect(root.childElementCount).toBe(0);
  });

  // #950: the memorial named the mission `mission-7`. By the time it is
  // read that mission is gone from the offers, so the id names nothing
  // the player could look up.
  it("names the city a loss happened over, never the mission id", () => {
    const root = document.createElement("div");
    const view = new GraveyardView();
    view.mount(root);
    view.update(
      [
        {
          kind: "squad",
          name: "Alpha",
          day: 12,
          missionId: "mission-7",
          cityId: "lagos",
        },
      ],
      EARTH_MAP,
    );

    expect(rows(root)).toEqual(["Alpha · squad · day 12 · Lagos"]);
    expect(root.textContent).not.toContain("mission-7");
  });

  // A loss from before schema v17 has no city and never will: nothing in
  // the save maps its mission back to one. The row says nothing about
  // where rather than inventing it or falling back to the id.
  it("drops the location for an entry written before the city was recorded", () => {
    const root = document.createElement("div");
    const view = new GraveyardView();
    view.mount(root);
    view.update(
      [{ kind: "mech", name: "Anvil", day: 4, missionId: "mission-3" }],
      EARTH_MAP,
    );

    expect(rows(root)).toEqual(["Anvil · mech · day 4"]);
    expect(root.textContent).not.toContain("mission-3");
  });

  // Only reachable from a hand-edited save, but it must not render the
  // raw id when it happens.
  it("says so plainly when the entry names a city the map does not have", () => {
    const root = document.createElement("div");
    const view = new GraveyardView();
    view.mount(root);
    view.update(
      [
        {
          kind: "squad",
          name: "Bravo",
          day: 9,
          missionId: "mission-4",
          cityId: "atlantis",
        },
      ],
      EARTH_MAP,
    );

    expect(rows(root)).toEqual(["Bravo · squad · day 9 · Unknown city"]);
    expect(root.textContent).not.toContain("atlantis");
  });
});
