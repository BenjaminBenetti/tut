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
 * - **Tunnels: Act III's offers only (`onlyInAct`), the first wave two
 *   turns sooner (turn 1), every wave a tenth larger, spilling a
 *   step.** Since Ben's rule of 2026-09-28 a bug's bite pulls a burning
 *   charge, so the pressure is at the mouths while the fuses burn, and
 *   Act II's shared waves are enough: at 3-turn fuses the new player
 *   wins 27/32 there, the expert, who holds each charge, 31/32. Act
 *   III's force (mechs at 119 hp, squads that cross 18 tiles a turn)
 *   sealed every mouth by turn 3–4, before a bug could reach one:
 *   31/32 and 32/32. Pressed, 20/32 and 30/32 (32 seeds; the runs are
 *   in C2b-2-defence.md §7). A tenth larger is one bug more on Act
 *   III's waves of seven or eight; larger waves, or two steps of
 *   spill, cost the expert its pin (26–28/32), and the first wave only
 *   one turn sooner kept the new player at 26–28 unless the expert
 *   lost its pin too. Keyed on the act the offer was made in, not its
 *   difficulty: Act II's tunnels come at d5–7 and Act III's at d6–9,
 *   so no threshold parts the acts, and d8 up would press 17 of the
 *   39 Act III tunnels the campaign sweep's Average player plays.
 *   Surged waves on every tunnel took act 2 first (at 16 seeds, surge
 *   2: 9/16 and 14/16; surge 3: 8/16 and 13/16).
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
  wreck: { surge: { sizeScale: 3, spillRadius: 3 }, turnsSooner: 1 },
  tunnels: {
    surge: { sizeScale: 1.1, spillRadius: 1 },
    turnsSooner: 2,
    onlyInAct: "act-3",
  },
};
