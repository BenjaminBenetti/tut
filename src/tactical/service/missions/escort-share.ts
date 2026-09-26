import type { SpeciesMix } from "../../../bugs/model/species-mix";
import type { BugSpeciesId } from "../../../content/model/bug-species-id";

// ===========================================
// Escort share
// ===========================================

/**
 * The species mix a boss's ground rolls (campaign arc §8, the finale's
 * "15* escort share"): `share` of every bug drawn from her escort, in
 * equal parts, and the rest from the offer's mix in its own proportions.
 * A species in both gets both parts.
 *
 * ```
 *   mixed[s] = mix[s] × (1 − share) + share / |escort|   (s in escort)
 *   mixed[s] = mix[s] × (1 − share)                        (otherwise)
 * ```
 *
 * The offer's mix already sums to 1 (`bugMixFor` renormalises the
 * finale's 85 over the species debuted), so the result does too. Keys
 * come out in the mix's order, then escort species it lacks in escort
 * order, so the same inputs always roll the same way.
 *
 * Answers `mix` itself when there is nothing to blend: no mix (an offer
 * from before the bestiary, which rolls by hatch weight), no escort, or
 * a share of 0. A share outside `[0, 1]` is clamped into it.
 *
 * @param mix - The offer's species mix.
 * @param escort - The species her escort is drawn from.
 * @param share - The escort's share of every bug, in `[0, 1]`.
 */
export function withEscortShare(
  mix: SpeciesMix | undefined,
  escort: readonly BugSpeciesId[],
  share: number,
): SpeciesMix | undefined {
  const escortShare = Math.min(1, Math.max(0, share));
  if (mix === undefined || escort.length === 0 || escortShare === 0) {
    return mix;
  }
  const mixed: Partial<Record<BugSpeciesId, number>> = {};
  for (const [id, weight] of Object.entries(mix) as [BugSpeciesId, number][]) {
    mixed[id] = weight * (1 - escortShare);
  }
  const each = escortShare / escort.length;
  for (const id of escort) {
    mixed[id] = (mixed[id] ?? 0) + each;
  }
  return mixed;
}
