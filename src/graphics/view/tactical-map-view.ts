import type { BufferGeometry, Camera, Material, Object3D } from "three";
import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
} from "three";

import type { Direction } from "../../core/model/direction";
import { DIRECTIONS } from "../../core/model/direction";
import type { Vec2, Vec3 } from "../../core/model/grid";
import { stepGridPos } from "../../core/service/grid-math";
import type { Connector } from "../../mapgen/model/connector";
import type { Hook } from "../../mapgen/model/hook";
import { allHooks } from "../../mapgen/model/hook";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { Tile } from "../../mapgen/model/tile";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type {
  SideVision,
  VisionTileKey,
} from "../../tactical/model/tactical-state";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { GhostUniforms } from "../service/ghost-cutaway";
import { applyGhostCutaway } from "../service/ghost-cutaway";
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
  WALL_HEIGHTS,
  WALL_THICKNESS,
} from "../data/mapgen-preview-palette";
import type { ModelAssetId } from "../../content/data/model-ids";
import { mapModelIds, resolveMapModels } from "../service/map-model-resolver";
import type { ModelPlacement } from "../service/map-model-resolver";
import type { Disposable } from "../model/disposable";
import type { ModelLoader } from "../model/model-loader";
import type { TilePicker } from "../model/tile-picker";

// ===========================================
// Types
// ===========================================

/** One instanced box: a colour, a level to hang it on, and its transforms. */
interface Batch {
  readonly colour: number;
  readonly level: number;
  readonly matrices: Matrix4[];
  /** The tile each instance belongs to, so vision can dim or drop it (#551). */
  readonly keys: VisionTileKey[];
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

/** How far a pick point is pushed along the ray so a hit on a box face floors into that box's tile. */
const PICK_NUDGE = 0.001;

/** Prefix of the per-level group names. */
const LEVEL_GROUP_PREFIX = "level-";

/** Placeholder label for ground pillars, which survive the model swap. */
const TILES_GROUND = "tiles-ground";

/** Placeholder label for building floor, roof and stairs slabs, which do not. */
const TILES_SLAB = "tiles-slab";

/** How much of its colour an explored-but-unseen tile keeps (#551). */
export const VISION_DIM = 0.4;

/** Multiplier for a tile in view. */
const FULL_COLOUR = new Color(1, 1, 1);

/** Multiplier for a tile remembered but not currently seen. */
const DIM_COLOUR = new Color(VISION_DIM, VISION_DIM, VISION_DIM);

/** Collapses an instance to nothing, which also takes it out of picking. */
const ZERO_SCALE = new Matrix4().makeScale(0, 0, 0);

/** What one side knows about a tile right now. */
type TileVisionState = "visible" | "explored" | "hidden";

/** An instanced mesh's untouched transforms and the tile behind each one. */
interface InstanceTiles {
  readonly matrices: readonly Matrix4[];
  readonly keys: readonly VisionTileKey[];
}

/**
 * `SideVision` as sets. Built once per `setVision` because vision changes
 * on every move and a map carries thousands of instances: scanning the
 * arrays per instance would be the product of the two.
 */
interface IndexedVision {
  readonly visible: ReadonlySet<VisionTileKey>;
  readonly explored: ReadonlySet<VisionTileKey>;
}

/** Indexes a side's vision for repeated lookup. */
function indexVision(vision: SideVision): IndexedVision {
  return {
    visible: new Set(vision.visible),
    explored: new Set(vision.explored),
  };
}

/** Whether a side sees a tile, remembers it, or has never seen it. */
function stateOf(vision: IndexedVision, key: VisionTileKey): TileVisionState {
  if (vision.visible.has(key)) {
    return "visible";
  }
  return vision.explored.has(key) ? "explored" : "hidden";
}

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
/**
 * Model ids that fade around an obscured unit: everything a building is
 * made of — walls, floors, roofs and parapets (style guide §12.4).
 *
 * Selected by model id rather than by category because the `tiles`
 * category carries both a building's floors and the ground itself, and
 * the ground must never fade: opening a hole in the map would be worse
 * than the wall it was trying to see past.
 */
const GHOSTED_MODEL_PREFIX = "building.";

/**
 *
 */
export class TacticalMapView implements Disposable, TilePicker {
  // ===========================================
  // Fields
  // ===========================================

