// ===========================================
// LayerFocus
// ===========================================

/**
 * Which storey of the map the player is looking at (#961).
 *
 * The control steps by **storey**, not by engine layer: ADR 0008 made a
 * layer half a storey, so a layer step would take two presses per floor
 * and stop half way up a wall on the odd one. A half storey is not a
 * place a unit can stand, look from or shoot from, so there is nothing
 * to see there.
 *
 * The view cuts **buildings only** (#1136): the ground, hills, roads and
 * everything else outside a building are drawn at every storey, because
 * hiding the hill a unit stands on removes the world rather than opening
 * it up. There is therefore no cut height here — a building is judged
 * on its own floor numbers, and terrain is never judged at all.
 *
 * The roof is always its own step (#1136): a two-floor building offers
 * three views, and the one below the top is "roof off", which is the
 * only way to look into the top floor.
 *
 * ```
 *   storey 2   ─────────────  the whole map, roofs on
 *   storey 1   ─────────────  floors 0 and 1, every roof off
 *   storey 0   ─────────────  the ground floor alone
 * ```
 */
export interface LayerFocus {
  /** Storey being looked at; `0` is the ground floor, `storeyCount - 1` the roofed top. */
  readonly storey: number;
  /** Views the map offers, at least `1`: one per floor of the tallest building, plus the roof. */
  readonly storeyCount: number;
}
