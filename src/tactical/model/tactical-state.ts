import type { JevControl } from "./jev-control";
import type { Brood } from "./brood";
import type { SpeciesMix } from "../../bugs/model/species-mix";
import type { BugSpeciesId } from "../../content/model/bug-species-id";
import type { InstallationSiteId } from "../../content/model/installation-site-id";
import type { SitrepId } from "../../content/model/sitrep-id";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { MissionId } from "../../overworld/model/mission";
import type { MissionOutcome } from "../../overworld/model/mission-result";
import type { TacticalEvent } from "./tactical-event";
import type { TileEffect } from "./tile-effect";
import type { Team, Unit, UnitId } from "./unit";
import type { UnitTemplate, UnitTemplateId } from "./unit-template";
import type { PlacedCharge } from "./equipment";
import type { MechWreck, MechWreckId } from "./mech-wreck";
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
  /**
   * Hit points it started with, for a spawner whose health is shown or
   * drawn against its whole (the hive core's tracker row and its damaged
   * model). Absent on every spawner that never needed it.
   */
  readonly maxHp?: number;
  /**
   * Tech points its destruction pays (the Hive Assault's chamber nests,
   * optional pressure with a bonus). Absent or zero pays nothing.
   */
  readonly bounty?: number;
  /**
   * Bugs each of its hatches releases beyond the spawn tuning's
   * `hatchCount`: Hardened Clutches' one more (campaign arc §11).
   * Absent reads as 0, as every spawner saved before it does.
   */
  readonly hatchBonus?: number;
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
 *
 * An objective **decides** the mission unless it is marked `optional`:
 * a win needs every deciding objective complete, and an optional one
 * only pays what it pays (`decidingObjectives`).
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
  /**
   * True for an objective that does not decide the mission (#1179): it
   * can still be worked and still pays, but a win does not wait for it,
   * and leaving it open does not turn a win into an extraction. A story
   * mission's setup marks its host type's objectives so: on Live
   * Specimen the clearance's nests are optional and the capture decides.
   * Absent reads as false, so every objective saved before it decides.
   */
  readonly optional?: boolean;
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
 * Bring down the hive core and get out (campaign arc §6.5): the Hive
 * Assault's one objective. The core is a 3×3 `hive-core` spawner, so
 * charges, gunfire, blasts and fire all wear it down; `complete` is set
 * the moment it falls, and the objective counts as done only once a
 * unit is also aboard the drop ship.
 *
 * ```
 *   core destroyed                       ──► complete flag set
 *   complete flag and someone extracted  ──► objective done (won)
 *   mission lost                         ──► failed
 * ```
 */
export interface DestroyHiveCoreObjective extends ObjectiveBase {
  readonly kind: "destroy-hive-core";
  /** The hive core (a `hive-core` spawner) this objective tracks. */
  readonly targetId: SpawnerId;
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
  /**
   * The facility under attack, for the briefing and the tracker: a built
   * installation or a story facility (the tracking array, the launch site).
   */
  readonly installation: InstallationSiteId;
  /** The generator units, in hook order. */
  readonly targetIds: readonly UnitId[];
  /** Always written for a defence, which starts open. */
  readonly failed: boolean;
}

/**
 * Take a bug of `species` alive with the capture net and bring it home
 * (#1179, campaign arc §6.9 Live Specimen). Judged live off the units:
 * complete once a squad carrying one has extracted, failed once nobody
 * left on the map could still bring one home. `complete` and `failed`
 * mirror that as of the last phase step, for the log and the tracker.
 *
 * ```
 *   an extracted unit carries the species                    ──► complete
 *   no carrier, no reachable dropped specimen, no net left   ──► failed
 *   otherwise                                                ──► open
 * ```
 */
export interface CaptureSpecimenObjective extends ObjectiveBase {
  readonly kind: "capture-specimen";
  /** The species wanted alive: a lurker for Live Specimen. */
  readonly species: BugSpeciesId;
}

/**
 * Free the civilian groups trapped in the town's buildings and walk them
 * to the drop ship (campaign arc §6.4). Complete once at least half the
 * groups are aboard; failed once so many are dead that half can no
 * longer get out. `complete` and `failed` mirror the rule as of the last
 * extraction or phase step, for the log and the tracker; the live answer
 * is always the rule's.
 *
 * ```
 *   aboard ≥ ⌈groups / 2⌉                   ──► complete
 *   aboard + alive on the map < ⌈groups / 2⌉ ──► failed
 *   otherwise                                ──► open
 * ```
 *
 * A group aboard after the half is reached still counts: every group
 * out adds to the reward, so the objective stays workable past complete.
 */
export interface RescueCiviliansObjective extends ObjectiveBase {
  readonly kind: "rescue-civilians";
  /** Every civilian group the rescue tracks, in hook order. */
  readonly groupIds: readonly UnitId[];
  /** Always written for a rescue, which starts open. */
  readonly failed: boolean;
}

/**
 * Strip a lost mech's wreck and carry the parts home (arc §6.6). A
 * squad beside the wreck works it once a turn with the interact action;
 * after `turnsNeeded` turns the parts are loose, and the objective is
 * done once a squad that worked it has boarded the drop ship.
 *
 * ```
 *   turnsWorked < turnsNeeded           ──► open: work it, one turn at a time
 *   stripped, no worker aboard yet      ──► open: get a worker to the drop ship
 *   stripped, a worker in `extracted`   ──► complete
 *   mission lost, or nobody left to finish ──► failed
 * ```
 *
 * `complete` is read live from the mission by the kind's rule; the
 * stored flag stays false, as a defence's does between phase ends.
 */
