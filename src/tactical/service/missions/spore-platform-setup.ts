import type { BugSpeciesId } from "../../../content/model/bug-species-id";
import type { Result } from "../../../core/model/result";
import { err, ok } from "../../../core/model/result";
import type { Hook, HookKind } from "../../../mapgen/model/hook";
import { HookKinds } from "../../../mapgen/model/hook";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import type { Mission } from "../../../overworld/model/mission";
import type {
  MissionSetupDeps,
  MissionSetupRule,
} from "../../model/mission-setup-rule";
import type { PlatformAssaultTuning } from "../../model/platform-assault-tuning";
import type { SpawnerVariant } from "../../model/spawner-variant";
import type { TacticalError } from "../../model/tactical-error";
import type {
  BoardCoreObjective,
  DestroyPlatformCoreObjective,
  Spawner,
  TacticalState,
} from "../../model/tactical-state";
import {
  OBJECTIVE_ID_PREFIX,
  SPAWNER_ID_PREFIX,
} from "../../model/tactical-state";
import { spawnerFootprintSize } from "../footprint-service";
import { placeHiveGuards } from "../placed-bug-service";
import { withEscortShare } from "./escort-share";
import { standEggSpawners } from "./infestation-clearance-setup";
import { coordOf, firstTile, hatchRadiusOf } from "./map-placement";

// ===========================================
// Constants
// ===========================================

/** The species stood on every guard post of the core chamber (campaign arc §6.9, §7). */
export const PLATFORM_GUARD_SPECIES: BugSpeciesId = "hive-guard";

/** The stage the squad boards on: the hull. Every later stage is the core chamber. */
const HULL_STAGE = 0;

/** The spawner variant the core chamber's seed is. */
const PLATFORM_CORE_VARIANT: SpawnerVariant = "platform-core";

// ===========================================
// Stages
// ===========================================

/**
 * The hull (campaign arc §6.9, stage 1 of 2): the squad comes aboard at
 * the docking ring and fights along the deck to the hatch down to the
 * core. The hatch is the stage's extraction, so a unit that extracts
 * there has boarded, and `board-core` is the stage's one deciding
 * objective. The pod beds' nests hatch on the spawn tuning's clock and
 * the deck's far edge sends the edge waves, both rolling the offer's
 * finale mix; the nests are the threat, not the job, so they carry no
 * objective of their own.
 *
 * ```
 *   pod beds (egg-spawner hooks) ──► nests, no objective    ids: spawner-*
 *   board-core                                             id:  objective-*
 *   extraction = the platform-exit hook's tiles (the drop ship's are dropped)
 * ```
 *
 * A board without a hatch keeps the drop ship's extraction, so the
 * stage can still be finished; the map's validator never lets that
 * happen.
 *
 * @param state - The hull so far: the force on the docking ring.
 * @param map - The hull's map.
 * @param mission - The offer, at stage 0.
 * @param deps - Ids and the spawn tuning.
 */
export function setUpHull(
  state: TacticalState,
  map: TacticalMap,
  mission: Mission,
  deps: MissionSetupDeps,
): TacticalState {
  const nests = standEggSpawners(state, map, mission, deps);
  const board: BoardCoreObjective = {
    id: deps.ids.nextId(OBJECTIVE_ID_PREFIX),
    kind: "board-core",
    complete: false,
  };
  const hatch = hookOf(map, HookKinds.PLATFORM_EXIT);
  return {
    ...nests,
    objectives: [...nests.objectives, board],
    extraction:
      hatch === undefined ? nests.extraction : hatch.tiles.map(coordOf),
  };
}

