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
import { DEPLOYABLE_TYPES } from "../../overworld/data/deployable-types";
import { BUILD_DEPLOYABLE } from "../../overworld/model/build-deployable-command";
import { DECOMMISSION_DEPLOYABLE } from "../../overworld/model/decommission-deployable-command";
import { DEPLOYABLE_TYPE_IDS } from "../../overworld/model/deployable-type";
import { DataDeployableTypeCatalogue } from "../../overworld/repository/deployable-type-catalogue";
import { MISSION_TYPES } from "../../content/data/mission-types";
import { EVENT_TYPES } from "../../overworld/data/event-types";
import { EVENT_TYPE_IDS } from "../../overworld/model/event-type";
import type { PendingEvent } from "../../overworld/model/pending-event";
import { RESOLVE_EVENT } from "../../overworld/model/resolve-event-command";
import { DataEventTypeCatalogue } from "../../overworld/repository/event-type-catalogue";
import type { Mission } from "../../overworld/model/mission";
import { OverworldSelectionState } from "../service/overworld-selection-state";
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
  readonly resolved: string[] = [];
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
    if (this.fail) {
      return err(commandError("campaign-over", "The campaign has ended"));
    }
    if (command.type === BUILD_DEPLOYABLE) {
      const type = DEPLOYABLE_TYPES[command.payload.typeId];
      this.state = {
        ...this.state,
        overworld: {
          ...this.state.overworld,
          deployables: [
            ...this.state.overworld.deployables,
            {
              id: `deployable-${String(this.state.overworld.deployables.length + 1)}`,
              typeId: command.payload.typeId,
              regionId: command.payload.regionId,
              builtDay: this.state.overworld.day,
              online: true,
            },
          ],
        },
        economy: {
          ...this.state.economy,
          credits: this.state.economy.credits - type.buildCost,
        },
      };
    } else if (command.type === DECOMMISSION_DEPLOYABLE) {
      this.state = {
        ...this.state,
        overworld: {
          ...this.state.overworld,
          deployables: this.state.overworld.deployables.filter(
            (d) => d.id !== command.payload.deployableId,
          ),
        },
      };
    } else if (command.type === RESOLVE_EVENT) {
      this.resolved.push(command.payload.choiceId);
      this.state = {
        ...this.state,
        overworld: {
          ...this.state.overworld,
          pendingEvents: this.state.overworld.pendingEvents.filter(
            (e) => e.id !== command.payload.eventId,
          ),
        },
      };
    } else if (command.type === ADVANCE_DAY) {
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
    } else {
      return err(commandError("unknown-command", "Not handled by the fake"));
    }
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
  /** Ends the campaign in defeat and notifies, as the tick would. */
  end(): void {
    this.state = {
      ...this.state,
      overworld: {
        ...this.state.overworld,
        outcome: {
          kind: "defeat",
          day: this.state.overworld.day,
          summary: {
            citiesLost: 0,
            citiesInfested: 0,
            citiesTotal: this.state.overworld.map.cities.length,
            missionsRun: 0,
            daysSurvived: this.state.overworld.day,
            finalThreat: 100,
          },
        },
      },
    };
    for (const listener of [...this.listeners]) {
      listener({ kind: "replace", state: this.state, events: [] });
    }
  }
}

const sessionWith = (store: CampaignStore | undefined): GameSession => ({
  store,
  get state() {
    return store?.getState();
  },
  start: () => undefined,
  replace: () => undefined,
  clear: () => undefined,
});

const EVENT_TYPES_CATALOGUE = new DataEventTypeCatalogue(
  EVENT_TYPE_IDS.map((id) => EVENT_TYPES[id]),
);

const DEPLOYABLE_TYPES_CATALOGUE = new DataDeployableTypeCatalogue(
  DEPLOYABLE_TYPE_IDS.map((id) => DEPLOYABLE_TYPES[id]),
);

