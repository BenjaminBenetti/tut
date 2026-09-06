import { STOREY_LAYERS } from "../../core/model/elevation";
import type { Direction } from "../../core/model/direction";
import type { Rect } from "../../core/model/grid";
import type { Rng } from "../../core/model/rng";
import { stepGridPos } from "../../core/service/grid-math";
import { SurfaceIds } from "../data/surfaces";
import type { Building, Entrance, Floor } from "../model/building";
import type { BuildingTemplate } from "../model/building-template";
import type { DiagnosticSink } from "../model/diagnostics";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../model/generation-pass";
import type { Lot } from "../model/lot";
import type { MapDraft } from "../model/map-draft";
import type { ResolvedMapGenParams } from "../model/resolved-params";
import type { IntRange } from "../model/settlement-definition";
import type { TileCoord } from "../model/tile-coord";
import type { WallKind } from "../model/wall";

// ===========================================
// Constants
// ===========================================

/** Floors the tallest building on a map reaches where the settlement allows it. */
const TALL_FLOORS = 3;

// ===========================================
// Types
// ===========================================

/** A template plus the footprint and height chosen for one lot. */
interface BuildingPlan {
  readonly template: BuildingTemplate;
  readonly footprint: Rect;
  readonly floorCount: number;
}

// ===========================================
// BuildingPass
// ===========================================

/**
 * Pass 5, part 1 (ADR 0004 §7.3, §4.5): the shell of every building. For
 * each lot it picks a template by the biome's weights among those that
 * fit the lot and the settlement scale, sizes a footprint flush with the
 * lot's road-facing edge, raises the floors as sparse `floor` tiles,
 * walls every floor's perimeter (solid or window), opens one door on the
 * frontage side and records the `Building`. Rooms, stairs, roofs and
 * ladders are part 2 (#25).
 *
 * ```
 *   road / sidewalk
 *   +---d---+   ← frontage wall with door
 *   | floor |   ← interior tiles, every floor
 *   +-------+
 * ```
 */
export class BuildingPass implements GenerationPass {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = "buildings";
  readonly requires: readonly DraftCapability[] = ["lots"];
  readonly provides: readonly DraftCapability[] = ["buildings"];

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * Plans one building per lot that can hold a template, guarantees a
   * multi-storey building wherever the settlement allows one (verticality
   * is a pillar), then raises the shells.
   */
  run(context: GenerationContext): void {
    const { draft, params, rng, registries, diagnostics } = context;
    const planned: { lot: Lot; rng: Rng; plan: BuildingPlan }[] = [];
    let skipped = 0;
    for (const lot of draft.lots) {
      const lotRng = rng.fork(lot.id);
      const plan = planBuilding(lot, params, registries, lotRng);
      if (plan === undefined) {
        skipped++;
        diagnostics.note(`no template fits lot ${lot.id}`, {
          x: lot.rect.x,
          y: lot.level,
          z: lot.rect.z,
        });
        continue;
      }
      planned.push({ lot, rng: lotRng, plan });
    }
    ensureMultiStorey(planned, params, registries, diagnostics);
    for (const { lot, rng: lotRng, plan } of planned) {
      draft.buildings.push(raiseShell(draft, lot, plan, lotRng));
    }
    diagnostics.note(
      `${draft.buildings.length} buildings on ${draft.lots.length} lots` +
        (skipped > 0 ? `, ${skipped} lots skipped` : ""),
    );
  }
}

// ===========================================
// Planning
// ===========================================

/**
 * Chooses a template that fits the lot and the scale, then a footprint
 * flush with the frontage edge and a floor count inside both the
 * template's and the settlement's ranges.
 */
function planBuilding(
  lot: Lot,
  params: ResolvedMapGenParams,
  registries: GenerationContext["registries"],
  rng: Rng,
): BuildingPlan | undefined {
  const candidates = fittingTemplates(lot, params, registries);
  if (candidates.length === 0) {
    return undefined;
  }
  const { template } = rng.pickWeighted(candidates, (c) => c.weight);
  return sizePlan(lot, template, params, rng);
}

/**
 * The biome's templates allowed at this settlement scale whose smallest
 * footprint fits the lot, with their weights.
 */
