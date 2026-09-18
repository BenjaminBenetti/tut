import {
  Color,
  DataTexture,
  LinearFilter,
  MeshStandardMaterial,
  RepeatWrapping,
  RGBAFormat,
  Vector2,
} from "three";
import type { Material, Texture } from "three";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { Tile } from "../../mapgen/model/tile";
import { BIOME_GROUND_STYLES } from "../data/biome-ground-styles";
import { SURFACE_COLOURS } from "../data/mapgen-preview-palette";
import type { Disposable } from "../model/disposable";
import type { TextureSource } from "../model/texture-source";

/** Continuous resin PBR on the slab; authored ribs and plates retain their chitin materials. */
export class InfestationGroundMaterials implements Disposable {
  private readonly field: DataTexture;
  private readonly size: Vector2;
  private readonly materials = new Map<string, MeshStandardMaterial>();
  private readonly textures: Texture[] = [];

  /** Saves a compact surface contact field; no simulation data is altered. */
  constructor(private readonly map: TacticalMap) {
    this.size = new Vector2(map.width, map.depth);
    this.field = new DataTexture(
      infestationContactField(map),
      map.width,
      map.depth,
      RGBAFormat,
    );
    this.field.minFilter = LinearFilter;
    this.field.magFilter = LinearFilter;
    this.field.needsUpdate = true;
  }

  /** Borrows the loader's assets and owns only copies of their sampling parameters. */
  async prepare(source: TextureSource | undefined): Promise<void> {
    if (
      !source ||
      !this.map.tiles.some((tile) => tile.surface === SurfaceIds.INFESTED)
    )
      return;
    const loaded = await Promise.all([
      source.loadTexture("infestation.resin-albedo"),
      source.loadTexture("infestation.resin-normal"),
      source.loadTexture("infestation.resin-roughness"),
    ]);
    if (loaded.some((texture) => !texture)) return;
    for (const texture of loaded) {
      const copy = texture!.clone();
      copy.wrapS = copy.wrapT = RepeatWrapping;
      copy.anisotropy = 4;
      copy.needsUpdate = true;
      this.textures.push(copy);
    }
  }

