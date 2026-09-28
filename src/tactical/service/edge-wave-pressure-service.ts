import type { EdgeWavePressure } from "../model/wave-pressure-tuning";
import type { EdgeWaveSurge, TacticalState } from "../model/tactical-state";
import { FIRST_TURN } from "../model/tactical-state";

// ===========================================
// Edge wave pressure
// ===========================================

/**
 * Presses a mission's edge waves harder: the first wave sooner and every
 * wave surging (#1179). What a mission type with its own wave pressure
 * sets at its setup, and what Swarm Tide sets on top of it.
 *
 * ```
 *   edgeSpawn.nextTurn ──► max(FIRST_TURN, nextTurn − turnsSooner)
 *   edgeSpawn.surge    ──► pressure.surge, or with a surge set already
 *                          the larger size scale and the larger spill
 *                          of the two, each on its own
 * ```
 *
 * Pressure only ever adds: a second press never makes a wave smaller
 * or spill less far than the first left it. Only the first wave's turn
 * moves; the spawn tuning's interval brings every later one as much
 * sooner, and a defence's wave count is untouched. No draws, no ids.
 *
 * @param state - The mission whose edge-wave schedule to press.
 * @param pressure - The surge and how many turns sooner the first wave comes.
 * @returns The mission with its schedule pressed; everything else as it was.
 */
export function pressEdgeWaves(
  state: TacticalState,
  pressure: EdgeWavePressure,
): TacticalState {
  return {
    ...state,
    edgeSpawn: {
      ...state.edgeSpawn,
      nextTurn: Math.max(
        FIRST_TURN,
        state.edgeSpawn.nextTurn - pressure.turnsSooner,
      ),
      surge: largerSurge(state.edgeSpawn.surge, pressure.surge),
    },
  };
}

// ===========================================
// Helpers
// ===========================================

/**
 * `added` over whatever surge the schedule has: each of the size scale
 * and the spill at the larger of the two.
 *
 * @param current - The surge already on the schedule, if any.
 * @param added - The surge being pressed on.
 * @returns The surge the schedule carries after the press.
 */
function largerSurge(
  current: EdgeWaveSurge | undefined,
  added: EdgeWaveSurge,
): EdgeWaveSurge {
  if (current === undefined) return added;
  return {
    sizeScale: Math.max(current.sizeScale, added.sizeScale),
    spillRadius: Math.max(current.spillRadius, added.spillRadius),
  };
}
