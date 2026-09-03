// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import { TopBarView } from "./top-bar-view";

const newGame = (): GameState =>
  createNewGame(
    { seed: 3, createdAt: "2026-09-03T00:00:00.000Z" },
    {
      map: EARTH_MAP,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      starterRoster: STARTER_ROSTER,
      newGameTuning: NEW_GAME_TUNING,
      threatTuning: THREAT_TUNING,
      economyTuning: ECONOMY_TUNING,
    },
  );

const withThreat = (state: GameState, threat: number): GameState => ({
  ...state,
  overworld: { ...state.overworld, threat },
});

describe("TopBarView", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  const field = (name: string): HTMLElement => {
    const el = root.querySelector<HTMLElement>(`[data-field="${name}"]`);
    if (!el) throw new Error(`missing field ${name}`);
    return el;
  };
  const button = (action: string): HTMLButtonElement => {
    const el = root.querySelector<HTMLButtonElement>(
      `[data-action="${action}"]`,
    );
    if (!el) throw new Error(`missing button ${action}`);
    return el;
  };

  it("mounts as #top-bar with dashes and Advance Day disabled before any state", () => {
    const view = new TopBarView({ onAdvanceDay: vi.fn(), onMainMenu: vi.fn() });
    view.mount(root);
    expect(root.querySelector("#top-bar")).not.toBeNull();
    expect(field("day").textContent).toBe("—");
    expect(button("advance-day").disabled).toBe(true);
    expect(button("roster").disabled).toBe(true);
    expect(button("main-menu").disabled).toBe(false);
  });

  it("renders day, credits and a threat band from the state", () => {
    const view = new TopBarView({ onAdvanceDay: vi.fn(), onMainMenu: vi.fn() });
    view.mount(root);
    view.update(withThreat(newGame(), 50));
    expect(field("day").textContent).toBe("1");
    expect(field("credits").textContent).toBe("¢5,000");
    expect(field("threat").textContent).toBe("50");
    expect(field("threat-tone").dataset.tone).toBe("warn");
    expect(field("threat-tone").className).toContain("tut-badge--warn");
    expect(button("advance-day").disabled).toBe(false);
  });

  it("re-renders incrementally: the same nodes carry the new values", () => {
    const view = new TopBarView({ onAdvanceDay: vi.fn(), onMainMenu: vi.fn() });
    view.mount(root);
    const state = newGame();
    view.update(withThreat(state, 10));
    const dayNode = field("day");
    const badge = field("threat-tone");
    view.update(
      withThreat({ ...state, overworld: { ...state.overworld, day: 7 } }, 90),
    );
    expect(field("day")).toBe(dayNode);
    expect(dayNode.textContent).toBe("7");
    expect(field("threat-tone")).toBe(badge);
    expect(badge.dataset.tone).toBe("danger");
  });

  it("disables Advance Day and shows the outcome once the campaign has ended", () => {
    const view = new TopBarView({ onAdvanceDay: vi.fn(), onMainMenu: vi.fn() });
    view.mount(root);
    const base = newGame();
    view.update({
      ...base,
      overworld: {
        ...base.overworld,
        outcome: {
          kind: "defeat",
          day: 30,
          summary: {
            citiesLost: 1,
            citiesInfested: 2,
            citiesTotal: 36,
            missionsRun: 0,
            daysSurvived: 30,
            finalThreat: 100,
          },
        },
      },
    });
    expect(button("advance-day").disabled).toBe(true);
    expect(field("outcome").hidden).toBe(false);
    expect(field("outcome").textContent).toContain("defeat");
  });

  it("routes button clicks to the handlers and shows status text", () => {
    const onAdvanceDay = vi.fn();
    const onMainMenu = vi.fn();
    const view = new TopBarView({ onAdvanceDay, onMainMenu });
    view.mount(root);
    view.update(newGame());
    button("advance-day").click();
    button("main-menu").click();
    expect(onAdvanceDay).toHaveBeenCalledTimes(1);
    expect(onMainMenu).toHaveBeenCalledTimes(1);
    view.showStatus("The campaign ended");
    const status = root.querySelector<HTMLElement>('[data-role="status"]');
    expect(status?.hidden).toBe(false);
    expect(status?.textContent).toBe("The campaign ended");
  });

  it("unmount removes the bar and its listeners", () => {
    const onAdvanceDay = vi.fn();
    const view = new TopBarView({ onAdvanceDay, onMainMenu: vi.fn() });
    view.mount(root);
    view.update(newGame());
    const advance = button("advance-day");
    view.unmount();
    expect(root.children).toHaveLength(0);
    advance.click();
    expect(onAdvanceDay).not.toHaveBeenCalled();
  });

  it("enables Roster only when an onRoster handler is given, and calls it", () => {
    const onRoster = vi.fn();
    const view = new TopBarView({
      onAdvanceDay: vi.fn(),
      onMainMenu: vi.fn(),
      onRoster,
    });
    view.mount(root);
    expect(button("roster").disabled).toBe(false);
    button("roster").click();
    expect(onRoster).toHaveBeenCalledTimes(1);
  });

  it("disables Advance Day while an event waits for an answer", () => {
    const view = new TopBarView({ onAdvanceDay: vi.fn(), onMainMenu: vi.fn() });
    view.mount(root);
    const base = newGame();
    view.update({
      ...base,
      overworld: {
        ...base.overworld,
        pendingEvents: [
          {
            id: "event-1",
            typeId: "funding-review",
            createdDay: 1,
            expiresDay: 6,
          },
        ],
      },
    });
    expect(button("advance-day").disabled).toBe(true);
    expect(button("advance-day").title).toContain("event");
    view.update(base);
    expect(button("advance-day").disabled).toBe(false);
    expect(button("advance-day").title).toBe("");
  });
});
