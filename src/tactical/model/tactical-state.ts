import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { MissionId } from "../../overworld/model/mission";
import type { MissionOutcome } from "../../overworld/model/mission-result";
import type { TacticalEvent } from "./tactical-event";
import type { Team, Unit, UnitId } from "./unit";
import type { UnitTemplate, UnitTemplateId } from "./unit-template";

// ===========================================
// Ids and unions
// ===========================================

/** Id of an egg spawner on the map, issued with the `"spawner"` prefix. */
export type SpawnerId = string;

/** Id of a mission objective, issued with the `"objective"` prefix. */
export type ObjectiveId = string;

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

/** An egg spawner sitting on an objective hook (GDD §5.4: clearance missions destroy them). */
export interface Spawner {
  readonly id: SpawnerId;
  /** The tile it occupies. */
  readonly pos: TileCoord;
  /** Manhattan radius hatchlings appear within. */
  readonly hatchRadius: number;
  /** Hit points left in `[0, spawnerHp]` (spawn tuning). */
  readonly hp: number;
  /** Bug phases until it next hatches; counts down each bug phase and resets to the tuning's interval (#329). */
  readonly timer: number;
  /** True once destroyed; the record stays so the debrief can count it. */
  readonly destroyed: boolean;
}

/** What the player must achieve. M2 ships one kind; M3 adds rescue, defend and escort. */
export interface Objective {
  readonly id: ObjectiveId;
  readonly kind: "destroy-spawner";
  /** The spawner this objective tracks. */
  readonly targetId: SpawnerId;
  readonly complete: boolean;
}

/** When the next wave walks in from the map edge, and how many have so far. */
export interface EdgeSpawnSchedule {
  /** Turn the next wave arrives on. */
  readonly nextTurn: number;
  /** Waves that have arrived. */
  readonly wave: number;
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
}

/** Both sides, in a fixed order, for iterating vision. */
export const TEAMS_BY_VISION: readonly Team[] = ["tdf", "bugs"];

/** No knowledge at all: what a side starts a mission with before its first look. */
export const NO_VISION: SideVision = {
  visible: [],
  explored: [],
  spotted: [],
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
 *   ├── map                   the generated TacticalMap (ADR 0004); recipe inside
 *   ├── units[], templates    everyone on the map, plus the stat blocks they share
 *   ├── turn, phase           FIRST_TURN and counting; player then bugs
 *   ├── objectives[], spawners[]
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
  readonly missionId: MissionId;
  /** Unsigned 32-bit seed the mission's rules fork their streams from. */
  readonly seed: number;
  /** The mission's difficulty at launch; edge waves escalate with it (GDD §6.3). */
  readonly difficulty: number;
  /** Global threat at launch in `[0, 100]`; edge waves escalate with it. */
  readonly threat: number;
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
