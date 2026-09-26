import type { Mission } from "../../model/mission";
import type {
  MissionDebut,
  MissionOfferContext,
  MissionOfferRule,
  MissionSite,
} from "../../model/mission-offer-rule";
import type { NemesisLore } from "../../model/nemesis-lore";
import type { OverworldState } from "../../model/overworld-state";
import { getCity } from "../earth-map-query-service";
import {
  alphaHuntSites,
  freshQuarry,
  nemesisQuarry,
  quarryIn,
  quarryStream,
} from "./alpha-hunt-quarry";
import {
  buildOfferAtDifficulty,
  clampToBand,
  difficultyFor,
} from "./mission-offer-builder";

// ===========================================
// Constants
// ===========================================

/**
 * When the ordinary Alpha Hunt joins the director's pool (campaign arc
 * §3: "the Broodmother and Alpha Hunt about 10 missions in" to Act II).
 * The same count opens the scripted sighting, which Pod Telemetry can
 * bring forward (`isSightingDue`), and the ordinary hunts then wait for
 * it (`sightingPassed`).
 */
export const ALPHA_HUNT_DEBUT: MissionDebut = {
  act: "act-2",
  missionsInAct: 10,
};

// ===========================================
// Alpha hunt: offer
// ===========================================

/**
 * How the director offers an Alpha Hunt (campaign arc §5, §6.8).
 *
 * **Debut:** ten missions into Act II, and only once the scripted
 * Broodmother sighting (a story mission on this type) has been played,
 * or the campaign is past Act II.
 *
 * **Eligible:** every detected city without an offer in a region holding
 * a hive. A living Broodmother nemesis comes first: while one lives in a
 * region with such a city, only her region's cities are offered
 * (`alphaHuntSites`).
 *
 * **Created:** the ordinary offer at the city. A hunt for a nemesis (she
 * lives in the site's region, or failing that anywhere) carries her
 * name, scar and escapes, at one more difficulty per level, clamped
 * into the act's band; her escapes become her scars, which
 * `broodmotherHp` turns into +25% hit points each at setup. Otherwise
 * she is met for the first time, and a name is drawn from the lore.
 *
 * ```
 *   eligible  sighting passed ∧ detected ∧ free ∧ hive in region ──► { cityId, weight 1 }
 *             a nemesis's region among them? ──► only that region
 *   create    d = clamp(ordinary d + (nemesis level ?? 0)) ──► buildOfferAtDifficulty(d)
 *             nemesis? + { nemesisId, name, scar, scars: escapes, level }
 *             fresh?   + { name: pick(lore) on fork "broodmother:<id>", scars 0 }
 * ```
 *
 * Either way the offer draws what `buildOffer` draws from `ctx` (one id,
 * one map seed), so the board stream does not care which she is; a
 * fresh offer is exactly `buildOffer`'s. A fresh name is drawn on a
 * fork keyed by the offer's id, never from the offer stream.
 *
 * @param lore - The names a fresh Broodmother may take.
 * @returns The rule for `MISSION_OFFER_RULES["alpha-hunt"]`.
 */
export function createAlphaHuntOffer(
  lore: Pick<NemesisLore, "broodmotherNames">,
): MissionOfferRule {
  return {
    kind: "offer",
    typeId: "alpha-hunt",
    debut: ALPHA_HUNT_DEBUT,

    /** Free detected cities in hive regions; a living nemesis's region first. */
    eligible(state: OverworldState): readonly MissionSite[] {
      return alphaHuntSites(state);
    },

    /** The hunt at the site's city: for a nemesis if one lives, else a fresh Broodmother. */
    create(
      state: OverworldState,
      site: MissionSite,
      ctx: MissionOfferContext,
    ): Mission {
      const city = getCity(state.map, site.cityId);
      const nemesis = quarryIn(state, city.regionId);
      const band = ctx.act.difficultyBand;
      const ordinary = clampToBand(
        difficultyFor(
          city.infestation,
          state.threat,
          ctx.missionTypes["alpha-hunt"],
          ctx.tuning.difficulty["alpha-hunt"],
        ),
        band,
      );
      const difficulty = clampToBand(ordinary + (nemesis?.level ?? 0), band);
      const offer = buildOfferAtDifficulty(
        state,
        city,
        "alpha-hunt",
        difficulty,
        ctx,
      );
      return {
        ...offer,
        alphaHunt:
          nemesis === undefined
            ? freshQuarry(state, quarryStream(ctx.rng, offer), lore)
            : nemesisQuarry(nemesis),
      };
    },
  };
}
