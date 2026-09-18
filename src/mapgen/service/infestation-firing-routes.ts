import { DIRECTIONS } from "../../core/model/direction";
import { stepGridPos } from "../../core/service/grid-math";
import type { GenerationContext } from "../model/generation-pass";
import type { MapDraft } from "../model/map-draft";
import { allows, PassMask } from "../model/pass-mask";
import type { Tile } from "../model/tile";
import type { TileCoord } from "../model/tile-coord";
import { freezeDraft } from "./draft-freezer";
import { snapshotMap } from "./hatch-space";

// ===========================================
// Route planning
// ===========================================

/** One shortest-path step from any mech-passable deployment tile. */
interface Visit {
  readonly tile: Tile;
  readonly distance: number;
  readonly previous?: number;
}

/** A visible outdoor firing tile and the interior sightline that reaches it. */
interface FiringLine {
  readonly target: TileCoord;
  readonly line: readonly TileCoord[];
}

/**
 * Reserves one existing mech route and sightline per objective before colony
 * obstacles appear. Only exact path columns are returned; growth still covers
 * them and no wide clean strip is cut through the colony.
 */
export function infestationFiringRoutes({
  draft,
  params,
  registries,
}: Pick<
  GenerationContext,
  "draft" | "params" | "registries"
>): readonly TileCoord[] {
  if (draft.infestation === undefined || draft.hooks.objectives.length === 0)
    return [];
  const map = freezeDraft(
    draft,
    {
      seed: "infestation-firing-routes",
      params: {
        archetype: params.archetype,
        biome: params.biome.id,
        settlement: params.settlement.id,
        size: { width: draft.width, depth: draft.depth },
        hooks: params.hooks,
      },
    },
    registries,
  );
  const { index, reach } = snapshotMap(map);
  const visits = new Map<number, Visit>();
  const queue: Tile[] = [];
  for (const origin of draft.hooks.deployZones.flatMap((hook) => hook.tiles)) {
    const tile = index.getAt(origin);
    if (tile === undefined || !allows(tile.pass, PassMask.MECH)) continue;
    const key = index.keyOf(tile);
    if (visits.has(key)) continue;
    visits.set(key, { tile, distance: 0 });
    queue.push(tile);
  }
  for (const tile of queue) {
    const previous = index.keyOf(tile);
    const distance = visits.get(previous)!.distance + 1;
    for (const next of reach.neighbours(tile, PassMask.MECH)) {
      const key = index.keyOf(next);
      if (visits.has(key)) continue;
      visits.set(key, { tile: next, previous, distance });
      queue.push(next);
    }
  }
  const protectedTiles = new Map<number, TileCoord>();
  for (const hook of draft.hooks.objectives) {
    const lines = hook.tiles.flatMap((origin) => firingLines(draft, origin));
    const reachable = lines
      .filter((line) => visits.has(index.keyOf(line.target)))
      .sort(
        (a, b) =>
          visits.get(index.keyOf(a.target))!.distance -
          visits.get(index.keyOf(b.target))!.distance,
      );
    const chosen = reachable[0];
    if (chosen === undefined) continue;
    for (const tile of chosen.line) protectedTiles.set(index.keyOf(tile), tile);
    let visit = visits.get(index.keyOf(chosen.target));
    while (visit !== undefined) {
      protectedTiles.set(index.keyOf(visit.tile), visit.tile);
      visit =
        visit.previous === undefined ? undefined : visits.get(visit.previous);
    }
  }
  return [...protectedTiles.values()];
}

// ===========================================
// Existing objective firing positions
// ===========================================

/** Matches the egg placer's conservative cardinal sightline rule. */
function firingLines(draft: MapDraft, origin: TileCoord): FiringLine[] {
  const result: FiringLine[] = [];
  for (const direction of DIRECTIONS) {
    let at = origin;
    const line: TileCoord[] = [origin];
    for (let distance = 0; distance < 10; distance++) {
      const wall = draft.wallAt(at, direction);
      if (wall === "solid" || wall === "door") break;
      const next = stepGridPos(at, direction);
      if (!draft.inBounds(next.x, next.z) || draft.propAt(next)) break;
      line.push(next);
      if (draft.getTile(next) === undefined) {
        const target = draft.groundCoord(next.x, next.z);
        if (target.y === origin.y) result.push({ target, line });
        break;
      }
      at = next;
    }
  }
  return result;
}
