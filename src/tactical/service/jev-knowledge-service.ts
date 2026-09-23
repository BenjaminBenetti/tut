import { TileIndex } from "../../mapgen/service/tile-index";
import { PassMask } from "../../mapgen/model/pass-mask";
import type { TacticalState } from "../model/tactical-state";
import { TEAMS } from "../model/unit";
import { mechCanOccupyRoof } from "./mech-rooftop-service";

/** Remember observed terrain; unseen mutations never refresh an old observation. */
export function rememberJevTerrain(mission: TacticalState): TacticalState {
  if (!mission.jev) return mission;
  const index = new TileIndex(mission.map);
  const knowledge = { ...mission.jev.knowledge };
  for (const team of TEAMS) {
    const visible = new Set(mission.vision[team].visible);
    const old = knowledge[team];
    const tiles = new Map(
      (old?.tiles ?? [])
        .filter((tile) => !visible.has(index.keyOf(tile)))
        .map((tile) => [index.keyOf(tile), tile]),
    );
    for (const tile of mission.map.tiles) {
      if (!visible.has(index.keyOf(tile))) continue;
      // Preserve only the observed roof occupancy fact, not hidden building internals.
      tiles.set(
        index.keyOf(tile),
        mechCanOccupyRoof(mission.map, tile)
          ? { ...tile, pass: tile.pass | PassMask.MECH }
          : tile,
      );
    }
    const connectors = new Map(
      (old?.connectors ?? [])
        .filter(
          (link) =>
            !visible.has(index.keyOf(link.from)) &&
            !visible.has(index.keyOf(link.to)),
        )
        .map((link) => [link.id, link]),
    );
    for (const link of mission.map.connectors) {
      if (
        visible.has(index.keyOf(link.from)) &&
        visible.has(index.keyOf(link.to))
      )
        connectors.set(link.id, link);
    }
    knowledge[team] = {
      tiles: [...tiles.values()],
      connectors: [...connectors.values()],
    };
  }
  return { ...mission, jev: { ...mission.jev, knowledge } };
}
