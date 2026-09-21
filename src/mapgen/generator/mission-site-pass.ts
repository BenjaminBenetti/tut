import type { Rect } from "../../core/model/grid";
import { rectContains } from "../../core/service/grid-math";
import { SurfaceIds } from "../data/surfaces";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../model/generation-pass";
import type { MissionSiteDefinition } from "../model/mission-site";
import type { MapDraft } from "../model/map-draft";
import type { MapGenRegistries } from "../model/registries";
import { propPlacementTiles } from "../service/prop-footprint";

// ===========================================
// Mission site placement
// ===========================================

/**
 * Reserves and stamps a composed facility before lots and vegetation compete
 * for its land. Roads through the yard become its authored service pavement;
 * the surrounding network stays connected through the open circulation lanes.
 * All structures use real collision footprints and opaque heights. No
 * building record or walkable roof is invented for sealed industrial plant.
 */
export class MissionSitePass implements GenerationPass {
  readonly id = "mission-sites";
  readonly requires: readonly DraftCapability[] = ["roads", "landing-sites"];
  readonly provides: readonly DraftCapability[] = ["mission-sites"];

  /** Selects the closest suitable site, grades it and emits its authored composition. */
  run({ draft, params, registries, diagnostics }: GenerationContext): void {
    if (params.site === undefined) return;
    const definition = registries.missionSites.get(params.site);
    validateSite(definition, registries);
    const bounds = chooseBounds(draft, definition);
    if (bounds === undefined)
      throw new Error(
        `No room for mission site "${definition.id}" outside landing clearances`,
      );
    const clearance = expand(bounds, definition.margin);
    const heights: number[] = [];
    visitRect(bounds, (x, z) => heights.push(draft.groundLevelAt(x, z)));
    heights.sort((a, b) => a - b);
    const level = heights[Math.floor(heights.length / 2)] ?? 0;
    // A one-layer-per-column shoulder meets the surrounding terrain. The
    // yard itself is level; the ordinary ramp/connection passes finish joins.
    visitRect(clearance, (x, z) => {
      const gap = gapToBounds(bounds, x, z);
      const old = draft.groundLevelAt(x, z);
      draft.setGroundLevel(
        x,
        z,
        Math.max(level - gap, Math.min(level + gap, old)),
      );
      if (rectContains(bounds, x, z)) {
        draft.setRoad(x, z, false);
        draft.setGroundSurface(x, z, definition.surface);
      }
    });
    for (const patch of definition.terrain) {
      visitRect(
        {
          ...patch.rect,
          x: bounds.x + patch.rect.x,
          z: bounds.z + patch.rect.z,
        },
        (x, z) => draft.setGroundSurface(x, z, patch.surface),
      );
    }
    const structureIds = definition.structures.map((piece) => {
      const tile = { x: bounds.x + piece.x, y: level, z: bounds.z + piece.z };
      const rotation = piece.rotation ?? 0;
      return draft.addProp(
        piece.kind,
        tile,
        rotation,
        propPlacementTiles(tile, registries.props.get(piece.kind), rotation),
      ).id;
    });
    // RoadPass may already have bridged the old heightmap. Those endpoints
    // no longer describe this yard; RampPass rebuilds joins on the new grade.
    for (let i = draft.connectors.length - 1; i >= 0; i--) {
      const connector = draft.connectors[i]!;
      if (
        rectContains(clearance, connector.from.x, connector.from.z) ||
        rectContains(clearance, connector.to.x, connector.to.z)
      ) {
        draft.connectors.splice(i, 1);
      }
    }
    draft.sites.push({
      id: definition.id,
      bounds,
      clearance,
      structureIds,
      objectives: definition.objectives.map((socket) => ({
        kind: socket.kind,
        tile: { x: bounds.x + socket.x, y: level, z: bounds.z + socket.z },
      })),
    });
    diagnostics.note(
      `${definition.id}: ${bounds.w}×${bounds.d} yard, ${structureIds.length} structures, ${definition.objectives.length} objective sockets`,
      { x: bounds.x, y: level, z: bounds.z },
    );
  }
}

// ===========================================
// Placement and validation
// ===========================================

