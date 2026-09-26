import type { IdGenerator } from "../../core/model/id-generator";
import type { EconomyTuning } from "../../economy/model/economy-tuning";
import type { EventTuning } from "../model/event-tuning";
import type { EventTypeCatalogue } from "../model/event-type-catalogue";
import type { TransactionService } from "../../economy/model/transaction-service";
import { applyStipend } from "../../economy/service/income-service";
import type { CampaignState } from "../model/campaign-state";
import type { DeployableTypeCatalogue } from "../model/deployable-type-catalogue";
import type { HiveTuning } from "../model/hive-tuning";
import type { InfestationTuning } from "../model/infestation-tuning";
import type { ActCatalogue } from "../model/act-definition";
import type { MissionConsequenceRules } from "../model/mission-consequence-rule";
import type { MissionOfferDecorator } from "../model/mission-offer-decorator";
import type { MissionOfferRules } from "../model/mission-offer-rule";
import type { MissionTuning } from "../model/mission-tuning";
import type { MissionTypeCatalogue } from "../model/mission-type-catalogue";
import type { StoryMissionRules } from "../model/story-mission-rule";
import { THREAT_CHANGED } from "../model/overworld-domain-event";
import type { ThreatTuning } from "../model/threat-tuning";
import type { TickStep } from "../model/tick-step";
import { chargeUpkeep } from "./deployable-effects-service";
import { pausedRegions, withPausedGrowth } from "./growth-pause-service";
import {
  createHiveFormationStep,
  HIVE_FORMATION_STEP_NAME,
} from "./hive-formation-service";
import { hiveRegionIds } from "./hive-service";
import { applyDetection } from "./infestation-detection-service";
import { applyGrowth } from "./infestation-growth-service";
import { applySpread } from "./infestation-spread-service";
import { expireMissions } from "./mission-expiry-service";
import { generateMissions } from "./mission-generation-service";
import { createStoryPinTrigger } from "./story/story-pin-trigger";
import { applyOutcome } from "./outcome-service";
import {
  stipendFactor,
  tickStipendModifiers,
} from "./stipend-modifier-service";
import { computeThreat, unfestedFraction } from "./threat-service";
import { createEventStep, EVENT_STEP_NAME } from "./event-generation-service";

// ===========================================
// Types
// ===========================================

/** Content, tuning and services the default steps draw on. */
export interface TickDeps {
  readonly catalogue: DeployableTypeCatalogue;
  /**
   * Builds the transaction service for one tick from the tick's id
   * generator, so ledger ids continue the campaign's sequence.
   */
  readonly createTransactions: (ids: IdGenerator) => TransactionService;
  readonly infestationTuning: InfestationTuning;
  readonly missionTuning: MissionTuning;
  readonly missionTypes: MissionTypeCatalogue;
  /** How each mission type is offered; the director runs it (ADR 0013 §2.4). */
  readonly missionOffers: MissionOfferRules;
  /**
   * What each mission type does to the overworld when offered (a crash
   * site's landing) and when its offer lapses (ADR 0013 §2.3).
   */
  readonly missionConsequences: MissionConsequenceRules;
  /** Applied to every new offer, in order. */
  readonly offerDecorators: readonly MissionOfferDecorator[];
  /** Board cap, difficulty band and type weights per act. */
  readonly acts: ActCatalogue;
  /**
   * The story missions built so far; the director pins each one the
   * spine says is due (ADR 0013 §2.5). Empty pins nothing.
   */
  readonly storyMissions: StoryMissionRules;
  readonly threatTuning: ThreatTuning;
  readonly economyTuning: EconomyTuning;
  readonly eventTypes: EventTypeCatalogue;
  readonly eventTuning: EventTuning;
  /** When hives form, how they level and what liberation does (arc §6.5). */
  readonly hiveTuning: HiveTuning;
}

// ===========================================
// Step names
// ===========================================

/** Names of the day's steps, in pipeline order. Also the RNG fork labels. */
export const TICK_STEP_NAMES = {
  upkeep: "upkeep",
  growth: "growth",
  spread: "spread",
  hiveFormation: HIVE_FORMATION_STEP_NAME,
  detection: "detection",
  missionExpiry: "mission-expiry",
  missionGeneration: "mission-generation",
  events: EVENT_STEP_NAME,
  stipend: "stipend",
  threat: "threat",
  outcome: "outcome",
} as const;

// ===========================================
// Pipeline
// ===========================================