function fittingTemplates(
  lot: Lot,
  params: ResolvedMapGenParams,
  registries: GenerationContext["registries"],
): { template: BuildingTemplate; weight: number }[] {
  const alongLot = frontageIsNorthSouth(lot.frontage) ? lot.rect.w : lot.rect.d;
  const deepLot = frontageIsNorthSouth(lot.frontage) ? lot.rect.d : lot.rect.w;
  return params.biome.buildingKinds
    .map((entry) => ({
      template: registries.buildingTemplates.get(entry.template),
      weight: entry.weight,
    }))
    .filter(
      ({ template }) =>
        template.scales.includes(params.settlement.id) &&
        template.footprintWidth.min <= alongLot &&
        template.footprintDepth.min <= deepLot,
    );
}

/** Sizes a template's footprint inside the lot and draws its floor count. */
function sizePlan(
  lot: Lot,
  template: BuildingTemplate,
  params: ResolvedMapGenParams,
  rng: Rng,
): BuildingPlan {
  const alongLot = frontageIsNorthSouth(lot.frontage) ? lot.rect.w : lot.rect.d;
  const deepLot = frontageIsNorthSouth(lot.frontage) ? lot.rect.d : lot.rect.w;
  const along = rng.nextInt(
    template.footprintWidth.min,
    Math.min(template.footprintWidth.max, alongLot),
  );
  const deep = rng.nextInt(
    template.footprintDepth.min,
    Math.min(template.footprintDepth.max, deepLot),
  );
  return {
    template,
    footprint: footprintFor(lot, along, deep),
    floorCount: rng.nextInt(
      ...floorRange(template.floors, params.settlement.floorCount),
    ),
  };
}

/**
 * Guarantees the verticality the settlement allows: where it allows
 * `TALL_FLOORS` or more floors, some building has that many; where it
 * allows two, some building has two. A plan already there is kept; else
 * the first lot that can hold a template tall enough is re-planned with
 * the tallest such template. Cities at the ADR 0009 scale hold few
 * enough buildings that the biome's weights alone no longer promise an
 * apartment on every map (#829).
 */
function ensureMultiStorey(
  planned: { lot: Lot; rng: Rng; plan: BuildingPlan }[],
  params: ResolvedMapGenParams,
  registries: GenerationContext["registries"],
  diagnostics: DiagnosticSink,
): void {
  const want = Math.min(TALL_FLOORS, params.settlement.floorCount.max);
  if (want < 2 || planned.some((p) => p.plan.floorCount >= want)) {
    return;
  }
  for (const entry of planned) {
    const tall = fittingTemplates(entry.lot, params, registries)
      .map((c) => c.template)
      .filter((t) => t.floors.max >= want)
      .sort((a, b) => b.floors.max - a.floors.max)[0];
    if (tall === undefined) {
      continue;
    }
    const plan = sizePlan(entry.lot, tall, params, entry.rng.fork("tall"));
    entry.plan = {
      ...plan,
      floorCount: Math.max(plan.floorCount, Math.max(want, tall.floors.min)),
    };
    diagnostics.note(
      `re-planned ${entry.lot.id} as a ${tall.id} of ${String(entry.plan.floorCount)} floors for verticality`,
    );
    return;
  }
}

/**
 * Footprint `along` columns wide along the frontage and `deep` columns
 * away from it, starting at the lot's first column and flush with the
 * road-facing edge.
 */
function footprintFor(lot: Lot, along: number, deep: number): Rect {
  const { rect, frontage } = lot;
  switch (frontage) {
    case "n":
      return { x: rect.x, z: rect.z, w: along, d: deep };
    case "s":
      return { x: rect.x, z: rect.z + rect.d - deep, w: along, d: deep };
    case "w":
      return { x: rect.x, z: rect.z, w: deep, d: along };
    case "e":
      return { x: rect.x + rect.w - deep, z: rect.z, w: deep, d: along };
  }
}

/**
 * Intersection of the template's and settlement's floor ranges; when they
 * do not overlap the template wins (a tower is still a tower).
 */
function floorRange(
  template: IntRange,
  settlement: IntRange,
): [number, number] {
  const min = Math.max(template.min, settlement.min);
  const max = Math.min(template.max, settlement.max);
  return min <= max ? [min, max] : [template.min, template.max];
}

/** True when the lot faces north or south, so the frontage runs along x. */
function frontageIsNorthSouth(frontage: Direction): boolean {
  return frontage === "n" || frontage === "s";
}

// ===========================================
// Raising
// ===========================================

/**
 * Emits floor tiles, perimeter walls and the door, marks the footprint
 * covered and returns the building record.
 */
