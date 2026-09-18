import type { ModelAssetId } from "../../content/data/model-ids";
import type { PropModelVariant } from "../model/prop-model-variant";

/** Infested art preserves the original footprint, wall opening and gameplay role. */
export const INFESTED_MODEL_VARIANTS: Readonly<
  Partial<Record<ModelAssetId, PropModelVariant>>
> = {
  "prop.car-compact": { modelId: "prop.car-compact-infested", turns: 0 },
  "prop.car-sedan": { modelId: "prop.car-infested", turns: 0 },
  "prop.car-hatchback": { modelId: "prop.car-infested", turns: 3 },
  "prop.car-utility": { modelId: "prop.car-infested", turns: 3 },
  "prop.lamp-post": { modelId: "prop.lamp-post-infested", turns: 0 },
  "building.wall": { modelId: "building.wall-solid-infested", turns: 0 },
  "building.wall-concrete": {
    modelId: "building.wall-solid-infested",
    turns: 0,
  },
  "building.wall-panel": { modelId: "building.wall-solid-infested", turns: 0 },
  "building.wall-plaster": {
    modelId: "building.wall-solid-infested",
    turns: 0,
  },
  "building.wall-window": {
    modelId: "building.wall-window-infested",
    turns: 0,
  },
  "building.wall-window-concrete": {
    modelId: "building.wall-window-infested",
    turns: 0,
  },
  "building.wall-window-panel": {
    modelId: "building.wall-window-infested",
    turns: 0,
  },
  "building.wall-window-plaster": {
    modelId: "building.wall-window-infested",
    turns: 0,
  },
  "building.wall-door": { modelId: "building.wall-door-infested", turns: 0 },
  "building.wall-door-concrete": {
    modelId: "building.wall-door-infested",
    turns: 0,
  },
  "building.wall-door-panel": {
    modelId: "building.wall-door-infested",
    turns: 0,
  },
  "building.wall-door-plaster": {
    modelId: "building.wall-door-infested",
    turns: 0,
  },
  "building.wall-half": { modelId: "building.wall-half-infested", turns: 0 },
  "building.wall-half-concrete": {
    modelId: "building.wall-half-infested",
    turns: 0,
  },
};
