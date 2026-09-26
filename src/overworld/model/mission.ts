import type { ActId } from "../../content/model/act-id";
import type { SpeciesMix } from "../../bugs/model/species-mix";
import type { BiomeId } from "../../content/model/biome-id";
import type { InstallationSiteId } from "../../content/model/installation-site-id";
import type { DeployableId } from "./deployable";
import type { MapSizeId } from "../../content/model/map-size-id";
import type { MissionTypeId } from "../../content/model/mission-type-id";
import type { SettlementScale } from "../../content/model/settlement-scale";
import type { SitrepId } from "../../content/model/sitrep-id";
import type { StoryMissionId } from "../../content/model/story-mission-id";
import type { PartId } from "../../roster/model/mech-part";
import type { CityId } from "./city";
import type { CrashSiteSpec } from "./crash-site-spec";
import type { WreckRecoverySpec } from "./wreck-recovery-spec";

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
 *
 * A story defence (campaign arc §6.9: Uplink, Launch Window) holds a
 * story facility instead, which no deployable stands for, so it has no
 * `deployableId`, and its story rule fixes the waves.
 */
export interface InstallationDefence {
  /**
   * Which facility is under attack: a built installation's type, or a
   * story facility. Picks the authored compound and names it.
   */
  readonly installation: InstallationSiteId;
  /**
   * The specific installation the offer was rolled for, for the map cue.
   * Absent on a story defence, whose facility the player never built.
   */
  readonly deployableId?: DeployableId;
  /** Generators the map stands around the facility; every one is an objective. */
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
  /**
   * Parts returned to the stock for a won mission, repeats kept (arc
   * §6.6): a wreck recovery's recovered parts. Absent pays none, which
   * is every other type and every older save's offers.
   */
  readonly parts?: readonly PartId[];
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
 * mission the player can already see. The campaign context (`pinned`,
 * `storyId`, `act`, `sitreps`, `bugMix`, ADR 0013 §2.2) is optional, so
 * offers saved before it existed stay valid.
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
  /**
   * The landing a crash site (campaign arc §6.3) started when it was
   * offered: the city and its infestation before the seed. Present on
   * every `"crash-site"` offer, story ones included; absent on every
   * other type and on offers saved before crash sites existed.
   */
  readonly crashSite?: CrashSiteSpec;
  /**
   * The mech whose wreck a wreck-recovery mission strips (arc §6.6).
   * Present exactly when `typeId` is `"wreck-recovery"`; the map sizes
   * the wreck hook from its chassis and the tactical layer draws it from
   * its loadout.
   */
  readonly wreck?: WreckRecoverySpec;
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
  /**
   * A story or hive offer: it sits outside the board cap and the expiry
   * step never removes it; only its own rule does. Absent (the norm,
   * and every older save's offers) means an offer that expires on
   * `expiresDay`. An event offer that must still lapse (Defend
   * Installation, Wreck Recovery) is not pinned: it sits outside
   * the cap because its type's offer entry is a trigger rule (ADR 0013
   * §2.4).
   */
  readonly pinned?: boolean;
  /** The story mission this offer is; absent for every ordinary offer. */
  readonly storyId?: StoryMissionId;
  /**
   * The act the offer was made in, frozen at offer so a later act change
   * never alters a mission the player can already see. Absent on offers
   * saved before acts existed.
   */
  readonly act?: ActId;
  /**
   * The situation reports rolled onto the offer (campaign arc §11),
   * frozen at offer so the briefing, the map and the mission always
   * agree. Never holds a duplicate; order is the roll's. Absent (the
   * norm before mission 10, on story offers, and on every offer saved
   * before sitreps existed) means none.
   */
  readonly sitreps?: readonly SitrepId[];
  /**
   * The species the mission's spawners and edge waves roll, frozen at
   * offer from the bestiary for the act and the missions played in it
   * (ADR 0013 §2.6), so a debut after the offer never changes a mission
   * the player can already see. Absent on offers saved before the
   * bestiary existed: those roll each species' `hatchWeight`, as before.
   */
  readonly bugMix?: SpeciesMix;
}

// ===========================================
// Queries
// ===========================================

/**
 * Whether `mission` has lapsed on `day`: its `expiresDay` has arrived
 * (`day >= expiresDay`) and it is not `pinned`. A pinned offer never
 * lapses on its own (ADR 0013 §2.2); its rule removes it. The expiry
 * tick and the launch check both ask this, so they cannot disagree.
 */
export function isMissionExpired(mission: Mission, day: number): boolean {
  return mission.pinned !== true && day >= mission.expiresDay;
}
