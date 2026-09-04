import type { Object3D } from "three";
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
} from "three";

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
  BLOCKED_SHOT_COLOUR,
  BLOCKED_SHOT_OPACITY,
  BLOCKED_SHOT_SIZE,
  MOVE_RANGE_ONE_AP_COLOUR,
  MOVE_RANGE_ONE_AP_FOOTPRINT,
  MOVE_RANGE_ONE_AP_OPACITY,
  MOVE_RANGE_TWO_AP_COLOUR,
  MOVE_RANGE_TWO_AP_FOOTPRINT,
  MOVE_RANGE_TWO_AP_OPACITY,
  OVERLAY_LIFT,
  RANGE_THICKNESS,
  WEAPON_RANGE_COLOUR,
  WEAPON_RANGE_LINE_WIDTH,
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
   * Reachable tiles with **no** clear line to the chosen target, and
   * empty when no target is chosen (#624).
   *
   * Deliberately the complement of what it used to be. Marking every
   * tile that *could* see an enemy put a mark on 93 of 93 reachable
   * tiles once nine bugs were on the board: an indicator true almost
   * everywhere has stopped being an indicator. The tiles worth marking
   * are the ones that will refuse the shot, which is exactly what a
   * player standing in front of a silent refusal needs (#517).
   */
  readonly blockedShot: readonly TileCoord[];
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
  blockedShot: [],
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

/**
 * The weapon envelope's outline: one continuous ribbon around its
 * perimeter, rebuilt whenever the envelope changes.
 *
 * ```
 *   ┌───┬───┬───┐      the ribbon traces only the edges where an
 *   │   │   │   │      inside tile meets an outside one, so the
 *   ├───┼───┼───┤      notches line of sight cuts into the envelope
 *   │   │   │            are part of the outline rather than lost
 *   └───┴───┘            in a field of per-tile marks
 * ```
 *
 * A ribbon of ground quads rather than `LineSegments`: WebGL ignores
 * `linewidth` on almost every platform, so a line would be one pixel
 * wide at every zoom and vanish at the far stop.
 */
class PerimeterRibbon implements Disposable {
  readonly mesh: Mesh;
  private readonly geometry = new BufferGeometry();
  private readonly material: MeshBasicMaterial;

  /** @param name - Object name for tests and debugging. */
  constructor(
    name: string,
    colour: number,
    opacity: number,
    renderOrder: number,
  ) {
    this.material = new MeshBasicMaterial({
      color: colour,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.name = name;
    this.mesh.renderOrder = renderOrder;
    this.mesh.frustumCulled = false;
  }

  /**
   * Rebuilds the outline around `tiles`.
   *
   * @param tiles - Every tile inside the envelope.
   * @param lift - Height above the tile top to lay the ribbon at.
   */
  setTiles(tiles: readonly TileCoord[], lift: number): void {
    // Keyed by column: the envelope is a footprint on the ground, so a
    // neighbour at a different height is still inside it, and a step in
    // the terrain must not read as the edge of weapon range.
    const inside = new Set(tiles.map((t) => `${t.x},${t.z}`));
    const half = WEAPON_RANGE_LINE_WIDTH / 2;
    const positions: number[] = [];
    for (const tile of tiles) {
      const centre = tileTopCentre(tile);
      for (const [dx, dz] of CARDINALS) {
        if (inside.has(`${tile.x + dx},${tile.z + dz}`)) {
          continue;
        }
        // Midpoint of the shared edge, then out to the ribbon's corners:
        // half a tile each way along the edge, half a width across it.
        const mx = centre.x + dx * 0.5;
        const mz = centre.z + dz * 0.5;
        const y = centre.y + lift;
        const rx = dz === 0 ? 0 : 0.5;
        const rz = dx === 0 ? 0 : 0.5;
        const nx = dx * half;
        const nz = dz * half;
        const corners = [
          [mx - rx - nx, mz - rz - nz],
          [mx + rx - nx, mz + rz - nz],
          [mx + rx + nx, mz + rz + nz],
          [mx - rx + nx, mz - rz + nz],
        ] as const;
        for (const [a, b, c] of [
          [0, 1, 2],
          [0, 2, 3],
        ] as const) {
          for (const corner of [corners[a], corners[b], corners[c]]) {
            positions.push(corner[0], y, corner[1]);
          }
        }
      }
    }
    this.geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(positions), 3),
    );
    this.geometry.computeBoundingSphere();
  }

  /**
   * Boundary edges currently drawn, for tests and debug readouts. One
   * per tile side where the envelope meets what is outside it, so a
   * 5 x 5 block reads 20 however many tiles are inside it.
   */
  edgeCount(): number {
    const position = this.geometry.getAttribute("position") as
      BufferAttribute | undefined;
    // Six vertices per edge: two triangles making one ribbon quad.
    return position === undefined ? 0 : position.count / 6;
  }

  /** Detaches the mesh and releases its geometry and material. */
  dispose(): void {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}

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
  private readonly blockedShot: OverlayLayer;
  private readonly weaponRange: PerimeterRibbon;
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
    this.blockedShot = new OverlayLayer(
      "overlay-blocked-shot",
      // A box turned 45 degrees about its own axis: a diamond, which no
      // other plane draws. Shape carries the question a mark answers;
      // colour only says how loudly the world is pushing back (#624).
      new BoxGeometry(
        BLOCKED_SHOT_SIZE,
        RANGE_THICKNESS,
        BLOCKED_SHOT_SIZE,
      ).rotateY(Math.PI / 4),
      BLOCKED_SHOT_COLOUR,
      BLOCKED_SHOT_OPACITY,
      3,
    );
    this.weaponRange = new PerimeterRibbon(
      "overlay-weapon-range",
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
      this.blockedShot.mesh,
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
    this.blockedShot.setTiles(state.blockedShot, OVERLAY_LIFT * 3, true);
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
   * Draws the envelope's outline as one continuous ribbon (#624).
   *
   * The inside/outside test was always here; it used to be thrown away
   * by stamping a pip on every tile that passed it, which is N marks
   * for a single fact. The ribbon joins those edges instead, so the
   * notches walls cut into the envelope become part of the outline.
   */
  private drawWeaponRange(): void {
    this.weaponRange.setTiles(
      this.weaponRangeVisible ? this.lastState.weaponRange : [],
      OVERLAY_LIFT,
    );
  }

  /** Instances drawn per layer, for tests and debug readouts. */
  counts(): {
    weaponRange: number;
    rangeOneAp: number;
    rangeTwoAp: number;
    coverLow: number;
    coverHigh: number;
    blockedShot: number;
  } {
    return {
      weaponRange: this.weaponRange.edgeCount(),
      rangeOneAp: this.rangeOneAp.mesh.count,
      rangeTwoAp: this.rangeTwoAp.mesh.count,
      coverLow: this.coverLow.mesh.count,
      coverHigh: this.coverHigh.mesh.count,
      blockedShot: this.blockedShot.mesh.count,
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
      this.blockedShot.mesh,
    ];
  }

  /** Frees every layer and detaches the root. */
  dispose(): void {
    this.weaponRange.dispose();
    this.rangeOneAp.dispose();
    this.rangeTwoAp.dispose();
    this.coverLow.dispose();
    this.coverHigh.dispose();
    this.blockedShot.dispose();
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
  // The sight cue means a *chosen* target or it does not draw (#624).
  // `findAttackTarget` resolves units and egg spawners alike, which is
  // the whole point: a spawner is not a unit, so an "any living enemy"
  // cue ignored the objective the player was trying to shoot (#517).
  const chosen =
    targetId === undefined ? undefined : findAttackTarget(mission, targetId);
  const aim =
    chosen !== undefined && chosen.team !== unit.team ? chosen : undefined;
  const cover: CoverMarker[] = [];
  const blockedShot: TileCoord[] = [];
  for (const { tile } of moveRange) {
    const level = bestCover(mission, tile, index);
    if (level !== CoverLevel.NONE) {
      cover.push({ tile, level });
    }
    // The exception, not the rule. Marking every tile that *can* see
    // put a ring on 93 of 93 reachable tiles with nine bugs on the
    // board (#624) -- a light that is always on says nothing. The few
    // tiles with no shot are the ones worth a mark, and they are what
    // QA needed when a mech silently refused to fire (#517).
    if (
      aim !== undefined &&
      !hasLineOfSight(mission.map, tile, aim.pos, index)
    ) {
      blockedShot.push(tile);
    }
  }
  return {
    moveRange,
    cover,
    blockedShot,
    weaponRange: weaponRangeFrom(mission, unit),
  };
}

/**
 * How far `unit` can fire: one ground tile per column inside its
 * weapon's range, by the same metric the hit chance uses. A unit whose
 * template has no weapon can fire nowhere.
 *
 * **Range only — deliberately not filtered by line of sight** (#624).
 * The question this answers is the one the Executive Director asked,
 * _"how far can I fire"_, and that is a property of the weapon, not of
 * where the walls happen to be. Filtering by sight made the set a
 * scatter of pockets whose outline came out as disconnected dashes,
 * which states nothing at all; and it produced a tile per *level* per
 * column, so a boundary drawn round it also had interior edges through
 * every step in the terrain.
 *
 * Whether a particular tile will actually take the shot is a different
 * question, asked of a chosen target, and `blockedShot` answers it.
 */
function weaponRangeFrom(mission: TacticalState, unit: Unit): TileCoord[] {
  const range = mission.templates[unit.templateId]?.weapon.range ?? 0;
  if (range <= 0) {
    return [];
  }
  const tiles: TileCoord[] = [];
  for (let x = unit.pos.x - range; x <= unit.pos.x + range; x++) {
    const spread = range - Math.abs(x - unit.pos.x);
    for (let z = unit.pos.z - spread; z <= unit.pos.z + spread; z++) {
      // Flat, at the firer's own level, and a pure horizontal reach.
      //
      // Laying it on each column's top instead made the line climb the
      // side of every building it passed, because neighbouring columns
      // end at different heights. Letting height into the test dented
      // the outline against tall ground, which is worse than untidy:
      // the dents are a picture of terrain the player may not have
      // seen, drawn on top of fog that exists to hide it.
      //
      // So the boundary states the weapon's reach and nothing else. It
      // is occluded by whatever stands in front of it, like any other
      // ground mark. Whether one particular tile will take the shot is
      // `blockedShot`'s question, asked of a chosen target.
      tiles.push({ x, y: unit.pos.y, z });
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
