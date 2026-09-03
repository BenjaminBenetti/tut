import type { Unsubscribe } from "../../core/model/event-bus";
import { advanceDay } from "../../overworld/model/advance-day-command";
import { buildDeployable } from "../../overworld/model/build-deployable-command";
import { decommissionDeployable } from "../../overworld/model/decommission-deployable-command";
import type { DeployableTypeCatalogue } from "../../overworld/model/deployable-type-catalogue";
import type { MissionId } from "../../overworld/model/mission";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import { findCity } from "../../overworld/service/earth-map-query-service";
import type { MissionTypeCatalogue } from "../../overworld/service/mission-generation-service";
import type { GameState } from "../../save/model/game-state";
import type { CampaignStore, GameSession } from "../model/game-session";
import type { MapViewportHost } from "../model/map-viewport-host";
import type { OverworldSelection } from "../model/overworld-selection";
import type { Screen, ScreenId } from "../model/screen";
import type { ScreenRouter } from "../model/screen-router";
import { CityPanelView } from "../view/city-panel-view";
import { DeployablesView } from "../view/deployables-view";
import { MissionDetailsView } from "../view/mission-details-view";
import { MissionListView } from "../view/mission-list-view";
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
  /** Lends the map canvas to the layout's map cell while mounted; absent in unit tests. */
  readonly mapViewport?: MapViewportHost;
}

// ===========================================
// OverworldScreen
// ===========================================

/**
 * The overworld (GDD §5): the Earth map laid out beside its panels. On
 * mount the screen borrows the app's map viewport into `#map-area`, so
 * the scene resizes to the cell and no marker sits under a panel; on
 * unmount it hands the viewport back. The top bar reads day, credits and
 * threat; the side panel shows the selected city, the missions on offer,
 * the open briefing and the region's deployables; every store or
 * selection change re-renders the views incrementally.
 *
 * ```
 *   ┌ #top-bar ──────────────────────────────────────────────────────┐
 *   ├──────────────────────────────────────────────┬─────────────────┤
 *   │  #map-area ▸ #map-viewport ▸ canvas          │  #side-panel    │
 *   │  (wheel, keys and city picking)              │  situation      │
 *   │                                              │  #city-panel    │
 *   │                                              │  missions       │
 *   │                                              │  briefing       │
 *   │                                              │  #deployables   │
 *   └──────────────────────────────────────────────┴─────────────────┘
 *
 *   store.subscribe / selection.subscribe ──► render(state): every view
 *   [Advance day]        ──► store.dispatch(advanceDay())
 *   [Build …]            ──► store.dispatch(buildDeployable(type, region))
 *   [Decommission]       ──► store.dispatch(decommissionDeployable(id))
 *                            any rejection ──► topBar.showStatus
 *   [Roster] / [Main menu] ──► router.navigate
 *   mission row          ──► selection.selectMission(id, cityId)
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
  private readonly cityPanel: CityPanelView;
  private readonly missionList: MissionListView;
  private readonly missionDetails: MissionDetailsView;
  private readonly deployables: DeployablesView;
  private root: HTMLElement | undefined;
  private unsubscribe: Unsubscribe | undefined;
  private unsubscribeSelection: Unsubscribe | undefined;

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
    });
    this.cityPanel = new CityPanelView({
      onPlanDeployment: (missionId) => {
        this.planDeployment(missionId);
      },
    });
    this.missionList = new MissionListView(
      { missionTypes: deps.missionTypes },
      {
        onSelectMission: (missionId, cityId) => {
          this.deps.selection.selectMission(missionId, cityId);
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
    this.cityPanel.mount(sections);
    this.missionList.mount(sections);
    this.missionDetails.mount(sections);
    this.deployables.mount(sections);
    root.appendChild(layout);
    this.root = layout;
    this.deps.mapViewport?.attach(mapArea);

    const store = this.deps.session.store;
    this.render(store?.getState());
    this.unsubscribe = store?.subscribe((change) => {
      this.render(change.state);
    });
    this.unsubscribeSelection = this.deps.selection.subscribe(() => {
      this.render(this.deps.session.store?.getState());
    });
  }

  /** Returns the viewport, unsubscribes, unmounts the views and removes the layout. */
  unmount(): void {
    this.deps.mapViewport?.release();
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.unsubscribeSelection?.();
    this.unsubscribeSelection = undefined;
    this.topBar.unmount();
    this.deployables.unmount();
    this.missionDetails.unmount();
    this.missionList.unmount();
    this.cityPanel.unmount();
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
    this.cityPanel.update(state, selection.cityId);
    const city =
      state && selection.cityId !== undefined
        ? findCity(state.overworld.map, selection.cityId)
        : undefined;
    this.deployables.update(state, city?.regionId);
    this.missionList.update(state, selection);
    this.missionDetails.update(state, mission);
  }
}
