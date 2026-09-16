import type { Unsubscribe } from "../../core/model/event-bus";
import type { CityId } from "../../overworld/model/city";
import type { MissionId } from "../../overworld/model/mission";
import type { RegionId } from "../../overworld/model/region";

// ===========================================
// Snapshot
// ===========================================

/** What the player currently has picked on the overworld. Plain data. */
export interface OverworldSelectionSnapshot {
  /** The region in focus: the selected city's, or one picked on its own (#1154). */
  readonly regionId: RegionId | undefined;
  /** The highlighted city, from the map or from a mission; always in `regionId` when set. */
  readonly cityId: CityId | undefined;
  /** The mission open in the side panel; always in `cityId` when set. */
  readonly missionId: MissionId | undefined;
}

/** Receives every selection change. */
export type SelectionListener = (selection: OverworldSelectionSnapshot) => void;

/** Answers which region a city belongs to; undefined for an id not on the map. */
export type RegionResolver = (cityId: CityId) => RegionId | undefined;

// ===========================================
// Selection
// ===========================================

/**
 * Presentation-only state shared by the overworld views and the map:
 * which region, city and mission are selected. Not part of the campaign,
 * never saved. The map picking wiring writes cities into it and reads it
 * back to highlight markers; the region panel, deployables and mission
 * views render from it; the mission list writes missions into it; the
 * deployment screen reads "the mission the player chose".
 *
 * Selection is region-first (#1154): picking a city also picks its
 * region, and a region can be picked with no city, but a city never sits
 * outside the selected region.
 *
 * ```
 *   picking ──select(cityId)──────────────┐
 *   mission row ──selectMission(id, city)─┼──► selection ──subscribe──► panels, map highlight
 *   region row ──selectRegion(regionId)───┤
 *   briefing ──clearMission()─────────────┘
 * ```
 *
 * `CitySelection` (#293) is the former name of this interface and is
 * re-exported from `ui/model/city-selection.ts` for one release.
 */
export interface OverworldSelection {
  /** The region in focus, or undefined when none is. */
  readonly regionId: RegionId | undefined;

  /** The selected city, or undefined when none is. */
  readonly cityId: CityId | undefined;

  /** The open mission, or undefined when none is. */
  readonly missionId: MissionId | undefined;

  /** All three values as one snapshot. */
  readonly selection: OverworldSelectionSnapshot;

  /**
   * Selects a city and its region, or clears everything with `undefined`.
   * A mission in another city is deselected; one in this city stays open.
   */
  select(cityId: CityId | undefined): void;

  /** Focuses a region on its own: the city and mission are cleared. `undefined` clears everything. */
  selectRegion(regionId: RegionId | undefined): void;

  /** Opens a mission and highlights its host city and that city's region. */
  selectMission(missionId: MissionId, cityId: CityId): void;

  /** Closes the mission without touching the city or region. */
  clearMission(): void;

  /** Subscribes to changes and returns the matching unsubscribe. Not invoked for the current value. */
  subscribe(listener: SelectionListener): Unsubscribe;
}
