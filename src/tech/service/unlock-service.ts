import type { Result } from "../../core/model/result";
import { err, ok } from "../../core/model/result";
import type { EconomyState } from "../../economy/model/economy-state";
import type { TechPointService } from "../../economy/model/tech-point-service";
import type { TechCatalogue } from "../model/tech-catalogue";
import type { TechError } from "../model/tech-error";
import type { TechApplied } from "../model/tech-event";
import { TECH_UNLOCKED } from "../model/tech-event";
import type { TechNodeId } from "../model/tech-node";
import type { TechState } from "../model/tech-state";

// ===========================================
// Types
// ===========================================

/** What the unlock service needs injected. */
export interface UnlockServiceDeps {
  readonly catalogue: TechCatalogue;
  /** The one door tech points move through. */
  readonly techPoints: TechPointService;
}

/** The two slices an unlock reads and returns. */
export interface TechSlices {
  readonly tech: TechState;
  readonly economy: EconomyState;
}

/** An unlock's outcome: the new slices and events, or a typed rejection with nothing changed. */
export type TechResult = Result<TechApplied, TechError>;

// ===========================================
// Unlock
// ===========================================

/**
 * Buys one node of the tree for tech points (GDD §5.5.1). Pure: reads
 * only its arguments.
 *
 * ```
 *   nodeId ──► known? ──► not yet bought? ──► prerequisites bought? ──► affordable? ──► TechUnlocked
 *                │              │                     │                      │
 *          unknown-tech  tech-already-unlocked  tech-prerequisite-locked  insufficient-tech-points
 * ```
 */
export function unlockTech(
  slices: TechSlices,
  nodeId: TechNodeId,
  day: number,
  deps: UnlockServiceDeps,
): TechResult {
  const node = deps.catalogue.getNode(nodeId);
  if (node === undefined) {
    return err({ code: "unknown-tech", nodeId });
  }
  if (slices.tech.unlocked.includes(nodeId)) {
    return err({ code: "tech-already-unlocked", nodeId });
  }
  const missing = node.requires.filter(
    (required) => !slices.tech.unlocked.includes(required),
  );
  if (missing.length > 0) {
    return err({ code: "tech-prerequisite-locked", nodeId, missing });
  }
  const paid = deps.techPoints.spend(slices.economy, node.cost, nodeId, day);
  if (!paid.ok) {
    return err({
      code: "insufficient-tech-points",
      nodeId,
      required: paid.error.required,
      available: paid.error.available,
    });
  }
  return ok({
    tech: { unlocked: [...slices.tech.unlocked, nodeId] },
    economy: paid.value.state,
    events: [
      ...paid.value.events,
      {
        type: TECH_UNLOCKED,
        payload: { nodeId, cost: node.cost, parts: node.unlocks },
      },
    ],
  });
}
