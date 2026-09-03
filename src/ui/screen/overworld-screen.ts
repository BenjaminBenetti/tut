import type { Unsubscribe } from "../../core/model/event-bus";
import { advanceDay } from "../../overworld/model/overworld-command";
import type { CampaignStore, GameSession } from "../model/game-session";
import type { MapViewportHost } from "../model/map-viewport-host";
import type { Screen, ScreenId } from "../model/screen";
import type { ScreenRouter } from "../model/screen-router";
import { SidePanelView } from "../view/side-panel-view";
import { TopBarView } from "../view/top-bar-view";

// ===========================================
// Types
// ===========================================

/** What the overworld screen needs from the app. */
export interface OverworldScreenDeps {
  readonly router: ScreenRouter;
  readonly session: GameSession;
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
 *   └──────────────────────────────────────────────┴─────────────────┘
 *
 *   store.subscribe ──► topBar.update(state), sidePanel.update(state)
 *   [Advance day]  ──► store.dispatch(advanceDay()) ──err──► topBar.showStatus
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
  private root: HTMLElement | undefined;
  private unsubscribe: Unsubscribe | undefined;

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
    root.appendChild(layout);
    this.root = layout;
    this.deps.mapViewport?.attach(mapArea);

    const store = this.deps.session.store;
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

  /** Pushes the state into both views. */
  private render(state: Parameters<TopBarView["update"]>[0]): void {
    this.topBar.update(state);
    this.sidePanel.update(state);
  }
}
