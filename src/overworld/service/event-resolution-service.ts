import type { Result } from "../../core/model/result";
import { err, ok } from "../../core/model/result";
import type { EconomyState } from "../../economy/model/economy-state";
import type { TransactionService } from "../../economy/model/transaction-service";
import type { CampaignEvent } from "../model/campaign-event";
import type { CampaignState } from "../model/campaign-state";
import type { City } from "../model/city";
import { clampInfestation } from "../model/city";
import { CITY_INFESTATION_CHANGED } from "../model/city-infestation-changed-event";
import type { EventResolutionError } from "../model/event-resolution-error";
import { EVENT_RESOLVED } from "../model/event-resolved-event";
import type { EventChoiceId, EventEffect } from "../model/event-type";
import type { EventTypeCatalogue } from "../model/event-type-catalogue";
import type { OverworldState } from "../model/overworld-state";
import type { PendingEvent, PendingEventId } from "../model/pending-event";
import type { StipendModifier } from "../model/stipend-modifier";
import { MAX_THREAT, MIN_THREAT } from "../model/threat";
import { THREAT_CHANGED } from "../model/threat-changed-event";

// ===========================================
// Types
// ===========================================

/** What resolving an event needs injected. */
export interface EventResolutionDeps {
  readonly eventTypes: EventTypeCatalogue;
  /** The one door credits move through (GDD §5.5). */
  readonly transactions: TransactionService;
}

/** The slices a resolution replaces, plus what happened. */
export interface EventResolutionApplied {
  readonly overworld: OverworldState;
  readonly economy: EconomyState;
  readonly events: readonly CampaignEvent[];
}

/** Outcome of `ResolveEvent`: new slices, or why it was refused. */
export type EventResolutionResult = Result<
  EventResolutionApplied,
  EventResolutionError
>;

/** Mutable working copy the effect interpreter accumulates into. */
interface Working {
  overworld: OverworldState;
  economy: EconomyState;
  readonly events: CampaignEvent[];
}

// ===========================================
// Resolution
// ===========================================

/**
 * Answers a pending event with one of its choices (GDD §5.4): applies
 * every effect of the choice in order through the generic interpreter,
 * removes the event and reports `EventResolved` last. Pure over its
 * inputs; on any error the state is returned untouched, including when a
 * `credits` effect after another effect cannot be covered.
 *
 * ```
 *   event?   ──no──► unknown-event
 *   type?    ──no──► unknown-event-type
 *   choice?  ──no──► unknown-choice
 *   for each effect (in order):
 *     credits            ──► earn / spend (kind "event", ref = event id) ──err──► insufficient-credits
 *     cityInfestation    ──► attached city ± delta, clamped   (+ CityInfestationChanged)
 *     threat             ──► stored threat ± delta, clamped, and threatOffset by
 *                            the amount that actually moved (+ ThreatChanged)
 *     stipendMultiplier  ──► stipendModifiers + { factor, daysLeft: days }
 *   pendingEvents − event; events + EventResolved
 * ```
 *
 * Nothing here switches on the event type: a new event is data alone.
 *
 * @throws {Error} if a city-scoped effect runs on an event with no city
 *   or a city not on the map: a content or generation bug, not a game state.
 */
export function resolveEvent(
  state: CampaignState,
  eventId: PendingEventId,
  choiceId: EventChoiceId,
  day: number,
  deps: EventResolutionDeps,
): EventResolutionResult {
  const pending = state.overworld.pendingEvents.find((e) => e.id === eventId);
  if (pending === undefined) {
    return err({ code: "unknown-event", eventId });
  }
  const type = deps.eventTypes.getEventType(pending.typeId);
  if (type === undefined) {
    return err({ code: "unknown-event-type", eventId, typeId: pending.typeId });
  }
  const choice = type.choices.find((c) => c.id === choiceId);
  if (choice === undefined) {
    return err({ code: "unknown-choice", eventId, choiceId });
  }

  const working: Working = {
    overworld: state.overworld,
    economy: state.economy,
    events: [],
  };
  for (const effect of choice.effects) {
    const failure = applyEffect(working, effect, pending, day, deps);
    if (failure !== undefined) {
      return err(failure);
    }
  }

  working.overworld = {
    ...working.overworld,
    pendingEvents: working.overworld.pendingEvents.filter((e) => e !== pending),
  };
  working.events.push({
    type: EVENT_RESOLVED,
    payload: {
      eventId: pending.id,
      typeId: pending.typeId,
      choiceId,
      ...(pending.cityId === undefined ? {} : { cityId: pending.cityId }),
    },
  });
  return ok({
    overworld: working.overworld,
    economy: working.economy,
    events: working.events,
  });
}

