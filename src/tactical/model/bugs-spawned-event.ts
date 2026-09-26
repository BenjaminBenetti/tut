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
  /**
   * Whether they hatched from a spawner, walked in from the map edge,
   * burst from a spore pod that matured, or came up an open tunnel
   * mouth under the ground (campaign arc §6.7).
   */
  readonly source: "spawner" | "edge" | "pod" | "tunnel";
  /** The spawner, edge-spawn hook, pod or tunnel mouth they came from. */
  readonly sourceId: string;
  /** One-based wave number for an edge wave (#1175). */
  readonly wave?: number;
  /** How many waves the mission sends, when it is a finite count (#1175). */
  readonly totalWaves?: number;
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
