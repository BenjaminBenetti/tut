// @vitest-environment jsdom
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SimpleEventBus } from "../../core/service/simple-event-bus";
import type { GameState } from "../../save/model/game-state";
import type { GameSession } from "../model/game-session";
import type { ScreenId } from "../model/screen";
import type { ScreenRouter, ScreenRouterEvents } from "../model/screen-router";
import { campaignOnDay } from "../view/mission-fixtures.test-helper";
import { MissionResultsScreen } from "./mission-results-screen";

const sessionWith = (state: GameState | undefined): GameSession => ({
  store: undefined,
  state,
  start: () => undefined,
  replace: () => undefined,
  clear: () => undefined,
});

const fakeRouter = (): {
  router: ScreenRouter;
  navigate: Mock<(id: ScreenId) => void>;
} => {
  const navigate: Mock<(id: ScreenId) => void> = vi.fn();
  return {
    router: {
      current: "mission-results",
      navigate,
      events: new SimpleEventBus<ScreenRouterEvents>(),
    },
    navigate,
  };
};

describe("MissionResultsScreen (placeholder)", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  it("shows the last result's headline numbers and continues to the overworld", () => {
    const base = campaignOnDay(5, []);
    const state: GameState = {
      ...base,
      overworld: {
        ...base.overworld,
        lastMissionResult: {
          missionId: "mission-1",
          outcome: "won",
          squadCasualties: [],
          squadsWiped: ["squad-2"],
          mechsDestroyed: [],
          mechDamage: [],
          creditsAwarded: 900,
          infestationDelta: -20,
        },
      },
    };
    const { router, navigate } = fakeRouter();
    new MissionResultsScreen({ router, session: sessionWith(state) }).mount(
      root,
    );
    expect(
      root.querySelector('[data-screen="mission-results"]'),
    ).not.toBeNull();
    expect(root.querySelector('[data-field="outcome"]')?.textContent).toBe(
      "Mission won",
    );
    expect(root.querySelector('[data-field="credits"]')?.textContent).toBe(
      "¢900",
    );
    expect(root.querySelector('[data-field="squads-wiped"]')?.textContent).toBe(
      "1",
    );
    expect(
      root.querySelector('[data-field="infestation-delta"]')?.textContent,
    ).toBe("-20");
    root.querySelector<HTMLButtonElement>('[data-action="continue"]')?.click();
    expect(navigate).toHaveBeenCalledWith("overworld");
  });

  it("says so when nothing has been resolved and unmounts cleanly", () => {
    const screen = new MissionResultsScreen({
      router: fakeRouter().router,
      session: sessionWith(campaignOnDay(1, [])),
    });
    screen.mount(root);
    expect(root.querySelector('[data-field="outcome"]')?.textContent).toBe(
      "No result",
    );
    screen.unmount();
    expect(root.children).toHaveLength(0);
  });
});
