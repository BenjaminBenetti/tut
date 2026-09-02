import type { MapSizeId } from "./map-size-id";
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
// Hook requirements
// ===========================================

/**
 * A kind of map hook a mission type needs, in shared vocabulary: the kind
 * id (`deploy`, `egg-spawner`, `edge-spawn`, `extraction`, ...) and how
 * many, optionally growing with difficulty. Map generation (#85) turns
 * this into its own `HookRequirement` with pass masks and distances, so
 * content never imports `mapgen/`.
 *
 * ```
 *   count at difficulty d = count + floor(countPerDifficulty × (d − 1))
 * ```
 */
export interface MissionHookRequirement {
  /** Hook kind id known to map generation's placer registry. */
  readonly kind: string;
  /** Hooks required at the lowest difficulty. */
  readonly count: number;
  /** Extra hooks per difficulty step above the lowest; fractional allowed. */
  readonly countPerDifficulty?: number;
}

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
   * objectives, extraction, ...), read by the mission → map-recipe
   * adapter (#85). Every type needs at least a deploy zone and an
   * extraction.
   */
  readonly requiredHooks: readonly MissionHookRequirement[];
  /** Map size the mission generator uses unless the site says otherwise. */
  readonly mapSize: MapSizeId;
}