function raiseShell(
  draft: MapDraft,
  lot: Lot,
  plan: BuildingPlan,
  rng: Rng,
): Building {
  const id = draft.ids.nextId("building");
  const { footprint, template, floorCount } = plan;
  const floors: Floor[] = [];
  for (let index = 0; index < floorCount; index++) {
    const y = lot.level + index * STOREY_LAYERS;
    floors.push({ index, y, rooms: [] });
    forEachColumn(footprint, (x, z) => {
      draft.addTile({
        x,
        y,
        z,
        surface: SurfaceIds.FLOOR,
        buildingId: id,
        floorIndex: index,
      });
      for (const side of outwardSides(footprint, x, z)) {
        draft.setWall({ x, y, z }, side, wallKind(template, rng));
      }
    });
  }
  forEachColumn(footprint, (x, z) => {
    draft.setCovered(x, z);
  });
  const entrance = openDoor(draft, lot, footprint);
  return {
    id,
    kind: template.id,
    footprint: [footprint],
    groundLevel: lot.level,
    floors,
    roof: {
      kind: template.roof,
      walkable: template.roof === "flat" && template.roofWalkable,
    },
    entrances: [entrance],
    connectorIds: [],
  };
}

/**
 * Opens a door in the frontage wall of the ground floor. Prefers a front
 * column whose outside neighbour is road or sidewalk at the building's
 * level, then any corridor, then the lot's first column, which the lot
 * pass placed beside the road.
 */
function openDoor(draft: MapDraft, lot: Lot, footprint: Rect): Entrance {
  const front = frontColumns(footprint, lot.frontage).map((coord) => ({
    ...coord,
    y: lot.level,
  }));
  const facesCorridor = (coord: TileCoord): boolean => {
    const outside = stepGridPos(coord, lot.frontage);
    return (
      draft.inBounds(outside.x, outside.z) &&
      (draft.isRoad(outside.x, outside.z) ||
        draft.groundSurfaceAt(outside.x, outside.z) === SurfaceIds.SIDEWALK)
    );
  };
  const facesLevelCorridor = (coord: TileCoord): boolean => {
    const outside = stepGridPos(coord, lot.frontage);
    return (
      facesCorridor(coord) &&
      draft.groundLevelAt(outside.x, outside.z) === lot.level
    );
  };
  const level = front.filter(facesLevelCorridor);
  const corridor = front.filter(facesCorridor);
  const pool =
    level.length > 0 ? level : corridor.length > 0 ? corridor : front;
  const tile = pool[Math.floor(pool.length / 2)] ?? front[0];
  if (tile === undefined) {
    throw new Error("Footprint has no front columns");
  }
  draft.setWall(tile, lot.frontage, "door");
  return { tile, side: lot.frontage };
}

/** The footprint's columns on the given side, in order. */
function frontColumns(footprint: Rect, side: Direction): TileCoord[] {
  const columns: TileCoord[] = [];
  const { x, z, w, d } = footprint;
  switch (side) {
    case "n":
      for (let i = 0; i < w; i++) columns.push({ x: x + i, y: 0, z });
      break;
    case "s":
      for (let i = 0; i < w; i++)
        columns.push({ x: x + i, y: 0, z: z + d - 1 });
      break;
    case "w":
      for (let i = 0; i < d; i++) columns.push({ x, y: 0, z: z + i });
      break;
    case "e":
      for (let i = 0; i < d; i++)
        columns.push({ x: x + w - 1, y: 0, z: z + i });
      break;
  }
  return columns;
}

/** Sides of a footprint column that face outward. */
function outwardSides(footprint: Rect, x: number, z: number): Direction[] {
  const sides: Direction[] = [];
  if (z === footprint.z) sides.push("n");
  if (z === footprint.z + footprint.d - 1) sides.push("s");
  if (x === footprint.x) sides.push("w");
  if (x === footprint.x + footprint.w - 1) sides.push("e");
  return sides;
}

/** Window or solid, by the template's density. */
function wallKind(template: BuildingTemplate, rng: Rng): WallKind {
  return rng.chance(template.windowDensity) ? "window" : "solid";
}

/** Calls `visit` for every column of the rectangle. */
function forEachColumn(
  rect: Rect,
  visit: (x: number, z: number) => void,
): void {
  for (let z = rect.z; z < rect.z + rect.d; z++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      visit(x, z);
    }
  }
}
