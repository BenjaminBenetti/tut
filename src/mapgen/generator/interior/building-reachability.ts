import { DIRECTIONS } from "../../../core/model/direction";
import { stepGridPos } from "../../../core/service/grid-math";
import type { Connector } from "../../model/connector";
import type { DraftTile, MapDraft } from "../../model/map-draft";
import type { TileCoord } from "../../model/tile-coord";

// ===========================================
// Building reachability on the draft
// ===========================================

/**
 * Infantry BFS over one building's draft tiles up to `maxLevel`: same-
 * level steps through edges without a solid or window wall, plus the
 * given connectors. Tiles holding a prop are impassable and are not
 * expected to be reached. Returns the tiles it could not reach from
 * `start`. The interior and prop passes use it to accept or reject a
 * placement before the map exists; the validator repeats the check on
 * the frozen map.
 */
export function unreachableInteriorTiles(
  draft: MapDraft,
  buildingId: string,
  connectors: readonly Connector[],
  start: TileCoord,
  maxLevel: number,
): DraftTile[] {
  const tiles = draft
    .tilesOfBuilding(buildingId)
    .filter((tile) => tile.y <= maxLevel && draft.propAt(tile) === undefined);
  const byKey = new Map(tiles.map((tile) => [draft.tileKey(tile), tile]));
  const links = new Map<number, number[]>();
  for (const connector of connectors) {
    const a = draft.tileKey(connector.from);
    const b = draft.tileKey(connector.to);
    if (byKey.has(a) && byKey.has(b)) {
      links.set(a, [...(links.get(a) ?? []), b]);
      links.set(b, [...(links.get(b) ?? []), a]);
    }
  }

  const origin = byKey.get(draft.tileKey(start));
  if (origin === undefined) {
    return tiles;
  }
  const seen = new Set<number>([draft.tileKey(origin)]);
  const frontier: DraftTile[] = [origin];
  for (const current of frontier) {
    const key = draft.tileKey(current);
    for (const direction of DIRECTIONS) {
      const wall = draft.wallAt(current, direction);
      if (wall === "solid" || wall === "window") {
        continue;
      }
      const next = byKey.get(draft.tileKey(stepGridPos(current, direction)));
      if (next !== undefined && !seen.has(draft.tileKey(next))) {
        seen.add(draft.tileKey(next));
        frontier.push(next);
      }
    }
    for (const linked of links.get(key) ?? []) {
      const next = byKey.get(linked);
      if (next !== undefined && !seen.has(linked)) {
        seen.add(linked);
        frontier.push(next);
      }
    }
  }
  return tiles.filter((tile) => !seen.has(draft.tileKey(tile)));
}