/** Searches deterministic central candidates, preferring dry ground and fewer displaced roads. */
function chooseBounds(
  draft: MapDraft,
  site: MissionSiteDefinition,
): Rect | undefined {
  let best: Rect | undefined;
  let bestScore = Infinity;
  const edge = site.margin + 2;
  for (let z = edge; z <= draft.depth - site.depth - edge; z++) {
    for (let x = edge; x <= draft.width - site.width - edge; x++) {
      const bounds = { x, z, w: site.width, d: site.depth };
      const clearance = expand(bounds, site.margin);
      if (draft.dropships.some((ship) => overlaps(clearance, ship.clearance)))
        continue;
      let score = Math.hypot(
        x + site.width / 2 - draft.width / 2,
        z + site.depth / 2 - draft.depth / 2,
      );
      visitRect(clearance, (xx, zz) => {
        if (draft.groundSurfaceAt(xx, zz) === SurfaceIds.WATER) score += 10;
        if (draft.isRoad(xx, zz)) score += 0.08;
      });
      if (score < bestScore) {
        best = bounds;
        bestScore = score;
      }
    }
  }
  return best;
}

/** Rejects malformed definitions before any part of the draft is changed. */
export function validateSite(
  site: MissionSiteDefinition,
  registries: Pick<MapGenRegistries, "props" | "surfaces">,
): void {
  if (
    ![site.width, site.depth].every((n) => Number.isInteger(n) && n > 0) ||
    !Number.isInteger(site.margin) ||
    site.margin < 1
  )
    throw new Error(`Invalid dimensions for mission site "${site.id}"`);
  registries.surfaces.get(site.surface);
  const bounds = { x: 0, z: 0, w: site.width, d: site.depth };
  const occupied = new Set<string>();
  const valid = (x: number, z: number): boolean =>
    Number.isInteger(x) && Number.isInteger(z) && rectContains(bounds, x, z);
  for (const patch of site.terrain) {
    registries.surfaces.get(patch.surface);
    if (
      ![patch.rect.w, patch.rect.d].every(
        (n) => Number.isInteger(n) && n > 0,
      ) ||
      !valid(patch.rect.x, patch.rect.z) ||
      !valid(patch.rect.x + patch.rect.w - 1, patch.rect.z + patch.rect.d - 1)
    )
      throw new Error(`Terrain outside mission site "${site.id}"`);
  }
  for (const piece of site.structures) {
    const definition = registries.props.get(piece.kind);
    for (const tile of propPlacementTiles(
      { x: piece.x, y: 0, z: piece.z },
      definition,
      piece.rotation ?? 0,
    )) {
      const key = `${tile.x},${tile.z}`;
      if (!valid(tile.x, tile.z) || occupied.has(key))
        throw new Error(
          `Overlapping or out-of-bounds structure in mission site "${site.id}"`,
        );
      occupied.add(key);
    }
  }
  for (const socket of site.objectives) {
    const key = `${socket.x},${socket.z}`;
    if (!valid(socket.x, socket.z) || occupied.has(key))
      throw new Error(
        `Blocked or overlapping objective socket in mission site "${site.id}"`,
      );
    occupied.add(key);
  }
}

/** Expands a rectangle uniformly on the ground plane. */
function expand(rect: Rect, margin: number): Rect {
  return {
    x: rect.x - margin,
    z: rect.z - margin,
    w: rect.w + margin * 2,
    d: rect.d + margin * 2,
  };
}

/** True when two rectangles share at least one column. */
function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.z < b.z + b.d && a.z + a.d > b.z
  );
}

/** Chebyshev distance to the closest column inside a rectangle. */
function gapToBounds(rect: Rect, x: number, z: number): number {
  return Math.max(
    rect.x - x,
    x - (rect.x + rect.w - 1),
    rect.z - z,
    z - (rect.z + rect.d - 1),
    0,
  );
}

/** Visits every column of an in-bounds rectangle in stable row order. */
function visitRect(rect: Rect, visit: (x: number, z: number) => void): void {
  for (let z = rect.z; z < rect.z + rect.d; z++)
    for (let x = rect.x; x < rect.x + rect.w; x++) visit(x, z);
}
