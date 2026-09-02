import type { Rng } from "../../core/model/rng";

// ===========================================
// ValueNoise
// ===========================================

/**
 * Seeded 2D value noise with bilinear interpolation and fractal layering
 * (ADR 0004 §7.3, pass 1). The lattice values and permutation come from
 * the injected `Rng`, so the field is a pure function of the seed. Generic
 * on purpose: terrain, shorelines, crater rims and cavern walls all sample
 * it.
 *
 * ```
 *   sample(x, z)  ──►  v00 ─── v10
 *                       │  (x,z) │      smoothstep-blended corners
 *                      v01 ─── v11
 * ```
 */
export class ValueNoise {
  // ===========================================
  // Fields
  // ===========================================

  private readonly size: number;
  private readonly mask: number;
  private readonly values: Float32Array;
  private readonly permutation: Uint16Array;

  // ===========================================
  // Construction
  // ===========================================

  /**
   * Builds the lattice. `size` must be a power of two; it bounds the
   * period of the field in lattice cells.
   */
  constructor(rng: Rng, size = 256) {
    if (size < 2 || (size & (size - 1)) !== 0) {
      throw new Error(`ValueNoise size must be a power of two, got ${size}`);
    }
    this.size = size;
    this.mask = size - 1;
    this.values = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      this.values[i] = rng.next();
    }
    const indices: number[] = [];
    for (let i = 0; i < size; i++) {
      indices.push(i);
    }
    this.permutation = Uint16Array.from(rng.shuffle(indices));
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Noise in [0, 1) at a continuous position, one octave. */
  sample(x: number, z: number): number {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const tx = smoothstep(x - x0);
    const tz = smoothstep(z - z0);
    const v00 = this.lattice(x0, z0);
    const v10 = this.lattice(x0 + 1, z0);
    const v01 = this.lattice(x0, z0 + 1);
    const v11 = this.lattice(x0 + 1, z0 + 1);
    const top = v00 + (v10 - v00) * tx;
    const bottom = v01 + (v11 - v01) * tx;
    return top + (bottom - top) * tz;
  }

  /**
   * Fractal sum of `octaves` samples, each at double frequency and
   * `roughness` times the previous amplitude, normalised back to [0, 1).
   */
  fbm(x: number, z: number, octaves: number, roughness: number): number {
    let total = 0;
    let amplitude = 1;
    let frequency = 1;
    let normaliser = 0;
    for (let i = 0; i < Math.max(1, octaves); i++) {
      total += this.sample(x * frequency, z * frequency) * amplitude;
      normaliser += amplitude;
      amplitude *= roughness;
      frequency *= 2;
    }
    return total / normaliser;
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Lattice value at integer coordinates, wrapping at `size`. */
  private lattice(ix: number, iz: number): number {
    const px = this.permutation[ix & this.mask] ?? 0;
    const index = this.permutation[(px + iz) & this.mask] ?? 0;
    return this.values[index % this.size] ?? 0;
  }
}

// ===========================================
// Helpers
// ===========================================

/** Hermite blend so lattice seams have continuous slope. */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}