export interface StripWreckObjective extends ObjectiveBase {
  readonly kind: "strip-wreck";
  /** The wreck this objective strips. */
  readonly targetId: MechWreckId;
  /** Turns of work the wreck takes; at least 1. */
  readonly turnsNeeded: number;
  /** Turns a squad has worked it so far, never above `turnsNeeded`. */
  readonly turnsWorked: number;
  /** The turn it was last worked on: once a turn, however many squads stand by. */
  readonly lastWorkedTurn?: number;
  /** The squads that worked it, in the order they first did; any of them carries the parts. */
  readonly workedBy: readonly UnitId[];
}

/**
 * What the player must achieve: wreck a spawner, hold the generators
 * (#1175), wreck a spore pod before it matures, bring a specimen home,
 * get the civilians out, strip a lost mech's wreck, or bring down a hive
 * core and extract (#1179, campaign arc §6.3, §6.4, §6.5, §6.6, §6.9).
 * Closed: a new kind adds its interface here and its rules to
 * `OBJECTIVE_RULES`, which the compiler then insists on (ADR 0013 §2.3).
 */
export type Objective =
  | DestroySpawnerObjective
  | DefendGeneratorsObjective
  | DestroyPodObjective
  | CaptureSpecimenObjective
  | RescueCiviliansObjective
  | StripWreckObjective
  | DestroyHiveCoreObjective;

/**
 * Swarm Tide's hold on the edge waves (campaign arc §11): each wave is
 * larger than the spawn tuning makes it, and may stand on the ground
 * behind its zone as well as on the zone itself.
 *
 * ```
 *   bugs  = ⌈ waveSize(…) × sizeScale ⌉
 *   room  = the zone's tiles, then every tile infantry reach within
 *           spillRadius steps of one of them
 * ```
 */
export interface EdgeWaveSurge {
  /** Multiplier on every wave's size, rounded up. Above 1. */
  readonly sizeScale: number;
  /** Infantry steps past its zone a wave may stand. */
  readonly spillRadius: number;
}

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
  /**
   * Swarm Tide's larger waves (campaign arc §11). Absent (the norm), a
   * wave is exactly the spawn tuning's size on its zone's tiles.
   */
  readonly surge?: EdgeWaveSurge;
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
 *   ├── sitreps?              the offer's situation reports (arc §11)
 *   ├── blazeSites?           tiles City Ablaze relights every three turns
 *   ├── dustOffTurn?          the last turn Dust-off Window's drop ship waits through
 *   ├── map                   the generated TacticalMap (ADR 0004); recipe inside
 *   ├── units[], templates    everyone on the map, plus the stat blocks they share
 *   ├── turn, phase           FIRST_TURN and counting; player then bugs
 *   ├── objectives[], spawners[]
 *   ├── broods?[]             dormant bugs that wake together, a cavern's chambers (#1179)
 *   ├── carcasses[]           tech carcasses on the map, stripped or not (#1171)
 *   ├── wrecks[]?             lost mechs lying on the map (arc §6.6)
 *   ├── effects[]             fires burning on tiles, each with a clock (#1121)
 *   ├── charges[]             breaching charges waiting to go off (#1132)
 *   ├── edgeSpawn             when the next edge wave arrives
 *   ├── extraction[]          tiles a unit must reach to leave
 *   ├── extracted[]           units that left through them, as they left; not in units[]
 *   ├── escaped[]?            bugs that fled off the map edge (#1179); not in units[]
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
  /**
   * The situation reports frozen on the offer (campaign arc §11),
   * copied at launch. Each applies through its rule in `SITREP_RULES`:
   * a setup once the map is set up, a sight modifier the vision service
   * reads, a phase step. Absent (the norm) means none, and every mission
   * saved before sitreps existed has none.
   */
  readonly sitreps?: readonly SitrepId[];
  /**
   * The tiles City Ablaze set alight at the start (campaign arc §11), in
   * the order they were lit. The sitrep's phase step relights each one
   * every three turns, whatever burnt out in between. Absent unless the
   * mission carries City Ablaze.
   */
  readonly blazeSites?: readonly TileCoord[];
  /**
   * The last turn the drop ship waits through under Dust-off Window
   * (campaign arc §11). Once it has ended, every unit of the force still
   * on the map is left behind, as if the mission had been abandoned, and
   * the mission ends on whoever boarded. Absent unless the mission
   * carries the sitrep.
   */
  readonly dustOffTurn?: number;
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
   * Dormant broods (#1179, campaign arc §7.5): groups of `dormant` bugs
   * that wake together, each with the zone that wakes it. Placed by
   * `placeCavernBroods` in a hive cavern; absent on every other mission
   * and on every save made before broods, which is the same as none.
   */
  readonly broods?: readonly Brood[];
  /**
   * Tech carcasses on the map (#1171), harvested or not, in hook order.
   * Empty on most missions: the offer decides whether one lies here.
   */
  readonly carcasses: readonly TechCarcass[];
  /**
   * Lost mechs lying on the map (arc §6.6), in hook order. Absent on
   * every mission but a wreck recovery, and on every mission saved
   * before them: read it as empty.
   */
  readonly wrecks?: readonly MechWreck[];
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
   * Bugs that fled off the map edge (#1179), in the order they left,
   * frozen as they were: a Broodmother that reached the edge at half
   * health (campaign arc §6.8). Like `extracted`, they are no longer in
   * `units`, so no rule can see or shoot them; Alpha Hunt's objective
   * and the nemesis record read them (`broodmotherEscaped`). Absent
   * until the first bug escapes, and on every mission saved before
   * any could, so no save needs a migration.
   */
  readonly escaped?: readonly Unit[];
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
