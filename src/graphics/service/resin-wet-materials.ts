import {
  DataTexture,
  EquirectangularReflectionMapping,
  FloatType,
  LinearFilter,
  MeshStandardMaterial,
  RGBAFormat,
} from "three";
import type { Material } from "three";

/**
 * A small shared sky reflection for wet tissue. Sunlight alone makes low-roughness
 * surfaces mostly black except at one angle; a broad sky reflection lets curved
 * membranes and droplets read as moist as the camera turns. City materials keep
 * their original lighting. Three prefilters this equirectangular texture once.
 */
export class ResinWetMaterials {
  // ===========================================
  // Owned texture and material copies
  // ===========================================

  private sky: DataTexture | undefined;
  private readonly copies = new Map<Material, MeshStandardMaterial>();

  // ===========================================
  // Material selection and lifecycle
  // ===========================================

  /** Clone only the authored resin material, preserving shared loader prototypes. */
  material(source: Material): Material {
    if (
      !(source instanceof MeshStandardMaterial) ||
      !source.name.startsWith("resin-")
    )
      return source;
    let result = this.copies.get(source);
    if (result === undefined) {
      result = source.clone();
      this.sky ??= createResinSky();
      result.envMap = this.sky;
      result.envMapIntensity = 0.6;
      this.copies.set(source, result);
    }
    return result;
  }

  /** Release only this view's copies and its shared reflection texture. */
  dispose(): void {
    for (const material of this.copies.values()) material.dispose();
    this.copies.clear();
    this.sky?.dispose();
    this.sky = undefined;
  }
}

/** Deterministic neutral sky and dark ground; no network asset or renderer dependency. */
function createResinSky(): DataTexture {
  const width = 64,
    height = 32;
  const pixels = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const u = x / width,
        v = 1 - y / (height - 1);
      const sky = 0.06 + 0.55 * Math.max(0, Math.cos(v * Math.PI));
      const broad =
        3 * Math.exp(-((u - 0.25) ** 2 / 0.017 + (v - 0.29) ** 2 / 0.012));
      const rim =
        1.4 * Math.exp(-((u - 0.74) ** 2 / 0.007 + (v - 0.4) ** 2 / 0.02));
      const value = sky + broad + rim;
      const at = (y * width + x) * 4;
      pixels.set([value * 0.94, value * 0.97, value, 1], at);
    }
  const texture = new DataTexture(pixels, width, height, RGBAFormat, FloatType);
  texture.mapping = EquirectangularReflectionMapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
