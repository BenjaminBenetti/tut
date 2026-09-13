import type { ModelManifest } from "../model/asset-manifest";
import { MODEL_MANIFEST } from "../data/model-manifest";

// ===========================================
// Authored footprint
// ===========================================

/**
 * Tiles per side a unit model was authored to (#1134): the larger side
 * of its manifest footprint, so a unit whose tactical footprint matches
 * the art (the brute, built low and wide over its own four tiles) is
 * drawn at unit scale, and one whose art is a one-tile box is scaled up
 * to its footprint as before.
 *
 * ```
 *   tactical footprint 2, model authored 1×1  ──► scale 2   (old brute)
 *   tactical footprint 2, model authored 2×2  ──► scale 1   (#1134 brute)
 *   tactical footprint 1, model authored 1×1  ──► scale 1   (everyone else)
 * ```
 *
 * @param modelId - The registered model, or undefined for an assembled
 *   mech, which is authored to one tile.
 * @param manifest - The model registry; the shipped one by default.
 * @returns Tiles per side, at least one.
 */
export function authoredFootprint(
  modelId: string | undefined,
  manifest: ModelManifest = MODEL_MANIFEST,
): number {
  if (modelId === undefined || !Object.hasOwn(manifest, modelId)) {
    return 1;
  }
  const { w, d } = manifest[modelId as keyof ModelManifest].footprint;
  return Math.max(1, w, d);
}