/**
 * The day tick (GDD §5.2), one step per service, in this order:
 *
 * ```
 *   1. upkeep              charge deployables; offline ones stop contributing
 *   2. growth              infested cities grow, slowed by repellent;
 *                          a liberated region under its pause does not grow
 *   3. spread              infested cities spread to neighbours (more from a hive
 *                          region, none from a paused one); threat seeds clean ones
 *   4. hive-formation      from Act II, a week at mean ≥ 60 roots a hive (arc §6.5)
 *   5. detection           infested cities past the (sensor-lowered) thresholds are found
 *   6. mission-expiry      lapsed missions go; each type's rule says what that costs
 *   7. mission-generation  the director: story pins, trigger rules, then fill
 *                          the board to the act's cap (+ intel bonus)
 *   8. events              lapsed events resolve by default; maybe a new one (#71)
 *   9. stipend             Earth pays for the day, scaled by how much is unfested,
 *                          by any event-driven stipend modifiers (#70), plus the banks
 *  10. threat              recompute and store global threat
 *  11. outcome             the story's verdict, then threat defeat, once
 * ```
 *
 * Growth and spread read the threat stored by the previous tick; the
 * recompute in step 9 is what the next day sees. Modifiers reach each
 * step through `ctx`, computed after upkeep so an installation that just
 * went offline contributes nothing today.
 */
export function createDefaultTickSteps<TState extends CampaignState>(
  deps: TickDeps,
): TickStep<TState>[] {
  return [
    upkeepStep(deps),
    growthStep(deps),
    spreadStep(deps),
    createHiveFormationStep<TState>(deps),
    detectionStep(deps),
    missionExpiryStep(deps),
    missionGenerationStep(deps),
    createEventStep<TState>(deps),
    stipendStep(deps),
    threatStep(deps),
    outcomeStep(),
  ];
}

// ===========================================
// Steps
// ===========================================

/** Charges a day of upkeep and flips deployables online / offline. */
function upkeepStep<TState extends CampaignState>(
  deps: TickDeps,
): TickStep<TState> {
  return {
    name: TICK_STEP_NAMES.upkeep,
    run: (state, ctx) =>
      chargeUpkeep(state, ctx.day, {
        catalogue: deps.catalogue,
        transactions: deps.createTransactions(ctx.ids),
      }),
  };
}

/**
 * Grows every infested city, slowed by the day's growth factors. A
 * region under a growth pause is held still by a factor of 0.
 */
function growthStep<TState extends CampaignState>(
  deps: TickDeps,
): TickStep<TState> {
  return {
    name: TICK_STEP_NAMES.growth,
    run: (state, ctx) => {
      const { overworld } = state;
      const grown = applyGrowth(
        overworld.map,
        overworld.threat,
        withPausedGrowth(
          overworld.map,
          ctx.modifiers.growthFactor,
          pausedRegions(overworld, ctx.day),
        ),
        deps.infestationTuning,
      );
      if (grown.events.length === 0) {
        return { state, events: [] };
      }
      return {
        state: { ...state, overworld: { ...overworld, map: grown.state } },
        events: grown.events,
      };
    },
  };
}

/**
 * Spreads between neighbours and seeds clean cities; always advances
 * cooldowns. Hive regions spread further and paused regions not at all.
 */
function spreadStep<TState extends CampaignState>(
  deps: TickDeps,
): TickStep<TState> {
  return {
    name: TICK_STEP_NAMES.spread,
    run: (state, ctx) => {
      const { overworld } = state;
      const spread = applySpread(
        overworld.map,
        overworld.threat,
        ctx.modifiers.spreadDeterrence,
        overworld.spreadCooldowns,
        ctx.rng,
        deps.infestationTuning,
        {
          hiveRegions: hiveRegionIds(overworld),
          pausedRegions: pausedRegions(overworld, ctx.day),
        },
      );
      return {
        state: {
          ...state,
          overworld: {
            ...overworld,
            map: spread.state.map,
            spreadCooldowns: spread.state.cooldowns,
          },
        },
        events: spread.events,
      };
    },
  };
}

