import type { JevControl } from "./jev-control";
import type { SpeciesMix } from "../../bugs/model/species-mix";
import type { DeployableTypeId } from "../../content/model/deployable-type-id";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { MissionId } from "../../overworld/model/mission";
import type { MissionOutcome } from "../../overworld/model/mission-result";
import type { TacticalEvent } from "./tactical-event";
import type { TileEffect } from "./tile-effect";
import type { Team, Unit, UnitId } from "./unit";
import type { UnitTemplate, UnitTemplateId } from "./unit-template";
import type { PlacedCharge } from "./equipment";
import type { Radar } from "./radar";
import type { TechCarcass } from "./tech-carcass";
import type { SpawnerVariant } from "./spawner-variant";

// ===========================================
// Ids and unions
// ===========================================

/** Id of an egg spawner or spore pod on the map, issued with the `"spawner"` prefix. */
export type SpawnerId = string;

/** Id of a mission objective, issued with the `"objective"` prefix. */
export type ObjectiveId = string;

/** The prefix every `SpawnerId` is issued with. */
export const SPAWNER_ID_PREFIX = "spawner";

/** The prefix every `ObjectiveId` is issued with. */
export const OBJECTIVE_ID_PREFIX = "objective";

/** Whose turn it is (GDD §6.2). */
export type TacticalPhase = "player" | "bugs";

/** Every phase, in turn order. */
export const TACTICAL_PHASES: readonly TacticalPhase[] = ["player", "bugs"];

/** Which team acts in which phase (GDD §6.2). */
export const TEAM_FOR_PHASE: Readonly<Record<TacticalPhase, Team>> = {
  player: "tdf",
  bugs: "bugs",
};

/** The phase each team acts in. */
export const PHASE_FOR_TEAM: Readonly<Record<Team, TacticalPhase>> = {
  tdf: "player",
  bugs: "bugs",
};

// ===========================================
// Constants
// ===========================================

/** The turn a mission starts on. */
export const FIRST_TURN = 1;

/** Tiles around a spawner its hatchlings appear in when the hook carries no radius. */
export const DEFAULT_HATCH_RADIUS = 3;

// ===========================================
// Objectives and spawners
// ===========================================

/**
 * A destructible bug object on an objective hook: an egg spawner (GDD
 * §5.4: clearance missions destroy them) or a crash site's spore pod
 * (campaign arc §6.3). The variant says which; see `SpawnerVariant`.
 *
 * A spore pod's life, which an egg spawner never has:
 *
 * ```
 *   ripening ──► wrecked            hp reaches 0: destroyed
 *      └──────► matured             its objective's deadline passed:
 *               burstPending          destroyed, hp 0, matured, burstPending
 *                   └──► burst       the pod burst step released its wave
 * ```
 */
export interface Spawner {
  readonly id: SpawnerId;
  /** The tile it occupies. */
  readonly pos: TileCoord;
  /** Manhattan radius hatchlings, or a pod's burst, appear within. */
  readonly hatchRadius: number;
  /** Hit points left in `[0, spawnerHp]` (spawn tuning), or a pod's `podHp`. */
  readonly hp: number;
  /** Bug phases until it next hatches; counts down each bug phase and resets to the tuning's interval (#329). A variant that never hatches keeps it untouched. */
  readonly timer: number;
  /** True once destroyed; the record stays so the debrief can count it. A matured pod is destroyed too: it is gone. */
  readonly destroyed: boolean;
  /** What it is; absent is an egg spawner, as every spawner saved before pods was. */
  readonly variant?: SpawnerVariant;
  /** True once a spore pod matured rather than being wrecked. Absent reads as false. */
  readonly matured?: boolean;
  /** True from a pod's maturing until its burst has been released. Absent reads as false. */
  readonly burstPending?: boolean;
}

/**
 * What every objective kind carries (ADR 0013 §2.3), whatever it asks
 * of the player. The two flags are sticky and never both set: an
 * objective that failed never completes, and one that completed never
 * fails. What each kind means by them lives in its rules
 * (`tactical/service/objectives/`), not here.
 *
 * ```
 *   open ──► complete        its rule says done
 *     └───► failed          its rule says lost, or turn > deadlineTurn
 * ```
 */
export interface ObjectiveBase {
  readonly id: ObjectiveId;
  readonly complete: boolean;
  /** True once the objective can never be completed. Absent reads as false. */
  readonly failed?: boolean;
  /**
   * The last turn the objective may be completed on. Once that turn has
   * ended, the deadline phase step fails it and runs the kind's
   * `onDeadline` consequences. Absent: no deadline.
   */
  readonly deadlineTurn?: number;
}

/** Destroy one egg spawner (GDD §5.4): complete when it is wrecked. */
export interface DestroySpawnerObjective extends ObjectiveBase {
  readonly kind: "destroy-spawner";
  /** The spawner this objective tracks. */
  readonly targetId: SpawnerId;
}

