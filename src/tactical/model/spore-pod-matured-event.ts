import type { DomainEvent } from "../../core/model/domain-event";
import type { SpawnerVariant } from "./spawner-variant";
import type { ObjectiveId, SpawnerId } from "./tactical-state";

// ===========================================
// SporePodMatured
// ===========================================

/** Event type: a spore pod was left standing past its deadline and matured. */
export const SPORE_POD_MATURED = "tactical:spore-pod-matured";

/** Payload of `SporePodMatured`. */
export interface SporePodMaturedPayload {
  /** The pod, a `spore-pod` or `great-pod-core` spawner, now gone. */
  readonly spawnerId: SpawnerId;
  /** The `destroy-pod` objective its maturing failed. */
  readonly objectiveId: ObjectiveId;
  /**
   * What matured, when it is not a spore pod: a great pod's core
   * (#1238). Absent for a spore pod, so its events read exactly as they
   * did before great pods.
   */
  readonly variant?: SpawnerVariant;
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
