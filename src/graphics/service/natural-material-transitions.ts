import {
  DataTexture,
  MeshStandardMaterial,
  LinearFilter,
  NearestFilter,
  RGBAFormat,
  Vector2,
  Vector4,
} from "three";
import type { Material } from "three";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import { surfaceModel } from "../data/map-model-table";
import {
  NATURAL_MATERIAL_SURFACES,
  NATURAL_MATERIAL_TRANSITION,
} from "../data/natural-material-transition";
import type { Disposable } from "../model/disposable";
import type { ModelLoader } from "../model/model-loader";
import {
  naturalMaterialField,
  naturalMaterialId,
} from "./natural-material-field";
import {
  NATURAL_MATERIAL_FRAGMENT,
  NATURAL_MATERIAL_SAMPLE,
} from "./natural-material-shader";
import { naturalMaterialWeights } from "./natural-material-weights";
import { slopeMaterialsFromGround } from "./terrain-slope-model-factory";

/**
 * One map-specific contact field and a few shared material clones. Existing
 * geometry and atlas textures stay borrowed; nothing is allocated per tile.
 */
export class NaturalMaterialTransitions implements Disposable {
  private readonly field: DataTexture;
  private readonly weights: DataTexture;
  private readonly materials = new Map<string, Material>();
  private readonly regions = NATURAL_MATERIAL_SURFACES.map(() => new Vector4());
  private readonly size: Vector2;

  /** Builds a small categorical texture from the frozen map without changing it. */
  constructor(private readonly map: TacticalMap) {
    const field = naturalMaterialField(map);
    this.field = new DataTexture(field, map.width, map.depth, RGBAFormat);
    this.field.minFilter = NearestFilter;
    this.field.magFilter = NearestFilter;
    this.field.needsUpdate = true;
    this.size = new Vector2(map.width, map.depth);
    // Placeholder-only views never need the larger appearance texture.
    this.weights = new DataTexture();
    this.weights.minFilter = LinearFilter;
    this.weights.magFilter = LinearFilter;
  }

  /** Reads atlas regions from the authored ground tops, rather than duplicating their UV table. */
  async prepare(models: ModelLoader): Promise<void> {
    const resolution = NATURAL_MATERIAL_TRANSITION.samplesPerTile;
    this.weights.image = {
      data: naturalMaterialWeights(
        naturalMaterialField(this.map),
        this.map.width,
        this.map.depth,
        this.map.recipe.seed,
      ),
      width: this.map.width * resolution,
      height: this.map.depth * resolution,
    };
    this.weights.needsUpdate = true;
    const used = new Set(this.map.tiles.map((t) => t.surface));
    await Promise.all(
      NATURAL_MATERIAL_SURFACES.map(async (surface, i) => {
        if (!used.has(surface)) return;
        const prototype = await models.load(surfaceModel(surface)!);
        const materials = slopeMaterialsFromGround(
          prototype,
          new MeshStandardMaterial(),
        );
        // The fallback exists only for UV discovery and is not a rendered material.
        materials.sides.dispose();
        const r = materials.uv;
        if (r) this.regions[i]!.set(r.u0, r.v0, r.u1, r.v1);
      }),
    );
  }

  /** Shares a clone for each natural source material; built surfaces and prototypes stay untouched. */
  material(base: Material, surface: string): Material {
    const id = naturalMaterialId(surface);
    if (
      id === 0 ||
      !(base instanceof MeshStandardMaterial) ||
      base.map === null
    )
      return base;
    const key = `${base.uuid}:${surface}`;
    let material = this.materials.get(key);
    if (material) return material;
    material = base.clone();
    const priorCompile = base.onBeforeCompile.bind(base);
    const priorKey = base.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer): void => {
      priorCompile(shader, renderer);
      Object.assign(shader.uniforms, {
        uNaturalField: { value: this.field },
        uNaturalSize: { value: this.size },
        uNaturalWeights: { value: this.weights },
        uNaturalUv: { value: this.regions },
      });
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec2 vNaturalWorld;\nvarying float vNaturalUp;",
        )
        .replace(
          "#include <project_vertex>",
          `#include <project_vertex>
          vec4 naturalPosition = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            naturalPosition = instanceMatrix * naturalPosition;
          #endif
          vNaturalWorld = (modelMatrix * naturalPosition).xz;
          vNaturalUp = normal.y;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <map_pars_fragment>",
          `#include <map_pars_fragment>\n${NATURAL_MATERIAL_FRAGMENT}`,
        )
        .replace("#include <map_fragment>", NATURAL_MATERIAL_SAMPLE);
    };
    material.customProgramCacheKey = (): string =>
      `${priorKey}:natural-material-contacts-v1`;
    this.materials.set(key, material);
    return material;
  }

  /** Releases only the field and owned clones; the loader still owns its atlas and prototypes. */
  dispose(): void {
    this.field.dispose();
    this.weights.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
  }
}
