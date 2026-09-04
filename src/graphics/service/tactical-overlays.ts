import type { Object3D } from "three";
import {
  BoxGeometry,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  RingGeometry,
} from "three";

import type { TileCoord } from "../../mapgen/model/tile-coord";
import { CoverLevel } from "../../mapgen/model/cover";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { UnitId } from "../../tactical/model/unit";
import {
  apCostOf,
  buildMoveGraph,
  searchMoves,
} from "../../tactical/service/movement-service";
import {
  coverAgainst,
  hasLineOfSight,
} from "../../tactical/service/sight-service";
import {
  COVER_HIGH_COLOUR,
  COVER_LOW_COLOUR,
  COVER_OPACITY,
  LINE_OF_SIGHT_COLOUR,
  LINE_OF_SIGHT_OPACITY,
  MOVE_RANGE_ONE_AP_COLOUR,
  MOVE_RANGE_ONE_AP_FOOTPRINT,
  MOVE_RANGE_ONE_AP_OPACITY,
  MOVE_RANGE_TWO_AP_COLOUR,
  MOVE_RANGE_TWO_AP_FOOTPRINT,
  MOVE_RANGE_TWO_AP_OPACITY,
  OVERLAY_LIFT,
  RANGE_THICKNESS,
} from "../data/tactical-overlay-palette";
import type { Disposable } from "../model/disposable";
import { tileTopCentre } from "../view/tactical-map-view";

// ===========================================
// Types
// ===========================================

/** One cover marker: the tile and the best cover it offers. */
export interface CoverMarker {
  readonly tile: TileCoord;
  readonly level: CoverLevel;
}

/**
 * One tile the selected unit can reach, and what it costs to stand there
 * (#521). `apCost` is the unit's real action-point cost from the
 * movement service, not a distance band, so terrain, stairs and doors
 * tier correctly.
 */
export interface MoveRangeTile {
  readonly tile: TileCoord;
  /** Action points spent to reach it: 1 for the near band, 2 for the far one. */
  readonly apCost: number;
}

/** What the overlays draw for one selection; plain data so the screen can compute it. */
export interface OverlayState {
  /** Tiles the selected unit can reach this turn, each with its action-point cost. */
  readonly moveRange: readonly MoveRangeTile[];
  /** Reachable tiles with cover, and how much. */
  readonly cover: readonly CoverMarker[];
  /** Reachable tiles with a line of sight to at least one living enemy. */
  readonly lineOfSight: readonly TileCoord[];
}

/** Nothing shown. */
export const EMPTY_OVERLAYS: OverlayState = {
  moveRange: [],
  cover: [],
  lineOfSight: [],
};

// ===========================================
// Constants
// ===========================================

/** Tiles a mission may need at most before the instanced buffers grow. */
const INITIAL_CAPACITY = 256;

// ===========================================
// Layer
// ===========================================

/** One instanced layer: a geometry and colour drawn once per tile. */
class OverlayLayer implements Disposable {
  readonly mesh: InstancedMesh;
  private readonly material: MeshBasicMaterial;
  private readonly geometry: BoxGeometry | RingGeometry;

