import { describe, expect, it } from "vitest";

import type { UnitWeapon } from "../model/unit-weapon";
import {
  enterOverwatch,
  leaveOverwatch,
  overwatchShotsLeft,
  spendOverwatchShot,
} from "./overwatch-status";
import { openField, unitAt } from "./tactical-fixtures.test-helper";

const RIFLE: UnitWeapon = {
  id: "primary",
  name: "Carbine",
  profile: { range: 8, accuracy: 65, damage: 3, armorPen: 0 },
};
const TURRET_GUN: UnitWeapon = {
  ...RIFLE,
  name: "Turret gun",
  profile: { ...RIFLE.profile, overwatchShots: 2 },
};
const UNIT = unitAt("u", "infantry", { x: 0, y: 0, z: 0 });

describe("overwatch status (#1138)", () => {
  it("records a count only for a gun that grants more than one shot, so a squad's record is untouched", () => {
    openField();
    const squad = enterOverwatch(UNIT, [RIFLE]);
    expect(squad.status).toEqual(["overwatch"]);
    expect("overwatchShots" in squad).toBe(false);
    expect(overwatchShotsLeft(squad)).toBe(1);
    const turret = enterOverwatch(UNIT, [TURRET_GUN]);
    expect(turret).toMatchObject({ status: ["overwatch"], overwatchShots: 2 });
    // Already watching: the status is not listed twice, the count is renewed.
    expect(
      enterOverwatch({ ...turret, overwatchShots: 1 }, [TURRET_GUN]),
    ).toEqual(turret);
    expect(enterOverwatch(UNIT, []).status).toEqual(["overwatch"]);
  });

  it("spends shots one at a time and clears the watch with the last", () => {
    const two = enterOverwatch(UNIT, [TURRET_GUN]);
    const one = spendOverwatchShot(two);
    expect(one).toMatchObject({ status: ["overwatch"], overwatchShots: 1 });
    const clear = spendOverwatchShot(one);
    expect(clear.status).toEqual([]);
    expect("overwatchShots" in clear).toBe(false);
    expect(spendOverwatchShot(enterOverwatch(UNIT, [RIFLE])).status).toEqual(
      [],
    );
  });

  it("drops the count with the status when a watch lapses", () => {
    const lapsed = leaveOverwatch({
      ...enterOverwatch(UNIT, [TURRET_GUN]),
      status: ["suppressed", "overwatch"],
    });
    expect(lapsed.status).toEqual(["suppressed"]);
    expect("overwatchShots" in lapsed).toBe(false);
  });
});
