// @vitest-environment jsdom
import type { Object3D } from "three";
import { Group } from "three";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { commandError } from "../../core/model/command-error";
import type { Unsubscribe } from "../../core/model/event-bus";
import { err, ok } from "../../core/model/result";
import { SimpleEventBus } from "../../core/service/simple-event-bus";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import type { ModelLoader } from "../../graphics/model/model-loader";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { CampaignEvent } from "../../overworld/model/campaign-event";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { ATTACK } from "../../tactical/model/attack-command";
import type { CampaignStore, GameSession } from "../model/game-session";
import type { ScreenId } from "../model/screen";
import type { ScreenRouter, ScreenRouterEvents } from "../model/screen-router";
import type { StoreListener } from "../model/state-store";
import { hudMission } from "../view/mission-hud.test-helper";
import type { SceneHandle } from "./tactical-screen";
import { TacticalScreen } from "./tactical-screen";

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

/** A store that records commands and refuses attacks. */
class FakeStore implements CampaignStore {
  readonly dispatched: OverworldCommand[] = [];
  private readonly listeners = new Set<
    StoreListener<GameState, OverworldCommand, CampaignEvent>
  >();
  constructor(private state: GameState) {}
  getState(): GameState {
    return this.state;
  }
  subscribe(
    listener: StoreListener<GameState, OverworldCommand, CampaignEvent>,
  ): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  dispatch(command: OverworldCommand) {
    this.dispatched.push(command);
    if (command.type === ATTACK) {
      return err(commandError("no-line-of-sight", "No line of sight"));
    }
    return ok({ state: this.state, events: [] });
  }
  onError(): Unsubscribe {
    return () => undefined;
  }
  replace(state: GameState): void {
    this.state = state;
    for (const listener of [...this.listeners]) {
      listener({ kind: "replace", state, events: [] });
    }
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}

const fakeModels: ModelLoader = {
  load: (): Promise<Object3D> => Promise.resolve(new Group()),
  preload: () => Promise.resolve(),
};

type NavigateMock = Mock<(id: ScreenId) => void>;

function fakeRouter(): { router: ScreenRouter; navigate: NavigateMock } {
  const navigate: NavigateMock = vi.fn();
  return {
    router: {
      current: "tactical",
      navigate,
      events: new SimpleEventBus<ScreenRouterEvents>(),
    },
    navigate,
  };
}

function sessionWith(store: CampaignStore | undefined): GameSession {
  return {
    store,
    get state() {
      return store?.getState();
    },
    start: () => undefined,
    replace: () => undefined,
    clear: () => undefined,
  };
}

describe("TacticalScreen", () => {
  let root: HTMLElement;
  const scenes: {
    started: boolean;
    disposed: boolean;
    container: HTMLElement;
  }[] = [];
  const createScene = (container: HTMLElement): SceneHandle => {
    const handle = { started: false, disposed: false, container };
    scenes.push(handle);
    return {
      start: () => {
        handle.started = true;
      },
      dispose: () => {
        handle.disposed = true;
      },
    };
  };

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
    scenes.length = 0;
  });

  it("shows a note and no scene without a mission", () => {
    const store = new FakeStore(newGame());
    new TacticalScreen({
      router: fakeRouter().router,
      session: sessionWith(store),
      models: fakeModels,
      combatTuning: COMBAT_TUNING,
      createScene,
    }).mount(root);
    expect(root.querySelector('[data-screen="tactical"]')).not.toBeNull();
    expect(
      root.querySelector<HTMLElement>('[data-role="status"]')?.textContent,
    ).toContain("No mission");
    expect(scenes).toHaveLength(0);
  });

  it("builds the scene for the active mission, renders the HUD, dispatches and shows refusals", async () => {
    const state: GameState = { ...newGame(), activeMission: hudMission() };
    const store = new FakeStore(state);
    const { router, navigate } = fakeRouter();
    const screen = new TacticalScreen({
      router,
      session: sessionWith(store),
      models: fakeModels,
      combatTuning: COMBAT_TUNING,
      createScene,
    });
    screen.mount(root);
    expect(scenes).toHaveLength(1);
    expect(scenes[0]?.started).toBe(true);
    expect(scenes[0]?.container.id).toBe("tactical-map");
    expect(root.querySelector('[data-field="turn"]')?.textContent).toBe("2");
    await Promise.resolve();

    const hooks = screen.hooks();
    expect(hooks).toBeDefined();
    hooks?.selectUnit("s1");
    expect(root.querySelector('[data-field="unit-name"]')?.textContent).toBe(
      "Rifle Squad",
    );
    root.querySelector<HTMLButtonElement>('[data-action="attack"]')?.click();
    hooks?.selectUnit("b1");
    expect(root.querySelector<HTMLElement>("#hit-preview")?.hidden).toBe(false);
    root
      .querySelector<HTMLButtonElement>('[data-action="confirm-attack"]')
      ?.click();
    expect(store.dispatched.map((c) => c.type)).toEqual([ATTACK]);
    expect(
      root.querySelector<HTMLElement>('[data-role="status"]')?.textContent,
    ).toBe("No line of sight");

    root.querySelector<HTMLButtonElement>('[data-action="overworld"]')?.click();
    expect(navigate).toHaveBeenCalledWith("overworld");

    screen.unmount();
    expect(scenes[0]?.disposed).toBe(true);
    expect(store.listenerCount).toBe(0);
    expect(root.querySelector('[data-screen="tactical"]')).toBeNull();
  });

  it("tears the scene down when the mission ends", () => {
    const state: GameState = { ...newGame(), activeMission: hudMission() };
    const store = new FakeStore(state);
    new TacticalScreen({
      router: fakeRouter().router,
      session: sessionWith(store),
      models: fakeModels,
      combatTuning: COMBAT_TUNING,
      createScene,
    }).mount(root);
    const { activeMission: _ended, ...rest } = state;
    store.replace(rest);
    expect(scenes[0]?.disposed).toBe(true);
    expect(
      root.querySelector<HTMLElement>('[data-role="status"]')?.textContent,
    ).toContain("No mission");
  });
});
