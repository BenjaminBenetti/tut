import { ACT_IDS } from "../../content/model/act-id";
import { MISSION_TYPE_IDS } from "../../content/model/mission-type-id";
import type { IdGenerator } from "../../core/model/id-generator";
import type { Rng } from "../../core/model/rng";
import type { ActCatalogue } from "../model/act-definition";
import type { CampaignProgress } from "../model/campaign-progress";
import type { EarthMap } from "../model/earth-map";
import type { IntelBonus } from "../model/intel-bonus";
import type { Mission } from "../model/mission";
import type { MissionOfferDecorator } from "../model/mission-offer-decorator";
import type { MissionPinTrigger } from "../model/mission-pin-trigger";
import type {
  MissionDebut,
  MissionOfferContext,
  MissionOfferRule,
  MissionOfferRules,
  MissionSite,
} from "../model/mission-offer-rule";
import { MISSION_OFFERED } from "../model/mission-offered-event";
import type { MissionTuning } from "../model/mission-tuning";
import type { MissionTypeCatalogue } from "../model/mission-type-catalogue";
import type { OverworldApplied } from "../model/overworld-domain-event";
import type { OverworldState } from "../model/overworld-state";
import { missionsInAct } from "./campaign-progress-service";
import { findRegion } from "./earth-map-query-service";
import { citiesWithOffers } from "./missions/mission-offer-builder";

// ===========================================
// Types
// ===========================================

/** What the mission director draws from. */
export interface MissionGenerationDeps {
  readonly intelBonus: IntelBonus;
  /** The step's stream; the director forks it per trigger rule, for the board and per decorator. */
  readonly rng: Rng;
  /** Issues mission ids with the `"mission"` prefix. */
  readonly ids: IdGenerator;
  readonly tuning: MissionTuning;
  readonly missionTypes: MissionTypeCatalogue;
  /** How each type is offered: drawn by the director or triggered (ADR 0013 §2.3). */
  readonly offerRules: MissionOfferRules;
  /** Board cap, difficulty band and type weights per act. */
  readonly acts: ActCatalogue;
  /** Applied to every new offer, in order (ADR 0013 §2.4). */
  readonly decorators: readonly MissionOfferDecorator[];
  /**
   * Sources of pinned offers that are not one mission type, run first
   * (ADR 0013 §2.4): the story spine's pin trigger. Empty pins nothing.
   */
  readonly pinTriggers: readonly MissionPinTrigger[];
}

/** A drawable type today: its rule, its weight in the act, and its eligible sites. */
interface Candidate {
  readonly rule: MissionOfferRule;
  readonly weight: number;
  readonly sites: readonly MissionSite[];
}

// ===========================================
// Constants
// ===========================================

/** Label of the stream the board's type, site and offer draws come from. */
const BOARD_STREAM = "board";

// ===========================================
// Queries
// ===========================================

/**
 * Whether a type with `debut` is in the director's pool (arc §3): the
 * campaign is in a later act than `debut.act`, or in that act with at
 * least `debut.missionsInAct` missions played in it.
 */
export function hasDebuted(
  debut: MissionDebut,
  progress: CampaignProgress,
): boolean {
  const now = ACT_IDS.indexOf(progress.act);
  const from = ACT_IDS.indexOf(debut.act);
  if (now !== from) {
    return now > from;
  }
  return missionsInAct(progress) >= debut.missionsInAct;
}

/**
 * Whether `mission` takes a place under the board cap: it is not pinned
 * and its type is not offered by a trigger rule. Story and hive offers
 * are pinned; Defend Installation is triggered; both sit on top.
 */
export function countsAgainstCap(
  mission: Mission,
  rules: MissionOfferRules,
): boolean {
  return mission.pinned !== true && rules[mission.typeId].kind === "offer";
}

// ===========================================
// Tick step: the mission director
// ===========================================

/**
 * The mission director (ADR 0013 §2.4, arc §5): offers the day's
 * missions for `state.day` and keeps the board at the act's cap.
 *
 * ```
 *   act = acts[progress.act]
 *   1. pins      for trigger in pinTriggers (the story spine):
 *                  trigger.pin(state, rng.fork(`pin:${id}`)) ──► pinned offers (outside the cap)
 *   2. triggers  for type in MISSION_TYPE_IDS with a trigger rule:
 *                  rule.trigger(state, rng.fork(`trigger:${type}`)) ──► offers (outside the cap)
 *   3. count     offers with pinned ≠ true whose type has an offer rule
 *   4. fill      while count < act.boardCap:
 *                  pool = offer rules with a weight in act.typeWeights, debuted,
 *                         and ≥ 1 eligible site on a city without an offer
 *                  pool empty ──► stop
 *                  type = board.pickWeighted(pool, act weight)   (renormalised over the pool)
 *                  site = board.pickWeighted(type's sites, site weight)
 *                  rule.create(state, site) ──► offer; count + 1
 *   5. band      every non-story offer's difficulty lies in act.difficultyBand: the
 *                rules clamp it (ctx.act) before deriving rewards, map size and
 *                carcass; a story offer keeps its own fixed difficulty
 *   each offer ──► decorators, in order, each on rng.fork(`decorate:${id}:${missionId}`)
 *              ──► MissionOffered
 * ```
 *
 * A city holds at most one offer: pin triggers and trigger rules skip
 * occupied cities, and the fill drops sites whose city already holds
 * one. Pins run first, so a story mission claims its city before any
 * other offer. Every offer sees the state with the offers made before
 * it. Pin triggers, trigger rules and decorators draw from labelled
 * forks, so adding one never changes what the board draws, and a pin
 * trigger that pins nothing changes nothing at all. The draw order is
 * part of the determinism contract: the same state, seed and deps always
 * offer the same missions. Returns the input state untouched when
 * nothing was offered.
 *
 * @throws {RangeError} if `intelBonus` names a region that is not on the
 *   map or holds a value that is not a non-negative integer. Those are
 *   programmer errors in the calling tick, not game states.
 */
