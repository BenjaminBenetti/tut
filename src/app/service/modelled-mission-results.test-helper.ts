import type { BugSpeciesId } from "../../content/model/bug-species-id";
import { BUG_SPECIES_IDS } from "../../content/model/bug-species-id";
import type { MissionTypeId } from "../../content/model/mission-type-id";
import type { StoryMissionId } from "../../content/model/story-mission-id";
import type { Mission } from "../../overworld/model/mission";
import type {
  MissionOutcome,
  MissionResult,
} from "../../overworld/model/mission-result";
import { RESCUE_OBJECTIVE_KIND } from "../../overworld/service/missions/evacuation-consequence";
import type { MissionRewardTuning } from "../../overworld/service/mission-reward-service";
import {
  creditsFor,
  infestationDeltaFor,
  partsFor,
  techPointsFor,
} from "../../overworld/service/mission-reward-service";
import type { SalvageRichTuning } from "../../tactical/model/sitrep-tuning";
import { LIVE_SPECIMEN_SPECIES } from "../../tactical/service/story/live-specimen-setup";

// ===========================================
// Types
// ===========================================

/**
 * What a modelled result reads beyond the mission and its outcome: the
 * reward scale both real resolvers pay on, and what the modelled squads
 * did on the map besides the objective.
 */
export interface ModelledResultContext {
  /**
   * The reward and penalty scale (`AUTO_RESOLVE_TUNING`), the one the
   * tactical resolver and the auto-resolver both pay on, so a modelled
   * win pays what a played win pays.
   */
  readonly rewards: MissionRewardTuning;
  /**
   * Whether the squads stripped every tech carcass on the map (#1171).
   * A harvest comes home on a win or an extraction and is lost with a
   * loss, as `techPointsFor` rules for the tactical resolver.
   */
  readonly harvested: boolean;
  /** The extra carcasses a Salvage Rich sitrep lays, and their price (arc §11). */
  readonly salvage: Pick<
    SalvageRichTuning,
    "carcasses" | "basePoints" | "pointsPerDifficulty"
  >;
}

/**
 * Builds the `MissionResult` a mission of one type would have come home
 * with, had it been played to `outcome`: the shared rewards, the type's
 * own fields (a crash site's `podDestroyed`, a defence's `defence`), and
 * the species fought. Pure; rolls nothing. The launch handler applies it
 * exactly as it applies a played result: settle, casualties, rewards,
 * the type's consequence rule, then the story.
 */
export type ModelledResultBuilder = (
  mission: Mission,
  outcome: MissionOutcome,
  ctx: ModelledResultContext,
) => MissionResult;

/**
 * The fields one story mission adds on top of its type's modelled
 * result (Live Specimen's `specimenCaptured`), or none.
 */
export type ModelledStoryFields = (
  mission: Mission,
  outcome: MissionOutcome,
) => Partial<MissionResult>;

/** Every modelled builder, keyed by mission type; closed, so a new type must add its row. */
export type ModelledResultBuilders = Readonly<
  Record<MissionTypeId, ModelledResultBuilder>
>;

/** The story missions whose results carry fields of their own; open, since most carry none. */
export type ModelledStoryResults = Readonly<
  Partial<Record<StoryMissionId, ModelledStoryFields>>
>;

// ===========================================
// The tables
// ===========================================

/**
 * One modelled result per mission type (campaign arc §12). A
 * `Record` over the closed `MissionTypeId` union, so a type added to
 * the game without a row here fails to compile: every mission-type
 * package adds its row, the way it adds one to every ADR 0013 table.
 *
 * ```
 *   infestation-clearance  shared rewards only
 *   defend-installation    defence { installation, held = won }
 *   crash-site             podDestroyed = won
 *   wreck-recovery         wreck { stripped = won, turns }; the parts come with partsFor
 *   evacuation             civiliansRescued / civiliansTotal and the rescue objective row:
 *                          won all groups, extracted one short of half, lost none
 *   hive-assault           hiveCoreDestroyed = won; its placed Hive Guard killed on a win
 * ```
 *
 * "Extracted" is modelled as pulling out before the objective was done,
 * the way the tactical rules score it: the pod left standing, the
 * installation abandoned, too few civilians aboard.
 */
export const MODELLED_RESULTS: ModelledResultBuilders = {
  "infestation-clearance": (mission, outcome, ctx) =>
    baseModelledResult(mission, outcome, ctx),
  "defend-installation": (mission, outcome, ctx) => ({
    ...baseModelledResult(mission, outcome, ctx),
    ...(mission.defence === undefined
      ? {}
      : {
          defence: {
            installation: mission.defence.installation,
            held: outcome === "won",
          },
        }),
  }),
  "crash-site": (mission, outcome, ctx) => ({
    ...baseModelledResult(mission, outcome, ctx),
    podDestroyed: outcome === "won",
  }),
  "wreck-recovery": (mission, outcome, ctx) => ({
    ...baseModelledResult(mission, outcome, ctx),
    ...(mission.wreck === undefined
      ? {}
      : {
          wreck: {
            stripped: outcome === "won",
            turnsWorked: outcome === "won" ? mission.wreck.stripTurns : 0,
            turnsNeeded: mission.wreck.stripTurns,
          },
        }),
  }),
  evacuation: (mission, outcome, ctx) => ({
    ...baseModelledResult(mission, outcome, ctx),
    ...evacuationFields(mission, outcome),
  }),
  "hive-assault": (mission, outcome, ctx) => ({
    ...baseModelledResult(mission, outcome, ctx, HIVE_ASSAULT_PLACED),
    hiveCoreDestroyed: outcome === "won",
  }),
};

