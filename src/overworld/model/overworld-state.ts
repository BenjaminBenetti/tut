import type { CampaignProgress } from "./campaign-progress";
import type { Deployable } from "./deployable";
import type { EarthMap } from "./earth-map";
import type { PendingEvent } from "./pending-event";
import type { StipendModifier } from "./stipend-modifier";
import type { GameOutcome } from "./game-outcome";
import type { GreatHive } from "./great-hive";
import type { Hive } from "./hive";
import type { Mission } from "./mission";
import type { MissionResult } from "./mission-result";
import type { RegionId } from "./region";
import type { SpreadCooldowns } from "./spread-cooldown";
import type { WreckRecoverySpec } from "./wreck-recovery-spec";

// ===========================================
// Time
// ===========================================

/** The day a campaign starts on. Days count up from here (GDD §5.2). */
export const FIRST_DAY = 1;

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
 *   ├── wrecks?             mechs lost on lost missions, awaiting their one recovery
 *   ├── pendingEvents[]     choices awaiting the player
 *   ├── stipendModifiers?   event-driven scales on upcoming stipends
 *   ├── deployables[]       regional installations
 *   ├── hives[]             bug hives, at most one per region (arc §6.5)
 *   ├── hiveWatch?          days each hive-less region has held the formation threshold
 *   ├── growthPausedUntil?  liberated regions: the day each one grows again
 *   ├── greatHives?         the platform's three beacons, revealed by Uplink (arc §6.9)
 *   ├── progress            act, missions played, story flags, first kills, nemeses
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
  /**
   * Mechs destroyed on a lost or abandoned mission whose wreck still
   * waits for its one recovery attempt (arc §6.6), oldest first. The
   * launch handler records one at the loss, while the roster still
   * knows the mech; the Wreck Recovery trigger offers it; its
   * consequence rule removes it once the offer is played or lapses, and
   * the launch handler drops one whose offer window passed unmade.
   * Absent until the first such loss, which is also how every save
   * written before the field existed reads.
   */
  readonly wrecks?: readonly WreckRecoverySpec[];
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
  /**
   * Bug hives rooted in regions (campaign arc §6.5), at most one per
   * region, in formation order. Empty until Act II: the formation step
   * and `formFirstHive` add them, `liberateRegion` removes them.
   */
  readonly hives: readonly Hive[];
  /**
   * Consecutive days each region without a hive has held its mean
   * infestation at or above the formation threshold, keyed by region id.
   * A region not listed has no streak. Written only by the
   * `hive-formation` tick step, and never before hives can form, so it
   * is absent in Act I and in every save written before hives existed.
   */
  readonly hiveWatch?: Readonly<Record<RegionId, number>>;
  /**
   * Liberated regions under a growth pause (arc §6.5), keyed by region
   * id: the first tick day on which the region grows and spreads again.
   * A region is paused on day `d` while `d` is before its entry; an entry
   * on or before today is a pause that has lifted. Set by
   * `liberateRegion`, one entry per region, so it never outgrows the
   * region list. Absent until the first liberation.
   */
  readonly growthPausedUntil?: Readonly<Record<RegionId, number>>;
  /**
   * The three Great Hives (campaign arc §3 Act III, §6.9), in reveal
   * order, destroyed ones included. Absent until the day tick after
   * Uplink is won, which is also how every earlier save reads; the
   * `great-hive-reveal` step writes it once and the Great Hive
   * consequence marks each one destroyed. A sibling of `hives` so the
   * ordinary hive rules never see a beacon.
   */
  readonly greatHives?: readonly GreatHive[];
  /**
   * How far the campaign has come (ADR 0013 §2.1): the act, the missions
   * played and won, story flags, first kills and nemeses. The launch
   * handler counts missions; story services move the act and set flags.
   */
  readonly progress: CampaignProgress;
  /**
   * Present once the campaign has ended. Written once by the outcome
   * service and never overwritten; the day tick refuses to run while it
   * is set.
   */
  readonly outcome?: GameOutcome;
  /** Result of the most recent mission, for the results screen. */
  readonly lastMissionResult?: MissionResult;
}
