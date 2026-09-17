import type { Unsubscribe } from "../../core/model/event-bus";
import type { CityId } from "../../overworld/model/city";
import type { MissionId } from "../../overworld/model/mission";
import type { RegionId } from "../../overworld/model/region";
import type {
  OverworldSelection,
  OverworldSelectionSnapshot,
  RegionResolver,
  SelectionListener,
} from "../model/overworld-selection";

// ===========================================
// Constants
// ===========================================

/** Nothing picked. */
const EMPTY_SELECTION: OverworldSelectionSnapshot = {
  regionId: undefined,
  cityId: undefined,
  missionId: undefined,
};

// ===========================================
// OverworldSelectionState
// ===========================================

/**
 * In-memory `OverworldSelection`. Notifies subscribers only when the
 * selection actually changes, so the map highlight and the views can
 * write back into it without echoing forever; views render from state,
 * so a repeated click on the same city has nothing new to show.
 *
 * The region of a city comes from the injected resolver (#1154): the
 * state knows no map data itself, so the app hands it a lookup over
 * whichever campaign is running.
 *
 * `CitySelectionStore` (#293) is the former name of this class and is
 * re-exported from `ui/service/city-selection-store.ts` for one release.
 */
export class OverworldSelectionState implements OverworldSelection {
  // ===========================================
  // Fields
  // ===========================================

  private readonly regionOf: RegionResolver;
  private current: OverworldSelectionSnapshot = EMPTY_SELECTION;
  private readonly listeners = new Set<SelectionListener>();

  // ===========================================
  // Constructor
  // ===========================================

  /** @param regionOf - Which region a city belongs to; undefined for an unknown city. */
  constructor(regionOf: RegionResolver) {
    this.regionOf = regionOf;
  }

  // ===========================================
  // OverworldSelection
  // ===========================================

  /** The region in focus, or undefined when none is. */
  get regionId(): RegionId | undefined {
    return this.current.regionId;
  }

  /** The selected city, or undefined when none is. */
  get cityId(): CityId | undefined {
    return this.current.cityId;
  }

  /** The open mission, or undefined when none is. */
  get missionId(): MissionId | undefined {
    return this.current.missionId;
  }

  /** All three values as one snapshot. */
  get selection(): OverworldSelectionSnapshot {
    return this.current;
  }

  /** Highlights a city and its region (or clears with undefined), keeping the mission only if it lives there. */
  select(cityId: CityId | undefined): void {
    if (cityId === undefined) {
      this.set(EMPTY_SELECTION);
      return;
    }
    const missionId =
      this.current.cityId === cityId ? this.current.missionId : undefined;
    this.set({ regionId: this.regionOf(cityId), cityId, missionId });
  }

  /** Focuses a region with no city; `undefined` clears everything. */
  selectRegion(regionId: RegionId | undefined): void {
    this.set({ regionId, cityId: undefined, missionId: undefined });
  }

  /** Opens a mission and highlights its city and region. */
  selectMission(missionId: MissionId, cityId: CityId): void {
    this.set({ regionId: this.regionOf(cityId), cityId, missionId });
  }

  /** Closes the mission; the city and region stay highlighted. */
  clearMission(): void {
    this.set({ ...this.current, missionId: undefined });
  }

  /** Subscribes and returns the matching unsubscribe. */
  subscribe(listener: SelectionListener): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Stores and broadcasts a new selection unless it equals the current one. */
  private set(next: OverworldSelectionSnapshot): void {
    if (
      next.regionId === this.current.regionId &&
      next.cityId === this.current.cityId &&
      next.missionId === this.current.missionId
    ) {
      return;
    }
    this.current = next;
    for (const listener of [...this.listeners]) {
      listener(next);
    }
  }
}
