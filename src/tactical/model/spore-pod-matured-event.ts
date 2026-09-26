import type { DomainEvent } from "../../core/model/domain-event";
import type { ObjectiveId, SpawnerId } from "./tactical-state";

// ===========================================
// SporePodMatured
// ===========================================

/** Event type: a spore pod was left standing past its deadline and matured. */
export const SPORE_POD_MATURED = "tactical:spore-pod-matured";

/** Payload of `SporePodMatured`. */
export interface SporePodMaturedPayload {
  /** The pod, a `spore-pod` spawner, now gone. */
  readonly spawnerId: SpawnerId;
  /** The `destroy-pod` objective its maturing failed. */
  readonly objectiveId: ObjectiveId;
}

/**
 * A spore pod matured (campaign arc §6.3): its objective's deadline
 * turn ended with it standing. The pod is gone and its wave is on the
 * way; the bugs follow in a `BugsSpawned` with source `"pod"`.
 */
export type SporePodMaturedEvent = DomainEvent<
  typeof SPORE_POD_MATURED,
  SporePodMaturedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [SPORE_POD_MATURED]: SporePodMaturedEvent;
  }
}
