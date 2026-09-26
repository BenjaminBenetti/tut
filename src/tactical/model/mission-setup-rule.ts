import type { IdGenerator } from "../../core/model/id-generator";
import type { Result } from "../../core/model/result";
import type { MissionTypeId } from "../../content/model/mission-type-id";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { Mission } from "../../overworld/model/mission";
import type { BroodSetupDeps } from "./brood-tuning";
import type { BugUnitSource } from "./bug-unit-source";
import type { CivilianTuning } from "./civilian";
import type { GeneratorTuning } from "./generator";
import type { HiveAssaultSetupTuning } from "./hive-assault-setup-tuning";
import type { SpawnTuning } from "./spawn-tuning";
import type { TacticalError } from "./tactical-error";
import type { TacticalState } from "./tactical-state";

// ===========================================
// Dependencies
// ===========================================

/**
 * What a mission type's setup may read beyond the mission and its map:
 * the id generator every new entity draws from, and the tunings of the
 * entities the shipped types stand up. A type that needs more content
 * adds it here, and the composition root passes it through
 * `MissionStartDeps`, which extends this.
 */
export interface MissionSetupDeps {
  /** Issues spawner, objective and unit ids; shared with the rest of the start. */
  readonly ids: IdGenerator;
  /** Spawner hit points and hatch timers (#329). */
  readonly spawnTuning: SpawnTuning;
  /** What a defence's generators are made of (#1175). */
  readonly generator: GeneratorTuning;
  /**
   * The stat blocks of the bugs a setup may place rather than hatch
   * (ADR 0013 §2.6): Live Specimen's lurkers (#1179). The composition
   * root passes every shipped species. Optional, since no mission type
   * places a bug; a setup that needs a species left out refuses to
   * start with `unknown-unit-type`.
   */
  readonly species?: readonly BugUnitSource[];
  /**
   * The species and tuning a hive cavern's dormant broods are placed
   * from (#1179), read by `placeCavernBroods`. Optional so every start
   * built before broods still compiles; absent, a setup that calls it
   * places none.
   */
  readonly broods?: BroodSetupDeps;
  /** What an evacuation's civilian groups are (campaign arc §6.4). */
  readonly civilian: CivilianTuning;
  /**
   * The Hive Guard's stat block (`BUG_SPECIES["hive-guard"]`), which a
   * Hive Assault stands beside its core (campaign arc §6.5). Passed in so
   * `tactical` reads no bug catalogue.
   */
  readonly hiveGuard: BugUnitSource;
  /** What a Hive Assault stands in the cavern, by hive level (#1179). */
  readonly hiveAssault: HiveAssaultSetupTuning;
}

// ===========================================
// Rule
// ===========================================

/**
 * What one mission type puts on a freshly generated map (ADR 0013
 * §2.3): its objectives and the entities and schedules they need. The
 * mission start does everything every type shares — the deployment,
 * tech carcasses, the extraction, the garrison and the first look — and
 * asks the rule for `mission.typeId` for the rest, so a new type is a
 * new module under `tactical/service/missions/` and one table entry.
 *
 * ```
 *   startTacticalMission
 *     map, deployment, carcasses, extraction ──► base state (no objectives)
 *     MISSION_SETUP_RULES[mission.typeId].setup(base, map, mission, deps)
 *                                            ──► + objectives, spawners, units, edgeSpawn
 *     garrison turrets, initial vision       ──► activeMission
 * ```
 *
 * Pure and deterministic: ids come from `deps.ids` in the order the
 * rule asks for them, and nothing is drawn at random, so the same
 * mission always starts the same way. `state.vision` is empty; the
 * start computes the first look after the rule has placed everything.
 */
export interface MissionSetupRule {
  /** The mission type this rule sets up; equal to its table key. */
  readonly typeId: MissionTypeId;
  /**
   * Adds the type's objectives, entities and schedules to the base
   * mission, or refuses a mission it cannot set up.
   *
   * @param state - The mission so far: deployment placed, no objectives or spawners.
   * @param map - The generated map, whose hooks say where things stand.
   * @param mission - The overworld offer, with its type-specific payload.
   * @param deps - Ids and the tunings the rule may read.
   */
  setup(
    state: TacticalState,
    map: TacticalMap,
    mission: Mission,
    deps: MissionSetupDeps,
  ): Result<TacticalState, TacticalError>;
}

/**
 * One setup rule per mission type. A `Record` over the closed
 * `MissionTypeId` union, so a type without a rule is a compile error.
 */
export type MissionSetupRules = Readonly<
  Record<MissionTypeId, MissionSetupRule>
>;
