import type { Unsubscribe } from "../../core/model/event-bus";
import { advanceDay } from "../../overworld/model/advance-day-command";
import { buildDeployable } from "../../overworld/model/build-deployable-command";
import { decommissionDeployable } from "../../overworld/model/decommission-deployable-command";
import type { DeployableTypeCatalogue } from "../../overworld/model/deployable-type-catalogue";
import type { CityId } from "../../overworld/model/city";
import type { EventTypeCatalogue } from "../../overworld/model/event-type-catalogue";
import type { MissionId } from "../../overworld/model/mission";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import { resolveEvent } from "../../overworld/model/resolve-event-command";
import type { MissionTypeCatalogue } from "../../overworld/service/mission-generation-service";
import type { GameState } from "../../save/model/game-state";
import type { CityPickSource } from "../model/city-pick-source";
import type { CampaignStore, GameSession } from "../model/game-session";
import type { MapViewportHost } from "../model/map-viewport-host";
import type { OverworldSelection } from "../model/overworld-selection";
import type { Screen, ScreenId } from "../model/screen";
import type { ScreenRouter } from "../model/screen-router";
import { buildCityWheel, cityWheelChoice } from "../service/city-wheel";
import { DeployablesView } from "../view/deployables-view";
import { EventDialogView } from "../view/event-dialog-view";
import { MissionDetailsView } from "../view/mission-details-view";
import { MissionListView } from "../view/mission-list-view";
import { RadialMenuView } from "../view/radial-menu-view";
import { RegionPanelView } from "../view/region-panel-view";
import { SidePanelView } from "../view/side-panel-view";
import { TopBarView } from "../view/top-bar-view";

// ===========================================
// Types
// ===========================================

/** What the overworld screen needs from the app. */
export interface OverworldScreenDeps {
  readonly router: ScreenRouter;
  readonly session: GameSession;
  /** Shared city + mission selection; the map wiring writes into it too. */
  readonly selection: OverworldSelection;
  /** Names, costs and caps for the deployables section. */
  readonly deployableTypes: DeployableTypeCatalogue;
  /** Names and describes mission types for the list and briefing. */
  readonly missionTypes: MissionTypeCatalogue;
  /** Copy and choices for the pending event dialog. */
  readonly eventTypes: EventTypeCatalogue;
  /** Lends the map canvas to the layout's map cell while mounted; absent in unit tests. */
  readonly mapViewport?: MapViewportHost;
  /** Pointer picks on the map and where a city's marker is, for the city wheel (#1154); absent in unit tests. */
  readonly cityPicks?: CityPickSource;
}

// ===========================================
// OverworldScreen
// ===========================================

/**
 * The overworld (GDD §5): the Earth map laid out beside its panels. On
 * mount the screen borrows the app's map viewport into `#map-area`, so
 * the scene resizes to the cell and no marker sits under a panel; on
 * unmount it hands the viewport back. The top bar reads day, credits and
 * threat; the side panel shows the selected region with its cities, the
 * missions on offer there, the open briefing and the region's
 * deployables; every store or selection change re-renders the views
 * incrementally.
 *
 * Selection is region-first (#1154). A city picked on the map opens the
 * city wheel — the tactical ring (ADR 0007) at the marker, infestation
 * and population at the hub, the missions offered there as entries —
 * and the Situation panel shows that city's region.
 *
 * ```
 *   ┌ #top-bar ──────────────────────────────────────────────────────┐
 *   ├──────────────────────────────────────────────┬─────────────────┤
 *   │  #map-area ▸ #map-viewport ▸ canvas          │  #side-panel    │
 *   │  (wheel, keys and city picking)              │  situation      │
 *   │     #radial-menu — the city wheel, on the    │  #region-panel  │
 *   │     picked marker, following the camera      │  missions       │
 *   │                                              │  briefing       │
 *   │                                              │  #deployables   │
 *   │  [event dialog over everything while an event waits]           │
 *   └──────────────────────────────────────────────┴─────────────────┘
 *
 *   store.subscribe / selection.subscribe ──► render(state): every view
 *   [Advance day]        ──► store.dispatch(advanceDay())
 *   [Build …]            ──► store.dispatch(buildDeployable(type, region))
 *   [Decommission]       ──► store.dispatch(decommissionDeployable(id))
 *   event choice         ──► store.dispatch(resolveEvent(eventId, choiceId))
 *                            any rejection ──► topBar.showStatus
 *   [Roster] / [Main menu] ──► router.navigate
 *   [Resume mission]     ──► router.navigate("tactical")   while one is live
 *   mission row          ──► selection.selectMission(id, cityId)
 *   [Show all]           ──► selection.selectRegion(undefined)
 *   city row             ──► selection.select(cityId)
 *   map pick             ──► cityPicks.onCityPicked ──► wheel.open at the marker
 *   wheel mission entry  ──► selection.selectMission(id, cityId)
 *   wheel Region entry   ──► regionPanel.focus()
 *   [Plan deployment]    ──► selection.selectMission + router.navigate("deployment")
 *   state.overworld.outcome set ──► router.navigate("game-over")  (next microtask)
 * ```
 *
 * The game-over hand-off is deferred one microtask because `render` can
 * run inside `mount`, and a router does not expect a screen to navigate
 * away while it is still being mounted.
 */
