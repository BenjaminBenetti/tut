import type { Object3D } from "three";
import { Group } from "three";

import type { Unit, UnitId } from "../../tactical/model/unit";
import { turretBurnedOut, turretIsActive } from "../../tactical/model/turret";
import { RADAR_SMOKE } from "../data/smoke-plumes";
import type { Disposable } from "../model/disposable";
import type { FrameUpdatable } from "../model/frame-updatable";
import type { ModelLoader } from "../model/model-loader";
import { createFalloffTexture } from "../service/falloff-texture";
import { SmokePlume } from "./smoke-plume";
import { FACING_YAW } from "./unit-mesh";
import { tileTopCentre } from "./tactical-map-view";

// ===========================================
// Constants
// ===========================================

/** Model id of the turret (#1138); the placeholder GLB from `tools/art/build-placeholders.mjs`. */
export const TURRET_MODEL_ID = "tdf.turret";

/** Name of the GLB node the gun turns on; the whole model when a load fell back to a box. */
export const TURRET_GUN_NAME = "gun";

/** Name of a burnt-out turret's husk, for tests and scene inspection. */
export const TURRET_HUSK_NAME = "turret-husk";

/** Name of a burnt-out turret's smoke plume, for tests and scene inspection. */
export const TURRET_SMOKE_NAME = "turret-smoke";

/** Radians the gun swings either side of its rest while the battery holds. */
export const GUN_SWEEP_ARC = Math.PI / 4;

/** Radians per second of the sweep's phase: one full left-right-left in eight seconds. */
export const GUN_SWEEP_RATE = (2 * Math.PI) / 8;

// ===========================================
// Types
// ===========================================

/** A burnt-out turret left on the map: its model at its tile, smoking. */
interface DrawnHusk {
  readonly root: Object3D;
  readonly smoke: SmokePlume;
}

// ===========================================
// Turret view
// ===========================================

/**
 * What a turret does on screen that a unit mesh does not (#1138). A
 * living turret is drawn by the scene builder like any unit — its model
 * is `tdf.turret`, loaded through the unit model source — and this
 * view only *animates* it: while its battery holds, its gun sweeps
 * slowly left and right, the way a scanner's dish turns. A turret whose
 * battery ran out is dead to the rules (hit points zero) and the scene
 * builder removes its mesh as it removes any corpse, so this view puts
 * a **husk** back on the tile — the same model, still, with a plume of
 * smoke off the gun (`SmokePlume`, the radar's preset) — for as long as
 * the mission holds the burnt-out unit. A turret the bugs destroyed
 * gets no husk: it died like a unit and leaves like one.
 *
 * ```
 *   updateTurrets(units) ──► living turrets remembered for the sweep;
 *                            burnt-out ones get a husk placed / kept / removed
 *   update(dt)           ──► every living gun sweeps; every husk smokes
 * ```
 *
 * Observes state only: the battery is the mission's, read from each
 * unit on every update, so a resumed save shows a dead turret dead.
 */
export class TurretView implements FrameUpdatable, Disposable {
  // ===========================================
  // Fields
  // ===========================================

  readonly root = new Group();
  private readonly husks = new Map<UnitId, DrawnHusk>();
  private wantedHusks = new Set<UnitId>();
  /** Living turrets whose guns sweep, with the phase each sweep has reached. */
  private readonly sweeping = new Map<UnitId, number>();
  /** Soft disc every smoke puff is cut from; owned here, shared by every plume. */
  private readonly smokeFalloff = createFalloffTexture();

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param models - Loads the husk model; the shared loader owns its materials.
   * @param drawnUnit - The scene's object for a living unit, whose gun the sweep turns; undefined while it loads.
   */
  constructor(
    private readonly models: ModelLoader,
    private readonly drawnUnit: (unitId: UnitId) => Object3D | undefined,
  ) {
    this.root.name = "turrets";
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Counts sweeping guns and placed husks for the scene's diagnostic readout. */
  counts(): { sweeping: number; husks: number } {
    return { sweeping: this.sweeping.size, husks: this.husks.size };
  }

  /**
   * Brings the view in step with the mission's units: every living
   * turret sweeps, every burnt-out one has a husk, and nothing else is
   * kept. Resolves once every newly needed husk model has loaded.
   */
  async updateTurrets(units: readonly Unit[]): Promise<void> {
    const living = new Set(
      units.filter((unit) => turretIsActive(unit)).map((unit) => unit.id),
    );
    for (const id of [...this.sweeping.keys()]) {
      if (!living.has(id)) {
        this.sweeping.delete(id);
      }
    }
    for (const id of living) {
      if (!this.sweeping.has(id)) {
        this.sweeping.set(id, 0);
      }
    }
    const burnt = units.filter((unit) => turretBurnedOut(unit));
    this.wantedHusks = new Set(burnt.map((unit) => unit.id));
    for (const [id, husk] of this.husks) {
      if (!this.wantedHusks.has(id)) {
        this.removeHusk(id, husk);
      }
    }
    await Promise.all(burnt.map((unit) => this.placeHusk(unit)));
  }

  /** Sweeps every living gun and breathes every husk's smoke. */
  update(deltaSeconds: number): void {
    for (const [id, phase] of this.sweeping) {
      const next = (phase + GUN_SWEEP_RATE * deltaSeconds) % (2 * Math.PI);
      this.sweeping.set(id, next);
      const gun = gunOf(this.drawnUnit(id));
      if (gun !== undefined) {
        gun.rotation.y = GUN_SWEEP_ARC * Math.sin(next);
      }
    }
    for (const husk of this.husks.values()) {
      husk.smoke.update(deltaSeconds);
    }
  }

  /** Cancels late loads and frees only what this view owns; the models' materials are the loader's. */
  dispose(): void {
    this.wantedHusks.clear();
    this.sweeping.clear();
    for (const [id, husk] of this.husks) {
      this.removeHusk(id, husk);
    }
    this.root.clear();
    this.root.removeFromParent();
    this.smokeFalloff.dispose();
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Places one husk, discarding a load when the view no longer wants it. */
  private async placeHusk(unit: Unit): Promise<void> {
    if (this.husks.has(unit.id)) {
      return;
    }
    const model = await this.models.load(TURRET_MODEL_ID);
    if (!this.wantedHusks.has(unit.id) || this.husks.has(unit.id)) {
      return;
    }
    const at = tileTopCentre(unit.pos);
    model.position.set(at.x, at.y, at.z);
    model.rotation.y = FACING_YAW[unit.facing];
    model.name = `${TURRET_HUSK_NAME}:${unit.id}`;
    const smoke = new SmokePlume(
      RADAR_SMOKE,
      this.smokeFalloff,
      TURRET_SMOKE_NAME,
    );
    model.add(smoke.root);
    this.husks.set(unit.id, { root: model, smoke });
    this.root.add(model);
  }

  /** Removes one husk and frees the materials its smoke owned. */
  private removeHusk(id: UnitId, husk: DrawnHusk): void {
    husk.smoke.dispose();
    husk.root.removeFromParent();
    this.husks.delete(id);
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * The node the gun turns on: the GLB's `gun` group, whose origin is the
 * mount. A model without one — the placeholder box a failed load falls
 * back to — has nothing to sweep, and the turret stands still rather
 * than spinning its whole body.
 */
function gunOf(drawn: Object3D | undefined): Object3D | undefined {
  return drawn?.getObjectByName(TURRET_GUN_NAME);
}
