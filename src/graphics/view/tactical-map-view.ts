import type { Material } from "three";
import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from "three";

import type { Direction } from "../../core/model/direction";
import { DIRECTIONS } from "../../core/model/direction";
import type { Vec3 } from "../../core/model/grid";
import { stepGridPos } from "../../core/service/grid-math";
import type { Connector } from "../../mapgen/model/connector";
import type { Hook } from "../../mapgen/model/hook";
import { allHooks } from "../../mapgen/model/hook";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { Tile } from "../../mapgen/model/tile";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { TileIndex } from "../../mapgen/service/tile-index";
import {
  CONNECTOR_COLOURS,
  FALLBACK_HOOK_COLOUR,
  FALLBACK_SURFACE_COLOUR,
  HOOK_COLOURS,
  LEVEL_HEIGHT,
  PROP_COLOURS,
  PROP_HEIGHTS,
  SLAB_HEIGHT,
  SURFACE_COLOURS,
  WALL_COLOURS,
  WALL_THICKNESS,
} from "../data/mapgen-preview-palette";
import type { Disposable } from "../model/disposable";

// ===========================================
// Types
// ===========================================

/** One instanced box: a colour, a level to hang it on, and its transforms. */
interface Batch {
  readonly colour: number;
  readonly level: number;
  readonly matrices: Matrix4[];
}

/** Footprint of a prop box within its tile. */
const PROP_FOOTPRINT = 0.6;

/** Hook markers float just above the tile top. */
const MARKER_LIFT = 0.08;

/** Hook marker size within its tile. */
const MARKER_FOOTPRINT = 0.9;

/** Plank dimensions for ramps and stairs. */
const PLANK = { length: 1.2, thickness: 0.1, width: 0.6 } as const;

/** Ladder dimensions. */
const LADDER = { width: 0.35, thickness: 0.1 } as const;

// ===========================================
// TacticalMapView
// ===========================================

/**
 * Renders a `TacticalMap` with placeholder geometry (ADR 0004 §7.5): a
 * box per tile coloured by surface, a thin quad per wall segment, boxes
 * for props sized by cover, planks for ramps and stairs, rungs for
 * ladders, and flat markers for hooks. Objects are grouped by level so a
 * slider can peel floors off. No generation logic lives here.
 *
 * ```
 *   tile (x, y, z) covers [x, x+1) × [z, z+1); its top is at y · LEVEL_HEIGHT + SLAB
 *
 *        ┌──────┐ ← roof slab (level 2)
 *   ▌    │      │   walls stand LEVEL_HEIGHT tall on the tile top
 *   ▌    └──────┘ ← floor slab (level 1)
 *   ▌▒▒▒▒▒▒▒▒▒▒▒▒ ← ground pillar rises from world y = 0
 * ```
 */
export class TacticalMapView implements Disposable {
  // ===========================================
  // Fields
  // ===========================================

  /** Add this to the scene. */
  readonly root: Group;
  private readonly map: TacticalMap;
  private readonly index: TileIndex;
  private readonly levelGroups = new Map<number, Group>();
  private readonly materials = new Map<string, Material>();
  private readonly disposables: Disposable[] = [];
  private readonly unitBox = new BoxGeometry(1, 1, 1);

  // ===========================================
  // Constructor
  // ===========================================

  /** Builds every mesh immediately. */
  constructor(map: TacticalMap) {
    this.map = map;
    this.index = new TileIndex(map);
    this.root = new Group();
    this.root.name = "tactical-map";
    this.disposables.push(this.unitBox);
    this.buildTiles();
    this.buildWalls();
    this.buildProps();
    this.buildConnectors();
    this.buildHooks();
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Ground-plane centre of the map, where the camera should look. */
  get centre(): Vec3 {
    return { x: this.map.width / 2, y: 0, z: this.map.depth / 2 };
  }

  /** Levels present, ascending. */
  get levels(): readonly number[] {
    return [...this.levelGroups.keys()].sort((a, b) => a - b);
  }

  /**
   * Shows only levels up to `maxLevel` (inclusive); `undefined` shows
   * everything. Used by the preview's level slider.
   */
  setMaxLevel(maxLevel: number | undefined): void {
    for (const [level, group] of this.levelGroups) {
      group.visible = maxLevel === undefined || level <= maxLevel;
    }
  }

  /** Frees every geometry and material this view created. */
  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    for (const material of this.materials.values()) {
      material.dispose();
    }
    this.root.removeFromParent();
  }

