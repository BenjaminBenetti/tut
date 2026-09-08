import { hashSeed } from "../../core/service/seed-hash";
import { NATURAL_MATERIAL_TRANSITION } from "../data/natural-material-transition";

/** Deterministic value noise for appearance, independent of the generator RNG. */
function noise(x: number, z: number): number {
  const ix = Math.floor(x),
    iz = Math.floor(z);
  const fx = x - ix,
    fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx),
    sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz),
    b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1),
    d = hash(ix + 1, iz + 1);
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
}

/** Stable fractional hash; no runtime entropy or tactical random draws. */
function hash(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/** One bounded offset component, with broad and fine irregularity. */
function displacement(x: number, z: number, offset: number): number {
  const t = NATURAL_MATERIAL_TRANSITION;
  const broad = noise(x + offset, z + offset);
  const fine = noise(
    x * t.detailFrequency + offset + 12.3,
    z * t.detailFrequency + offset + 12.3,
  );
  return (
    ((broad * (1 - t.detailShare) + fine * t.detailShare) * 2 - 1) *
    t.warpAmplitude
  );
}

/**
 * Bake once per map, rather than evaluating noise and categorical interpolation
 * for every rendered fragment. RGBA holds grass/dirt/sand/snow; rock is the
 * remainder. Quantized weights sum to exactly 255, including at three-way joins.
 * Samples extend underneath hard surfaces; the separate ownership mask clips
 * the result, so filtering at a pavement edge cannot introduce a dark fringe.
 */
export function naturalMaterialWeights(
  field: Uint8Array,
  width: number,
  depth: number,
  seed: string,
): Uint8Array {
  const t = NATURAL_MATERIAL_TRANSITION;
  const resolution = t.samplesPerTile;
  const w = width * resolution,
    h = depth * resolution;
  const pixels = new Uint8Array(w * h * 4);
  const seedHash = hashSeed(seed);
  const seedX = seedHash % 1024,
    seedZ = (seedHash >>> 10) % 1024;
  const weights = new Float64Array(5);
  const quantized = new Uint8Array(5);
  /** Absent and authored surfaces contribute no natural material. */
  const idAt = (x: number, z: number): number =>
    x < 0 || z < 0 || x >= width || z >= depth
      ? 0
      : field[(z * width + x) * 4]!;
  // Uniform interiors need neither noise nor weight arithmetic. The two-column
  // radius includes every sample reachable by the bounded displacement.
  const interiors = new Uint8Array(width * depth);
  for (let z = 0; z < depth; z++)
    for (let x = 0; x < width; x++) {
      let candidate = 0,
        mixed = false;
      for (let dz = -2; dz <= 2; dz++)
        for (let dx = -2; dx <= 2; dx++) {
          const id = idAt(x + dx, z + dz);
          if (!id) continue;
          if (candidate && candidate !== id) mixed = true;
          candidate = id;
        }
      if (!mixed) interiors[z * width + x] = candidate;
    }
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) {
      const interior =
        interiors[
          Math.floor(z / resolution) * width + Math.floor(x / resolution)
        ]!;
      if (interior) {
        if (interior < 5) pixels[(z * w + x) * 4 + interior - 1] = 255;
        continue;
      }
      const wx = (x + 0.5) / resolution,
        wz = (z + 0.5) / resolution;
      const nx = wx * t.warpFrequency + seedX,
        nz = wz * t.warpFrequency + seedZ;
      const px = wx - 0.5 + displacement(nx, nz, 0);
      const pz = wz - 0.5 + displacement(nx, nz, 37.7);
      const ix = Math.floor(px),
        iz = Math.floor(pz),
        fx = px - ix,
        fz = pz - iz;
      weights.fill(0);
      for (let dz = 0; dz < 2; dz++)
        for (let dx = 0; dx < 2; dx++) {
          const id = idAt(ix + dx, iz + dz);
          if (id) weights[id - 1]! += (dx ? fx : 1 - fx) * (dz ? fz : 1 - fz);
        }
      let total = 0;
      for (let i = 0; i < 5; i++) {
        weights[i] = weights[i]! ** t.sharpness;
        total += weights[i]!;
      }
      if (total === 0) continue;
      let allocated = 0;
      for (let i = 0; i < 5; i++) {
        weights[i] = (weights[i]! * 255) / total;
        quantized[i] = Math.floor(weights[i]!);
        weights[i]! -= quantized[i]!;
        allocated += quantized[i]!;
      }
      // Largest remainders preserve the sum without inventing a sixth colour.
      while (allocated++ < 255) {
        let largest = 0;
        for (let i = 1; i < 5; i++)
          if (weights[i]! > weights[largest]!) largest = i;
        quantized[largest]!++;
        weights[largest] = -1;
      }
      const offset = (z * w + x) * 4;
      for (let i = 0; i < 4; i++) pixels[offset + i] = quantized[i]!;
    }
  return pixels;
}
