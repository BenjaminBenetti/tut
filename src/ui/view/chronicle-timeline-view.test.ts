// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import {
  firstAttemptVictory,
  threatDefeatInActTwo,
} from "../../overworld/service/outcome-chronicle-fixtures.test-helper";
import { chronicleSummary } from "../../overworld/service/outcome-chronicle-service";
import {
  CAMPAIGN_ENDED_HERE,
  ChronicleTimelineView,
} from "./chronicle-timeline-view";

describe("ChronicleTimelineView", () => {
  let root: HTMLElement;
  const rows = (): HTMLElement[] => [
    ...root.querySelectorAll<HTMLElement>(".tut-chronicle__act"),
  ];
  const text = (row: HTMLElement, field: string): string | undefined =>
    row.querySelector<HTMLElement>(`[data-field="${field}"]`)?.textContent ??
    undefined;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  it("lists every act of a won campaign in order, each with its span and ending", () => {
    const summary = chronicleSummary(firstAttemptVictory(), "victory");
    new ChronicleTimelineView().mount(root, {
      acts: summary.acts ?? [],
      storyWins: summary.storyWins ?? [],
    });
    expect(rows().map((row) => row.dataset.act)).toEqual([
      "act-1",
      "act-2",
      "act-3",
      "finale",
    ]);
    expect(rows().map((row) => text(row, "act-name"))).toEqual([
      "Act I · Emergence",
      "Act II · Incubation",
      "Act III · Reclamation",
      "Finale · The Platform",
    ]);
    expect(rows().map((row) => text(row, "act-span"))).toEqual([
      "Days 1–14 · Missions 1–12",
      "Days 14–38 · Missions 13–32",
      "Days 38–60 · Missions 33–47",
      "Days 60–67 · Missions 48–50",
    ]);
    expect(rows().map((row) => text(row, "act-end"))).toEqual([
      "Ended by Live Specimen · day 14",
      "Ended by Intact Pod · day 38",
      "Ended by Launch Window · day 60",
      "Ended by Spore Platform · day 66",
    ]);
    expect(rows().every((row) => row.dataset.ended === "won")).toBe(true);
  });

  it("lists the act's other story wins as milestones, repeats kept, the ending not repeated", () => {
    const summary = chronicleSummary(firstAttemptVictory(), "victory");
    new ChronicleTimelineView().mount(root, {
      acts: summary.acts ?? [],
      storyWins: summary.storyWins ?? [],
    });
    const milestones = (act: string): string[] =>
      [
        ...root.querySelectorAll<HTMLElement>(
          `[data-act="${act}"] .tut-chronicle__wins li`,
        ),
      ].map((item) => item.textContent);
    expect(milestones("act-1")).toEqual(["First Skyfall · day 2"]);
    expect(milestones("act-2")).toEqual([]);
    expect(milestones("act-3")).toEqual([
      "Uplink · day 42",
      "Great Hive · day 48",
      "Great Hive · day 52",
      "Great Hive · day 56",
    ]);
    expect(milestones("finale")).toEqual([]);
  });

  it("says the campaign ended in the act a defeat stopped", () => {
    const summary = chronicleSummary(threatDefeatInActTwo(), "defeat");
    new ChronicleTimelineView().mount(root, {
      acts: summary.acts ?? [],
      storyWins: summary.storyWins ?? [],
    });
    expect(rows().map((row) => row.dataset.act)).toEqual(["act-1", "act-2"]);
    const last = rows().at(-1);
    expect(last?.dataset.ended).toBe("defeat");
    expect(last && text(last, "act-end")).toBe(CAMPAIGN_ENDED_HERE);
    expect(last && text(last, "act-span")).toBe("Days 14–29 · Missions 13–24");
  });

  it("names the ending without a day when the story wins were not kept", () => {
    new ChronicleTimelineView().mount(root, {
      acts: [
        {
          act: "act-1",
          fromDay: 1,
          toDay: 14,
          missionsBefore: 0,
          missions: 12,
          endedBy: "live-specimen",
        },
      ],
    });
    const [row] = rows();
    expect(row && text(row, "act-end")).toBe("Ended by Live Specimen");
    expect(root.querySelector(".tut-chronicle__wins")).toBeNull();
  });

  it("unmount removes the timeline", () => {
    const view = new ChronicleTimelineView();
    view.mount(root, { acts: [] });
    expect(root.querySelector('[data-role="chronicle"]')).not.toBeNull();
    view.unmount();
    expect(root.querySelector('[data-role="chronicle"]')).toBeNull();
  });
});