  /** Projects seamless maps onto slabs, slopes and vertical cliff columns in world coordinates. */
  material(base: Material, cliff = false): Material {
    if (
      !(base instanceof MeshStandardMaterial) ||
      (!cliff && !base.name.startsWith("bug-chitin-dark")) ||
      this.textures.length !== 3
    )
      return base;
    const key = `${base.uuid}:${cliff ? "cliff" : "ground"}`;
    const cached = this.materials.get(key);
    if (cached) return cached;
    const material = base.clone();
    material.color.set(0xffffff);
    material.map = this.textures[0]!;
    material.normalMap = this.textures[1]!;
    material.normalScale.set(0.65, 0.65);
    material.roughnessMap = this.textures[2]!;
    material.roughness = 1;
    const priorCompile = base.onBeforeCompile.bind(base);
    const priorKey = base.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer): void => {
      priorCompile(shader, renderer);
      Object.assign(shader.uniforms, {
        uResinField: { value: this.field },
        uResinSize: { value: this.size },
      });
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec2 vResinWorld;",
        )
        .replace(
          "#include <uv_vertex>",
          `#include <uv_vertex>
          vec4 resinWorld = vec4(position, 1.0);
          vec3 resinNormal = normal;
          #ifdef USE_INSTANCING
            resinWorld = instanceMatrix * resinWorld;
            resinNormal = mat3(instanceMatrix) * resinNormal;
          #endif
          vec3 resinPoint = (modelMatrix * resinWorld).xyz;
          resinNormal = abs(mat3(modelMatrix) * resinNormal);
          vResinWorld = resinPoint.xz;
          vec2 resinUv = resinNormal.y > max(resinNormal.x, resinNormal.z) ? resinPoint.xz
            : resinNormal.x > resinNormal.z ? resinPoint.zy : resinPoint.xy;
          vMapUv = resinUv * 0.25;
          vNormalMapUv = vMapUv;
          vRoughnessMapUv = vMapUv;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <map_pars_fragment>",
          `#include <map_pars_fragment>
          uniform sampler2D uResinField;
          uniform vec2 uResinSize;
          varying vec2 vResinWorld;`,
        )
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
          vec2 resinWarp = vec2(sin(vResinWorld.y * 17.0 + sin(vResinWorld.x * 5.0)),
            cos(vResinWorld.x * 13.0 + sin(vResinWorld.y * 7.0))) * 0.045;
          vec4 resinContact = texture2D(uResinField, (vResinWorld + resinWarp) / uResinSize);
          float resinGrowth = smoothstep(0.52, 0.79, resinContact.r);
          vec3 resinSubstrate = resinContact.gba * (0.96 + 0.04 * sin(vResinWorld.x * 29.0 + vResinWorld.y * 31.0));
          diffuseColor.rgb = mix(resinSubstrate * diffuse, diffuseColor.rgb, resinGrowth);`,
        );
    };
    material.customProgramCacheKey = (): string =>
      `${priorKey}:continuous-colony-resin-v1`;
    this.materials.set(key, material);
    return material;
  }

  /** Fine world-projected shell grain adds tactile wear without recolouring the authored kit. */
  chitinMaterial(base: Material): Material {
    if (
      !(base instanceof MeshStandardMaterial) ||
      !base.name.startsWith("bug-") ||
      this.textures.length !== 3
    )
      return base;
    const key = `shell:${base.uuid}`;
    const cached = this.materials.get(key);
    if (cached) return cached;
    const material = base.clone();
    material.bumpMap = this.textures[2]!;
    material.bumpScale = 0.018;
    material.roughnessMap = this.textures[2]!;
    material.roughness = 0.95;
    const priorCompile = base.onBeforeCompile.bind(base);
    const priorKey = base.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer): void => {
      priorCompile(shader, renderer);
      shader.vertexShader = shader.vertexShader.replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        vec4 shellPosition = vec4(position, 1.0);
        vec3 shellNormal = normal;
        #ifdef USE_INSTANCING
          shellPosition = instanceMatrix * shellPosition;
          shellNormal = mat3(instanceMatrix) * shellNormal;
        #endif
        vec3 shellWorld = (modelMatrix * shellPosition).xyz;
        shellNormal = abs(mat3(modelMatrix) * shellNormal);
        vec2 shellUv = shellNormal.y > max(shellNormal.x, shellNormal.z) ? shellWorld.xz
          : shellNormal.x > shellNormal.z ? shellWorld.zy : shellWorld.xy;
        vBumpMapUv = shellUv * 1.5;
        vRoughnessMapUv = vBumpMapUv;`,
      );
    };
    material.customProgramCacheKey = (): string =>
      `${priorKey}:colony-shell-grain-v1`;
    this.materials.set(key, material);
    return material;
  }

  /** Disposes the map's contact field and clones; shared texture source assets remain alive. */
  dispose(): void {
    this.field.dispose();
    for (const material of this.materials.values()) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.materials.clear();
    this.textures.length = 0;
  }
}

/** A colony mask with the nearest exposed substrate's linear colour in the other channels. */
export function infestationContactField(map: TacticalMap): Uint8Array {
  const pixels = new Uint8Array(map.width * map.depth * 4);
  const columns = new Map<number, Tile>();
  for (const tile of map.tiles) {
    const key = tile.z * map.width + tile.x;
    if (!columns.has(key) || tile.y < columns.get(key)!.y)
      columns.set(key, tile);
  }
  const style: Readonly<Partial<Record<string, number>>> =
    BIOME_GROUND_STYLES[map.recipe.params.biome];
  for (const [key, tile] of columns) {
    const infested = tile.surface === SurfaceIds.INFESTED;
    let surface = tile.surface;
    if (infested) {
      surface = "dirt";
      let nearest = Infinity;
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          const x = tile.x + dx,
            z = tile.z + dz;
          if (x < 0 || z < 0 || x >= map.width || z >= map.depth) continue;
          const neighbour = columns.get(z * map.width + x);
          const distance = dx * dx + dz * dz;
          if (
            !neighbour ||
            neighbour.surface === SurfaceIds.INFESTED ||
            distance >= nearest
          )
            continue;
          nearest = distance;
          surface = neighbour.surface;
        }
      }
    }
    const colour = new Color(
      style[surface] ?? SURFACE_COLOURS[surface] ?? SURFACE_COLOURS.dirt,
    );
    pixels[key * 4] = infested ? 255 : 0;
    pixels[key * 4 + 1] = Math.round(colour.r * 255);
    pixels[key * 4 + 2] = Math.round(colour.g * 255);
    pixels[key * 4 + 3] = Math.round(colour.b * 255);
  }
  return pixels;
}
