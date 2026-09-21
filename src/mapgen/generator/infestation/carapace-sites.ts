import { DIRECTIONS } from "../../../core/model/direction";
import type { Rect } from "../../../core/model/grid";
import { rectContains, stepGridPos } from "../../../core/service/grid-math";
import { CARAPACE_SITE_TUNING } from "../../data/carapace-site-tuning";
import { SurfaceIds } from "../../data/surfaces";
import type { GenerationContext } from "../../model/generation-pass";
import type {
  CarapaceSite,
  InfestationZone,
} from "../../model/infestation-plan";
import { PassMask } from "../../model/pass-mask";
import type { ColumnCoord } from "../../model/road";
import type { TileCoord } from "../../model/tile-coord";
import { infestationPressure } from "../../service/infestation-layout";
import { gradeableCarapacePassage } from "./carapace-gateways";
import {
  columnKey,
  createCarapaceOutline,
  joinCarapaceCells,
  stepColumn,
} from "./carapace-outline";

// ===========================================
// Early formation planning
// ===========================================

/** Reserves open courtyard formations before parcels, without flattening their terrain. */
export function planCarapaceSites(
  context: GenerationContext,
  zones: readonly InfestationZone[],
): readonly InfestationZone[] {
  const { draft, params, rng } = context;
  if (params.infestation < CARAPACE_SITE_TUNING.minimumLevel) return zones;
  const offsets: ColumnCoord[] = [];
  const search = CARAPACE_SITE_TUNING.centreSearchRadius;
  for (let z = -search; z <= search; z++)
    for (let x = -search; x <= search; x++)
      if (Math.hypot(x, z) <= search) offsets.push({ x, z });
  offsets.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  const planned: CarapaceSite[] = [];
  const limit = Math.ceil(zones.length * CARAPACE_SITE_TUNING.colonyShare);
  return zones.map((zone) => {
    if (planned.length >= limit) return zone;
    const roll = rng.fork(`carapace:${zone.id}`);
    const minimum = CARAPACE_SITE_TUNING.minimumSpan;
    const size =
      params.infestation >= CARAPACE_SITE_TUNING.largeFormationLevel
        ? roll.nextInt(minimum + 1, CARAPACE_SITE_TUNING.maximumSpan)
        : minimum;
    for (const width of [...new Set([size, minimum])]) {
      for (
        let attempt = 0;
        attempt < CARAPACE_SITE_TUNING.outlineAttempts;
        attempt++
      ) {
        const outline = createCarapaceOutline(
          width,
          Math.max(minimum, width - roll.nextInt(0, 1)),
          roll.fork(
            attempt === 0 ? `outline:${width}` : `outline:${width}:${attempt}`,
          ),
        );
        for (const offset of offsets) {
          const footprint = {
            x: zone.centre.x + offset.x - Math.floor(outline.width / 2),
            z: zone.centre.z + offset.z - Math.floor(outline.depth / 2),
            w: outline.width,
            d: outline.depth,
          };
          const margin = CARAPACE_SITE_TUNING.clearance;
          const clearance = {
            x: footprint.x - margin,
            z: footprint.z - margin,
            w: footprint.w + margin * 2,
            d: footprint.d + margin * 2,
          };
          if (
            planned.some((site) => overlaps(site.clearance, clearance)) ||
            !supportsCourtyard(context, clearance)
          )
            continue;
          const move = (tile: ColumnCoord): ColumnCoord => ({
            x: tile.x + footprint.x,
            z: tile.z + footprint.z,
          });
          const gateways = outline.gateways.map((gateway) => ({
            tiles: gateway.tiles.map(move),
            outward: gateway.outward,
            approach: gateway.approach.map(move),
          }));
          const courtyard = outline.courtyard.map(move);
          const channels = gradeableCarapacePassage(
            context,
            gateways,
            courtyard,
          );
          if (channels === undefined) continue;
          for (const tile of channels)
            draft.setGroundLevel(tile.x, tile.z, tile.y);
          const cells = joinCarapaceCells(
            outline.walls.map((tile) => {
              const at = move(tile);
              return draft.groundCoord(at.x, at.z);
            }),
            roll.fork("modules"),
          );
          const site: CarapaceSite = {
            footprint,
            clearance,
            cells,
            realized: false,
            courtyard,
            passage: channels,
            gateways,
          };
          planned.push(site);
          return { ...zone, carapace: site };
        }
      }
    }
    return zone;
  });
}

/** A dry, traversable colony patch can carry modules at different natural elevations. */
function supportsCourtyard(context: GenerationContext, rect: Rect): boolean {
  const { draft, registries } = context;
  for (let z = rect.z; z < rect.z + rect.d; z++)
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      if (
        !draft.inBounds(x, z) ||
        x < 1 ||
        z < 1 ||
        x >= draft.width - 1 ||
        z >= draft.depth - 1 ||
        draft.isLandingReserved(x, z) ||
        draft.isSiteReserved(x, z) ||
        registries.surfaces.get(draft.groundSurfaceAt(x, z)).defaultPass !==
          PassMask.ALL ||
        infestationPressure(draft, x, z) < CARAPACE_SITE_TUNING.minimumPressure
      )
        return false;
      for (const direction of DIRECTIONS) {
        const next = stepColumn({ x, z }, direction);
        if (
          rectContains(rect, next.x, next.z) &&
          Math.abs(
            draft.groundLevelAt(x, z) - draft.groundLevelAt(next.x, next.z),
          ) > 1
        )
          return false;
      }
    }
  return true;
}

/** Tests reservation overlap without claiming intervening growth corridors. */
function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d
  );
}

// ===========================================
// Final, mission-aware assembly
// ===========================================

