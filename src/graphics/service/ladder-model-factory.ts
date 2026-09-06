import { Group, Mesh } from "three";
import { LADDER_CONNECTOR_MODEL } from "../data/map-model-table";
import { LADDER_ATLAS_U_OFFSET } from "../data/ladder-styles";
import type { LadderFinish } from "../model/ladder-appearance";
import type { ModelLoader } from "../model/model-loader";

/** Borrows the shared steel material and fits its atlas cell once per ladder finish. */
export class LadderModelFactory {
  /** Uses the scene's existing cache and fallback policy. */
  constructor(private readonly models: ModelLoader) {}

  /** Caller owns the copied geometry; the loader's material and texture remain shared. */
  async create(finish: LadderFinish): Promise<Group> {
    const result = new Group();
    result.name = `ladder-${finish}`;
    result.add(await this.models.load(LADDER_CONNECTOR_MODEL));
    result.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const mesh = object as Mesh;
      mesh.geometry = mesh.geometry.clone();
      const uv = mesh.geometry.getAttribute("uv");
      if (!uv) return;
      for (let i = 0; i < uv.count; i++)
        uv.setXY(i, uv.getX(i) + LADDER_ATLAS_U_OFFSET[finish], uv.getY(i));
      uv.needsUpdate = true;
    });
    return result;
  }
}
