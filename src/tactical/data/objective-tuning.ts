import type { ObjectiveTuning } from "../model/objective-tuning";

// ===========================================
// Defaults
// ===========================================

/**
 * Default objective tuning. Placeholders until M2 is playable end to end
 * (#345 tunes against the auto-resolver):
 *
 * - Charges are planted from an orthogonally adjacent tile, one action a
 *   go, for half a spawner's 20 hit points (`SPAWN_TUNING.spawnerHp`), so
 *   one unit's whole turn beside a spawner destroys it — the "squad's
 *   focused turn" the spawn tuning is written against.
 * - Walking out costs nothing: a unit that spent its turn reaching the
 *   extraction zone still leaves on the same turn.
 */
export const OBJECTIVE_TUNING: ObjectiveTuning = {
  interactApCost: 1,
  interactRange: 1,
  chargeDamage: 10,
  extractApCost: 0,
};