export class OverworldScreen implements Screen {
  // ===========================================
  // Fields
  // ===========================================

  readonly id: ScreenId = "overworld";
  private readonly deps: OverworldScreenDeps;
  private readonly topBar: TopBarView;
  private readonly sidePanel = new SidePanelView();
  private readonly regionPanel: RegionPanelView;
  private readonly missionList: MissionListView;
  private readonly missionDetails: MissionDetailsView;
  private readonly deployables: DeployablesView;
  private readonly eventDialog: EventDialogView;
  private readonly wheel: RadialMenuView;
  /** The city the wheel is open at, or undefined while it is closed. */
  private wheelCityId: CityId | undefined;
  private stopFollowing: (() => void) | undefined;
  private root: HTMLElement | undefined;
  private unsubscribe: Unsubscribe | undefined;
  private unsubscribeSelection: Unsubscribe | undefined;
  private unsubscribePicks: Unsubscribe | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param deps - Router, session, selection state and content. */
  constructor(deps: OverworldScreenDeps) {
    this.deps = deps;
    this.topBar = new TopBarView({
      onAdvanceDay: () => {
        this.advanceDay();
      },
      onMainMenu: () => {
        this.deps.router.navigate("main-menu");
      },
      onRoster: () => {
        this.deps.router.navigate("roster");
      },
      // A mission left through the HUD's Overworld button is still in
      // progress; without this the campaign is stuck, because the only
      // ways into the tactical screen are Launch and Continue (#468).
      onResumeMission: () => {
        this.deps.router.navigate("tactical");
      },
    });
    this.regionPanel = new RegionPanelView({
      onSelectCity: (cityId) => {
        this.deps.selection.select(cityId);
      },
    });
    this.wheel = new RadialMenuView({
      onSelect: (id) => {
        this.chooseFromWheel(id);
      },
      onDismiss: () => {
        this.closeWheel();
      },
    });
    this.missionList = new MissionListView(
      { missionTypes: deps.missionTypes },
      {
        onSelectMission: (missionId, cityId) => {
          this.deps.selection.selectMission(missionId, cityId);
        },
        onShowAll: () => {
          this.deps.selection.selectRegion(undefined);
        },
      },
    );
    this.missionDetails = new MissionDetailsView(
      { missionTypes: deps.missionTypes },
      {
        onPlanDeployment: (missionId) => {
          this.planDeployment(missionId);
        },
      },
    );
    this.deployables = new DeployablesView(
      {
        onBuild: (typeId, regionId) => {
          this.dispatch(buildDeployable(typeId, regionId));
        },
        onDecommission: (deployableId) => {
          this.dispatch(decommissionDeployable(deployableId));
        },
      },
      deps.deployableTypes,
    );
    this.eventDialog = new EventDialogView(
      { eventTypes: deps.eventTypes },
      {
        onChoose: (eventId, choiceId) => {
          this.dispatch(resolveEvent(eventId, choiceId));
        },
      },
    );
  }

