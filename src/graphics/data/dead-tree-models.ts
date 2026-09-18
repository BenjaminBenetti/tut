import type { ModelAssetId } from "../../content/data/model-ids";

/** Leafless species variants retain each living tree's footprint and base pivot. */
export const DEAD_TREE_MODELS: Readonly<
  Partial<Record<ModelAssetId, ModelAssetId>>
> = {
  "prop.tree-oak": "prop.tree-oak-dead",
  "prop.tree-pine": "prop.tree-pine-dead",
  "prop.tree-palm": "prop.tree-palm-dead",
  "prop.tree-tropical-almond": "prop.tree-tropical-almond-dead",
  "prop.tree-oil-palm": "prop.tree-oil-palm-dead",
  "prop.tree-tuart": "prop.tree-tuart-dead",
  "prop.banksia": "prop.banksia-dead",
  "prop.grass-tree": "prop.grass-tree-dead",
};
