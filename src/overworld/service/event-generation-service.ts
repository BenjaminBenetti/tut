import type { IdGenerator } from "../../core/model/id-generator";
import type { Rng } from "../../core/model/rng";
import type { EconomyState } from "../../economy/model/economy-state";
import type { TransactionService } from "../../economy/model/transaction-service";
import type { CampaignApplied, CampaignEvent } from "../model/campaign-event";
import type { CampaignState } from "../model/campaign-state";
import type { City } from "../model/city";
import { MIN_INFESTATION } from "../model/city";
import { EVENT_EXPIRED } from "../model/event-expired-event";
import { EVENT_OFFERED } from "../model/event-offered-event";
import { EVENT_RESOLVED } from "../model/event-resolved-event";
import type { EventChoice, EventType } from "../model/event-type";
import type { EventTuning } from "../model/event-tuning";
import type { EventTypeCatalogue } from "../model/event-type-catalogue";
import type { OverworldState } from "../model/overworld-state";
import type { PendingEvent } from "../model/pending-event";
import { PENDING_EVENT_ID_PREFIX } from "../model/pending-event";
import type { TickStep } from "../model/tick-step";
import { resolveEvent } from "./event-resolution-service";

// ===========================================
// Types
// ===========================================

/** What the event step draws on; the tick supplies day, RNG and ids per run. */
export interface EventStepDeps {
  readonly eventTypes: EventTypeCatalogue;
  readonly eventTuning: EventTuning;
  /** Builds the transaction service for one tick over the tick's id generator. */
  readonly createTransactions: (ids: IdGenerator) => TransactionService;
}

/** What generating one day's event needs. */
export interface EventGenerationDeps {
  readonly day: number;
  /** Stream for the offer roll, the type and the city; the caller forks it per tick. */
  readonly rng: Rng;
  /** Issues event ids with the `"event"` prefix. */
  readonly ids: IdGenerator;
  readonly tuning: EventTuning;
  readonly eventTypes: EventTypeCatalogue;
}

/** The slices expiry replaces, plus what happened. */
export interface EventExpiryApplied {
  readonly overworld: OverworldState;
  readonly economy: EconomyState;
  readonly events: readonly CampaignEvent[];
}

// ===========================================
// Constants
// ===========================================

/** Name of the step in the default pipeline; also its RNG fork label. */
export const EVENT_STEP_NAME = "events";

// ===========================================
// Generation
// ===========================================

/**
 * Rolls for the day's event (GDD §5.4). Nothing happens while an event
 * is already pending: the player answers one thing at a time. Draw order,
 * part of the determinism contract:
 *
 * ```
 *   1. chance(dailyEventChance)                    any event today?
 *   2. pickWeighted(eligible types, weight)        which; a city-bound type is
 *                                                  eligible only if a city is infested
 *   3. pick(infested cities)                       only for a city-bound type
 * ```
 *
 * Returns the input state by identity when no event is offered.
 */
export function generateEvent(
  overworld: OverworldState,
  deps: EventGenerationDeps,
): CampaignApplied<OverworldState> {
  if (overworld.pendingEvents.length > 0) {
    return { state: overworld, events: [] };
  }
  if (!deps.rng.chance(deps.tuning.dailyEventChance)) {
    return { state: overworld, events: [] };
  }
  const infested = overworld.map.cities.filter(
    (c) => c.infestation > MIN_INFESTATION,
  );
  const eligible = deps.eventTypes
    .listEventTypes()
    .filter((type) => !type.requiresCity || infested.length > 0);
  if (eligible.length === 0) {
    return { state: overworld, events: [] };
  }
  const type = deps.rng.pickWeighted(eligible, (t) => t.weight);
  const city: City | undefined = type.requiresCity
    ? deps.rng.pick(infested)
    : undefined;
  const event: PendingEvent = {
    id: deps.ids.nextId(PENDING_EVENT_ID_PREFIX),
    typeId: type.id,
    ...(city === undefined ? {} : { cityId: city.id }),
    createdDay: deps.day,
    expiresDay: deps.day + deps.tuning.expiryDays,
  };
  return {
    state: { ...overworld, pendingEvents: [...overworld.pendingEvents, event] },
    events: [{ type: EVENT_OFFERED, payload: { event } }],
  };
}

// ===========================================
// Expiry
// ===========================================

