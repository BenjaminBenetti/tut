// @vitest-environment jsdom
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MISSION_TYPES } from "../../content/data/mission-types";
import { commandError } from "../../core/model/command-error";
import type { Unsubscribe } from "../../core/model/event-bus";
import { err, ok } from "../../core/model/result";
import { SimpleEventBus } from "../../core/service/simple-event-bus";
import type { CampaignEvent } from "../../overworld/model/campaign-event";
import type { Mission } from "../../overworld/model/mission";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import { ADVANCE_DAY } from "../../overworld/model/overworld-command";
import type { GameState } from "../../save/model/game-state";
import type { CampaignStore, GameSession } from "../model/game-session";
import type { MapViewportHost } from "../model/map-viewport-host";
import type { ScreenId } from "../model/screen";
import type { ScreenRouter, ScreenRouterEvents } from "../model/screen-router";
import type { StoreListener } from "../model/state-store";
import { OverworldSelectionState } from "../service/overworld-selection-state";
import { campaignOnDay, missionAt } from "../view/mission-fixtures.test-helper";
import { OverworldScreen } from "./overworld-screen";

type NavigateMock = Mock<(id: ScreenId) => void>;

/**
 * A campaign store that bumps the day and pays ten credits per AdvanceDay,
 * drops missions whose expiry arrives, and refuses once `fail` is set.
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
    const day = this.state.overworld.day + 1;
    this.state = {
      ...this.state,
      overworld: {
        ...this.state.overworld,
        day,
        missions: this.state.overworld.missions.filter(
          (m) => day < m.expiresDay,
        ),
      },
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

const MISSIONS: Mission[] = [
  missionAt("mission-2", "lagos", 9, 5),
  missionAt("mission-1", "cairo", 6, 2),
];

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
  const rows = (): HTMLElement[] => [
    ...root.querySelectorAll<HTMLElement>(
      '[data-role="mission-list"] [data-mission-id]',
    ),
  ];

  const mountWith = (
    store: CampaignStore | undefined,
    extras: {
      selection?: OverworldSelectionState;
      mapViewport?: MapViewportHost;
    } = {},
  ) => {
    const { router, navigate } = fakeRouter();
    const selection = extras.selection ?? new OverworldSelectionState();
    const screen = new OverworldScreen({
      router,
      session: sessionWith(store),
      selection,
      missionTypes: MISSION_TYPES,
      mapViewport: extras.mapViewport,
    });
    screen.mount(root);
    return { screen, navigate, selection };
  };

  it("lays out the top bar, map area and side panel with the campaign facts", () => {
    mountWith(new FakeStore(campaignOnDay(1, [])));
    expect(root.querySelector('[data-screen="overworld"]')).not.toBeNull();
    expect(root.querySelector("#top-bar")).not.toBeNull();
    expect(root.querySelector("#map-area")).not.toBeNull();
    expect(root.querySelector("#side-panel")).not.toBeNull();
    expect(root.querySelector("#selected-city")?.textContent).toBe("—");
    expect(field("seed")?.textContent).toBe("3");
    expect(field("day")?.textContent).toBe("1");
    expect(field("credits")?.textContent).toBe("¢5,000");
    expect(
      root.querySelector<HTMLElement>('[data-role="no-missions"]')?.hidden,
    ).toBe(false);
  });

  it("Advance day dispatches through the store and the bar follows the store change", () => {
    const store = new FakeStore(campaignOnDay(1, []));
    mountWith(store);
    button("advance-day").click();
    button("advance-day").click();
    expect(store.getState().overworld.day).toBe(3);
    expect(field("day")?.textContent).toBe("3");
    expect(field("credits")?.textContent).toBe("¢5,020");
  });

  it("shows a rejected command in the bar instead of throwing", () => {
    const store = new FakeStore(campaignOnDay(1, []));
    store.fail = true;
    mountWith(store);
    button("advance-day").click();
    const status = root.querySelector<HTMLElement>('[data-role="status"]');
    expect(status?.hidden).toBe(false);
    expect(status?.textContent).toContain("ended");
  });

  it("lists missions soonest first and opens one on click, selecting its city", () => {
    const { selection } = mountWith(new FakeStore(campaignOnDay(4, MISSIONS)));
    expect(rows().map((r) => r.dataset.missionId)).toEqual([
      "mission-1",
      "mission-2",
    ]);
    rows()[1]?.click();
    expect(selection.selection).toEqual({
      cityId: "lagos",
      missionId: "mission-2",
    });
    expect(root.querySelector("#selected-city")?.textContent).toBe("Lagos");
    expect(rows()[1]?.classList.contains("is-selected")).toBe(true);
    const details = root.querySelector<HTMLElement>(
      '[data-role="mission-details"]',
    );
    expect(details?.hidden).toBe(false);
    expect(details?.dataset.missionId).toBe("mission-2");
  });

  it("a city picked on the map shows in the panel and drops a mission elsewhere", () => {
    const { selection } = mountWith(new FakeStore(campaignOnDay(4, MISSIONS)));
    rows()[0]?.click();
    selection.select("tokyo");
    expect(root.querySelector("#selected-city")?.textContent).toBe("Tokyo");
    expect(
      root.querySelector<HTMLElement>('[data-role="mission-details"]')?.hidden,
    ).toBe(true);
    expect(rows().some((r) => r.classList.contains("is-selected"))).toBe(false);
  });

  it("Plan deployment navigates to the deployment screen with the mission still selected", () => {
    const { navigate, selection } = mountWith(
      new FakeStore(campaignOnDay(4, MISSIONS)),
    );
    rows()[0]?.click();
    button("plan-deployment").click();
    expect(navigate).toHaveBeenCalledWith("deployment");
    expect(selection.selection.missionId).toBe("mission-1");
  });

  it("deselects a mission that expires on a tick and keeps the city", () => {
    const store = new FakeStore(campaignOnDay(5, MISSIONS));
    const { selection } = mountWith(store);
    rows()[0]?.click();
    expect(selection.selection.missionId).toBe("mission-1");
    button("advance-day").click();
    expect(rows().map((r) => r.dataset.missionId)).toEqual(["mission-2"]);
    expect(selection.selection).toEqual({
      cityId: "cairo",
      missionId: undefined,
    });
    expect(
      root.querySelector<HTMLElement>('[data-role="mission-details"]')?.hidden,
    ).toBe(true);
  });

  it("notes when no campaign is active and keeps Advance day disabled", () => {
    mountWith(undefined);
    expect(
      root.querySelector<HTMLElement>('[data-role="no-campaign"]')?.hidden,
    ).toBe(false);
    expect(field("seed")?.textContent).toBe("—");
    expect(button("advance-day").disabled).toBe(true);
  });

  it("Main menu and Roster navigate through the router", () => {
    const { navigate } = mountWith(new FakeStore(campaignOnDay(1, [])));
    button("main-menu").click();
    expect(navigate).toHaveBeenCalledWith("main-menu");
    expect(button("roster").disabled).toBe(false);
    button("roster").click();
    expect(navigate).toHaveBeenCalledWith("roster");
  });

  it("unmount unsubscribes from the store and selection and removes the layout", () => {
    const store = new FakeStore(campaignOnDay(1, []));
    const selection = new OverworldSelectionState();
    const { screen } = mountWith(store, { selection });
    expect(store.listenerCount).toBe(1);
    screen.unmount();
    expect(store.listenerCount).toBe(0);
    expect(root.children).toHaveLength(0);
    selection.select("cairo");
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
    const { screen } = mountWith(new FakeStore(campaignOnDay(1, [])), {
      mapViewport: host,
    });
    expect(log).toEqual(["attach:map-area"]);
    screen.unmount();
    expect(log).toEqual(["attach:map-area", "release"]);
  });
});
