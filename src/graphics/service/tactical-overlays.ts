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

import { manhattanDistance } from "../../core/service/grid-math";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { CoverLevel } from "../../mapgen/model/cover";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit, UnitId } from "../../tactical/model/unit";
import { findAttackTarget } from "../../tactical/service/attack-target-service";
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
  COVER_RING_INNER_RADIUS,
  COVER_RING_OUTER_RADIUS,
  COVER_RING_SEGMENTS,
  LINE_OF_SIGHT_COLOUR,
  LINE_OF_SIGHT_OPACITY,
  LINE_OF_SIGHT_PIP_INNER_RADIUS,
  LINE_OF_SIGHT_PIP_OUTER_RADIUS,
  LINE_OF_SIGHT_PIP_SEGMENTS,
  MOVE_RANGE_ONE_AP_COLOUR,
  MOVE_RANGE_ONE_AP_FOOTPRINT,
  MOVE_RANGE_ONE_AP_OPACITY,
  MOVE_RANGE_TWO_AP_COLOUR,
  MOVE_RANGE_TWO_AP_FOOTPRINT,
  MOVE_RANGE_TWO_AP_OPACITY,
  OVERLAY_LIFT,
  RANGE_THICKNESS,
  WEAPON_RANGE_COLOUR,
  WEAPON_RANGE_FOOTPRINT,
  WEAPON_RANGE_OPACITY,
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
  /**
   * Reachable tiles with a clear line to something worth shooting.
   *
   * With a target chosen it means **that** target, which is what a
   * player standing in front of a refusal needs to know (#517); with
   * none it falls back to any living enemy, so a unit with nothing
   * selected still sees where it could open fire from.
   */
  readonly lineOfSight: readonly TileCoord[];
  /**
   * Tiles the selected unit could fire on from where it stands (#522):
   * inside its weapon's range and with the sight line clear — the same
   * pair `validateTargeting` checks, so what is painted and what can be
   * fired agree.
   */
  readonly weaponRange: readonly TileCoord[];
}

/** Nothing shown. */
export const EMPTY_OVERLAYS: OverlayState = {
  moveRange: [],
  cover: [],
  lineOfSight: [],
  weaponRange: [],
};

// ===========================================
// Constants
// ===========================================

