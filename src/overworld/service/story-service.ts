import type { ActId } from "../../content/model/act-id";
import { ACT_IDS } from "../../content/model/act-id";
import type { CampaignFlagId } from "../../content/model/campaign-flag-id";
import { isCampaignFlagId } from "../../content/model/campaign-flag-id";
import type { StoryMissionId } from "../../content/model/story-mission-id";
import type { IdGenerator } from "../../core/model/id-generator";
import type { TechNode } from "../../tech/model/tech-node";
import { ACT_ADVANCED } from "../model/act-advanced-event";
import { CAMPAIGN_FLAG_SET } from "../model/campaign-flag-set-event";
import type { CampaignApplied, CampaignEvent } from "../model/campaign-event";
import type { CampaignProgress } from "../model/campaign-progress";
import type { CampaignState } from "../model/campaign-state";
import type { Mission } from "../model/mission";
import type { MissionResult } from "../model/mission-result";
import type { OverworldApplied } from "../model/overworld-domain-event";
import type { OverworldState } from "../model/overworld-state";
import type {
  PlatformStoryLoss,
  StoryEffect,
  StoryLossRule,
  StoryMissionRule,
  StoryMissionRules,
} from "../model/story-mission-rule";
import type { StorySpine } from "../model/story-spine";
import { advanceAct, hasFlag, withFlag } from "./campaign-progress-service";
import { addCityInfestation } from "./city-infestation-service";
import { formFirstHive } from "./hive-service";

// ===========================================
// Types
// ===========================================

/** The story content the spine runs on: the missions built so far and each act's gate. */
export interface StoryDeps {
  /** The story missions built so far; an absent entry is not built yet. */
  readonly rules: StoryMissionRules;
  /** Which story mission ends each act. */
  readonly spine: StorySpine;
}

/** What resolving a story mission needs beyond the content. */
export interface StoryResolutionContext extends StoryDeps {
  /** Issues the scripted first hive's id when Act II opens. */
  readonly ids: IdGenerator;
}

// ===========================================
// Constants
// ===========================================

/** Set on the Spore Platform's first failure (D7); blocks its re-pin until `last-hope`. */
export const PLATFORM_FAILED_FLAG: CampaignFlagId = "platform-failed";

/** Set by the hidden Last Hope tech node (D7); lets the platform be pinned again. */
export const LAST_HOPE_FLAG: CampaignFlagId = "last-hope";

/** The story's victory verdict; the outcome step turns it into `victory`. */
export const CAMPAIGN_WON_FLAG: CampaignFlagId = "campaign-won";

/** The story's defeat verdict (D7's second failure); the outcome step turns it into `defeat`. */
export const CAMPAIGN_LOST_FLAG: CampaignFlagId = "campaign-lost";

// ===========================================
// Tech unlocks
// ===========================================

/**
 * The `onUnlocked` hook of the tech handlers (ADR 0013 §2.5, §2.7):
 * applies each `{ kind: "flag" }` effect of `node` to the campaign's
 * flags, in effect order, with one `CampaignFlagSet` per flag newly set.
 * Every other kind of effect belongs to another reader (parts to the
 * mech bay, for instance) and is ignored here. A flag the campaign does
 * not know (not a `CampaignFlagId`) is ignored too; the tech data test
 * keeps the shipped tree from naming one.
 *
 * It only records flags. Story missions are pinned by the mission
 * director from those flags on the next day tick, so research and play
 * reach the board through one path.
 *
 * ```
 *   node.effects ──► flag effects ──► withFlag(progress, flag) ──► CampaignFlagSet (new ones)
 * ```
 *
 * Returns `state` itself, with no events, when no flag changed.
 */
export function onTechUnlocked<TState extends CampaignState>(
  state: TState,
  node: TechNode,
): CampaignApplied<TState> {
  let overworld = state.overworld;
  const events: CampaignEvent[] = [];
  for (const effect of node.effects) {
    if (effect.kind !== "flag" || !isCampaignFlagId(effect.flag)) {
      continue;
    }
    const flagged = setCampaignFlag(overworld, effect.flag);
    overworld = flagged.state;
    events.push(...flagged.events);
  }
  if (overworld === state.overworld) {
    return { state, events: [] };
  }
  return { state: { ...state, overworld }, events };
}

// ===========================================
// Story mission results
// ===========================================

