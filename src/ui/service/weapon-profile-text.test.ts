import { describe, expect, it } from "vitest";

import { weaponProfileText } from "./weapon-profile-text";

describe("weaponProfileText (#1132)", () => {
  it("prints the four numbers every weapon has", () => {
    expect(
      weaponProfileText({ range: 8, accuracy: 65, damage: 3, armorPen: 0 }),
    ).toBe("range 8 · acc 65 · dmg 3 · pen 0");
  });

  it("adds the blast, the fire and the force only when the weapon has them", () => {
    expect(
      weaponProfileText({
        range: 12,
        accuracy: 60,
        damage: 18,
        armorPen: 1,
        aoe: { radius: 2, falloff: 0.4 },
        aoeEffect: { kind: "fire", chance: 0.5, falloff: 0.5 },
        demoForce: 2,
      }),
    ).toBe("range 12 · acc 60 · dmg 18 · pen 1 · blast 2 · fire · demo 2");
    expect(
      weaponProfileText({
        range: 10,
        accuracy: 75,
        damage: 18,
        armorPen: 2,
        demoForce: 0,
      }),
    ).toBe("range 10 · acc 75 · dmg 18 · pen 2");
  });

  it("ends with the weapon's damage tags, the kinds of hit a plate may resist (campaign arc §10.2)", () => {
    expect(
      weaponProfileText({
        range: 6,
        accuracy: 60,
        damage: 4,
        armorPen: 1,
        tags: ["acid"],
      }),
    ).toBe("range 6 · acc 60 · dmg 4 · pen 1 · acid");
  });

  it("says what armour-piercing rounds add right after the gun's own pen (campaign arc §10.2)", () => {
    expect(
      weaponProfileText({
        range: 10,
        accuracy: 70,
        damage: 18,
        armorPen: 2,
        pierce: 2,
        demoForce: 1,
      }),
    ).toBe("range 10 · acc 70 · dmg 18 · pen 2 · AP +2 · demo 1");
    expect(
      weaponProfileText({
        range: 10,
        accuracy: 70,
        damage: 18,
        armorPen: 2,
        pierce: 0,
      }),
    ).toBe("range 10 · acc 70 · dmg 18 · pen 2");
  });
});
