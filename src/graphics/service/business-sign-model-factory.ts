import { Group, Mesh, MeshStandardMaterial } from "three";
import type { BufferGeometry, Material, Texture } from "three";
import { BUSINESS_ENTRANCES } from "../data/business-frontages";
import {
  BUSINESS_SIGN_ATLASES,
  BUSINESS_SIGN_ATLAS_LAYOUT,
} from "../data/business-sign-atlases";
import type { BusinessSignAppearance } from "../model/business-sign-appearance";
import type { Disposable } from "../model/disposable";
import type { ModelLoader } from "../model/model-loader";
import type { TextureSource } from "../model/texture-source";

/** Prints an authored name onto the existing canopy without changing its mounting geometry. */
export class BusinessSignModelFactory implements Disposable {
  private readonly prototypes = new Map<string, Promise<Group>>();
  private readonly resources = new Set<Disposable>();
  private readonly materials = new Map<string, MeshStandardMaterial>();
  private disposed = false;

  /** Both sources retain ownership of their shared original models and textures. */
  constructor(
    private readonly models: ModelLoader,
    private readonly textures: TextureSource,
  ) {}

  /** Shares a cropped prototype per name, so multiple entrances keep identical print. */
  create(appearance: BusinessSignAppearance): Promise<Group> {
    if (this.disposed) return Promise.resolve(new Group());
    const key = businessSignKey(appearance);
    let prototype = this.prototypes.get(key);
    if (!prototype) {
      prototype = this.print(appearance);
      this.prototypes.set(key, prototype);
    }
    return prototype;
  }

  /** Releases only copied geometry and print materials; cached source textures remain borrowed. */
  dispose(): void {
    this.disposed = true;
    for (const resource of this.resources) resource.dispose();
    this.resources.clear();
    this.prototypes.clear();
    this.materials.clear();
  }

  /** Fits one atlas row to the original fascia UVs; failed artwork retains the authored fallback. */
  private async print(appearance: BusinessSignAppearance): Promise<Group> {
    const { kind, nameIndex } = appearance;
    const layout = BUSINESS_SIGN_ATLAS_LAYOUT;
    const page = Math.floor(nameIndex / layout.labelsPerPage);
    const textureId = BUSINESS_SIGN_ATLASES[kind][page];
    if (!Number.isInteger(nameIndex) || nameIndex < 0 || !textureId)
      throw new Error(`Unknown business sign ${businessSignKey(appearance)}`);
    const [model, texture] = await Promise.all([
      this.models.load(BUSINESS_ENTRANCES[kind][0]!.modelId),
      this.textures.loadTexture(textureId),
    ]);
    const result = new Group();
    result.name = `business-sign-${businessSignKey(appearance)}`;
    // A scene can leave while either source is still loading; allocate nothing after disposal.
    if (this.disposed) return result;
    result.add(model);
    if (!texture) return result;
    const top =
      (nameIndex % layout.labelsPerPage) * layout.rowStride + layout.topInset;
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const mesh = object as Mesh<BufferGeometry, Material | Material[]>;
      const originals = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      if (
        !originals.some(
          (material) => material.name === `business-print-${kind}`,
        )
      )
        return;
      const geometry = mesh.geometry.clone();
      const uv = geometry.getAttribute("uv");
      if (uv) {
        for (let i = 0; i < uv.count; i++) {
          const v =
            (top + 0.5 + uv.getY(i) * (layout.labelHeight - 1)) / layout.height;
          uv.setXY(
            i,
            (0.5 + uv.getX(i) * (layout.width - 1)) / layout.width,
            texture.flipY ? 1 - v : v,
          );
        }
        uv.needsUpdate = true;
      }
      mesh.geometry = geometry;
      this.resources.add(geometry);
      const printed = originals.map((material) => {
        if (
          !(material instanceof MeshStandardMaterial) ||
          material.name !== `business-print-${kind}`
        )
          return material;
        return this.printMaterial(material, texture);
      });
      mesh.material = Array.isArray(mesh.material) ? printed : printed[0]!;
    });
    return result;
  }

  /** Names on the same atlas page share one material and one downloaded texture. */
  private printMaterial(
    source: MeshStandardMaterial,
    texture: Texture,
  ): MeshStandardMaterial {
    const key = `${source.uuid}:${texture.uuid}`;
    let material = this.materials.get(key);
    if (!material) {
      material = source.clone();
      material.map = texture;
      this.materials.set(key, material);
      this.resources.add(material);
    }
    return material;
  }
}

/** Stable batch identity excludes wall direction, floor and owning building. */
export function businessSignKey(appearance: BusinessSignAppearance): string {
  return `${appearance.kind}:${appearance.nameIndex}`;
}
