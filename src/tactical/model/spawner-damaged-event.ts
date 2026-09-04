import type { DomainEvent } from "../../core/model/domain-event";
import type { SpawnerId } from "./tactical-state";
import type { UnitId } from "./unit";

// ===========================================
// SpawnerDamaged
// ===========================================

/** Event type: charges were planted on an egg spawner. */
export const SPAWNER_DAMAGED = "tactical:spawner-damaged";

/** Payload of `SpawnerDamaged`. */
export interface SpawnerDamagedPayload {
  readonly spawnerId: SpawnerId;
  /** The unit that planted the charges. */
  readonly unitId: UnitId;
  /** Hit points removed, `> 0`. */
  readonly damage: number;
  /** The spawner's hit points afterwards, `>= 0`. */
  readonly hp: number;
  /** True when this was the blow that destroyed it. */
  readonly destroyed: boolean;
}

/** Charges were planted on an egg spawner (GDD §6.3). */
export type SpawnerDamagedEvent = DomainEvent<
  typeof SPAWNER_DAMAGED,
  SpawnerDamagedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [SPAWNER_DAMAGED]: SpawnerDamagedEvent;
  }
}
