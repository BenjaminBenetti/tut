import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../model/generation-pass";
import type { HookPlacer } from "../model/hook-placer";
import type { HookRequirement } from "../model/map-recipe";

// ===========================================
// Types
// ===========================================

/** A requirement paired with its placer and recipe position. */
interface Job {
  readonly requirement: HookRequirement;
  readonly placer: HookPlacer;
  readonly position: number;
}

// ===========================================
// HookPass
// ===========================================

/**
 * Pass 8 of the settlement archetype (ADR 0004 §7.3, §7.4). Resolves each
 * of the recipe's hook requirements to a placer from the registry, runs
 * them by placer priority (deploy zones first, then everything that is
 * placed relative to them), each on its own RNG fork. An unknown hook
 * kind throws with the kind in the message.
 */
export class HookPass implements GenerationPass {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = "hooks";
  readonly requires: readonly DraftCapability[] = ["ramps"];
  readonly provides: readonly DraftCapability[] = ["hooks"];

  // ===========================================
  // Public Methods
  // ===========================================

  /** Runs every requirement's placer in priority order. */
  run(context: GenerationContext): void {
    const { params, registries, rng, diagnostics } = context;
    const jobs: Job[] = params.hooks.map((requirement, position) => ({
      requirement,
      placer: registries.hookPlacers.get(requirement.kind),
      position,
    }));
    jobs.sort(
      (a, b) =>
        a.placer.priority - b.placer.priority || a.position - b.position,
    );
    for (const job of jobs) {
      job.placer.place(job.requirement, {
        ...context,
        rng: rng.fork(`${job.requirement.kind}-${job.position}`),
      });
    }
    const hooks = context.draft.hooks;
    diagnostics.note(
      `${hooks.deployZones.length} deploy, ${hooks.objectives.length} objectives, ` +
        `${hooks.edgeSpawns.length} edge spawns, ` +
        `extraction ${hooks.extraction === undefined ? "missing" : "set"}`,
    );
  }
}
