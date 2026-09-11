import { Group, Mesh } from "three";
import { PITCHED_ROOF_MODEL } from "../data/map-model-table";
import type { ModelLoader } from "../model/model-loader";
import type { PitchedRoofAppearance } from "../model/pitched-roof-appearance";
import { HippedRoofModelFactory } from "./hipped-roof-model-factory";

/** Fits the Blender cap's upper profile, preserving its closed ceiling and shared material. */
export class PitchedRoofModelFactory {
  /** Uses the scene's existing loader/cache/fallback policy. */
  constructor(private readonly models: ModelLoader) {}

  /** Caller owns copied geometry; loader material/texture remain borrowed across all profiles. */
  async create(roof: PitchedRoofAppearance): Promise<Group> {
    if (roof.depthHeights)
      return new HippedRoofModelFactory(this.models).create(
        roof.heights,
        roof.depthHeights,
      );
    const result = new Group();
    const source = await this.models.load(PITCHED_ROOF_MODEL);
    source.updateMatrixWorld(true);
    source.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const original = object as Mesh;
      const mesh = new Mesh(original.geometry.clone(), original.material);
      mesh.geometry.applyMatrix4(object.matrixWorld);
      const position = mesh.geometry.getAttribute("position");
      for (let i = 0; i < position.count; i++) {
        if (position.getY(i) < 0.001) continue;
        const x = position.getX(i);
        position.setY(i, roof.heights[x < -0.001 ? 0 : x > 0.001 ? 2 : 1]);
      }
      position.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
      mesh.geometry.computeBoundingBox();
      mesh.geometry.computeBoundingSphere();
      result.add(mesh);
    });
    return result;
  }
}
