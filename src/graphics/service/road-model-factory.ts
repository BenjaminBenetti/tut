import { Box3, Group, Mesh, Vector3 } from "three";
import type { Material, Object3D } from "three";
import type { ModelLoader } from "../model/model-loader";
import type { RoadAppearance } from "../model/road-appearance";
import type { SlopeMaterials } from "./terrain-slope-model-factory";
import { ROAD_MODELS, ROAD_VARIANTS } from "../data/map-model-table";
import { ROAD_STYLES } from "../data/road-styles";

/**
 * Composes one slab and only the required details from the Blender road kit.
 * Surface material/UVs are borrowed from the scene. Geometry belongs to the
 * caller; all supplied and prototype materials remain borrowed. Cache per
 * roadAppearanceKey in the scene, independent of position and elevation.
 */
export class RoadModelFactory {
  /** Uses the scene's shared asset cache and fallback policy. */
  constructor(private readonly models: ModelLoader) {}

  /** Builds an unrotated, centre-pivot road tile from the named reusable parts. */
  async create(
    appearance: RoadAppearance,
    materials: SlopeMaterials,
  ): Promise<Group> {
    const result = new Group();
    const profile = ROAD_STYLES[appearance.style];
    const slab = await this.models.load(ROAD_MODELS.lane);
    const body = copyParts(slab, () => true, materials.surface);
    const region = materials.uv ?? { u0: 0, v0: 0, u1: 1, v1: 1 };
    for (const mesh of body) {
      const p = mesh.geometry.getAttribute("position");
      const uv = mesh.geometry.getAttribute("uv");
      if (uv)
        for (let i = 0; i < p.count; i++)
          uv.setXY(
            i,
            region.u0 + (p.getX(i) + 0.5) * (region.u1 - region.u0),
            region.v0 + (p.getZ(i) + 0.5) * (region.v1 - region.v0),
          );
      mesh.name = "road-surface";
      result.add(mesh);
    }
    if (profile.kerbs && appearance.kerbs.length > 0) {
      await this.addKerbs(result, appearance);
    }
    if (profile.markings && appearance.line) {
      const source = await this.models.load(ROAD_MODELS.centre);
      for (const mesh of copyParts(source, (name) =>
        name.startsWith("road_centre_line"),
      )) {
        mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox!;
        const centre = box.getCenter(new Vector3());
        // Keep an even-width divider inside its owner tile; an odd-width one sits centrally.
        const offset = Math.min(
          appearance.line.offset,
          0.5 - (box.max.z - box.min.z) / 2,
        );
        mesh.geometry.translate(0, 0, offset - centre.z);
        mesh.rotation.y = (-appearance.line.turns * Math.PI) / 2;
        mesh.name = "road-centre-line";
        result.add(mesh);
      }
    }
    if (profile.markings && appearance.junction) {
      const junction = appearance.junction;
      const source = await this.models.load(ROAD_VARIANTS[junction.kind]);
      for (const mesh of copyParts(
        source,
        (name) => name === "centre" || name.startsWith("dash_"),
      )) {
        mesh.geometry.computeBoundingBox();
        mesh.geometry.translate(0, 0.025 - mesh.geometry.boundingBox!.min.y, 0);
        mesh.rotation.y = (-junction.turns * Math.PI) / 2;
        mesh.position.set(junction.x, 0, junction.z);
        mesh.name = "road-junction-mark";
        result.add(mesh);
      }
    }
    result.updateMatrixWorld(true);
    return result;
  }

  /** A corner uses the authored L; other perimeters butt strips without overlapping tops. */
  private async addKerbs(
    result: Group,
    appearance: RoadAppearance,
  ): Promise<void> {
    const turns = appearance.kerbs;
    const cornerTurn =
      turns.length === 2
        ? turns.find((turn) =>
            turns.includes(((turn + 3) % 4) as 0 | 1 | 2 | 3),
          )
        : undefined;
    if (cornerTurn !== undefined) {
      const source = await this.models.load(ROAD_MODELS.corner);
      for (const mesh of copyParts(source, (name) =>
        name.startsWith("road_kerb"),
      )) {
        mesh.rotation.y = (-cornerTurn * Math.PI) / 2;
        mesh.name = "road-kerb-corner";
        result.add(mesh);
      }
      return;
    }
    const source = await this.models.load(ROAD_MODELS.kerb);
    for (const turn of turns) {
      for (const mesh of copyParts(source, (name) =>
        name.startsWith("road_kerb"),
      )) {
        if (turns.includes(((turn + 3) % 4) as 0 | 1 | 2 | 3)) {
          const box = new Box3().setFromObject(mesh);
          const width = box.max.z - box.min.z;
          mesh.geometry.scale(1 - width, 1, 1);
          mesh.geometry.translate(-width / 2, 0, 0);
        }
        mesh.rotation.y = (-turn * Math.PI) / 2;
        mesh.name = "road-kerb";
        result.add(mesh);
      }
    }
  }
}

/** Bakes an exported part's transform into an owned geometry, borrowing its material. */
function copyParts(
  source: Object3D,
  include: (name: string) => boolean,
  material?: Material,
): Mesh[] {
  const parts: Mesh[] = [];
  source.updateMatrixWorld(true);
  source.traverse((object) => {
    if (!(object instanceof Mesh) || !include(object.name)) return;
    const mesh = object as Mesh;
    const copy = new Mesh(
      mesh.geometry.clone().applyMatrix4(mesh.matrixWorld),
      material ?? mesh.material,
    );
    copy.castShadow = true;
    copy.receiveShadow = true;
    parts.push(copy);
  });
  return parts;
}
