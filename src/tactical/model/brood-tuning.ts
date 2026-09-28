import type { SpeciesMix } from "../../bugs/model/species-mix";
import type { BugUnitSource } from "./bug-unit-source";
import type { NoiseTuning } from "./noise";

// ===========================================
// Wake tuning
// ===========================================

/**
 * How far a sleeping brood reaches and hears (#1179, campaign arc §7.5).
 * The wake zone is the round in the middle of its chamber, not the whole
 * chamber, so the rim is ground a careful force can walk past it on:
 *
 * ```
 *   zone radius = max(minZoneRadius, round(chamber radius × zoneShare))
 *
 *        · · · · · · · ·          ·  the chamber (hook meta.radius)
 *      · · · z z z z · · ·        z  the wake zone, where the brood sleeps
 *      · · z z z z z z · ·
 *      · · · z z z z · · ·
 *        · · · · · · · ·
 * ```
 */
export interface BroodWakeTuning extends NoiseTuning {
  /**
   * Tiles beyond the wake zone's edge from which a loud action wakes the
   * brood: heard when its distance from the zone's centre is at most
   * `radius + noiseRadius` (Euclidean, ground plane). Non-negative.
   */
  readonly noiseRadius: number;
  /**
   * The share of its chamber's radius a brood's wake zone reaches, and
   * its sleepers lie within. In `(0, 1]`.
   */
  readonly zoneShare: number;
  /** The least wake-zone radius, in tiles, however small the chamber. Positive. */
  readonly minZoneRadius: number;
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
  /**
   * Bugs in a route chamber's brood at difficulty 0, before the floor:
   * negative for a brood that grows from `minSize` only at some difficulty.
   */
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
