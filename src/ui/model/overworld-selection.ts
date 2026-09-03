import type { Unsubscribe } from "../../core/model/event-bus";
import type { CityId } from "../../overworld/model/city";
import type { MissionId } from "../../overworld/model/mission";

// ===========================================
// Selection
// ===========================================

/** What the player currently has picked on the overworld. Plain data. */
export interface OverworldSelection {
  /** The highlighted city, from the map or from a mission. */
  readonly cityId: CityId | undefined;
  /** The mission open in the side panel; always in `cityId` when set. */
  readonly missionId: MissionId | undefined;
}

/** Receives every selection change. */
export type SelectionListener = (selection: OverworldSelection) => void;

// ===========================================
// UI state
// ===========================================

/**
 * Presentation-only state shared by the overworld views and the map:
 * which city and which mission are selected. Simulation never sees it.
 * The map picking wiring writes cities into it and reads it back to
 * highlight markers; the mission list writes missions into it; screens
 * that need "the mission the player chose" (deployment) read it.
 *
 * ```
 *   map click ──► selectCity(id) ──┐
 *                                  ├──► selection ──► subscribers (views, map highlight)
 *   mission row ──► selectMission(id, cityId) ──┘
 * ```
 */
export interface OverworldUiState {
  /** The current selection. */
  readonly selection: OverworldSelection;

  /** Highlights a city. A mission in another city is deselected; one in this city stays. */
  selectCity(cityId: CityId): void;

  /** Opens a mission and highlights its host city. */
  selectMission(missionId: MissionId, cityId: CityId): void;

  /** Closes the mission without touching the city. */
  clearMission(): void;

  /** Subscribes to changes and returns the matching unsubscribe. Not invoked for the current value. */
  subscribe(listener: SelectionListener): Unsubscribe;
}
