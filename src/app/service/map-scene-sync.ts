import type { Unsubscribe } from "../../core/model/event-bus";
import type { MapStateView } from "../../graphics/model/map-state-view";
import type { CityId } from "../../overworld/model/city";
import type { OverworldState } from "../../overworld/model/overworld-state";
import type { GameState } from "../../save/model/game-state";
import type { CampaignGameStore, StoreObserver } from "./game-session";

// ===========================================
// MapSceneSync
// ===========================================

/**
 * Keeps the strategic map scene in step with whichever campaign store is
 * running: attached to every store the session creates, it pushes the
 * initial state and every change into the scene's `update`. The scene
 * loads its art after the first store may exist, so the sync remembers
 * the latest state and replays it when the scene attaches.
 *
 * ```
 *   session.start(state) ──► observe(store) ──► apply(store.getState())
 *                                            └─► store.subscribe ──► apply(change.state)
 *   scene ready          ──► attach(view)    ──► apply(latest)
 * ```
 */
export class MapSceneSync {
  // ===========================================
  // Fields
  // ===========================================

  private view: MapStateView | undefined;
  private latest: GameState | undefined;

  // ===========================================
  // Public Methods
  // ===========================================

  /** Attaches the scene; the latest known state is applied at once. */
  attach(view: MapStateView): void {
    this.view = view;
    if (this.latest) {
      this.apply(this.latest);
    }
  }

  /** A `StoreObserver` for the session: applies the store's state now and on every change. */
  readonly observe: StoreObserver = (store: CampaignGameStore): Unsubscribe => {
    this.apply(store.getState());
    return store.subscribe((change) => {
      this.apply(change.state);
    });
  };

  // ===========================================
  // Private Methods
  // ===========================================

  /** Remembers `state` and, when a scene is attached, pushes it there. */
  private apply(state: GameState): void {
    this.latest = state;
    this.view?.update(state.overworld.map, missionCityIds(state.overworld));
  }
}

// ===========================================
// Helpers
// ===========================================

/** Every city that currently hosts a mission. */
export function missionCityIds(overworld: OverworldState): ReadonlySet<CityId> {
  return new Set(overworld.missions.map((mission) => mission.cityId));
}
