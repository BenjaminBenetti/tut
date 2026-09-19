import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from "three";
import type { Object3D } from "three";

import type { PartId } from "../../roster/model/mech-part";
import { partModels } from "../data/part-model-table";
import type { ModelLoader } from "../model/model-loader";

// ===========================================
// Types
// ===========================================

/** What the source needs. */
export interface TechNodeModelSourceOptions {
  /** Loads part models; the app passes the manifest loader, tests a stub. */
  readonly models: ModelLoader;
}

// ===========================================
// Constants
// ===========================================

/**
 * Every node's model is scaled so its longest side is this many world
 * units: a pair of legs and a back-mounted mortar are very different
 * sizes on a mech, and on a pedestal they should read the same.
 */
export const NODE_MODEL_EXTENT = 1.6;

/** How far apart the two arms of a pair stand. */
const PAIR_HALF_GAP = 0.55;

/** The generic module drawn for a part with no model of its own. */
const MODULE_SIZE = { w: 0.9, h: 0.45, d: 0.7 } as const;

/**
 * A module is a box, and a box normalised to the full extent reads as
 * a crate beside a pair of legs; it stands at this fraction instead.
 */
const MODULE_EXTENT_FRACTION = 0.6;

/** Body of the module: the panel colour, so it reads as equipment rather than a placeholder box. */
const MODULE_BODY_COLOUR = 0x1c2230;

/** Its lit strip: the info blue the palette's lights use. */
const MODULE_STRIP_COLOUR = 0x7fd1ff;

/** Name on the group a module stands in, for tests and the inspector. */
export const MODULE_MODEL_NAME = "tech-module";

// ===========================================
// TechNodeModelSource
// ===========================================

/**
 * The model that stands on a tech node's pedestal (#1171): the first of
 * the node's parts that the §7 part table maps to a model, drawn once
 * when it is a single model and as its left and right side by side when
 * it is a pair of arms. A utility — or any part with no model — stands
 * as a generic lit module instead, since utilities have no shape on the
 * field to borrow.
 *
 * ```
 *   partIds ──► partModels ──► single ──► load ──► normalise
 *                          └──► pair   ──► load ×2 ──► side by side ──► normalise
 *                          └──► none   ──► module
 * ```
 *
 * Every result is normalised: scaled so its longest side is
 * `NODE_MODEL_EXTENT`, centred over the origin and standing on y = 0.
 */
export class TechNodeModelSource {
  // ===========================================
  // Fields
  // ===========================================

  private readonly models: ModelLoader;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param options - The loader. */
  constructor(options: TechNodeModelSourceOptions) {
    this.models = options.models;
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * Loads the model standing for `partIds`, normalised.
   *
   * @param partIds - The node's parts; the first one with a model is drawn.
   * @returns A group ready to add to a pedestal.
   */
  async modelFor(partIds: readonly PartId[]): Promise<Object3D> {
    for (const partId of partIds) {
      const models = partModels(partId);
      if (models === undefined) {
        continue;
      }
      if (models.kind === "single") {
        return normalise(await this.models.load(models.model));
      }
      const [left, right] = await Promise.all([
        this.models.load(models.left),
        this.models.load(models.right),
      ]);
      const pair = new Group();
      pair.name = `pair:${partId}`;
      left.position.x = -PAIR_HALF_GAP;
      right.position.x = PAIR_HALF_GAP;
      pair.add(left, right);
      return normalise(pair);
    }
    return normalise(
      createModule(),
      NODE_MODEL_EXTENT * MODULE_EXTENT_FRACTION,
    );
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * Scales `object` so its longest side is `extent`, then centres it over
 * the origin with its feet on the ground.
 *
 * @param object - A freshly loaded model or group.
 * @param extent - The longest side after scaling; the node extent by default.
 * @returns A wrapping group; the object itself is left as loaded.
 */
function normalise(
  object: Object3D,
  extent: number = NODE_MODEL_EXTENT,
): Object3D {
  const wrapper = new Group();
  wrapper.name = `node-model:${object.name}`;
  wrapper.add(object);
  const box = new Box3().setFromObject(object);
  if (box.isEmpty()) {
    return wrapper;
  }
  const size = box.getSize(new Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  const scale = longest > 0 ? extent / longest : 1;
  object.scale.setScalar(scale);
  const centre = box.getCenter(new Vector3());
  object.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale);
  return wrapper;
}

/** The generic module: a dark body with a lit strip along its top. */
function createModule(): Object3D {
  const module = new Group();
  module.name = MODULE_MODEL_NAME;
  const body = new Mesh(
    new BoxGeometry(MODULE_SIZE.w, MODULE_SIZE.h, MODULE_SIZE.d),
    new MeshStandardMaterial({ color: MODULE_BODY_COLOUR, roughness: 0.6 }),
  );
  body.position.y = MODULE_SIZE.h / 2;
  const strip = new Mesh(
    new BoxGeometry(MODULE_SIZE.w * 0.7, 0.04, 0.08),
    new MeshStandardMaterial({
      color: MODULE_STRIP_COLOUR,
      emissive: MODULE_STRIP_COLOUR,
      emissiveIntensity: 0.9,
    }),
  );
  strip.position.set(0, MODULE_SIZE.h + 0.02, MODULE_SIZE.d * 0.25);
  module.add(body, strip);
  return module;
}