/**
 * Resolves every pending event whose `expiresDay` has arrived
 * (`day >= expiresDay`) with its default choice: the type's
 * `defaultChoiceId`, else its first choice. A default the treasury
 * cannot cover falls through to the type's other choices in order; if
 * none can be paid for, the event lapses without effect. Each lapse is
 * reported as `EventExpired` in place of the resolver's `EventResolved`.
 * Returns the input slices by identity when nothing expired.
 */
export function expireEvents(
  state: CampaignState,
  day: number,
  deps: Pick<EventStepDeps, "eventTypes"> & {
    readonly transactions: TransactionService;
  },
): EventExpiryApplied {
  let overworld = state.overworld;
  let economy = state.economy;
  const events: CampaignEvent[] = [];
  for (const pending of state.overworld.pendingEvents) {
    if (day < pending.expiresDay) {
      continue;
    }
    const type = deps.eventTypes.getEventType(pending.typeId);
    const applied = type
      ? applyFirstAffordable(
          { ...state, overworld, economy },
          pending,
          defaultsFor(type),
          day,
          deps,
        )
      : undefined;
    if (applied) {
      overworld = applied.overworld;
      economy = applied.economy;
      events.push(...applied.events);
    } else {
      overworld = {
        ...overworld,
        pendingEvents: overworld.pendingEvents.filter((e) => e !== pending),
      };
      events.push({
        type: EVENT_EXPIRED,
        payload: {
          eventId: pending.id,
          typeId: pending.typeId,
          ...(pending.cityId === undefined ? {} : { cityId: pending.cityId }),
        },
      });
    }
  }
  return { overworld, economy, events };
}

// ===========================================
// Tick step
// ===========================================

/**
 * The events step of the day tick: expire lapsed events first, then roll
 * for a new one if nothing is pending. Registered after mission
 * generation so an event never pre-empts the day's missions.
 */
export function createEventStep<TState extends CampaignState>(
  deps: EventStepDeps,
): TickStep<TState> {
  return {
    name: EVENT_STEP_NAME,
    run: (state, ctx) => {
      const expired = expireEvents(state, ctx.day, {
        eventTypes: deps.eventTypes,
        transactions: deps.createTransactions(ctx.ids),
      });
      const generated = generateEvent(expired.overworld, {
        day: ctx.day,
        rng: ctx.rng,
        ids: ctx.ids,
        tuning: deps.eventTuning,
        eventTypes: deps.eventTypes,
      });
      const events = [...expired.events, ...generated.events];
      if (events.length === 0) {
        return { state, events };
      }
      return {
        state: {
          ...state,
          overworld: generated.state,
          economy: expired.economy,
        },
        events,
      };
    },
  };
}

// ===========================================
// Helpers
// ===========================================

/** The type's choices with the default first, then the rest in catalogue order. */
function defaultsFor(type: EventType): readonly EventChoice[] {
  const preferred =
    type.choices.find((c) => c.id === type.defaultChoiceId) ?? type.choices[0];
  if (preferred === undefined) {
    return [];
  }
  return [preferred, ...type.choices.filter((c) => c !== preferred)];
}

/**
 * Resolves `pending` with the first of `choices` the treasury can cover,
 * swapping the resolver's closing `EventResolved` for `EventExpired`.
 * Returns undefined when no choice could be applied.
 */
function applyFirstAffordable(
  state: CampaignState,
  pending: PendingEvent,
  choices: readonly EventChoice[],
  day: number,
  deps: Pick<EventStepDeps, "eventTypes"> & {
    readonly transactions: TransactionService;
  },
): EventExpiryApplied | undefined {
  for (const choice of choices) {
    const result = resolveEvent(state, pending.id, choice.id, day, deps);
    if (!result.ok) {
      if (result.error.code === "insufficient-credits") {
        continue;
      }
      return undefined;
    }
    const events = result.value.events.filter((e) => e.type !== EVENT_RESOLVED);
    events.push({
      type: EVENT_EXPIRED,
      payload: {
        eventId: pending.id,
        typeId: pending.typeId,
        ...(pending.cityId === undefined ? {} : { cityId: pending.cityId }),
        choiceId: choice.id,
      },
    });
    return {
      overworld: result.value.overworld,
      economy: result.value.economy,
      events,
    };
  }
  return undefined;
}
