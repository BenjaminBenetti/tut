// ===========================================
// Identifiers and slots
// ===========================================

/** Identifies a part definition in the catalogue, e.g. `"chassis-vanguard"`. */
export type PartId = string;

/** Every slot a mech has, in mech-bay display order. */
export const PART_SLOTS = [
  "chassis",
  "legs",
  "arms",
  "arm-weapon",
  "back-weapon",
  "utility",
] as const;

/**
 * A slot on a mech. Chassis, legs, arms and each weapon hold exactly one
 * part; `utility` holds up to the chassis' `utilitySlots` parts.
 *
 * ```
 *              ┌──────────────┐
 *              │ back-weapon  │
 *   ┌───────┐  ├──────────────┤  ┌────────────┐
 *   │ arms  ├──┤   chassis    ├──┤ arm-weapon │
 *   └───────┘  │ (utility ×n) │  └────────────┘
 *              ├──────────────┤
 *              │     legs     │
 *              └──────────────┘
 * ```
 */
export type PartSlot = (typeof PART_SLOTS)[number];

/** Slots that hold parts fitted onto a chassis, i.e. everything but the chassis. */
export type ComponentSlot = Exclude<PartSlot, "chassis">;

/** Progression tier. Tier 1 is available from the start of a campaign. */
export type PartTier = 1 | 2 | 3;

// ===========================================
// Stats
// ===========================================

/**
 * Stat contribution of one part. A mech's stat sheet is the sum over its
 * fitted parts, so every field is a signed delta and zero means "no effect".
 */
export interface PartStats {
  /** Protective bulk; higher absorbs more damage. */
  readonly armor: number;
  /** Movement contribution in tiles per action; heavy parts go negative. */
  readonly mobility: number;
  /** Heat per turn: positive generates, negative dissipates. */
  readonly heat: number;
  /** Power per turn: positive supplies, negative draws. The chassis supplies; most fitted parts draw. */
  readonly power: number;
  /** Hit-chance modifier in percentage points. */
  readonly accuracy: number;
  /** Damage output; only weapons contribute. */
  readonly firepower: number;
  /** Mass in tonnes. Fitted parts count against the chassis' `maxWeight`. */
  readonly weight: number;
}

/** Every `PartStats` field, for iteration when aggregating a stat sheet. */
export const PART_STAT_KEYS = [
  "armor",
  "mobility",
  "heat",
  "power",
  "accuracy",
  "firepower",
  "weight",
] as const satisfies readonly (keyof PartStats)[];

// ===========================================
// Parts
// ===========================================

/** What a chassis can carry. Bounds the parts fitted onto it, not the chassis itself. */
export interface ChassisCapacity {
  /** Total `weight` of fitted (non-chassis) parts the chassis can bear. */
  readonly maxWeight: number;
  /** Power available to fitted parts. Mirrors the chassis' own `stats.power`. */
  readonly powerOutput: number;
  /** How many `utility` parts may be fitted. */
  readonly utilitySlots: number;
}

/** Fields shared by every part regardless of slot. */
interface MechPartBase {
  readonly id: PartId;
  readonly name: string;
  readonly tier: PartTier;
  /** Purchase price in credits; always positive. */
  readonly cost: number;
  readonly stats: PartStats;
  /** One or two sentences of flavour for the mech bay. */
  readonly description: string;
}

/** The frame every other part is fitted onto. Declares the mech's carrying capacity. */
export interface ChassisPart extends MechPartBase {
  readonly slot: "chassis";
  readonly capacity: ChassisCapacity;
}

/**
 * What a weapon part fires like, beyond the `firepower` and `accuracy`
 * its stats already contribute (#532). Damage comes from `firepower` and
 * the hit chance from `accuracy`, so what is left is how far it reaches
 * and what it punches through — the two things a mech's weapons differ
 * on, and the reason to carry more than one.
 */
export interface PartWeapon {
  /** Tiles the weapon reaches, Manhattan. Positive integer. */
  readonly range: number;
  /** Armor points ignored by each hit. Non-negative. */
  readonly armorPen: number;
}

/** Any part fitted onto a chassis: legs, arms, weapons and utilities. */
export interface ComponentPart extends MechPartBase {
  readonly slot: ComponentSlot;
  /**
   * Present on `arm-weapon` and `back-weapon` parts, absent elsewhere: a
   * set of legs has no reach. A weapon slot without one cannot be fired,
   * which is a content bug rather than a game state — `parts.test.ts`
   * pins that every weapon part carries it.
   */
  readonly weapon?: PartWeapon;
}

/**
 * A part definition from the catalogue, discriminated on `slot`. Plain
 * data: parts are content, never mutated at runtime.
 */
export type MechPart = ChassisPart | ComponentPart;

/** The concrete part type that fits slot `S`, so chassis lookups need no type guard. */
export type PartForSlot<S extends PartSlot> = S extends "chassis"
  ? ChassisPart
  : ComponentPart & { readonly slot: S };

// ===========================================
// Type guards
// ===========================================

/** Narrows a part to a chassis so its `capacity` can be read. */
export function isChassisPart(part: MechPart): part is ChassisPart {
  return part.slot === "chassis";
}