/**
 * The core chamber (campaign arc §6.9, stage 2 of 2): the squad comes
 * down the causeway from the start pad into the chamber where the seed
 * grows. Destroying the platform core wins the mission on the spot: the
 * stage ends on its objectives and has no extraction, because a
 * destroyed platform is the victory the arc names and there is nowhere
 * to extract to. The Sovereign guards the core but is no objective.
 *
 * ```
 *   platform-core hook ──► the core, a 3×3 platform-core spawner of
 *                          tuning.coreHp centred on the pad's
 *                          middle tile (coreSquare)                  id: spawner-*
 *                      ──► destroy-platform-core { coreHp }          id: objective-*
 *   wall pods (egg-spawner hooks) ──► nests, no objective            ids: spawner-*
 *   guard posts ──► one Hive Guard on each post's first tile          ids: unit-*
 *   sovereign-dais ──► deps.coreBoss.place(anchor, { core: pad's middle }) id: unit-*
 *   bugMix ──► withEscortShare(offer's mix, boss's escort, tuning.escortShare)
 *   extraction [], endsOnObjectives
 * ```
 *
 * Ids are drawn in that order. Refuses with `unknown-unit-type` when
 * `deps.species` has no Hive Guard, and with `map-recipe` on a board
 * without the core's pad, which the map's validator never lets through.
 * Without a boss in the deps, nobody stands on the dais and the waves
 * roll the offer's mix as it is.
 *
 * @param state - The core chamber so far: the survivors on the start pad.
 * @param map - The core chamber's map.
 * @param mission - The offer, at stage 1.
 * @param deps - Ids, the spawn tuning, the species and the boss.
 * @param tuning - The core's hit points and the escort share.
 */
export function setUpCore(
  state: TacticalState,
  map: TacticalMap,
  mission: Mission,
  deps: MissionSetupDeps,
  tuning: PlatformAssaultTuning,
): Result<TacticalState, TacticalError> {
  const guard = deps.species?.find(
    (species) => species.id === PLATFORM_GUARD_SPECIES,
  );
  if (guard === undefined) {
    return err({
      kind: "unknown-unit-type",
      unitKind: "bug",
      id: PLATFORM_GUARD_SPECIES,
    });
  }
  const pad = hookOf(map, HookKinds.PLATFORM_CORE);
  if (pad === undefined) {
    return err({
      kind: "map-recipe",
      reason: "the core chamber has no platform core",
    });
  }
  const corePos = middleTile(pad);
  const core: Spawner = {
    id: deps.ids.nextId(SPAWNER_ID_PREFIX),
    variant: PLATFORM_CORE_VARIANT,
    pos: coreAnchor(corePos),
    hatchRadius: hatchRadiusOf(pad),
    hp: tuning.coreHp,
    timer: 0,
    destroyed: false,
  };
  const objective: DestroyPlatformCoreObjective = {
    id: deps.ids.nextId(OBJECTIVE_ID_PREFIX),
    kind: "destroy-platform-core",
    targetId: core.id,
    coreHp: tuning.coreHp,
    complete: false,
  };
  const withCore: TacticalState = {
    ...state,
    spawners: [...state.spawners, core],
    objectives: [...state.objectives, objective],
    extraction: [],
    endsOnObjectives: true,
  };
  const nests = standEggSpawners(withCore, map, mission, deps);
  const guarded = placeHiveGuards(
    nests,
    hooksOf(map, HookKinds.GUARD_POST).map((hook) => coordOf(firstTile(hook))),
    { ids: deps.ids, guard },
  );
  return ok(standBoss(guarded, map, mission, deps, corePos, tuning));
}

// ===========================================
// Rule
// ===========================================

/**
 * `spore-platform` (campaign arc §6.9): the finale, two linked maps
 * (ADR 0013 amendment). The mission start builds the hull; winning it
 * carries the survivors into the core chamber, which the stage advance
 * builds with `state.stage.index` 1. The rule reads the stage off the
 * base state and sets up that map.
 *
 * ```
 *   deployTiles   stage 0 ──► the docking ring's tiles; later ──► the deploy zone (start pad)
 *   setup         stage 0 ──► setUpHull; later ──► setUpCore
 *   garrisoned    false: the region's batteries do not reach orbit
 * ```
 *
 * @param tuning - The core's hit points and the escort share.
 * @returns The rule.
 */
