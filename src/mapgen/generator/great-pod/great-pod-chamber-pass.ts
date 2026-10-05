import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../../model/generation-pass";
import type { GreatPodChamber } from "../../model/great-pod-layout";
import { HookKinds } from "../../model/hook";
import { PassMask } from "../../model/pass-mask";

// ===========================================
// GreatPodChamberPass
// ===========================================

/**
 * Marks where the great pod's broods sleep (#1238): one `brood-chamber`
 * hook per chamber of the pod's plan, the hive cavern's hook kind, so
 * the mission stocks them with the cavern's own brood placement.
 *
 * ```
 *   chamber (route | side | core) ──► brood-chamber hook on its centre,
 *     requiredPass NONE (sealed until a breach),
 *     meta { chamberId, role, radius, label: "pod's <name> chamber" }
 * ```
 *
 * The core chamber's hook sits on the middle of the core, which the core
 * hook also covers: its brood's wake zone is centred on the core, and
 * brood placement never puts a bug on another hook's tile, so the core's
 * square stays free for the core.
 */
export class GreatPodChamberPass implements GenerationPass {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = "great-pod-chambers";
  readonly requires: readonly DraftCapability[] = ["hooks"];
  readonly provides: readonly DraftCapability[] = [];

  // ===========================================
  // Public Methods
  // ===========================================

  /** Adds one brood-chamber hook per chamber of the pod. */
  run(context: GenerationContext): void {
    const { draft, diagnostics } = context;
    const pod = draft.greatPod;
    if (pod === undefined) {
      diagnostics.note("no great pod: its chambers skipped");
      return;
    }
    for (const chamber of pod.chambers) {
      draft.addHook(
        "objectives",
        HookKinds.BROOD_CHAMBER,
        [draft.groundCoord(chamber.centre.x, chamber.centre.z)],
        PassMask.NONE,
        {
          chamberId: chamber.id,
          role: chamber.role,
          radius: chamber.radius,
          label: labelOf(chamber),
        },
      );
    }
    diagnostics.note(`${String(pod.chambers.length)} pod chambers`);
  }
}

// ===========================================
// Helpers
// ===========================================

/** What the log calls the chamber: `pod's core chamber`, `pod's north chamber`. */
function labelOf(chamber: GreatPodChamber): string {
  return `pod's ${chamber.id.replace(/^pod-/, "")} chamber`;
}
