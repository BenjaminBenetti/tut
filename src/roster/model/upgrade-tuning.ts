import type { PartStats } from "./mech-part";

/**
 * Balance knobs for part upgrades (GDD §5.7). Services receive a tuning
 * object rather than importing the defaults. Defaults live in
 * `roster/data/upgrade-tuning.ts`.
 *
 * ```
 *   stat at level L   = round( stat × (1 + L × statMultiplierPerLevel) )   for scaled, positive stats
 *   cost of level L   = round( part.cost × costMultiplierPerLevel × L )
 * ```
 */
export interface UpgradeTuning {
  /** Highest level a part can reach; level 0 is the catalogue part. */
  readonly maxLevel: number;
  /** Fractional boost per level to each scaled stat, e.g. `0.1` for +10 % per level. */
  readonly statMultiplierPerLevel: number;
  /** Fraction of the part's price per level number: level 2 costs twice level 1. */
  readonly costMultiplierPerLevel: number;
  /**
   * Which stats an upgrade improves. Weight, heat and power draw are
   * physical properties of the part and never change; only positive
   * values scale, so a heavy part's mobility penalty is not made worse.
   */
  readonly scaledStats: readonly (keyof PartStats)[];
}
