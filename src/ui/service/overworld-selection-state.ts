import type { Unsubscribe } from "../../core/model/event-bus";
import type { CityId } from "../../overworld/model/city";
import type { MissionId } from "../../overworld/model/mission";
import type {
  OverworldSelection,
  OverworldSelectionSnapshot,
  SelectionListener,
} from "../model/overworld-selection";

// ===========================================
// OverworldSelectionState
// ===========================================

/**
 * In-memory `OverworldSelection`. Notifies subscribers only when the
 * selection actually changes, so the map highlight and the views can
 * write back into it without echoing forever; views render from state,
 * so a repeated click on the same city has nothing new to show.
 *
 * `CitySelectionStore` (#293) is the former name of this class and is
 * re-exported from `ui/service/city-selection-store.ts` for one release.
 */
export class OverworldSelectionState implements OverworldSelection {
  // ===========================================
  // Fields
  // ===========================================

  private current: OverworldSelectionSnapshot = {
    cityId: undefined,
    missionId: undefined,
  };
  private readonly listeners = new Set<SelectionListener>();

  // ===========================================
  // OverworldSelection
  // ===========================================

  /** The selected city, or undefined when none is. */
  get cityId(): CityId | undefined {
    return this.current.cityId;
  }

  /** The open mission, or undefined when none is. */
  get missionId(): MissionId | undefined {
    return this.current.missionId;
  }

  /** Both values as one snapshot. */
  get selection(): OverworldSelectionSnapshot {
    return this.current;
  }

  /** Highlights a city (or clears with undefined), keeping the mission only if it lives there. */
  select(cityId: CityId | undefined): void {
    const missionId =
      cityId !== undefined && this.current.cityId === cityId
        ? this.current.missionId
        : undefined;
    this.set({ cityId, missionId });
  }

  /** Opens a mission and highlights its city. */
  selectMission(missionId: MissionId, cityId: CityId): void {
    this.set({ cityId, missionId });
  }

  /** Closes the mission; the city stays highlighted. */
  clearMission(): void {
    this.set({ cityId: this.current.cityId, missionId: undefined });
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