/**
 * Wreck the crash site's spore pod before it matures (campaign arc
 * §6.3): complete when the pod is destroyed, failed when it matures.
 * The pod matures once `deadlineTurn` has ended, bursting into a wave.
 *
 * ```
 *   pod wrecked on or before deadlineTurn  ──► complete
 *   deadlineTurn ends with the pod intact  ──► failed, the pod matures
 * ```
 */
export interface DestroyPodObjective extends ObjectiveBase {
  readonly kind: "destroy-pod";
  /** The spore pod (a `spore-pod` spawner) this objective tracks. */
  readonly targetId: SpawnerId;
  /** Always set: a pod ripens on a clock. */
  readonly deadlineTurn: number;
}

/**
 * Hold the installation's generators through every timed wave (#1175,
 * GDD §5.4). `complete` and `failed` mirror `defendStatus` as of the
 * last phase step, for the log and the tracker; the live answer is
 * always the service's.
 *
 * ```
 *   no generator standing            ──► failed
 *   every wave landed, no bug alive  ──► complete
 *   otherwise                        ──► open
 * ```
 */
export interface DefendGeneratorsObjective extends ObjectiveBase {
  readonly kind: "defend-generators";
  /** The installation under attack, for the briefing and the tracker. */
  readonly installation: DeployableTypeId;
  /** The generator units, in hook order. */
  readonly targetIds: readonly UnitId[];
  /** Always written for a defence, which starts open. */
  readonly failed: boolean;
}

/**
 * What the player must achieve: wreck a spawner, hold the generators
 * (#1175), or wreck a spore pod before it matures. Closed: a new kind
 * adds its interface here and its rules to `OBJECTIVE_RULES`, which the
 * compiler then insists on (ADR 0013 §2.3).
 */
export type Objective =
  DestroySpawnerObjective | DefendGeneratorsObjective | DestroyPodObjective;

/** When the next wave walks in from the map edge, and how many have so far. */
export interface EdgeSpawnSchedule {
  /** Turn the next wave arrives on. */
  readonly nextTurn: number;
  /** Waves that have arrived. */
  readonly wave: number;
  /**
   * How many waves the mission sends before the edges fall quiet
   * (#1175); absent, they never do.
   */
  readonly totalWaves?: number;
}

// ===========================================
// Vision
// ===========================================

/**
 * A tile key from `TileIndex.keyOf`, packing a coordinate into one
 * integer. Vision stores keys rather than coordinates because a mission
 * holds thousands of them and they are only ever compared.
 */
export type VisionTileKey = number;

/**
 * What one side has seen (ADR 0006 §2.1). Stored rather than derived so
 * the renderer never runs line of sight in the frame loop, so `explored`
 * can accumulate, and so spotting is an event rather than a diff two
 * layers have to agree on.
 *
 * `visible` and `spotted` are recomputed from the mission whenever a unit
 * moves, dies or leaves; `explored` is the union of every `visible` so
 * far and is the only part a save is trusted for (§2.5).
 */
export interface SideVision {
  /** Tile keys this side can see this instant. Recomputed, never trusted from a save. */
  readonly visible: readonly VisionTileKey[];
  /** Tile keys this side has ever seen. Monotonic within a mission. */
  readonly explored: readonly VisionTileKey[];
  /** Enemy units currently seen, by id. Recomputed, never trusted from a save. */
  readonly spotted: readonly UnitId[];
  /**
   * Where this side last saw each enemy, by id (#716). Accumulated like
   * `explored` rather than recomputed like `spotted`: it is the memory
   * of a sighting, so losing sight must not erase it — that is the whole
   * point of holding it.
   *
   * It exists because a bug that cannot see its mark had no mark at all.
   * Concealment and engagement were mutually exclusive for the lurker at
   * every weight (#695): stepping into cover broke line of sight, and
   * with nothing remembered the behaviour had nowhere to go and idled
   * for the rest of the mission.
   *
   * Only ever written from what the side actually perceived, so it
   * cannot leak a position nobody saw (ADR 0006 §2.3).
   */
  readonly lastSeen: Readonly<Record<UnitId, TileCoord>>;
}

/** Both sides, in a fixed order, for iterating vision. */
export const TEAMS_BY_VISION: readonly Team[] = ["tdf", "bugs"];

/** No knowledge at all: what a side starts a mission with before its first look. */
export const NO_VISION: SideVision = {
  visible: [],
  explored: [],
  spotted: [],
  lastSeen: {},
};

// ===========================================
// Tactical state
// ===========================================

