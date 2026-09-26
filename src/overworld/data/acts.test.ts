import { describe, expect, it } from "vitest";

import { ACT_IDS } from "../../content/model/act-id";
import { MISSION_DIFFICULTY_RANGE } from "../../content/model/mission-type";
import { MISSION_TYPE_IDS } from "../../content/model/mission-type-id";
import { ACTS } from "./acts";

describe("ACTS", () => {
  it("defines every act under its own id", () => {
    expect(Object.keys(ACTS).sort()).toEqual([...ACT_IDS].sort());
    for (const id of ACT_IDS) {
      expect(ACTS[id].id).toBe(id);
      expect(ACTS[id].name.length, id).toBeGreaterThan(0);
    }
  });

  it("caps the board at 3, 4 and 5 offers (arc D3)", () => {
    expect(ACT_IDS.map((id) => ACTS[id].boardCap)).toEqual([3, 4, 5, 5]);
  });

  it("uses the arc's difficulty bands, inside the difficulty range", () => {
    expect(ACT_IDS.map((id) => ACTS[id].difficultyBand)).toEqual([
      { min: 1, max: 4 },
      { min: 3, max: 7 },
      { min: 5, max: 9 },
      { min: 8, max: 10 },
    ]);
    for (const id of ACT_IDS) {
      const band = ACTS[id].difficultyBand;
      expect(Number.isInteger(band.min) && Number.isInteger(band.max)).toBe(
        true,
      );
      expect(band.min).toBeGreaterThanOrEqual(MISSION_DIFFICULTY_RANGE.min);
      expect(band.max).toBeLessThanOrEqual(MISSION_DIFFICULTY_RANGE.max);
      expect(band.min).toBeLessThanOrEqual(band.max);
    }
  });

  it("never lowers the band floor as the campaign goes on", () => {
    const floors = ACT_IDS.map((id) => ACTS[id].difficultyBand.min);
    expect(floors).toEqual([...floors].sort((a, b) => a - b));
  });

  it("weights clearance 33 / 25 / 20, crash site and evacuation 33 / 10 / 10, tunnel sabotage – / 20 / 20, and draws nothing in the finale (arc §5)", () => {
    expect(ACT_IDS.map((id) => ACTS[id].typeWeights)).toEqual([
      { "infestation-clearance": 33, "crash-site": 33, evacuation: 33 },
      {
        "infestation-clearance": 25,
        "crash-site": 10,
        evacuation: 10,
        "tunnel-sabotage": 20,
      },
      {
        "infestation-clearance": 20,
        "crash-site": 10,
        evacuation: 10,
        "tunnel-sabotage": 20,
      },
      {},
    ]);
  });

  it("gives trigger-driven Defend Installation no weight in any act", () => {
    for (const id of ACT_IDS) {
      expect(ACTS[id].typeWeights).not.toHaveProperty("defend-installation");
    }
  });

  it("gives trigger-driven Hive Assault no weight in any act", () => {
    // Every hive is pinned its own offer (hive-assault-trigger.ts), so no
    // hive is ever left for the board: the arc's "20% for non-pinned
    // hives" row has nothing to draw.
    for (const id of ACT_IDS) {
      expect(ACTS[id].typeWeights).not.toHaveProperty("hive-assault");
    }
  });

  it("weighs only known types, with positive finite weights", () => {
    for (const id of ACT_IDS) {
      for (const [typeId, weight] of Object.entries(ACTS[id].typeWeights)) {
        expect(MISSION_TYPE_IDS as readonly string[], id).toContain(typeId);
        expect(Number.isFinite(weight) && weight > 0, `${id} ${typeId}`).toBe(
          true,
        );
      }
    }
  });

  it("offers one sitrep slot until Act III and two after, each at 40% (arc §11)", () => {
    expect(ACT_IDS.map((id) => ACTS[id].sitrepSlots)).toEqual([1, 1, 2, 2]);
    for (const id of ACT_IDS) {
      expect(ACTS[id].sitrepChance, id).toBe(0.4);
    }
  });
});