/**
 * What a played story mission does to the spine (ADR 0013 §2.5), called
 * by the launch handler after the mission type's own `onResolved`, so a
 * story Crash Site still has the Crash Site consequences. An offer
 * without a `storyId`, or one whose story mission is no longer built,
 * changes nothing.
 *
 * ```
 *   won ──► storyWon + id, retry delay dropped ──► rule.onWon effects, in order
 *   lost or extracted ──► rule.onLost:
 *     retry     storyRetryDay[id] = day + delayDays
 *     platform  first:  every city + cityInfestation, platform-failed
 *               second: campaign-lost (defeat on the next tick)
 * ```
 *
 * Only `won` moves the story on: extracting before the objective is
 * done is a loss for the spine.
 *
 * @param state - The overworld after the type's consequence rule.
 * @param mission - The offer that was played.
 * @param result - What the resolver reported.
 * @param ctx - The story content and the id generator.
 */
export function onStoryMissionResolved(
  state: OverworldState,
  mission: Mission,
  result: MissionResult,
  ctx: StoryResolutionContext,
): OverworldApplied<OverworldState> {
  if (mission.storyId === undefined) {
    return { state, events: [] };
  }
  const rule = ctx.rules[mission.storyId];
  if (rule === undefined) {
    return { state, events: [] };
  }
  if (result.outcome === "won") {
    const recorded: OverworldState = {
      ...state,
      progress: recordStoryWin(state.progress, rule.id),
    };
    return applyStoryEffects(recorded, rule.onWon, ctx);
  }
  return applyStoryLoss(state, rule);
}

/**
 * Applies `effects` in order, each to the overworld the previous one
 * returned, and concatenates their events.
 *
 * ```
 *   flag         ──► withFlag                         CampaignFlagSet
 *   advance-act  ──► next act exists? ──yes──► act+1  ActAdvanced (+ HiveFormed)
 *                                     └─no───► campaign-won
 *   victory      ──► campaign-won                     CampaignFlagSet
 * ```
 */
export function applyStoryEffects(
  state: OverworldState,
  effects: readonly StoryEffect[],
  ctx: StoryResolutionContext,
): OverworldApplied<OverworldState> {
  let current = state;
  const events: CampaignEvent[] = [];
  for (const effect of effects) {
    const applied = applyStoryEffect(current, effect, ctx);
    current = applied.state;
    events.push(...applied.events);
  }
  return { state: current, events };
}

// ===========================================
// Flags
// ===========================================

/**
 * The overworld with `flag` earned and a `CampaignFlagSet`, or `state`
 * itself with no event when the flag is already held. The one door a
 * rule outside this service uses to set a flag: the Crash Site's
 * consequence rule sets `spore-sample` on its first win through it
 * (arc §4), which reveals Intel I.
 */
export function setCampaignFlag(
  state: OverworldState,
  flag: CampaignFlagId,
): OverworldApplied<OverworldState> {
  const progress = withFlag(state.progress, flag);
  if (progress === state.progress) {
    return { state, events: [] };
  }
  return {
    state: { ...state, progress },
    events: [{ type: CAMPAIGN_FLAG_SET, payload: { flag } }],
  };
}

// ===========================================
// The spine
// ===========================================

/** The act after `act` in campaign order, or `undefined` after the finale. */
export function nextActOf(act: ActId): ActId | undefined {
  return ACT_IDS[ACT_IDS.indexOf(act) + 1];
}

/**
 * Whether `act` exists in this build (arc §13): the story mission that
 * ends it is defined in the rules. An act whose ending is not built yet
 * is never entered; the spine ends in victory before it.
 */
export function actExists(act: ActId, deps: StoryDeps): boolean {
  return deps.rules[deps.spine[act].endedBy] !== undefined;
}

/**
 * Whether the spine would pin `rule` today, going by the story's own
 * state: the campaign is in the rule's act, every flag in `pinWhen` is
 * set, the mission is not on the board, it has not been won, and its
 * loss rule is not holding it back.
 *
 * ```
 *   act = rule.act ∧ flags ⊇ pinWhen ∧ storyId not on the board ∧ not won
 *     ∧ retry:    no delay, or day ≥ storyRetryDay[id]
 *     ∧ platform: not failed yet, or last-hope set
 * ```
 */
export function isStoryPinnable(
  rule: StoryMissionRule,
  state: OverworldState,
): boolean {
  const { progress } = state;
  return (
    progress.act === rule.act &&
    rule.pinWhen.every((flag) => hasFlag(progress, flag)) &&
    !state.missions.some((mission) => mission.storyId === rule.id) &&
    !isStoryWon(progress, rule.id) &&
    !isHeldBack(rule, state)
  );
}

