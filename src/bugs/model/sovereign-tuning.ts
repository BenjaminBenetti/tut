import type { BugSpeciesId } from "../../content/model/bug-species-id";

// ===========================================
// Aura
// ===========================================

/**
 * The Sovereign's aura (#1179, campaign arc §9: "buff nearby bugs"):
 * one tuning object, so the whole buff is retuned in one place.
 *
 * ```
 *   bug phase opens, for each living Sovereign
 *     every other living, awake bug whose block comes within `radius`
 *     tiles of hers (ground Manhattan, nearest tile to nearest tile)
 *       ──► its weapon hits for `damageBonus` more, for that phase only
 * ```
 */
export interface SovereignAuraTuning {
  /** Ground tiles from her block to an ally's within which it is empowered. Non-negative. */
  readonly radius: number;
  /** Damage an empowered bug's weapon adds to every hit, for the phase. Positive. */
  readonly damageBonus: number;
}

// ===========================================
// Summons
// ===========================================

/**
 * The guards she calls (#1179, arc §9: "summon guards").
 *
 * ```
 *   bug phase of every turn divisible by `interval` opens
 *     ──► `count` escorts, species taken from `escort` in turn,
 *         each on the first free tile within `radius` steps of her
 * ```
 */
export interface SovereignSummonTuning {
  /** Turns between summons: every turn divisible by it. A whole number, 1 or more. */
  readonly interval: number;
  /** Escorts per summons. A whole number, 0 or more. */
  readonly count: number;
  /** Infantry steps from her block a guard may be placed within. Positive. */
  readonly radius: number;
  /** The escort species, cycled: guard `i` is `escort[i % escort.length]`. Non-empty. */
  readonly escort: readonly BugSpeciesId[];
}

// ===========================================
// Sovereign tuning
// ===========================================

/**
 * The Sovereign's numbers (#1179, campaign arc §9): how tough she is,
 * her aura, her guards, when she falls back, and the weights her
 * fallback behaviour scores tiles with. A substitute reshapes the boss
 * without touching the rules. See `SOVEREIGN_TUNING`.
 *
 * ```
 *   hit points  hpBase + hpPerDifficulty·(difficulty − 1)
 *   retreat     hp ≤ maxHp·retreatAtHpFraction ──► retreating, for good
 *
 *   score of a tile she could end her move on (healthy)
 *     − max(0, distance to the core − leashRadius)·leashWeight
 *     + visible enemies her scythes would touch from it ·contactWeight
 *     − distance to her focus ·focusWeight   (the visible enemy nearest the core)
 *     − movement ·stepWeight
 *   retreating
 *     − max(0, distance to the core − holdRadius)·leashWeight
 *     + contact ·contactWeight − movement ·stepWeight
 * ```
 */
export interface SovereignTuning {
  /** Hit points at difficulty 1. Positive. */
  readonly hpBase: number;
  /** Hit points added per difficulty step above 1. Non-negative. */
  readonly hpPerDifficulty: number;
  /** The buff she lends the bugs around her. */
  readonly aura: SovereignAuraTuning;
  /** The guards she calls. */
  readonly summon: SovereignSummonTuning;
  /**
   * The fraction of her max hit points at or below which she falls back
   * onto the core (arc §9: "retreat to the core"). She never turns back.
   */
  readonly retreatAtHpFraction: number;
  /** Tiles from the core a retreating Sovereign settles within, and then holds. Non-negative. */
  readonly holdRadius: number;
  /** Tiles from the core a healthy Sovereign is willing to range. Non-negative. */
  readonly leashRadius: number;
  /** Penalty per tile beyond her leash (or hold radius). Dominates the others. */
  readonly leashWeight: number;
  /** Reward per visible enemy her scythes would reach from a tile. */
  readonly contactWeight: number;
  /** Penalty per tile between a tile and her focus. */
  readonly focusWeight: number;
  /** Penalty per movement point spent, so she does not wander between equal tiles. */
  readonly stepWeight: number;
}
