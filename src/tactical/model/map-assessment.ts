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
   * Of the tiles within a unit's sight range of a standing position, the
   * share it has a clear line to, meaned over sampled positions (#596).
   * How much fog of war actually hides: 1 is a map where sight is
   * limited only by range, and a low number is a map with something to
   * hide behind.
   */
  readonly visibleShare: number;
  /**
   * Share of the whole map the deploy zones can see between them before
   * anyone moves — what the player knows at turn 1.
   */
  readonly deployVisibleShare: number;
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

// ===========================================
// Objective approach
// ===========================================

/**
 * How one objective can be got at by each class (#345). Where
 * `MapAssessment.approachSteps` answers "how far is the walk", this
 * answers the question a player actually faces: *can I bring this thing
 * down, and how many turns before I can start*.
 *
 * The distinction that matters is between standing on the objective and
 * shooting it. An egg spawner usually sits inside a building, so a mech
 * — which cannot enter interiors (ADR 0004 §5) — has no route to the
 * tile itself and `mechSteps` is `-1`. That is not a broken map: the
 * mech destroys it with fire from `mechFiringSteps` away, while infantry
 * walks in and plants charges. A map is only unwinnable when *both*
 * firing distances are `-1`.
 *
 * ```
 *   deploy ──walk──► objective tile          infantrySteps / mechSteps
 *   deploy ──walk──► a tile in weapon range  infantryFiringSteps /
 *                    with the sight line     mechFiringSteps
 *                    clear
 * ```
 *
 * All distances are steps under the traversal contract, `-1` for no
 * route.
 */
export interface ObjectiveApproach {
  /** Index of the objective hook this describes, in `map.hooks.objectives` order. */
  readonly objective: number;
  /** Infantry steps from deploy onto the objective tile; charges need this. */
  readonly infantrySteps: number;
  /** Mech steps onto the objective tile. `-1` whenever it sits indoors, which is usual. */
  readonly mechSteps: number;
  /** Infantry steps to the nearest tile it can shoot the objective from. */
  readonly infantryFiringSteps: number;
  /** Mech steps to the nearest tile it can shoot the objective from. */
  readonly mechFiringSteps: number;
}
