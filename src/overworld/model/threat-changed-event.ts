import type { DomainEvent } from "../../core/model/domain-event";

// ===========================================
// Threat changed
// ===========================================

/** Event type emitted when the stored global threat level moves. */
export const THREAT_CHANGED = "overworld:threat-changed";

/** What presentation needs to animate the threat gauge. */
export interface ThreatChangedPayload {
  /** Threat before the recompute. */
  readonly from: number;
  /** Threat after the recompute. Never equal to `from`. */
  readonly to: number;
}

/** The global threat level rose or fell. */
export type ThreatChangedEvent = DomainEvent<
  typeof THREAT_CHANGED,
  ThreatChangedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./overworld-domain-event" {
  interface OverworldEventMap {
    [THREAT_CHANGED]: ThreatChangedEvent;
  }
}
