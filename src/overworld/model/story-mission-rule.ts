import type { ActId } from "../../content/model/act-id";
import type { CampaignFlagId } from "../../content/model/campaign-flag-id";
import type { StoryMissionId } from "../../content/model/story-mission-id";
import type { Mission } from "./mission";
import type { MissionPinContext } from "./mission-pin-trigger";
import type { OverworldState } from "./overworld-state";

// ===========================================
// Constants
// ===========================================

/**
 * Days a lost story mission waits before it is pinned again (arc §4:
 * "losing a story mission delays it five days, then re-pins it"). The
 * usual `delayDays` of a retry loss rule.
 */
export const STORY_RETRY_DAYS = 5;

/**
 * Infestation every city gains when the Spore Platform assault fails for
 * the first time (arc D7: "every city gains +30 infestation", capped at
 * 100). The usual `cityInfestation` of a platform loss rule.
 */
export const PLATFORM_FAILURE_INFESTATION = 30;

// ===========================================
// Effects of a win
// ===========================================

/** Sets a campaign flag: a story item recovered or an event remembered. */
export interface FlagStoryEffect {
  readonly kind: "flag";
  readonly flag: CampaignFlagId;
}

/**
 * Ends the current act (ADR 0013 §2.5). The campaign moves to the next
 * act if that act exists, meaning the story mission that ends it and
 * every earlier act's are defined (`actExists`); otherwise the spine is
 * over and the campaign is won. Entering
 * Act II also scripts the first hive. The story spine table says which
 * mission ends each act.
 */
export interface AdvanceActStoryEffect {
  readonly kind: "advance-act";
}

/** Wins the campaign outright (arc D1: the Spore Platform falls). */
export interface VictoryStoryEffect {
  readonly kind: "victory";
}

/**
 * What winning a story mission does, beyond its type's own consequences
 * (ADR 0013 §2.5). Applied in order by the story service.
 *
 * ```
 *   StoryEffect
 *   ├── { kind: "flag", flag }     progress.flags + flag
 *   ├── { kind: "advance-act" }    next act if it exists, else victory
 *   └── { kind: "victory" }        campaign-won
 * ```
 */
export type StoryEffect =
  FlagStoryEffect | AdvanceActStoryEffect | VictoryStoryEffect;

// ===========================================
// What a loss does
// ===========================================

/**
 * The mission is pinned again `delayDays` after the day it was lost
 * (arc §4). Launch Window works this way too.
 */
export interface RetryStoryLoss {
  readonly kind: "retry";
  /** Days from the loss to the first day it may be pinned again; `STORY_RETRY_DAYS`. */
  readonly delayDays: number;
}

/**
 * The Spore Platform's rule (arc D7). The first loss adds
 * `cityInfestation` to every city, capped at 100, and sets
 * `platform-failed`; the mission is not pinned again until `last-hope`
 * is set, which the hidden Last Hope tech node does. A second loss sets
 * `campaign-lost`, and the campaign ends in defeat.
 */
export interface PlatformStoryLoss {
  readonly kind: "platform";
  /** Infestation added to every city on the first loss; `PLATFORM_FAILURE_INFESTATION`. */
  readonly cityInfestation: number;
}

/**
 * What losing a story mission does (ADR 0013 §2.5). Any outcome but
 * `won` is a loss: extracting before the objective is done does not
 * move the story on.
 *
 * ```
 *   StoryLossRule
 *   ├── { kind: "retry", delayDays }        pinned again after delayDays
 *   └── { kind: "platform", cityInfestation } 1st: +cityInfestation, platform-failed
 *                                           2nd: campaign-lost (defeat)
 * ```
 */
export type StoryLossRule = RetryStoryLoss | PlatformStoryLoss;

// ===========================================
// Rule
// ===========================================

/**
 * One story mission as a module (campaign arc §4 and §6.9, ADR 0013
 * §2.5). The mission director pins it once every flag in `pinWhen` is
 * set, while the campaign is in `act`, and resolving it applies
 * `onWon` or `onLost` after its type's own consequence rule.
 *
 * ```
 *   flags ⊇ pinWhen, act, not on the board, not won, no delay pending
 *     ──► create(state, ctx) ──► pinned offer (storyId, fixed difficulty)
 *   LaunchMission ──► type's onResolved ──► won?  onWon effects
 *                                         └─ lost? onLost rule
 * ```
 *
 * A story mission is built on an existing mission type (First Skyfall
 * is a Crash Site), so the offer's `typeId` still picks its map, setup,
 * presentation and type consequences; the story layer only adds the
 * pin, the fixed difficulty and what winning or losing means for the
 * spine.
 */
export interface StoryMissionRule {
  /** The story mission this rule defines; equal to its table key. */
  readonly id: StoryMissionId;
  /**
   * The act the mission belongs to. It is pinned only while the campaign
   * is in this act, and its offer is stamped with it.
   */
  readonly act: ActId;
  /** Flags that must all be set before the mission is pinned; empty pins it at once. */
  readonly pinWhen: readonly CampaignFlagId[];
  /**
   * The pinned offer on `state.day`, or `undefined` when there is no
   * site for it today (the director asks again tomorrow). The offer
   * carries `storyId: id`, `pinned: true`, its own fixed `difficulty`
   * (never clamped into the act's band) and `act`. It sits on a city
   * without an offer when one of its candidates is free; otherwise on
   * the one it likes best whose offer `ctx.displaceable` allows, which
   * the director withdraws (`pickStoryCity`, #1179), so a story mission
   * is pinned the day its gate opens (arc D2). Draws its id from
   * `ctx.ids` and anything random from `ctx.rng`, a stream private to
   * this story mission.
   */
  create(state: OverworldState, ctx: MissionPinContext): Mission | undefined;
  /** What winning it does, in order, after its type's consequences. */
  readonly onWon: readonly StoryEffect[];
  /** What losing it does, after its type's consequences. */
  readonly onLost: StoryLossRule;
}

/**
 * The story missions that are built, keyed by id. `Partial` because
 * story missions land package by package: an absent entry means "not
 * built yet", and the spine treats an act whose ending mission is absent
 * as not existing (ADR 0013 §2.5).
 */
export type StoryMissionRules = Readonly<
  Partial<Record<StoryMissionId, StoryMissionRule>>
>;
