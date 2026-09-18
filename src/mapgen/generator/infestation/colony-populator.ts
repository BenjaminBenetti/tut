import { INFESTATION_TUNING } from "../../data/infestation-tuning";
import { PropKindIds } from "../../data/props";
import { SurfaceIds } from "../../data/surfaces";
import type { GenerationContext } from "../../model/generation-pass";
import type { Rotation } from "../../model/prop";
import type { TileCoord } from "../../model/tile-coord";
import { infestationPressure } from "../../service/infestation-layout";
import { propPlacementTiles } from "../../service/prop-footprint";

/** Satellite organisms arranged around breeding centres, rather than uniform scatter. */
const SATELLITE_KINDS = [
  PropKindIds.INFESTED_SPINES,
  PropKindIds.INFESTED_VENT,
  PropKindIds.INFESTED_RIBS,
  PropKindIds.INFESTED_EGGS,
  PropKindIds.INFESTED_ARCH,
  PropKindIds.INFESTED_NEST,
] as const;

/** Installs large colony anchors, staggered ribs, brood chambers and ruined masonry. */
export function populateInfestationColonies(
  context: GenerationContext,
  protectedColumns: ReadonlySet<number>,
): number {
  const { draft, rng } = context;
  const plan = draft.infestation;
  if (plan === undefined) return 0;
  let count = 0;
  for (const zone of plan.zones) {
    const anchorKind =
      zone.maturity === "hive"
        ? PropKindIds.INFESTED_HIVE
        : zone.maturity === "nest"
          ? PropKindIds.INFESTED_BROOD
          : PropKindIds.INFESTED_NEST;
    const offsets = [
      { x: 0, z: 0 },
      { x: -1, z: -1 },
      { x: 1, z: 0 },
      { x: 0, z: 1 },
      { x: -2, z: 0 },
      { x: 0, z: -2 },
    ];
    for (const offset of offsets) {
      const x = zone.centre.x + offset.x;
      const z = zone.centre.z + offset.z;
      if (
        place(context, anchorKind, draft.groundCoord(x, z), 0, protectedColumns)
      ) {
        count++;
        break;
      }
    }
  }
  const candidates: TileCoord[] = [];
  for (let z = 2; z < draft.depth - 2; z++)
    for (let x = 2; x < draft.width - 2; x++)
      if (infestationPressure(draft, x, z) > 0.22 && !draft.isCovered(x, z))
        candidates.push(draft.groundCoord(x, z));
  const target = Math.round(
    candidates.length *
      INFESTATION_TUNING.propsPerGrowthTile *
      (0.3 + plan.level * 0.07),
  );
  const ordered = rng.fork("colony-satellites").shuffle(candidates);
  for (const ruin of plan.ruins) {
    const building = draft.buildings.find(
      (item) => item.id === ruin.buildingId,
    );
    if (building === undefined) continue;
    const ruinKinds = [
      PropKindIds.INFESTED_RUBBLE,
      PropKindIds.INFESTED_RUIN,
      PropKindIds.INFESTED_DEBRIS,
    ] as const;
    const distanceToBreach = (tile: TileCoord): number =>
      Math.hypot(tile.x - ruin.breach.x, tile.z - ruin.breach.z);
    const nearby = ordered
      .filter((tile) => distanceToBreach(tile) < ruin.radius + 3)
      .sort((a, b) => distanceToBreach(a) - distanceToBreach(b));
    let placed = 0;
    for (const tile of nearby) {
      if (placed >= ruinKinds.length) break;
      if (nearExistingOrganism(context, tile)) continue;
      if (
        place(
          context,
          ruinKinds[placed]!,
          tile,
          rng.fork(`rubble:${tile.x}:${tile.z}`).nextInt(0, 3) as Rotation,
          protectedColumns,
        )
      ) {
        count++;
        placed++;
      }
    }
  }
  if (plan.level >= 4 && context.params.settlement.id !== "rural") {
    let shelters = 0;
    for (const tile of ordered) {
      if (shelters >= Math.max(1, Math.floor(plan.level / 4))) break;
      if (!draft.isRoad(tile.x, tile.z) || nearExistingOrganism(context, tile))
        continue;
      const alongX =
        draft.inBounds(tile.x + 1, tile.z) && draft.isRoad(tile.x + 1, tile.z);
      const alongZ =
        draft.inBounds(tile.x, tile.z + 1) && draft.isRoad(tile.x, tile.z + 1);
      if (!alongX && !alongZ) continue;
      if (
        place(
          context,
          PropKindIds.INFESTED_SHELTER,
          tile,
          alongX ? 0 : 1,
          protectedColumns,
        )
      ) {
        shelters++;
        count++;
      }
    }
  }
  let satellites = 0;
  for (const tile of ordered) {
    if (satellites >= target) break;
    const roll = rng.fork(`organism:${tile.x}:${tile.z}`);
    // Broken, staggered arcs leave broad approaches and let a 2x2 brute pass.
    if (nearExistingOrganism(context, tile)) continue;
    const rotation = roll.nextInt(0, 3) as Rotation;
    const kinds =
      plan.level < 4
        ? [
            PropKindIds.INFESTED_SPINES,
            PropKindIds.INFESTED_VENT,
            PropKindIds.INFESTED_NEST,
          ]
        : SATELLITE_KINDS;
    const kind = kinds[satellites % kinds.length]!;
    if (place(context, kind, tile, rotation, protectedColumns)) satellites++;
  }
  count += satellites;
  return count;
}