/** Screen deps around a store, with a fresh selection unless one is given. */
const depsFor = (
  store: CampaignStore | undefined,
  router: ScreenRouter = fakeRouter().router,
  selection = new OverworldSelectionState(),
) => ({
  router,
  session: sessionWith(store),
  selection,
  deployableTypes: DEPLOYABLE_TYPES_CATALOGUE,
  missionTypes: MISSION_TYPES,
  eventTypes: EVENT_TYPES_CATALOGUE,
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
    new OverworldScreen(depsFor(store)).mount(root);
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
    new OverworldScreen(depsFor(store)).mount(root);
    button("advance-day").click();
    button("advance-day").click();
    expect(store.getState().overworld.day).toBe(3);
    expect(field("day")?.textContent).toBe("3");
    expect(field("credits")?.textContent).toBe("¢5,020");
  });

  it("shows a rejected command in the bar instead of throwing", () => {
    const store = new FakeStore(newGame());
    store.fail = true;
    new OverworldScreen(depsFor(store)).mount(root);
    button("advance-day").click();
    const status = root.querySelector<HTMLElement>('[data-role="status"]');
    expect(status?.hidden).toBe(false);
    expect(status?.textContent).toContain("ended");
  });

  it("notes when no campaign is active and keeps Advance day disabled", () => {
    new OverworldScreen(depsFor(undefined)).mount(root);
    expect(
      root.querySelector<HTMLElement>('[data-role="no-campaign"]')?.hidden,
    ).toBe(false);
    expect(field("seed")?.textContent).toBe("—");
    expect(button("advance-day").disabled).toBe(true);
  });

  it("Roster navigates to the roster screen", () => {
    const { router, navigate } = fakeRouter();
    new OverworldScreen(depsFor(new FakeStore(newGame()), router)).mount(root);
    button("roster").click();
    expect(navigate).toHaveBeenCalledWith("roster");
  });

  it("Main menu navigates to the main menu", () => {
    const { router, navigate } = fakeRouter();
    new OverworldScreen(depsFor(new FakeStore(newGame()), router)).mount(root);
    button("main-menu").click();
    expect(navigate).toHaveBeenCalledWith("main-menu");
  });

  it("renders the selected city and its region's deployables, and builds through the store", () => {
    const store = new FakeStore(newGame());
    const selection = new OverworldSelectionState();
    new OverworldScreen(depsFor(store, undefined, selection)).mount(root);
    expect(
      root.querySelector<HTMLElement>('[data-role="no-city"]')?.hidden,
    ).toBe(false);

    const city = EARTH_MAP.cities[0];
    if (!city) throw new Error("fixture map has no cities");
    selection.select(city.id);
    expect(root.querySelector("#selected-city")?.textContent).toBe(city.name);
    expect(field("region")?.textContent).toBe(
      EARTH_MAP.regions.find((r) => r.id === city.regionId)?.name,
    );
    expect(
      root.querySelector<HTMLElement>('[data-role="no-city"]')?.hidden,
    ).toBe(true);

    const build = root.querySelector<HTMLButtonElement>(
      '[data-action="build-deployable"][data-type-id="defensive-battery"]',
    );
    if (!build) throw new Error("missing build button");
    expect(build.disabled).toBe(false);
    build.click();
    expect(store.getState().overworld.deployables).toHaveLength(1);
    expect(store.getState().overworld.deployables[0]?.regionId).toBe(
      city.regionId,
    );
    expect(field("credits")?.textContent).toBe("¢3,500");
    const rows = root.querySelectorAll("#deployables [data-deployable-id]");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain("Defensive battery");

    const remove = root.querySelector<HTMLButtonElement>(
      '[data-action="decommission-deployable"]',
    );
    remove?.click();
    expect(store.getState().overworld.deployables).toHaveLength(0);
    expect(
      root.querySelectorAll("#deployables [data-deployable-id]"),
    ).toHaveLength(0);
  });

  it("shows a rejected build in the bar", () => {
    const store = new FakeStore(newGame());
    const selection = new OverworldSelectionState();
    new OverworldScreen(depsFor(store, undefined, selection)).mount(root);
    selection.select(EARTH_MAP.cities[0]?.id);
    store.fail = true;
    root
      .querySelector<HTMLButtonElement>(
        '[data-action="build-deployable"][data-type-id="sensor-array"]',
      )
      ?.click();
    const status = root.querySelector<HTMLElement>('[data-role="status"]');
    expect(status?.hidden).toBe(false);
    expect(status?.textContent).toContain("ended");
  });

  it("hands over to the game-over screen once the outcome is set", async () => {
    const store = new FakeStore(newGame());
    const { router, navigate } = fakeRouter();
    new OverworldScreen(depsFor(store, router)).mount(root);
    store.end();
    expect(navigate).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(navigate).toHaveBeenCalledWith("game-over");
  });

  it("hands over on mount when the campaign has already ended", async () => {
    const store = new FakeStore(newGame());
    store.end();
    const { router, navigate } = fakeRouter();
    new OverworldScreen(depsFor(store, router)).mount(root);
    await Promise.resolve();
    expect(navigate).toHaveBeenCalledWith("game-over");
  });

  it("does not hand over after it was unmounted", async () => {
    const store = new FakeStore(newGame());
    store.end();
    const { router, navigate } = fakeRouter();
    const screen = new OverworldScreen(depsFor(store, router));
    screen.mount(root);
    screen.unmount();
    await Promise.resolve();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("unmount unsubscribes from the store and removes the layout", () => {
    const store = new FakeStore(newGame());
    const screen = new OverworldScreen(depsFor(store));
    screen.mount(root);
    expect(store.listenerCount).toBe(1);
    screen.unmount();
    expect(store.listenerCount).toBe(0);
    expect(root.children).toHaveLength(0);
  });

  // `release` is also what takes `body[data-map-ready]` down (#473), so
  // this ordering is what stops a spec waiting on the flag from being
  // handed one left standing over a screen that has gone. That the host
  // clears it there is pinned in `dom-map-viewport-host.test.ts`; the
  // port is deliberately not imported here, so `ui` keeps depending on
  // its own abstraction rather than on `app`'s implementation of it.
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
      ...depsFor(new FakeStore(newGame())),
      mapViewport: host,
    });
    screen.mount(root);
    expect(log).toEqual(["attach:map-area"]);
    screen.unmount();
    expect(log).toEqual(["attach:map-area", "release"]);
  });

  // ===========================================
  // Missions (#76)
  // ===========================================

  const missionAt = (
    id: string,
    cityId: string,
    expiresDay: number,
    difficulty = 3,
  ): Mission => ({
    id,
    typeId: "infestation-clearance",
    cityId,
    difficulty,
    mapParams: {
      biome: "desert",
      settlement: "town",
      size: "medium",
      seed: "9",
    },
    rewards: { credits: difficulty * 300 },
    createdDay: 1,
    expiresDay,
    ignorePenalty: 10,
  });

  const withMissions = (
    day: number,
    missions: readonly Mission[],
  ): GameState => {
    const state = newGame();
    return { ...state, overworld: { ...state.overworld, day, missions } };
  };

  const MISSIONS: Mission[] = [
    missionAt("mission-2", "lagos", 9, 5),
    missionAt("mission-1", "cairo", 6, 2),
  ];

  const rows = (): HTMLElement[] => [
    ...root.querySelectorAll<HTMLElement>(
      '[data-role="mission-list"] [data-mission-id]',
    ),
  ];

  it("lists missions soonest first and opens one on click, selecting its city", () => {
    const selection = new OverworldSelectionState();
    new OverworldScreen(
      depsFor(new FakeStore(withMissions(4, MISSIONS)), undefined, selection),
    ).mount(root);
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
    const selection = new OverworldSelectionState();
    new OverworldScreen(
      depsFor(new FakeStore(withMissions(4, MISSIONS)), undefined, selection),
    ).mount(root);
    rows()[0]?.click();
    selection.select("tokyo");
    expect(root.querySelector("#selected-city")?.textContent).toBe("Tokyo");
    expect(
      root.querySelector<HTMLElement>('[data-role="mission-details"]')?.hidden,
    ).toBe(true);
    expect(rows().some((r) => r.classList.contains("is-selected"))).toBe(false);
  });

  it("Plan deployment from the briefing selects the mission and navigates to deployment", () => {
    const { router, navigate } = fakeRouter();
    const selection = new OverworldSelectionState();
    new OverworldScreen(
      depsFor(new FakeStore(withMissions(4, MISSIONS)), router, selection),
    ).mount(root);
    rows()[0]?.click();
    root
      .querySelector<HTMLButtonElement>(
        '[data-role="mission-details"] [data-action="plan-deployment"]',
      )
      ?.click();
    expect(navigate).toHaveBeenCalledWith("deployment");
    expect(selection.selection).toEqual({
      cityId: "cairo",
      missionId: "mission-1",
    });
  });

  it("Plan deployment from the city panel goes through the same selection", () => {
    const { router, navigate } = fakeRouter();
    const selection = new OverworldSelectionState();
    new OverworldScreen(
      depsFor(new FakeStore(withMissions(4, MISSIONS)), router, selection),
    ).mount(root);
    selection.select("lagos");
    root
      .querySelector<HTMLButtonElement>(
        '#city-panel [data-action="plan-deployment"]',
      )
      ?.click();
    expect(navigate).toHaveBeenCalledWith("deployment");
    expect(selection.selection).toEqual({
      cityId: "lagos",
      missionId: "mission-2",
    });
  });

  it("deselects a mission that expires on a tick and keeps the city", () => {
    const store = new FakeStore(withMissions(5, MISSIONS));
    const selection = new OverworldSelectionState();
    new OverworldScreen(depsFor(store, undefined, selection)).mount(root);
    rows()[0]?.click();
    expect(selection.selection.missionId).toBe("mission-1");
    root
      .querySelector<HTMLButtonElement>('[data-action="advance-day"]')
      ?.click();
    expect(rows().map((r) => r.dataset.missionId)).toEqual(["mission-2"]);
    expect(selection.selection).toEqual({
      cityId: "cairo",
      missionId: undefined,
    });
    expect(
      root.querySelector<HTMLElement>('[data-role="mission-details"]')?.hidden,
    ).toBe(true);
  });

  it("shows the empty mission state when nothing is on offer", () => {
    new OverworldScreen(depsFor(new FakeStore(withMissions(1, [])))).mount(
      root,
    );
    expect(rows()).toHaveLength(0);
    expect(
      root.querySelector<HTMLElement>('[data-role="no-missions"]')?.hidden,
    ).toBe(false);
  });

  it("renders the campaign even when the selection names a mission that is gone (#83)", () => {
    // Returning from the results screen: the launched mission is no longer
    // on offer but still selected. The first render clears it and must
    // still end with the bar showing the day.
    const selection = new OverworldSelectionState();
    selection.selectMission("mission-9", "lagos");
    new OverworldScreen(
      depsFor(new FakeStore(withMissions(4, MISSIONS)), undefined, selection),
    ).mount(root);
    expect(selection.selection.missionId).toBeUndefined();
    expect(field("day")?.textContent).toBe("4");
  });

  // ===========================================
  // Events (#77)
  // ===========================================

  const withEvents = (events: readonly PendingEvent[]): GameState => {
    const state = newGame();
    return {
      ...state,
      overworld: { ...state.overworld, day: 3, pendingEvents: events },
    };
  };

  const PLEA: PendingEvent = {
    id: "event-1",
    typeId: "city-plea",
    cityId: "berlin",
    createdDay: 3,
    expiresDay: 8,
  };

  it("shows the pending event as a modal and blocks Advance day until it is answered", () => {
    const store = new FakeStore(withEvents([PLEA]));
    new OverworldScreen(depsFor(store)).mount(root);
    const dialog = root.querySelector<HTMLElement>(
      '[data-role="event-dialog"]',
    );
    expect(dialog?.hidden).toBe(false);
    expect(dialog?.dataset.eventId).toBe("event-1");
    expect(root.querySelector('[data-field="event-title"]')?.textContent).toBe(
      EVENT_TYPES["city-plea"].title.replaceAll("{city}", "Berlin"),
    );
    expect(root.querySelector('[data-field="event-city"]')?.textContent).toBe(
      "Berlin",
    );
    expect(
      root.querySelector('[data-field="event-text"]')?.textContent,
    ).toContain("Berlin");
    const choices = root.querySelectorAll(
      '[data-role="event-choices"] [data-choice-id]',
    );
    expect(choices).toHaveLength(EVENT_TYPES["city-plea"].choices.length);
    const advance = root.querySelector<HTMLButtonElement>(
      '[data-action="advance-day"]',
    );
    expect(advance?.disabled).toBe(true);

    (choices[1] as HTMLButtonElement).click();
    expect(store.resolved).toEqual([EVENT_TYPES["city-plea"].choices[1]?.id]);
    expect(dialog?.hidden).toBe(true);
    expect(advance?.disabled).toBe(false);
  });

  it("shows the head of the queue and moves on to the next event after a choice", () => {
    const second: PendingEvent = {
      ...PLEA,
      id: "event-2",
      typeId: "funding-review",
      cityId: undefined,
    };
    const store = new FakeStore(withEvents([PLEA, second]));
    new OverworldScreen(depsFor(store)).mount(root);
    const dialog = root.querySelector<HTMLElement>(
      '[data-role="event-dialog"]',
    );
    root
      .querySelector<HTMLButtonElement>(
        '[data-role="event-choices"] [data-choice-id]',
      )
      ?.click();
    expect(dialog?.hidden).toBe(false);
    expect(dialog?.dataset.eventId).toBe("event-2");
    expect(
      root.querySelector<HTMLElement>('[data-field="event-city"]')?.hidden,
    ).toBe(true);
    expect(
      root.querySelector<HTMLButtonElement>('[data-action="advance-day"]')
        ?.disabled,
    ).toBe(true);
  });

  it("shows a rejected choice in the bar and keeps the dialog up", () => {
    const store = new FakeStore(withEvents([PLEA]));
    store.fail = true;
    new OverworldScreen(depsFor(store)).mount(root);
    root
      .querySelector<HTMLButtonElement>(
        '[data-role="event-choices"] [data-choice-id]',
      )
      ?.click();
    const status = root.querySelector<HTMLElement>('[data-role="status"]');
    expect(status?.hidden).toBe(false);
    expect(
      root.querySelector<HTMLElement>('[data-role="event-dialog"]')?.hidden,
    ).toBe(false);
  });
});
