import type { DomainEvent } from "../../core/model/domain-event";
import type { UnitId } from "./unit";

// ===========================================
// AlphaCrowned
// ===========================================

/** Event type: Alpha Present has crowned a bug the named alpha. */
export const ALPHA_CROWNED = "tactical:alpha-crowned";

/** Payload of `AlphaCrowned`. */
export interface AlphaCrownedPayload {
  /** The bug that now carries the name. */
  readonly unitId: UnitId;
  /** Its name, e.g. "Grinder". */
  readonly name: string;
  /** Its nemesis level: 0 on a first meeting. */
  readonly level: number;
}

/**
 * A bug has been crowned the mission's named alpha (campaign arc §8,
 * §11): tougher, harder-hitting, and under its own name from now on.
 * Announced once, at the first phase opening a bug stands on the map.
 * It says who, not where: the log line carries no map indicator, so it
 * discloses nothing the squad has not seen.
 */
export type AlphaCrownedEvent = DomainEvent<
  typeof ALPHA_CROWNED,
  AlphaCrownedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [ALPHA_CROWNED]: AlphaCrownedEvent;
  }
}
