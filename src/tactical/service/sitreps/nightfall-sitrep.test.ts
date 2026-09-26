import { describe, expect, it } from "vitest";

import { TileIndex } from "../../../mapgen/service/tile-index";
import { SITREP_TUNING } from "../../data/sitrep-tuning";
import { UNIT_TUNING } from "../../data/unit-tuning";
import { unitAt } from "../tactical-fixtures.test-helper";
import { computeVision, sightRangeOf, unitCanSee } from "../vision-service";
import { fieldMission } from "./sitrep-fixtures.test-helper";
import { nightfallSitrep, nightSight } from "./nightfall-sitrep";

const NIGHT = SITREP_TUNING.nightfall;

describe("nightSight", () => {
  it("takes four off every shipped sight range", () => {
    expect(nightSight(UNIT_TUNING.mech.sightRange, NIGHT)).toBe(
      UNIT_TUNING.mech.sightRange - 4,
    );
    expect(nightSight(UNIT_TUNING.infantry.sightRange, NIGHT)).toBe(
      UNIT_TUNING.infantry.sightRange - 4,
    );
    expect(nightSight(10, NIGHT)).toBe(6);
  });

  it("never takes a unit below three, and never raises one already below it", () => {
    expect(nightSight(7, NIGHT)).toBe(3);
    expect(nightSight(5, NIGHT)).toBe(3);
    expect(nightSight(4, NIGHT)).toBe(3);
    expect(nightSight(3, NIGHT)).toBe(3);
    expect(nightSight(2, NIGHT)).toBe(2);
    expect(nightSight(0, NIGHT)).toBe(0);
  });
});

describe("nightfallSitrep", () => {
  it("is a sight hook only", () => {
    const rule = nightfallSitrep(NIGHT);
    expect(rule.id).toBe("nightfall");
    expect(rule.setup).toBeUndefined();
    expect(rule.phaseStep).toBeUndefined();
    expect(rule.sight?.(12)).toBe(8);
  });
});

describe("Nightfall through the vision service", () => {
  // Fixture units see 8 by day, so 4 by night.
  const bug = unitAt(
    "bug-1",
    "infantry",
    { x: 7, y: 0, z: 1 },
    { team: "bugs" },
  );

  it("shrinks every unit's sight on both sides", () => {
    const day = fieldMission([], { units: [...fieldMission().units, bug] });
    const night = { ...day, sitreps: ["nightfall" as const] };
    for (const unit of day.units) {
      expect(sightRangeOf(day, unit)).toBe(8);
      expect(sightRangeOf(night, unit)).toBe(4);
    }
  });

  it("hides what daylight would show, for the squad and the bugs alike", () => {
    const day = fieldMission([], { units: [...fieldMission().units, bug] });
    const night = { ...day, sitreps: ["nightfall" as const] };
    expect(computeVision(day, "tdf").spotted).toEqual(["bug-1"]);
    expect(computeVision(night, "tdf").spotted).toEqual([]);
    expect(computeVision(day, "bugs").spotted).not.toEqual([]);
    expect(computeVision(night, "bugs").spotted).toEqual([]);
    expect(computeVision(night, "tdf").visible.length).toBeLessThan(
      computeVision(day, "tdf").visible.length,
    );
  });

  it("shortens overwatch reach, which asks unitCanSee", () => {
    const day = fieldMission();
    const night = { ...day, sitreps: ["nightfall" as const] };
    const watcher = day.units[1]!;
    const index = new TileIndex(day.map);
    const six = { x: watcher.pos.x + 6, y: 0, z: watcher.pos.z };
    expect(unitCanSee(day, watcher, six, index)).toBe(true);
    expect(unitCanSee(night, watcher, six, index)).toBe(false);
    const three = { x: watcher.pos.x + 3, y: 0, z: watcher.pos.z };
    expect(unitCanSee(night, watcher, three, index)).toBe(true);
  });

  it("leaves a mission without it alone", () => {
    const day = fieldMission(["local-guides"]);
    expect(sightRangeOf(day, day.units[0]!)).toBe(8);
  });
});
