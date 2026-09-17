import { describe, expect, it } from "vitest";

import { DEPLOYABLE_TYPES } from "../data/deployable-types";
import { DEPLOYABLE_LEVELS } from "../model/deployable-level";
import { DEPLOYABLE_TYPE_IDS } from "../model/deployable-type";
import {
  describeDeployableEffect,
  describeEffect,
  describeEffectDelta,
  summarizeDeployableEffect,
} from "./deployable-effect-describer";

const SENSOR = DEPLOYABLE_TYPES["sensor-array"];
const REPELLENT = DEPLOYABLE_TYPES["repellent-dispersal"];
const BATTERY = DEPLOYABLE_TYPES["defensive-battery"];
const BANK = DEPLOYABLE_TYPES.bank;

describe("describeDeployableEffect", () => {
  it("describes a level 1 sensor array with its price and the level 2 deltas", () => {
    expect(describeDeployableEffect(SENSOR, 1)).toEqual({
      level: 1,
      effects: [
        "Finds infested cities at 60% of the usual infestation",
        "Missions stay on offer 1 day longer",
      ],
      cost: 800,
      upkeepPerDay: 20,
      next: {
        level: 2,
        cost: 1000,
        upkeepPerDay: 35,
        deltas: [
          "Finds infested cities at 40% of the usual infestation (from 60%)",
          "Missions stay on offer 2 days longer (from 1 day)",
        ],
      },
    });
  });

  it("phrases a repellent as a growth slowdown, so a smaller factor reads as a bigger number", () => {
    const l1 = describeDeployableEffect(REPELLENT, 1);
    expect(l1.effects).toEqual([
      "Slows infestation growth by 25%",
      "Fresh landings 25% rarer",
    ]);
    expect(l1.next?.deltas[0]).toBe(
      "Slows infestation growth by 45% (from 25%)",
    );
  });

  it("counts a battery's garrison turrets and a bank's credits", () => {
    expect(describeDeployableEffect(BATTERY, 1).effects).toEqual([
      "1 garrison turret on every mission map",
    ]);
    expect(describeDeployableEffect(BATTERY, 2).effects).toEqual([
      "2 garrison turrets on every mission map",
    ]);
    expect(describeDeployableEffect(BANK, 3)).toEqual({
      level: 3,
      effects: ["+¢600 to the daily stipend"],
      cost: 2000,
      upkeepPerDay: 100,
    });
  });

  it("has a next level below the top and none at it, for every type", () => {
    for (const id of DEPLOYABLE_TYPE_IDS) {
      const type = DEPLOYABLE_TYPES[id];
      expect(describeDeployableEffect(type, 1).next?.level, id).toBe(2);
      expect(describeDeployableEffect(type, 2).next?.level, id).toBe(3);
      expect(describeDeployableEffect(type, 3).next, id).toBeUndefined();
      for (const level of DEPLOYABLE_LEVELS) {
        const spec = type.levels[level];
        const description = describeDeployableEffect(type, level);
        expect(description.cost, `${id}/L${String(level)}`).toBe(
          spec.buildCost,
        );
        expect(description.upkeepPerDay).toBe(spec.upkeepPerDay);
        expect(description.effects.length).toBe(
          Object.keys(spec.effect).length,
        );
      }
    }
  });
});

describe("describeEffect and describeEffectDelta", () => {
  it("lists axes in the catalogue's fixed order and skips absent ones", () => {
    expect(describeEffect({ incomeBonus: 150, detectionFactor: 0.5 })).toEqual([
      "Finds infested cities at 50% of the usual infestation",
      "+¢150 to the daily stipend",
    ]);
    expect(describeEffect({})).toEqual([]);
  });

  it("reads an axis the earlier level lacked as a plain line", () => {
    expect(describeEffectDelta({}, { garrisonTurrets: 3 })).toEqual([
      "3 garrison turrets on every mission map",
    ]);
    expect(
      describeEffectDelta({ incomeBonus: 150 }, { incomeBonus: 1500 }),
    ).toEqual(["+¢1,500 to the daily stipend (from +¢150)"]);
  });

  it("rounds fractions to whole percents", () => {
    expect(describeEffect({ growthFactor: 0.333 })).toEqual([
      "Slows infestation growth by 67%",
    ]);
  });
});

describe("summarizeDeployableEffect", () => {
  it("joins the effect lines with a middle dot", () => {
    expect(summarizeDeployableEffect(SENSOR, 3)).toBe(
      "Finds infested cities at 20% of the usual infestation · Missions stay on offer 3 days longer",
    );
    expect(summarizeDeployableEffect(BANK, 1)).toBe(
      "+¢150 to the daily stipend",
    );
  });
});
