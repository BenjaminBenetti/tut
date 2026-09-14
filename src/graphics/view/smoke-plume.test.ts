import { DataTexture, Sprite } from "three";
import { describe, expect, it } from "vitest";

import type { SmokePlumeOptions } from "../model/smoke-plume-options";
import { SMOKE_PLUME_NAME, SmokePlume } from "./smoke-plume";

/** A small, legible preset: four puffs on a two-second loop. */
const OPTIONS: SmokePlumeOptions = {
  puffs: 4,
  colour: 0x123456,
  baseScale: 0.4,
  growth: 0.6,
  startHeight: 0.5,
  rise: 1,
  period: 2,
  peakOpacity: 0.8,
  drift: 0.1,
};

/** The puffs of a plume, in creation order. */
function puffsOf(plume: SmokePlume): Sprite[] {
  return plume.root.children.filter((c): c is Sprite => c instanceof Sprite);
}

describe("SmokePlume (#1132)", () => {
  it("builds one sprite per puff, coloured and depth-passive, under a named root", () => {
    const falloff = new DataTexture();
    const plume = new SmokePlume(OPTIONS, falloff, "plume-under-test");
    expect(plume.root.name).toBe("plume-under-test");
    expect(new SmokePlume(OPTIONS, falloff).root.name).toBe(SMOKE_PLUME_NAME);
    const puffs = puffsOf(plume);
    expect(puffs).toHaveLength(4);
    for (const puff of puffs) {
      expect(puff.material.color.getHex()).toBe(0x123456);
      expect(puff.material.alphaMap).toBe(falloff);
      expect(puff.material.depthWrite).toBe(false);
      expect(puff.material.transparent).toBe(true);
    }
  });

  it("places the puffs before the first frame, spread over the loop", () => {
    const plume = new SmokePlume(OPTIONS, new DataTexture());
    const heights = puffsOf(plume).map((p) => p.position.y);
    // Offsets are i/4 of the period, so the puffs stand at t = 0, ¼, ½, ¾.
    expect(heights).toEqual([0.5, 0.75, 1, 1.25]);
  });

  it("lifts, swells, fades in then out along one loop", () => {
    const plume = new SmokePlume({ ...OPTIONS, puffs: 1 }, new DataTexture());
    const [puff] = puffsOf(plume);
    if (puff === undefined) throw new Error("no puff");
    // Born: at the start height, base size, invisible.
    expect(puff.position.y).toBeCloseTo(0.5);
    expect(puff.scale.x).toBeCloseTo(0.4);
    expect(puff.material.opacity).toBe(0);
    // A quarter in: risen a quarter, fully faded in, at its peak.
    plume.update(0.5);
    expect(puff.position.y).toBeCloseTo(0.75);
    expect(puff.scale.x).toBeCloseTo(0.55);
    expect(puff.material.opacity).toBeCloseTo(0.8 * 0.75);
    // Half way: higher, bigger, fading out.
    plume.update(0.5);
    expect(puff.position.y).toBeCloseTo(1);
    expect(puff.scale.x).toBeCloseTo(0.7);
    expect(puff.material.opacity).toBeCloseTo(0.4);
    // The loop wraps: back to birth.
    plume.update(1);
    expect(puff.position.y).toBeCloseTo(0.5);
    expect(puff.material.opacity).toBeCloseTo(0);
  });

  it("never exceeds its peak opacity or leaves the rise", () => {
    const plume = new SmokePlume(OPTIONS, new DataTexture());
    for (let step = 0; step < 50; step++) {
      plume.update(0.137);
      for (const puff of puffsOf(plume)) {
        expect(puff.material.opacity).toBeGreaterThanOrEqual(0);
        expect(puff.material.opacity).toBeLessThanOrEqual(0.8);
        expect(puff.position.y).toBeGreaterThanOrEqual(0.5);
        expect(puff.position.y).toBeLessThanOrEqual(1.5);
      }
    }
  });

  it("frees its materials and detaches on dispose, leaving the falloff to its owner", () => {
    const falloff = new DataTexture();
    const plume = new SmokePlume(OPTIONS, falloff);
    const puffs = puffsOf(plume);
    let disposed = 0;
    for (const puff of puffs) {
      puff.material.addEventListener("dispose", () => disposed++);
    }
    let falloffDisposed = false;
    falloff.addEventListener("dispose", () => (falloffDisposed = true));
    plume.dispose();
    expect(disposed).toBe(4);
    expect(plume.root.children).toHaveLength(0);
    expect(plume.root.parent).toBeNull();
    expect(falloffDisposed).toBe(false);
  });
});
