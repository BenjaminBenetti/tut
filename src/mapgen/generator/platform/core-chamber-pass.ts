import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../../model/generation-pass";
import type { SporePlatformTuning } from "../../model/spore-platform-tuning";
import { shapeCore } from "./core-shaper";
import { deckColumns, writePlatform } from "./platform-writer";

// ===========================================
// CoreChamberPass
// ===========================================

/**
 * Shapes the spore platform's core chamber (#1179), the first pass of
 * the finale's second stage: the start pad, the one causeway, the round
 * chamber with its rim walkway, terraced berm, lane, arena, dais, core
 * pad, guard posts, wall niches and bug ducts, all over void (see
 * `shapeCore`).
 *
 * ```
 *   core-chamber ─► platform-dressing ─► ramps ─► hooks ─► connectivity
 * ```
 *
 * Like the hull it provides the board's `heightmap`, `water` and
 * `elevation` as well as the `platform` layout, and ignores the biome.
 * There is no drop ship: the squad arrives from stage 1 on the start pad.
 */
export class CoreChamberPass implements GenerationPass {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = "core-chamber";
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

  /** Shapes chambers by `tuning` (`SPORE_PLATFORM_TUNING` in the shipped pipeline). */
  constructor(private readonly tuning: SporePlatformTuning) {}

  // ===========================================
  // Public Methods
  // ===========================================

  /** Shapes the chamber and writes it and its layout to the draft. */
  run(context: GenerationContext): void {
    const { draft, rng, diagnostics } = context;
    const shape = shapeCore(
      { width: draft.width, depth: draft.depth },
      this.tuning,
      rng,
    );
    const layout = writePlatform(draft, shape.raster, "core", shape);
    let niches = 0;
    for (const value of layout.podBeds) niches += value;
    diagnostics.note(
      `spore platform core: ${String(deckColumns(layout))} deck columns, ` +
        `radius ${String(shape.radius)}, ${String(niches / 4)} wall niches`,
    );
  }
}
