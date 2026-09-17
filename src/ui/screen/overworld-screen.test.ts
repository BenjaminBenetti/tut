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
import { deployableBuildCost } from "../../overworld/model/deployable-type";
import { BUILD_DEPLOYABLE } from "../../overworld/model/build-deployable-command";
import {
  DECOMMISSION_DEPLOYABLE,
  decommissionDeployable,
} from "../../overworld/model/decommission-deployable-command";
import { nextDeployableLevel } from "../../overworld/model/deployable-level";
import { levelSpec } from "../../overworld/model/deployable-type";
import {
  UPGRADE_DEPLOYABLE,
  upgradeDeployable,
} from "../../overworld/model/upgrade-deployable-command";
import { DEPLOYABLE_TYPE_IDS } from "../../overworld/model/deployable-type";
import { DataDeployableTypeCatalogue } from "../../overworld/repository/deployable-type-catalogue";
import { MISSION_TYPES } from "../../content/data/mission-types";
import { EVENT_TYPES } from "../../overworld/data/event-types";
import { EVENT_TYPE_IDS } from "../../overworld/model/event-type";
import type { PendingEvent } from "../../overworld/model/pending-event";
import { RESOLVE_EVENT } from "../../overworld/model/resolve-event-command";
import { DataEventTypeCatalogue } from "../../overworld/repository/event-type-catalogue";
import type { Mission } from "../../overworld/model/mission";
import { findCity } from "../../overworld/service/earth-map-query-service";
import type { CityPickSource } from "../model/city-pick-source";
import type { InstallationPickSource } from "../model/installation-pick-source";
import type { ScreenAnchor } from "../view/radial-menu-view";
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
  readonly dispatched: OverworldCommand[] = [];
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
    this.dispatched.push(command);
    if (this.fail) {
      return err(commandError("campaign-over", "The campaign has ended"));
    }
    if (command.type === UPGRADE_DEPLOYABLE) {
      const held = this.state.overworld.deployables.find(
        (d) => d.id === command.payload.deployableId,
      );
      const next = held ? nextDeployableLevel(held.level) : undefined;
      if (!held || next === undefined) {
        return err(commandError("max-level-reached", "Already at max level"));
      }
      const cost = levelSpec(DEPLOYABLE_TYPES[held.typeId], next).buildCost;
      if (this.state.economy.credits < cost) {
        return err(commandError("insufficient-credits", "Not enough credits"));
      }
      this.state = {
        ...this.state,
        overworld: {
          ...this.state.overworld,
          deployables: this.state.overworld.deployables.map((d) =>
            d.id === held.id ? { ...d, level: next } : d,
          ),
        },
        economy: {
          ...this.state.economy,
          credits: this.state.economy.credits - cost,
        },
      };
    } else if (command.type === BUILD_DEPLOYABLE) {
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
              level: 1,
              builtDay: this.state.overworld.day,
              online: true,
            },
          ],
        },
        economy: {
          ...this.state.economy,
          credits: this.state.economy.credits - deployableBuildCost(type),
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

/** The shipped map's city → region lookup, as the app injects it. */
const regionOf = (cityId: string): string | undefined =>
  findCity(EARTH_MAP, cityId)?.regionId;

/** A selection over the shipped map. */
const newSelection = (): OverworldSelectionState =>
  new OverworldSelectionState(regionOf);

/**
 * A map that reports picks on demand and places every city at a fixed
 * screen point unless told otherwise (#1154).
 */
class FakePicks implements CityPickSource {
  readonly positions = new Map<string, ScreenAnchor | undefined>();
  private readonly listeners = new Set<(cityId: string) => void>();
  onCityPicked(listener: (cityId: string) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  cityScreenPosition(cityId: string): ScreenAnchor | undefined {
    return this.positions.has(cityId)
      ? this.positions.get(cityId)
      : { x: 300, y: 200 };
  }
  /** A pointer pick on the marker. */
  pick(cityId: string): void {
    for (const listener of [...this.listeners]) {
      listener(cityId);
    }
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}

/**
 * A map that reports installation picks on demand and places every
 * installation at a fixed screen point unless told otherwise (#1155).
 */
class FakeInstallationPicks implements InstallationPickSource {
  readonly positions = new Map<string, ScreenAnchor | undefined>();
  private readonly listeners = new Set<(id: string) => void>();
  onInstallationPicked(listener: (id: string) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  installationScreenPosition(id: string): ScreenAnchor | undefined {
    return this.positions.has(id) ? this.positions.get(id) : { x: 120, y: 80 };
  }
  /** A pointer pick on the model. */
  pick(id: string): void {
    for (const listener of [...this.listeners]) {
      listener(id);
    }
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}

/** Screen deps around a store, with a fresh selection unless one is given. */
const depsFor = (
  store: CampaignStore | undefined,
  router: ScreenRouter = fakeRouter().router,
  selection = newSelection(),
  cityPicks?: CityPickSource,
  installationPicks?: InstallationPickSource,
) => ({
  router,
  session: sessionWith(store),
  selection,
  deployableTypes: DEPLOYABLE_TYPES_CATALOGUE,
  missionTypes: MISSION_TYPES,
  eventTypes: EVENT_TYPES_CATALOGUE,
  ...(cityPicks === undefined ? {} : { cityPicks }),
  ...(installationPicks === undefined ? {} : { installationPicks }),
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
    expect(root.querySelector("#selected-region")).not.toBeNull();
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

  it("renders the selected city's region with its cities and deployables, and builds through the store", () => {
    const store = new FakeStore(newGame());
    const selection = newSelection();
    new OverworldScreen(depsFor(store, undefined, selection)).mount(root);
    expect(
      root.querySelector<HTMLElement>('[data-role="no-region"]')?.hidden,
    ).toBe(false);

    const city = EARTH_MAP.cities[0];
    if (!city) throw new Error("fixture map has no cities");
    selection.select(city.id);
    expect(root.querySelector("#selected-region")?.textContent).toBe(
      EARTH_MAP.regions.find((r) => r.id === city.regionId)?.name,
    );
    const current = root.querySelector<HTMLElement>(
      '#region-panel [data-city-id][aria-current="true"]',
    );
    expect(current?.dataset.cityId).toBe(city.id);
    expect(current?.textContent).toContain(city.name);
    expect(root.querySelectorAll("#region-panel [data-city-id]")).toHaveLength(
      EARTH_MAP.regions.find((r) => r.id === city.regionId)?.cityIds.length ??
        -1,
    );
    expect(
      root.querySelector<HTMLElement>('[data-role="no-region"]')?.hidden,
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
    const selection = newSelection();
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
    const selection = newSelection();
    new OverworldScreen(
      depsFor(new FakeStore(withMissions(4, MISSIONS)), undefined, selection),
    ).mount(root);
    expect(rows().map((r) => r.dataset.missionId)).toEqual([
      "mission-1",
      "mission-2",
    ]);
    rows()[1]?.click();
    expect(selection.selection).toEqual({
      regionId: "sub-saharan-africa",
      cityId: "lagos",
      missionId: "mission-2",
    });
    expect(root.querySelector("#selected-region")?.textContent).toBe(
      "Sub-Saharan Africa",
    );
    expect(
      root.querySelector<HTMLElement>(
        '#region-panel [data-city-id][aria-current="true"]',
      )?.dataset.cityId,
    ).toBe("lagos");
    // The list narrows to the region the mission is in.
    expect(rows().map((r) => r.dataset.missionId)).toEqual(["mission-2"]);
    expect(rows()[0]?.classList.contains("is-selected")).toBe(true);
    const details = root.querySelector<HTMLElement>(
      '[data-role="mission-details"]',
    );
    expect(details?.hidden).toBe(false);
    expect(details?.dataset.missionId).toBe("mission-2");
  });

  it("a city picked on the map shows in the panel and drops a mission elsewhere", () => {
    const selection = newSelection();
    new OverworldScreen(
      depsFor(new FakeStore(withMissions(4, MISSIONS)), undefined, selection),
    ).mount(root);
    rows()[0]?.click();
    selection.select("tokyo");
    expect(root.querySelector("#selected-region")?.textContent).toBe(
      "East Asia",
    );
    expect(
      root.querySelector<HTMLElement>(
        '#region-panel [data-city-id][aria-current="true"]',
      )?.dataset.cityId,
    ).toBe("tokyo");
    expect(
      root.querySelector<HTMLElement>('[data-role="mission-details"]')?.hidden,
    ).toBe(true);
    // East Asia has no mission on offer, so the list is empty; Show all
    // clears the region and every mission returns.
    expect(rows()).toHaveLength(0);
    button("show-all-missions").click();
    expect(selection.selection).toEqual({
      regionId: undefined,
      cityId: undefined,
      missionId: undefined,
    });
    expect(rows()).toHaveLength(2);
    expect(rows().some((r) => r.classList.contains("is-selected"))).toBe(false);
  });

  it("a city row in the region panel selects that city (#1154)", () => {
    const selection = newSelection();
    new OverworldScreen(
      depsFor(new FakeStore(withMissions(4, MISSIONS)), undefined, selection),
    ).mount(root);
    selection.select("lagos");
    root
      .querySelector<HTMLElement>('#region-panel [data-city-id="nairobi"]')
      ?.click();
    expect(selection.selection).toEqual({
      regionId: "sub-saharan-africa",
      cityId: "nairobi",
      missionId: undefined,
    });
    expect(
      root.querySelector<HTMLElement>(
        '#region-panel [data-city-id][aria-current="true"]',
      )?.dataset.cityId,
    ).toBe("nairobi");
  });

  it("Plan deployment from the briefing selects the mission and navigates to deployment", () => {
    const { router, navigate } = fakeRouter();
    const selection = newSelection();
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
      regionId: "middle-east",
      cityId: "cairo",
      missionId: "mission-1",
    });
  });

  it("deselects a mission that expires on a tick and keeps the city", () => {
    const store = new FakeStore(withMissions(5, MISSIONS));
    const selection = newSelection();
    new OverworldScreen(depsFor(store, undefined, selection)).mount(root);
    rows()[0]?.click();
    expect(selection.selection.missionId).toBe("mission-1");
    root
      .querySelector<HTMLButtonElement>('[data-action="advance-day"]')
      ?.click();
    // Cairo's region is still selected, so Lagos's mission is off the list.
    expect(rows()).toHaveLength(0);
    expect(selection.selection).toEqual({
      regionId: "middle-east",
      cityId: "cairo",
      missionId: undefined,
    });
    selection.selectRegion(undefined);
    expect(rows().map((r) => r.dataset.missionId)).toEqual(["mission-2"]);
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
    const selection = newSelection();
    selection.selectMission("mission-9", "lagos");
    new OverworldScreen(
      depsFor(new FakeStore(withMissions(4, MISSIONS)), undefined, selection),
    ).mount(root);
    expect(selection.selection.missionId).toBeUndefined();
    expect(field("day")?.textContent).toBe("4");
  });

  // ===========================================
  // City wheel (#1154)
  // ===========================================

  const wheel = (): HTMLElement | null =>
    root.querySelector<HTMLElement>("#radial-menu");
  const wheelItems = (): string[] =>
    [...root.querySelectorAll<HTMLElement>("#radial-menu [data-item]")].map(
      (b) => b.dataset.item ?? "",
    );

  it("a map pick opens the wheel at the marker with infestation, name and population, and the missions there", () => {
    const picks = new FakePicks();
    const selection = newSelection();
    const offered = withMissions(4, MISSIONS);
    // Lagos is infested and detected, so the hub shows its number.
    const state: GameState = {
      ...offered,
      overworld: {
        ...offered.overworld,
        map: {
          ...offered.overworld.map,
          cities: offered.overworld.map.cities.map((c) =>
            c.id === "lagos" ? { ...c, infestation: 12, detected: true } : c,
          ),
        },
      },
    };
    new OverworldScreen(
      depsFor(new FakeStore(state), undefined, selection, picks),
    ).mount(root);
    expect(wheel()?.hidden).toBe(true);
    selection.select("lagos");
    picks.pick("lagos");
    expect(wheel()?.hidden).toBe(false);
    expect(wheel()?.style.left).toBe("300px");
    expect(wheel()?.style.top).toBe("200px");
    expect(findCity(state.overworld.map, "lagos")?.detected).toBe(true);
    expect(field("hub-value")?.textContent).toBe("12");
    expect(
      root.querySelector("#radial-menu .tut-radial__caption")?.textContent,
    ).toBe("Lagos · 16.6M");
    expect(wheelItems()).toEqual(["mission:mission-2", "region"]);
  });

  it("opens nothing for a city the map is not drawing, or with no campaign", () => {
    const picks = new FakePicks();
    picks.positions.set("tokyo", undefined);
    const selection = newSelection();
    new OverworldScreen(
      depsFor(new FakeStore(newGame()), undefined, selection, picks),
    ).mount(root);
    picks.pick("tokyo");
    expect(wheel()?.hidden).toBe(true);
    const idle = new OverworldScreen(
      depsFor(undefined, undefined, newSelection(), picks),
    );
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
    idle.mount(root);
    picks.pick("lagos");
    expect(wheel()?.hidden).toBe(true);
  });

  it("a mission entry on the wheel opens that briefing and closes the wheel", () => {
    const picks = new FakePicks();
    const selection = newSelection();
    new OverworldScreen(
      depsFor(
        new FakeStore(withMissions(4, MISSIONS)),
        undefined,
        selection,
        picks,
      ),
    ).mount(root);
    selection.select("cairo");
    picks.pick("cairo");
    root
      .querySelector<HTMLButtonElement>(
        '#radial-menu [data-item="mission:mission-1"]',
      )
      ?.click();
    expect(wheel()?.hidden).toBe(true);
    expect(selection.selection).toEqual({
      regionId: "middle-east",
      cityId: "cairo",
      missionId: "mission-1",
    });
    expect(
      root.querySelector<HTMLElement>('[data-role="mission-details"]')?.dataset
        .missionId,
    ).toBe("mission-1");
  });

  it("the Region entry lands on the region panel and closes the wheel", () => {
    const picks = new FakePicks();
    const selection = newSelection();
    new OverworldScreen(
      depsFor(new FakeStore(newGame()), undefined, selection, picks),
    ).mount(root);
    selection.select("tokyo");
    picks.pick("tokyo");
    root
      .querySelector<HTMLButtonElement>('#radial-menu [data-item="region"]')
      ?.click();
    expect(wheel()?.hidden).toBe(true);
    expect(document.activeElement?.id).toBe("region-panel");
    expect(root.querySelector("#selected-region")?.textContent).toBe(
      "East Asia",
    );
  });

  it("another selection, Escape and unmount dismiss the wheel; the same pick reopens it", () => {
    const picks = new FakePicks();
    const selection = newSelection();
    const screen = new OverworldScreen(
      depsFor(
        new FakeStore(withMissions(4, MISSIONS)),
        undefined,
        selection,
        picks,
      ),
    );
    screen.mount(root);
    selection.select("tokyo");
    picks.pick("tokyo");
    expect(wheel()?.hidden).toBe(false);
    // A pick elsewhere: the selection changes first, closing Tokyo's
    // wheel, and the new pick opens Cairo's.
    selection.select("cairo");
    expect(wheel()?.hidden).toBe(true);
    picks.pick("cairo");
    expect(wheel()?.hidden).toBe(false);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(wheel()?.hidden).toBe(true);
    picks.pick("cairo");
    expect(wheel()?.hidden).toBe(false);
    screen.unmount();
    expect(root.querySelector("#radial-menu")).toBeNull();
    expect(picks.listenerCount).toBe(0);
  });

  it("a tick redraws the open wheel: an expired mission leaves the ring", () => {
    const picks = new FakePicks();
    const selection = newSelection();
    const store = new FakeStore(withMissions(5, MISSIONS));
    new OverworldScreen(depsFor(store, undefined, selection, picks)).mount(
      root,
    );
    selection.select("cairo");
    picks.pick("cairo");
    expect(wheelItems()).toEqual(["mission:mission-1", "region"]);
    button("advance-day").click();
    expect(wheel()?.hidden).toBe(false);
    expect(wheelItems()).toEqual(["region"]);
  });

  // ===========================================
  // Installation wheel (#1155)
  // ===========================================

  /** A campaign holding one level 1 battery in Tokyo's region, with `credits`. */
  const withBattery = (credits: number, level: 1 | 2 | 3 = 1): GameState => {
    const base = newGame();
    return {
      ...base,
      overworld: {
        ...base.overworld,
        deployables: [
          {
            id: "deployable-1",
            typeId: "defensive-battery",
            regionId: "east-asia",
            level,
            builtDay: 1,
            online: true,
          },
        ],
      },
      economy: { ...base.economy, credits },
    };
  };

  it("an installation pick opens the wheel at the model with the level, type and effect at the hub, and Upgrade, Decommission and Region on the ring", () => {
    const picks = new FakeInstallationPicks();
    const selection = newSelection();
    new OverworldScreen(
      depsFor(
        new FakeStore(withBattery(5000)),
        undefined,
        selection,
        undefined,
        picks,
      ),
    ).mount(root);
    expect(wheel()?.hidden).toBe(true);
    selection.selectRegion("east-asia");
    picks.pick("deployable-1");
    expect(wheel()?.hidden).toBe(false);
    expect(wheel()?.style.left).toBe("120px");
    expect(wheel()?.style.top).toBe("80px");
    expect(field("hub-value")?.textContent).toBe("L1");
    expect(
      root.querySelector("#radial-menu .tut-radial__caption")?.textContent,
    ).toBe("Defensive battery · online");
    expect(field("hub-note")?.textContent).toBe(
      "1 garrison turret on every mission map",
    );
    expect(wheelItems()).toEqual(["upgrade", "decommission", "region"]);
    expect(
      root.querySelector<HTMLButtonElement>(
        '#radial-menu [data-item="upgrade"]',
      )?.textContent,
    ).toContain("¢1,500");
  });

  it("Upgrade on the wheel dispatches the upgrade, closes the wheel, and the row reads L2", () => {
    const picks = new FakeInstallationPicks();
    const selection = newSelection();
    const store = new FakeStore(withBattery(5000));
    new OverworldScreen(
      depsFor(store, undefined, selection, undefined, picks),
    ).mount(root);
    selection.selectRegion("east-asia");
    picks.pick("deployable-1");
    root
      .querySelector<HTMLButtonElement>('#radial-menu [data-item="upgrade"]')
      ?.click();
    expect(wheel()?.hidden).toBe(true);
    expect(store.dispatched.at(-1)).toEqual(upgradeDeployable("deployable-1"));
    expect(
      root.querySelector(
        '#deployables [data-deployable-id="deployable-1"] [data-field="level"]',
      )?.textContent,
    ).toBe("L2");
    expect(store.getState().economy.credits).toBe(3500);
  });

  it("Decommission on the wheel dispatches the removal; Region lands on the region panel", () => {
    const picks = new FakeInstallationPicks();
    const selection = newSelection();
    const store = new FakeStore(withBattery(5000));
    new OverworldScreen(
      depsFor(store, undefined, selection, undefined, picks),
    ).mount(root);
    selection.selectRegion("east-asia");
    picks.pick("deployable-1");
    root
      .querySelector<HTMLButtonElement>('#radial-menu [data-item="region"]')
      ?.click();
    expect(wheel()?.hidden).toBe(true);
    expect(document.activeElement).toBe(root.querySelector("#region-panel"));
    picks.pick("deployable-1");
    root
      .querySelector<HTMLButtonElement>(
        '#radial-menu [data-item="decommission"]',
      )
      ?.click();
    expect(store.dispatched.at(-1)).toEqual(
      decommissionDeployable("deployable-1"),
    );
    expect(wheel()?.hidden).toBe(true);
    expect(
      root.querySelector('#deployables [data-deployable-id="deployable-1"]'),
    ).toBeNull();
  });

  it("a rejected upgrade shows the reason in the bar and keeps the level", () => {
    const picks = new FakeInstallationPicks();
    const selection = newSelection();
    const store = new FakeStore(withBattery(100));
    new OverworldScreen(
      depsFor(store, undefined, selection, undefined, picks),
    ).mount(root);
    selection.selectRegion("east-asia");
    picks.pick("deployable-1");
    const upgrade = root.querySelector<HTMLButtonElement>(
      '#radial-menu [data-item="upgrade"]',
    );
    expect(upgrade?.disabled).toBe(true);
    expect(upgrade?.title).toBe("Need ¢1,500, have ¢100");
    // The panel's button is disabled for the same reason; a forced
    // dispatch surfaces the store's refusal the way a build does.
    const rowUpgrade = root.querySelector<HTMLButtonElement>(
      '#deployables [data-action="upgrade-deployable"]',
    );
    expect(rowUpgrade?.disabled).toBe(true);
    rowUpgrade?.removeAttribute("disabled");
    rowUpgrade?.click();
    const status = root.querySelector<HTMLElement>('[data-role="status"]');
    expect(status?.hidden).toBe(false);
    expect(status?.textContent).toContain("credits");
    expect(field("hub-value")?.textContent).toBe("L1");
  });

  it("a city selection, a click at sea, Escape and unmount dismiss the installation wheel", () => {
    const picks = new FakeInstallationPicks();
    const selection = newSelection();
    const screen = new OverworldScreen(
      depsFor(
        new FakeStore(withBattery(5000)),
        undefined,
        selection,
        undefined,
        picks,
      ),
    );
    screen.mount(root);
    selection.selectRegion("east-asia");
    picks.pick("deployable-1");
    expect(wheel()?.hidden).toBe(false);
    // A city in the same region is another selection.
    selection.select("tokyo");
    expect(wheel()?.hidden).toBe(true);
    selection.selectRegion("east-asia");
    picks.pick("deployable-1");
    expect(wheel()?.hidden).toBe(false);
    // A click at sea clears the selection.
    selection.selectRegion(undefined);
    expect(wheel()?.hidden).toBe(true);
    selection.selectRegion("east-asia");
    picks.pick("deployable-1");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(wheel()?.hidden).toBe(true);
    picks.pick("deployable-1");
    expect(wheel()?.hidden).toBe(false);
    screen.unmount();
    expect(root.querySelector("#radial-menu")).toBeNull();
    expect(picks.listenerCount).toBe(0);
  });

  it("opens nothing for an installation the map is not drawing or that is not in the campaign", () => {
    const picks = new FakeInstallationPicks();
    picks.positions.set("deployable-1", undefined);
    const selection = newSelection();
    new OverworldScreen(
      depsFor(
        new FakeStore(withBattery(5000)),
        undefined,
        selection,
        undefined,
        picks,
      ),
    ).mount(root);
    picks.pick("deployable-1");
    expect(wheel()?.hidden).toBe(true);
    picks.pick("deployable-9");
    expect(wheel()?.hidden).toBe(true);
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
