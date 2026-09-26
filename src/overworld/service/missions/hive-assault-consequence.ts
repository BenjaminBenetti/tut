import type { CampaignFlagId } from "../../../content/model/campaign-flag-id";
import type { CampaignEvent } from "../../model/campaign-event";
import type { Mission } from "../../model/mission";
import type {
  MissionConsequenceContext,
  MissionConsequenceRule,
} from "../../model/mission-consequence-rule";
import type { MissionResult } from "../../model/mission-result";
import type { OverworldApplied } from "../../model/overworld-domain-event";
import type { OverworldState } from "../../model/overworld-state";
import { REGION_LIBERATED } from "../../model/region-liberated-event";
import { addCityInfestation } from "../city-infestation-service";
import { liberateRegion } from "../hive-service";
import { setCampaignFlag } from "../story-service";

// ===========================================
// Constants
// ===========================================

/**
 * The flag the first won Hive Assault earns (arc §4: the hive core
 * sample that reveals Intel II). Set through `setCampaignFlag`, which
 * is idempotent, so only the first win raises `CampaignFlagSet`.
 */
export const HIVE_CORE_SAMPLE_FLAG: CampaignFlagId = "hive-core-sample";

// ===========================================
// Hive assault: consequences
// ===========================================

/**
 * What a Hive Assault does to the overworld (campaign arc §6.5).
 *
 * **Played:** the resolver's `infestationDelta` moves the host city, as
 * for every type (the cut on a win, the loss penalty on a loss, nothing
 * on an extraction), so the debrief's infestation row stays true. A win
 * then liberates the hive's region and, the first time, recovers the
 * hive core sample:
 *
 * ```
 *   played   host + result.infestationDelta, clamped      ──► CityInfestationChanged
 *   won      liberateRegion(hive)                          ──► hive removed,
 *              every city of the region − liberationCut        CityInfestationChanged × n,
 *              growth paused liberationGrowthPauseDays         RegionLiberated
 *            setCampaignFlag("hive-core-sample")           ──► CampaignFlagSet (first win only)
 *   lost / extracted  nothing more: the hive stands, and tomorrow's
 *                     trigger pins a new offer against it at its level
 *   lapsed   nothing: the offer is pinned and never lapses
 * ```
 *
 * A loss costs only the ordinary loss penalty on the host city (5): the
 * hive keeps growing a level a week whether or not it was attacked, so
 * failing already costs the player time.
 *
 * Reads the result generically — its outcome and delta — and imports
 * nothing tactical. A won offer with no `hive` (only a hand-edited save
 * can make one) liberates nothing. A hive already gone (a replayed
 * consequence) liberates nothing and raises no `RegionLiberated`; the
 * flag is idempotent.
 */
export const HIVE_ASSAULT_CONSEQUENCE: MissionConsequenceRule = {
  typeId: "hive-assault",

  /** The host city's delta, then liberation and the sample on a win. */
  onResolved(
    state: OverworldState,
    mission: Mission,
    result: MissionResult,
    ctx: MissionConsequenceContext,
  ): OverworldApplied<OverworldState> {
    const moved = addCityInfestation(
      state,
      mission.cityId,
      result.infestationDelta,
    );
    if (result.outcome !== "won" || mission.hive === undefined) {
      return moved;
    }
    const events: CampaignEvent[] = [...moved.events];
    const liberated = liberateRegion(
      moved.state,
      mission.hive.hiveId,
      state.day,
      ctx.hive,
    );
    events.push(...liberated.events);
    if (liberated.state !== moved.state) {
      events.push({
        type: REGION_LIBERATED,
        payload: {
          hiveId: mission.hive.hiveId,
          regionId: mission.hive.regionId,
          pausedUntilDay: state.day + ctx.hive.liberationGrowthPauseDays + 1,
        },
      });
    }
    const sampled = setCampaignFlag(liberated.state, HIVE_CORE_SAMPLE_FLAG);
    events.push(...sampled.events);
    return { state: sampled.state, events };
  },

  /** Nothing: a hive offer is pinned and never lapses. */
  onExpired(state: OverworldState): OverworldApplied<OverworldState> {
    return { state, events: [] };
  },
};
