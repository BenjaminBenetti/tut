import type { Camera, Object3D } from "three";
import { Box3, Group, Raycaster, Vector2 } from "three";

import type { Vec2, Vec3 } from "../../core/model/grid";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { SideVision } from "../../tactical/model/tactical-state";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { Spawner, SpawnerId } from "../../tactical/model/tactical-state";
import type { Unit, UnitId } from "../../tactical/model/unit";
import type {
  UnitTemplate,
  UnitTemplateId,
} from "../../tactical/model/unit-template";
import type { Disposable } from "../model/disposable";
import type { ModelLoader } from "../model/model-loader";
import type { SpawnerPicker } from "../model/spawner-picker";
import type { TilePicker } from "../model/tile-picker";
import type { UnitPicker } from "../model/unit-picker";
import type { GhostUniforms } from "./ghost-cutaway";
import { createGhostUniforms } from "./ghost-cutaway";
import { TacticalMapView } from "../view/tactical-map-view";
import { UnitMesh } from "../view/unit-mesh";

// ===========================================
// Types
// ===========================================

/** What the builder is composed from. */
export interface TacticalSceneBuilderOptions {
  readonly map: TacticalMap;
  /** Resolves `UnitTemplate.modelId` to models; one prototype per id is fetched and cloned per unit. */
  readonly models: ModelLoader;
}

/**
 * Model every egg spawner is drawn with. Spawners carry no per-instance
 * model the way units carry `template.modelId`, so the scene holds the
 * one id (#484).
 */
export const SPAWNER_MODEL_ID = "bug.egg-spawner";

/** Templates by id, as the mission state stores them. */
export type UnitTemplateLookup = Readonly<Record<UnitTemplateId, UnitTemplate>>;

// ===========================================
// Builder
// ===========================================

/**
 * Builds the tactical scene: #31's map view plus one `UnitMesh` per
 * living unit, kept in step with the tactical state by `update`.
 * Graphics observes state only (architecture §2): a unit that leaves the
 * list or reaches zero hit points is removed, a moved unit is re-posed,
 * a new unit's model is loaded by its template's `modelId`. Also the
 * `UnitPicker` and `SpawnerPicker` the picking controller hit-tests
 * through. Spawners reuse `UnitMesh`: it is a model at a tile with hover
 * and selection rings, which is exactly what a spawner needs.
 *
 * ```
 *   update(units, templates)
 *     ├─ gone or hp ≤ 0 ──► mesh.dispose()
 *     ├─ known           ──► mesh.setPose(pos, facing)
 *     └─ new             ──► models.load(template.modelId) ──► UnitMesh (unless removed meanwhile)
 *
 *   updateSpawners(spawners)
 *     ├─ destroyed or gone ──► mesh.dispose()
 *     └─ new               ──► models.load(SPAWNER_MODEL_ID) ──► UnitMesh
 *
 *   pickUnit(ndc)    ──► raycast the unit meshes    ──► nearest hit's unit
 *   pickSpawner(ndc) ──► raycast the spawner meshes ──► nearest hit's spawner
 * ```
 */
/**
 * Cutaway radius in world units and the alpha a fully cut-away wall
 * keeps. Roughly three tiles across, so the unit and the ground it is
 * fighting over both stay visible, and a floor rather than zero so the
 * wall still reads as a wall.
 */
const GHOST_RADIUS = 3;
const GHOST_FLOOR = 0.18;

/**
 *
 */