/** Avoids solid rings of obstacles, preserving open approaches around each cluster. */
function nearExistingOrganism(
  { draft }: GenerationContext,
  tile: TileCoord,
): boolean {
  for (let dz = -2; dz <= 2; dz++)
    for (let dx = -2; dx <= 2; dx++) {
      if (!draft.inBounds(tile.x + dx, tile.z + dz)) continue;
      const prop = draft.propAt(draft.groundCoord(tile.x + dx, tile.z + dz));
      if (prop?.kind.startsWith("infested-")) return true;
    }
  return false;
}

/** Checks a whole rotated footprint and its circulation margin before committing a blocker. */
function place(
  context: GenerationContext,
  kind: string,
  tile: TileCoord,
  rotation: Rotation,
  protectedColumns: ReadonlySet<number>,
): boolean {
  const { draft, registries } = context;
  const cells = propPlacementTiles(tile, registries.props.get(kind), rotation);
  for (const cell of cells) {
    if (
      !draft.inBounds(cell.x, cell.z) ||
      draft.isLandingReserved(cell.x, cell.z) ||
      draft.isCovered(cell.x, cell.z) ||
      protectedColumns.has(cell.z * draft.width + cell.x) ||
      draft.groundLevelAt(cell.x, cell.z) !== tile.y ||
      draft.groundSurfaceAt(cell.x, cell.z) !== SurfaceIds.INFESTED ||
      draft.slopeAt(cell.x, cell.z) ||
      draft.propAt(cell) ||
      Object.keys(draft.wallsAt(cell)).length > 0
    )
      return false;
  }
  const width = Math.max(...cells.map((cell) => cell.x)) - tile.x + 1;
  const depth = Math.max(...cells.map((cell) => cell.z)) - tile.z + 1;
  let approaches = 0;
  for (const [dx, dz] of [
    [-1, 0],
    [width, 0],
    [0, -1],
    [0, depth],
  ] as const) {
    const x = tile.x + dx;
    const z = tile.z + dz;
    if (
      draft.inBounds(x, z) &&
      !draft.isCovered(x, z) &&
      !draft.propAt(draft.groundCoord(x, z)) &&
      Math.abs(draft.groundLevelAt(x, z) - tile.y) <= 1
    )
      approaches++;
  }
  if (approaches < 3) return false;
  draft.addProp(kind, tile, rotation, cells);
  return true;
}
