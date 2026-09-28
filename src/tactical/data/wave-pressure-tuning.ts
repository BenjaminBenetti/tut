import type { WavePressureTuning } from "../model/wave-pressure-tuning";

// ===========================================
// Defaults
// ===========================================

/**
 * The shipped edge wave pressure (#1179, campaign arc D5), measured on
 * the calibration matrix at 16 seeds a cell; the runs are in
 * `docs/design/calibration/C2b-2-defence.md`. On the shared waves a
 * force of eight killed each wave before the next landed, and the new
 * player won all but a handful of these missions in every act.
 *
 * - **Defence: every counted wave 75% larger, spilling two steps.** The
 *   waves already come on the timer; larger ones are what reaches the
 *   generators. More waves did not (one more per 10 infestation points,
 *   up to 10, moved no cell by more than a seed), and a surge of 2 lost
 *   the expert act-3 and Uplink runs to wrecked generators. At 1.75 the
 *   new player wins 12/16 in act 2 and 10/16 in act 3, the expert 15–16.
 * - **Tunnels: every wave three times larger, spilling three steps.**
 *   The charges go in by turn 2 and cannot be pulled, so the pressure
 *   that matters is on the way home. At 3 the new player wins 11/16 in
 *   act 2 (2 took it to 14/16, 2.5 to 13/16); act 3 stays 16/16 at any
 *   surge, as its force always gets someone aboard.
 * - **Wreck: every wave three times larger, spilling three steps, the
 *   first a turn sooner.** Half the new player's wins were home by
 *   turn 7, before the first wave (turn 3) had reached the wreck; the
 *   crash draws the swarm a turn early. At 2 with no earlier wave, act 3 did
 *   not move (16/16); here the new player wins 11/16 in act 2 and 14/16
 *   in act 3, the expert 15 and 14.
 *
 * An edge zone is four to six tiles, so the spill is what lets a
 * surged wave land whole; Swarm Tide on top keeps the larger of each.
 */
export const WAVE_PRESSURE_TUNING: WavePressureTuning = {
  defence: { surge: { sizeScale: 1.75, spillRadius: 2 }, turnsSooner: 0 },
  tunnel: { surge: { sizeScale: 3, spillRadius: 3 }, turnsSooner: 0 },
  wreck: { surge: { sizeScale: 3, spillRadius: 3 }, turnsSooner: 1 },
};
