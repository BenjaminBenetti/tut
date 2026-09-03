import type { Unsubscribe } from "../../core/model/event-bus";
import { advanceDay } from "../../overworld/model/advance-day-command";
import { buildDeployable } from "../../overworld/model/build-deployable-command";
import { decommissionDeployable } from "../../overworld/model/decommission-deployable-command";
import type { DeployableTypeCatalogue } from "../../overworld/model/deployable-type-catalogue";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import { findCity } from "../../overworld/service/earth-map-query-service";
import type { GameState } from "../../save/model/game-state";
import type { CitySelection } from "../model/city-selection";
import type { CampaignStore, GameSession } from "../model/game-session";
import type { MapViewportHost } from "../model/map-viewport-host";
import type { Screen, ScreenId } from "../model/screen";
import type { ScreenRouter } from "../model/screen-router";
import { CityPanelView } from "../view/city-panel-view";
import { DeployablesView } from "../view/deployables-view";
import { SidePanelView } from "../view/side-panel-view";
import { TopBarView } from "../view/top-bar-view";

// ===========================================
// Types
// ===========================================

/** What the overworld screen needs from the app. */
export interface OverworldScreenDeps {
  readonly router: ScreenRouter;
  readonly session: GameSession;
  /** Which city the map picking selected; the panels render it. */
  readonly selection: CitySelection;
  /** Names, costs and caps for the deployables section. */
  readonly deployableTypes: DeployableTypeCatalogue;
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
 * threat; Advance Day dispatches through the campaign store and every
 * store change re-renders the views incrementally.
 *
 * ```
 *   ┌ #top-bar ──────────────────────────────────────────────────────┐
 *   ├──────────────────────────────────────────────┬─────────────────┤
 *   │  #map-area ▸ #map-viewport ▸ canvas          │  #side-panel    │
 *   │  (wheel, keys and city picking)              │  situation      │
 *   │                                              │  #city-panel    │
 *   │                                              │  #deployables   │
 *   └──────────────────────────────────────────────┴─────────────────┘
 *
 *   store.subscribe / selection.subscribe ──► render(state): every view
 *   [Advance day]   ──► store.dispatch(advanceDay())
 *   [Build …]       ──► store.dispatch(buildDeployable(type, region))
 *   [Decommission]  ──► store.dispatch(decommissionDeployable(id))
 *                       any rejection ──► topBar.showStatus
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
  private readonly cityPanel: CityPanelView;
  private readonly deployables: DeployablesView;
  private root: HTMLElement | undefined;
  private unsubscribe: Unsubscribe | undefined;
  private unsubscribeSelection: Unsubscribe | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param deps - Router and the session whose store is rendered. */
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
      onPlanDeployment: () => {
        this.topBar.showStatus("Deployment planning arrives with #77.");
      },
    });
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

  /** Builds the layout, mounts the views and subscribes to the campaign store. */
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

  // ===========================================
  // Helpers
  // ===========================================

  /** Pushes the state and the current selection into every view. */
  private render(state: GameState | undefined): void {
    this.topBar.update(state);
    this.sidePanel.update(state);
    const cityId = this.deps.selection.cityId;
    this.cityPanel.update(state, cityId);
    const city =
      state && cityId !== undefined
        ? findCity(state.overworld.map, cityId)
        : undefined;
    this.deployables.update(state, city?.regionId);
  }
}