  // ===========================================
  // Tiles
  // ===========================================

  /** Ground tiles as pillars from the ground plane; building tiles as slabs. */
  private buildTiles(): void {
    const batches = new Map<string, Batch>();
    for (const tile of this.map.tiles) {
      const colour = SURFACE_COLOURS[tile.surface] ?? FALLBACK_SURFACE_COLOUR;
      const top = tileTop(tile.y);
      const isGround = tile.buildingId === undefined;
      const height = isGround ? top : SLAB_HEIGHT;
      const matrix = boxMatrix(
        tile.x + 0.5,
        top - height / 2,
        tile.z + 0.5,
        1,
        height,
        1,
      );
      pushBatch(
        batches,
        `tile:${tile.surface}:${tile.y}:${isGround ? "g" : "s"}`,
        colour,
        tile.y,
        matrix,
      );
    }
    this.flushBatches(batches, "tiles");
  }

  // ===========================================
  // Walls
  // ===========================================

  /**
   * One quad per wall segment. Shared walls are mirrored on both tiles,
   * so the south and east sides are drawn only when no tile lies beyond
   * them at the same level; the neighbour draws its north or west side.
   */
  private buildWalls(): void {
    const batches = new Map<string, Batch>();
    for (const tile of this.map.tiles) {
      for (const side of DIRECTIONS) {
        const kind = tile.walls[side];
        if (kind === undefined || this.neighbourDraws(tile, side)) {
          continue;
        }
        const top = tileTop(tile.y);
        const centreY = top + LEVEL_HEIGHT / 2;
        const matrix =
          side === "n" || side === "s"
            ? boxMatrix(
                tile.x + 0.5,
                centreY,
                tile.z + (side === "s" ? 1 : 0),
                1,
                LEVEL_HEIGHT,
                WALL_THICKNESS,
              )
            : boxMatrix(
                tile.x + (side === "e" ? 1 : 0),
                centreY,
                tile.z + 0.5,
                WALL_THICKNESS,
                LEVEL_HEIGHT,
                1,
              );
        pushBatch(
          batches,
          `wall:${kind}:${tile.y}`,
          WALL_COLOURS[kind],
          tile.y,
          matrix,
        );
      }
    }
    this.flushBatches(batches, "walls");
  }

  /** True when the tile beyond `side` exists at the same level and will draw the shared wall. */
  private neighbourDraws(tile: Tile, side: Direction): boolean {
    if (side !== "s" && side !== "e") {
      return false;
    }
    return this.index.getAt(stepGridPos(tile, side)) !== undefined;
  }

  // ===========================================
  // Props
  // ===========================================

  /** A box per prop, taller and darker the more cover it gives. */
  private buildProps(): void {
    const batches = new Map<string, Batch>();
    for (const prop of this.map.props) {
      const tile = this.index.getAt(prop.tile);
      if (tile === undefined) {
        continue;
      }
      const height = PROP_HEIGHTS[tile.coverProvided];
      const top = tileTop(tile.y);
      const matrix = boxMatrix(
        tile.x + 0.5,
        top + height / 2,
        tile.z + 0.5,
        PROP_FOOTPRINT,
        height,
        PROP_FOOTPRINT,
      );
      pushBatch(
        batches,
        `prop:${tile.coverProvided}:${tile.y}`,
        PROP_COLOURS[tile.coverProvided],
        tile.y,
        matrix,
      );
    }
    this.flushBatches(batches, "props");
  }

  // ===========================================
  // Connectors
  // ===========================================

  /** Planks for ramps and stairs, an upright rung for ladders. */
  private buildConnectors(): void {
    for (const connector of this.map.connectors) {
      const mesh =
        connector.kind === "ladder"
          ? this.ladderMesh(connector)
          : this.plankMesh(connector);
      mesh.name = connector.id;
      this.groupFor(connector.to.y).add(mesh);
    }
  }

  /** A plank from the lower tile's top to the upper tile's top. */
  private plankMesh(connector: Connector): Mesh {
    const from = tileTopCentre(connector.from);
    const to = tileTopCentre(connector.to);
    const rise = to.y - from.y;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const geometry = new BoxGeometry(
      PLANK.length,
      PLANK.thickness,
      PLANK.width,
    );
    this.disposables.push(geometry);
    const mesh = new Mesh(
      geometry,
      this.material(CONNECTOR_COLOURS[connector.kind]),
    );
    mesh.position.set(
      (from.x + to.x) / 2,
      (from.y + to.y) / 2,
      (from.z + to.z) / 2,
    );
    mesh.rotation.order = "YZX";
    mesh.rotation.y = -Math.atan2(dz, dx);
    mesh.rotation.z = Math.atan2(rise, Math.hypot(dx, dz));
    return mesh;
  }

