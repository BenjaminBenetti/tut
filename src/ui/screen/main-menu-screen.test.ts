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
import { AUTOSAVE_SLOT_ID } from "../../save/data/save-slots";
import type { GameState } from "../../save/model/game-state";
import type { KeyValueStore } from "../../save/model/key-value-store";
import { MemoryKeyValueStore } from "../../save/repository/memory-key-value-store";
import type { GameSaveService } from "../../save/service/game-save-service";
import { createGameSaveService } from "../../save/service/game-save-service";
import type { NewGameOptions } from "../../save/service/game-state-factory";
import { createNewGame } from "../../save/service/new-game-service";
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

/** A campaign from the shipped content. */
const createCampaign = (options: NewGameOptions): GameState =>
  createNewGame(options, {
    map: EARTH_MAP,
    squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
    starterRoster: STARTER_ROSTER,
    newGameTuning: NEW_GAME_TUNING,
    threatTuning: THREAT_TUNING,
    economyTuning: ECONOMY_TUNING,
  });

const savesOver = (store: KeyValueStore): GameSaveService =>
  createGameSaveService(store, { now: () => NOW });

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
    const saves = savesOver(store);
    const screen = new MainMenuScreen({
      router,
      session,
      saves,
      createCampaign,
      newSeed: () => 42,
      clock: { now: () => NOW },
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
    expect(session.state?.roster.squads.length).toBeGreaterThan(0);
    const saved = saves.loadGame(AUTOSAVE_SLOT_ID);
    expect(saved.ok && saved.value).toEqual(session.state);
    expect(navigate).toHaveBeenCalledWith("overworld");
  });

  it("Continue is enabled with an autosave and loads it into the session", () => {
    const store = new MemoryKeyValueStore();
    const existing = createCampaign({ seed: 99, createdAt: NOW });
    savesOver(store).saveGame(AUTOSAVE_SLOT_ID, existing);

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
