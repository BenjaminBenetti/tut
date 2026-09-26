import type { SpeciesMix } from "../../bugs/model/species-mix";
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
import { spawnerTraitsOf } from "../model/spawner-variant";
import type { SpawnTuning } from "../model/spawn-tuning";
import type { TacticalApplied, TacticalEvent } from "../model/tactical-event";
import type { TacticalContext } from "../model/tactical-handler";
import type {
  EdgeSpawnSchedule,
  EdgeWaveSurge,
  Spawner,
  TacticalState,
} from "../model/tactical-state";
import type { Unit, UnitId } from "../model/unit";
import type { UnitTemplate } from "../model/unit-template";
import { footprintSizeOf, footprintTiles } from "./footprint-service";
import { footprintFits, occupiedKeys } from "./movement-service";
import type { PhaseStep } from "../model/phase-step";
import { buriedKeys } from "./tunnel-service";
import { bugUnit } from "./unit-factory";

// ===========================================
// Types
// ===========================================

/** What spawning needs injected: the species it may hatch and the knobs. */
export interface SpawnDeps {
  /**
   * Every species that may appear. A mission with a `bugMix` rolls the
   * ones it names by its weights; otherwise each is rolled by its
   * `hatchWeight`. A weight below or at zero never appears.
   */
  readonly species: readonly SpawnSource[];
  readonly tuning: SpawnTuning;
}

/** Bugs put on the map, and the mission with them in it. */
interface Placement {
  readonly state: TacticalState;
  readonly unitIds: readonly UnitId[];
}

