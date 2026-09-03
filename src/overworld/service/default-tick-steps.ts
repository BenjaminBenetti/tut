import type { IdGenerator } from "../../core/model/id-generator";
import type { EconomyTuning } from "../../economy/model/economy-tuning";
import type { TransactionService } from "../../economy/model/transaction-service";
import { applyStipend } from "../../economy/service/income-service";
import type { CampaignState } from "../model/campaign-state";
import type { DeployableTypeCatalogue } from "../model/deployable-type-catalogue";
import type { InfestationTuning } from "../model/infestation-tuning";
import type { MissionTuning } from "../model/mission-tuning";
import { THREAT_CHANGED } from "../model/overworld-domain-event";
import type { ThreatTuning } from "../model/threat-tuning";
import type { TickStep } from "../model/tick-step";
import { chargeUpkeep } from "./deployable-effects-service";
import { applyGrowth } from "./infestation-growth-service";
import { applySpread } from "./infestation-spread-service";
import type { MissionTypeCatalogue } from "./mission-generation-service";
import { expireMissions, generateMissions } from "./mission-generation-service";
import { applyOutcome } from "./outcome-service";
import { computeThreat, unfestedFraction } from "./threat-service";

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
  readonly threatTuning: ThreatTuning;
  readonly economyTuning: EconomyTuning;
}

// ===========================================
// Step names
// ===========================================

/** Names of the M1 steps, in pipeline order. Also the RNG fork labels. */
export const TICK_STEP_NAMES = {
  upkeep: "upkeep",
  growth: "growth",
  spread: "spread",
  missionExpiry: "mission-expiry",
  missionGeneration: "mission-generation",
  stipend: "stipend",
  threat: "threat",
  outcome: "outcome",
} as const;

// ===========================================
// Pipeline
// ===========================================

/**
 * The M1 day tick (GDD §5.2), one step per service, in this order:
 *
 * ```
 *   1. upkeep              charge deployables; offline ones stop contributing
 *   2. growth              infested cities grow, less suppression
 *   3. spread              infested cities spread to neighbours; threat seeds clean ones
 *   4. mission-expiry      lapsed missions go; host cities pay the ignore penalty
 *   5. mission-generation  infested cities may offer missions (+ intel bonus)
 *      ── #71 event generation registers here, after missions, before pay ──
 *   6. stipend             Earth pays for the day, scaled by how much is unfested
 *   7. threat              recompute and store global threat
 *   8. outcome             defeat / victory-stub check, once
 * ```
 *
 * Growth and spread read the threat stored by the previous tick; the
 * recompute in step 7 is what the next day sees. Modifiers reach each
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
    missionExpiryStep(),
    missionGenerationStep(deps),
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

/** Grows every infested city, net of the day's suppression. */
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
        ctx.modifiers.suppression,
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

/** Spreads between neighbours and seeds clean cities; always advances cooldowns. */
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

/** Removes lapsed missions and applies their ignore penalties. */
function missionExpiryStep<TState extends CampaignState>(): TickStep<TState> {
  return {
    name: TICK_STEP_NAMES.missionExpiry,
    run: (state) => {
      const expired = expireMissions(state.overworld);
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

/** Offers new missions to infested cities without one. */
function missionGenerationStep<TState extends CampaignState>(
  deps: TickDeps,
): TickStep<TState> {
  return {
    name: TICK_STEP_NAMES.missionGeneration,
    run: (state, ctx) => {
      const generated = generateMissions(state.overworld, {
        intelBonus: ctx.modifiers.intelBonus,
        rng: ctx.rng,
        ids: ctx.ids,
        tuning: deps.missionTuning,
        missionTypes: deps.missionTypes,
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

/** Pays the day's stipend, scaled by how much of Earth is unfested. */
function stipendStep<TState extends CampaignState>(
  deps: TickDeps,
): TickStep<TState> {
  return {
    name: TICK_STEP_NAMES.stipend,
    run: (state, ctx) => {
      const paid = applyStipend(
        state.economy,
        unfestedFraction(state.overworld.map),
        ctx.day,
        deps.economyTuning,
        deps.createTransactions(ctx.ids),
      );
      return { state: { ...state, economy: paid.state }, events: paid.events };
    },
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
      const threat = computeThreat(overworld.map, ctx.day, deps.threatTuning);
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

/** Ends the campaign the first day a defeat or victory condition holds. */
function outcomeStep<TState extends CampaignState>(): TickStep<TState> {
  return {
    name: TICK_STEP_NAMES.outcome,
    run: (state) => applyOutcome(state),
  };
}
