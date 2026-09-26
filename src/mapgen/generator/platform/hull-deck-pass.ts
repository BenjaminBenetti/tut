import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../../model/generation-pass";
import type { SporePlatformTuning } from "../../model/spore-platform-tuning";
import { shapeHull } from "./hull-shaper";
import { deckColumns, writePlatform } from "./platform-writer";

// ===========================================
// HullDeckPass
// ===========================================

/**
 * Shapes the spore platform's outer hull (#1179), the first pass of the
 * finale's first stage: a deck of terraced chitin plates over void, with
 * the dock plate at the prow, the spine, the docking ring's plaza, the
 * hatch to stage 2, pod beds and a few breaches (see `shapeHull`).
 *
 * ```
 *   hull-deck ─► dropship-sites (prow edge) ─► platform-dressing ─► …
 * ```
 *
 * It is the whole board's relief and ground, so it provides `heightmap`,
 * `water` (space has no shoreline) and `elevation` as well as the
 * `platform` layout; no terrain pass runs before it, and the recipe's
 * biome is not read.
 */
export class HullDeckPass implements GenerationPass {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = "hull-deck";
  readonly requires: readonly DraftCapability[] = [];
  readonly provides: readonly DraftCapability[] = [
    "heightmap",
    "water",
    "elevation",
    "platform",
  ];

  // ===========================================
  // Construction
  // ===========================================

  /** Shapes hulls by `tuning` (`SPORE_PLATFORM_TUNING` in the shipped pipeline). */
  constructor(private readonly tuning: SporePlatformTuning) {}

  // ===========================================
  // Public Methods
  // ===========================================

  /** Shapes the hull and writes it and its layout to the draft. */
  run(context: GenerationContext): void {
    const { draft, rng, diagnostics } = context;
    const raster = shapeHull(
      { width: draft.width, depth: draft.depth },
      this.tuning,
      rng,
    );
    const layout = writePlatform(draft, raster, "hull");
    let beds = 0;
    for (const value of layout.podBeds) beds += value;
    diagnostics.note(
      `spore platform hull: ${String(deckColumns(layout))} deck columns, ` +
        `${String(layout.routes.length)} routes, ${String(layout.pads.length)} pads, ` +
        `${String(beds)} pod-bed columns`,
    );
  }
}