  // ===========================================
  // Screen
  // ===========================================

  /** Builds the layout, mounts the views and subscribes to the store and the selection. */
  mount(root: HTMLElement): void {
    const doc = root.ownerDocument;
    const layout = doc.createElement("section");
    layout.className = "tut-overworld";
    layout.dataset.screen = this.id;

    this.topBar.mount(layout);

    const mapArea = doc.createElement("div");
    mapArea.id = "map-area";
    mapArea.className = "tut-overworld__map";
    layout.appendChild(mapArea);

    this.sidePanel.mount(layout);
    const sections = this.sidePanel.container ?? layout;
    this.regionPanel.mount(sections);
    this.missionList.mount(sections);
    this.missionDetails.mount(sections);
    this.deployables.mount(sections);
    // The wheel is positioned in client pixels, so it lives on the
    // layout, which fills the window, rather than in the map cell.
    this.wheel.mount(layout);
    this.eventDialog.mount(layout);
    root.appendChild(layout);
    this.root = layout;
    this.deps.mapViewport?.attach(mapArea);
    this.unsubscribePicks = this.deps.cityPicks?.onCityPicked((cityId) => {
      this.openWheel(cityId);
    });

    const store = this.deps.session.store;
    // Subscribe to the selection before the first render: rendering with
    // a selected mission that is no longer on offer (just launched, or
    // expired) clears the selection and relies on this subscription to
    // render again with it cleared (#83).
    this.unsubscribeSelection = this.deps.selection.subscribe((selection) => {
      // Another selection dismisses the wheel (ADR 0007 §2.2): the ring
      // belongs to the city it opened on, not to whatever is picked next.
      if (
        this.wheelCityId !== undefined &&
        selection.cityId !== this.wheelCityId
      ) {
        this.closeWheel();
      }
      this.render(this.deps.session.store?.getState());
    });
    this.render(store?.getState());
    this.unsubscribe = store?.subscribe((change) => {
      this.render(change.state);
    });
  }

  /** Returns the viewport, unsubscribes, unmounts the views and removes the layout. */
  unmount(): void {
    this.deps.mapViewport?.release();
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.unsubscribeSelection?.();
    this.unsubscribeSelection = undefined;
    this.unsubscribePicks?.();
    this.unsubscribePicks = undefined;
    this.closeWheel();
    this.wheel.unmount();
    this.eventDialog.unmount();
    this.topBar.unmount();
    this.deployables.unmount();
    this.missionDetails.unmount();
    this.missionList.unmount();
    this.regionPanel.unmount();
    this.sidePanel.unmount();
    this.root?.remove();
    this.root = undefined;
  }

  // ===========================================
  // Actions
  // ===========================================

  /** Dispatches `AdvanceDay`; a rejection is shown in the bar, never thrown. */
  private advanceDay(): void {
    this.dispatch(advanceDay());
  }

  /** Runs a command through the campaign store; a rejection is shown in the bar, never thrown. */
  private dispatch(command: OverworldCommand): void {
    const store: CampaignStore | undefined = this.deps.session.store;
    if (!store) {
      this.topBar.showStatus("No active campaign.");
      return;
    }
    const result = store.dispatch(command);
    if (!result.ok) {
      this.topBar.showStatus(result.error.message);
    }
  }

  /**
   * Opens the deployment screen for a mission: the mission (and its city)
   * is put into the shared selection, which the deployment screen reads
   * on mount. A mission that is no longer on offer is reported instead.
   */
  private planDeployment(missionId: MissionId): void {
    const mission = this.deps.session.state?.overworld.missions.find(
      (m) => m.id === missionId,
    );
    if (!mission) {
      this.topBar.showStatus("That mission is no longer on offer.");
      return;
    }
    this.deps.selection.selectMission(mission.id, mission.cityId);
    this.deps.router.navigate("deployment");
  }

  // ===========================================
  // City wheel (#1154)
  // ===========================================