  /** An upright rung on the wall face between the two tiles. */
  private ladderMesh(connector: Connector): Mesh {
    const from = tileTopCentre(connector.from);
    const to = tileTopCentre(connector.to);
    const rise = to.y - from.y;
    const alongX = from.z === to.z;
    const geometry = new BoxGeometry(
      alongX ? LADDER.thickness : LADDER.width,
      rise,
      alongX ? LADDER.width : LADDER.thickness,
    );
    this.disposables.push(geometry);
    const mesh = new Mesh(geometry, this.material(CONNECTOR_COLOURS.ladder));
    mesh.position.set(
      (from.x + to.x) / 2,
      from.y + rise / 2,
      (from.z + to.z) / 2,
    );
    return mesh;
  }

  // ===========================================
  // Hooks
  // ===========================================

  /** A flat marker on every hook tile; objectives are drawn last so they win overlaps. */
  private buildHooks(): void {
    const batches = new Map<string, Batch>();
    for (const hook of allHooks(this.map.hooks)) {
      for (const coord of hook.tiles) {
        const colour = HOOK_COLOURS[hook.kind] ?? FALLBACK_HOOK_COLOUR;
        const lift =
          MARKER_LIFT + (isObjective(hook, this.map) ? SLAB_HEIGHT : 0);
        const matrix = boxMatrix(
          coord.x + 0.5,
          tileTop(coord.y) + lift,
          coord.z + 0.5,
          MARKER_FOOTPRINT,
          SLAB_HEIGHT / 2,
          MARKER_FOOTPRINT,
        );
        pushBatch(
          batches,
          `hook:${hook.kind}:${coord.y}`,
          colour,
          coord.y,
          matrix,
        );
      }
    }
    this.flushBatches(batches, "hooks");
  }

  // ===========================================
  // Shared helpers
  // ===========================================

  /** Turns accumulated batches into one `InstancedMesh` each, hung on their level. */
  private flushBatches(
    batches: ReadonlyMap<string, Batch>,
    label: string,
  ): void {
    for (const [key, batch] of batches) {
      const mesh = new InstancedMesh(
        this.unitBox,
        this.material(batch.colour),
        batch.matrices.length,
      );
      batch.matrices.forEach((matrix, i) => {
        mesh.setMatrixAt(i, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.name = `${label}:${key}`;
      this.disposables.push(mesh);
      this.groupFor(batch.level).add(mesh);
    }
  }

  /** The group for a level, created on first use. */
  private groupFor(level: number): Group {
    let group = this.levelGroups.get(level);
    if (group === undefined) {
      group = new Group();
      group.name = `level-${level}`;
      this.levelGroups.set(level, group);
      this.root.add(group);
    }
    return group;
  }

  /** One material per colour, shared across meshes. */
  private material(colour: number): Material {
    const key = colour.toString(16);
    let material = this.materials.get(key);
    if (material === undefined) {
      material = new MeshStandardMaterial({ color: colour });
      this.materials.set(key, material);
    }
    return material;
  }
}

// ===========================================
// Geometry helpers
// ===========================================

/** World height of a tile's top surface. */
function tileTop(level: number): number {
  return level * LEVEL_HEIGHT + SLAB_HEIGHT;
}

/** World-space centre of a tile's top face. */
function tileTopCentre(coord: TileCoord): Vec3 {
  return { x: coord.x + 0.5, y: tileTop(coord.y), z: coord.z + 0.5 };
}

/** Transform placing a unit box at a centre with the given extents. */
function boxMatrix(
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
): Matrix4 {
  return new Matrix4().compose(
    new Vector3(x, y, z),
    new Quaternion(),
    new Vector3(w, h, d),
  );
}

/** Appends a transform to a batch, creating the batch on first use. */
function pushBatch(
  batches: Map<string, Batch>,
  key: string,
  colour: number,
  level: number,
  matrix: Matrix4,
): void {
  const batch = batches.get(key);
  if (batch === undefined) {
    batches.set(key, { colour, level, matrices: [matrix] });
  } else {
    batch.matrices.push(matrix);
  }
}

/** True when the hook belongs to the objectives group. */
function isObjective(hook: Hook, map: TacticalMap): boolean {
  return map.hooks.objectives.includes(hook);
}