/** The four cardinal steps, for tracing the edge of a region. */
const CARDINALS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

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
 * (#338). Six instanced layers, each toggled by setting its instance
 * count from an `OverlayState`; no rule lives here, `overlaysFor` asks
 * the movement and sight services and hands the answer over as plain
 * tile lists.
 *
 * ```
 *   overlaysFor(mission, unitId) ──► OverlayState ──► show(state)
 *                            ├─ range 1 AP: full quads, ui-info
 *                            ├─ range 2 AP: inset quads, ui-info dimmed
 *                            ├─ cover:      rings, ui-warn (low) / ui-danger (high)
 *                            ├─ los:        small rings, ui-accent
 *                            └─ weapon:     edge quads, ui-accent
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
  private readonly weaponRange: OverlayLayer;
  /**
   * Off until something asks for it (#590). The screen drives this from
   * armed intent, and a scene that defaulted to on would paint the
   * envelope for the frames between attaching and the first push.
   */
  private weaponRangeVisible = false;
  private lastState: OverlayState = EMPTY_OVERLAYS;

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
      new RingGeometry(
        COVER_RING_INNER_RADIUS,
        COVER_RING_OUTER_RADIUS,
        COVER_RING_SEGMENTS,
      ),
      COVER_LOW_COLOUR,
      COVER_OPACITY,
      2,
    );
    this.coverHigh = new OverlayLayer(
      "overlay-cover-high",
      new RingGeometry(
        COVER_RING_INNER_RADIUS,
        COVER_RING_OUTER_RADIUS,
        COVER_RING_SEGMENTS,
      ),
      COVER_HIGH_COLOUR,
      COVER_OPACITY,
      2,
    );
    this.los = new OverlayLayer(
      "overlay-line-of-sight",
      new RingGeometry(
        LINE_OF_SIGHT_PIP_INNER_RADIUS,
        LINE_OF_SIGHT_PIP_OUTER_RADIUS,
        LINE_OF_SIGHT_PIP_SEGMENTS,
      ),
      LINE_OF_SIGHT_COLOUR,
      LINE_OF_SIGHT_OPACITY,
      3,
    );
    this.weaponRange = new OverlayLayer(
      "overlay-weapon-range",
      new BoxGeometry(
        WEAPON_RANGE_FOOTPRINT,
        RANGE_THICKNESS,
        WEAPON_RANGE_FOOTPRINT,
      ),
      WEAPON_RANGE_COLOUR,
      WEAPON_RANGE_OPACITY,
      4,
    );
    this.root.add(
      this.weaponRange.mesh,
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
    this.lastState = state;
    this.drawWeaponRange();
  }

  /**
   * Shows or hides the weapon-range outline without disturbing the other
   * layers (#522). The indicator is on by default and shows nothing
   * anyway while no unit is selected, because an empty state carries an
   * empty envelope.
   */
  setWeaponRangeVisible(visible: boolean): void {
    this.weaponRangeVisible = visible;
    this.drawWeaponRange();
  }

  /** Whether the weapon-range outline is currently shown. */
  isWeaponRangeVisible(): boolean {
    return this.weaponRangeVisible;
  }

  /** Hides every layer. */
  clear(): void {
    this.show(EMPTY_OVERLAYS);
  }

  /**
   * Draws the edge of the weapon envelope: every tile in it with a
   * cardinal neighbour on its level that is not, which is the outline of
   * the region including the notches walls cut out of it.
   */
  private drawWeaponRange(): void {
    if (!this.weaponRangeVisible) {
      this.weaponRange.setTiles([], OVERLAY_LIFT, false);
      return;
    }
    const inside = new Set(
      this.lastState.weaponRange.map((t) => `${t.x},${t.y},${t.z}`),
    );
    const edge = this.lastState.weaponRange.filter((t) =>
      CARDINALS.some(
        ([dx, dz]) => !inside.has(`${t.x + dx},${t.y},${t.z + dz}`),
      ),
    );
    this.weaponRange.setTiles(edge, OVERLAY_LIFT, false);
  }

  /** Instances drawn per layer, for tests and debug readouts. */
  counts(): {
    weaponRange: number;
    rangeOneAp: number;
    rangeTwoAp: number;
    coverLow: number;
    coverHigh: number;
    los: number;
  } {
    return {
      weaponRange: this.weaponRange.mesh.count,
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
      this.weaponRange.mesh,
      this.rangeOneAp.mesh,
      this.rangeTwoAp.mesh,
      this.coverLow.mesh,
      this.coverHigh.mesh,
      this.los.mesh,
    ];
  }

  /** Frees every layer and detaches the root. */
  dispose(): void {
    this.weaponRange.dispose();
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
  targetId?: string,
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
  // A chosen target narrows the sight cue to it. `findAttackTarget`
  // resolves units and egg spawners alike, which is the whole point:
  // a spawner is not a unit, so an "any living enemy" cue ignored the
  // objective the player was actually trying to shoot (#517).
  const chosen =
    targetId === undefined ? undefined : findAttackTarget(mission, targetId);
  const marks: readonly { readonly pos: TileCoord }[] =
    chosen !== undefined && chosen.team !== unit.team
      ? [chosen]
      : mission.units.filter((u) => u.team !== unit.team && u.hp > 0);
  const cover: CoverMarker[] = [];
  const lineOfSight: TileCoord[] = [];
  for (const { tile } of moveRange) {
    const level = bestCover(mission, tile, index);
    if (level !== CoverLevel.NONE) {
      cover.push({ tile, level });
    }
    if (marks.some((e) => hasLineOfSight(mission.map, tile, e.pos, index))) {
      lineOfSight.push(tile);
    }
  }
  return {
    moveRange,
    cover,
    lineOfSight,
    weaponRange: weaponRangeFrom(mission, unit, index),
  };
}

/**
 * The tiles `unit` could fire on without moving: inside its weapon's
 * range by the same metric the hit chance uses, and with the sight line
 * clear. A unit whose template has no weapon can fire on nothing.
 *
 * Deliberately the *whole* envelope rather than its outline: this is the
 * honest answer to "what can I shoot", and how it is drawn — an edge
 * line, not a fill — is the overlay's business, not the state's.
 */
function weaponRangeFrom(
  mission: TacticalState,
  unit: Unit,
  index: TileIndex,
): TileCoord[] {
  // The unit's default weapon (#532). A mech now carries several with
  // different reaches, and the envelope should follow whichever the
  // player has armed — but the overlay is asked for a unit, not for a
  // weapon, so threading the armed weapon through is #522's follow-up.
  // For every squad and bug, which carry one weapon, this is exact.
  const range =
    mission.templates[unit.templateId]?.weapons[0]?.profile.range ?? 0;
  if (range <= 0) {
    return [];
  }
  const tiles: TileCoord[] = [];
  for (let x = unit.pos.x - range; x <= unit.pos.x + range; x++) {
    const spread = range - Math.abs(x - unit.pos.x);
    for (let z = unit.pos.z - spread; z <= unit.pos.z + spread; z++) {
      for (const tile of index.column(x, z)) {
        if (manhattanDistance(tile, unit.pos) > range) {
          continue;
        }
        if (!hasLineOfSight(mission.map, unit.pos, tile, index)) {
          continue;
        }
        tiles.push({ x: tile.x, y: tile.y, z: tile.z });
      }
    }
  }
  return tiles;
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
