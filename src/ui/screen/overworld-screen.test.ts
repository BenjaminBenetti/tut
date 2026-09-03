// @vitest-environment jsdom
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { commandError } from "../../core/model/command-error";
import type { Unsubscribe } from "../../core/model/event-bus";
import { err, ok } from "../../core/model/result";
import { SimpleEventBus } from "../../core/service/simple-event-bus";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { CampaignEvent } from "../../overworld/model/campaign-event";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import { ADVANCE_DAY } from "../../overworld/model/overworld-command";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import type { CampaignStore, GameSession } from "../model/game-session";
import type { MapViewportHost } from "../model/map-viewport-host";
import type { ScreenId } from "../model/screen";
import type { ScreenRouter, ScreenRouterEvents } from "../model/screen-router";
import type { StoreListener } from "../model/state-store";
import { OverworldScreen } from "./overworld-screen";

type NavigateMock = Mock<(id: ScreenId) => void>;

const newGame = (): GameState =>
  createNewGame(
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

/**
 * A campaign store that bumps the day and pays ten credits per AdvanceDay,
 * and refuses once `fail` is set.
 */
class FakeStore implements CampaignStore {
  private state: GameState;
  private readonly listeners = new Set<
    StoreListener<GameState, OverworldCommand, CampaignEvent>
  >();
  fail = false;
  constructor(state: GameState) {
    this.state = state;
  }
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
    if (this.fail || command.type !== ADVANCE_DAY) {
      return err(commandError("campaign-over", "The campaign has ended"));
    }
    this.state = {
      ...this.state,
      overworld: { ...this.state.overworld, day: this.state.overworld.day + 1 },
      economy: {
        ...this.state.economy,
        credits: this.state.economy.credits + 10,
      },
    };
    for (const listener of [...this.listeners]) {
      listener({ kind: "command", command, state: this.state, events: [] });
    }
    return ok({ state: this.state, events: [] });
  }
  onError(): Unsubscribe {
    return () => undefined;
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}

const sessionWith = (store: CampaignStore | undefined): GameSession => ({
  store,
  state: store?.getState(),
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

  const field = (name: string): HTMLElement | null =>
    root.querySelector<HTMLElement>(`[data-field="${name}"]`);
  const button = (action: string): HTMLButtonElement => {
    const el = root.querySelector<HTMLButtonElement>(
      `[data-action="${action}"]`,
    );
    if (!el) throw new Error(`missing button ${action}`);
    return el;
  };

  it("lays out the top bar, map area and side panel with the campaign facts", () => {
    const store = new FakeStore(newGame());
    new OverworldScreen({
      router: fakeRouter().router,
      session: sessionWith(store),
    }).mount(root);
    expect(root.querySelector('[data-screen="overworld"]')).not.toBeNull();
    expect(root.querySelector("#top-bar")).not.toBeNull();
    expect(root.querySelector("#map-area")).not.toBeNull();
    expect(root.querySelector("#side-panel")).not.toBeNull();
    expect(root.querySelector("#selected-city")).not.toBeNull();
    expect(field("seed")?.textContent).toBe("1234");
    expect(field("day")?.textContent).toBe("1");
    expect(field("credits")?.textContent).toBe("¢5,000");
  });

  it("Advance day dispatches through the store and the bar follows the store change", () => {
    const store = new FakeStore(newGame());
    new OverworldScreen({
      router: fakeRouter().router,
      session: sessionWith(store),
    }).mount(root);
    button("advance-day").click();
    button("advance-day").click();
    expect(store.getState().overworld.day).toBe(3);
    expect(field("day")?.textContent).toBe("3");
    expect(field("credits")?.textContent).toBe("¢5,020");
  });

  it("shows a rejected command in the bar instead of throwing", () => {
    const store = new FakeStore(newGame());
    store.fail = true;
    new OverworldScreen({
      router: fakeRouter().router,
      session: sessionWith(store),
    }).mount(root);
    button("advance-day").click();
    const status = root.querySelector<HTMLElement>('[data-role="status"]');
    expect(status?.hidden).toBe(false);
    expect(status?.textContent).toContain("ended");
  });

  it("notes when no campaign is active and keeps Advance day disabled", () => {
    new OverworldScreen({
      router: fakeRouter().router,
      session: sessionWith(undefined),
    }).mount(root);
    expect(
      root.querySelector<HTMLElement>('[data-role="no-campaign"]')?.hidden,
    ).toBe(false);
    expect(field("seed")?.textContent).toBe("—");
    expect(button("advance-day").disabled).toBe(true);
  });

  it("Main menu navigates to the main menu", () => {
    const { router, navigate } = fakeRouter();
    new OverworldScreen({
      router,
      session: sessionWith(new FakeStore(newGame())),
    }).mount(root);
    button("main-menu").click();
    expect(navigate).toHaveBeenCalledWith("main-menu");
  });

  it("unmount unsubscribes from the store and removes the layout", () => {
    const store = new FakeStore(newGame());
    const screen = new OverworldScreen({
      router: fakeRouter().router,
      session: sessionWith(store),
    });
    screen.mount(root);
    expect(store.listenerCount).toBe(1);
    screen.unmount();
    expect(store.listenerCount).toBe(0);
    expect(root.children).toHaveLength(0);
  });

  it("borrows the map viewport into #map-area while mounted and returns it on unmount", () => {
    const log: string[] = [];
    const host: MapViewportHost = {
      attach: (container) => {
        log.push(`attach:${container.id}`);
      },
      release: () => {
        log.push("release");
      },
    };
    const screen = new OverworldScreen({
      router: fakeRouter().router,
      session: sessionWith(new FakeStore(newGame())),
      mapViewport: host,
    });
    screen.mount(root);
    expect(log).toEqual(["attach:map-area"]);
    screen.unmount();
    expect(log).toEqual(["attach:map-area", "release"]);
  });
});
