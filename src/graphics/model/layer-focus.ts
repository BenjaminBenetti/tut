// ===========================================
// LayerFocus
// ===========================================

/**
 * Which storey of the map the player is looking at (#961), and the cut
 * that produces it.
 *
 * The control steps by **storey**, not by engine layer: ADR 0008 made a
 * layer half a storey, so a layer step would take two presses per floor
 * and stop half way up a wall on the odd one. A half storey is not a
 * place a unit can stand, look from or shoot from, so there is nothing
 * to see there.
 *
 * ```
 *   storey 2   ─────────────  cutLevel undefined — the whole map, roof and all
 *   storey 1   ─────────────  cutLevel ground+3  — floors 0 and 1
 *   storey 0   ─────────────  cutLevel ground+1  — the ground floor alone
 * ```
 */
export interface LayerFocus {
  /** Storey being looked at; `0` is the ground floor. */
  readonly storey: number;
  /** Storeys the map offers, at least `1`. */
  readonly storeyCount: number;
  /**
   * Highest engine layer to draw, or `undefined` to draw everything.
   *
   * The top storey is always `undefined` rather than a number above the
   * roof: "show all of it" is the map's normal appearance, and it must
   * not depend on the arithmetic landing above every piece of art.
   */
  readonly cutLevel: number | undefined;
}
