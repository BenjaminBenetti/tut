import { describe, expect, it } from "vitest";

import { MISSION_DIFFICULTY_RANGE } from "../../content/model/mission-type";
import type { Mission } from "./mission";

const SAMPLE: Mission = {
  id: "mission-4",
  typeId: "infestation-clearance",
  cityId: "new-york",
  difficulty: 5,
  mapParams: {
    biome: "temperate",
    settlement: "city",
    size: "medium",
    seed: "mission-4:map",
  },
  rewards: { credits: 1500 },
  createdDay: 3,
  expiresDay: 8,
  ignorePenalty: 10,
};

describe("Mission", () => {
  it("round-trips through JSON unchanged", () => {
    const text = JSON.stringify(SAMPLE);
    expect(JSON.parse(text)).toEqual(SAMPLE);
  });

  it("documents a difficulty inside the shared range", () => {
    expect(SAMPLE.difficulty).toBeGreaterThanOrEqual(
      MISSION_DIFFICULTY_RANGE.min,
    );
    expect(SAMPLE.difficulty).toBeLessThanOrEqual(MISSION_DIFFICULTY_RANGE.max);
  });

  it("expires strictly after it was created", () => {
    expect(SAMPLE.expiresDay).toBeGreaterThan(SAMPLE.createdDay);
  });
});
