import type { AutoResolveTuning } from "../model/auto-resolve-tuning";

// ===========================================
// Defaults
// ===========================================

/**
 * Default auto-resolve tuning. Sized against the starter roster: two
 * rifle squads (10 each) and the starter mech (129) make a force of
 * about 150, so with `difficultyScale` 30 the opening force is at even
 * odds on a difficulty 5 mission and near-certain on a skirmish.
 * `winSpread` 40 means being 40 rating ahead or behind is roughly a
 * 3-to-1 fight. Casualties bite hardest on a loss: half the soldiers and
 * a coin-flip's worth of mechs, so an ignored difficulty warning is a
 * memorable mistake (GDD §5.8). Placeholders until the loop (#68) is
 * playable end to end.
 */
export const AUTO_RESOLVE_TUNING: AutoResolveTuning = {
  difficultyScale: 30,
  winSpread: 40,
  damagePenalty: 1,
  extractChance: 0.5,
  casualtyChance: { won: 0.08, extracted: 0.25, lost: 0.5 },
  mechDestructionChance: { won: 0.02, extracted: 0.1, lost: 0.3 },
  mechDamage: {
    won: { min: 5, max: 20 },
    extracted: { min: 15, max: 40 },
    lost: { min: 30, max: 70 },
  },
  extractedRewardFraction: 0.25,
  clearanceBase: 10,
  clearancePerDifficulty: 2,
  lossInfestationPenalty: 5,
};
