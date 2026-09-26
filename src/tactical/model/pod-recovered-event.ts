import type { DomainEvent } from "../../core/model/domain-event";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { ObjectiveId } from "./tactical-state";
import type { UnitId } from "./unit";

// ===========================================
// PodRecovered
// ===========================================

/** Event type: the recovery drop ship lifted the spore pod off the map. */
export const POD_RECOVERED = "tactical:pod-recovered";

/** Payload of `PodRecovered`. */
export interface PodRecoveredPayload {
  /** The pod, a `generator`-kind unit of ours, now gone from the map. */
  readonly unitId: UnitId;
  /** The `recover-pod` objective the lift completed. */
  readonly objectiveId: ObjectiveId;
  /** Where the pod stood when it was lifted. */
  readonly pos: TileCoord;
  /** The pod's hit points as it was lifted, for the log and the debrief. */
  readonly hp: number;
}

/**
 * The spore pod was recovered (#1179, campaign arc §6.9 Intact Pod): its
 * `recover-pod` objective's recovery turn ended with the pod alive, and
 * the drop ship lifted it. The pod is gone from `units`; the squad still
 * has to extract.
 */
export type PodRecoveredEvent = DomainEvent<
  typeof POD_RECOVERED,
  PodRecoveredPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [POD_RECOVERED]: PodRecoveredEvent;
  }
}