  /** Add this to the scene. */
  readonly root: Group;
  /** Shared cutaway uniforms, when the scene ghosts walls (#526). */
  private readonly ghostUniforms: GhostUniforms | undefined;
  private readonly map: TacticalMap;
  private readonly index: TileIndex;
  private readonly levelGroups = new Map<number, Group>();
  private readonly materials = new Map<string, Material>();
  private readonly disposables: Disposable[] = [];
  private readonly unitBox = new BoxGeometry(1, 1, 1);
  private readonly raycaster = new Raycaster();
  /** Placeholder meshes by the category they stand in for, so models can retire them. */
  private readonly placeholders = new Map<string, Object3D[]>();
  /** Every instanced mesh with the tile each of its instances belongs to (#551). */
  private readonly instanceTiles = new Map<InstancedMesh, InstanceTiles>();
  /** Connectors keyed by the tile they arrive on, so vision can hide them too. */
  private readonly connectorTiles = new Map<Mesh, VisionTileKey>();
  /** The vision last applied, indexed, and replayed onto anything built afterwards. */
  private vision: IndexedVision | undefined;
  private modelled = false;

  // ===========================================
  // Constructor
  // ===========================================

  /** Builds every mesh immediately. */
  constructor(map: TacticalMap, ghostUniforms?: GhostUniforms) {
    this.map = map;
    this.ghostUniforms = ghostUniforms;
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

  // ===========================================
  // Models
  // ===========================================

  /**
   * Replaces the placeholder tiles, walls and props with the registered
   * art (#474): every cell is resolved to a model id through
   * `map-model-resolver`, the distinct ids are fetched once, and each
   * one is drawn as an `InstancedMesh` per level so a city block costs a
   * handful of draw calls rather than one per cell.
   *
   * ```
   *   resolveMapModels ──► preload distinct ids
   *          │
   *   per (model id, level): load prototype once
   *          └─► per mesh inside it: InstancedMesh over that cell's transforms
   *          └─► placeholder boxes for that category hidden
   * ```
   *
   * Hooks and connectors keep their placeholder geometry: they are
   * diagnostic markers and ramps and ladders have no registered model.
   * Safe to call once; a second call is a no-op. `ModelLoader` never
   * rejects for a registered id, so a failed fetch shows that model's
   * placeholder rather than losing the map.
   */
  async loadModels(models: ModelLoader): Promise<void> {
    if (this.modelled) {
      return;
    }
    this.modelled = true;
    const placements = resolveMapModels(this.map, this.index);
    await models.preload(mapModelIds(placements));
    const categories: readonly [string, readonly ModelPlacement[]][] = [
      ["tiles", placements.tiles],
      ["walls", placements.walls],
      ["props", placements.props],
    ];
    for (const [label, list] of categories) {
      await this.instanceCategory(label, list, models);
    }
    // Building slabs, walls and props are replaced one for one. Ground
    // pillars stay: they are the earth beneath the surface slab, not a
    // stand-in for it.
    for (const label of [TILES_SLAB, "walls", "props"]) {
      this.retirePlaceholders(label);
    }
  }

  /** Groups a category by model and level, then draws one instanced mesh per part. */
  private async instanceCategory(
    label: string,
    placements: readonly ModelPlacement[],
    models: ModelLoader,
  ): Promise<void> {
    const batches = new Map<
      string,
      {
        modelId: ModelAssetId;
        level: number;
        matrices: Matrix4[];
        keys: VisionTileKey[];
      }
    >();
    for (const placement of placements) {
      const key = `${placement.modelId}:${String(placement.level)}`;
      const matrix = placementMatrix(placement);
      const tileKey = this.index.keyOf(placement.tile);
      const batch = batches.get(key);
      if (batch === undefined) {
        batches.set(key, {
          modelId: placement.modelId,
          level: placement.level,
          matrices: [matrix],
          keys: [tileKey],
        });
      } else {
        batch.matrices.push(matrix);
        batch.keys.push(tileKey);
      }
    }
    for (const [key, batch] of batches) {
      const prototype = await models.load(batch.modelId);
      prototype.updateMatrixWorld(true);
      meshPartsOf(prototype).forEach((part, i) => {
        // Walls are what stands between the camera and a unit, so they
        // carry the ghost cutaway (#526). Their prototype material is
        // shared by every instance of the model, so it is cloned rather
        // than ghosted in place.
        const prototypeMaterial = Array.isArray(part.material)
          ? part.material[0]
          : part.material;
        const material =
          this.ghostUniforms !== undefined &&
          batch.modelId.startsWith(GHOSTED_MODEL_PREFIX) &&
          prototypeMaterial !== undefined
            ? applyGhostCutaway(prototypeMaterial, this.ghostUniforms)
            : part.material;
        const mesh = new InstancedMesh(
          part.geometry,
          material,
          batch.matrices.length,
        );
        if (material !== part.material && !Array.isArray(material)) {
          this.disposables.push(material);
        }
        batch.matrices.forEach((cell, j) => {
          mesh.setMatrixAt(j, new Matrix4().multiplyMatrices(cell, part.local));
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.name = `${label}-model:${key}:${String(i)}`;
        this.trackInstances(
          mesh,
          batch.matrices.map((cell) =>
            new Matrix4().multiplyMatrices(cell, part.local),
          ),
          batch.keys,
        );
        // Geometry and materials belong to the loader's cached prototype
        // and are shared with every other clone, so only the instanced
        // wrapper is ours to free.
        this.disposables.push(mesh);
        this.groupFor(batch.level).add(mesh);
      });
    }
  }

  /** Hides the placeholder boxes a category's models have taken over from. */
  private retirePlaceholders(label: string): void {
    for (const mesh of this.placeholders.get(label) ?? []) {
      mesh.visible = false;
    }
  }

  // ===========================================
  // Vision (#551)
  // ===========================================

  /**
   * Draws the player's view rather than the map (ADR 0006 §2.4):
   * unexplored tiles are not there at all, and explored-but-not-visible
   * ones are dimmed. Passing `undefined` shows everything, which is what
   * the mapgen preview wants — it is a generation tool, not a mission.
   *
   * ```
   *   visible   ──► full colour
   *   explored  ──► × VISION_DIM
   *   neither   ──► zero-scaled, so it draws nothing and no ray can hit it
   * ```
   *
   * Instances are collapsed rather than skipped because an `InstancedMesh`
   * has a fixed count: a zero-scale matrix removes it from the picture and
   * from picking without rebuilding the buffer every time vision changes,
   * which happens on every move.
   *
   * Applied to anything built later too, so calling this before the
   * models load is safe.
   */
  setVision(vision: SideVision | undefined): void {
    this.vision = vision === undefined ? undefined : indexVision(vision);
    for (const [mesh, tiles] of this.instanceTiles) {
      this.applyVisionTo(mesh, tiles);
    }
    const seenVision = this.vision;
    for (const [mesh, key] of this.connectorTiles) {
      mesh.visible =
        seenVision === undefined || stateOf(seenVision, key) !== "hidden";
    }
  }

  /** Remembers a mesh's instances and applies the current vision to them. */
  private trackInstances(
    mesh: InstancedMesh,
    matrices: readonly Matrix4[],
    keys: readonly VisionTileKey[],
  ): void {
    const tiles: InstanceTiles = {
      matrices: matrices.map((m) => m.clone()),
      keys: [...keys],
    };
    this.instanceTiles.set(mesh, tiles);
    this.applyVisionTo(mesh, tiles);
  }

  /** Writes one mesh's instance matrices and colours for the current vision. */
  private applyVisionTo(mesh: InstancedMesh, tiles: InstanceTiles): void {
    const vision = this.vision;
    for (let i = 0; i < tiles.keys.length; i++) {
      const base = tiles.matrices[i];
      const key = tiles.keys[i];
      if (base === undefined || key === undefined) {
        continue;
      }
      const state = vision === undefined ? "visible" : stateOf(vision, key);
      mesh.setMatrixAt(i, state === "hidden" ? ZERO_SCALE : base);
      mesh.setColorAt(i, state === "explored" ? DIM_COLOUR : FULL_COLOUR);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }

  // ===========================================
  // TilePicker
  // ===========================================

  /**
   * The tile under a normalised device coordinate: the nearest hit on
   * any visible map mesh, nudged a hair along the ray so a hit on a
   * box's side floors into that box, with the level read off the group
   * the mesh hangs on. Undefined when the ray misses the map or lands on
   * a coordinate with no tile.
   */
  pickTile(ndc: Vec2, camera: Camera): TileCoord | undefined {
    this.root.updateMatrixWorld(true);
    this.raycaster.setFromCamera(new Vector2(ndc.x, ndc.y), camera);
    const visible = [...this.levelGroups.values()].filter((g) => g.visible);
    const hit = this.raycaster.intersectObjects(visible, true)[0];
    if (hit === undefined) {
      return undefined;
    }
    const level = levelOf(hit.object);
    if (level === undefined) {
      return undefined;
    }
    const point = hit.point
      .clone()
      .addScaledVector(this.raycaster.ray.direction, PICK_NUDGE);
    const coord: TileCoord = {
      x: Math.floor(point.x),
      y: level,
      z: Math.floor(point.z),
    };
    return this.index.has(coord) ? coord : undefined;
  }

  /** The world centre of a tile's top face, or undefined for a coordinate with no tile. */
  tileWorldPosition(tile: TileCoord): Vec3 | undefined {
    return this.index.has(tile) ? tileTopCentre(tile) : undefined;
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

  /**
   * Ground tiles as pillars from the ground plane; building tiles as
   * slabs. The two are flushed under different labels because models
   * retire only the slabs: a building floor is replaced one for one,
   * but a ground pillar is the earth under the surface, and hiding it
   * would leave a raised ledge floating over a hole (#474).
   */
  private buildTiles(): void {
    const ground = new Map<string, Batch>();
    const slabs = new Map<string, Batch>();
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
        isGround ? ground : slabs,
        `tile:${tile.surface}:${tile.y}`,
        colour,
        tile.y,
        matrix,
        this.index.keyOf(tile),
      );
    }
    this.flushBatches(ground, TILES_GROUND);
    this.flushBatches(slabs, TILES_SLAB);
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
        // A parapet stands half a storey, so it sits on the floor rather
        // than filling the opening (#508).
        const height = LEVEL_HEIGHT * WALL_HEIGHTS[kind];
        const centreY = top + height / 2;
        const matrix =
          side === "n" || side === "s"
            ? boxMatrix(
                tile.x + 0.5,
                centreY,
                tile.z + (side === "s" ? 1 : 0),
                1,
                height,
                WALL_THICKNESS,
              )
            : boxMatrix(
                tile.x + (side === "e" ? 1 : 0),
                centreY,
                tile.z + 0.5,
                WALL_THICKNESS,
                height,
                1,
              );
        pushBatch(
          batches,
          `wall:${kind}:${tile.y}`,
          WALL_COLOURS[kind],
          tile.y,
          matrix,
          this.index.keyOf(tile),
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
        this.index.keyOf(tile),
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
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.connectorTiles.set(mesh, this.index.keyOf(connector.to));
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
          this.index.keyOf(coord),
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
      // Hook markers are diagnostic overlays lying on the ground: they
      // neither throw a shadow nor catch one (#507).
      const solid = label !== "hooks";
      mesh.castShadow = solid;
      mesh.receiveShadow = solid;
      mesh.name = `${label}:${key}`;
      this.disposables.push(mesh);
      this.groupFor(batch.level).add(mesh);
      this.trackInstances(mesh, batch.matrices, batch.keys);
      const kept = this.placeholders.get(label);
      if (kept === undefined) {
        this.placeholders.set(label, [mesh]);
      } else {
        kept.push(mesh);
      }
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

/**
 * The world height of a tile's **top surface** — the plane a unit stands
 * on, a wall rises from, and an overlay is painted just above (#557).
 *
 * ```
 *   ── tileTop(y) ─────────────  surface: units, walls, props, overlays
 *      ▒▒▒▒▒▒▒▒▒▒  ground slab, pivot at its centre, so it is placed
 *                  GROUND_SLAB_THICKNESS / 2 below this line
 *   ── y · LEVEL_HEIGHT ───────  the level's base
 * ```
 *
 * One definition, and everything measures from it: the preview box puts
 * its top face here, `map-model-resolver` drops the slab model half a
 * thickness so its top face lands here, `tileTopCentre` is this plus the
 * tile's centre, and `OVERLAY_LIFT` is a nudge above it. Placing a
 * centre-pivoted model *at* this plane is what left the visible surface
 * half a slab high and everything on it half a slab low.
 */
export function tileTop(level: number): number {
  return level * LEVEL_HEIGHT + SLAB_HEIGHT;
}

/** World-space centre of a tile's top face. Shared with the unit meshes. */
export function tileTopCentre(coord: TileCoord): Vec3 {
  return { x: coord.x + 0.5, y: tileTop(coord.y), z: coord.z + 0.5 };
}

/** One drawable piece of a loaded model: its geometry, material and offset from the model's pivot. */
interface MeshPart {
  readonly geometry: BufferGeometry;
  readonly material: Material | Material[];
  readonly local: Matrix4;
}

/**
 * The meshes inside a loaded model, each with its transform relative to
 * the model root. Instancing needs flat parts rather than a tree, so the
 * hierarchy is baked into `local` once and every cell reuses it.
 */
function meshPartsOf(root: Object3D): MeshPart[] {
  const parts: MeshPart[] = [];
  const inverseRoot = new Matrix4().copy(root.matrixWorld).invert();
  root.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }
    parts.push({
      geometry: child.geometry as BufferGeometry,
      material: child.material as Material | Material[],
      local: new Matrix4().multiplyMatrices(inverseRoot, child.matrixWorld),
    });
  });
  return parts;
}

/** Transform placing a model's pivot at a placement, turned clockwise from above. */
function placementMatrix(placement: ModelPlacement): Matrix4 {
  const { x, y, z } = placement.position;
  // +X is east and +Z is south, so a clockwise quarter turn seen from
  // above is a negative rotation about Y.
  const yaw = (-placement.turns * Math.PI) / 2;
  return new Matrix4().compose(
    new Vector3(x, y, z),
    new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw),
    new Vector3(1, 1, 1),
  );
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
  tileKey: VisionTileKey,
): void {
  const batch = batches.get(key);
  if (batch === undefined) {
    batches.set(key, {
      colour,
      level,
      matrices: [matrix],
      keys: [tileKey],
    });
  } else {
    batch.matrices.push(matrix);
    batch.keys.push(tileKey);
  }
}

/** The level index of the group an object hangs on, or undefined outside the level groups. */
function levelOf(object: Object3D): number | undefined {
  let current: Object3D | null = object;
  while (current !== null) {
    if (current.name.startsWith(LEVEL_GROUP_PREFIX)) {
      const level = Number(current.name.slice(LEVEL_GROUP_PREFIX.length));
      return Number.isInteger(level) ? level : undefined;
    }
    current = current.parent;
  }
  return undefined;
}

/** True when the hook belongs to the objectives group. */
function isObjective(hook: Hook, map: TacticalMap): boolean {
  return map.hooks.objectives.includes(hook);
}
