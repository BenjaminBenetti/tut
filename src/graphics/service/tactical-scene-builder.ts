import type { Camera, Object3D } from "three";
import { Group, Raycaster, Vector2 } from "three";

import type { Vec2, Vec3 } from "../../core/model/grid";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { Unit, UnitId } from "../../tactical/model/unit";
import type {
  UnitTemplate,
  UnitTemplateId,
} from "../../tactical/model/unit-template";
import type { Disposable } from "../model/disposable";
import type { ModelLoader } from "../model/model-loader";
import type { TilePicker } from "../model/tile-picker";
import type { UnitPicker } from "../model/unit-picker";
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
 * `UnitPicker` the picking controller hit-tests through.
 *
 * ```
 *   update(units, templates)
 *     ├─ gone or hp ≤ 0 ──► mesh.dispose()
 *     ├─ known           ──► mesh.setPose(pos, facing)
 *     └─ new             ──► models.load(template.modelId) ──► UnitMesh (unless removed meanwhile)
 *
 *   pickUnit(ndc) ──► raycast over every mesh's pick targets ──► nearest hit's unit
 * ```
 */
export class TacticalSceneBuilder
  implements UnitPicker, TilePicker, Disposable
{
  // ===========================================
  // Fields
  // ===========================================

  /** Add this to the scene: the map and the units. */
  readonly root: Group;
  private readonly mapView: TacticalMapView;
  private readonly models: ModelLoader;
  private readonly unitsGroup: Group;
  private readonly meshes = new Map<UnitId, UnitMesh>();
  private readonly targetToUnit = new Map<Object3D, UnitId>();
  /** Units the latest `update` asked for; a load that finishes for a unit no longer here is discarded. */
  private readonly wanted = new Set<UnitId>();
  private readonly raycaster = new Raycaster();
  private hovered: UnitId | undefined;
  private selected: UnitId | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /** Builds the map immediately; units arrive through `update`. */
  constructor(options: TacticalSceneBuilderOptions) {
    this.models = options.models;
    this.mapView = new TacticalMapView(options.map);
    this.unitsGroup = new Group();
    this.unitsGroup.name = "units";
    this.root = new Group();
    this.root.name = "tactical-scene";
    this.root.add(this.mapView.root, this.unitsGroup);
  }

  // ===========================================
  // Public Methods
  // ===========================================

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

  /** Frees the map, every unit mesh and detaches the root. */
  dispose(): void {
    for (const id of [...this.meshes.keys()]) {
      this.remove(id);
    }
    this.wanted.clear();
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
    for (const target of mesh.pickTargets()) {
      this.targetToUnit.set(target, unit.id);
    }
    this.unitsGroup.add(mesh.object);
    this.applyHighlights();
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
