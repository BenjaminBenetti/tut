import type { Hook, PlacementHooks } from "../model/hook";
import { HookKinds } from "../model/hook";
import type { TileCoord } from "../model/tile-coord";

// ===========================================
// Extraction zones
// ===========================================

/**
 * Where a force can board on a finished map (#1179 C3a round 3): the
 * landing zone (`hooks.extraction`), and any forward extraction points a
 * Great Hive marks among its objectives.
 *
 * ```
 *   hooks.extraction ─────────────────┐
 *                                     ├──► extractionZoneTiles
 *   hooks.objectives (forward-extraction) ┘   (landing tiles first)
 * ```
 */

/** The forward extraction points among a map's hooks, in hook order. */
export function forwardExtractionHooks(
  hooks: Pick<PlacementHooks, "objectives">,
): readonly Hook[] {
  return hooks.objectives.filter(
    (hook) => hook.kind === HookKinds.FORWARD_EXTRACTION,
  );
}

/**
 * Every tile a force can board from: the landing zone's, then each
 * forward point's. A map with no forward point gives the landing zone's
 * tiles alone, in their order.
 */
export function extractionZoneTiles(
  hooks: Pick<PlacementHooks, "objectives" | "extraction">,
): readonly TileCoord[] {
  return [
    ...hooks.extraction.tiles,
    ...forwardExtractionHooks(hooks).flatMap((hook) => hook.tiles),
  ];
}

/** Whether `tile`'s column lies in a forward extraction point. */
export function onForwardExtraction(
  hooks: Pick<PlacementHooks, "objectives">,
  tile: Pick<TileCoord, "x" | "z">,
): boolean {
  return forwardExtractionHooks(hooks).some((hook) =>
    hook.tiles.some((zone) => zone.x === tile.x && zone.z === tile.z),
  );
}
