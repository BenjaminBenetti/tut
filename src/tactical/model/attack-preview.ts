import type { CoverLevel } from "../../mapgen/model/cover";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { AttackTargetKind } from "./attack-target";
import type { Team } from "./unit";

// ===========================================
// Blast preview
// ===========================================

/** One unit or spawner the previewed blast would reach, besides the aimed target. */
export interface BlastVictimPreview {
  readonly id: string;
  readonly kind: AttackTargetKind;
  readonly name: string;
  readonly team: Team;
  /** Tiles from the impact. */
  readonly distance: number;
  /** Inclusive damage band after falloff and armor; whole numbers. */
  readonly damage: readonly [number, number];
}

/**
 * What a weapon with a blast or a force would do around the impact
 * (#1121), so the player can see the friendly fire before committing.
 * Pure data from the combat service; the wheel and the overlays read it.
 */
export interface BlastPreview {
  /** Tiles from the impact the blast reaches; `0` for a force with no blast. */
  readonly radius: number;
  /** Every tile the blast reaches, the impact first. */
  readonly tiles: readonly TileCoord[];
  /** Everything standing in it other than the aimed target, impact first. */
  readonly victims: readonly BlastVictimPreview[];
  /**
   * Props and wall edges the shot would bring down. Absent when the
   * caller had no content to ask — a preview built without `PreviewDeps`
   * — never zero in its place, so "nothing falls" is never claimed by
   * a caller that could not know.
   */
  readonly demolished?: number;
  /** True when the weapon leaves an effect — fire — on the tiles it reaches. */
  readonly leavesEffect: boolean;
}

// ===========================================
// Attack preview
// ===========================================

/**
 * What the HUD shows before the player commits to an attack (GDD §6.2:
 * hit chance and damage are visible before committing). Pure data from
 * `previewAttack`; `resolveAttack` rolls against exactly these numbers.
 */
export interface AttackPreview {
  /** Whole percent in `[minHitChance, maxHitChance]`. */
  readonly hitChance: number;
  /** Inclusive damage band after armor, `[min, max]`; whole numbers, `min >= minDamage`. */
  readonly damage: readonly [number, number];
  /** Tiles between attacker and target, in three dimensions (#1119). */
  readonly distance: number;
  /** Cover the target has against this attacker. */
  readonly cover: CoverLevel;
  /** True when the target has cover on some side but none against this attacker. */
  readonly flanked: boolean;
  /** Levels the attacker stands above the target; negative below. */
  readonly elevation: number;
  /** What happens around the impact, for a weapon that does anything there (#1121). */
  readonly blast?: BlastPreview;
}
