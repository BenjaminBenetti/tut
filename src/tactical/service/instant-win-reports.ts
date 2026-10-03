import { MISSION_TYPES } from "../../content/data/mission-types";
import { TUNNEL_MOUTH_COUNT } from "../../mapgen/service/missions/tunnel-sabotage-map";
import type { InstantWinReports } from "../../overworld/model/instant-win-report";
import type { MissionStageResult } from "../../overworld/model/mission-result";
import { SPAWN_TUNING } from "../data/spawn-tuning";
import { podHp } from "./spawn-service";
import { LIVE_SPECIMEN_SPECIES } from "./story/live-specimen-setup";

// ===========================================
// The table
// ===========================================

/**
 * What a clean win of each mission type, and of each story mission
 * whose map is about something else, would have reported from the map
 * (#1235): the fields its objectives' `resultFields` write when every
 * objective is done and the force is home. The dev build's instant win
 * lays these over its won result, so every consequence rule and story
 * presentation reads the win it would have read from a played map.
 *
 * ```
 *   infestation-clearance  nothing beyond the outcome
 *   defend-installation    defence { installation, held: true }        Uplink, Launch Window too
 *   crash-site             podDestroyed: true                          the landing erased; First Skyfall too
 *   wreck-recovery         wreck { stripped, every turn worked }
 *   evacuation             every civilian group aboard                 the per-group pay, the city saved
 *   hive-assault           hiveCoreDestroyed: true                     the region liberated; a Great Hive too
 *   tunnel-sabotage        every tunnel mouth sealed                   the spread held
 *   alpha-hunt             broodmotherKilled, not escaped, and killed  the region held, a nemesis ended;
 *                                                                      the Broodmother sighting too
 *   spore-platform         every stage won, in order
 *
 *   story replacing its type's report:
 *   live-specimen          specimenCaptured: the species its setup stands (a lurker)
 *   intact-pod             podRecovered, with the pod's full hit points; never podDestroyed
 * ```
 *
 * Here rather than in the overworld because these are the tactical
 * layer's facts: how many tunnel mouths a sabotage map has, how tough
 * Intact Pod's pod is, which species Live Specimen wants. The
 * composition root hands the table to `InstantWinMissionResolver`.
 */
export const INSTANT_WIN_REPORTS: InstantWinReports = {
  types: {
    "infestation-clearance": () => ({}),
    "defend-installation": (mission) =>
      mission.defence === undefined
        ? {}
        : {
            defence: { installation: mission.defence.installation, held: true },
          },
    "crash-site": () => ({ podDestroyed: true }),
    "wreck-recovery": (mission) =>
      mission.wreck === undefined
        ? {}
        : {
            wreck: {
              stripped: true,
              turnsWorked: mission.wreck.stripTurns,
              turnsNeeded: mission.wreck.stripTurns,
            },
          },
    evacuation: (mission) =>
      mission.evacuation === undefined
        ? {}
        : {
            civiliansRescued: mission.evacuation.groups,
            civiliansTotal: mission.evacuation.groups,
          },
    "hive-assault": () => ({ hiveCoreDestroyed: true }),
    "tunnel-sabotage": () => ({
      tunnelsSealed: TUNNEL_MOUTH_COUNT,
      tunnelsTotal: TUNNEL_MOUTH_COUNT,
    }),
    "alpha-hunt": () => ({
      broodmotherKilled: true,
      broodmotherEscaped: false,
      speciesKilled: ["broodmother"],
    }),
    "spore-platform": (mission) => ({
      stages: stagesWon(MISSION_TYPES[mission.typeId].stages?.length ?? 1),
    }),
  },
  stories: {
    "live-specimen": () => ({ specimenCaptured: LIVE_SPECIMEN_SPECIES }),
    "intact-pod": (mission) => ({
      podRecovered: true,
      podHpLeft: podHp(mission.difficulty, SPAWN_TUNING),
    }),
  },
};

// ===========================================
// Helpers
// ===========================================

/**
 * `count` stages, every one won, in play order. Turn 0: nothing was
 * played, and no presentation reads a stage's turn.
 */
function stagesWon(count: number): readonly MissionStageResult[] {
  return Array.from({ length: count }, (_, index) => ({
    index,
    outcome: "won",
    turns: 0,
  }));
}
