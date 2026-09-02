import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "./mulberry32-rng";

describe("Mulberry32Rng", () => {
  it("produces the same sequence for the same seed", () => {
    const a = new Mulberry32Rng(42);
    const b = new Mulberry32Rng(42);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    const a = new Mulberry32Rng(1);
    const b = new Mulberry32Rng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it("matches the reference mulberry32 output for seed 0", () => {
    // Golden values guard against accidental algorithm drift, which would
    // silently break every saved game and every recorded seed.
    const rng = new Mulberry32Rng(0);
    expect(rng.next()).toBeCloseTo(0.26642920868471265, 15);
    expect(rng.next()).toBeCloseTo(0.0003297457005828619, 15);
    expect(rng.next()).toBeCloseTo(0.2232720274478197, 15);
  });

  it("stays within [0, 1)", () => {
    const rng = new Mulberry32Rng(7);
    for (let i = 0; i < 10_000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("nextInt covers the whole inclusive range and nothing else", () => {
    const rng = new Mulberry32Rng(123);
    const seen = new Set<number>();
    for (let i = 0; i < 2_000; i++) {
      const value = rng.nextInt(-2, 2);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(-2);
      expect(value).toBeLessThanOrEqual(2);
      seen.add(value);
    }
    expect([...seen].sort((x, y) => x - y)).toEqual([-2, -1, 0, 1, 2]);
  });

  it("nextInt rejects inverted or non-integer bounds", () => {
    const rng = new Mulberry32Rng(1);
    expect(() => rng.nextInt(5, 1)).toThrow();
    expect(() => rng.nextInt(0.5, 2)).toThrow();
  });

  it("pick returns members only and throws on empty input", () => {
    const rng = new Mulberry32Rng(9);
    const items = ["a", "b", "c"] as const;
    for (let i = 0; i < 100; i++) {
      expect(items).toContain(rng.pick(items));
    }
    expect(() => rng.pick([])).toThrow();
  });

  it("chance honours the degenerate probabilities without consuming state", () => {
    const rng = new Mulberry32Rng(5);
    const before = rng.getState();
    expect(rng.chance(0)).toBe(false);
    expect(rng.chance(1)).toBe(true);
    expect(rng.getState()).toEqual(before);
  });

  it("chance is roughly calibrated", () => {
    const rng = new Mulberry32Rng(2024);
    let hits = 0;
    const trials = 20_000;
    for (let i = 0; i < trials; i++) {
      if (rng.chance(0.25)) {
        hits++;
      }
    }
    expect(hits / trials).toBeGreaterThan(0.23);
    expect(hits / trials).toBeLessThan(0.27);
  });

  it("fork yields an independent stream that is itself deterministic", () => {
    const parentA = new Mulberry32Rng(77);
    const parentB = new Mulberry32Rng(77);
    const childA = parentA.fork();
    const childB = parentB.fork();
    expect(childA.next()).toBe(childB.next());
    // Parents continue identically after forking.
    expect(parentA.next()).toBe(parentB.next());
    // Child and parent do not mirror each other.
    expect(childA.next()).not.toBe(parentA.next());
  });

  it("round-trips through getState / fromState", () => {
    const original = new Mulberry32Rng(31337);
    original.next();
    original.next();
    const snapshot = original.getState();
    const restored = Mulberry32Rng.fromState(
      JSON.parse(JSON.stringify(snapshot)) as typeof snapshot,
    );
    expect(restored.next()).toBe(original.next());
    expect(restored.next()).toBe(original.next());
  });

  it("refuses to restore a foreign algorithm's state", () => {
    expect(() =>
      Mulberry32Rng.fromState({ algorithm: "xorshift", state: 1 }),
    ).toThrow(/xorshift/);
  });
});