/** A species the roll may draw, with the weight it is drawn by. */
interface Rollable {
  readonly source: SpawnSource;
  readonly weight: number;
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

/**
 * `podBurst` as a phase step for `createEndTurnHandler`, closed over the
 * deps. Registered right after the deadline step, so a pod that matures
 * as a phase opens bursts in that same phase start.
 */
export function createPodBurstStep(deps: SpawnDeps): PhaseStep {
  return (mission, ctx) => podBurst(mission, ctx, deps);
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
 *                          otherwise ──► shuffle free hatch tiles,
 *                                        take hatchCount + hatchBonus,
 *                                        one weighted species roll per bug
 *                                        (by bugMix, else hatchWeight),
 *                                        BugsSpawned { source: "spawner" }, timer ← interval
 * ```
 *
 * Draws from `ctx.rng.fork("spawn:hatch")`, spawners in `spawners`
 * order, so the edge wave's rolls never perturb these. A variant that
 * does not hatch (a spore pod) is left as it is, timer and all. A
 * spawner Hardened Clutches toughened (`hatchBonus`) releases that many
 * more bugs a hatch (campaign arc §11).
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
    // A spore pod never hatches: it matures instead (podBurst).
    if (spawner.destroyed || !spawnerTraitsOf(spawner).hatches) {
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
      deps.tuning.hatchCount + (spawner.hatchBonus ?? 0),
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
 *
 * Under Swarm Tide the schedule carries a `surge` (campaign arc §11):
 * the wave is `⌈size × sizeScale⌉` bugs, and it may stand on the ground
 * within `spillRadius` steps of its zone as well as on the zone, since
 * a zone is four to six tiles and a shipped wave already fills it from
 * difficulty 5. Without one, the wave is drawn exactly as it always was.
 *
 * ```
 *   surge ──► bugs = ⌈waveSize(…) × sizeScale⌉ on the zone ∪ spillRadius around it
 * ```
 */
export function edgeWave(
  mission: TacticalState,
  ctx: TacticalContext,
  deps: SpawnDeps,
): TacticalApplied<TacticalState> {
  if (mission.phase !== "bugs" || mission.turn < mission.edgeSpawn.nextTurn) {
    return { state: mission, events: [] };
  }
  const { wave, totalWaves } = mission.edgeSpawn;
  // The edges fall quiet once the mission has sent every wave it
  // promised (#1175); a schedule without a total sends them forever.
  if (totalWaves !== undefined && wave >= totalWaves) {
    return { state: mission, events: [] };
  }
  const edgeSpawn: EdgeSpawnSchedule = {
    ...mission.edgeSpawn,
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
  const zone = hook.tiles
    .map((coord) => snapshot.index.getAt(coord))
    .filter((tile): tile is Tile => tile !== undefined);
  const surge = mission.edgeSpawn.surge;
  const tiles =
    surge === undefined ? zone : surgeRoom(snapshot, zone, surge.spillRadius);
  const centre: TileCoord = {
    x: (mission.map.width - 1) / 2,
    y: 0,
    z: (mission.map.depth - 1) / 2,
  };
  const placed = placeBugs(
    mission,
    snapshot,
    tiles,
    surgedSize(
      waveSize(wave, mission.difficulty, mission.threat, deps.tuning),
      surge,
    ),
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
              wave: edgeSpawn.wave,
              ...(totalWaves === undefined ? {} : { totalWaves }),
            },
          },
        ]
      : [];
  return { state: { ...placed.state, edgeSpawn }, events };
}

// ===========================================
// Spore pods
// ===========================================

/**
 * Releases the wave of every spore pod that has matured since the last
 * phase start (campaign arc §6.3): `podBurstSize` bugs, room permitting,
 * on free tiles of the pod's hatch space — what infantry can reach
 * within `hatchRadius` of where it stood, its own tile included now it
 * is gone — facing out from it. The burst is released once: the pod's
 * `burstPending` is cleared whether or not there was room. Runs in any
 * phase, since a deadline passes as a player phase opens; the bugs
 * arrive spent (`ap` 0) and act from the next bug phase.
 *
 * ```
 *   no pod with burstPending ──► unchanged, nothing drawn
 *   for each such pod, in spawners order:
 *     podBurstSize(next wave, difficulty, threat) bugs on its free hatch tiles
 *     BugsSpawned { source: "pod", sourceId: pod.id }, burstPending ← false
 * ```
 *
 * Draws from `ctx.rng.fork("spawn:pod-burst")`, and only when a burst is
 * pending, so a mission without a pod draws exactly what it always did.
 */
export function podBurst(
  mission: TacticalState,
  ctx: TacticalContext,
  deps: SpawnDeps,
): TacticalApplied<TacticalState> {
  if (!mission.spawners.some((spawner) => spawner.burstPending === true)) {
    return { state: mission, events: [] };
  }
  const rng = ctx.rng.fork("spawn:pod-burst");
  const snapshot = snapshotMap(mission.map);
  const size = podBurstSize(
    mission.edgeSpawn.wave,
    mission.difficulty,
    mission.threat,
    deps.tuning,
  );
  let state = mission;
  const events: TacticalEvent[] = [];
  for (const pod of mission.spawners) {
    if (pod.burstPending !== true) {
      continue;
    }
    const room = hatchTiles(
      snapshot,
      pod.pos,
      pod.hatchRadius,
      PassMask.INFANTRY,
    );
    const placed = placeBugs(
      state,
      snapshot,
      room,
      size,
      rng,
      ctx.ids,
      deps.species,
      (tile) => facingFrom(pod.pos, tile),
    );
    state = placed.state;
    if (placed.unitIds.length > 0) {
      events.push({
        type: BUGS_SPAWNED,
        payload: { unitIds: placed.unitIds, source: "pod", sourceId: pod.id },
      });
    }
  }
  const spawners = mission.spawners.map((spawner): Spawner =>
    spawner.burstPending === true
      ? { ...spawner, burstPending: false }
      : spawner,
  );
  return { state: { ...state, spawners }, events };
}

/**
 * Hit points a spore pod starts with at this difficulty: the base plus
 * a share per difficulty step above one, floored.
 */
export function podHp(difficulty: number, tuning: SpawnTuning): number {
  return Math.floor(
    tuning.podHp + steps(difficulty) * tuning.podHpPerDifficulty,
  );
}

/**
 * Bugs a maturing pod releases: the size the next edge wave would have
 * (so difficulty, waves so far and threat all count) plus the pod's
 * bonus, never above `maxWaveSize`.
 *
 * @param wave - Edge waves landed so far; the burst is sized as the next one.
 */
export function podBurstSize(
  wave: number,
  difficulty: number,
  threat: number,
  tuning: SpawnTuning,
): number {
  return Math.min(
    tuning.maxWaveSize,
    waveSize(wave, difficulty, threat, tuning) + tuning.podBurstBonus,
  );
}

// ===========================================
// Escalation
// ===========================================

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
// Surge
// ===========================================

/**
 * An edge wave's size under Swarm Tide's surge: the spawn tuning's size
 * multiplied by `sizeScale` and rounded up, so every wave of one or more
 * gains at least one bug. The tuning's `maxWaveSize` capped the size
 * before the surge, so a capped wave of 8 lands 12. Without a surge,
 * the size as it came.
 *
 * @param size - The wave the spawn tuning makes.
 * @param surge - Swarm Tide's hold on the schedule, when it has one.
 */
export function surgedSize(size: number, surge?: EdgeWaveSurge): number {
  return surge === undefined ? size : Math.ceil(size * surge.sizeScale);
}

/**
 * Where a surging wave may stand: its zone's tiles, then every tile
 * infantry reach within `radius` steps of one of them that is not
 * already listed, each zone tile's reach in discovery order. The zone's
 * own tiles come first and are never lost; the candidates are shuffled
 * before they are taken, so the order only fixes the draws.
 *
 * @param snapshot - The map's traversal snapshot.
 * @param zone - The edge-spawn hook's tiles, in hook order.
 * @param radius - How far past the zone the wave may spill.
 */
export function surgeRoom(
  snapshot: ReachabilitySnapshot,
  zone: readonly Tile[],
  radius: number,
): Tile[] {
  const seen = new Set(zone.map((tile) => snapshot.index.keyOf(tile)));
  const room: Tile[] = [...zone];
  for (const origin of zone) {
    for (const tile of hatchTiles(
      snapshot,
      origin,
      radius,
      PassMask.INFANTRY,
    )) {
      const key = snapshot.index.keyOf(tile);
      if (!seen.has(key)) {
        seen.add(key);
        room.push(tile);
      }
    }
  }
  return room;
}

// ===========================================
// Helpers
// ===========================================

/**
 * Puts up to `count` bugs on free, infantry-passable tiles among the
 * candidates: the candidates are shuffled and the first `count` taken,
 * then each gets one species rolled by `rollableSpecies` — the
 * mission's species mix when it has one, hatch weight otherwise. New
 * units arrive with no action points; their templates join the
 * mission's if missing.
 *
 * A species with a footprint (#1130) needs its whole block to fit —
 * every tile standing, passable and free, the block unbroken by walls —
 * with the drawn tile somewhere in it. The anchors that put the drawn
 * tile in each corner are tried in footprint order and the first that
 * fits is taken; when none does, that bug is not hatched and the draw
 * moves on. The draws themselves are untouched, so a seed that placed a
 * swarmer on a tile still does, and a brute that does not fit costs
 * nothing but its own absence. Tiles a placed block covers are taken
 * for the rest of the batch, so no hatchling lands inside a brute.
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
  const weighted = rollableSpecies(species, mission.bugMix);
  if (count <= 0 || weighted.length === 0) {
    return { state: mission, unitIds: [] };
  }
  const taken = new Set(occupiedKeys(mission, snapshot.index));
  // Nor is a burrower's (#1179): it holds no tile on the surface, but a
  // hatchling dropped on top of it would leave it nowhere to come up.
  for (const key of buriedKeys(mission, snapshot.index)) {
    taken.add(key);
  }
  // A live spawner's tile is never stood on either: the room already
  // leaves out its own, and a block must not reach across onto one.
  for (const spawner of mission.spawners) {
    if (!spawner.destroyed && snapshot.index.inBounds(spawner.pos)) {
      taken.add(snapshot.index.keyOf(spawner.pos));
    }
  }
  const free = candidates.filter(
    (tile) =>
      allows(tile.pass, PassMask.INFANTRY) &&
      !taken.has(snapshot.index.keyOf(tile)),
  );
  const chosen = rng.shuffle(free).slice(0, count);
  if (chosen.length === 0) {
    return { state: mission, unitIds: [] };
  }
  const graph = { index: snapshot.index, reachability: snapshot.reach };
  const units: Unit[] = [...mission.units];
  const templates: Record<string, UnitTemplate> = { ...mission.templates };
  const unitIds: UnitId[] = [];
  for (const tile of chosen) {
    const { source } = rng.pickWeighted(weighted, (entry) => entry.weight);
    const size = footprintSizeOf(source);
    const anchor = footprintTiles(tile, size)
      .map((corner) => ({
        x: tile.x - (corner.x - tile.x),
        y: tile.y,
        z: tile.z - (corner.z - tile.z),
      }))
      .find(
        (candidate) =>
          footprintFits(graph, candidate, size, PassMask.INFANTRY) &&
          footprintTiles(candidate, size).every(
            (cell) => !taken.has(snapshot.index.keyOf(cell)),
          ),
      );
    if (anchor === undefined) {
      continue;
    }
    const built = bugUnit(
      source,
      { pos: anchor, facing: facingOf(tile) },
      { ids },
    );
    for (const cell of footprintTiles(anchor, size)) {
      taken.add(snapshot.index.keyOf(cell));
    }
    units.push({ ...built.unit, ap: 0 });
    templates[built.template.id] ??= built.template;
    unitIds.push(built.unit.id);
  }
  return { state: { ...mission, units, templates }, unitIds };
}

/**
 * The species a roll draws from, in `species` order, each with its
 * weight (ADR 0013 §2.6). With a mix, a species is weighed by its entry
 * there and one the mix does not name, or weighs at zero or below, is
 * left out; a species the mix names that is not in `species` is simply
 * never drawn. Without a mix — an offer from before the bestiary — or
 * with one that leaves nothing to draw, each species is weighed by its
 * `hatchWeight`, exactly as the roll always has, so an old mission's
 * draws are unchanged.
 *
 * ```
 *   bugMix present, some species it names are here ──► weight = bugMix[id]
 *   otherwise                                       ──► weight = hatchWeight
 *   weight ≤ 0 ──► left out (pickWeighted's fall-through never lands on it)
 * ```
 */
function rollableSpecies(
  species: readonly SpawnSource[],
  mix: SpeciesMix | undefined,
): readonly Rollable[] {
  if (mix !== undefined) {
    const mixed = species
      .map((source) => ({ source, weight: mixWeight(mix, source.id) }))
      .filter((entry) => entry.weight > 0);
    if (mixed.length > 0) {
      return mixed;
    }
  }
  return species
    .filter((source) => source.hatchWeight > 0)
    .map((source) => ({ source, weight: source.hatchWeight }));
}

/**
 * A species' weight in a mix: its entry when that is a finite number,
 * else 0. The id is a unit source's plain string, not a `BugSpeciesId`,
 * so anything it finds that is not a number (a prototype member, a
 * `null` from a hand-edited save) weighs nothing.
 */
function mixWeight(mix: SpeciesMix, id: string): number {
  const weight: unknown = (mix as Readonly<Record<string, unknown>>)[id];
  return typeof weight === "number" && Number.isFinite(weight) ? weight : 0;
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
