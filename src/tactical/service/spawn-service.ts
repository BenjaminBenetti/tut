import type { Direction } from "../../core/model/direction";
import type { IdGenerator } from "../../core/model/id-generator";
import type { Rng } from "../../core/model/rng";
import { allows, PassMask } from "../../mapgen/model/pass-mask";
import type { Tile } from "../../mapgen/model/tile";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { ReachabilitySnapshot } from "../../mapgen/service/hatch-space";
import { hatchTiles, snapshotMap } from "../../mapgen/service/hatch-space";
import { BUGS_SPAWNED } from "../model/bugs-spawned-event";
import type { SpawnSource } from "../model/spawn-source";
import type { SpawnTuning } from "../model/spawn-tuning";
import type { TacticalApplied, TacticalEvent } from "../model/tactical-event";
import type { TacticalContext } from "../model/tactical-handler";
import type { Spawner, TacticalState } from "../model/tactical-state";
import type { Unit, UnitId } from "../model/unit";
import type { UnitTemplate } from "../model/unit-template";
import { occupiedKeys } from "./movement-service";
import type { PhaseStep } from "./turn-service";
import { bugUnit } from "./unit-factory";

// ===========================================
// Types
// ===========================================

/** What spawning needs injected: the species it may hatch and the knobs. */
export interface SpawnDeps {
  /** Every species that may appear; weights below or at zero never do. */
  readonly species: readonly SpawnSource[];
  readonly tuning: SpawnTuning;
}

/** Bugs put on the map, and the mission with them in it. */
interface Placement {
  readonly state: TacticalState;
  readonly unitIds: readonly UnitId[];
}

// ===========================================
// Phase steps
// ===========================================

/** `hatch` as a phase step for `createEndTurnHandler`, closed over the deps. */
export function createHatchStep(deps: SpawnDeps): PhaseStep {
  return (mission, ctx) => hatch(mission, ctx, deps);
}

/** `edgeWave` as a phase step for `createEndTurnHandler`, closed over the deps. */
export function createEdgeWaveStep(deps: SpawnDeps): PhaseStep {
  return (mission, ctx) => edgeWave(mission, ctx, deps);
}

// ===========================================
// Egg spawners
// ===========================================

/**
 * Runs every live spawner's clock at the start of the bug phase (GDD
 * §6.3): its `timer` counts down one, and at zero it releases
 * `hatchCount` bugs onto free tiles of its hatch space (#231: what
 * infantry can reach within `hatchRadius` of it, never its own tile),
 * then rewinds to `hatchInterval` whether or not there was room. A
 * destroyed spawner is left as it is. Hatchlings arrive spent (`ap` 0)
 * and act from the next bug phase. Outside the bug phase this is a
 * no-op.
 *
 * ```
 *   for spawner in order:  destroyed ──► unchanged
 *                          timer − 1 > 0 ──► tick
 *                          otherwise ──► shuffle free hatch tiles, take hatchCount,
 *                                        one weighted species roll per bug,
 *                                        BugsSpawned { source: "spawner" }, timer ← interval
 * ```
 *
 * Draws from `ctx.rng.fork("spawn:hatch")`, spawners in `spawners`
 * order, so the edge wave's rolls never perturb these.
 */
export function hatch(
  mission: TacticalState,
  ctx: TacticalContext,
  deps: SpawnDeps,
): TacticalApplied<TacticalState> {
  if (mission.phase !== "bugs" || mission.spawners.length === 0) {
    return { state: mission, events: [] };
  }
  const rng = ctx.rng.fork("spawn:hatch");
  const snapshot = snapshotMap(mission.map);
  let state = mission;
  const events: TacticalEvent[] = [];
  const spawners: Spawner[] = [];
  for (const spawner of mission.spawners) {
    if (spawner.destroyed) {
      spawners.push(spawner);
      continue;
    }
    const timer = spawner.timer - 1;
    if (timer > 0) {
      spawners.push({ ...spawner, timer });
      continue;
    }
    const room = hatchTiles(
      snapshot,
      spawner.pos,
      spawner.hatchRadius,
      PassMask.INFANTRY,
    ).filter((tile) => !sameTile(tile, spawner.pos));
    const placed = placeBugs(
      state,
      snapshot,
      room,
      deps.tuning.hatchCount,
      rng,
      ctx.ids,
      deps.species,
      (tile) => facingFrom(spawner.pos, tile),
    );
    state = placed.state;
    if (placed.unitIds.length > 0) {
      events.push({
        type: BUGS_SPAWNED,
        payload: {
          unitIds: placed.unitIds,
          source: "spawner",
          sourceId: spawner.id,
        },
      });
    }
    spawners.push({
      ...spawner,
      timer: hatchInterval(mission.difficulty, deps.tuning),
    });
  }
  return { state: { ...state, spawners }, events };
}

