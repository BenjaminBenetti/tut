import type { BugSpeciesId } from "../../content/model/bug-species-id";
import { BUG_SPECIES_IDS } from "../../content/model/bug-species-id";
import type {
  InstantWinReport,
  InstantWinReports,
} from "../model/instant-win-report";
import type { Mission } from "../model/mission";
import type { MissionResolver } from "../model/mission-resolver";
import type { MissionResult } from "../model/mission-result";
import type { MissionRewardTuning } from "./mission-reward-service";
import {
  creditsFor,
  infestationDeltaFor,
  partsFor,
  techPointsFor,
} from "./mission-reward-service";

// ===========================================
// Dependencies
// ===========================================

/** What the instant win needs injected. */
export interface InstantWinDeps {
  /**
   * The reward scale both real resolvers pay on (`AUTO_RESOLVE_TUNING`),
   * so an instant win pays what a win on the map pays.
   */
  readonly rewards: MissionRewardTuning;
  /** What a clean win of each mission type, and of each story mission, reports from its map. */
  readonly reports: InstantWinReports;
}

// ===========================================
// InstantWinMissionResolver
// ===========================================

/**
 * The dev build's instant win (#1235): a `MissionResolver` that settles
 * any mission as won, with nobody hurt, so a tester can reach the later
 * missions without playing the earlier ones. The launch handler applies
 * its result exactly as it applies a played one: settle, salvage,
 * casualties, rewards, the type's consequence rule, then the story.
 *
 * ```
 *   outcome            won
 *   casualties         none: no soldier lost, no mech damaged or destroyed
 *   credits / TP / Δ   creditsFor, techPointsFor, infestationDeltaFor ("won")
 *   parts              partsFor ("won"): the offer's parts
 *   the map's report   reports.stories[storyId] ?? reports.types[typeId]
 *   speciesKilled      the offer's bug mix, plus what the report says the
 *                      win killed (an Alpha Hunt's Broodmother)
 * ```
 *
 * It pays the win itself and nothing optional: no tech carcass is
 * harvested and no nest bounty is collected, so the debrief pays what
 * the briefing's Reward and Tech reward rows promised. `objectives` is
 * absent, as it is for the auto-resolver, because no objective was
 * played; every consequence rule then reads the outcome or the type's
 * own field, and both say won.
 *
 * Pure and draws nothing: the `mission:<id>` stream the launch handler
 * forks is left untouched, and who was deployed changes nothing here.
 */
export class InstantWinMissionResolver implements MissionResolver {
  // ===========================================
  // Fields
  // ===========================================

  private readonly deps: InstantWinDeps;

  // ===========================================
  // Construction
  // ===========================================

  /** Resolves on the given reward scale with the given reports. */
  constructor(deps: InstantWinDeps) {
    this.deps = deps;
  }

  // ===========================================
  // MissionResolver
  // ===========================================

  /** `mission`, won cleanly. See the class doc for every field. */
  resolve(mission: Mission): MissionResult {
    const { rewards } = this.deps;
    const { speciesKilled: required = [], ...fields } = reportOf(
      mission,
      this.deps.reports,
    );
    const parts = partsFor("won", mission);
    const killed = speciesKilled(mission, required);
    return {
      missionId: mission.id,
      cityId: mission.cityId,
      outcome: "won",
      squadCasualties: [],
      squadsWiped: [],
      mechsDestroyed: [],
      mechDamage: [],
      creditsAwarded: creditsFor("won", mission, rewards),
      techPointsAwarded: techPointsFor("won", mission, rewards),
      infestationDelta: infestationDeltaFor("won", mission, rewards),
      ...(parts.length > 0 ? { partsAwarded: parts } : {}),
      ...fields,
      ...(killed.length > 0 ? { speciesKilled: killed } : {}),
    };
  }
}

// ===========================================
// Helpers
// ===========================================

/** The story's report when it has one, else the type's (see `InstantWinReports`). */
function reportOf(
  mission: Mission,
  reports: InstantWinReports,
): InstantWinReport {
  const story =
    mission.storyId === undefined ? undefined : reports.stories[mission.storyId];
  return (story ?? reports.types[mission.typeId])(mission);
}

/**
 * Every species a clean win killed, each once, in `BUG_SPECIES_IDS`
 * order: the ones the offer's frozen mix rolls, which the swarm on the
 * map was made of, and the `required` ones the win could not be had
 * without.
 */
function speciesKilled(
  mission: Mission,
  required: readonly BugSpeciesId[],
): readonly BugSpeciesId[] {
  return BUG_SPECIES_IDS.filter(
    (species) =>
      (mission.bugMix?.[species] ?? 0) > 0 || required.includes(species),
  );
}
