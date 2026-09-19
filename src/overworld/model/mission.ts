import type { BiomeId } from "../../content/model/biome-id";
import type { DeployableTypeId } from "../../content/model/deployable-type-id";
import type { DeployableId } from "./deployable";
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
  /** City infestation at mission creation, expressed as a whole map band (0–10). */
  readonly infestation?: number;
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
  /**
   * A harvestable tech carcass on the map (#1171): a dead bug rich in
   * tech points that an infantry squad can strip. Decided once when the
   * mission is generated so the offer can advertise it; absent means
   * the map has none.
   */
  readonly techCarcass?: TechCarcassParams;
}

/** What a mission's tech carcass is worth. */
export interface TechCarcassParams {
  /** Whole tech points a squad earns by harvesting it. */
  readonly techPoints: number;
}

// ===========================================
// Installation defence
// ===========================================

/**
 * What a defend-installation mission (#1175) is defending and for how
 * long, frozen when the mission is offered so the briefing, the map and
 * the waves can never disagree.
 *
 * ```
 *   region deployables ──rng.fork(`defence:${id}`)──► deployableId, installation
 *   INSTALLATION_SITES[installation].generators ───► generators
 *   region mean infestation ─────────────────────► waves (mission tuning)
 * ```
 */
export interface InstallationDefence {
  /** Which kind of installation is under attack; picks the landmark building. */
  readonly installation: DeployableTypeId;
  /** The specific installation the offer was rolled for, for the map cue. */
  readonly deployableId: DeployableId;
  /** Generators the map stands around the landmark; every one is an objective. */
  readonly generators: number;
  /** Bug waves that will land before the mission can be completed. At least one. */
  readonly waves: number;
}

// ===========================================
// Rewards
// ===========================================

/**
 * What a mission pays on success. An object rather than a number so
 * later rewards (parts, intel) are additive fields.
 */
export interface MissionRewards {
  /** Whole credits awarded for a won mission. */
  readonly credits: number;
  /** Whole tech points awarded for a won mission (#1171). */
  readonly techPoints: number;
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
 *   (*) A city biome overrides its region default.
 *
 *   MissionType (content)     Mission (this)              City / Region
 *   ┌────────────────────┐    ┌───────────────────────┐   ┌─────────────┐
 *   │ id ────────────────┼───►│ typeId                │   │ city.id ◄───┼── cityId
 *   │ difficultyBand ────┼───►│ difficulty            │   │ biome (*)   ┼──► mapParams.biome
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
  /**
   * What a defend-installation mission is holding (#1175). Present
   * exactly when `typeId` is `"defend-installation"`; a clearance has
   * none, and an older save's missions have none either.
   */
  readonly defence?: InstallationDefence;
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
