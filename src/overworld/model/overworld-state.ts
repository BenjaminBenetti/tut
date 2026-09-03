import type { Deployable } from "./deployable";
import type { EarthMap } from "./earth-map";
import type { PendingEvent } from "./pending-event";
import type { StipendModifier } from "./stipend-modifier";
import type { GameOutcome } from "./game-outcome";
import type { Mission } from "./mission";
import type { MissionResult } from "./mission-result";
import type { RegionId } from "./region";
import type { SpreadCooldowns } from "./spread-cooldown";

// ===========================================
// Time
// ===========================================

/** The day a campaign starts on. Days count up from here (GDD §5.2). */
export const FIRST_DAY = 1;

// ===========================================
// Placeholders
// ===========================================
//
// Minimal shapes for records that later issues define in full. Each is
// only ever an element of an empty list in a new game, so widening it
// later changes no persisted data. When the owning issue lands, replace
// the placeholder with an import of the real type.

/** Placeholder until M3 defines bug hives (GDD §5.3). */
export interface Hive {
  readonly id: string;
  readonly regionId: RegionId;
}

// ===========================================
// Overworld state
// ===========================================

/**
 * The overworld slice of `GameState` (GDD §5): Earth and everything that
 * happens on it between missions. Plain serializable data; the tick
 * pipeline and command handlers return copies.
 *
 * ```
 *   OverworldState
 *   ├── day                 FIRST_DAY and counting
 *   ├── map                 regions, cities, infestation levels
 *   ├── threat              0–100, derived by computeThreat, stored by the tick
 *   ├── threatOffset        signed, lasting shift from event choices, folded into threat
 *   ├── spreadCooldowns     days until each city may spread again
 *   ├── missions[]          offers attached to cities
 *   ├── pendingEvents[]     choices awaiting the player
 *   ├── stipendModifiers?   event-driven scales on upcoming stipends
 *   ├── deployables[]       regional installations
 *   ├── hives[]             (M3) persistent bug hives
 *   ├── outcome?            set once the campaign is won or lost
 *   └── lastMissionResult?  what the results screen shows
 * ```
 */
export interface OverworldState {
  /** Current day, `FIRST_DAY` or later. */
  readonly day: number;
  /** The strategic map with each city's current infestation. */
  readonly map: EarthMap;
  /**
   * Global threat level in `[MIN_THREAT, MAX_THREAT]`. Derived from `map`
   * and `day` by the threat service and stored here by the tick so
   * presentation never recomputes it.
   */
  readonly threat: number;
  /**
   * Lasting shift on the global threat from event choices (#307), signed.
   * `computeThreat` adds it after the map and time terms and before the
   * clamp, so a paid threat reduction survives the daily recompute. The
   * `threat` event effect moves it by however much the stored threat
   * actually moved, so it never carries a shift the clamp swallowed.
   */
  readonly threatOffset: number;
  /**
   * Days until each city may spread again, keyed by city id. Cities not
   * listed are off cooldown. Advanced by the spread service.
   */
  readonly spreadCooldowns: SpreadCooldowns;
  /** Missions currently on offer. */
  readonly missions: readonly Mission[];
  /** Events waiting for the player's choice. */
  readonly pendingEvents: readonly PendingEvent[];
  /**
   * Scales queued by event choices on upcoming stipend payments (#70).
   * Absent when none are active, which is also how every save written
   * before the field existed reads.
   */
  readonly stipendModifiers?: readonly StipendModifier[];
  /** Installations built on regions. */
  readonly deployables: readonly Deployable[];
  /** Bug hives (M3). Always empty in M1. */
  readonly hives: readonly Hive[];
  /**
   * Present once the campaign has ended. Written once by the outcome
   * service and never overwritten; the day tick refuses to run while it
   * is set.
   */
  readonly outcome?: GameOutcome;
  /** Result of the most recent mission, for the results screen. */
  readonly lastMissionResult?: MissionResult;
}
