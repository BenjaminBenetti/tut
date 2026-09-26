import type { ArmouredVariantTuning } from "../model/armoured-variant";

// ===========================================
// Default tuning
// ===========================================

/**
 * What each Act III armoured variant adds to its base (campaign arc §8,
 * #1179): the same bug under more plate, with a little more body.
 *
 * ```
 *   base      armour      hp            carbine hit (3 ±25 %, pen 0)
 *   swarmer   0 → 1 (+1)   6 →  7 (+1)   2–4 → 1–3
 *   lurker    1 → 2 (+1)  12 → 14 (+2)   1–3 → 1–2
 *   brute     3 → 5 (+2)  30 → 36 (+6)   1   → 1
 * ```
 *
 * - **Armour is the point.** +1 on the two small species, +2 on the
 *   brute, whose plate is already what a squad's small arms cannot
 *   crack: its variant is the mech's problem, or the armour-piercing
 *   rounds its autopsy unlocks (arc §10.2). One point is a third of a
 *   carbine's hit, which is what a player feels when a swarmer that died
 *   to a burst walks through one.
 * - **A little more hit points**, about a sixth to a fifth of the
 *   base's: enough that the plate is not all that changed, not so much
 *   that the variant is a different species.
 * - **Deltas, not stat blocks.** The variants are derived from the
 *   base blocks (`armouredVariant`), so a retune of a base species
 *   carries to its variant without touching this table.
 */
export const ARMOURED_VARIANT_TUNING: ArmouredVariantTuning = {
  swarmer: { armor: 1, hp: 1 },
  lurker: { armor: 1, hp: 2 },
  brute: { armor: 2, hp: 6 },
};
