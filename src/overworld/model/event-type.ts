// ===========================================
// Event type ids
// ===========================================

/**
 * Key of an event type in `overworld/data/event-types.ts`. A closed union
 * rather than a plain string so the data record is checked for
 * completeness by the compiler: adding a member here without a matching
 * entry in `EVENT_TYPES` fails to build.
 */
export type EventTypeId =
  "funding-review" | "research-find" | "city-plea" | "spore-shower";

/**
 * Runtime list of every `EventTypeId`, in a fixed order, for validation
 * and for tests that must cover each type. The `satisfies` check rejects
 * a stray member; the data test checks the list is complete.
 */
export const EVENT_TYPE_IDS = [
  "funding-review",
  "research-find",
  "city-plea",
  "spore-shower",
] as const satisfies readonly EventTypeId[];

/**
 * Narrows an arbitrary string (from a save file or a pending event
 * record, for instance) to an `EventTypeId`.
 */
export function isEventTypeId(value: string): value is EventTypeId {
  return (EVENT_TYPE_IDS as readonly string[]).includes(value);
}

// ===========================================
// Effects
// ===========================================
//
// Effects are the whole vocabulary of what an event can do. Each one is a
// `kind` tag plus numeric payload, so the resolution service (#70) can
// apply any choice with one switch on `kind` and never needs to know
// which event it came from.

/**
 * Moves credits in or out of the treasury. Recorded in the economy ledger
 * as an `event` transaction.
 */
export interface CreditsEffect {
  readonly kind: "credits";
  /** Signed whole credits: positive pays the player, negative charges them. */
  readonly amount: number;
}

/**
 * Changes the infestation of the city the event instance is attached to.
 * City-scoped: only event types with `requiresCity` may use it.
 */
export interface CityInfestationEffect {
  readonly kind: "cityInfestation";
  /**
   * Signed integer added to the city's infestation. The applier clamps
   * the result to the city's infestation bounds.
   */
  readonly delta: number;
}

/** Changes the global threat level (GDD §5.1). */
export interface ThreatEffect {
  readonly kind: "threat";
  /**
   * Signed integer added to the threat level. The applier clamps the
   * result to the 0–100 threat range.
   */
  readonly delta: number;
}

/** Scales the daily stipend (GDD §5.5) for a run of upcoming days. */
export interface StipendMultiplierEffect {
  readonly kind: "stipendMultiplier";
  /**
   * Multiplier applied to each affected day's stipend: `1.5` is a fifty
   * percent raise, `0.5` a fifty percent cut. Always positive.
   */
  readonly factor: number;
  /**
   * How many upcoming stipend payments the factor applies to, starting
   * with the first one after the event resolves. Positive integer.
   */
  readonly days: number;
}

/**
 * Everything a choice can do, discriminated on `kind`. Payloads are
 * numeric by design (see the section note above).
 */
export type EventEffect =
  | CreditsEffect
  | CityInfestationEffect
  | ThreatEffect
  | StipendMultiplierEffect;

/** The `kind` tag of an `EventEffect`. */
export type EventEffectKind = EventEffect["kind"];

/**
 * Runtime list of every `EventEffectKind`, for validation and for tests
 * that must cover each kind. Kept in sync with the union by `satisfies`.
 */
export const EVENT_EFFECT_KINDS = [
  "credits",
  "cityInfestation",
  "threat",
  "stipendMultiplier",
] as const satisfies readonly EventEffectKind[];

/**
 * Effect kinds that act on the attached city. Only event types with
 * `requiresCity` may use them, since a city-less event has nothing to
 * apply them to. Add a kind here when it targets the attached city.
 */
export const CITY_SCOPED_EFFECT_KINDS = [
  "cityInfestation",
] as const satisfies readonly EventEffectKind[];

/** The subset of `EventEffect` whose kind is in `CITY_SCOPED_EFFECT_KINDS`. */
export type CityScopedEffect = Extract<
  EventEffect,
  { kind: (typeof CITY_SCOPED_EFFECT_KINDS)[number] }
>;

/** Narrows an effect to one that acts on the attached city. */
export function isCityScopedEffect(
  effect: EventEffect,
): effect is CityScopedEffect {
  return (CITY_SCOPED_EFFECT_KINDS as readonly EventEffectKind[]).includes(
    effect.kind,
  );
}

// ===========================================
// Choices and event types
// ===========================================

/**
 * Token in an event's `title` or `text` that presentation replaces with
 * the attached city's name. Only `requiresCity` types may use it.
 */
export const CITY_NAME_TOKEN = "{city}";

/** Id of a choice, unique within its event type, e.g. `"send-relief"`. */
export type EventChoiceId = string;

/** One option the player can pick when an event fires. */
export interface EventChoice {
  /** Unique within the owning event type. */
  readonly id: EventChoiceId;
  /** Button label shown to the player, e.g. `"Send relief convoys"`. */
  readonly label: string;
  /** What picking this choice does. At least one effect, applied in order. */
  readonly effects: readonly EventEffect[];
}

/**
 * Static definition of a non-combat event with choices (GDD §5.4). One
 * record per type lives in `overworld/data/event-types.ts`; pending
 * event instances (#70) reference it by `id`, and the generation tick
 * (#71) draws types by `weight`.
 *
 * ```
 *   EventType (catalogue, static)          PendingEvent (instance, #70)
 *   ┌────────────────────────────┐         ┌─────────────────────────┐
 *   │ id: "city-plea"            │◄────────│ typeId: "city-plea"     │
 *   │ title / text ({city})      │         │ cityId?  (requiresCity) │
 *   │ requiresCity: true         │         │ createdDay, expiresDay  │
 *   │ weight: 4                  │         └─────────────────────────┘
 *   │ choices ──┬─ "send-relief" ── effects [ credits −600,
 *   │           │                             cityInfestation −10 ]
 *   │           └─ "turn-away" ──── effects [ threat +3 ]
 *   └────────────────────────────┘
 * ```
 *
 * Pure data: no resolution logic lives here.
 */
export interface EventType {
  /** Unique catalogue key. */
  readonly id: EventTypeId;
  /** Headline shown on the event card. */
  readonly title: string;
  /**
   * Body copy. May contain `CITY_NAME_TOKEN` when `requiresCity` is set;
   * presentation substitutes the attached city's name.
   */
  readonly text: string;
  /**
   * Whether every instance must be attached to a city. Only such types
   * may use city-scoped effects (`CITY_SCOPED_EFFECT_KINDS`) or the
   * city name token.
   */
  readonly requiresCity: boolean;
  /**
   * Relative likelihood of this type when the generation tick picks one
   * via `Rng.pickWeighted`. Positive; weights need not sum to 1.
   */
  readonly weight: number;
  /** The options offered to the player. At least one. */
  readonly choices: readonly EventChoice[];
}
