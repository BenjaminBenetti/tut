import type { ModelAssetId } from "../../content/data/model-ids";
import type { SettlementScale } from "../../content/model/settlement-scale";
import type { DeployableTypeId } from "../../overworld/model/deployable-type";

// ===========================================
// Settlements
// ===========================================

/**
 * The settlement model drawn for a city of each scale on the strategic
 * map (#1152, #1155): a hamlet, a town and a city block, all on a 0.6
 * unit footprint with the pivot at the base centre.
 */
export const SETTLEMENT_MODEL_IDS: Readonly<
  Record<SettlementScale, ModelAssetId>
> = {
  rural: "overworld.settlement.rural",
  town: "overworld.settlement.town",
  city: "overworld.settlement.city",
};

/**
 * The egg overlay stacked on a settlement of each scale while an
 * infestation-clearance mission is on offer there (#1155). Authored to
 * share the base model's origin, so it is added at the same position
 * and nothing is offset.
 */
export const SETTLEMENT_EGGS_MODEL_IDS: Readonly<
  Record<SettlementScale, ModelAssetId>
> = {
  rural: "overworld.settlement-eggs.rural",
  town: "overworld.settlement-eggs.town",
  city: "overworld.settlement-eggs.city",
};

// ===========================================
// Deployables
// ===========================================

/**
 * The installation model drawn for each deployable type (#1153, #1155).
 * Every GLB has a `base` node with an `animated` child whose `rotation.y`
 * the map turns: barrels, a nozzle, a dish.
 */
export const DEPLOYABLE_MODEL_IDS: Readonly<
  Record<DeployableTypeId, ModelAssetId>
> = {
  "defensive-battery": "overworld.deployable.defensive-battery",
  "repellent-dispersal": "overworld.deployable.repellent-dispersal",
  "sensor-array": "overworld.deployable.sensor-array",
};

/** Name of the GLB node a deployable's moving part turns on. */
export const DEPLOYABLE_ANIMATED_NODE = "animated";

// ===========================================
// Preload
// ===========================================

/** Every model the strategic map can draw, for preloading before the first frame. */
export const OVERWORLD_MODEL_IDS: readonly ModelAssetId[] = [
  ...Object.values(SETTLEMENT_MODEL_IDS),
  ...Object.values(SETTLEMENT_EGGS_MODEL_IDS),
  ...Object.values(DEPLOYABLE_MODEL_IDS),
];
