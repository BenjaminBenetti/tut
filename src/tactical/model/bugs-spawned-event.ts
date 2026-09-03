import type { DomainEvent } from "../../core/model/domain-event";
import type { UnitId } from "./unit";

// ===========================================
// BugsSpawned
// ===========================================

/** Event type: bugs appeared on the map. */
export const BUGS_SPAWNED = "tactical:bugs-spawned";

/** Payload of `BugsSpawned`. */
export interface BugsSpawnedPayload {
  readonly unitIds: readonly UnitId[];
  /** Whether they hatched from a spawner or walked in from the map edge. */
  readonly source: "spawner" | "edge";
  /** The spawner or edge-spawn hook they came from. */
  readonly sourceId: string;
}

/** Bugs appeared on the map. */
export type BugsSpawnedEvent = DomainEvent<
  typeof BUGS_SPAWNED,
  BugsSpawnedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [BUGS_SPAWNED]: BugsSpawnedEvent;
  }
}
