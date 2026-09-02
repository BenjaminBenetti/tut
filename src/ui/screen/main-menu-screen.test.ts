// @vitest-environment jsdom
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SimpleEventBus } from "../../core/service/simple-event-bus";
import { AUTOSAVE_SLOT_ID } from "../../save/data/save-slots";
import type { GameState } from "../../save/model/game-state";
import { GAME_STATE_SCHEMA_VERSION } from "../../save/model/game-state";
import type { KeyValueStore } from "../../save/model/key-value-store";
import { KeyValueSaveRepository } from "../../save/repository/key-value-save-repository";
import { MemoryKeyValueStore } from "../../save/repository/memory-key-value-store";
import { createNewGameState } from "../../save/service/game-state-factory";
import { MigrationRunner } from "../../save/service/migration-runner";
import { SaveCodec } from "../../save/service/save-codec";
import { SaveService } from "../../save/service/save-service";
import type { GameSession } from "../model/game-session";
import type { ScreenId } from "../model/screen";
import type { ScreenRouter, ScreenRouterEvents } from "../model/screen-router";
import { MainMenuScreen } from "./main-menu-screen";

const NOW = "2026-09-02T12:00:00.000Z";

type NavigateMock = Mock<(id: ScreenId) => void>;

class FakeSession implements GameSession {
  state: GameState | undefined;
  start(state: GameState): void {
    this.state = state;
  }
  replace(state: GameState): void {
    this.state = state;
  }
  clear(): void {
    this.state = undefined;
  }
}

const saveServiceOver = (store: KeyValueStore): SaveService<GameState> =>
  new SaveService(
    new SaveCodec<GameState>(
      GAME_STATE_SCHEMA_VERSION,
      new MigrationRunner([], GAME_STATE_SCHEMA_VERSION),
    ),
    new KeyValueSaveRepository(store),
  );

const fakeRouter = (): { router: ScreenRouter; navigate: NavigateMock } => {
  const navigate: NavigateMock = vi.fn();
  const router: ScreenRouter = {
    current: "main-menu",
    navigate,
    events: new SimpleEventBus<ScreenRouterEvents>(),
  };
  return { router, navigate };
};

describe("MainMenuScreen", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  const mountWith = (store: KeyValueStore = new MemoryKeyValueStore()) => {
    const { router, navigate } = fakeRouter();
    const session = new FakeSession();
    const saves = saveServiceOver(store);
    const screen = new MainMenuScreen({
      router,
      session,
      saves,
      newSeed: () => 42,
      now: () => NOW,
    });
    screen.mount(root);
    return { navigate, session, saves, screen };
  };

  const button = (action: string): HTMLButtonElement => {
    const element = root.querySelector<HTMLButtonElement>(
      `[data-action="${action}"]`,
    );
    if (!element) {
      throw new Error(`Missing button ${action}`);
    }
    return element;
  };

  it("renders both actions with Continue disabled when there is no autosave", () => {
    mountWith();
    expect(root.querySelector('[data-screen="main-menu"]')).not.toBeNull();
    expect(button("new-game").disabled).toBe(false);
    expect(button("continue").disabled).toBe(true);
  });

  it("New game starts a session from the injected seed and clock, autosaves and navigates", () => {
    const { navigate, session, saves } = mountWith();
    button("new-game").click();

    expect(session.state?.meta.seed).toBe(42);
    expect(session.state?.meta.createdAt).toBe(NOW);
    const saved = saves.load(AUTOSAVE_SLOT_ID);
    expect(saved.ok && saved.value).toEqual(session.state);
    expect(navigate).toHaveBeenCalledWith("overworld");
  });

  it("Continue is enabled with an autosave and loads it into the session", () => {
    const store = new MemoryKeyValueStore();
    const existing = createNewGameState({ seed: 99, createdAt: NOW });
    saveServiceOver(store).save(AUTOSAVE_SLOT_ID, existing, NOW);

    const { navigate, session } = mountWith(store);
    expect(button("continue").disabled).toBe(false);
    button("continue").click();

    expect(session.state).toEqual(existing);
    expect(navigate).toHaveBeenCalledWith("overworld");
  });

  it("reports a failed autosave on the panel but still opens the overworld", () => {
    const failing: KeyValueStore = {
      get: () => undefined,
      set: () => {
        throw new Error("quota exceeded");
      },
      remove: () => undefined,
      keys: () => [],
    };
    const { navigate } = mountWith(failing);
    button("new-game").click();

    const status = root.querySelector<HTMLElement>('[data-role="status"]');
    expect(status?.hidden).toBe(false);
    expect(status?.textContent).toContain("quota exceeded");
    expect(navigate).toHaveBeenCalledWith("overworld");
  });

  it("unmount removes the panel and its listeners", () => {
    const { navigate, screen } = mountWith();
    const newGame = button("new-game");
    screen.unmount();

    expect(root.children).toHaveLength(0);
    newGame.click();
    expect(navigate).not.toHaveBeenCalled();
  });
});
