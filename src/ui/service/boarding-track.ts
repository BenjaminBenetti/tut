import { forwardExtractionHooks } from "../../mapgen/service/extraction-zones";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { StageTrack } from "./stage-track";

// ===========================================
// Constants
// ===========================================

/** The tracker's last step on a map with a forward extraction point. */
export const FORWARD_CLOSING_STEP =
  "board at the forward point or the landing zone";

// ===========================================
// Queries
// ===========================================

/**
 * The objective tracker's closing step for a one-map mission with a
 * forward extraction point (a Great Hive, #1179 C3a round 3), or
 * undefined where the force boards only where it landed. It lists no
 * stages, so the tracker draws none.
 *
 * ```
 *   OBJECTIVES  1 / 1 — board at the forward point or the landing zone
 *   └ ✓ Destroy the hive core
 * ```
 *
 * @param mission - The active mission, if any.
 */
export function boardingTrackOf(
  mission: TacticalState | undefined,
): StageTrack | undefined {
  if (
    mission === undefined ||
    forwardExtractionHooks(mission.map.hooks).length === 0
  ) {
    return undefined;
  }
  return { rows: [], closingStep: FORWARD_CLOSING_STEP };
}
