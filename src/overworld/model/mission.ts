import type { BiomeId } from "../../content/model/biome-id";
import type { MapSizeId } from "../../content/model/map-size-id";
import type { MissionTypeId } from "../../content/model/mission-type-id";
import type { SettlementScale } from "../../content/model/settlement-scale";
import type { CityId } from "./city";

// ===========================================
// Ids
// ===========================================

/**
 * Id of a mission instance, issued by core's `IdGenerator` with the
 * `"mission"` prefix (e.g. `"mission-4"`). Plain string (ADR 0003 §2.4).
 */
export type MissionId = string;

// ===========================================
// Map parameters
// ===========================================

/**
 * What the mission asks map generation for, in overworld vocabulary.
 * Plain data so the M1.5 adapter (#85) can turn it, plus the mission
 * type's hook requirements, into a mapgen `MapRecipe` without the
 * overworld importing `mapgen/`.
 */
export interface MissionMapParams {
  /** Biome of the host region. */
  readonly biome: BiomeId;
  /** How built-up the site is. */
  readonly settlement: SettlementScale;
  /** Named map size; mapgen resolves it to tiles. */
  readonly size: MapSizeId;
  /**
   * Seed for the map's RNG, drawn from the campaign RNG when the mission
   * is generated so the same mission always yields the same map. Free
   * text; mapgen hashes it.
   */
  readonly seed: string;
}

// ===========================================
// Rewards
// ===========================================

/**
 * What a mission pays on success. Credits only in M1; an object rather
 * than a number so later rewards (parts, intel) are additive fields.
 */
export interface MissionRewards {
  /** Whole credits awarded for a won mission. */
  readonly credits: number;
}

// ===========================================
// Mission
// ===========================================

/**
 * A mission instance attached to a city (GDD §5.4). Generated per day by
 * the mission tick (#61) from a `MissionType` and the host city's region,
 * launched with a `Deployment`, and turned into a `MissionResult` by a
 * `MissionResolver`. Plain serializable data inside the overworld slice.
 *
 * ```
 *   MissionType (content)     Mission (this)              City / Region
 *   ┌────────────────────┐    ┌───────────────────────┐   ┌─────────────┐
 *   │ id ────────────────┼───►│ typeId                │   │ city.id ◄───┼── cityId
 *   │ difficultyBand ────┼───►│ difficulty            │   │ region.biome┼──► mapParams.biome
 *   │ rewardPerDifficulty┼───►│ rewards.credits       │   └─────────────┘
 *   │ expiryDays ────────┼───►│ createdDay, expiresDay│
 *   │ ignorePenalty ─────┼───►│ ignorePenalty         │
 *   └────────────────────┘    └───────────────────────┘
 * ```
 *
 * Values copied from the type (`rewards`, `ignorePenalty`) are frozen
 * into the instance at generation so later tuning changes never alter a
 * mission the player can already see.
 */
export interface Mission {
  /** Unique id from the id generator. */
  readonly id: MissionId;
  /** Key into `MISSION_TYPES`. */
  readonly typeId: MissionTypeId;
  /** The city the mission is attached to. */
  readonly cityId: CityId;
  /**
   * Integer within `MISSION_DIFFICULTY_RANGE` and the type's band:
   * `1` is a skirmish, `10` a last stand.
   */
  readonly difficulty: number;
  /** Parameters for generating the tactical map. */
  readonly mapParams: MissionMapParams;
  /** What success pays. */
  readonly rewards: MissionRewards;
  /** Overworld day the mission appeared. */
  readonly createdDay: number;
  /**
   * First overworld day on which the mission is gone: it can be launched
   * while `createdDay <= day < expiresDay`. Always after `createdDay`.
   */
  readonly expiresDay: number;
  /** Infestation added to the host city when the mission expires unplayed. */
  readonly ignorePenalty: number;
}
