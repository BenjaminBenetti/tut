// @vitest-environment jsdom
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SimpleEventBus } from "../../core/service/simple-event-bus";
import type { GameState } from "../../save/model/game-state";
import { createNewGameState } from "../../save/service/game-state-factory";
import type { GameSession } from "../model/game-session";
import type { ScreenId } from "../model/screen";
import type { ScreenRouter, ScreenRouterEvents } from "../model/screen-router";
import { OverworldScreen } from "./overworld-screen";

type NavigateMock = Mock<(id: ScreenId) => void>;

const sessionWith = (state: GameState | undefined): GameSession => ({
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
    const state = createNewGameState({
      seed: 1234,
      createdAt: "2026-09-02T12:00:00.000Z",
    });
    new OverworldScreen({
      router: fakeRouter().router,
      session: sessionWith(state),
    }).mount(root);

    expect(root.querySelector('[data-screen="overworld"]')).not.toBeNull();
    expect(root.querySelector('[data-field="seed"]')?.textContent).toBe("1234");
    expect(root.querySelector('[data-field="created-at"]')?.textContent).toBe(
      "2026-09-02T12:00:00.000Z",
    );
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
