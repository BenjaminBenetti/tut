import type { SovereignTuning } from "../model/sovereign-tuning";

// ===========================================
// Default tuning
// ===========================================

/**
 * Shipped numbers (#1179), sized against a finale squad (arc §6.9: the
 * core stage, d8–10, no repairs since the hull):
 *
 * - **A final boss's hit points.** 120 at difficulty 1, 4 more a step:
 *   148 at d8, 156 at d10. A finale mech's heavy weapon (a heavy
 *   autocannon's 26 at pen 3, a thermal lance's 38 at pen 8) pierces
 *   her 2 armour and lands whole; four mechs hitting 70 % of the time
 *   put 70–90 into her a turn if every gun turns on her, so she stands
 *   two turns under the whole squad's fire and three or four while half
 *   of it holds off her guards — and the retreat at 40 % makes the
 *   squad walk after her into the core's ground to finish it.
 * - **Aura: +1 damage within 6 tiles.** Damage rather than armour: the
 *   buff lasts the bug phase, when only bugs attack, so armour would
 *   only ever meet overwatch. +1 is a swarmer's 3 to 4, a third more,
 *   and nothing a mech's plate notices: it is the infantry that feels
 *   her nearby, as the arc asks.
 * - **Two guards every 3 turns** (arc §9, "summon guards"): the
 *   Broodmother's clutch clock, so the two bosses read alike. Armoured
 *   swarmer and lurker, the finale's mix (arc §8, Act III). They are
 *   placed within 6 steps of her and arrive with no action points, as
 *   a hatchling does, so a summons is a threat next turn, not a free
 *   strike this one.
 * - **Back to the core at 40 %** (the brief), later than the
 *   Broodmother's half: she is the last line and fights longer.
 *   Retreating, she settles within 2 tiles of the core and holds there.
 * - **Leashed to the core.** A healthy Sovereign ranges 8 tiles from
 *   the core — the platform core chamber's arena — and each tile past
 *   it costs 10, more than the 3 a strike opportunity earns, so she
 *   never chases the squad out of the chamber.
 * - **Contact first, then the nearest threat to the core.** A tile
 *   from which her scythes touch a visible enemy is worth 3; each tile
 *   between her and the visible enemy nearest the core costs 0.5; and
 *   0.02 a movement point, as the spitter, so she does not wander.
 */
export const SOVEREIGN_TUNING: SovereignTuning = {
  hpBase: 120,
  hpPerDifficulty: 4,
  aura: { radius: 6, damageBonus: 1 },
  summon: {
    interval: 3,
    count: 2,
    radius: 6,
    escort: ["swarmer-armoured", "lurker-armoured"],
  },
  retreatAtHpFraction: 0.4,
  holdRadius: 2,
  leashRadius: 8,
  leashWeight: 10,
  contactWeight: 3,
  focusWeight: 0.5,
  stepWeight: 0.02,
};
