import type { BugSpeciesId } from "../../content/model/bug-species-id";

// ===========================================
// Species mix
// ===========================================

/**
 * Relative weights of the species a mission's spawners and edge waves
 * roll (campaign arc §8, ADR 0013 §2.6). Computed by the bestiary when
 * an offer is made, frozen on `Mission.bugMix`, copied to
 * `TacticalState.bugMix` at launch and read by the spawn roll in place
 * of each species' `hatchWeight`.
 *
 * ```
 *   BESTIARY ──bugMixFor(act, missionsInAct)──► SpeciesMix
 *     ──► Mission.bugMix ──► TacticalState.bugMix ──► one weighted roll per bug
 * ```
 *
 * `Partial`: a species with no entry, or a non-positive one, is never
 * rolled. The bestiary's mixes sum to 1, but a reader must not rely on
 * it: the roll renormalises over the species it can build.
 */
export type SpeciesMix = Readonly<Partial<Record<BugSpeciesId, number>>>;