export function generateMissions(
  state: OverworldState,
  deps: MissionGenerationDeps,
): OverworldApplied<OverworldState> {
  assertIntelBonus(state.map, deps.intelBonus);
  const act = deps.acts[state.progress.act];
  const contextOn = (rng: Rng): MissionOfferContext => ({
    rng,
    ids: deps.ids,
    tuning: deps.tuning,
    missionTypes: deps.missionTypes,
    intelBonus: deps.intelBonus,
    act,
  });

  let current = state;
  const offered: Mission[] = [];
  const offer = (mission: Mission, ctx: MissionOfferContext): void => {
    const decorated = decorate(mission, current, ctx, deps);
    offered.push(decorated);
    current = { ...current, missions: [...current.missions, decorated] };
  };

  for (const trigger of deps.pinTriggers) {
    const ctx = contextOn(deps.rng.fork(`pin:${trigger.id}`));
    for (const mission of trigger.pin(current, ctx)) {
      offer(mission, ctx);
    }
  }

  for (const typeId of MISSION_TYPE_IDS) {
    const rule = deps.offerRules[typeId];
    if (rule.kind !== "trigger") {
      continue;
    }
    const ctx = contextOn(deps.rng.fork(`trigger:${typeId}`));
    for (const mission of rule.trigger(current, ctx)) {
      offer(mission, ctx);
    }
  }

  const board = contextOn(deps.rng.fork(BOARD_STREAM));
  let count = current.missions.filter((mission) =>
    countsAgainstCap(mission, deps.offerRules),
  ).length;
  while (count < act.boardCap) {
    const pool = candidates(current, board, deps.offerRules);
    if (pool.length === 0) {
      break;
    }
    const drawn = board.rng.pickWeighted(pool, (c) => c.weight);
    const site = board.rng.pickWeighted(drawn.sites, (s) => s.weight);
    offer(drawn.rule.create(current, site, board), board);
    count += 1;
  }

  if (offered.length === 0) {
    return { state, events: [] };
  }
  return {
    state: current,
    events: offered.map((mission) => ({
      type: MISSION_OFFERED,
      payload: { mission },
    })),
  };
}

// ===========================================
// Helpers
// ===========================================

/**
 * The types the board can draw today, in `MISSION_TYPE_IDS` order: offer
 * rules with a positive weight in the act that have debuted and have at
 * least one eligible site on a city without an offer.
 */
function candidates(
  state: OverworldState,
  ctx: MissionOfferContext,
  rules: MissionOfferRules,
): Candidate[] {
  const occupied = citiesWithOffers(state);
  const pool: Candidate[] = [];
  for (const typeId of MISSION_TYPE_IDS) {
    const rule = rules[typeId];
    const weight = ctx.act.typeWeights[typeId] ?? 0;
    if (
      rule.kind !== "offer" ||
      weight <= 0 ||
      !hasDebuted(rule.debut, state.progress)
    ) {
      continue;
    }
    const sites = rule
      .eligible(state, ctx)
      .filter((site) => site.weight > 0 && !occupied.has(site.cityId));
    if (sites.length > 0) {
      pool.push({ rule, weight, sites });
    }
  }
  return pool;
}

/**
 * `mission` with every decorator applied in order, each handed the
 * context with its own stream: a fork of the step's stream labelled
 * with the decorator's id and the mission's id, so a decorator never
 * shifts another's draws, a trigger's or the board's.
 */
function decorate(
  mission: Mission,
  state: OverworldState,
  ctx: MissionOfferContext,
  deps: Pick<MissionGenerationDeps, "rng" | "decorators">,
): Mission {
  let decorated = mission;
  for (const decorator of deps.decorators) {
    decorated = decorator.decorate(decorated, state, {
      ...ctx,
      rng: deps.rng.fork(`decorate:${decorator.id}:${mission.id}`),
    });
  }
  return decorated;
}

/** Rejects intel entries for unknown regions or with values that are not non-negative integers. */
function assertIntelBonus(map: EarthMap, intelBonus: IntelBonus): void {
  for (const [regionId, days] of Object.entries(intelBonus)) {
    if (findRegion(map, regionId) === undefined) {
      throw new RangeError(
        `Intel bonus names unknown region "${regionId}"; keys must be region ids`,
      );
    }
    if (!Number.isInteger(days) || days < 0) {
      throw new RangeError(
        `Invalid intel bonus ${String(days)} for region "${regionId}": must be a non-negative integer`,
      );
    }
  }
}
