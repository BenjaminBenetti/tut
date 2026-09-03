import type { Unsubscribe } from "../../core/model/event-bus";
import { advanceDay } from "../../overworld/model/overworld-command";
import type { MissionTypeCatalogue } from "../../overworld/service/mission-generation-service";
import type { GameState } from "../../save/model/game-state";
import type { CampaignStore, GameSession } from "../model/game-session";
import type { MapViewportHost } from "../model/map-viewport-host";
import type { OverworldSelection } from "../model/overworld-selection";
import type { Screen, ScreenId } from "../model/screen";
import type { ScreenRouter } from "../model/screen-router";
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
  /** Shared selection of city and mission; the map wiring writes into it too. */
  readonly selection: OverworldSelection;
  /** Names and describes mission types. */
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
 * threat; the side panel lists missions and the selected briefing; every
 * store or selection change re-renders the views incrementally.
 *
 * ```
 *   ┌ #top-bar ──────────────────────────────────────────────────────┐
 *   ├──────────────────────────────────────────────┬─────────────────┤
 *   │  #map-area ▸ #map-viewport ▸ canvas          │  #side-panel    │
 *   │  (wheel, keys and city picking)              │  situation      │
 *   │                                              │  missions       │
 *   │                                              │  briefing       │
 *   └──────────────────────────────────────────────┴─────────────────┘
 *
 *   store.subscribe / selection.subscribe ──► render(state, selection)
 *   [Advance day]     ──► store.dispatch(advanceDay()) ──err──► topBar.showStatus
 *   [Roster] / [Main menu] ──► router.navigate
 *   mission row       ──► selection.selectMission(id, cityId)
 *   [Plan deployment] ──► router.navigate("deployment")   (mission id stays in selection)
 * ```
 */
export class OverworldScreen implements Screen {
  // ===========================================
  // Fields
  // ===========================================

  readonly id: ScreenId = "overworld";
  private readonly deps: OverworldScreenDeps;
  private readonly topBar: TopBarView;
  private readonly sidePanel = new SidePanelView();
  private readonly missionList: MissionListView;
  private readonly missionDetails: MissionDetailsView;
  private root: HTMLElement | undefined;
  private unsubscribeStore: Unsubscribe | undefined;
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
        onPlanDeployment: () => {
          this.deps.router.navigate("deployment");
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
    this.missionList.mount(this.sidePanel.sections);
    this.missionDetails.mount(this.sidePanel.sections);
    root.appendChild(layout);
    this.root = layout;
    this.deps.mapViewport?.attach(mapArea);

    const store = this.deps.session.store;
    this.render(store?.getState());
    this.unsubscribeStore = store?.subscribe((change) => {
      this.render(change.state);
    });
    this.unsubscribeSelection = this.deps.selection.subscribe(() => {
      this.render(this.deps.session.store?.getState());
    });
  }

  /** Returns the viewport, unsubscribes, unmounts the views and removes the layout. */
  unmount(): void {
    this.deps.mapViewport?.release();
    this.unsubscribeStore?.();
    this.unsubscribeStore = undefined;
    this.unsubscribeSelection?.();
    this.unsubscribeSelection = undefined;
    this.missionDetails.unmount();
    this.missionList.unmount();
    this.topBar.unmount();
    this.sidePanel.unmount();
    this.root?.remove();
    this.root = undefined;
  }

  // ===========================================
  // Actions
  // ===========================================

  /** Dispatches `AdvanceDay`; a rejection is shown in the bar, never thrown. */
  private advanceDay(): void {
    const store: CampaignStore | undefined = this.deps.session.store;
    if (!store) {
      this.topBar.showStatus("No active campaign.");
      return;
    }
    const result = store.dispatch(advanceDay());
    if (!result.ok) {
      this.topBar.showStatus(result.error.message);
    }
  }

  // ===========================================
  // Helpers
  // ===========================================

  /**
   * Pushes the state and selection into every view. A selected mission
   * that is no longer on offer (expired or launched) is deselected first,
   * which re-enters here through the selection subscription.
   */
  private render(state: GameState | undefined): void {
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
    this.sidePanel.update(state, selection);
    this.missionList.update(state, selection);
    this.missionDetails.update(state, mission);
  }
}
