import type { Unsubscribe } from "../../core/model/event-bus";
import type { CityId } from "../../overworld/model/city";
import type { MissionId } from "../../overworld/model/mission";
import type {
  OverworldSelection,
  OverworldUiState,
  SelectionListener,
} from "../model/overworld-selection";

// ===========================================
// OverworldSelectionState
// ===========================================

/**
 * In-memory `OverworldUiState`. Notifies subscribers only when the
 * selection actually changes, so the map highlight and the views can
 * write back into it without echoing forever.
 */
export class OverworldSelectionState implements OverworldUiState {
  // ===========================================
  // Fields
  // ===========================================

  private current: OverworldSelection = {
    cityId: undefined,
    missionId: undefined,
  };
  private readonly listeners = new Set<SelectionListener>();

  // ===========================================
  // OverworldUiState
  // ===========================================

  /** The current selection. */
  get selection(): OverworldSelection {
    return this.current;
  }

  /** Highlights a city, keeping the mission only if it lives there. */
  selectCity(cityId: CityId): void {
    const missionId =
      this.current.cityId === cityId ? this.current.missionId : undefined;
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
  private set(next: OverworldSelection): void {
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
