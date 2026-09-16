import type { Object3D } from "three";

import type { ModelAssetId } from "../../content/data/model-ids";

/**
 * Restyles a freshly parsed model before it is cached (#1155). A loader
 * calls it once per id on the prototype, so every clone handed out
 * afterwards shares the result; a placeholder never passes through it.
 * The dresser decides by id which models it touches and leaves the
 * rest exactly as authored.
 */
export interface ModelDresser {
  /**
   * Restyles `model` in place.
   *
   * @param id - The model's manifest id.
   * @param model - The parsed scene root, materials as the file authored them.
   */
  dress(id: ModelAssetId, model: Object3D): void;
}
