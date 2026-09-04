// ===========================================
// Map assessment
// ===========================================

/**
 * How a generated map plays, measured through the rules that consume it
 * (plain data). Where `MapMetrics` counts what the generator put down,
 * this counts what a squad meets: how far it walks, how many places it
 * can shoot an objective from, how much of that is in cover, and how long
 * a bug wave spends walking in.
 *
 * Distances are steps under the traversal contract (ADR 0004 §5) from the
 * map's deploy zones, so they are what a unit actually walks rather than
 * a straight line. `-1` means "no route", which the generator's I7 makes
 * impossible for a hook but which a caller may still see on a hand-built
 * fixture.
 */
export interface MapAssessment {
  /** Infantry steps from deploy to the nearest and farthest objective. */
  readonly approachSteps: DistanceRange;
  /** Infantry steps from deploy to the nearest and farthest edge-spawn zone. */
  readonly edgeSpawnSteps: DistanceRange;
  /** Fewest firing positions any objective has (0 with no objectives). */
  readonly firingPositionsMin: number;
  /** Mean firing positions per objective (0 with none). */
  readonly firingPositionsMean: number;
  /**
   * Share of firing positions that have cover against the objective they
   * shoot, meaned over objectives, in [0, 1].
   */
  readonly coveredFiringShare: number;
  /**
   * Share of firing positions that stand above the objective they shoot,
   * meaned over objectives, in [0, 1]. What the elevation modifier
   * rewards, and 0 on a map whose objectives cannot be looked down on.
   */
  readonly elevatedFiringShare: number;
  /** Mech-reachable tiles as a share of infantry-reachable ones, in [0, 1]. */
  readonly mechReachShare: number;
  /**
   * How many distinct levels infantry can reach from the deploy zones:
   * `1` on a map with no height it can use, more when stairs, ladders and
   * ramps lead somewhere.
   */
  readonly infantryLevelSpan: number;
  /**
   * The same for mechs. `1` says the class fights the whole mission on one
   * level and can never take the elevation modifier — true of every city
   * map, where the plats are graded flat and roofs are infantry-only.
   */
  readonly mechLevelSpan: number;
}

/** Nearest and farthest of a set of walked distances; both `-1` when empty. */
export interface DistanceRange {
  readonly nearest: number;
  readonly farthest: number;
}
