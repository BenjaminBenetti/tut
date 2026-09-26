import type { Direction } from "../../core/model/direction";
import type { IdGenerator } from "../../core/model/id-generator";
import type { Result } from "../../core/model/result";
import { err, ok } from "../../core/model/result";
import type { Tile } from "../../mapgen/model/tile";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { BugUnitSource } from "../model/bug-unit-source";
import type { TacticalError } from "../model/tactical-error";
import type { TacticalState } from "../model/tactical-state";
import type { UnitId } from "../model/unit";
import { groundTileAt, isDiggable, tunnelHeldKeys } from "./tunnel-service";
import { bugUnit } from "./unit-factory";

// ===========================================
// Types
// ===========================================

/** What placing a burrower at a map position needs. */
export interface BurrowerSpawnDeps {
  /** Issues the unit's id; the mission's generator. */
  readonly ids: IdGenerator;
  /**
   * The species to build, from `bugs/data` via the composition root, so
   * `tactical` never imports bug data. It must dig (`burrows`), or the
   * unit would arrive standing on the surface.
   */
  readonly species: BugUnitSource;
  /** Which way it faces when it comes up; north by default. */
  readonly facing?: Direction;
  /**
   * How far, in columns (Manhattan), to look for free ground when the
   * column at `pos` is held or cannot be dug. `SPAWN_SEARCH_RADIUS` by
   * default; `0` insists on the column itself.
   */
  readonly radius?: number;
}

/** A burrower placed under the ground, and the id it was given. */
export interface BurrowerSpawn {
  readonly state: TacticalState;
  readonly unitId: UnitId;
}

// ===========================================
// Constants
// ===========================================

/** Columns either way a spawn looks for free ground around a held mouth. */
export const SPAWN_SEARCH_RADIUS = 2;

// ===========================================
// Spawning
// ===========================================

/**
 * Puts one burrower under the ground at a map position (#1179): the
 * hook a tunnel mouth (campaign arc §6.7, Tunnel Sabotage) spawns
 * through. It arrives `burrowed` — the unit factory builds a digging
 * species that way — with no action points, like every hatchling, so it
 * first tunnels in the next bug phase; its template joins the mission's
 * if missing.
 *
 * It goes under the column at `pos` when that ground can be dug and no
 * unit or live spawner holds it (`tunnelHeldKeys`), else under the
 * nearest column within `radius` that qualifies — nearest by Manhattan
 * distance, ties broken by `x` then `z` so a seed always lands the same
 * way. It emits nothing: an arrival nobody can see is not news, and the
 * caller that owns the mouth decides what, if anything, to announce.
 *
 * ```
 *   pos's column diggable and free ──► under it
 *   else nearest free column within radius ──► under that
 *   none ──► err illegal-burrow (tile-held)
 *   species does not dig ──► err illegal-burrow (not-a-burrower)
 * ```
 *
 * @param mission - The mission to add it to.
 * @param pos - Where the mouth is; only its column matters.
 * @param deps - Ids, the species, and optionally facing and radius.
 * @returns The mission with the burrower in it and its id, or why not.
 */
export function spawnBurrowerAt(
  mission: TacticalState,
  pos: TileCoord,
  deps: BurrowerSpawnDeps,
): Result<BurrowerSpawn, TacticalError> {
  if (deps.species.burrows !== true) {
    return err({
      kind: "illegal-burrow",
      unitId: deps.species.id,
      reason: "not-a-burrower",
    });
  }
  const index = new TileIndex(mission.map);
  const ground = freeGroundNear(
    mission,
    index,
    pos,
    deps.radius ?? SPAWN_SEARCH_RADIUS,
  );
  if (ground === undefined) {
    return err({
      kind: "illegal-burrow",
      unitId: deps.species.id,
      reason: "tile-held",
    });
  }
  const built = bugUnit(
    deps.species,
    {
      pos: { x: ground.x, y: ground.y, z: ground.z },
      facing: deps.facing ?? "n",
    },
    { ids: deps.ids },
  );
  return ok({
    state: {
      ...mission,
      units: [...mission.units, { ...built.unit, ap: 0 }],
      templates: {
        ...mission.templates,
        [built.template.id]:
          mission.templates[built.template.id] ?? built.template,
      },
    },
    unitId: built.unit.id,
  });
}

// ===========================================
// Helpers
// ===========================================

/**
 * The nearest diggable, unheld ground tile to `pos` within `radius`
 * columns, scanning outward ring by ring and, within a ring, by `x`
 * then `z`.
 */
function freeGroundNear(
  mission: TacticalState,
  index: TileIndex,
  pos: TileCoord,
  radius: number,
): Tile | undefined {
  const held = tunnelHeldKeys(mission, index);
  for (let ring = 0; ring <= radius; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      const span = ring - Math.abs(dx);
      for (const dz of span === 0 ? [0] : [-span, span]) {
        const tile = groundTileAt(index, pos.x + dx, pos.z + dz);
        if (
          tile !== undefined &&
          isDiggable(tile) &&
          !held.has(index.keyOf(tile))
        ) {
          return tile;
        }
      }
    }
  }
  return undefined;
}
