import { DIRECTIONS } from "../../core/model/direction";
import { stepGridPos } from "../../core/service/grid-math";
import { INFESTATION_TUNING } from "../data/infestation-tuning";
import { PropKindIds } from "../data/props";
import { SurfaceIds } from "../data/surfaces";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../model/generation-pass";
import type { MapDraft } from "../model/map-draft";
import { PassMask } from "../model/pass-mask";
import type { Rotation } from "../model/prop";
import type { TileCoord } from "../model/tile-coord";
import { ValueNoise } from "../service/value-noise";

/** Seeded infestation applied after placement, before the final connectivity repair. */
export class InfestationPass implements GenerationPass {
  // ===========================================
  // Pass contract
  // ===========================================
  readonly id = "infestation";
  readonly requires: readonly DraftCapability[] = [
    "heightmap",
    "props",
    "hooks",
  ];
  readonly provides: readonly DraftCapability[] = [];

  // ===========================================
  // Generation
  // ===========================================

  /** Expands coherent ground patches, places spike nests, and erodes building shells. */
  run(context: GenerationContext): void {
    const { params, draft, rng, diagnostics } = context;
    if (params.infestation === 0) return;
    const fraction = params.infestation / 10;
    const protectedColumns = protectedGround(draft);
    const noise = new ValueNoise(rng.fork("patches"));
    const candidates: { tile: TileCoord; score: number }[] = [];
    for (let z = 0; z < draft.depth; z++) {
      for (let x = 0; x < draft.width; x++) {
        if (
          !patchable(context, x, z) ||
          protectedColumns.has(z * draft.width + x)
        )
          continue;
        candidates.push({
          tile: draft.groundCoord(x, z),
          score: noise.fbm(
            x * INFESTATION_TUNING.patchFrequency,
            z * INFESTATION_TUNING.patchFrequency,
            2,
            0.35,
          ),
        });
      }
    }
    // A fixed ranking keeps existing patches as the level grows and gives a
    // predictable share on every biome, even where the noise range is narrow.
    candidates.sort((a, b) => a.score - b.score);
    const patches = candidates.slice(
      0,
      Math.floor(candidates.length * fraction * INFESTATION_TUNING.groundShare),
    );
    for (const { tile } of patches)
      draft.setGroundSurface(tile.x, tile.z, SurfaceIds.INFESTED);
    let nests = 0;
    const nestTarget = Math.ceil(
      patches.length * fraction * INFESTATION_TUNING.nestShare,
    );
    for (const { tile } of rng.fork("nests").shuffle(patches)) {
      if (nests >= nestTarget) break;
      const roll = rng.fork(`nest:${tile.x}:${tile.z}`);
      if (!nestFits(context, tile, protectedColumns)) continue;
      draft.addProp(
        PropKindIds.INFESTED_NEST,
        tile,
        roll.nextInt(0, 3) as Rotation,
      );
      nests++;
    }
    damageBuildings(context, fraction);
    diagnostics.note(
      `Infestation ${params.infestation}/10: ${patches.length} ground tiles, ${nests} spike nests`,
    );
  }
}

/** Natural ground accepts growth; roads, pavement and shaped transitions retain their authored surfaces. */
function patchable(
  { draft, registries }: GenerationContext,
  x: number,
  z: number,
): boolean {
  if (
    !draft.inBounds(x, z) ||
    draft.isCovered(x, z) ||
    draft.isLandingReserved(x, z) ||
    draft.isNaturalEdge(x, z) ||
    draft.slopeAt(x, z)
  )
    return false;
  const surface = draft.groundSurfaceAt(x, z);
  return (
    surface !== SurfaceIds.ROAD &&
    surface !== SurfaceIds.SIDEWALK &&
    registries.surfaces.get(surface).defaultPass === PassMask.ALL
  );
}

/** Keeps hook neighbourhoods, entrances and connector ends open, including hatch space. */
function protectedGround(draft: MapDraft): Set<number> {
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
  const protectedColumns = new Set<number>();
  for (const anchor of anchors) {
    for (
      let dz = -INFESTATION_TUNING.hookClearance;
      dz <= INFESTATION_TUNING.hookClearance;
      dz++
    ) {
      for (
        let dx = -INFESTATION_TUNING.hookClearance;
        dx <= INFESTATION_TUNING.hookClearance;
        dx++
      ) {
        if (draft.inBounds(anchor.x + dx, anchor.z + dz))
          protectedColumns.add((anchor.z + dz) * draft.width + anchor.x + dx);
      }
    }
  }
  return protectedColumns;
}

/** Nests need open approaches and separation; final connectivity repairs any severed route. */
function nestFits(
  context: GenerationContext,
  tile: TileCoord,
  protectedColumns: ReadonlySet<number>,
): boolean {
  const { draft } = context;
  if (draft.propAt(tile) || Object.keys(draft.wallsAt(tile)).length > 0)
    return false;
  let approaches = 0;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = tile.x + dx;
      const z = tile.z + dz;
      if (!draft.inBounds(x, z)) continue;
      const cell = draft.groundCoord(x, z);
      if (draft.propAt(cell)?.kind === PropKindIds.INFESTED_NEST) return false;
      if (
        Math.abs(dx) + Math.abs(dz) === 1 &&
        cell.y === tile.y &&
        !draft.isCovered(x, z) &&
        !draft.propAt(cell) &&
        Object.keys(draft.wallsAt(cell)).length === 0 &&
        !protectedColumns.has(z * draft.width + x) &&
        context.registries.surfaces.get(draft.groundSurfaceAt(x, z))
          .defaultPass === PassMask.ALL
      )
        approaches++;
    }
  }
  return approaches >= 3;
}

/** Removes shell pieces without changing floors, doors, stair supports or walkable roofs. */
function damageBuildings(
  { draft, rng }: GenerationContext,
  fraction: number,
): void {
  const seen = new Set<string>();
  const supports = new Set(
    draft.connectors.flatMap((connector) => [
      draft.tileKey(connector.from),
      draft.tileKey(connector.to),
    ]),
  );
  for (const tile of draft.tiles()) {
    if (tile.buildingId === undefined || supports.has(draft.tileKey(tile)))
      continue;
    for (const side of DIRECTIONS) {
      const neighbour = stepGridPos(tile, side);
      if (supports.has(draft.tileKey(neighbour))) continue;
      const key = [draft.tileKey(tile), draft.tileKey(neighbour)]
        .sort((a, b) => a - b)
        .join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      const wall = draft.wallAt(tile, side);
      if (wall !== "solid" && wall !== "window") continue;
      const roll = rng.fork(`wall:${key}`);
      if (roll.chance(fraction * INFESTATION_TUNING.wallDamageShare)) {
        draft.setWall(tile, side, roll.chance(0.5) ? "half" : undefined);
      }
    }
  }
  for (let i = 0; i < draft.buildings.length; i++) {
    const building = draft.buildings[i]!;
    if (building.roof.kind !== "pitched" || building.roof.walkable) continue;
    const missingTiles: { x: number; z: number }[] = [];
    for (const rect of building.footprint) {
      for (let z = rect.z; z < rect.z + rect.d; z++) {
        for (let x = rect.x; x < rect.x + rect.w; x++) {
          if (
            rng
              .fork(`roof:${building.id}:${x}:${z}`)
              .chance(fraction * INFESTATION_TUNING.roofDamageShare)
          )
            missingTiles.push({ x, z });
        }
      }
    }
    if (missingTiles.length > 0)
      draft.buildings[i] = {
        ...building,
        roof: { ...building.roof, missingTiles },
      };
  }
}
