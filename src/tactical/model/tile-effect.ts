import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { AreaEffectKind } from "./weapon-profile";

// ===========================================
// Ids and unions
// ===========================================

/** Id of a tile effect on the map, issued with the `"effect"` prefix. Plain string (ADR 0003). */
export type TileEffectId = string;

/** Prefix the id generator uses for tile effects. */
export const TILE_EFFECT_ID_PREFIX = "effect";

/** What a tile effect is. The same closed set a weapon's `aoeEffect` names. */
export type TileEffectKind = AreaEffectKind;

// ===========================================
// Tile effect
// ===========================================

/**
 * Something burning on a tile (#1121). Plain serialisable data in the
 * mission state, like a spawner: it is put there by a blast, it acts on
 * its own turn — the start of each phase, against the units of the side
 * whose phase begins — and it burns out when its phases run down.
 *
 * ```
 *   blast ──► TileEffect { kind: "fire", tile, phasesLeft: 4 }
 *                │
 *   each phase:  units of the acting side on `tile` take fire damage
 *                phasesLeft − 1 ──► 0 ──► removed, EffectEnded
 * ```
 *
 * One effect per tile per kind: a second blast on a burning tile
 * rekindles it rather than stacking a second fire.
 */
export interface TileEffect {
  readonly id: TileEffectId;
  readonly kind: TileEffectKind;
  /** The tile it occupies, level included. */
  readonly tile: TileCoord;
  /** Phases before it burns out; counts down at the start of every phase. Positive while it burns. */
  readonly phasesLeft: number;
}