export function createSporePlatformSetup(
  tuning: PlatformAssaultTuning,
): MissionSetupRule {
  return {
    typeId: "spore-platform",
    garrisoned: false,

    /** The hull's docking ring; the core chamber deploys on its start pad as usual. */
    deployTiles(map, stage) {
      if (stage !== HULL_STAGE) {
        return undefined;
      }
      return hookOf(map, HookKinds.DOCKING_RING)?.tiles;
    },

    /** The hull or the core chamber, by the stage being built. */
    setup(state, map, mission, deps) {
      return (state.stage?.index ?? HULL_STAGE) === HULL_STAGE
        ? ok(setUpHull(state, map, mission, deps))
        : setUpCore(state, map, mission, deps, tuning);
    },
  };
}

// ===========================================
// Helpers
// ===========================================

/** The first objective hook of `kind`, if the map has one. */
function hookOf(map: TacticalMap, kind: HookKind): Hook | undefined {
  return map.hooks.objectives.find((hook) => hook.kind === kind);
}

/** Every objective hook of `kind`, in hook order. */
function hooksOf(map: TacticalMap, kind: HookKind): readonly Hook[] {
  return map.hooks.objectives.filter((hook) => hook.kind === kind);
}

/**
 * The middle tile of a square pad: its tiles run row by row from the
 * lowest corner (`PlatformPadPlacer`), so the middle of a side-`n`
 * square is `tiles[⌊n/2⌋·n + ⌊n/2⌋]`. A pad that is not square falls
 * back to its first tile.
 */
function middleTile(pad: Hook): TileCoord {
  const side = Math.round(Math.sqrt(pad.tiles.length));
  const half = Math.floor(side / 2);
  const tile =
    side * side === pad.tiles.length
      ? pad.tiles[half * side + half]
      : undefined;
  return coordOf(tile ?? firstTile(pad));
}

/**
 * The anchor (lowest `x` and `z`) of the platform core's square when it
 * is centred on `middle`, so `spawnerMiddleTile` gives `middle` back:
 * the tile the boss guards, the tracker points at, and the model has
 * always been drawn on. The shipped pad is 6×6 and the core 3×3, so the
 * core stands a tile or two in from every edge of its pad.
 *
 * ```
 *   pad 6×6, z up
 *             . . . . . .
 *             . . C C C .     C the core's 3×3, anchored at A
 *             . . C M C .     M the pad's middle tile
 *             . . A C C .
 *             . . . . . .
 *             . . . . . .
 * ```
 */
function coreAnchor(middle: TileCoord): TileCoord {
  const half = Math.floor(
    spawnerFootprintSize({ variant: PLATFORM_CORE_VARIANT }) / 2,
  );
  return { x: middle.x - half, y: middle.y, z: middle.z - half };
}

/**
 * The boss on the dais, guarding the core, and the escort's share of the
 * waves; the mission unchanged when the deps name no boss or the map has
 * no dais.
 */
function standBoss(
  state: TacticalState,
  map: TacticalMap,
  mission: Mission,
  deps: MissionSetupDeps,
  core: TileCoord,
  tuning: PlatformAssaultTuning,
): TacticalState {
  const boss = deps.coreBoss;
  const dais = hookOf(map, HookKinds.SOVEREIGN_DAIS);
  if (boss === undefined || dais === undefined) {
    return state;
  }
  const placed = boss.place(state, coordOf(firstTile(dais)), {
    ids: deps.ids,
    species: boss.species,
    core,
    difficulty: mission.difficulty,
  });
  const bugMix = withEscortShare(
    placed.bugMix,
    boss.escort,
    tuning.escortShare,
  );
  return bugMix === undefined ? placed : { ...placed, bugMix };
}
