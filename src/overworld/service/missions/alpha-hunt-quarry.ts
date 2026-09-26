import type { ActId } from "../../../content/model/act-id";
import { ACT_IDS } from "../../../content/model/act-id";
import type { CampaignFlagId } from "../../../content/model/campaign-flag-id";
import type { Rng } from "../../../core/model/rng";
import type { AlphaHuntSpec } from "../../model/alpha-hunt-spec";
import type { CampaignProgress } from "../../model/campaign-progress";
import type { City } from "../../model/city";
import type { Mission } from "../../model/mission";
import type { MissionSite } from "../../model/mission-offer-rule";
import type { Nemesis } from "../../model/nemesis";
import type { NemesisLore } from "../../model/nemesis-lore";
import type { OverworldState } from "../../model/overworld-state";
import type { RegionId } from "../../model/region";
import { hasFlag } from "../campaign-progress-service";
import { hiveInRegion } from "../hive-service";
import { broodmotherNemeses } from "../nemesis-service";
import { citiesWithOffers } from "./mission-offer-builder";

// ===========================================
// Constants
// ===========================================

/**
 * Set once the scripted Broodmother sighting has been played, whatever
 * its outcome (campaign arc §6.8). The ordinary Alpha Hunt offer waits
 * for it.
 */
export const BROODMOTHER_SIGHTED_FLAG: CampaignFlagId = "broodmother-sighted";

/**
 * The act the scripted sighting belongs to. Past it the ordinary hunts
 * are offered whether or not the sighting was ever played, so an Act II
 * that ended before its tenth mission never leaves Act III without them.
 */
export const BROODMOTHER_SIGHTING_ACT: ActId = "act-2";

// ===========================================
// Who is hunted
// ===========================================

/**
 * Whether the ordinary Alpha Hunt may be offered: the sighting has been
 * played, or the campaign has moved past the act it belongs to.
 */
export function sightingPassed(progress: CampaignProgress): boolean {
  return (
    hasFlag(progress, BROODMOTHER_SIGHTED_FLAG) ||
    ACT_IDS.indexOf(progress.act) > ACT_IDS.indexOf(BROODMOTHER_SIGHTING_ACT)
  );
}

/**
 * The cities a Broodmother may be hunted at (campaign arc §6.8): every
 * detected city in a region that holds a hive. With `free`, only those
 * without an offer. Map order.
 */
export function huntingGrounds(
  state: OverworldState,
  free: boolean,
): readonly City[] {
  const occupied = free ? citiesWithOffers(state) : new Set<string>();
  return state.map.cities.filter(
    (city) =>
      city.detected &&
      !occupied.has(city.id) &&
      hiveInRegion(state, city.regionId) !== undefined,
  );
}

/**
 * The Broodmother nemeses a new hunt may be for: every one on the record
 * that no hunt on the board is already after, in record order.
 */
export function huntableNemeses(state: OverworldState): readonly Nemesis[] {
  const hunted = new Set(
    state.missions.flatMap((mission) =>
      mission.alphaHunt?.nemesisId === undefined
        ? []
        : [mission.alphaHunt.nemesisId],
    ),
  );
  return broodmotherNemeses(state.progress).filter(
    (nemesis) => !hunted.has(nemesis.id),
  );
}

/**
 * Where the ordinary hunt may be offered today (arc §6.8), each site
 * weighted 1. A living Broodmother comes first: when a huntable nemesis
 * lives in a region with a free hunting ground, only that region's
 * cities are offered, the oldest nemesis's region first; otherwise every
 * free hunting ground is, and the hunt goes after her there.
 *
 * ```
 *   sighting not passed                      ──► []
 *   grounds = free detected cities in hive regions
 *   first huntable nemesis with grounds in her region ──► those grounds
 *   otherwise                                ──► every ground
 * ```
 */
export function alphaHuntSites(state: OverworldState): readonly MissionSite[] {
  if (!sightingPassed(state.progress)) {
    return [];
  }
  const grounds = huntingGrounds(state, true);
  const lair = huntableNemeses(state).find((nemesis) =>
    grounds.some((city) => city.regionId === nemesis.regionId),
  );
  const sites =
    lair === undefined
      ? grounds
      : grounds.filter((city) => city.regionId === lair.regionId);
  return sites.map((city) => ({ cityId: city.id, weight: 1 }));
}

/**
 * The nemesis a hunt offered in `regionId` is after: the oldest huntable
 * one who lives there, else the oldest huntable one anywhere (she moved),
 * else none, and the hunt is for a Broodmother met for the first time.
 */
export function quarryIn(
  state: OverworldState,
  regionId: RegionId,
): Nemesis | undefined {
  const huntable = huntableNemeses(state);
  return (
    huntable.find((nemesis) => nemesis.regionId === regionId) ?? huntable[0]
  );
}

// ===========================================
// The spec
// ===========================================

/** The spec of a hunt for nemesis `nemesis`: her name, scar, escapes and level. */
export function nemesisQuarry(nemesis: Nemesis): AlphaHuntSpec {
  return {
    nemesisId: nemesis.id,
    name: nemesis.name,
    scar: nemesis.scar,
    scars: nemesis.escapes,
    level: nemesis.level,
  };
}

/**
 * The spec of a hunt for a Broodmother met for the first time: a name
 * drawn from the lore on the stream `rng`, skipping names a living
 * nemesis or a hunt on the board already carries while any are left.
 * One draw.
 */
export function freshQuarry(
  state: OverworldState,
  rng: Rng,
  lore: Pick<NemesisLore, "broodmotherNames">,
): AlphaHuntSpec {
  const taken = new Set([
    ...state.progress.nemeses.map((nemesis) => nemesis.name),
    ...state.missions.flatMap((mission) =>
      mission.alphaHunt === undefined ? [] : [mission.alphaHunt.name],
    ),
  ]);
  const unused = lore.broodmotherNames.filter((name) => !taken.has(name));
  const pool = unused.length > 0 ? unused : lore.broodmotherNames;
  return { name: rng.pick(pool), scars: 0 };
}

/**
 * The fork a hunt's fresh name is drawn on, keyed by the offer's id so
 * the draw neither consumes the offer stream nor repeats across offers.
 */
export function quarryStream(rng: Rng, mission: Pick<Mission, "id">): Rng {
  return rng.fork(`broodmother:${mission.id}`);
}
