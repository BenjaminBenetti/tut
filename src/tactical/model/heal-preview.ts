import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { UnitId } from "./unit";

// ===========================================
// Heal preview
// ===========================================

/** One unit a previewed heal would mend. */
export interface HealBeneficiaryPreview {
  readonly id: UnitId;
  readonly name: string;
  /** Tiles from the impact. */
  readonly distance: number;
  /** Hit points it would get back, `> 0`; capped at what it is missing. */
  readonly amount: number;
  /** Its hit points afterwards. */
  readonly hpAfter: number;
}

/**
 * What a medkit or a repair kit would do at a tile (#1138), for the
 * wheel's entry and the footprint overlay: the area it reaches and who
 * in it would be mended. The counterpart of `AttackPreview` for a kit
 * that hurts nobody — a heal has no hit chance, no damage band and no
 * victims, so it does not borrow that shape and pretend.
 */
export interface HealPreview {
  /** Hit points the kit restores to each unit it reaches, before the cap. */
  readonly amount: number;
  /** Tiles from the impact it reaches. */
  readonly radius: number;
  /** Every tile it reaches, the impact first; what the overlay paints. */
  readonly tiles: readonly TileCoord[];
  /** Everyone it would mend, impact first; never empty for an accepted use. */
  readonly beneficiaries: readonly HealBeneficiaryPreview[];
  /** Units of the right side and make in the area that are already at full hit points. */
  readonly alreadyWhole: number;
}
