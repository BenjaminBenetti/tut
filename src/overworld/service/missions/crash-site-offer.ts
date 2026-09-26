import type {
  MissionOfferRule,
  MissionSite,
} from "../../model/mission-offer-rule";
import { getCity } from "../earth-map-query-service";
import {
  asCrashSiteOffer,
  crashSiteSites,
  landedCity,
} from "./crash-site-landing";
import { buildOffer } from "./mission-offer-builder";

// ===========================================
// Crash site: offer
// ===========================================

/**
 * How the director offers a crash site (arc §5, §6.3).
 *
 * **Debut:** the third mission of Act I (`missionsInAct: 2`). The second
 * is First Skyfall's slot: the story pins the scripted first crash site
 * once one mission is played, so the generic ones join the pool only
 * after it has had its turn, and an idle campaign never sees a pod.
 *
 * **Eligible:** every city without an offer in a region with at least
 * one detected city, a clean or low city four times as likely as one
 * deep in it, and from Act II a region with an online sensor array
 * twice as likely (`crashSiteSites`).
 *
 * **Created:** the ordinary offer, built on the city as the landing
 * leaves it, with the landing recorded and ×1.5 tech points. The
 * landing itself (+10, and the city seen) is made by the type's
 * consequence rule when the director puts the offer on the board.
 *
 * ```
 *   eligible  region has a detected city ∧ city has no offer ──► { cityId, weight }
 *   create    buildOffer(landedCity(city)) ──► asCrashSiteOffer(city) ──► { crashSite, TP × 1.5 }
 * ```
 */
export const CRASH_SITE_OFFER: MissionOfferRule = {
  kind: "offer",
  typeId: "crash-site",
  debut: { act: "act-1", missionsInAct: 2 },

  /** Free cities in watched regions, weighted towards clean ones and sensor arrays. */
  eligible(state, ctx): readonly MissionSite[] {
    return crashSiteSites(state, ctx.tuning.crashSite);
  },

  /** The crash site at the site's city, carrying the landing it makes. */
  create(state, site, ctx) {
    const city = getCity(state.map, site.cityId);
    const tuning = ctx.tuning.crashSite;
    return asCrashSiteOffer(
      buildOffer(state, landedCity(city, tuning), "crash-site", ctx),
      city,
      tuning,
    );
  },
};
