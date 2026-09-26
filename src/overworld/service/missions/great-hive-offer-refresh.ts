import { findGreatHive, isGreatHiveStanding } from "../../model/great-hive";
import { isGreatHiveAssault } from "../../model/hive-assault-spec";
import type { Mission } from "../../model/mission";
import type {
  MissionOfferContext,
  MissionTriggerRule,
} from "../../model/mission-offer-rule";
import type { OverworldState } from "../../model/overworld-state";

// ===========================================
// Decorator
// ===========================================

/**
 * `rule` — the Hive Assault trigger — with its daily `refresh` kept off
 * the Great Hive offers. The ordinary refresh re-levels an offer from
 * its hive's age and withdraws one whose hive is not in `hives`; a
 * Great Hive is in neither sense an ordinary hive, so its offer would be
 * withdrawn the day after it was pinned.
 *
 * ```
 *   refresh(mission):
 *     ordinary Hive Assault ──► rule.refresh(mission)       (unchanged)
 *     Great Hive assault    ──► its Great Hive stands? ──► the offer itself
 *                                                 no ──► withdrawn
 * ```
 *
 * The Great Hive offer is not re-priced: its difficulty is fixed, and
 * its level moves only when an assault is lost, which removes the offer
 * and pins a fresh one after the retry delay.
 */
export function withGreatHiveRefresh(
  rule: MissionTriggerRule,
): MissionTriggerRule {
  return {
    ...rule,

    /** The ordinary refresh, or the Great Hive offer kept while its hive stands. */
    refresh(
      mission: Mission,
      state: OverworldState,
      ctx: MissionOfferContext,
    ): Mission | undefined {
      if (!isGreatHiveAssault(mission) || mission.hive === undefined) {
        return rule.refresh === undefined
          ? mission
          : rule.refresh(mission, state, ctx);
      }
      const hive = findGreatHive(state, mission.hive.hiveId);
      return hive !== undefined && isGreatHiveStanding(hive)
        ? mission
        : undefined;
    },
  };
}
