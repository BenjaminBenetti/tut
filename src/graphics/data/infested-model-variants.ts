import type { ModelAssetId } from "../../content/data/model-ids";
import type { PropModelVariant } from "../model/prop-model-variant";

/** Infested art preserves the original footprint, wall opening and gameplay role. */
export const INFESTED_MODEL_VARIANTS: Readonly<
  Partial<Record<ModelAssetId, PropModelVariant>>
> = {
  "prop.car-compact": { modelId: "prop.car-compact-infested", turns: 0 },
  "prop.car-sedan": { modelId: "prop.car-infested", turns: 0 },
  "prop.car-hatchback": { modelId: "prop.car-hatchback-infested", turns: 0 },
  "prop.car-utility": { modelId: "prop.car-utility-infested", turns: 0 },
  "prop.dumpster": { modelId: "prop.dumpster-infested", turns: 0 },
  "prop.barrier-concrete": {
    modelId: "prop.barrier-concrete-infested",
    turns: 0,
  },
  "prop.planter": { modelId: "prop.planter-infested", turns: 0 },
  "prop.bench": { modelId: "prop.bench-infested", turns: 0 },
  "prop.fence": { modelId: "prop.fence-infested", turns: 0 },
  "prop.crate": { modelId: "prop.crate-infested", turns: 0 },
  "prop.lamp-post": { modelId: "prop.lamp-post-infested", turns: 0 },
  "building.wall": { modelId: "building.wall-solid-infested", turns: 0 },
  "building.wall-concrete": {
    modelId: "building.wall-concrete-breached",
    turns: 0,
  },
  "building.wall-panel": { modelId: "building.wall-panel-breached", turns: 0 },
  "building.wall-plaster": {
    modelId: "building.wall-plaster-breached",
    turns: 0,
  },
  "building.wall-window": {
    modelId: "building.wall-window-infested",
    turns: 0,
  },
  "building.wall-window-concrete": {
    modelId: "building.wall-window-concrete-infested",
    turns: 0,
  },
  "building.wall-window-panel": {
    modelId: "building.wall-window-panel-infested",
    turns: 0,
  },
  "building.wall-window-plaster": {
    modelId: "building.wall-window-plaster-infested",
    turns: 0,
  },
  "building.wall-door": { modelId: "building.wall-door-infested", turns: 0 },
  "building.wall-door-concrete": {
    modelId: "building.wall-door-concrete-infested",
    turns: 0,
  },
  "building.wall-door-panel": {
    modelId: "building.wall-door-panel-infested",
    turns: 0,
  },
  "building.wall-door-plaster": {
    modelId: "building.wall-door-plaster-infested",
    turns: 0,
  },
  "building.wall-half": { modelId: "building.wall-half-infested", turns: 0 },
  "building.wall-half-concrete": {
    modelId: "building.wall-half-infested",
    turns: 0,
  },
};