/** Assembles joined, individually destructible walls around an actually accessible courtyard. */
export function placeCarapaceSite(
  context: GenerationContext,
  site: CarapaceSite,
  protectedColumns: ReadonlySet<number>,
): boolean {
  const { draft, rng } = context;
  if (
    site.gateways.some((gate) =>
      gate.approach.some(
        (tile) =>
          !canStand(context, tile) ||
          draft.groundLevelAt(tile.x, tile.z) !==
            draft.groundLevelAt(gate.tiles[0]!.x, gate.tiles[0]!.z),
      ),
    )
  )
    return false;
  if (
    site.passage.some(
      (tile) =>
        !canStand(context, tile) ||
        draft.groundLevelAt(tile.x, tile.z) !== tile.y,
    )
  )
    return false;
  const candidates = new Map(
    site.cells.map((cell) => [
      columnKey(cell.tile),
      draft.groundCoord(cell.tile.x, cell.tile.z),
    ]),
  );
  const removed: TileCoord[] = [];
  for (const tile of candidates.values())
    if (
      protectedColumns.has(tile.z * draft.width + tile.x) ||
      !canStand(context, tile)
    )
      removed.push(tile);
  for (const tile of removed) candidates.delete(columnKey(tile));
  // A newly interrupted run gets a broad breach, never a one-cell accidental doorway.
  for (const tile of removed) {
    const neighbour = DIRECTIONS.map((direction) =>
      stepGridPos(tile, direction),
    ).find((next) => candidates.has(columnKey(next)));
    if (neighbour !== undefined) candidates.delete(columnKey(neighbour));
  }
  const retained = joinedRuns([...candidates.values()])
    .filter((run) => run.length >= CARAPACE_SITE_TUNING.minimumRunLength)
    .flat();
  if (
    retained.length < CARAPACE_SITE_TUNING.minimumModules ||
    retained.length <
      site.cells.length * CARAPACE_SITE_TUNING.minimumRetainedShare ||
    !courtyardAccessible(context, site, retained)
  )
    return false;
  const cells = joinCarapaceCells(
    retained,
    rng.fork(`carapace-modules:${site.footprint.x}:${site.footprint.z}`),
  );
  for (const cell of cells)
    draft.addProp(cell.kind, cell.tile, cell.rotation, [cell.tile]);
  draft.infestation = {
    ...draft.infestation!,
    zones: draft.infestation!.zones.map((zone) =>
      zone.carapace === site
        ? { ...zone, carapace: { ...site, cells, realized: true } }
        : zone,
    ),
  };
  return true;
}

/** Passable ground, including shaped slopes, stays geometrically intact under each wall's base. */
function canStand(
  { draft, registries }: GenerationContext,
  tile: ColumnCoord,
): boolean {
  return (
    draft.inBounds(tile.x, tile.z) &&
    !(
      draft.isLandingReserved(tile.x, tile.z) ||
      draft.isSiteReserved(tile.x, tile.z)
    ) &&
    !draft.isCovered(tile.x, tile.z) &&
    !draft.propAt(draft.groundCoord(tile.x, tile.z)) &&
    Object.keys(draft.wallsAt(draft.groundCoord(tile.x, tile.z))).length ===
      0 &&
    draft.groundSurfaceAt(tile.x, tile.z) === SurfaceIds.INFESTED &&
    registries.surfaces.get(draft.groundSurfaceAt(tile.x, tile.z))
      .defaultPass === PassMask.ALL
  );
}

/** Rejects isolated scatter after clipping; every surviving section remains a genuine wall run. */
function joinedRuns(tiles: readonly TileCoord[]): readonly TileCoord[][] {
  const remaining = new Map(tiles.map((tile) => [columnKey(tile), tile]));
  const runs: TileCoord[][] = [];
  for (const tile of tiles) {
    if (!remaining.delete(columnKey(tile))) continue;
    const run = [tile];
    for (const at of run)
      for (const direction of DIRECTIONS) {
        const key = columnKey(stepColumn(at, direction));
        const next = remaining.get(key);
        if (next !== undefined) {
          remaining.delete(key);
          run.push(next);
        }
      }
    runs.push(run);
  }
  return runs;
}

/** Every chamber and both two-cell gates must connect to open exterior ground before assembly. */
function courtyardAccessible(
  context: GenerationContext,
  site: CarapaceSite,
  walls: readonly TileCoord[],
): boolean {
  const { draft } = context;
  const occupied = new Set(walls.map(columnKey));
  const rect = site.clearance;
  const seen = new Set<string>();
  const pending: ColumnCoord[] = [];
  for (let z = rect.z; z < rect.z + rect.d; z++)
    for (let x = rect.x; x < rect.x + rect.w; x++)
      if (
        x === rect.x ||
        z === rect.z ||
        x === rect.x + rect.w - 1 ||
        z === rect.z + rect.d - 1
      ) {
        const at = { x, z };
        if (canStand(context, at)) {
          seen.add(columnKey(at));
          pending.push(at);
        }
      }
  for (const at of pending)
    for (const direction of DIRECTIONS) {
      const next = stepColumn(at, direction);
      const key = columnKey(next);
      if (
        seen.has(key) ||
        occupied.has(key) ||
        !rectContains(rect, next.x, next.z) ||
        !canStand(context, next) ||
        Math.abs(
          draft.groundLevelAt(at.x, at.z) - draft.groundLevelAt(next.x, next.z),
        ) > 1
      )
        continue;
      seen.add(key);
      pending.push(next);
    }
  return [
    ...site.courtyard,
    ...site.gateways.flatMap((gateway) => gateway.tiles),
  ].every((tile) => seen.has(columnKey(tile)));
}
