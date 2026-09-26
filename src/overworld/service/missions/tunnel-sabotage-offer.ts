import type { City } from "../../model/city";
import { MAX_INFESTATION } from "../../model/city";
import type { InfestationTuning } from "../../model/infestation-tuning";
import type { Mission } from "../../model/mission";
import type {
  MissionOfferContext,
  MissionOfferRule,
  MissionSite,
} from "../../model/mission-offer-rule";
import type { OverworldState } from "../../model/overworld-state";
import { findCity, getCity } from "../earth-map-query-service";
import { pausedRegions } from "../growth-pause-service";
import { nextSpreadDay } from "../spread-cooldown-service";
import { buildOffer, citiesWithOffers } from "./mission-offer-builder";

// ===========================================
// Tunnel sabotage: offer
// ===========================================

/**
 * How the director offers a tunnel sabotage (arc §5, §6.7), from the
 * fifth mission of Act II.
 *
 * **Eligible:** a detected city with no offer, at the spread threshold
 * (`spreadThreshold`, 60), that the spread step would let spread when
 * its cooldown ends (a neighbour below the maximum to spread into, its
 * region not under a growth pause), and whose next spread is due within
 * `tuning.tunnelSabotage.spreadWindowDays` (2) days. The window is what
 * makes the spread visible and stoppable: with the 5-day cooldown a city
 * that just spread is eligible on the last two days before it spreads
 * again, so the offer is always about the next spread, and one that has
 * already happened is never on the board.
 *
 * ```
 *   spread on day 20 (cooldown 5) ──► days 21 22: not yet   days 23 24: eligible   day 25: spreads
 * ```
 *
 * **Site weight:** the city's infestation, as the clearance weighs it:
 * the worse city is the likelier target.
 *
 * **Create:** the clearance-scale offer (`buildOffer`), recording the
 * city and its due day, and lapsing on that day: the offer is gone in
 * the same tick the city spreads.
 *
 * ```
 *   eligible  detected ∧ no offer ∧ infestation ≥ spreadThreshold ∧ can spread
 *             ∧ nextSpreadDay − day ≤ spreadWindowDays ──► { cityId, weight: infestation }
 *   create    buildOffer(city) + { tunnelSabotage: { cityId, spreadDueDay }, expiresDay: spreadDueDay }
 * ```
 *
 * Built over the infestation tuning, whose threshold is the spread
 * step's own; the table passes the shipped one.
 *
 * @param spread - Where the spread threshold comes from.
 */
export function createTunnelSabotageOffer(
  spread: Pick<InfestationTuning, "spreadThreshold">,
): MissionOfferRule {
  return {
    kind: "offer",
    typeId: "tunnel-sabotage",
    debut: { act: "act-2", missionsInAct: 5 },

    /** Detected, unoffered cities at the threshold whose spread is due within the window. */
    eligible(state, ctx): readonly MissionSite[] {
      const occupied = citiesWithOffers(state);
      const paused = pausedRegions(state, state.day);
      const window = ctx.tuning.tunnelSabotage.spreadWindowDays;
      return state.map.cities
        .filter(
          (city) =>
            city.detected &&
            !occupied.has(city.id) &&
            city.infestation >= spread.spreadThreshold &&
            !paused.has(city.regionId) &&
            hasRoomToSpread(state, city) &&
            spreadDueDay(state, city) - state.day <= window,
        )
        .map((city) => ({ cityId: city.id, weight: city.infestation }));
    },

    /** The clearance-scale offer at the city, lapsing on the day it spreads. */
    create(state, site, ctx): Mission {
      return createTunnelSabotage(state, site, ctx);
    },
  };
}

// ===========================================
// Helpers
// ===========================================

/** The offer at the site's city, with its spec and its expiry on the due day. */
function createTunnelSabotage(
  state: OverworldState,
  site: MissionSite,
  ctx: MissionOfferContext,
): Mission {
  const city = getCity(state.map, site.cityId);
  const offer = buildOffer(state, city, "tunnel-sabotage", ctx);
  const due = spreadDueDay(state, city);
  return {
    ...offer,
    expiresDay: due,
    tunnelSabotage: { cityId: city.id, spreadDueDay: due },
  };
}

/** The day `city`'s cooldown next lets it spread, read after today's spread step. */
function spreadDueDay(state: OverworldState, city: City): number {
  return nextSpreadDay(state.spreadCooldowns, city.id, state.day);
}

/**
 * Whether `city` has a neighbour the spread step could push into: one
 * below the maximum. A city ringed by full neighbours never spreads, so
 * there is nothing to sabotage.
 */
function hasRoomToSpread(state: OverworldState, city: City): boolean {
  return city.neighbourIds.some((id) => {
    const neighbour = findCity(state.map, id);
    return neighbour !== undefined && neighbour.infestation < MAX_INFESTATION;
  });
}
