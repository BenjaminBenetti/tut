import type { BurrowTuning } from "../model/burrow-tuning";

// ===========================================
// Defaults
// ===========================================

/**
 * Default burrow tuning (#1179). Placeholders until burrowers have been
 * played with:
 *
 * - Coming up costs one action of two. A burrower that tunnels in from
 *   afar spends one action digging and one surfacing, so it bites the
 *   phase after — the squad sees it come up and gets its turn to
 *   answer. One that lay in wait beside a squad surfaces and bites in
 *   the same phase: the ambush is earned by a turn spent waiting, and
 *   the squad can spoil it by moving.
 * - Going back down costs one action, so a burrower that dives can
 *   still tunnel one move away in the same phase.
 * - A two-turn cooldown keeps it on the surface for at least one whole
 *   bug phase after it comes up: it cannot surface, bite and vanish
 *   before the squad has had two turns to shoot at it.
 */
export const BURROW_TUNING: BurrowTuning = {
  surfaceApCost: 1,
  burrowApCost: 1,
  reburrowCooldownTurns: 2,
};
