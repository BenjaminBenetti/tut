// @vitest-environment jsdom
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SimpleEventBus } from "../../core/service/simple-event-bus";
import type { GameState } from "../../save/model/game-state";
import type { GameSession } from "../model/game-session";
import type { ScreenId } from "../model/screen";
import type { ScreenRouter, ScreenRouterEvents } from "../model/screen-router";
import { OverworldSelectionState } from "../service/overworld-selection-state";
import { campaignOnDay, missionAt } from "../view/mission-fixtures.test-helper";
import { DeploymentScreen } from "./deployment-screen";

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
      current: "deployment",
      navigate,
      events: new SimpleEventBus<ScreenRouterEvents>(),
    },
    navigate,
  };
};

describe("DeploymentScreen (placeholder)", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  it("names the selected mission and its city", () => {
    const selection = new OverworldSelectionState();
    selection.selectMission("mission-1", "cairo");
    new DeploymentScreen({
      router: fakeRouter().router,
      session: sessionWith(
        campaignOnDay(4, [missionAt("mission-1", "cairo", 7)]),
      ),
      selection,
    }).mount(root);
    expect(root.querySelector('[data-screen="deployment"]')).not.toBeNull();
    expect(root.querySelector('[data-field="mission-id"]')?.textContent).toBe(
      "mission-1",
    );
    expect(root.querySelector('[data-field="city-id"]')?.textContent).toBe(
      "cairo",
    );
  });

  it("shows dashes with no selection and navigates back to the overworld", () => {
    const { router, navigate } = fakeRouter();
    const screen = new DeploymentScreen({
      router,
      session: sessionWith(campaignOnDay(4, [])),
      selection: new OverworldSelectionState(),
    });
    screen.mount(root);
    expect(root.querySelector('[data-field="mission-id"]')?.textContent).toBe(
      "—",
    );
    root
      .querySelector<HTMLButtonElement>('[data-action="back-to-overworld"]')
      ?.click();
    expect(navigate).toHaveBeenCalledWith("overworld");
    screen.unmount();
    expect(root.children).toHaveLength(0);
  });
});