/**
 * The serialisable state of one mission in progress, living in
 * `GameState.activeMission` while a mission is played (GDD §6). Built by
 * the mission start service from a mission, its generated map and the
 * deployment; driven by tactical commands (#324) and rules (#T2.x).
 *
 * ```
 *   TacticalState
 *   ├── missionId, seed       which mission; the RNG seed its rules fork from
 *   ├── difficulty, threat    launch-time inputs the edge waves escalate with
 *   ├── bugMix?               the species the spawns roll, from the offer
 *   ├── map                   the generated TacticalMap (ADR 0004); recipe inside
 *   ├── units[], templates    everyone on the map, plus the stat blocks they share
 *   ├── turn, phase           FIRST_TURN and counting; player then bugs
 *   ├── objectives[], spawners[]
 *   ├── carcasses[]           tech carcasses on the map, stripped or not (#1171)
 *   ├── effects[]             fires burning on tiles, each with a clock (#1121)
 *   ├── charges[]             breaching charges waiting to go off (#1132)
 *   ├── edgeSpawn             when the next edge wave arrives
 *   ├── extraction[]          tiles a unit must reach to leave
 *   ├── extracted[]           units that left through them, as they left; not in units[]
 *   ├── vision                what each side has seen (ADR 0006)
 *   ├── outcome?              how it ended, once a turn boundary found it over
 *   └── log[]                 domain events so far, for the debrief and replays
 * ```
 *
 * Plain data: the whole map is stored rather than regenerated on load so
 * a save is self-contained; `map.recipe` still records how to rebuild it.
 */
export interface TacticalState {
  /** Optional entity controllers; absence preserves the original turn flow. */
  readonly jev?: JevControl;
  readonly missionId: MissionId;
  /** Unsigned 32-bit seed the mission's rules fork their streams from. */
  readonly seed: number;
  /** The mission's difficulty at launch; edge waves escalate with it (GDD §6.3). */
  readonly difficulty: number;
  /** Global threat at launch in `[0, 100]`; edge waves escalate with it. */
  readonly threat: number;
  /**
   * The species egg spawners and edge waves roll, copied from the
   * offer's `Mission.bugMix` at launch (ADR 0013 §2.6). Absent for an
   * offer made before the bestiary, and for every mission saved before
   * it: the roll then weighs each species' `hatchWeight`, as it always
   * has.
   */
  readonly bugMix?: SpeciesMix;
  readonly map: TacticalMap;
  /** Every unit on the map, TDF and bugs, alive or not. */
  readonly units: readonly Unit[];
  /** Stat blocks referenced by `Unit.templateId`. */
  readonly templates: Readonly<Record<UnitTemplateId, UnitTemplate>>;
  /** Current turn, `FIRST_TURN` or later. */
  readonly turn: number;
  readonly phase: TacticalPhase;
  readonly objectives: readonly Objective[];
  readonly spawners: readonly Spawner[];
  /**
   * Tech carcasses on the map (#1171), harvested or not, in hook order.
   * Empty on most missions: the offer decides whether one lies here.
   */
  readonly carcasses: readonly TechCarcass[];
  /**
   * Tile effects burning on the map (#1121), in the order they were lit.
   * Each acts at the start of every phase against the side whose phase
   * begins and is removed when its clock runs down.
   */
  readonly effects: readonly TileEffect[];
  /** Deployed scanners, active until the mission ends. */
  readonly radars: readonly Radar[];
  /**
   * Breaching charges placed and not yet detonated (#1132), in the order
   * they were set. Each goes off as the player phase of its turn opens.
   */
  readonly charges: readonly PlacedCharge[];
  readonly edgeSpawn: EdgeSpawnSchedule;
  /** Tiles of the extraction hook. */
  readonly extraction: readonly TileCoord[];
  /**
   * Units that left the map through the extraction zone, in the order
   * they left, frozen as they were when they walked out. They are no
   * longer in `units`, so no rule can see or shoot them; the resolver
   * (#330) reads their hit points to bring their crews home.
   */
  readonly extracted: readonly Unit[];
  /**
   * Set when a terminal condition held at a turn boundary (#328). Once
   * set, no further tactical command applies; the resolver (#330) turns
   * the mission into a `MissionResult`.
   */
  readonly outcome?: MissionOutcome;
  /**
   * What each side has seen (ADR 0006). The renderer draws the TDF
   * side's; a bug behaviour is handed a view built from the bugs' (#550).
   */
  readonly vision: Readonly<Record<Team, SideVision>>;
  /** Tactical events emitted so far, oldest first; the debrief and replays read it. */
  readonly log: readonly TacticalEvent[];
  /**
   * Commands applied to this mission so far, and nothing else. It is the
   * nonce that makes each command's RNG fork distinct (#667).
   *
   * Kept apart from `log.length`, which used to serve: the log is a list
   * whose purpose is to be read by a player, so capping it, filtering it
   * or seeding it silently rerolls every die in the mission. Seeding it
   * is not hypothetical — #659 did, and the whole gate stayed green.
   */
  readonly commandSeq: number;
}
