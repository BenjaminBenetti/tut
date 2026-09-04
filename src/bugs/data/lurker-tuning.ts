import type { LurkerTuning } from "../model/lurker-tuning";

// ===========================================
// Default tuning
// ===========================================

/**
 * Shipped weights: once adjacency is reachable it wins (adjacent plus
 * behind outscores any hidden tile), the behind tile beats the front by
 * the behind weight, and while still approaching the lurker prefers
 * tiles the mark's friends cannot see and stays on the mark's level.
 *
 * `exposureWeight` was set while `exposureScore` read `1` on every tile
 * of the map — it asked for a clear line and never for sight range
 * (#663) — so it was chosen against a constant, which cancels out of
 * the comparison entirely. #676 measured it against the corrected score
 * and found 1.5 changed nothing: the destination was identical from 0 to
 * 3, so the lurker took the short path and GDD §6.4's *"stealthy
 * flanker"* was decorative.
 *
 * #695 asked for it to be raised until concealment outranks closing.
 * **It cannot be, and the value stays at 1.5.** Swept through the real
 * bug phase runner — which refreshes vision between bugs, as the game
 * does — over 12 seeds on generated maps, four turns each:
 *
 * ```
 *   exposureWeight     1.5    3      4      5      6
 *   attacked          2/12   2/12   2/12   0/12   0/12
 *   ended within 2    4/12   4/12   4/12   0/12   0/12
 * ```
 *
 * A cliff, not a curve. At or below 4 nothing changes; at 5 and above
 * the lurker never engages again. There is no value that buys
 * concealment and keeps the unit in the fight.
 *
 * The mechanism is not the weight. Hiding means breaking line of sight,
 * and a bug that cannot see its mark has no mark: `bugView` shows it
 * only what the swarm perceives now, and nothing remembers where an
 * enemy was. So "prefer cover" resolves to "leave", permanently.
 *
 * Two structural facts behind it, both measured. A lurker's move budget
 * is 12 (`move` 6 × `ap` 2) against a `sightRange` of 10, so there is no
 * band where it sees its mark and cannot reach it — no approach phase to
 * be stealthy during. And #685 measured that no generated map has a
 * concealed lane to the squad: 0 % of contact tiles are ever unseen. The
 * concealment is all *away* from the enemy, which is why seeking it
 * means leaving.
 *
 * GDD §6.4's stealthy flanker therefore needs a memory of the mark, or
 * maps with cover on the approaches, before a weight can express it.
 *
 * If you raise this anyway, the test that will tell you is *"keeps
 * vision current as bugs move"* in `bug-phase-runner.test.ts`: it fails
 * because the lurker walks into cover and the swarm loses sight of every
 * squad. That is the behaviour, not a fixture problem — resist the urge
 * to move the bug closer until it passes.
 */
export const LURKER_TUNING: LurkerTuning = {
  flankWeight: 3,
  behindWeight: 2,
  adjacentWeight: 2.5,
  exposureWeight: 1.5,
  levelWeight: 0.5,
  approachWeight: 2,
  isolationRadius: 3,
  isolationWeight: 1.5,
  approachHorizon: 12,
};
