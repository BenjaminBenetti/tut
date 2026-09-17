import type { ModelAssetId } from "../../content/data/model-ids";

/**
 * Complete host replacements, authored against the original geometry at three stages.
 * Built by tools/art/build-infested-models.py; unsupported models retain their own art.
 */
export const INFESTED_MODEL_VARIANTS: Readonly<
  Partial<
    Record<ModelAssetId, readonly [ModelAssetId, ModelAssetId, ModelAssetId]>
  >
> = {
  "building.wall": [
    "building.wall-infested-1",
    "building.wall-infested-2",
    "building.wall-infested-3",
  ],
  "building.wall-window": [
    "building.wall-window-infested-1",
    "building.wall-window-infested-2",
    "building.wall-window-infested-3",
  ],
  "building.wall-door": [
    "building.wall-door-infested-1",
    "building.wall-door-infested-2",
    "building.wall-door-infested-3",
  ],
  "building.wall-concrete": [
    "building.wall-concrete-infested-1",
    "building.wall-concrete-infested-2",
    "building.wall-concrete-infested-3",
  ],
  "building.wall-window-concrete": [
    "building.wall-window-concrete-infested-1",
    "building.wall-window-concrete-infested-2",
    "building.wall-window-concrete-infested-3",
  ],
  "building.wall-door-concrete": [
    "building.wall-door-concrete-infested-1",
    "building.wall-door-concrete-infested-2",
    "building.wall-door-concrete-infested-3",
  ],
  "building.wall-panel": [
    "building.wall-panel-infested-1",
    "building.wall-panel-infested-2",
    "building.wall-panel-infested-3",
  ],
  "building.wall-window-panel": [
    "building.wall-window-panel-infested-1",
    "building.wall-window-panel-infested-2",
    "building.wall-window-panel-infested-3",
  ],
  "building.wall-door-panel": [
    "building.wall-door-panel-infested-1",
    "building.wall-door-panel-infested-2",
    "building.wall-door-panel-infested-3",
  ],
  "building.wall-plaster": [
    "building.wall-plaster-infested-1",
    "building.wall-plaster-infested-2",
    "building.wall-plaster-infested-3",
  ],
  "building.wall-window-plaster": [
    "building.wall-window-plaster-infested-1",
    "building.wall-window-plaster-infested-2",
    "building.wall-window-plaster-infested-3",
  ],
  "building.wall-door-plaster": [
    "building.wall-door-plaster-infested-1",
    "building.wall-door-plaster-infested-2",
    "building.wall-door-plaster-infested-3",
  ],
  "building.wall-half": [
    "building.wall-half-infested-1",
    "building.wall-half-infested-2",
    "building.wall-half-infested-3",
  ],
  "building.wall-half-concrete": [
    "building.wall-half-concrete-infested-1",
    "building.wall-half-concrete-infested-2",
    "building.wall-half-concrete-infested-3",
  ],
  "prop.car-sedan": [
    "prop.car-sedan-infested-1",
    "prop.car-sedan-infested-2",
    "prop.car-sedan-infested-3",
  ],
  "prop.car-compact": [
    "prop.car-compact-infested-1",
    "prop.car-compact-infested-2",
    "prop.car-compact-infested-3",
  ],
  "prop.car-hatchback": [
    "prop.car-hatchback-infested-1",
    "prop.car-hatchback-infested-2",
    "prop.car-hatchback-infested-3",
  ],
  "prop.car-utility": [
    "prop.car-utility-infested-1",
    "prop.car-utility-infested-2",
    "prop.car-utility-infested-3",
  ],
  "prop.tree-oak": [
    "prop.tree-oak-infested-1",
    "prop.tree-oak-infested-2",
    "prop.tree-oak-infested-3",
  ],
  "prop.tree-pine": [
    "prop.tree-pine-infested-1",
    "prop.tree-pine-infested-2",
    "prop.tree-pine-infested-3",
  ],
  "prop.rooftop-hvac": [
    "prop.rooftop-hvac-infested-1",
    "prop.rooftop-hvac-infested-2",
    "prop.rooftop-hvac-infested-3",
  ],
};