// ===========================================
// Effect interpreter
// ===========================================

/**
 * Applies one effect to the working copy, or returns why it could not
 * be. The one place effect kinds are enumerated; exhaustive by `never`.
 */
function applyEffect(
  working: Working,
  effect: EventEffect,
  pending: PendingEvent,
  day: number,
  deps: EventResolutionDeps,
): EventResolutionError | undefined {
  switch (effect.kind) {
    case "credits":
      return applyCredits(working, effect.amount, pending.id, day, deps);
    case "cityInfestation":
      applyCityInfestation(
        working,
        effect.delta,
        attachedCity(working, pending),
      );
      return undefined;
    case "threat":
      applyThreat(working, effect.delta);
      return undefined;
    case "stipendMultiplier":
      applyStipendMultiplier(working, {
        factor: effect.factor,
        daysLeft: effect.days,
      });
      return undefined;
    default: {
      const exhaustive: never = effect;
      throw new Error(`Unhandled effect ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** Moves credits through the transaction service as an `event` entry against the event id. */
function applyCredits(
  working: Working,
  amount: number,
  ref: PendingEventId,
  day: number,
  deps: EventResolutionDeps,
): EventResolutionError | undefined {
  if (amount >= 0) {
    const earned = deps.transactions.earn(
      working.economy,
      amount,
      "event",
      ref,
      day,
    );
    working.economy = earned.state;
    working.events.push(...earned.events);
    return undefined;
  }
  const spent = deps.transactions.spend(
    working.economy,
    -amount,
    "event",
    ref,
    day,
  );
  if (!spent.ok) {
    return {
      code: "insufficient-credits",
      required: spent.error.required,
      available: spent.error.available,
    };
  }
  working.economy = spent.value.state;
  working.events.push(...spent.value.events);
  return undefined;
}

/** Shifts the attached city's infestation, clamped, noting the change. */
function applyCityInfestation(
  working: Working,
  delta: number,
  city: City,
): void {
  const to = clampInfestation(city.infestation + delta);
  if (to === city.infestation) {
    return;
  }
  const map = working.overworld.map;
  working.overworld = {
    ...working.overworld,
    map: {
      regions: map.regions,
      cities: map.cities.map((c) =>
        c.id === city.id ? { ...c, infestation: to } : c,
      ),
    },
  };
  working.events.push({
    type: CITY_INFESTATION_CHANGED,
    payload: { cityId: city.id, from: city.infestation, to },
  });
}

/**
 * Shifts the stored global threat, clamped, and carries the shift into
 * `threatOffset` so the daily recompute keeps it (#307). Only the part of
 * `delta` the clamp let through reaches the offset.
 */
function applyThreat(working: Working, delta: number): void {
  const from = working.overworld.threat;
  const to = Math.min(MAX_THREAT, Math.max(MIN_THREAT, from + delta));
  if (to === from) {
    return;
  }
  working.overworld = {
    ...working.overworld,
    threat: to,
    threatOffset: working.overworld.threatOffset + (to - from),
  };
  working.events.push({ type: THREAT_CHANGED, payload: { from, to } });
}

/** Queues a stipend window; overlapping windows multiply when paid. */
function applyStipendMultiplier(
  working: Working,
  modifier: StipendModifier,
): void {
  working.overworld = {
    ...working.overworld,
    stipendModifiers: [...(working.overworld.stipendModifiers ?? []), modifier],
  };
}

/** The city a city-scoped effect acts on, from the working map. */
function attachedCity(working: Working, pending: PendingEvent): City {
  if (pending.cityId === undefined) {
    throw new Error(
      `Event "${pending.id}" of type "${pending.typeId}" has a city-scoped effect but no city`,
    );
  }
  const city = working.overworld.map.cities.find(
    (c) => c.id === pending.cityId,
  );
  if (city === undefined) {
    throw new Error(
      `Event "${pending.id}" names unknown city "${pending.cityId}"`,
    );
  }
  return city;
}
