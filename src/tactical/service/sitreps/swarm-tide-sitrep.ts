import type { SitrepRule } from "../../model/sitrep-rule";
import type { SwarmTideTuning } from "../../model/sitrep-tuning";
import type { TacticalState } from "../../model/tactical-state";
import { pressEdgeWaves } from "../edge-wave-pressure-service";

// ===========================================
// Swarm Tide
// ===========================================

/**
 * Swarm Tide (campaign arc §11, a hazard): the bugs pour in from the
 * edges early and in numbers. A setup hook only; it changes the edge
 * wave schedule, and the edge wave step does the rest.
 *
 * ```
 *   edgeSpawn.nextTurn ──► max(FIRST_TURN, nextTurn − turnsSooner)     3 → 2
 *   edgeSpawn.surge    ──► { sizeScale, spillRadius }
 *                           every wave ⌈size × 1.5⌉ (2 → 3, 8 → 12),
 *                           standing up to 2 steps past its zone
 *                           a surge the type set already (#1179)
 *                             ──► the larger of each, never less
 * ```
 *
 * The spill is what makes the extra bugs arrive: an edge zone is four
 * to six tiles, and a shipped wave already fills one from difficulty 5.
 * Only the first wave comes sooner; the interval after it is the spawn
 * tuning's, so every later wave comes a turn sooner too, and a defence's
 * wave count is untouched. Offered only on a type with edge waves
 * (`SitrepDefinition.requiredHooks`); on a map whose generator placed
 * none, the step finds no hook and the surge does nothing.
 *
 * No draws, no ids.
 *
 * @param tuning - The size scale, the turns sooner and the spill.
 * @returns The rule for the sitrep table.
 */
export function swarmTideSitrep(tuning: SwarmTideTuning): SitrepRule {
  return {
    id: "swarm-tide",
    setup: (state) => raiseTide(state, tuning),
  };
}

/**
 * Brings the first wave forward and sets the surge on the schedule
 * (`pressEdgeWaves`). A type whose setup presses its waves already
 * (#1179) keeps the larger size scale and the larger spill of the two,
 * so the tide never makes a mission's waves smaller. Exported for tests
 * that check the rule apart from the table.
 *
 * @param state - The mission after its type's setup, the garrison and any earlier sitrep.
 * @param tuning - The size scale, the turns sooner and the spill.
 * @returns The mission with its edge-wave schedule surging.
 */
export function raiseTide(
  state: TacticalState,
  tuning: SwarmTideTuning,
): TacticalState {
  return pressEdgeWaves(state, {
    surge: { sizeScale: tuning.sizeScale, spillRadius: tuning.spillRadius },
    turnsSooner: tuning.turnsSooner,
  });
}
