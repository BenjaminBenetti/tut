import { describe, expect, it } from "vitest";
import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { SHOP_INTERIOR_VARIANTS } from "../../data/shop-interiors";
import { selectInteriorVariant } from "./interior-variant-selector";

describe("interior variant selection", () => {
  it("offers every business before repeating and stays balanced on larger maps", () => {
    const used = new Map<string, number>();
    const rng = new Mulberry32Rng(52);
    const first = SHOP_INTERIOR_VARIANTS.map(
      () => selectInteriorVariant(SHOP_INTERIOR_VARIANTS, used, rng)?.id,
    );
    expect(new Set(first).size).toBe(SHOP_INTERIOR_VARIANTS.length);
    for (let i = 0; i < 18; i++)
      selectInteriorVariant(SHOP_INTERIOR_VARIANTS, used, rng);
    const counts = [...used.values()];
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("replays a seed while allowing different neighbourhood identities", () => {
    /** Draws the business mix for a fresh map, with no state leaking across runs. */
    const sequence = (seed: number): (string | undefined)[] => {
      const rng = new Mulberry32Rng(seed);
      const used = new Map<string, number>();
      return Array.from(
        { length: 12 },
        () => selectInteriorVariant(SHOP_INTERIOR_VARIANTS, used, rng)?.id,
      );
    };
    expect(sequence(31)).toEqual(sequence(31));
    expect(sequence(31)).not.toEqual(sequence(32));
  });

  it("leaves unthemed templates alone", () => {
    expect(
      selectInteriorVariant([], new Map(), new Mulberry32Rng(1)),
    ).toBeUndefined();
  });
});
