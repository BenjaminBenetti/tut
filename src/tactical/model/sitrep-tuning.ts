// ===========================================
// Per-sitrep tuning
// ===========================================

/** Nightfall: every unit of both sides sees less (campaign arc §11). */
export interface NightfallTuning {
  /** Tiles taken off every unit's sight range. Positive. */
  readonly sightPenalty: number;
  /**
   * The range Nightfall never takes a unit below. A unit that already
   * sees less than this keeps its own range: the dark never raises sight.
   */
  readonly sightFloor: number;
}

/** Spore Fog: smoke clouds on open ground at the start. */
export interface SporeFogTuning {
  /** Map tiles (width × depth) per cloud; the count rounds, at least one. */
  readonly tilesPerCloud: number;
  /** Ground-plane radius of a cloud, as a diamond around its centre. */
  readonly radius: number;
  /** Phases the spore smoke lasts, where a weapon's smoke lasts the hazard tuning's. */
  readonly phases: number;
  /** No smoke on a tile within this ground distance of any deploy tile. */
  readonly deployClearance: number;
  /** Minimum ground distance between two cloud centres. */
  readonly spacing: number;
}

/** City Ablaze: blazes on open ground that relight on a period. */
export interface CityAblazeTuning {
  /** Map tiles (width × depth) per blaze; the count rounds, then clamps. */
  readonly tilesPerBlaze: number;
  /** Fewest blazes a map gets. */
  readonly minBlazes: number;
  /** Most blazes a map gets: every fire tile carries a light. */
  readonly maxBlazes: number;
  /** No fire on a tile within this ground distance of any deploy tile. */
  readonly deployClearance: number;
  /** No fire within this ground distance of an objective, extraction or edge-spawn tile, a spawner or a carcass. */
  readonly objectiveClearance: number;
  /** Minimum ground distance between two blaze centres. */
  readonly spacing: number;
  /** Turns between one lighting and the next; the fire's own clock is the hazard tuning's. */
  readonly rekindleEvery: number;
}

/** Salvage Rich: more tech carcasses than the offer priced. */
export interface SalvageRichTuning {
  /** Carcasses added on top of any the offer placed. */
  readonly carcasses: number;
  /** Tech points of each at difficulty 0; the offer's own carcass is priced the same way. */
  readonly basePoints: number;
  /** Tech points each carcass gains per difficulty point. */
  readonly pointsPerDifficulty: number;
  /** Least ground distance from every deploy tile. */
  readonly minFromDeploy: number;
  /** Sites whose nearest deploy tile is within this are preferred over farther ones. */
  readonly preferWithin: number;
  /** Least ground distance from objective hook tiles, extraction tiles and live spawners. */
  readonly objectiveClearance: number;
  /** Least ground distance from every other carcass. */
  readonly spacing: number;
}

/** Hardened Clutches: tougher egg spawners that hatch more. */
export interface HardenedClutchesTuning {
  /** Every hatching spawner's hit points are multiplied by this, rounded up. Above 1. */
  readonly hpScale: number;
  /** Bugs each hatch releases beyond the spawn tuning's `hatchCount`. Positive integer. */
  readonly extraHatchlings: number;
}

/** Swarm Tide: bigger edge waves, the first sooner. */
export interface SwarmTideTuning {
  /** Every edge wave's size is multiplied by this, rounded up. Above 1. */
  readonly sizeScale: number;
  /** Turns the first edge wave is brought forward; never before the first turn. */
  readonly turnsSooner: number;
  /**
   * How far past its zone a wave may spill, in infantry steps. A zone is
   * four to six edge tiles, which a shipped wave already fills from
   * difficulty 5, so without somewhere to stand the extra bugs would
   * never arrive.
   */
  readonly spillRadius: number;
}

/** Dust-off Window: the drop ship leaves once a set turn has ended. */
export interface DustOffWindowTuning {
  /** Turns the window always gives, before the map's size adds any. */
  readonly baseTurns: number;
  /** Map tiles of `width + depth` per extra turn; the quotient rounds up. */
  readonly tilesPerTurn: number;
  /**
   * On a mission that counts its waves (a defence), turns kept after the
   * last wave's turn, so holding every wave always leaves time to clear
   * up and board.
   */
  readonly turnsAfterLastWave: number;
}

// ===========================================
// Sitrep tuning
// ===========================================

/**
 * Balance knobs for the sitreps (campaign arc §11). Each sitrep's rule
 * is built from its own entry, so a test can hand a rule different
 * numbers. Defaults live in `tactical/data/sitrep-tuning.ts`.
 *
 * ```
 *   nightfall          sight − 4, never below 3
 *   spore-fog          one radius-2 cloud per 576 tiles (4 / 9 / 16), 16 phases
 *   city-ablaze        one 5-tile blaze per 1728 tiles, 2..4 (2 / 3 / 4), relit every 3 turns
 *   salvage-rich       2 more carcasses, priced like the offer's own
 *   hardened-clutches  spawner hp × 1.5 rounded up, one more bug a hatch
 *   swarm-tide         waves × 1.5 rounded up, spilling 2 past the zone; first one turn sooner
 *   dust-off-window    ship leaves after turn 8 + ⌈(w + d) / 12⌉ (16 / 20 / 24),
 *                      and never before 12 turns after a defence's last wave
 * ```
 */
export interface SitrepTuning {
  readonly nightfall: NightfallTuning;
  readonly sporeFog: SporeFogTuning;
  readonly cityAblaze: CityAblazeTuning;
  readonly salvageRich: SalvageRichTuning;
  readonly hardenedClutches: HardenedClutchesTuning;
  readonly swarmTide: SwarmTideTuning;
  readonly dustOffWindow: DustOffWindowTuning;
}
