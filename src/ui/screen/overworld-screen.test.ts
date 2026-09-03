// @vitest-environment jsdom
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SimpleEventBus } from "../../core/service/simple-event-bus";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import type { GameSession } from "../model/game-session";
import type { ScreenId } from "../model/screen";
import type { ScreenRouter, ScreenRouterEvents } from "../model/screen-router";
import { OverworldScreen } from "./overworld-screen";

type NavigateMock = Mock<(id: ScreenId) => void>;

const sessionWith = (state: GameState | undefined): GameSession => ({
  store: undefined,
  state,
  start: () => undefined,
  replace: () => undefined,
  clear: () => undefined,
});

const fakeRouter = (): { router: ScreenRouter; navigate: NavigateMock } => {
  const navigate: NavigateMock = vi.fn();
  const router: ScreenRouter = {
    current: "overworld",
    navigate,
    events: new SimpleEventBus<ScreenRouterEvents>(),
  };
  return { router, navigate };
};

describe("OverworldScreen", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  it("shows the seed and start time of the active campaign", () => {
    const state = createNewGame(
      { seed: 1234, createdAt: "2026-09-02T12:00:00.000Z" },
      {
        map: EARTH_MAP,
        squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
        starterRoster: STARTER_ROSTER,
        newGameTuning: NEW_GAME_TUNING,
        threatTuning: THREAT_TUNING,
        economyTuning: ECONOMY_TUNING,
      },
    );
    new OverworldScreen({
      router: fakeRouter().router,
      session: sessionWith(state),
    }).mount(root);

    expect(root.querySelector('[data-screen="overworld"]')).not.toBeNull();
    expect(root.querySelector('[data-field="seed"]')?.textContent).toBe("1234");
    expect(root.querySelector('[data-field="created-at"]')?.textContent).toBe(
      "2026-09-02T12:00:00.000Z",
    );
    expect(root.querySelector("#selected-city")).not.toBeNull();
  });

  it("notes when no campaign is active instead of a seed", () => {
    new OverworldScreen({
      router: fakeRouter().router,
      session: sessionWith(undefined),
    }).mount(root);

    expect(root.querySelector('[data-field="seed"]')).toBeNull();
    expect(root.querySelector('[data-role="no-campaign"]')).not.toBeNull();
  });

  it("Back to menu navigates to the main menu", () => {
    const { router, navigate } = fakeRouter();
    new OverworldScreen({ router, session: sessionWith(undefined) }).mount(
      root,
    );
    root
      .querySelector<HTMLButtonElement>('[data-action="back-to-menu"]')
      ?.click();
    expect(navigate).toHaveBeenCalledWith("main-menu");
  });

  it("unmount removes the panel and its listener", () => {
    const { router, navigate } = fakeRouter();
    const screen = new OverworldScreen({
      router,
      session: sessionWith(undefined),
    });
    screen.mount(root);
    const back = root.querySelector<HTMLButtonElement>(
      '[data-action="back-to-menu"]',
    );
    screen.unmount();

    expect(root.children).toHaveLength(0);
    back?.click();
    expect(navigate).not.toHaveBeenCalled();
  });
});
