import type { City, CityId } from "../../model/city";
import type { Mission } from "../../model/mission";
import type { MissionPinContext } from "../../model/mission-pin-trigger";
import type { OverworldState } from "../../model/overworld-state";

// ===========================================
// Types
// ===========================================

/**
 * A story rule's own taste in cities: the one it would pin on, from a
 * non-empty list of candidates it has already judged eligible.
 */
export type StoryCityPreference = (cities: readonly City[]) => City | undefined;

// ===========================================
// City choice
// ===========================================

/**
 * The city a story mission is pinned on (ADR 0013 §2.5, #1179): a free
 * candidate if there is one, as always; otherwise a candidate holding an
 * ordinary offer, which the director withdraws for it. Either way the
 * rule's own `prefer` picks among them. A story gate is research only
 * (arc D2), so a board crowded with ordinary offers must not hold the
 * story back; a pinned or triggered offer is never taken.
 *
 * ```
 *   free       = candidates without an offer
 *   claimable  = candidates whose offer ctx.displaceable allows
 *   free non-empty       ──► prefer(free)
 *   claimable non-empty  ──► prefer(claimable)   (that offer is withdrawn)
 *   otherwise            ──► undefined           (asked again tomorrow)
 * ```
 *
 * @param state - The overworld as the story pin trigger sees it.
 * @param ctx - The director's answer to which offers may be taken.
 * @param candidates - The cities the rule would pin on, offer or not.
 * @param prefer - The rule's choice among the free, or the claimable.
 * @returns The city, or undefined when every candidate holds an offer
 *   that cannot be taken.
 */
export function pickStoryCity(
  state: OverworldState,
  ctx: Pick<MissionPinContext, "displaceable">,
  candidates: readonly City[],
  prefer: StoryCityPreference,
): City | undefined {
  const held = offersByCity(state.missions);
  const free = candidates.filter((city) => !held.has(city.id));
  if (free.length > 0) {
    return prefer(free);
  }
  const claimable = candidates.filter((city) => {
    const offer = held.get(city.id);
    return offer !== undefined && ctx.displaceable(offer);
  });
  return claimable.length > 0 ? prefer(claimable) : undefined;
}

// ===========================================
// Helpers
// ===========================================

/** The offer on each city that holds one; a city holds at most one. */
function offersByCity(
  missions: readonly Mission[],
): ReadonlyMap<CityId, Mission> {
  return new Map(missions.map((mission) => [mission.cityId, mission]));
}