// ===========================================
// Edge waves
// ===========================================

/**
 * Lands the next edge wave when its turn has come (GDD §6.3): one
 * edge-spawn hook is drawn, `waveSize` bugs (room permitting) appear on
 * its free tiles facing into the map, and the schedule moves on by
 * `waveInterval` with the wave count up one, whether or not anyone
 * arrived. Escalation reads the mission's launch `difficulty` and
 * `threat` and the waves so far. Outside the bug phase, or before
 * `edgeSpawn.nextTurn`, this is a no-op.
 *
 * ```
 *   turn ≥ nextTurn ──► hook = pick(edgeSpawns)
 *                        bugs = waveSize(wave, difficulty, threat) on free hook tiles
 *                        BugsSpawned { source: "edge", sourceId: hook.id }
 *                        edgeSpawn ← { nextTurn: turn + waveInterval(…), wave + 1 }
 * ```
 *
 * Draws from `ctx.rng.fork("spawn:edge")`: the hook first, then the
 * tile shuffle, then one weighted species roll per bug.
 */
export function edgeWave(
  mission: TacticalState,
  ctx: TacticalContext,
  deps: SpawnDeps,
): TacticalApplied<TacticalState> {
  if (mission.phase !== "bugs" || mission.turn < mission.edgeSpawn.nextTurn) {
    return { state: mission, events: [] };
  }
  const { wave } = mission.edgeSpawn;
  const edgeSpawn = {
    nextTurn:
      mission.turn +
      waveInterval(mission.difficulty, mission.threat, deps.tuning),
    wave: wave + 1,
  };
  const hooks = mission.map.hooks.edgeSpawns;
  if (hooks.length === 0) {
    return { state: { ...mission, edgeSpawn }, events: [] };
  }
  const rng = ctx.rng.fork("spawn:edge");
  const hook = rng.pick(hooks);
  const snapshot = snapshotMap(mission.map);
  const tiles = hook.tiles
    .map((coord) => snapshot.index.getAt(coord))
    .filter((tile): tile is Tile => tile !== undefined);
  const centre: TileCoord = {
    x: (mission.map.width - 1) / 2,
    y: 0,
    z: (mission.map.depth - 1) / 2,
  };
  const placed = placeBugs(
    mission,
    snapshot,
    tiles,
    waveSize(wave, mission.difficulty, mission.threat, deps.tuning),
    rng,
    ctx.ids,
    deps.species,
    (tile) => facingFrom(tile, centre),
  );
  const events: TacticalEvent[] =
    placed.unitIds.length > 0
      ? [
          {
            type: BUGS_SPAWNED,
            payload: {
              unitIds: placed.unitIds,
              source: "edge",
              sourceId: hook.id,
            },
          },
        ]
      : [];
  return { state: { ...placed.state, edgeSpawn }, events };
}

/**
 * Bug phases between one spawner's hatches at this difficulty: the base
 * interval less a cut per difficulty step above one, floored, never
 * below `minHatchInterval`.
 *
 * Unlike the wave knobs this one is not scaled by threat. Threat is a
 * campaign-wide pressure and already reaches the mission through the
 * edge waves; the spawners in front of the player belong to the mission
 * they chose.
 */
