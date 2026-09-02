import type { EarthMap } from "./earth-map";
import type { EventTypeId } from "./event-type";
import type { Mission } from "./mission";
import type { MissionResult } from "./mission-result";
import type { RegionId } from "./region";

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

/** Placeholder until #70 defines `PendingEvent` in `overworld/model/pending-event.ts`. */
export interface PendingEvent {
  readonly id: string;
  readonly typeId: EventTypeId;
}

/** Placeholder until #52 defines `Deployable` in `overworld/model/deployable.ts`. */
export interface Deployable {
  readonly id: string;
  readonly typeId: string;
  readonly regionId: RegionId;
}

/** Placeholder until M3 defines bug hives (GDD §5.3). */
export interface Hive {
  readonly id: string;
  readonly regionId: RegionId;
}

/**
 * How a campaign ended (GDD §5.3). Placeholder until #59 (lose condition
 * and win stub) settles the vocabulary.
 */
export type GameOutcome = "victory" | "defeat";

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
 *   ├── missions[]          offers attached to cities
 *   ├── pendingEvents[]     choices awaiting the player
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
  /** Missions currently on offer. */
  readonly missions: readonly Mission[];
  /** Events waiting for the player's choice. */
  readonly pendingEvents: readonly PendingEvent[];
  /** Installations built on regions. */
  readonly deployables: readonly Deployable[];
  /** Bug hives (M3). Always empty in M1. */
  readonly hives: readonly Hive[];
  /** Present once the campaign has ended. */
  readonly outcome?: GameOutcome;
  /** Result of the most recent mission, for the results screen. */
  readonly lastMissionResult?: MissionResult;
}
