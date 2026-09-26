import type { ActId } from "../../content/model/act-id";
import type { DifficultyBand } from "../../content/model/mission-type";
import type { MissionTypeId } from "../../content/model/mission-type-id";

// ===========================================
// Act definition
// ===========================================

/**
 * What one act of the campaign is (campaign arc §3, §5 and §11, ADR 0013
 * §2.1): how many unpinned offers the board holds, the band every
 * non-story offer's difficulty is clamped into, how the mission director
 * weighs the types, and how many sitreps an offer may carry. Static
 * content; the data lives in `overworld/data/acts.ts`.
 *
 * ```
 *   ACTS[progress.act] ──► boardCap        director fills the board to it
 *                     ├──► difficultyBand  clamps non-story difficulty
 *                     ├──► typeWeights     weighted type draw
 *                     └──► sitrepSlots, sitrepChance
 * ```
 */
export interface ActDefinition {
  readonly id: ActId;
  /** Display name, e.g. "Emergence". */
  readonly name: string;
  /** Most unpinned offers on the board at once. Pinned offers do not count. */
  readonly boardCap: number;
  /** Inclusive difficulty band non-story offers are clamped into. */
  readonly difficultyBand: DifficultyBand;
  /**
   * Relative weights of the director's type draw. `Partial`, so a type
   * with no entry is never drawn: a new type adds its weight when it
   * lands, and trigger-driven types (Defend Installation) have none.
   * Weights need not sum to anything; the draw renormalises over the
   * types that are eligible today.
   */
  readonly typeWeights: Readonly<Partial<Record<MissionTypeId, number>>>;
  /** Most sitreps one offer may carry. */
  readonly sitrepSlots: number;
  /** Chance, in `[0, 1]`, that each slot is filled when an offer is made. */
  readonly sitrepChance: number;
}

/**
 * Every act's definition, keyed by the closed `ActId` union; the app
 * passes `ACTS`. Services that read the act take one of these rather
 * than importing the data.
 */
export type ActCatalogue = Readonly<Record<ActId, ActDefinition>>;