/** Finds infested cities past their region's detection thresholds. */
function detectionStep<TState extends CampaignState>(
  deps: TickDeps,
): TickStep<TState> {
  return {
    name: TICK_STEP_NAMES.detection,
    run: (state, ctx) => {
      const { overworld } = state;
      const detected = applyDetection(
        overworld.map,
        ctx.modifiers.detectionFactor,
        deps.infestationTuning,
      );
      if (detected.state === overworld.map) {
        return { state, events: [] };
      }
      return {
        state: { ...state, overworld: { ...overworld, map: detected.state } },
        events: detected.events,
      };
    },
  };
}

/** Removes lapsed missions and applies each type's `onExpired`. */
function missionExpiryStep<TState extends CampaignState>(
  deps: TickDeps,
): TickStep<TState> {
  return {
    name: TICK_STEP_NAMES.missionExpiry,
    run: (state) => {
      const expired = expireMissions(state.overworld, {
        consequences: deps.missionConsequences,
        context: { tuning: deps.missionTuning },
      });
      if (expired.state === state.overworld) {
        return { state, events: [] };
      }
      return {
        state: { ...state, overworld: expired.state },
        events: expired.events,
      };
    },
  };
}

/** The mission director: story pins, triggered offers, then the board filled to the act's cap. */
function missionGenerationStep<TState extends CampaignState>(
  deps: TickDeps,
): TickStep<TState> {
  const pinTriggers = [createStoryPinTrigger(deps.storyMissions)];
  return {
    name: TICK_STEP_NAMES.missionGeneration,
    run: (state, ctx) => {
      const generated = generateMissions(state.overworld, {
        intelBonus: ctx.modifiers.intelBonus,
        rng: ctx.rng,
        ids: ctx.ids,
        tuning: deps.missionTuning,
        missionTypes: deps.missionTypes,
        offerRules: deps.missionOffers,
        consequences: deps.missionConsequences,
        acts: deps.acts,
        decorators: deps.offerDecorators,
        pinTriggers,
      });
      if (generated.state === state.overworld) {
        return { state, events: [] };
      }
      return {
        state: { ...state, overworld: generated.state },
        events: generated.events,
      };
    },
  };
}

/** Pays the day's stipend, scaled by how much of Earth is unfested, plus the banks' bonus. */
function stipendStep<TState extends CampaignState>(
  deps: TickDeps,
): TickStep<TState> {
  return {
    name: TICK_STEP_NAMES.stipend,
    run: (state, ctx) => {
      const { overworld } = state;
      const factor = stipendFactor(overworld.stipendModifiers);
      const paid = applyStipend(
        state.economy,
        unfestedFraction(overworld.map),
        ctx.day,
        scaleStipend(deps.economyTuning, factor),
        deps.createTransactions(ctx.ids),
        ctx.modifiers.incomeBonus,
      );
      const remaining = tickStipendModifiers(overworld.stipendModifiers);
      const { stipendModifiers: _dropped, ...rest } = overworld;
      return {
        state: {
          ...state,
          overworld:
            remaining === undefined
              ? rest
              : { ...rest, stipendModifiers: remaining },
          economy: paid.state,
        },
        events: paid.events,
      };
    },
  };
}

/**
 * The economy tuning with the base stipend and its floor scaled by an
 * event-driven factor, rounded to whole credits so the ledger stays
 * whole. Returns the input by identity at factor 1.
 */
function scaleStipend(tuning: EconomyTuning, factor: number): EconomyTuning {
  if (factor === 1) {
    return tuning;
  }
  return {
    ...tuning,
    baseStipend: Math.round(tuning.baseStipend * factor),
    stipendFloor: Math.round(tuning.stipendFloor * factor),
  };
}

/** Recomputes global threat from the map and the day, emitting a change if it moved. */
function threatStep<TState extends CampaignState>(
  deps: TickDeps,
): TickStep<TState> {
  return {
    name: TICK_STEP_NAMES.threat,
    run: (state, ctx) => {
      const { overworld } = state;
      const threat = computeThreat(
        overworld.map,
        ctx.day,
        deps.threatTuning,
        overworld.threatOffset,
      );
      if (threat === overworld.threat) {
        return { state, events: [] };
      }
      return {
        state: { ...state, overworld: { ...overworld, threat } },
        events: [
          {
            type: THREAT_CHANGED,
            payload: { from: overworld.threat, to: threat },
          },
        ],
      };
    },
  };
}

/** Ends the campaign the first day the story reaches a verdict or threat hits its maximum. */
function outcomeStep<TState extends CampaignState>(): TickStep<TState> {
  return {
    name: TICK_STEP_NAMES.outcome,
    run: (state) => applyOutcome(state),
  };
}