  /**
   * Opens (or reopens) the city wheel at `cityId`'s marker and starts
   * following it. Nothing opens for a city that is not on the map, has
   * no campaign behind it, or is not currently drawn.
   */
  private openWheel(cityId: CityId): void {
    const state = this.deps.session.state;
    const anchor = this.deps.cityPicks?.cityScreenPosition(cityId);
    const wheel = state
      ? buildCityWheel(state, cityId, this.deps.missionTypes)
      : undefined;
    if (!wheel || !anchor) {
      this.closeWheel();
      return;
    }
    this.wheel.open(wheel.items, wheel.hub, anchor);
    if (this.wheelCityId !== cityId) {
      this.wheelCityId = cityId;
      this.stopFollowing?.();
      this.stopFollowing = undefined;
      this.follow(cityId);
    }
  }

  /** Hides the wheel and stops following its city. No-op while closed. */
  private closeWheel(): void {
    this.stopFollowing?.();
    this.stopFollowing = undefined;
    this.wheelCityId = undefined;
    if (this.wheel.isOpen) {
      this.wheel.close();
    }
  }

  /** Redraws an open wheel from the latest state: a tick can add or expire the missions on it. */
  private refreshWheel(): void {
    if (this.wheelCityId !== undefined) {
      this.openWheel(this.wheelCityId);
    }
  }

  /**
   * Keeps the open wheel on its marker between frames (ADR 0007 §2.1):
   * once a frame, while it is open, the city is projected again and the
   * ring moved to it, so a pan or zoom carries the ring with the city.
   * A city that stops being drawn dismisses it (§2.2).
   */
  private follow(cityId: CityId): void {
    const schedule =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : undefined;
    if (schedule === undefined) {
      return;
    }
    let handle = 0;
    const tick = (): void => {
      if (this.wheelCityId !== cityId) {
        return;
      }
      const anchor = this.deps.cityPicks?.cityScreenPosition(cityId);
      if (anchor === undefined) {
        this.closeWheel();
        return;
      }
      this.wheel.moveTo(anchor);
      handle = schedule(tick);
    };
    handle = schedule(tick);
    this.stopFollowing = () => {
      cancelAnimationFrame(handle);
    };
  }

  /** Acts on a wheel entry: a mission opens its briefing; Region lands on the region panel. */
  private chooseFromWheel(itemId: string): void {
    const cityId = this.wheelCityId;
    const choice = cityWheelChoice(itemId);
    this.closeWheel();
    if (choice === undefined || cityId === undefined) {
      return;
    }
    if (choice.kind === "mission") {
      this.deps.selection.selectMission(choice.missionId, cityId);
      return;
    }
    this.regionPanel.focus();
  }

  // ===========================================
  // Helpers
  // ===========================================

  /** Routes to the game-over screen on the next microtask if this screen is still up and the campaign is still over. */
  private scheduleGameOver(): void {
    queueMicrotask(() => {
      if (
        this.root === undefined ||
        this.deps.router.current !== this.id ||
        this.deps.session.state?.overworld.outcome === undefined
      ) {
        return;
      }
      this.deps.router.navigate("game-over");
    });
  }

  /**
   * Pushes the state and the current selection into every view, or hands
   * over once the campaign has ended. A selected mission that is no
   * longer on offer (expired or launched) is deselected first, which
   * re-enters here through the selection subscription.
   */
  private render(state: GameState | undefined): void {
    if (state?.overworld.outcome !== undefined) {
      this.scheduleGameOver();
    }
    const selection = this.deps.selection.selection;
    const mission =
      state && selection.missionId !== undefined
        ? state.overworld.missions.find((m) => m.id === selection.missionId)
        : undefined;
    if (selection.missionId !== undefined && mission === undefined) {
      this.deps.selection.clearMission();
      return;
    }
    this.topBar.update(state);
    this.sidePanel.update(state);
    this.regionPanel.update(state, selection);
    this.deployables.update(state, selection.regionId);
    this.missionList.update(state, selection);
    this.missionDetails.update(state, mission);
    this.eventDialog.update(state);
    this.refreshWheel();
  }
}