  /** @param name - Object name for tests and debugging. */
  constructor(
    name: string,
    geometry: BoxGeometry | RingGeometry,
    colour: number,
    opacity: number,
    renderOrder: number,
  ) {
    this.geometry = geometry;
    this.material = new MeshBasicMaterial({
      color: colour,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    this.mesh = new InstancedMesh(geometry, this.material, INITIAL_CAPACITY);
    this.mesh.name = name;
    this.mesh.count = 0;
    this.mesh.renderOrder = renderOrder;
    this.mesh.frustumCulled = false;
  }

  /** Places one instance per tile; grows the buffer when a map needs more. */
  setTiles(
    tiles: readonly TileCoord[],
    lift: number,
    rotateFlat: boolean,
  ): void {
    const matrix = new Matrix4();
    const count = tiles.length;
    if (count > this.mesh.instanceMatrix.count) {
      this.mesh.instanceMatrix = new InstancedBufferAttribute(
        new Float32Array(count * 16),
        16,
      );
    }
    tiles.forEach((tile, index) => {
      const centre = tileTopCentre(tile);
      if (rotateFlat) {
        matrix.makeRotationX(-Math.PI / 2);
      } else {
        matrix.identity();
      }
      matrix.setPosition(centre.x, centre.y + lift, centre.z);
      this.mesh.setMatrixAt(index, matrix);
    });
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Frees the geometry and material. */
  dispose(): void {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}

// ===========================================
// TacticalOverlays
// ===========================================

/**
 * Movement-range, cover and line-of-sight overlays over the tactical map
 * (#338). Five instanced layers, each toggled by setting its instance
 * count from an `OverlayState`; no rule lives here, `overlaysFor` asks
 * the movement and sight services and hands the answer over as plain
 * tile lists.
 *
 * ```
 *   overlaysFor(mission, unitId) ──► OverlayState ──► show(state)
 *                            ├─ range 1 AP: full quads, ui-info
 *                            ├─ range 2 AP: inset quads, ui-info dimmed
 *                            ├─ cover:      rings, ui-warn (low) / ui-danger (high)
 *                            └─ los:        small rings, ui-accent
 * ```
 *
 * The two move bands differ in tone *and* in footprint, so the boundary
 * survives a colour-vision deficiency and needs no legend (#521).
 */
export class TacticalOverlays implements Disposable {
  // ===========================================
  // Fields
  // ===========================================

  /** Add this to the scene; the layers live under it. */
  readonly root: Group;
  private readonly rangeOneAp: OverlayLayer;
  private readonly rangeTwoAp: OverlayLayer;
  private readonly coverLow: OverlayLayer;
  private readonly coverHigh: OverlayLayer;
  private readonly los: OverlayLayer;

  // ===========================================
  // Constructor
  // ===========================================

  /** Builds the empty layers. */
  constructor() {
    this.root = new Group();
    this.root.name = "tactical-overlays";
    this.rangeOneAp = new OverlayLayer(
      "overlay-move-range-1ap",
      new BoxGeometry(
        MOVE_RANGE_ONE_AP_FOOTPRINT,
        RANGE_THICKNESS,
        MOVE_RANGE_ONE_AP_FOOTPRINT,
      ),
      MOVE_RANGE_ONE_AP_COLOUR,
      MOVE_RANGE_ONE_AP_OPACITY,
      1,
    );
    this.rangeTwoAp = new OverlayLayer(
      "overlay-move-range-2ap",
      new BoxGeometry(
        MOVE_RANGE_TWO_AP_FOOTPRINT,
        RANGE_THICKNESS,
        MOVE_RANGE_TWO_AP_FOOTPRINT,
      ),
      MOVE_RANGE_TWO_AP_COLOUR,
      MOVE_RANGE_TWO_AP_OPACITY,
      1,
    );
    this.coverLow = new OverlayLayer(
      "overlay-cover-low",
      new RingGeometry(0.28, 0.4, 16),
      COVER_LOW_COLOUR,
      COVER_OPACITY,
      2,
    );
    this.coverHigh = new OverlayLayer(
      "overlay-cover-high",
      new RingGeometry(0.28, 0.4, 16),
      COVER_HIGH_COLOUR,
      COVER_OPACITY,
      2,
    );
    this.los = new OverlayLayer(
      "overlay-line-of-sight",
      new RingGeometry(0.12, 0.18, 12),
      LINE_OF_SIGHT_COLOUR,
      LINE_OF_SIGHT_OPACITY,
      3,
    );
    this.root.add(
      this.rangeOneAp.mesh,
      this.rangeTwoAp.mesh,
      this.coverLow.mesh,
      this.coverHigh.mesh,
      this.los.mesh,
    );
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Draws `state`; an empty state hides everything. */
  show(state: OverlayState): void {
    this.rangeOneAp.setTiles(
      tilesCosting(state.moveRange, 1),
      OVERLAY_LIFT,
      false,
    );
    // The dearer band sits a hair higher so the inset quad reads on top
    // where the two ever overlap.
    this.rangeTwoAp.setTiles(
      tilesCosting(state.moveRange, 2),
      OVERLAY_LIFT * 1.5,
      false,
    );
    this.coverLow.setTiles(
      state.cover.filter((c) => c.level === CoverLevel.LOW).map((c) => c.tile),
      OVERLAY_LIFT * 2,
      true,
    );
    this.coverHigh.setTiles(
      state.cover.filter((c) => c.level === CoverLevel.HIGH).map((c) => c.tile),
      OVERLAY_LIFT * 2,
      true,
    );
    this.los.setTiles(state.lineOfSight, OVERLAY_LIFT * 3, true);
  }

  /** Hides every layer. */
  clear(): void {
    this.show(EMPTY_OVERLAYS);
  }

  /** Instances drawn per layer, for tests and debug readouts. */
  counts(): {
    rangeOneAp: number;
    rangeTwoAp: number;
    coverLow: number;
    coverHigh: number;
    los: number;
  } {
    return {
      rangeOneAp: this.rangeOneAp.mesh.count,
      rangeTwoAp: this.rangeTwoAp.mesh.count,
      coverLow: this.coverLow.mesh.count,
      coverHigh: this.coverHigh.mesh.count,
      los: this.los.mesh.count,
    };
  }

  /** The layer objects, for tests. */
  layers(): readonly Object3D[] {
    return [
      this.rangeOneAp.mesh,
      this.rangeTwoAp.mesh,
      this.coverLow.mesh,
      this.coverHigh.mesh,
      this.los.mesh,
    ];
  }

  /** Frees every layer and detaches the root. */
  dispose(): void {
    this.rangeOneAp.dispose();
    this.rangeTwoAp.dispose();
    this.coverLow.dispose();
    this.coverHigh.dispose();
    this.los.dispose();
    this.root.removeFromParent();
  }
}

// ===========================================
// State
// ===========================================

/**
 * What to draw for a selected unit: its reachable tiles from the
 * movement service — each carrying the action points it costs to stand
 * there — the best cover each offers against any cardinal approach, and
 * which of them see at least one living enemy. An unknown or dead unit,
 * or none, yields the empty state.
 *
 * A unit with one action point left reaches only tiles inside one
 * action's move, so it shows one band and no second; that falls out of
 * `searchMoves` budgeting by the action points the unit actually has,
 * rather than being special-cased here (#521).
 */
export function overlaysFor(
  mission: TacticalState,
  unitId: UnitId | undefined,
): OverlayState {
  const unit = mission.units.find((u) => u.id === unitId);
  if (unit === undefined || unit.hp <= 0) {
    return EMPTY_OVERLAYS;
  }
  const graph = buildMoveGraph(mission.map);
  const index = new TileIndex(mission.map);
  const search = searchMoves(mission, unit, graph);
  const originKey = graph.index.keyOf(unit.pos);
  const moveRange: MoveRangeTile[] = [];
  for (const [key, tile] of search.tiles) {
    if (key === originKey) {
      continue;
    }
    // The tier is the movement service's own answer for these steps, so
    // a stair or a door that costs more than its straight-line distance
    // lands in the dearer band (#521).
    moveRange.push({
      tile: { x: tile.x, y: tile.y, z: tile.z },
      apCost: apCostOf(mission, unit, search.costs.get(key) ?? 0),
    });
  }
  const enemies = mission.units.filter((u) => u.team !== unit.team && u.hp > 0);
  const cover: CoverMarker[] = [];
  const lineOfSight: TileCoord[] = [];
  for (const { tile } of moveRange) {
    const level = bestCover(mission, tile, index);
    if (level !== CoverLevel.NONE) {
      cover.push({ tile, level });
    }
    if (enemies.some((e) => hasLineOfSight(mission.map, tile, e.pos, index))) {
      lineOfSight.push(tile);
    }
  }
  return { moveRange, cover, lineOfSight };
}

/** The tiles of `range` costing exactly `apCost` action points. */
function tilesCosting(
  range: readonly MoveRangeTile[],
  apCost: number,
): TileCoord[] {
  return range.filter((entry) => entry.apCost === apCost).map((e) => e.tile);
}

/** The best cover a tile offers against an attacker on any of its four sides. */
function bestCover(
  mission: TacticalState,
  tile: TileCoord,
  index: TileIndex,
): CoverLevel {
  let best: CoverLevel = CoverLevel.NONE;
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const level = coverAgainst(
      mission.map,
      tile,
      { x: tile.x + dx, y: tile.y, z: tile.z + dz },
      index,
    );
    if (level > best) {
      best = level;
    }
  }
  return best;
}
