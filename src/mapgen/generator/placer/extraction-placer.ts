import type { GenerationContext } from "../../model/generation-pass";
import { HookKinds } from "../../model/hook";
import type { HookPlacer } from "../../model/hook-placer";
import type { HookRequirement } from "../../model/map-recipe";

// ===========================================
// ExtractionPlacer
// ===========================================

/**
 * Sets the extraction hook. Baseline missions extract where they
 * deployed, so the hook shares the first deploy zone's tiles (ADR 0004
 * §4.6). A mission type wanting a separate extraction point declares a
 * different hook kind with its own placer.
 */
export class ExtractionPlacer implements HookPlacer {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = HookKinds.EXTRACTION;
  readonly priority = 20;

  // ===========================================
  // Public Methods
  // ===========================================

  /** Points extraction at the first deploy zone. */
  place(requirement: HookRequirement, context: GenerationContext): void {
    const { draft, diagnostics } = context;
    const deploy = draft.hooks.deployZones[0];
    if (deploy === undefined) {
      diagnostics.note("no deploy zone to extract from");
      return;
    }
    if (requirement.count !== 1) {
      diagnostics.note(`extraction count ${requirement.count} treated as 1`);
    }
    draft.setExtraction(
      deploy.tiles,
      requirement.requiredPass,
      requirement.meta,
    );
  }
}