/**
 * The story missions whose results carry a field of their own, laid over
 * their type's modelled result. `Partial`: a story mission judged on its
 * outcome alone (First Skyfall, Uplink, Launch Window) needs no row.
 *
 * ```
 *   live-specimen   won ──► specimenCaptured: the species its setup places (a lurker)
 * ```
 */
export const MODELLED_STORY_RESULTS: ModelledStoryResults = {
  "live-specimen": (_mission, outcome) =>
    outcome === "won" ? { specimenCaptured: LIVE_SPECIMEN_SPECIES } : {},
};

// ===========================================
// Building
// ===========================================

/**
 * The modelled result of `mission` played to `outcome`: its type's row,
 * then its story mission's fields when it is one.
 *
 * ```
 *   builders[mission.typeId](mission, outcome, ctx)
 *        └─ storyId? ──► stories[storyId]?(mission, outcome) laid over
 * ```
 */
export function modelledResult(
  mission: Mission,
  outcome: MissionOutcome,
  ctx: ModelledResultContext,
  builders: ModelledResultBuilders = MODELLED_RESULTS,
  stories: ModelledStoryResults = MODELLED_STORY_RESULTS,
): MissionResult {
  const result = builders[mission.typeId](mission, outcome, ctx);
  const story =
    mission.storyId === undefined ? undefined : stories[mission.storyId];
  return story === undefined
    ? result
    : { ...result, ...story(mission, outcome) };
}

/**
 * What every type's modelled result shares: the rewards on the real
 * scale, no casualties, the offer's parts on a win, the harvest, and
 * the species fought.
 *
 * ```
 *   credits / TP / infestation ──► creditsFor, techPointsFor(+ harvest), infestationDeltaFor
 *   parts                      ──► partsFor (won only)
 *   harvest                    ──► the offer's carcass + Salvage Rich's, when harvested
 *   speciesKilled              ──► every species the offer's mix rolls (any outcome),
 *                                  plus the type's placed species on a win
 *   casualties                 ──► none: the sweep models the campaign, not the roster
 * ```
 *
 * No casualties is a deliberate simplification: the roster never
 * shrinks, so no mech is ever lost and Wreck Recovery is never offered
 * in the sweep.
 */
export function baseModelledResult(
  mission: Mission,
  outcome: MissionOutcome,
  ctx: ModelledResultContext,
  placed: readonly BugSpeciesId[] = [],
): MissionResult {
  const harvested =
    ctx.harvested && outcome !== "lost" ? carcassPoints(mission, ctx) : 0;
  const parts = partsFor(outcome, mission);
  const killed = speciesFought(mission, outcome === "won" ? placed : []);
  return {
    missionId: mission.id,
    cityId: mission.cityId,
    outcome,
    squadCasualties: [],
    squadsWiped: [],
    mechsDestroyed: [],
    mechDamage: [],
    creditsAwarded: creditsFor(outcome, mission, ctx.rewards),
    techPointsAwarded: techPointsFor(outcome, mission, ctx.rewards, harvested),
    infestationDelta: infestationDeltaFor(outcome, mission, ctx.rewards),
    ...(harvested > 0 ? { techPointsHarvested: harvested } : {}),
    ...(parts.length > 0 ? { partsAwarded: parts } : {}),
    ...(killed.length > 0 ? { speciesKilled: killed } : {}),
  };
}

/**
 * Tech points on the map's carcasses: the offer's own (#1171) plus the
 * two a Salvage Rich sitrep lays, priced the way the sitrep prices them.
 */
export function carcassPoints(
  mission: Mission,
  ctx: Pick<ModelledResultContext, "salvage">,
): number {
  const own = mission.mapParams.techCarcass?.techPoints ?? 0;
  const salvage = (mission.sitreps ?? []).includes("salvage-rich")
    ? ctx.salvage.carcasses *
      (ctx.salvage.basePoints +
        ctx.salvage.pointsPerDifficulty * mission.difficulty)
    : 0;
  return own + salvage;
}

// ===========================================
// Constants
// ===========================================

/** The species a Hive Assault places rather than rolls (its guards at the core). */
const HIVE_ASSAULT_PLACED: readonly BugSpeciesId[] = ["hive-guard"];

// ===========================================
// Helpers
// ===========================================

/**
 * Every species the fight saw, in `BUG_SPECIES_IDS` order, each once: the
 * ones the offer's frozen mix rolls, and the `placed` ones.
 */
function speciesFought(
  mission: Mission,
  placed: readonly BugSpeciesId[],
): readonly BugSpeciesId[] {
  return BUG_SPECIES_IDS.filter(
    (species) =>
      (mission.bugMix?.[species] ?? 0) > 0 || placed.includes(species),
  );
}

/**
 * An evacuation's civilian counts and its rescue objective row: every
 * group aboard on a win, one short of half on an extraction (so the
 * city is not saved), none on a loss. Nothing without a spec.
 */
function evacuationFields(
  mission: Mission,
  outcome: MissionOutcome,
): Partial<MissionResult> {
  const total = mission.evacuation?.groups;
  if (total === undefined) {
    return {};
  }
  const rescued =
    outcome === "won"
      ? total
      : outcome === "extracted"
        ? Math.max(0, Math.ceil(total / 2) - 1)
        : 0;
  return {
    civiliansRescued: rescued,
    civiliansTotal: total,
    objectives: [
      {
        kind: RESCUE_OBJECTIVE_KIND,
        complete: outcome === "won",
        failed: outcome !== "won",
        done: rescued,
        total,
      },
    ],
  };
}
