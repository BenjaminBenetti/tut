import type { Unsubscribe } from "../../core/model/event-bus";
import type { CityId } from "../../overworld/model/city";
import type { MissionId } from "../../overworld/model/mission";

// ===========================================
// Snapshot
// ===========================================

/** What the player currently has picked on the overworld. Plain data. */
export interface OverworldSelectionSnapshot {
  /** The highlighted city, from the map or from a mission. */
  readonly cityId: CityId | undefined;
  /** The mission open in the side panel; always in `cityId` when set. */
  readonly missionId: MissionId | undefined;
}

/** Receives every selection change. */
export type SelectionListener = (selection: OverworldSelectionSnapshot) => void;

// ===========================================
// Selection
// ===========================================

/**
 * Presentation-only state shared by the overworld views and the map:
 * which city and which mission are selected. Not part of the campaign,
 * never saved. The map picking wiring writes cities into it and reads it
 * back to highlight markers; the city panel, deployables and mission
 * views render from it; the mission list writes missions into it; the
 * deployment screen reads "the mission the player chose".
 *
 * ```
 *   picking ──select(cityId)──────────────┐
 *   mission row ──selectMission(id, city)─┼──► selection ──subscribe──► panels, map highlight
 *   briefing ──clearMission()─────────────┘
 * ```
 *
 * `CitySelection` (#293) is the former name of this interface and is
 * re-exported from `ui/model/city-selection.ts` for one release.
 */
export interface OverworldSelection {
  /** The selected city, or undefined when none is. */
  readonly cityId: CityId | undefined;

  /** The open mission, or undefined when none is. */
  readonly missionId: MissionId | undefined;

  /** Both values as one snapshot. */
  readonly selection: OverworldSelectionSnapshot;

  /**
   * Selects a city, or clears everything with `undefined`. A mission in
   * another city is deselected; one in this city stays open.
   */
  select(cityId: CityId | undefined): void;

  /** Opens a mission and highlights its host city. */
  selectMission(missionId: MissionId, cityId: CityId): void;

  /** Closes the mission without touching the city. */
  clearMission(): void;

  /** Subscribes to changes and returns the matching unsubscribe. Not invoked for the current value. */
  subscribe(listener: SelectionListener): Unsubscribe;
}