/** Whether story mission `id` has been won. */
export function isStoryWon(
  progress: CampaignProgress,
  id: StoryMissionId,
): boolean {
  return (progress.storyWon ?? []).includes(id);
}

// ===========================================
// Helpers
// ===========================================

/** One effect of a won story mission. */
function applyStoryEffect(
  state: OverworldState,
  effect: StoryEffect,
  ctx: StoryResolutionContext,
): OverworldApplied<OverworldState> {
  switch (effect.kind) {
    case "flag":
      return setCampaignFlag(state, effect.flag);
    case "advance-act":
      return advanceStoryAct(state, ctx);
    case "victory":
      return setCampaignFlag(state, CAMPAIGN_WON_FLAG);
  }
}

/**
 * Ends the current act: into the next act if it exists, scripting the
 * first hive when the spine says entering it does, and otherwise the
 * campaign is won.
 */
function advanceStoryAct(
  state: OverworldState,
  ctx: StoryResolutionContext,
): OverworldApplied<OverworldState> {
  const from = state.progress.act;
  const to = nextActOf(from);
  if (to === undefined || !actExists(to, ctx)) {
    return setCampaignFlag(state, CAMPAIGN_WON_FLAG);
  }
  const advanced: OverworldState = {
    ...state,
    progress: advanceAct(state.progress, to),
  };
  const events: CampaignEvent[] = [
    { type: ACT_ADVANCED, payload: { from, to } },
  ];
  if (!ctx.spine[to].formsFirstHive) {
    return { state: advanced, events };
  }
  const hive = formFirstHive(advanced, advanced.day, ctx.ids);
  return { state: hive.state, events: [...events, ...hive.events] };
}

/** What losing `rule`'s mission does, by its loss rule. */
function applyStoryLoss(
  state: OverworldState,
  rule: StoryMissionRule,
): OverworldApplied<OverworldState> {
  const loss: StoryLossRule = rule.onLost;
  switch (loss.kind) {
    case "retry":
      return {
        state: {
          ...state,
          progress: {
            ...state.progress,
            storyRetryDay: {
              ...state.progress.storyRetryDay,
              [rule.id]: state.day + loss.delayDays,
            },
          },
        },
        events: [],
      };
    case "platform":
      return applyPlatformLoss(state, loss);
  }
}

/**
 * Arc D7: the first failure adds `cityInfestation` to every city through
 * `addCityInfestation` (clamped at 100, one `CityInfestationChanged` per
 * city that moved) and sets `platform-failed`; a failure after that sets
 * `campaign-lost`.
 */
function applyPlatformLoss(
  state: OverworldState,
  loss: PlatformStoryLoss,
): OverworldApplied<OverworldState> {
  if (hasFlag(state.progress, PLATFORM_FAILED_FLAG)) {
    return setCampaignFlag(state, CAMPAIGN_LOST_FLAG);
  }
  let current = state;
  const events: CampaignEvent[] = [];
  for (const city of state.map.cities) {
    const raised = addCityInfestation(current, city.id, loss.cityInfestation);
    current = raised.state;
    events.push(...raised.events);
  }
  const flagged = setCampaignFlag(current, PLATFORM_FAILED_FLAG);
  return { state: flagged.state, events: [...events, ...flagged.events] };
}

/** Whether `rule`'s loss rule keeps it off the board today. */
function isHeldBack(rule: StoryMissionRule, state: OverworldState): boolean {
  switch (rule.onLost.kind) {
    case "retry": {
      const retryDay = state.progress.storyRetryDay?.[rule.id];
      return retryDay !== undefined && state.day < retryDay;
    }
    case "platform":
      return (
        hasFlag(state.progress, PLATFORM_FAILED_FLAG) &&
        !hasFlag(state.progress, LAST_HOPE_FLAG)
      );
  }
}

/**
 * `progress` with `id` recorded as won, once, and any retry delay for it
 * dropped (an optional record left empty is removed).
 */
function recordStoryWin(
  progress: CampaignProgress,
  id: StoryMissionId,
): CampaignProgress {
  const won = progress.storyWon ?? [];
  const { storyRetryDay, ...rest } = progress;
  const { [id]: _cleared, ...delays } = storyRetryDay ?? {};
  return {
    ...rest,
    storyWon: won.includes(id) ? won : [...won, id],
    ...(Object.keys(delays).length === 0 ? {} : { storyRetryDay: delays }),
  };
}
