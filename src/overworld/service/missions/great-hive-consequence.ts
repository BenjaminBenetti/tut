import { isGreatHiveAssault } from "../../model/hive-assault-spec";
import type { Mission } from "../../model/mission";
import type {
  MissionConsequenceContext,
  MissionConsequenceRule,
} from "../../model/mission-consequence-rule";
import type { MissionResult } from "../../model/mission-result";
import type { OverworldApplied } from "../../model/overworld-domain-event";
import type { OverworldState } from "../../model/overworld-state";
import {
  destroyGreatHive,
  recordGreatHiveDefeat,
  stampGreatHiveAssault,
} from "../great-hive-service";

// ===========================================
// Decorator
// ===========================================

/**
 * `rule` — the Hive Assault consequence — with the Great Hive layer on
 * top (campaign arc §6.9). The ordinary rule runs first and unchanged:
 * the host city's delta, and on a win a `liberateRegion` that finds no
 * ordinary hive by that id and changes nothing. A Great Hive assault
 * then:
 *
 * ```
 *   won      destroyGreatHive     ──► destroyed, continent liberated,
 *                                     GreatHiveDestroyed { N / 3 };
 *                                     the third sets great-hives-destroyed
 *   lost / extracted / abandoned
 *            recordGreatHiveDefeat ──► +1 level (max greatHive.maxLevel),
 *                                     re-pinned after STORY_RETRY_DAYS
 *   lapsed   nothing: the offer is pinned and never lapses
 * ```
 *
 * Either way the Great Hive records the mission as its last assault
 * (`lastAssaultId`), which is how the debrief finds it.
 *
 * An ordinary Hive Assault passes through untouched.
 */
export function withGreatHiveConsequences(
  rule: MissionConsequenceRule,
): MissionConsequenceRule {
  return {
    ...rule,

    /** The ordinary consequence, then the Great Hive's fall or its retry. */
    onResolved(
      state: OverworldState,
      mission: Mission,
      result: MissionResult,
      ctx: MissionConsequenceContext,
    ): OverworldApplied<OverworldState> {
      const played = rule.onResolved(state, mission, result, ctx);
      if (!isGreatHiveAssault(mission) || mission.hive === undefined) {
        return played;
      }
      const hiveId = mission.hive.hiveId;
      if (result.outcome !== "won") {
        return {
          state: stampGreatHiveAssault(
            recordGreatHiveDefeat(
              played.state,
              hiveId,
              state.day,
              ctx.tuning.greatHive,
            ),
            hiveId,
            mission.id,
          ),
          events: played.events,
        };
      }
      const destroyed = destroyGreatHive(
        played.state,
        hiveId,
        state.day,
        ctx.hive,
      );
      return {
        state: stampGreatHiveAssault(destroyed.state, hiveId, mission.id),
        events: [...played.events, ...destroyed.events],
      };
    },
  };
}
