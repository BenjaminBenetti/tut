import type { ModelAssetId } from "../../content/data/model-ids";
import type { SettlementScale } from "../../content/model/settlement-scale";
import { SETTLEMENT_SCALES } from "../../content/model/settlement-scale";
import type { DeployableTypeId } from "../../overworld/model/deployable-type";
import type { SettlementStyleId } from "../model/settlement-style";
import { SETTLEMENT_STYLE_IDS } from "../model/settlement-style";

// ===========================================
// Settlements
// ===========================================

/**
 * The settlement model drawn for a city of a given regional style and
 * scale on the strategic map (#1152, #1155): ten families × three
 * scales, all on a 0.6 unit footprint with the pivot at the base centre.
 * The template literal is checked against `MODEL_IDS`, so an id missing
 * from the manifest fails to compile.
 */
export function settlementModelId(
  style: SettlementStyleId,
  scale: SettlementScale,
): ModelAssetId {
  return `overworld.settlement.${style}.${scale}`;
}

/**
 * The egg overlay stacked on a settlement while an infestation-clearance
 * mission is on offer there (#1155). Built from the same dressed layout
 * as the base, sharing its origin, so it is added at the same position.
 */
export function settlementEggsModelId(
  style: SettlementStyleId,
  scale: SettlementScale,
): ModelAssetId {
  return `overworld.settlement-eggs.${style}.${scale}`;
}

/** Every settlement model and egg overlay, style-major then scale. */
export const SETTLEMENT_MODEL_IDS: readonly ModelAssetId[] =
  SETTLEMENT_STYLE_IDS.flatMap((style) =>
    SETTLEMENT_SCALES.flatMap((scale) => [
      settlementModelId(style, scale),
      settlementEggsModelId(style, scale),
    ]),
  );

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
  ...SETTLEMENT_MODEL_IDS,
  ...Object.values(DEPLOYABLE_MODEL_IDS),
];
