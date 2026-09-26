import type { SpeciesMix } from "../../bugs/model/species-mix";
import type { BugUnitSource } from "./bug-unit-source";
import type { NoiseTuning } from "./noise";

// ===========================================
// Wake tuning
// ===========================================

/** How far a sleeping brood hears (#1179, campaign arc §7.5). */
export interface BroodWakeTuning extends NoiseTuning {
  /**
   * Tiles beyond the wake zone's edge from which a loud action wakes the
   * brood: heard when its distance from the zone's centre is at most
   * `radius + noiseRadius` (Euclidean, ground plane). Non-negative.
   */
  readonly noiseRadius: number;
}

// ===========================================
// Brood tuning
// ===========================================

/**
 * How many bugs sleep in a hive cavern's chambers, of which species, and
 * what wakes them (#1179, campaign arc §7.5). One brood per
 * `brood-chamber` hook:
 *
 * ```
 *   size = clamp(round((baseSize + sizePerDifficulty × difficulty)
 *                      × roleScale[hook role] (default 1)),
 *                minSize, maxSize)
 *   each bug's species ~ the mission's bugMix, else defaultMix
 * ```
 */
export interface BroodTuning {
  /** Bugs in a route chamber's brood at difficulty 0. Non-negative. */
  readonly baseSize: number;
  /** Extra bugs per point of mission difficulty. Non-negative. */
  readonly sizePerDifficulty: number;
  /** Floor on a brood's size after scaling. Non-negative integer. */
  readonly minSize: number;
  /** Ceiling on a brood's size after scaling; at least `minSize`. */
  readonly maxSize: number;
  /**
   * Size multiplier by the chamber's role (`route`, `side`, `core`); a
   * role not listed scales by 1. Non-negative.
   */
  readonly roleScale: Readonly<Record<string, number>>;
  /**
   * The species mix for a mission that froze none (a mission offered
   * before the bestiary, or one staged by hand): swarmers and lurkers.
   */
  readonly defaultMix: SpeciesMix;
  /** What wakes a placed brood. */
  readonly wake: BroodWakeTuning;
}

// ===========================================
// Setup dependencies
// ===========================================

/**
 * What `placeCavernBroods` needs beyond ids, passed by the composition
 * root on `MissionSetupDeps.broods`: the stat blocks it may stand (every
 * bug species; the mix picks among them) and the tuning. Tactical reads
 * no bug catalogue itself.
 */
export interface BroodSetupDeps {
  readonly species: readonly BugUnitSource[];
  readonly tuning: BroodTuning;
}
