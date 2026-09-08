import { STOREY_LAYERS } from "../../core/model/elevation";
import type { LayerFocus } from "../model/layer-focus";
import type { Camera, Material, Object3D } from "three";
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
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
import { terrainSlopeRise } from "../service/terrain-slope-rise";
import type { RoadAppearance } from "../model/road-appearance";
import type {
  LadderAppearance,
  LadderFinish,
} from "../model/ladder-appearance";
import { LadderModelFactory } from "../service/ladder-model-factory";
import type { PitchedRoofAppearance } from "../model/pitched-roof-appearance";
import { PitchedRoofModelFactory } from "../service/pitched-roof-model-factory";
import { pitchedRoofKey } from "../service/pitched-roof-model-resolver";
import { foundationHeight } from "../service/foundation-model-resolver";
import type { RampAppearance } from "../model/ramp-appearance";
import type { TerrainSlopeAppearance } from "../model/terrain-slope-appearance";
import { TerrainTransitionModelFactory } from "../service/terrain-transition-model-factory";
import { roadAppearanceKey } from "../service/road-model-resolver";
import { RoadModelFactory } from "../service/road-model-factory";
import { ROAD_STYLES } from "../data/road-styles";
import type { GhostUniforms } from "../service/ghost-cutaway";
import { applyGhostCutaway } from "../service/ghost-cutaway";
import type { PointerCutawayTarget } from "../model/pointer-cutaway";
import { buildingInspectionCentre } from "../service/building-inspection-centre";
import {
  CONNECTOR_COLOURS,
  FALLBACK_HOOK_COLOUR,
  FALLBACK_SURFACE_COLOUR,
  HOOK_COLOURS,
  LAYER_HEIGHT,
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
import { NaturalMaterialTransitions } from "../service/natural-material-transitions";
import {
  type PARAMETERISED_TERRAIN_MODELS,
  surfaceModel,
} from "../data/map-model-table";
import {
  TerrainSlopeModelFactory,
  slopeMaterialsFromGround,
} from "../service/terrain-slope-model-factory";

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

/**
 * The transform an instance gets when the layer cut is below it: scaled
 * to nothing, which also takes it out of picking (measured — a ray
 * through a collapsed ledge lands on the ground beneath it, with or
 * without recomputed bounds).
 */
const COLLAPSED = new Matrix4().makeScale(0, 0, 0);

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

/**
 * Where a tile sits for the layer cut (#978): the floor it is on inside
 * its own building, and the engine layer it is drawn at.
 *
 * `storey` is undefined for anything outside a building — ground, roads,
 * exterior props — which is cut by height instead, because terrain has
 * no floors to count and hiding the hill a unit stands on would remove
 * the world rather than open it up.
 */
interface TileCut {
  readonly storey: number | undefined;
  readonly level: number;
}

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
 *   tile (x, y, z) covers [x, x+1) × [z, z+1); its top is at y · LAYER_HEIGHT + SLAB
 *
 *        ┌──────┐ ← roof slab (level 2)
 *   ▌    │      │   walls stand STOREY_LAYERS × LAYER_HEIGHT tall on the tile top
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
  /** One scene-specific cutaway per prototype, also shared by the mist cache. */
  private readonly ghostMaterials = new Map<Material, Material>();
  /** Materialised slope/ramp prototypes shared across levels and rotations. */
  private readonly slopeModels = new Map<string, Group>();
  private readonly ladderModels = new Map<LadderFinish, Group>();
  private readonly roofModels = new Map<string, Group>();
  private readonly roadModels = new Map<string, Group>();
  private readonly terrainModels = new Map<string, Group>();
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
  /** The storey the player is looking at (#978), or undefined for all of them. */
  private focus: LayerFocus | undefined;
  /** Built once per map: where each tile sits for the cut. */
  private tileCuts: Map<VisionTileKey, TileCut> | undefined;
  private modelled = false;
  /** Invalidates stationary pointer picks after model loading or floor cuts. */
  private inspectionRevision = 0;
  /** Retain an early floor cut when asynchronously loaded art adds a new visual level. */
  private maxLevel: number | undefined;
  private readonly unexploredFog: UnexploredFog;
  private readonly naturalMaterials: NaturalMaterialTransitions;

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
    this.unexploredFog = new UnexploredFog(map);
    this.naturalMaterials = new NaturalMaterialTransitions(map);
    this.disposables.push(this.naturalMaterials);
    this.buildTiles();
    this.buildWalls();
    this.buildProps();
    this.buildConnectors();
    this.buildHooks();
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
    this.maxLevel = maxLevel;
    this.inspectionRevision++;
    for (const [level, group] of this.levelGroups) {
      group.visible = maxLevel === undefined || level <= maxLevel;
    }
  }

  /**
   * Shows every building up to `focus.storey` **of its own floors**, and
   * everything outside a building up to `focus.cutLevel` (#978).
   *
   * The two rules exist because a building knows what floor it is on and
   * terrain does not. Before this the whole map was cut at one height
   * taken from the lowest building, so on the 43 % of generated maps
   * whose buildings stand at different levels, a building up a hill had
   * its ground floor above the cut and **disappeared** at exactly the
   * moment the player asked to see inside it.
   *
   * Level groups stay the coarse filter, raised to whatever the tallest
   * standing building needs; the per-instance pass below does the rest.
   * On a map whose buildings all share a ground level the two cuts are
   * the same number and nothing changes at all, which is the control.
   *
   * @param focus - Where the player is looking, or undefined for the whole map.
   */
  setLayerFocus(focus: LayerFocus | undefined): void {
    this.focus = focus;
    this.setMaxLevel(this.groupCutFor(focus));
    for (const [mesh, tiles] of this.instanceTiles) {
      this.applyVisionTo(mesh, tiles);
    }
    for (const [mesh, connector] of this.connectorTiles) {
      this.applyVisionToConnector(mesh, connector);
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
   * Hooks keep their placeholder geometry. Ramps (#875) and ladders (#891)
   * have materialled connector kits; a stairs plank retires once the stairs
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
    await this.naturalMaterials.prepare(models);
    const categories: readonly [string, readonly ModelPlacement[]][] = [
      ["tiles", placements.tiles],
      ["foundations", placements.foundations],
      ["roofs", placements.roofs],
      ["walls", placements.walls],
      ["frontages", placements.frontages],
      ["props", placements.props],
      ["ramps", placements.connectors.filter((p) => p.ramp !== undefined)],
      ["ladders", placements.connectors.filter((p) => p.ladder !== undefined)],
    ];
    for (const [label, list] of categories) {
      await this.instanceCategory(label, list, models);
    }
    // Building slabs, walls and props are replaced one for one, and the
    // stairs plank retires because the stairs tile's own model now draws
    // the staircase (#766). Ground pillars stay: they are the earth
    // beneath the surface slab, not a stand-in for it.
    for (const label of [
      TILES_SLAB,
      "foundations",
      "walls",
      "props",
      "connectors",
    ]) {
      this.retirePlaceholders(label);
    }
    for (const placement of placements.connectors) {
      if (placement.ramp) this.retirePlaceholders(`ramp:${placement.ramp.id}`);
      if (placement.ladder)
        this.retirePlaceholders(`ladder:${placement.ladder.id}`);
    }
    // The half-rise kit replaces the initial wedges once its models are placed.
    if (placements.tiles.some((p) => p.modelId.startsWith("tile.slope."))) {
      this.retirePlaceholders("slopes");
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
        slopeTile?: Tile;
        road?: RoadAppearance;
        ramp?: RampAppearance;
        ladder?: LadderAppearance;
        roof?: PitchedRoofAppearance;
        terrain?: { appearance: TerrainSlopeAppearance; tile: Tile };
        naturalSurface?: Tile["surface"];
      }
    >();
    for (const placement of placements) {
      const tile =
        label === "tiles" ? this.index.getAt(placement.tile) : undefined;
      const slopeTile = tile?.slope === undefined ? undefined : tile;
      const road = placement.road;
      const ramp = placement.ramp;
      const ladder = placement.ladder;
      const roof = placement.roof;
      const terrain =
        placement.terrain && tile
          ? { appearance: placement.terrain, tile }
          : undefined;
      const key = `${placement.modelId}:${String(placement.level)}${slopeTile ? `:${slopeTile.surface}` : ""}${road ? `:road:${roadAppearanceKey(road)}` : ""}${ramp ? `:ramp:${ramp.surface}` : ""}${ladder ? `:ladder:${ladder.finish}` : ""}${roof ? `:roof:${pitchedRoofKey(roof)}` : ""}${terrain ? `:terrain:${terrainPrototypeKey(terrain.appearance, tile!.surface)}` : ""}`;
      const matrix = placementMatrix(placement);
      const tileKey = this.index.keyOf(placement.tile);
      const batch = batches.get(key);
      if (batch === undefined) {
        batches.set(key, {
          modelId: placement.modelId,
          level: placement.level,
          matrices: [matrix],
          keys: [tileKey],
          slopeTile,
          road,
          ramp,
          ladder,
          roof,
          terrain,
          naturalSurface:
            tile?.buildingId === undefined ? tile?.surface : undefined,
        });
      } else {
        batch.matrices.push(matrix);
        batch.keys.push(tileKey);
      }
    }
    for (const [key, batch] of batches) {
      const prototype = batch.roof
        ? await this.roofPrototype(batch.roof, models)
        : batch.ladder
          ? await this.ladderPrototype(batch.ladder.finish, models)
          : batch.ramp
            ? await this.parameterisedPrototype(
                "ramp",
                batch.ramp.surface,
                models,
              )
            : batch.terrain
              ? await this.terrainPrototype(
                  batch.terrain.appearance,
                  batch.terrain.tile,
                  models,
                )
              : batch.road
                ? await this.roadPrototype(batch.road, models)
                : batch.slopeTile
                  ? await this.parameterisedPrototype(
                      batch.slopeTile.slope!.kind,
                      batch.slopeTile.surface,
                      models,
                    )
                  : await models.load(batch.modelId);
      prototype.updateMatrixWorld(true);
      meshPartsOf(prototype).forEach((part, i) => {
        // Walls are what stands between the camera and a unit, so they
        // carry the ghost cutaway (#526). Their prototype material is
        // shared by every instance of the model, so it is cloned rather
        // than ghosted in place.
        const prototypeMaterial = Array.isArray(part.material)
          ? part.material[0]
          : part.material;
        const originalMaterial =
          this.ghostUniforms !== undefined &&
          batch.modelId.startsWith(GHOSTED_MODEL_PREFIX) &&
          prototypeMaterial !== undefined
            ? this.ghostMaterial(prototypeMaterial)
            : part.material;
        const naturalSurface = batch.naturalSurface ?? batch.ramp?.surface;
        const material =
          naturalSurface === undefined
            ? originalMaterial
            : Array.isArray(originalMaterial)
              ? originalMaterial.map((m) =>
                  this.naturalMaterials.material(m, naturalSurface),
                )
              : this.naturalMaterials.material(
                  originalMaterial,
                  naturalSurface,
                );
        const mesh = new InstancedMesh(
          part.geometry,
          material,
          batch.matrices.length,
        );
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
        // The mist owns its geometry/material clones; loader prototypes
        // stay untouched. This view owns the instanced wrapper.
        this.disposables.push(mesh);
        this.groupFor(batch.level).add(mesh);
      });
    }
  }

  /** Shares one textured section per finish across all ladders, rises and level batches. */
  private async ladderPrototype(
    finish: LadderFinish,
    models: ModelLoader,
  ): Promise<Group> {
    let prototype = this.ladderModels.get(finish);
    if (prototype === undefined) {
      prototype = await new LadderModelFactory(models).create(finish);
      prototype.traverse((object) => {
        if (object instanceof Mesh)
          this.disposables.push((object as Mesh).geometry);
      });
      this.ladderModels.set(finish, prototype);
    }
    return prototype;
  }

  /** Shares fitted roof geometry and its borrowed material across buildings and levels. */
  private async roofPrototype(
    roof: PitchedRoofAppearance,
    models: ModelLoader,
  ): Promise<Group> {
    const key = pitchedRoofKey(roof);
    let prototype = this.roofModels.get(key);
    if (prototype === undefined) {
      prototype = await new PitchedRoofModelFactory(models).create(roof);
      prototype.traverse((object) => {
        if (object instanceof Mesh)
          this.disposables.push((object as Mesh).geometry);
      });
      this.roofModels.set(key, prototype);
    }
    return prototype;
  }

  /** Applies ground materials once per shape/surface, leaving loader prototypes untouched. */
  private async parameterisedPrototype(
    kind: keyof typeof PARAMETERISED_TERRAIN_MODELS,
    surface: Tile["surface"],
    models: ModelLoader,
  ): Promise<Group> {
    const key = `${kind}:${surface}`;
    let prototype = this.slopeModels.get(key);
    if (prototype === undefined) {
      const sides = this.material(
        SURFACE_COLOURS[surface] ?? FALLBACK_SURFACE_COLOUR,
      );
      const groundId = surfaceModel(surface);
      const materials =
        groundId === undefined
          ? { surface: sides, sides }
          : slopeMaterialsFromGround(await models.load(groundId), sides);
      prototype = await new TerrainSlopeModelFactory(models).create(
        kind,
        materials,
      );
      prototype.traverse((object) => {
        if (object instanceof Mesh)
          this.disposables.push((object as Mesh).geometry);
      });
      this.slopeModels.set(key, prototype);
    }
    return prototype;
  }

  /** Borrows the road style's material once per appearance, shared across every level. */
  private async roadPrototype(
    appearance: RoadAppearance,
    models: ModelLoader,
  ): Promise<Group> {
    const key = roadAppearanceKey(appearance);
    let prototype = this.roadModels.get(key);
    if (prototype === undefined) {
      const surface = ROAD_STYLES[appearance.style].surface;
      const sides = this.material(
        SURFACE_COLOURS[surface] ?? FALLBACK_SURFACE_COLOUR,
      );
      const materials = slopeMaterialsFromGround(
        await models.load(surfaceModel(surface)!),
        sides,
      );
      prototype = await new RoadModelFactory(models).create(
        appearance,
        materials,
      );
      prototype.traverse((object) => {
        if (object instanceof Mesh)
          this.disposables.push((object as Mesh).geometry);
      });
      this.roadModels.set(key, prototype);
    }
    return prototype;
  }

  /** Shares fitted terrain geometry and borrowed materials across levels and rotations. */
  private async terrainPrototype(
    appearance: TerrainSlopeAppearance,
    tile: Tile,
    models: ModelLoader,
  ): Promise<Group> {
    const key = terrainPrototypeKey(appearance, tile.surface);
    let prototype = this.terrainModels.get(key);
    if (!prototype) {
      const sides = this.material(
        SURFACE_COLOURS[tile.surface] ?? FALLBACK_SURFACE_COLOUR,
      );
      const materials = slopeMaterialsFromGround(
        await models.load(surfaceModel(tile.surface)!),
        sides,
      );
      prototype =
        appearance.kind === "transition"
          ? await new TerrainTransitionModelFactory(models).create(
              appearance.corners,
              materials,
              appearance.diagonal,
            )
          : appearance.kind === "three-sided-mouth"
            ? await new TerrainSlopeModelFactory(models).createThreeSidedMouth(
                materials,
              )
            : await new TerrainSlopeModelFactory(models).create(
                appearance.kind,
                materials,
              );
      prototype.traverse((object) => {
        if (object instanceof Mesh)
          this.disposables.push((object as Mesh).geometry);
      });
      this.terrainModels.set(key, prototype);
    }
    return prototype;
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
    for (const [mesh, connector] of this.connectorTiles) {
      this.applyVisionToConnector(mesh, connector);
    }
  }

  /**
   * Tints one connector's own material for the current vision, and hides
   * it outright when the layer cut is below it (#978).
   *
   * A connector is its own mesh rather than an instance in a batch, so
   * unlike the walls and floors around it this is a plain `visible`
   * flag. Without it a staircase hangs in the air above a building whose
   * upper floors have been cut away.
   */
  private applyVisionToConnector(mesh: Mesh, connector: ConnectorVision): void {
    const vision = this.vision;
    const state =
      vision === undefined ? "visible" : stateOf(vision, connector.key);
    connector.material.color.copy(connector.base).multiply(tintFor(state));
    mesh.visible = !this.hiddenByCut(connector.key);
  }

  /** Remembers a mesh's instances and applies the current vision to them. */
  private trackInstances(
    mesh: InstancedMesh,
    matrices: readonly Matrix4[],
    keys: readonly VisionTileKey[],
  ): void {
    this.inspectionRevision++;
    const tiles: InstanceTiles = {
      matrices: matrices.map((m) => m.clone()),
      keys: [...keys],
    };
    if (!mesh.name.startsWith("hooks:"))
      this.unexploredFog.trackSurface(mesh, keys);
    this.instanceTiles.set(mesh, tiles);
    this.applyVisionTo(mesh, tiles);
  }

  /**
   * Writes one mesh's instance matrices and colours for the current
   * vision, collapsing any instance the layer cut is below (#978).
   *
   * **Collapsing is for the cut, never for vision.** Until #761 an
   * unexplored instance was zero-scaled and the map ended in a cliff
   * wherever the seen area did, with buildings missing walls on tiles
   * nobody had reached (#748); fog is about what the player knows, and
   * knowledge does not remove architecture. The cut is the opposite — a
   * deliberate request for the floor above to be gone — so collapsing is
   * exactly what it wants. The two share this loop and must not share a
   * reason: a tile hidden by the cut stays hidden whatever vision says.
   */
  private applyVisionTo(mesh: InstancedMesh, tiles: InstanceTiles): void {
    const vision = this.vision;
    for (let i = 0; i < tiles.keys.length; i++) {
      const base = tiles.matrices[i];
      const key = tiles.keys[i];
      if (base === undefined || key === undefined) {
        continue;
      }
      const state = vision === undefined ? "visible" : stateOf(vision, key);
      mesh.setMatrixAt(i, this.hiddenByCut(key) ? COLLAPSED : base);
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

  /** The version of the geometry/level visibility used for inspection picking. */
  get cutawayRevision(): number {
    return this.inspectionRevision;
  }

  /**
   * Pick the foremost visible physical map surface, using model ownership
   * rather than a walkable roof coordinate. Retired placeholders and hidden
   * levels must not intercept the ray; raycasting ignores shader discards,
   * so opening a roof cannot make the same stationary pointer lose its target.
   */
  pickCutaway(ndc: Vec2, camera: Camera): PointerCutawayTarget | undefined {
    this.root.updateMatrixWorld(true);
    this.raycaster.setFromCamera(new Vector2(ndc.x, ndc.y), camera);
    const meshes: Object3D[] = [];
    this.root.traverseVisible((object) => {
      if (object instanceof Mesh) meshes.push(object);
    });
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    if (
      !hit ||
      !(hit.object instanceof InstancedMesh) ||
      hit.instanceId === undefined
    )
      return undefined;
    const key = this.instanceTiles.get(hit.object as InstancedMesh)?.keys[
      hit.instanceId
    ];
    if (key === undefined) return undefined;
    const tile = this.index.get(
      key % this.map.width,
      Math.floor(key / (this.map.width * this.map.depth)),
      Math.floor(key / this.map.width) % this.map.depth,
    );
    const building = this.map.buildings.find((b) => b.id === tile?.buildingId);
    if (!building) return undefined;
    const centre = buildingInspectionCentre(
      building,
      hit.point,
      this.raycaster.ray,
    );
    return centre ? { buildingId: building.id, centre } : undefined;
  }

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
    this.ghostMaterials.clear();
    this.roofModels.clear();
    this.slopeModels.clear();
    this.ladderModels.clear();
    this.roadModels.clear();
    this.terrainModels.clear();
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
    const foundations = new Map<string, Batch>();
    for (const tile of this.map.tiles) {
      const colour = SURFACE_COLOURS[tile.surface] ?? FALLBACK_SURFACE_COLOUR;
      const top = tileTop(tile.y);
      const isGround = tile.buildingId === undefined;
      const support = foundationHeight(tile);
      if (support > 0) {
        // Floor zero also owns the implicit solid below it (#906). The
        // textured foundation kit retires this support box after loading.
        pushBatch(
          foundations,
          `foundation:${tile.y}`,
          colour,
          tile.y,
          boxMatrix(tile.x + 0.5, support / 2, tile.z + 0.5, 1, support, 1),
          this.index.keyOf(tile),
        );
      }
      if (tile.slope !== undefined) {
        // A hillside piece (#799): the column below stays a ground box and
        // a wedge rises from this tile's top to the next level. A straight
        // placeholder stands here until loadModels applies the #798 kit.
        pushBatch(
          ground,
          `tile:${tile.surface}:${tile.y}`,
          colour,
          tile.y,
          boxMatrix(tile.x + 0.5, top - top / 2, tile.z + 0.5, 1, top, 1),
          this.index.keyOf(tile),
        );
        this.wedgeMesh(tile, colour);
        continue;
      }
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
    this.flushBatches(foundations, "foundations");
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
        const height = STOREY_LAYERS * LAYER_HEIGHT * WALL_HEIGHTS[kind];
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
      if (
        connector.kind === "ramp" &&
        this.index.getAt(connector.from)?.slope !== undefined
      ) {
        // The slope tile's own wedge is the connector's shape (#799).
        continue;
      }
      const mesh =
        connector.kind === "ladder"
          ? this.ladderMesh(connector)
          : this.plankMesh(connector);
      mesh.name = connector.id;
      this.unexploredFog.trackSurface(
        mesh,
        [this.index.keyOf(connector.to)],
        "exclusive",
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const material = mesh.material as MeshStandardMaterial;
      const tracked: ConnectorVision = {
        key: this.index.keyOf(connector.to),
        material,
        base: new Color(CONNECTOR_COLOURS[connector.kind]),
      };
      this.connectorTiles.set(mesh, tracked);
      this.applyVisionToConnector(mesh, tracked);
      this.groupFor(connector.to.y).add(mesh);
      // Retire each ladder/ramp only after its own kit placement resolves.
      const label =
        connector.kind === "ramp"
          ? `ramp:${connector.id}`
          : connector.kind === "ladder"
            ? `ladder:${connector.id}`
            : "connectors";
      const kept = this.placeholders.get(label);
      if (kept === undefined) this.placeholders.set(label, [mesh]);
      else kept.push(mesh);
    }
  }

  /**
   * The placeholder wedge for a slope tile (#799): a right prism whose
   * top face rises to its natural upper neighbour from the low edge to the
   * high edge, turned by the slope's quarter turns. Tracked for vision as
   * the tile it stands on, and kept under its own label so retiring the
   * slab placeholders (#474) leaves it standing until #798's models take
   * over.
   */
  private wedgeMesh(tile: Tile, colour: number): void {
    const slope = tile.slope;
    if (slope === undefined) {
      return;
    }
    const low = tileTop(tile.y);
    const rise = terrainSlopeRise(tile, this.index) * LAYER_HEIGHT;
    // Built rising towards +z (south), which is `turns` 0; a quarter turn
    // clockwise about +y for each further turn matches the stairs model.
    const geometry = new BufferGeometry();
    const h = 0.5;
    // prettier-ignore
    const vertices = new Float32Array([
      // low edge at z = -h (y = 0), high edge at z = +h (y = rise)
      -h, 0, -h,   h, 0, -h,   h, rise, h,   -h, rise, h, // top face
      -h, 0, -h,  -h, 0,  h,  -h, rise, h,                // west face
       h, 0, -h,   h, rise, h,   h, 0,  h,                // east face
      -h, 0,  h,   h, 0,  h,   h, rise, h,   -h, rise, h, // high (south) face
    ]);
    // prettier-ignore
    const indices = [
      0, 2, 1,  0, 3, 2,       // top
      4, 5, 6,                 // west
      7, 8, 9,                 // east
      10, 11, 12,  10, 12, 13, // high face
    ];
    geometry.setAttribute("position", new BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new MeshStandardMaterial({
      color: colour,
      side: DoubleSide,
    });
    this.disposables.push(geometry, material);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(tile.x + 0.5, low, tile.z + 0.5);
    mesh.rotation.y = -slope.turns * (Math.PI / 2);
    mesh.name = `slope:${String(tile.x)},${String(tile.z)}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.unexploredFog.trackSurface(mesh, [this.index.keyOf(tile)]);
    const tracked: ConnectorVision = {
      key: this.index.keyOf(tile),
      material: mesh.material,
      base: new Color(colour),
    };
    this.connectorTiles.set(mesh, tracked);
    this.applyVisionToConnector(mesh, tracked);
    this.groupFor(tile.y).add(mesh);
    const kept = this.placeholders.get("slopes");
    if (kept === undefined) {
      this.placeholders.set("slopes", [mesh]);
    } else {
      kept.push(mesh);
    }
  }

  /** A plank from the lower tile's top to the upper tile's top. */
  private plankMesh(connector: Connector): Mesh {
    const from = tileTopCentre(connector.from);
    const to = tileTopCentre(connector.to);
    const rise = to.y - from.y;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    // The plank spans the whole climb: a fixed length reached only half
    // way up a two-layer rise and left the road seam reading as a void
    // with a stub at its foot (#863, exhibit K2).
    const geometry = new BoxGeometry(
      Math.max(PLANK.length, Math.hypot(dx, dz, rise)),
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

  /** Keeps building cutaway clones stable across levels of the same model. */
  private ghostMaterial(prototype: Material): Material {
    let material = this.ghostMaterials.get(prototype);
    if (material === undefined) {
      material = applyGhostCutaway(prototype, this.ghostUniforms!);
      this.ghostMaterials.set(prototype, material);
      this.disposables.push(material);
    }
    return material;
  }

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

  /**
   * Whether the layer cut hides the tile behind `key`.
   *
   * A tile inside a building is judged on its own floor number, so
   * "floor 1" is floor 1 of every building however high it stands.
   * Anything else is judged on height, from the lowest building.
   *
   * @param key - The tile's vision key.
   * @returns True when the cut is below it.
   */
  private hiddenByCut(key: VisionTileKey): boolean {
    const focus = this.focus;
    // The top focus is uncut, including roofs above its last interior floor.
    if (focus?.cutLevel === undefined) {
      return false;
    }
    const cut = this.tileCutIndex().get(key);
    if (cut === undefined) {
      return false;
    }
    return cut.storey === undefined
      ? focus.cutLevel !== undefined && cut.level > focus.cutLevel
      : cut.storey > focus.storey;
  }

  /**
   * Where every tile sits for the cut, built once and kept.
   *
   * `Tile.buildingId` and `Tile.floorIndex` are already denormalised onto
   * interior floor, stair and roof tiles by the finalize pass, so the
   * floor a tile is on needs no footprint search. Roof tiles carry the
   * building but no floor index — measured on a generated map, 101 of
   * them — so the storey is derived from the height above that
   * building's own ground, which agrees with `floorIndex` on every one
   * of the 655 tiles that carry both.
   */
  private tileCutIndex(): Map<VisionTileKey, TileCut> {
    if (this.tileCuts !== undefined) {
      return this.tileCuts;
    }
    const grounds = new Map(
      this.map.buildings.map((building) => [building.id, building.groundLevel]),
    );
    const cuts = new Map<VisionTileKey, TileCut>();
    for (const tile of this.map.tiles) {
      const ground =
        tile.buildingId === undefined
          ? undefined
          : grounds.get(tile.buildingId);
      cuts.set(this.index.keyOf(tile), {
        storey:
          ground === undefined
            ? undefined
            : Math.floor((tile.y - ground) / STOREY_LAYERS),
        level: tile.y,
      });
    }
    this.tileCuts = cuts;
    return cuts;
  }

  /**
   * The level below which whole groups can stay hidden: the highest any
   * standing building needs at this storey, or the terrain cut, whichever
   * is higher. Undefined shows everything.
   */
  private groupCutFor(focus: LayerFocus | undefined): number | undefined {
    if (focus?.cutLevel === undefined) {
      return undefined;
    }
    return this.map.buildings.reduce(
      (cut, building) =>
        Math.max(
          cut,
          building.groundLevel + (focus.storey + 1) * STOREY_LAYERS - 1,
        ),
      focus.cutLevel,
    );
  }

  /** The group for a level, created on first use. */
  private groupFor(level: number): Group {
    let group = this.levelGroups.get(level);
    if (group === undefined) {
      group = new Group();
      group.name = `level-${level}`;
      group.visible = this.maxLevel === undefined || level <= this.maxLevel;
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

/** Prototype identity excludes placement and elevation, preserving material sharing. */
function terrainPrototypeKey(
  appearance: TerrainSlopeAppearance,
  surface: string,
): string {
  return `${surface}:${appearance.kind}${appearance.kind === "transition" ? `:${appearance.diagonal}:${appearance.corners.join(",")}` : ""}`;
}

/**
 * The world height of a tile's **top surface** — the plane a unit stands
 * on, a wall rises from, and an overlay is painted just above (#557).
 *
 * ```
 *   ── tileTop(y) ─────────────  surface: units, walls, props, overlays
 *      ▒▒▒▒▒▒▒▒▒▒  ground slab, pivot at its centre, so it is placed
 *                  GROUND_SLAB_THICKNESS / 2 below this line
 *   ── y · LAYER_HEIGHT ───────  the level's base
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
  return level * LAYER_HEIGHT + SLAB_HEIGHT;
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
    new Vector3(1, placement.scaleY ?? 1, placement.scaleZ ?? 1),
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