export class TacticalSceneBuilder
  implements UnitPicker, TilePicker, SpawnerPicker, Disposable
{
  // ===========================================
  // Fields
  // ===========================================

  /** Add this to the scene: the map and the units. */
  readonly root: Group;
  private readonly mapView: TacticalMapView;
  /** Cutaway uniforms every ghosted wall material shares (#526). */
  private readonly ghostUniforms: GhostUniforms;
  private readonly models: ModelLoader;
  private readonly unitsGroup: Group;
  private readonly meshes = new Map<UnitId, UnitMesh>();
  /** Model id per placed unit, so a death burst can tell a machine from a bug. */
  private readonly modelIds = new Map<UnitId, string>();
  /** Height per placed unit in world units, measured once when it is placed. */
  private readonly heights = new Map<UnitId, number>();
  private readonly targetToUnit = new Map<Object3D, UnitId>();
  /** Units the latest `update` asked for; a load that finishes for a unit no longer here is discarded. */
  private readonly wanted = new Set<UnitId>();
  private readonly spawnersGroup: Group;
  private readonly spawnerMeshes = new Map<SpawnerId, UnitMesh>();
  private readonly targetToSpawner = new Map<Object3D, SpawnerId>();
  /** Spawners the latest `updateSpawners` asked for, for the same reason as `wanted`. */
  private readonly wantedSpawners = new Set<SpawnerId>();
  private readonly raycaster = new Raycaster();
  private hovered: UnitId | undefined;
  private selected: UnitId | undefined;
  private hoveredSpawner: SpawnerId | undefined;
  private selectedSpawner: SpawnerId | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /** Builds the map immediately; units arrive through `update`. */
  constructor(options: TacticalSceneBuilderOptions) {
    this.models = options.models;
    this.ghostUniforms = createGhostUniforms(GHOST_RADIUS, GHOST_FLOOR);
    this.mapView = new TacticalMapView(options.map, this.ghostUniforms);
    this.unitsGroup = new Group();
    this.unitsGroup.name = "units";
    this.spawnersGroup = new Group();
    this.spawnersGroup.name = "spawners";
    this.root = new Group();
    this.root.name = "tactical-scene";
    this.root.add(this.mapView.root, this.spawnersGroup, this.unitsGroup);
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * The drawn unit objects the wall cutaway centres on (#526).
   *
   * The **objects the scene is already drawing**, not a list read from
   * the mission: the renderer only builds objects for units the player
   * may see, so ghosting can never cut a wall away around something
   * vision rules hide (ADR 0006).
   */
  ghostTargets(): readonly Object3D[] {
    return this.unitsGroup.children;
  }

  /** The cutaway uniforms, for the frame controller that updates them. */
  get ghosting(): GhostUniforms {
    return this.ghostUniforms;
  }

  /** Ground-plane centre of the map, where the camera should look. */
  get centre(): Vec3 {
    return this.mapView.centre;
  }

  /** Levels present, ascending. */
  get levels(): readonly number[] {
    return this.mapView.levels;
  }

  /** Shows only map levels up to `maxLevel`; units are never hidden. */
  setMaxLevel(maxLevel: number | undefined): void {
    this.mapView.setMaxLevel(maxLevel);
  }

  /**
   * Draws the map as one side knows it (#551): unexplored tiles absent,
   * explored-but-unseen ones dimmed. `undefined` shows the whole map,
   * which is what the mapgen preview wants.
   */
  setVision(vision: SideVision | undefined): void {
    this.mapView.setVision(vision);
  }

  /**
   * Upgrades the map from placeholder boxes to the registered tile,
   * building and prop art (#474). Separate from the constructor so the
   * scene is on screen immediately and the models arrive when they
   * arrive; the mapgen preview skips it and keeps its diagnostic
   * colours. Idempotent.
   */
  async loadMapModels(): Promise<void> {
    await this.mapView.loadModels(this.models);
  }

  /** Ids of the units currently drawn or loading, in insertion order. */
  unitIds(): readonly UnitId[] {
    return [...this.wanted];
  }

  /**
   * Brings the drawn units in step with `units`. Resolves once every
   * newly needed model has loaded and been placed. A template missing
   * from `templates` is a state bug and throws.
   */
  async update(
    units: readonly Unit[],
    templates: UnitTemplateLookup,
  ): Promise<void> {
    const living = units.filter((unit) => unit.hp > 0);
    const keep = new Set(living.map((unit) => unit.id));
    for (const id of [...this.wanted]) {
      if (!keep.has(id)) {
        this.remove(id);
      }
    }
    const loads: Promise<void>[] = [];
    for (const unit of living) {
      const existing = this.meshes.get(unit.id);
      if (existing) {
        existing.setPose(unit.pos, unit.facing);
        continue;
      }
      if (this.wanted.has(unit.id)) {
        continue;
      }
      const template = templates[unit.templateId];
      if (template === undefined) {
        throw new Error(
          `Unit "${unit.id}" references unknown template "${unit.templateId}"`,
        );
      }
      this.wanted.add(unit.id);
      loads.push(this.place(unit, template));
    }
    await Promise.all(loads);
  }

  /** Ids of the spawners currently drawn or loading, in insertion order. */
  spawnerIds(): readonly SpawnerId[] {
    return [...this.wantedSpawners];
  }

  /**
   * Brings the drawn egg spawners in step with `spawners` (#484). A
   * spawner that is destroyed — or gone from the list — is removed, the
   * way a dead unit is; the rest are placed once and never move, so
   * there is no re-pose step. Resolves when every new model has loaded.
   *
   * Kept apart from `update` because spawners are not units: they have
   * no template, no facing that changes, and they live in their own
   * collection on the mission state.
   */
  async updateSpawners(spawners: readonly Spawner[]): Promise<void> {
    const standing = spawners.filter(
      (spawner) => !spawner.destroyed && spawner.hp > 0,
    );
    const keep = new Set(standing.map((spawner) => spawner.id));
    for (const id of [...this.wantedSpawners]) {
      if (!keep.has(id)) {
        this.removeSpawner(id);
      }
    }
    const loads: Promise<void>[] = [];
    for (const spawner of standing) {
      if (this.wantedSpawners.has(spawner.id)) {
        continue;
      }
      this.wantedSpawners.add(spawner.id);
      loads.push(this.placeSpawner(spawner));
    }
    await Promise.all(loads);
  }

  /** Frees the map, every unit mesh and detaches the root. */
  dispose(): void {
    for (const id of [...this.meshes.keys()]) {
      this.remove(id);
    }
    this.wanted.clear();
    for (const id of [...this.spawnerMeshes.keys()]) {
      this.removeSpawner(id);
    }
    this.wantedSpawners.clear();
    this.mapView.dispose();
    this.root.removeFromParent();
  }

  // ===========================================
  // UnitPicker
  // ===========================================

  /** Raycasts the unit models under a normalised device coordinate; the nearest hit wins. */
  pickUnit(ndc: Vec2, camera: Camera): UnitId | undefined {
    if (this.targetToUnit.size === 0) {
      return undefined;
    }
    this.root.updateMatrixWorld(true);
    this.raycaster.setFromCamera(new Vector2(ndc.x, ndc.y), camera);
    const hits = this.raycaster.intersectObjects(
      [...this.targetToUnit.keys()],
      false,
    );
    for (const hit of hits) {
      const unitId = this.targetToUnit.get(hit.object);
      if (unitId !== undefined) {
        return unitId;
      }
    }
    return undefined;
  }

  /** Highlights one unit as hovered, or none. */
  setHovered(unitId: UnitId | undefined): void {
    this.hovered = unitId;
    this.applyHighlights();
  }

  /** Marks one unit as selected, or none. */
  setSelected(unitId: UnitId | undefined): void {
    this.selected = unitId;
    this.applyHighlights();
  }

  /** The selected unit, if any. */
  getSelected(): UnitId | undefined {
    return this.selected;
  }

  /** A unit's feet in world space, or undefined for an unknown or still-loading unit. */
  unitWorldPosition(unitId: UnitId): Vec3 | undefined {
    return this.meshes.get(unitId)?.worldPosition();
  }

  /** The unit's scene object for animation, or undefined once removed or while loading. */
  unitObject(unitId: UnitId): Object3D | undefined {
    return this.meshes.get(unitId)?.object;
  }

  /**
   * The unit's height in world units, measured from its placed model, or
   * undefined while it loads. The animation queue anchors damage numbers and
   * impacts off this instead of a fixed lift above the feet, which put them
   * inside the legs of anything large (#514). Measured rather than read from
   * the manifest so this class keeps depending on the injected loader alone.
   */
  unitHeight(unitId: UnitId): number | undefined {
    return this.heights.get(unitId);
  }

  /** The unit's registered model id, or undefined while it loads. */
  unitModelId(unitId: UnitId): string | undefined {
    return this.modelIds.get(unitId);
  }

  // ===========================================
  // SpawnerPicker
  // ===========================================

  /** Raycasts the spawner models under a normalised device coordinate; nearest hit wins. */
  pickSpawner(ndc: Vec2, camera: Camera): SpawnerId | undefined {
    if (this.targetToSpawner.size === 0) {
      return undefined;
    }
    this.root.updateMatrixWorld(true);
    this.raycaster.setFromCamera(new Vector2(ndc.x, ndc.y), camera);
    const hits = this.raycaster.intersectObjects(
      [...this.targetToSpawner.keys()],
      false,
    );
    for (const hit of hits) {
      const spawnerId = this.targetToSpawner.get(hit.object);
      if (spawnerId !== undefined) {
        return spawnerId;
      }
    }
    return undefined;
  }

  /** Highlights one spawner as hovered, or none. */
  setHoveredSpawner(spawnerId: SpawnerId | undefined): void {
    this.hoveredSpawner = spawnerId;
    this.applySpawnerHighlights();
  }

  /** Marks one spawner as targeted, or none. */
  setSelectedSpawner(spawnerId: SpawnerId | undefined): void {
    this.selectedSpawner = spawnerId;
    this.applySpawnerHighlights();
  }

  /** A spawner's base in world space, or undefined while it is loading or gone. */
  spawnerWorldPosition(spawnerId: SpawnerId): Vec3 | undefined {
    return this.spawnerMeshes.get(spawnerId)?.worldPosition();
  }

  // ===========================================
  // TilePicker
  // ===========================================

  /** The map tile under a normalised device coordinate; units do not occlude it. */
  pickTile(ndc: Vec2, camera: Camera): TileCoord | undefined {
    return this.mapView.pickTile(ndc, camera);
  }

  /** The world centre of a tile's top face, or undefined off the map. */
  tileWorldPosition(tile: TileCoord): Vec3 | undefined {
    return this.mapView.tileWorldPosition(tile);
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Loads the template's model and places the unit, unless it was removed while loading. */
  private async place(unit: Unit, template: UnitTemplate): Promise<void> {
    const model = await this.models.load(template.modelId);
    if (!this.wanted.has(unit.id)) {
      return;
    }
    const mesh = new UnitMesh(unit.id, model);
    mesh.setPose(unit.pos, unit.facing);
    this.meshes.set(unit.id, mesh);
    this.modelIds.set(unit.id, template.modelId);
    this.heights.set(unit.id, measureHeight(mesh.object));
    for (const target of mesh.pickTargets()) {
      this.targetToUnit.set(target, unit.id);
    }
    this.unitsGroup.add(mesh.object);
    this.applyHighlights();
  }

  /** Loads the spawner model and places it, unless it was removed while loading. */
  private async placeSpawner(spawner: Spawner): Promise<void> {
    const model = await this.models.load(SPAWNER_MODEL_ID);
    if (!this.wantedSpawners.has(spawner.id)) {
      return;
    }
    const mesh = new UnitMesh(spawner.id, model);
    // A spawner does not turn; north is as good a rest pose as any.
    mesh.setPose(spawner.pos, "n");
    this.spawnerMeshes.set(spawner.id, mesh);
    for (const target of mesh.pickTargets()) {
      this.targetToSpawner.set(target, spawner.id);
    }
    this.spawnersGroup.add(mesh.object);
    this.applySpawnerHighlights();
  }

  /** Forgets a spawner: its mesh, pick targets and any pending load. */
  private removeSpawner(spawnerId: SpawnerId): void {
    this.wantedSpawners.delete(spawnerId);
    const mesh = this.spawnerMeshes.get(spawnerId);
    if (mesh) {
      for (const target of mesh.pickTargets()) {
        this.targetToSpawner.delete(target);
      }
      mesh.dispose();
      this.spawnerMeshes.delete(spawnerId);
    }
    if (this.hoveredSpawner === spawnerId) {
      this.hoveredSpawner = undefined;
    }
    if (this.selectedSpawner === spawnerId) {
      this.selectedSpawner = undefined;
    }
  }

  /** Pushes hovered and targeted state onto every spawner mesh. */
  private applySpawnerHighlights(): void {
    for (const [id, mesh] of this.spawnerMeshes) {
      mesh.setHighlight({
        hovered: id === this.hoveredSpawner,
        selected: id === this.selectedSpawner,
      });
    }
  }

  /** Forgets a unit: its mesh, pick targets and any pending load. */
  private remove(unitId: UnitId): void {
    this.wanted.delete(unitId);
    const mesh = this.meshes.get(unitId);
    if (mesh) {
      for (const target of mesh.pickTargets()) {
        this.targetToUnit.delete(target);
      }
      mesh.dispose();
      this.meshes.delete(unitId);
      this.modelIds.delete(unitId);
      this.heights.delete(unitId);
    }
    if (this.hovered === unitId) {
      this.hovered = undefined;
    }
    if (this.selected === unitId) {
      this.selected = undefined;
    }
  }

  /** Pushes hovered and selected state onto every mesh. */
  private applyHighlights(): void {
    for (const [id, mesh] of this.meshes) {
      mesh.setHighlight({
        hovered: id === this.hovered,
        selected: id === this.selected,
      });
    }
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * The world-space height of a placed unit, measured from its bounding box.
 * Taken once at placement: a dying unit shrinks, and an effect anchored to a
 * shrinking box would slide down with it.
 *
 * @param object - The unit's scene object.
 * @returns Height in world units, never negative.
 */
function measureHeight(object: Object3D): number {
  const box = new Box3().setFromObject(object);
  return Number.isFinite(box.max.y - box.min.y)
    ? Math.max(0, box.max.y - box.min.y)
    : 0;
}
