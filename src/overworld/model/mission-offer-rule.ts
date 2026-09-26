import type { ActId } from "../../content/model/act-id";
import type { MissionTypeId } from "../../content/model/mission-type-id";
import type { IdGenerator } from "../../core/model/id-generator";
import type { Rng } from "../../core/model/rng";
import type { ActDefinition } from "./act-definition";
import type { CityId } from "./city";
import type { IntelBonus } from "./intel-bonus";
import type { Mission } from "./mission";
import type { MissionTuning } from "./mission-tuning";
import type { MissionTypeCatalogue } from "./mission-type-catalogue";
import type { OverworldState } from "./overworld-state";

// ===========================================
// Debut and site
// ===========================================

/**
 * When a director-drawn type joins the pool (arc §3): from mission
 * `missionsInAct` of act `act`. A type has debuted once the campaign is
 * in a later act, or in `act` with at least `missionsInAct` missions
 * played in it. `{ act: "act-1", missionsInAct: 0 }` is there from the
 * first day.
 */
export interface MissionDebut {
  readonly act: ActId;
  readonly missionsInAct: number;
}

/**
 * Somewhere a director-drawn type could be offered today: a city, and
 * how strongly the type's rule prefers it. The director draws one site
 * of the drawn type with `rng.pickWeighted` over `weight`.
 */
export interface MissionSite {
  readonly cityId: CityId;
  /** Relative preference, `> 0`; a site with no weight is never drawn. */
  readonly weight: number;
}

// ===========================================
// Context
// ===========================================

/**
 * What an offer or trigger rule, and an offer decorator, may read beyond
 * the overworld: the day's streams, the content, and the act being
 * played. `state.day` is the day being offered on.
 *
 * ```
 *   rng           the director's stream for this rule (a labelled fork per
 *                 trigger rule and per decorator, one for the board draws)
 *   ids           issues "mission" ids
 *   tuning        difficulty, map size, carcass and per-type offer knobs
 *   missionTypes  names, rewards, expiry and ignore penalty per type
 *   intelBonus    extra days on offer per region (#66)
 *   act           ACTS[progress.act]: board cap, difficulty band, sitreps
 * ```
 */
export interface MissionOfferContext {
  readonly rng: Rng;
  readonly ids: IdGenerator;
  readonly tuning: MissionTuning;
  readonly missionTypes: MissionTypeCatalogue;
  readonly intelBonus: IntelBonus;
  /**
   * The act the offer is made in. Every non-story offer's difficulty is
   * clamped into its `difficultyBand` before anything is derived from
   * the difficulty (arc §3).
   */
  readonly act: ActDefinition;
}

// ===========================================
// Rules
// ===========================================

/**
 * A mission type the director draws to keep the board at its cap (ADR
 * 0013 §2.3, §2.4). The director asks every debuted offer rule with a
 * weight in the act for its eligible sites, draws a type by the act's
 * weights over those with at least one, draws one of its sites by
 * weight, and asks the rule to create the offer there.
 */
export interface MissionOfferRule {
  readonly kind: "offer";
  /** The mission type this rule offers; equal to its table key. */
  readonly typeId: MissionTypeId;
  /** When the type joins the director's pool. */
  readonly debut: MissionDebut;
  /**
   * Every site where the type could be offered today. The director
   * drops any whose city already holds an offer, so a city holds at
   * most one; a rule may drop them itself as well. Pure, draws nothing.
   */
  eligible(
    state: OverworldState,
    ctx: MissionOfferContext,
  ): readonly MissionSite[];
  /**
   * The offer at `site`, one of the sites `eligible` returned. Draws its
   * id from `ctx.ids` and anything random from `ctx.rng`. A non-story
   * offer's difficulty lies in `ctx.act.difficultyBand`, and everything
   * derived from it (rewards, map size, carcass) follows the clamped
   * value.
   */
  create(
    state: OverworldState,
    site: MissionSite,
    ctx: MissionOfferContext,
  ): Mission;
}

/**
 * A mission type offered by an event rather than drawn (ADR 0013 §2.3):
 * pinned story and hive offers, and event offers such as Defend
 * Installation. The director runs every trigger rule before it fills
 * the board; whatever they offer sits outside the board cap.
 */
export interface MissionTriggerRule {
  readonly kind: "trigger";
  /** The mission type this rule offers; equal to its table key. */
  readonly typeId: MissionTypeId;
  /**
   * The offers the event makes today, possibly none. Must not offer to
   * a city that already holds an offer in `state`, nor twice to one
   * city. Draws ids from `ctx.ids` and anything random from `ctx.rng`.
   */
  trigger(state: OverworldState, ctx: MissionOfferContext): readonly Mission[];
}

/** One entry of the offer table: a director-drawn type or a triggered one. */
export type MissionOfferEntry = MissionOfferRule | MissionTriggerRule;

/**
 * How each mission type is offered. A `Record` over the closed
 * `MissionTypeId` union, so a type without an entry is a compile error.
 */
export type MissionOfferRules = Readonly<
  Record<MissionTypeId, MissionOfferEntry>
>;
