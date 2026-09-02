import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import { ValueNoise } from "./value-noise";

function noise(seed = "noise", size?: number): ValueNoise {
  return new ValueNoise(new Mulberry32Rng(hashSeed(seed)), size);
}

describe("ValueNoise", () => {
  it("is a pure function of the seed", () => {
    const a = noise("alpha");
    const b = noise("alpha");
    const c = noise("beta");
    const samples = (n: ValueNoise): number[] =>
      [0, 1.5, 7.25, 100.1].map((v) => n.sample(v, v * 0.3));
    expect(samples(a)).toEqual(samples(b));
    expect(samples(a)).not.toEqual(samples(c));
  });

  it("stays inside [0, 1) for samples and fbm", () => {
    const n = noise();
    for (let i = 0; i < 2000; i++) {
      const x = (i * 0.37) % 300;
      const z = (i * 0.91) % 300;
      const s = n.sample(x, z);
      const f = n.fbm(x * 0.05, z * 0.05, 3, 0.5);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(1);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it("is continuous: tiny steps give tiny changes", () => {
    const n = noise();
    let worst = 0;
    for (let i = 0; i < 1000; i++) {
      const x = i * 0.013;
      const z = i * 0.007;
      worst = Math.max(
        worst,
        Math.abs(n.sample(x + 0.001, z) - n.sample(x, z)),
      );
    }
    expect(worst).toBeLessThan(0.01);
  });

  it("interpolates exactly through lattice values", () => {
    const n = noise();
    expect(n.sample(3, 4)).toBe(n.sample(3.0, 4.0));
    // Half-way between two lattice points along x lies between them.
    const left = n.sample(3, 4);
    const right = n.sample(4, 4);
    const mid = n.sample(3.5, 4);
    expect(mid).toBeGreaterThanOrEqual(Math.min(left, right));
    expect(mid).toBeLessThanOrEqual(Math.max(left, right));
  });

  it("wraps at the lattice size and rejects non-power-of-two sizes", () => {
    const n = noise("wrap", 16);
    expect(n.sample(1, 2)).toBe(n.sample(17, 18));
    expect(() => noise("bad", 12)).toThrow(/power of two/);
  });

  it("adds detail with more octaves", () => {
    const n = noise();
    let diff = 0;
    for (let i = 0; i < 200; i++) {
      const x = i * 0.11;
      diff += Math.abs(n.fbm(x, 0.5, 4, 0.5) - n.fbm(x, 0.5, 1, 0.5));
    }
    expect(diff).toBeGreaterThan(0);
  });
});