export function hatchInterval(difficulty: number, tuning: SpawnTuning): number {
  return Math.max(
    tuning.minHatchInterval,
    Math.floor(
      tuning.hatchInterval - steps(difficulty) * tuning.hatchCutPerDifficulty,
    ),
  );
}

/**
 * Turns between edge waves at this difficulty and threat: the base
 * interval less a cut per difficulty step above one and a cut scaled by
 * threat, floored, never below `minWaveInterval`.
 */
export function waveInterval(
  difficulty: number,
  threat: number,
  tuning: SpawnTuning,
): number {
  const cut =
    steps(difficulty) * tuning.intervalCutPerDifficulty +
    threatFraction(threat) * tuning.intervalCutAtMaxThreat;
  return Math.max(
    tuning.minWaveInterval,
    Math.floor(tuning.waveInterval - cut),
  );
}

/**
 * Bugs in the next edge wave: the base size plus growth per wave already
 * arrived, per difficulty step above one and scaled by threat, floored,
 * never above `maxWaveSize`.
 */
export function waveSize(
  wave: number,
  difficulty: number,
  threat: number,
  tuning: SpawnTuning,
): number {
  const size =
    tuning.baseWaveSize +
    wave * tuning.sizePerWave +
    steps(difficulty) * tuning.sizePerDifficulty +
    threatFraction(threat) * tuning.sizeAtMaxThreat;
  return Math.max(0, Math.min(tuning.maxWaveSize, Math.floor(size)));
}

// ===========================================
// Helpers
// ===========================================

/**
 * Puts up to `count` bugs on free, infantry-passable tiles among the
 * candidates: the candidates are shuffled and the first `count` taken,
 * then each gets one species rolled by hatch weight. New units arrive
 * with no action points; their templates join the mission's if missing.
 */
function placeBugs(
  mission: TacticalState,
  snapshot: ReachabilitySnapshot,
  candidates: readonly Tile[],
  count: number,
  rng: Rng,
  ids: IdGenerator,
  species: readonly SpawnSource[],
  facingOf: (tile: Tile) => Direction,
): Placement {
  const weighted = species.filter((source) => source.hatchWeight > 0);
  if (count <= 0 || weighted.length === 0) {
    return { state: mission, unitIds: [] };
  }
  const taken = occupiedKeys(mission, snapshot.index);
  const free = candidates.filter(
    (tile) =>
      allows(tile.pass, PassMask.INFANTRY) &&
      !taken.has(snapshot.index.keyOf(tile)),
  );
  const chosen = rng.shuffle(free).slice(0, count);
  if (chosen.length === 0) {
    return { state: mission, unitIds: [] };
  }
  const units: Unit[] = [...mission.units];
  const templates: Record<string, UnitTemplate> = { ...mission.templates };
  const unitIds: UnitId[] = [];
  for (const tile of chosen) {
    const source = rng.pickWeighted(weighted, (entry) => entry.hatchWeight);
    const built = bugUnit(
      source,
      { pos: { x: tile.x, y: tile.y, z: tile.z }, facing: facingOf(tile) },
      { ids },
    );
    units.push({ ...built.unit, ap: 0 });
    templates[built.template.id] ??= built.template;
    unitIds.push(built.unit.id);
  }
  return { state: { ...mission, units, templates }, unitIds };
}

/** The direction from one tile towards another along the longer axis; south when they coincide. */
function facingFrom(from: TileCoord, to: TileCoord): Direction {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (dx === 0 && dz === 0) {
    return "s";
  }
  if (Math.abs(dx) >= Math.abs(dz)) {
    return dx > 0 ? "e" : "w";
  }
  return dz > 0 ? "s" : "n";
}

/** True when the tile is the coordinate. */
function sameTile(tile: TileCoord, coord: TileCoord): boolean {
  return tile.x === coord.x && tile.y === coord.y && tile.z === coord.z;
}

/** Difficulty steps above one; a difficulty below one counts as one. */
function steps(difficulty: number): number {
  return Math.max(0, difficulty - 1);
}

/** Threat as a fraction of its 0–100 scale, clamped. */
function threatFraction(threat: number): number {
  return Math.max(0, Math.min(1, threat / 100));
}
