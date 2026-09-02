import type { MissionTypeId } from "./mission-type-id";

// ===========================================
// Difficulty
// ===========================================

/** Inclusive integer range of mission difficulties. */
export interface DifficultyBand {
  readonly min: number;
  readonly max: number;
}

/**
 * The difficulty scale every mission lives on. Generation (#61) and the
 * auto-resolver (#62) treat `1` as a skirmish and `10` as a last stand; a
 * type's `difficultyBand` narrows this range, never widens it.
 */
export const MISSION_DIFFICULTY_RANGE: DifficultyBand = { min: 1, max: 10 };

// ===========================================
// Mission type
// ===========================================

/**
 * Static definition of a kind of mission (GDD §5.4). Cross-domain
 * vocabulary: overworld generation reads the band, rewards, expiry and
 * penalty; mapgen (#85) reads `requiredHooks`; UI reads name and
 * description. Instances of a mission attached to a city are the
 * overworld's `Mission` model, which references this by `id`.
 *
 * ```
 *   MissionType (content, static)        Mission (overworld, instance)
 *   ┌────────────────────────────┐       ┌───────────────────────────┐
 *   │ id: "infestation-clearance"│◄──────│ typeId                    │
 *   │ difficultyBand 1..10       │       │ difficulty (within band)  │
 *   │ rewardPerDifficulty        │──────►│ rewards.credits           │
 *   │ expiryDays                 │──────►│ expiresDay                │
 *   │ ignorePenalty              │──────►│ ignorePenalty             │
 *   └────────────────────────────┘       └───────────────────────────┘
 * ```
 */
export interface MissionType {
  /** Unique id; also the key in `MISSION_TYPES`. */
  readonly id: MissionTypeId;
  /** Display name, e.g. `"Infestation Clearance"`. */
  readonly name: string;
  /** One or two sentences for the mission list and briefing. */
  readonly description: string;
  /** Difficulties this type is generated at, within `MISSION_DIFFICULTY_RANGE`. */
  readonly difficultyBand: DifficultyBand;
  /** Credits awarded per point of difficulty on success. */
  readonly rewardPerDifficulty: number;
  /** Base days a generated mission stays available before it expires. */
  readonly expiryDays: number;
  /** Infestation added to the host city when the mission expires unplayed. */
  readonly ignorePenalty: number;
  /**
   * Map hooks a tactical map must provide for this type (deploy zones,
   * objectives, extraction, ...). Reserved for the mission → map-recipe
   * adapter (#85); empty in M1.
   */
  readonly requiredHooks: readonly string[];
}
