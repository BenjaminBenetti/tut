import type { ModelAssetId } from "../../content/data/model-ids";

// ===========================================
// Constants
// ===========================================

/**
 * Model id prefixes whose batches take the wall cutaway (style guide
 * §12.4): everything a building is made of, the props that sit on its
 * roof, and the drop ship (#1179). Selected by model id rather than by
 * category because the `tiles` category carries both a building's slabs
 * and the ground, and the ground must never fade: opening a hole in the
 * map would be worse than the wall it was trying to see past.
 *
 * The drop ship is a hull 5 × 7 tiles and 3.5 u tall. A Great Hive's
 * forward ship is scenery that blocks no tile, so a squad or a bug can
 * stand under it; a unit can stand behind either ship. The hull gives
 * way around them as a wall does.
 *
 * ```
 *   camera ──► ╭──────────╮ hull   ◄── fades on the rays to the unit
 *              │   ◉      │ unit       under it or behind it
 *   ───────────┴──────────┴──── floor ◄── solid
 * ```
 */
export const GHOSTED_MODEL_PREFIXES: readonly string[] = [
  "building.",
  "prop.rooftop-",
  "tdf.dropship",
];

/**
 * The building's slabs: the floors and stairs a unit stands on, and the
 * roofs that cap them. They never take the cutaway, however they sit
 * between the camera and a unit (#1143).
 *
 * The Executive Director found a unit's reachable tiles unreadable when
 * the storey it was climbing to faded around it, and the storey cut
 * already lets the player remove any floor above by hand. Roofs went
 * solid in the same round: once the floor beneath a roof held, a roof
 * that still faded opened a circle onto nothing but that floor, an
 * awkward window that showed no unit. A slab of any kind is therefore
 * either drawn whole or removed by the storey cut, which the player
 * controls. Walls, parapets and rooftop dressing keep fading, since they
 * are what stands between the camera and a unit on the same storey.
 *
 * ```
 *   camera ──► ┌───────┐ roof   ◄── solid   (cut it with the storey control)
 *              │ ▓▓▓▓▓ │ wall        fades   (hides the unit)
 *              ├───────┤ floor  ◄── solid   (the unit's reachable tiles)
 *              │ ▓▓▓▓▓ │ stairs ◄── solid   (the tiles it climbs)
 * ```
 */
export const GHOST_SOLID_MODELS: ReadonlySet<ModelAssetId> =
  new Set<ModelAssetId>([
    "building.floor",
    "building.stairs",
    "building.roof",
    "building.roof-pitched",
    "building.roof-hipped",
  ]);

// ===========================================
// Predicate
// ===========================================

/**
 * Whether a placed model's batch is given a ghost-cutaway material.
 *
 * Walls, parapets, frontage dressing, rooftop props and the drop ship
 * between the camera and a unit fade (#526, #1179); floor slabs, stairs
 * and roofs stay solid so the tiles a unit can move to read through the
 * cutaway and a roof never opens a window onto a solid floor (#1143);
 * ground, terrain, roads and every other model never fades.
 *
 * @param modelId - The batch's model id.
 * @returns `true` when the batch should carry the cutaway shader.
 */
export function takesGhostCutaway(modelId: string): boolean {
  if (GHOST_SOLID_MODELS.has(modelId as ModelAssetId)) return false;
  return GHOSTED_MODEL_PREFIXES.some((prefix) => modelId.startsWith(prefix));
}
