import { describe, expect, it } from "vitest";

import { MAX_INFESTATION, MIN_INFESTATION } from "../model/city";
import { EARTH_MAP } from "./earth-map";
import { NEW_GAME_TUNING } from "./new-game-tuning";

describe("NEW_GAME_TUNING", () => {
  it("uses integer ranges with min <= max", () => {
    for (const range of [
      NEW_GAME_TUNING.infestedCities,
      NEW_GAME_TUNING.initialInfestation,
    ]) {
      expect(Number.isInteger(range.min)).toBe(true);
      expect(Number.isInteger(range.max)).toBe(true);
      expect(range.min).toBeLessThanOrEqual(range.max);
    }
  });

  it("infests at least one city and never more than Earth has", () => {
    expect(NEW_GAME_TUNING.infestedCities.min).toBeGreaterThanOrEqual(1);
    expect(NEW_GAME_TUNING.infestedCities.max).toBeLessThanOrEqual(
      EARTH_MAP.cities.length,
    );
  });

  it("seeds infestation that is visible but not overrun", () => {
    expect(NEW_GAME_TUNING.initialInfestation.min).toBeGreaterThan(
      MIN_INFESTATION,
    );
    expect(NEW_GAME_TUNING.initialInfestation.max).toBeLessThan(
      MAX_INFESTATION,
    );
  });
});
