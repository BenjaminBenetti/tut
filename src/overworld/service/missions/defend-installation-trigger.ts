import { INSTALLATION_SITES } from "../../../content/data/installation-sites";
import type { City, CityId } from "../../model/city";
import { MAX_INFESTATION } from "../../model/city";
import type { Deployable } from "../../model/deployable";
import type {
  InstallationDefence,
  Mission,
  MissionId,
} from "../../model/mission";
import type {
  MissionOfferContext,
  MissionTriggerRule,
} from "../../model/mission-offer-rule";
import type {
  InstallationDefenceTuning,
  OfferChanceCurve,
} from "../../model/mission-tuning";
import type { OverworldState } from "../../model/overworld-state";
import type { Region } from "../../model/region";
import { regionInfestation } from "../threat-service";
import { buildOffer, citiesWithOffers } from "./mission-offer-builder";

// ===========================================
// Formulae
// ===========================================

/**
 * Daily chance of an offer at `infestation` on `curve`: `0` below
 * `minInfestation`, then linear from `chanceAtThreshold` up to
 * `chanceAtMax` at `MAX_INFESTATION`.
 */
export function offerChance(
  infestation: number,
  curve: OfferChanceCurve,
): number {
  if (infestation < curve.minInfestation) {
    return 0;
  }
  const span = MAX_INFESTATION - curve.minInfestation;
  const progress = span === 0 ? 1 : (infestation - curve.minInfestation) / span;
  return (
    curve.chanceAtThreshold +
    (curve.chanceAtMax - curve.chanceAtThreshold) * progress
  );
}

/**
 * Waves a defend-installation mission sends (#1175) for a region whose
 * mean infestation is `infestation`: `baseWaves` plus one per
 * `1 / wavesPerInfestationPoint` points, floored, capped at `maxWaves`
 * and never below one.
 */
export function wavesFor(
  infestation: number,
  tuning: InstallationDefenceTuning,
): number {
  const raw =
    tuning.baseWaves +
    Math.floor(tuning.wavesPerInfestationPoint * infestation);
  return Math.max(1, Math.min(tuning.maxWaves, raw));
}

// ===========================================
// Defend installation: trigger
// ===========================================

/**
 * How a defend-installation mission is offered (#1175, arc §5): an event
 * offer, outside the board cap. Every region is visited in map order;
 * one holding a built installation rolls `offerChance` against its mean
 * infestation (from 40), and a success attaches the mission to the
 * region's most infested detected city that has no offer. A region
 * without an installation, or with no free city, draws nothing.
 *
 * ```
 *   for region in map.regions (has a deployable):
 *     host = most infested detected free city in the region, or skip
 *     p = offerChance(regionInfestation, tuning.defence.offer)
 *     p > 0 and rng.chance(p) ──► buildOffer(host, "defend-installation") + defence
 *                                  └─ rng.fork(`defence:${id}`) ──► which installation
 * ```
 *
 * The offer is not `pinned`: it lapses on its `expiresDay` like any
 * other, and it is outside the cap because this is a trigger rule.
 */
export const DEFEND_INSTALLATION_TRIGGER: MissionTriggerRule = {
  kind: "trigger",
  typeId: "defend-installation",

  /** Today's defend offers, at most one per region. */
  trigger(state, ctx): readonly Mission[] {
    const occupied = citiesWithOffers(state);
    const offered: Mission[] = [];
    for (const region of state.map.regions) {
      const installations = state.deployables.filter(
        (deployable) => deployable.regionId === region.id,
      );
      if (installations.length === 0) {
        continue;
      }
      const infestation = regionInfestation(state.map, region.id);
      const chance = offerChance(infestation, ctx.tuning.defence.offer);
      const host = hostCityFor(state, region, occupied);
      if (chance <= 0 || host === undefined || !ctx.rng.chance(chance)) {
        continue;
      }
      const mission = buildOffer(state, host, "defend-installation", ctx);
      offered.push({
        ...mission,
        defence: defenceFor(mission.id, installations, infestation, ctx),
      });
      occupied.add(host.id);
    }
    return offered;
  },
};

// ===========================================
// Helpers
// ===========================================

/**
 * The city a defend offer attaches to: the most infested detected city
 * in the region that has no offer, existing or made today; ties keep
 * region order. Undefined when every city is taken or undetected.
 */
function hostCityFor(
  state: OverworldState,
  region: Region,
  occupied: ReadonlySet<CityId>,
): City | undefined {
  let host: City | undefined;
  for (const cityId of region.cityIds) {
    const city = state.map.cities.find((candidate) => candidate.id === cityId);
    if (city === undefined || !city.detected || occupied.has(city.id)) {
      continue;
    }
    if (host === undefined || city.infestation > host.infestation) {
      host = city;
    }
  }
  return host;
}

/**
 * What a defend offer holds: one of the region's installations, drawn
 * on a fork keyed by the mission id so the choice consumes nothing from
 * the trigger's stream, the generators its site stands, and the waves
 * the region's infestation earns.
 */
function defenceFor(
  id: MissionId,
  installations: readonly Deployable[],
  infestation: number,
  ctx: MissionOfferContext,
): InstallationDefence {
  const target = ctx.rng.fork(`defence:${id}`).pick(installations);
  return {
    installation: target.typeId,
    deployableId: target.id,
    generators: INSTALLATION_SITES[target.typeId].generators,
    waves: wavesFor(infestation, ctx.tuning.defence),
  };
}
