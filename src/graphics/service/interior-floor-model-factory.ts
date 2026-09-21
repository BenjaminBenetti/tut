import {
  Color,
  DataTexture,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  RGBAFormat,
  SRGBColorSpace,
  Vector3,
} from "three";
import { INTERIOR_FLOOR_STYLES } from "../data/interior-floor-styles";
import type { InteriorFloorAppearance } from "../model/interior-floor-style";
import type { ModelLoader } from "../model/model-loader";
import { interiorFloorKey } from "./interior-floor-resolver";

/** Pattern resolution per two-metre floor tile. */
const TEXTURE_SIZE = 64;

/** Retextures the authored floor slab, retaining its geometry, pivot and exact walk plane. */
export class InteriorFloorModelFactory {
  /** Uses the same registered GLB and loader as all building floors. */
  constructor(private readonly models: ModelLoader) {}

  /** Caller owns the copied geometry, floor material and texture; the loader stays untouched. */
  async create(appearance: InteriorFloorAppearance): Promise<Group> {
    const result = new Group();
    result.name = `interior-floor-${interiorFloorKey(appearance)}`;
    result.add(await this.models.load("building.floor"));
    result.updateMatrixWorld(true);
    const material = new MeshStandardMaterial({
      name: `env-interior-${interiorFloorKey(appearance)}`,
      map: floorTexture(appearance),
      roughness: INTERIOR_FLOOR_STYLES[appearance.finish].roughness,
    });
    result.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const mesh = object as Mesh;
      mesh.geometry = mesh.geometry.clone();
      const positions = mesh.geometry.getAttribute("position");
      const uv: number[] = [];
      const point = new Vector3();
      // Project across the entire slab, including its separate border pieces.
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
        uv.push(point.x + 0.5, point.z + 0.5);
      }
      mesh.geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
      mesh.material = material;
    });
    return result;
  }
}

/** Creates restrained repeating board, grout or weave patterns without browser canvas state. */
function floorTexture(appearance: InteriorFloorAppearance): DataTexture {
  const style = INTERIOR_FLOOR_STYLES[appearance.finish];
  const base = new Color(
    style.colours[appearance.variant],
  ).convertLinearToSRGB();
  const seam = new Color(style.seam).convertLinearToSRGB();
  const pixels = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  for (let z = 0; z < TEXTURE_SIZE; z++) {
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const board = Math.floor(x / 8);
      const isSeam =
        appearance.finish === "timber"
          ? x % 8 === 0 || (z + (board % 2) * 32) % 64 === 0
          : appearance.finish === "ceramic"
            ? x % 16 === 0 || z % 16 === 0
            : false;
      const variation =
        appearance.finish === "timber"
          ? 0.96 + ((board * 3) % 5) * 0.018
          : appearance.finish === "carpet"
            ? 0.975 + ((x + z) % 2) * 0.025
            : 0.99 + ((Math.floor(x / 16) + Math.floor(z / 16)) % 2) * 0.01;
      const pattern = architecturalPattern(appearance, x, z);
      const colour = isSeam || pattern.inlay ? seam : base;
      const brightness = variation * pattern.brightness;
      const offset = (z * TEXTURE_SIZE + x) * 4;
      pixels[offset] = Math.round(colour.r * 255 * brightness);
      pixels[offset + 1] = Math.round(colour.g * 255 * brightness);
      pixels[offset + 2] = Math.round(colour.b * 255 * brightness);
      pixels[offset + 3] = 255;
    }
  }
  const texture = new DataTexture(
    pixels,
    TEXTURE_SIZE,
    TEXTURE_SIZE,
    RGBAFormat,
  );
  texture.name = `interior-floor-${interiorFloorKey(appearance)}`;
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Marble slabs with green diamond inlays, or steel tread plate; ordinary finishes retain their pattern. */
function architecturalPattern(
  appearance: InteriorFloorAppearance,
  x: number,
  z: number,
): { readonly inlay: boolean; readonly brightness: number } {
  if (appearance.finish === "marble") {
    const edgeX = Math.min(x, TEXTURE_SIZE - 1 - x);
    const edgeZ = Math.min(z, TEXTURE_SIZE - 1 - z);
    const vein = Math.abs(
      Math.sin(
        (x + z * 0.73 + Math.sin(z * 0.18) * 4 + appearance.variant * 13) *
          0.17,
      ),
    );
    return {
      inlay: edgeX + edgeZ < 7,
      brightness:
        edgeX === 0 || edgeZ === 0
          ? 0.83
          : vein < 0.1
            ? 0.73
            : vein < 0.27
              ? 0.91
              : 1,
    };
  }
  if (appearance.finish === "steel") {
    const tread = (x + (Math.floor(z / 8) % 2) * 4) % 8;
    return {
      inlay: x === 0 || z === 0,
      brightness: (tread + (z % 8)) % 8 === 0 ? 1.12 : 0.97,
    };
  }
  return { inlay: false, brightness: 1 };
}
