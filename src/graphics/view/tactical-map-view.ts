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
import type { Hook, HookKind } from "../../mapgen/model/hook";
import { allHooks, HookKinds } from "../../mapgen/model/hook";
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
import { UnexploredFog } from "./unexplored-fog";

// ===========================================
// Types
// ===========================================

/** One instanced box: a colour, a level to hang it on, and its transforms. */
interface Batch {
  readonly colour: number;
  readonly level: number;
  readonly matrices: Matrix4[];
  /** The tile each instance belongs to, so vision can tint it (#551, #761). */
  readonly keys: VisionTileKey[];
}

/** One connector's tile, and the material and base colour vision tints. */
interface ConnectorVision {
  readonly key: VisionTileKey;
  readonly material: MeshStandardMaterial;
  readonly base: Color;
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

/**
 * How much of its colour an explored-but-unseen tile keeps (#551), and
 * the cast that tells it apart from a shadow (#661).
 *
 * Memory used to be a **neutral** multiply, `0.4` on all three channels
 * -- which is precisely the operation lighting performs. So two systems
 * answered two different questions on one channel:
 *
 * ```
 *   visible, lit          1.00
 *   visible, in shadow    ~0.54   "something is between this and the sun"
 *   remembered            0.40    "you cannot see this any more"
 *   remembered + shadow   ~0.22
 * ```
 *
 * 1.35x apart, both neutral, and interleaved -- so darkness stopped
 * meaning one thing, and a shadowed street you *can* see read the same
 * as a remembered street you cannot.
 *
 * The fix is the rule from style guide §12.2, applied across systems
 * rather than within one: **one channel per question.** Lighting can
 * darken a surface and warm or cool it a little; what it never does is
 * take the colour out. So memory takes that channel. The green and blue
 * are lifted relative to the red for a cold cast no light in the scene
 * produces, and the overall weight is unchanged, so fog still recedes.
 *
 * Dark and neutral is shadow. Dark and cold is memory. Never-explored
 * terrain carries the same cold base with scene mist above it (#770).
 */
export const VISION_DIM = 0.4;
const VISION_DIM_RED = 0.34;
const VISION_DIM_BLUE = 0.52;

/** Multiplier for a tile in view. */
const FULL_COLOUR = new Color(1, 1, 1);

/** Multiplier for a tile remembered but not currently seen. */
const DIM_COLOUR = new Color(VISION_DIM_RED, VISION_DIM, VISION_DIM_BLUE);

/**
 * Never-explored terrain keeps memory's legible base (#770). Thin scene
 * mist is the distinction, rather than a still darker multiplier. The
 * old 0.28 rung rendered only 1.27× below memory on grass (#761).
 */
export const VISION_UNEXPLORED = VISION_DIM;

/** The colour multiplier for one vision state. */
function tintFor(state: TileVisionState): Color {
  switch (state) {
    case "visible":
      return FULL_COLOUR;
    case "explored":
      return DIM_COLOUR;
    case "unexplored":
      return DIM_COLOUR;
  }
}

/** What one side knows about a tile right now. */
type TileVisionState = "visible" | "explored" | "unexplored";

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
  return vision.explored.has(key) ? "explored" : "unexplored";
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
  /**
   * Connectors by the tile they arrive on, each with its own material so
   * vision can tint it like the tiles it joins (#761). Until then they
   * were only ever shown or hidden, and a remembered ramp drew at full
   * colour beside dimmed ground.
   */
  private readonly connectorTiles = new Map<Mesh, ConnectorVision>();
  /** The vision last applied, indexed, and replayed onto anything built afterwards. */
  private vision: IndexedVision | undefined;
  private modelled = false;
  private readonly unexploredFog: UnexploredFog;

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
    this.unexploredFog = new UnexploredFog(map);
    this.unexploredFog.attachTo((level) => this.groupFor(level));
    this.disposables.push(this.unexploredFog);
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
   * Hooks keep their placeholder geometry, and so do ramps and ladders,
   * which have no registered art; a stairs plank retires once the stairs
   * tile's model is up (#766). A model that fails to load leaves its placeholder rather than
   * losing the map.
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
    // Building slabs, walls and props are replaced one for one, and the
    // stairs plank retires because the stairs tile's own model now draws
    // the staircase (#766). Ground pillars stay: they are the earth
    // beneath the surface slab, not a stand-in for it. Ramps and ladders
    // stay too, having no art.
    for (const label of [TILES_SLAB, "walls", "props", "connectors"]) {
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
      // A retired stairs plank must also leave the vision map, or the
      // next setVision would switch it back on (#766).
      for (const tracked of this.connectorTiles.keys()) {
        if (tracked === mesh) {
          this.connectorTiles.delete(tracked);
        }
      }
    }
  }

  // ===========================================
  // Vision (#551)
  // ===========================================

  /**
   * Draws the map as the player knows it (#551, #761): the whole map is
   * always there, and how much of its colour each tile keeps says how well
   * the side knows it. Passing `undefined` shows everything at full
   * colour, which is what the mapgen preview wants — it is a generation
   * tool, not a mission.
   *
   * ```
   *   visible     ──► full colour
   *   explored    ──► × VISION_DIM          remembered, cold
   *   unexplored  ──► same cold base + thin scene mist, never seen
   * ```
   *
   * Nothing is ever removed or zero-scaled for vision. Until #761 an
   * unexplored instance was collapsed to nothing, and the map ended in a
   * cliff wherever the seen area did, with buildings missing the walls on
   * tiles not yet reached (#748). Units and objectives are the things fog
   * makes absent (ADR 0006 §2.4), and the scene builder owns those.
   *
   * Applied to anything built later too, so calling this before the
   * models load is safe.
   */
  setVision(vision: SideVision | undefined): void {
    this.vision = vision === undefined ? undefined : indexVision(vision);
    this.unexploredFog.setVision(vision);
    for (const [mesh, tiles] of this.instanceTiles) {
      this.applyVisionTo(mesh, tiles);
    }
    for (const connector of this.connectorTiles.values()) {
      this.applyVisionToConnector(connector);
    }
  }

  /** Tints one connector's own material for the current vision. */
  private applyVisionToConnector(connector: ConnectorVision): void {
    const vision = this.vision;
    const state =
      vision === undefined ? "visible" : stateOf(vision, connector.key);
    connector.material.color.copy(connector.base).multiply(tintFor(state));
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
      mesh.setMatrixAt(i, base);
      mesh.setColorAt(i, tintFor(state));
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
    if (!this.index.has(coord)) {
      return undefined;
    }
    // Unexplored ground is drawn now (#761) but stays out of picking on
    // purpose. Until #761 it was unhittable only because it was
    // zero-scaled; keeping it unhittable preserves what the player could
    // do before the render fix, so a p0 about drawing does not decide on
    // the side whether a move may be ordered into fog. That is a design
    // call, recorded on #761, and this is where it would change.
    if (
      this.vision !== undefined &&
      stateOf(this.vision, this.index.keyOf(coord)) === "unexplored"
    ) {
      return undefined;
    }
    return coord;
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
      const material = mesh.material as MeshStandardMaterial;
      const tracked: ConnectorVision = {
        key: this.index.keyOf(connector.to),
        material,
        base: new Color(CONNECTOR_COLOURS[connector.kind]),
      };
      this.connectorTiles.set(mesh, tracked);
      this.applyVisionToConnector(tracked);
      this.groupFor(connector.to.y).add(mesh);
      if (connector.kind === "stairs") {
        // A placeholder until the stairs tile's model is up (#766).
        const kept = this.placeholders.get("connectors");
        if (kept === undefined) {
          this.placeholders.set("connectors", [mesh]);
        } else {
          kept.push(mesh);
        }
      }
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
    const mesh = new Mesh(geometry, this.connectorMaterial(connector.kind));
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
    const mesh = new Mesh(geometry, this.connectorMaterial("ladder"));
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

  /**
   * A flat marker on every hook tile, each kind on its own shelf so an
   * overlap has a fixed winner (#477).
   *
   * Hook tiles overlap constantly rather than occasionally: the
   * extraction point shares the first deploy zone's tiles (ADR 0004
   * §4.6), and measured across 24 generated maps **every deploy tile is
   * also an extraction tile — 384 of 384**. Drawn at one height those
   * are coincident coplanar quads, and which one the player saw was
   * decided by batch order, itself decided by the set of distinct
   * colours in the scene. #477 caught the marker flipping from deploy to
   * extraction because an unrelated branch changed some surface colours.
   *
   * Each kind is lifted by its rank in `HOOK_MARKER_PRIORITY`, so the
   * most important is nearest the camera and nothing is left to draw
   * order. Both markers still exist: a single marker per tile would be
   * the truer picture, but with the two tile sets identical it would
   * mean one kind never appearing anywhere in the game, which is a
   * visual decision rather than a bug fix.
   */
  private buildHooks(): void {
    const batches = new Map<string, Batch>();
    for (const hook of allHooks(this.map.hooks)) {
      for (const coord of hook.tiles) {
        const colour = HOOK_COLOURS[hook.kind] ?? FALLBACK_HOOK_COLOUR;
        const lift =
          MARKER_LIFT +
          (isObjective(hook, this.map) ? SLAB_HEIGHT : 0) +
          shelfOf(hook.kind);
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

  /**
   * A material of the connector's own, unlike the shared ones tiles use,
   * because vision writes a per-connector tint into `color` (#761).
   */
  private connectorMaterial(kind: Connector["kind"]): MeshStandardMaterial {
    const material = new MeshStandardMaterial({
      color: CONNECTOR_COLOURS[kind],
    });
    this.disposables.push(material);
    return material;
  }

  /** One shared material per colour, so tiles of a kind cost one draw call. */
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

/**
 * Which hook a tile shows when it carries more than one (#477), most
 * important first.
 *
 * ```
 *   egg-spawner  the mission objective
 *   extraction   somewhere the player must return to and cannot infer
 *   deploy       where the squad already stands, which its units show
 *   edge-spawn   where bugs arrive; useful, never urgent
 * ```
 *
 * Extraction outranks deploy because a deploy zone is self-evident from
 * the squad standing on it, while an extraction tile is a fact the
 * player has to be told and will need later. That is a judgement, and
 * the point of naming it is that it can be argued with — before #477 the
 * same question was answered by whichever batch happened to draw last.
 *
 * A kind not listed sorts last, so a new hook never displaces an
 * existing marker by accident.
 */
const HOOK_MARKER_PRIORITY: readonly HookKind[] = [
  HookKinds.EGG_SPAWNER,
  HookKinds.EXTRACTION,
  HookKinds.DEPLOY,
  HookKinds.EDGE_SPAWN,
];

/** Vertical gap between hook shelves: enough to order them, too small to read as height. */
const HOOK_SHELF_STEP = 0.004;

/**
 * How far above the tile a hook kind's marker sits, by priority.
 *
 * @param kind - The hook kind being drawn.
 * @returns A lift in world units; higher priority sits higher.
 */
function shelfOf(kind: HookKind): number {
  const at = HOOK_MARKER_PRIORITY.indexOf(kind);
  const rank = at === -1 ? HOOK_MARKER_PRIORITY.length : at;
  return (HOOK_MARKER_PRIORITY.length - rank) * HOOK_SHELF_STEP;
}

/** True when the hook belongs to the objectives group. */
function isObjective(hook: Hook, map: TacticalMap): boolean {
  return map.hooks.objectives.includes(hook);
}
