import { DIRECTIONS } from "../../core/model/direction";
import { stepGridPos } from "../../core/service/grid-math";
import { INFESTATION_TUNING } from "../data/infestation-tuning";
import type { MapDraft } from "../model/map-draft";
import type { TileCoord } from "../model/tile-coord";

/** The colony's shared pressure at a column, zero outside the map or on a clean map. */
export function infestationPressure(
  draft: MapDraft,
  x: number,
  z: number,
): number {
  return draft.inBounds(x, z)
    ? (draft.infestation?.influence[z * draft.width + x] ?? 0)
    : 0;
}

/** Hook footprints and their approach, plus every entrance and connector, stay clear of blockers. */
export function protectedInfestationColumns(
  draft: MapDraft,
  firingRoutes: readonly TileCoord[] = [],
): ReadonlySet<number> {
  const anchors = [
    ...draft.hooks.deployZones.flatMap((hook) => hook.tiles),
    ...draft.hooks.objectives.flatMap((hook) => hook.tiles),
    ...draft.hooks.edgeSpawns.flatMap((hook) => hook.tiles),
    ...(draft.hooks.extraction?.tiles ?? []),
    ...draft.connectors.flatMap((connector) => [connector.from, connector.to]),
    ...draft.buildings.flatMap((building) =>
      building.entrances.map((entrance) => entrance.tile),
    ),
  ];
  // Preserve the exterior firing positions used to select indoor objectives.
  // A new colony blocker outside a window must not make an egg room unbeatable.
  for (const hook of draft.hooks.objectives) {
    for (const origin of hook.tiles) {
      for (const direction of DIRECTIONS) {
        let at = origin;
        for (let distance = 0; distance < 10; distance++) {
          const wall = draft.wallAt(at, direction);
          if (wall === "solid" || wall === "door") break;
          const next = stepGridPos(at, direction);
          if (!draft.inBounds(next.x, next.z) || draft.propAt(next)) break;
          if (!draft.getTile(next)) {
            if (draft.groundLevelAt(next.x, next.z) === origin.y)
              anchors.push(next);
            break;
          }
          at = next;
        }
      }
    }
  }
  const protectedColumns = new Set<number>();
  for (const anchor of anchors)
    for (
      let dz = -INFESTATION_TUNING.hookClearance;
      dz <= INFESTATION_TUNING.hookClearance;
      dz++
    )
      for (
        let dx = -INFESTATION_TUNING.hookClearance;
        dx <= INFESTATION_TUNING.hookClearance;
        dx++
      )
        if (draft.inBounds(anchor.x + dx, anchor.z + dz))
          protectedColumns.add((anchor.z + dz) * draft.width + anchor.x + dx);
  // The full mech route needs only its exact occupied columns. Multi-tile
  // colony blockers test every cell, so a one-tile route remains traversable.
  for (const tile of firingRoutes)
    protectedColumns.add(tile.z * draft.width + tile.x);
  return protectedColumns;
}
