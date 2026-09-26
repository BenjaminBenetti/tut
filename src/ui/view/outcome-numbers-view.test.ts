// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import type { GameOutcome } from "../../overworld/model/game-outcome";
import { outcomeNumbers, OutcomeNumbersView } from "./outcome-numbers-view";

const OUTCOME: GameOutcome = {
  kind: "defeat",
  cause: "threat",
  day: 29,
  summary: {
    citiesLost: 6,
    citiesInfested: 38,
    citiesTotal: 51,
    missionsRun: 11,
    daysSurvived: 29,
    finalThreat: 100,
    missionsPlayed: 24,
    missionsWon: 15,
  },
};

describe("outcomeNumbers", () => {
  it("reads day, missions, threat, then the cities saved, lost and infested", () => {
    expect(
      outcomeNumbers(OUTCOME).map((figure) => [figure.field, figure.value]),
    ).toEqual([
      ["day", "29"],
      ["missions-run", "24"],
      ["final-threat", "100"],
      ["cities-saved", "45 / 51"],
      ["cities-lost", "6 / 51"],
      ["cities-infested", "38 / 51"],
    ]);
  });

  it("counts the ledger's missions, without a won note, on an outcome saved before the chronicle", () => {
    const old: GameOutcome = {
      ...OUTCOME,
      summary: {
        citiesLost: 6,
        citiesInfested: 38,
        citiesTotal: 51,
        missionsRun: 11,
        daysSurvived: 29,
        finalThreat: 64,
      },
    };
    const missions = outcomeNumbers(old).find(
      (figure) => figure.field === "missions-run",
    );
    expect(missions?.value).toBe("11");
    expect(missions).not.toHaveProperty("note");
    expect(
      outcomeNumbers(old).find((figure) => figure.field === "final-threat"),
    ).not.toHaveProperty("tone");
  });
});

describe("OutcomeNumbersView", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  it("tints the threat that ended the campaign and notes the missions won", () => {
    const view = new OutcomeNumbersView();
    view.mount(root, OUTCOME);
    const field = (name: string): HTMLElement | null =>
      root.querySelector<HTMLElement>(`[data-field="${name}"]`);
    expect(field("final-threat")?.dataset.tone).toBe("danger");
    expect(field("missions-won")?.textContent).toBe("15 won");
    expect(root.querySelectorAll(".tut-game-over__number")).toHaveLength(6);
    view.unmount();
    expect(root.querySelector('[data-role="outcome-numbers"]')).toBeNull();
  });
});
