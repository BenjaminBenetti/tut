import { describe, expect, it } from "vitest";

import { INFESTATION_RAMP, infestationColour } from "./infestation-ramp";

// ===========================================
// Fixtures
// ===========================================

function channels(hex: number): [number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

function stop(index: number): number {
  const entry = INFESTATION_RAMP[index];
  if (!entry) throw new Error("missing stop");
  return entry.hex;
}

// ===========================================
// Ramp
// ===========================================

describe("infestationColour", () => {
  it("hits every ramp stop exactly", () => {
    expect(infestationColour(0)).toBe(stop(0));
    expect(infestationColour(100 / 3)).toBe(stop(1));
    expect(infestationColour(200 / 3)).toBe(stop(2));
    expect(infestationColour(100)).toBe(stop(3));
  });

  it("is the channel-wise midpoint between two neighbouring stops", () => {
    const [r0, g0, b0] = channels(stop(0));
    const [r1, g1, b1] = channels(stop(1));
    expect(channels(infestationColour(100 / 6))).toEqual([
      Math.round((r0 + r1) / 2),
      Math.round((g0 + g1) / 2),
      Math.round((b0 + b1) / 2),
    ]);
  });

  it("stays between its neighbouring stops on every channel", () => {
    for (let infestation = 0; infestation <= 100; infestation += 5) {
      const t = infestation / 100;
      const upperIndex = INFESTATION_RAMP.findIndex((s) => s.at >= t);
      const lowerIndex = Math.max(0, upperIndex === 0 ? 0 : upperIndex - 1);
      const lower = channels(stop(lowerIndex));
      const upper = channels(stop(upperIndex));
      const actual = channels(infestationColour(infestation));
      for (let c = 0; c < 3; c++) {
        const lo = Math.min(lower[c] ?? 0, upper[c] ?? 0);
        const hi = Math.max(lower[c] ?? 0, upper[c] ?? 0);
        expect(actual[c]).toBeGreaterThanOrEqual(lo);
        expect(actual[c]).toBeLessThanOrEqual(hi);
      }
    }
  });

  it("clamps out-of-range and treats non-numbers as clean", () => {
    expect(infestationColour(-20)).toBe(stop(0));
    expect(infestationColour(250)).toBe(stop(3));
    expect(infestationColour(Number.NaN)).toBe(stop(0));
  });
});
