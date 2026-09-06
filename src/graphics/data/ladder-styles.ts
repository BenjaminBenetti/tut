import type { ModelAssetId } from "../../content/data/model-ids";
import type { LadderFinish } from "../model/ladder-appearance";
import { HALF_WALL_MODELS, WALL_MODELS } from "./map-model-table";

/**
 * The authored UVs sample env-metal, column 2 / row 1 of the environment
 * atlas. Env-rust is its neighbour in column 3; only U changes. Both finishes
 * retain the same borrowed atlas material and its roughness (#891).
 */
export const LADDER_ATLAS_U_OFFSET: Readonly<Record<LadderFinish, number>> = {
  brushed: 0,
  weathered: 0.25,
};

/** Stands the back plates against the facade, clear of the wall's 0.1-u thickness. */
export const LADDER_WALL_HALF_THICKNESS = 0.05;

/** Chooses steel appropriate to the wall that is actually drawn, including untagged brickwork. */
export function ladderFinishForWall(modelId: ModelAssetId): LadderFinish {
  return Object.values(WALL_MODELS.brick).some((id) => id === modelId) ||
    modelId === HALF_WALL_MODELS.brick
    ? "weathered"
    : "brushed";
}
