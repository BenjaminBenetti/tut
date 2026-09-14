import { DEFAULT_WEAPON_NAME, PRIMARY_WEAPON_ID } from "../model/unit-weapon";
import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { PassMask } from "../../mapgen/model/pass-mask";
import { MECH_RATING_TUNING } from "../../roster/data/mech-rating-tuning";
import { STARTER_PARTS } from "../../roster/data/parts";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_LOADOUT } from "../../roster/data/starter-roster";
import { UPGRADE_TUNING } from "../../roster/data/upgrade-tuning";
import type { Mech } from "../../roster/model/mech";
import type { MechStatSheet } from "../../roster/model/mech-stat-sheet";
import type { Squad } from "../../roster/model/squad";
import type { SquadType } from "../../roster/model/squad-type";
import { StaticPartCatalogue } from "../../roster/repository/static-part-catalogue";
import { validateLoadout } from "../../roster/service/loadout-validation-service";
import { createMech } from "../../roster/service/mech-factory";
import { UNIT_TUNING } from "../data/unit-tuning";
import type { BugUnitSource } from "../model/bug-unit-source";
import { passMaskFor } from "../model/unit";
import type { UnitFactoryDeps, UnitPlacement } from "./unit-factory";
import { bugUnit, mechUnit, squadUnit, templateIdFor } from "./unit-factory";

// ===========================================
// Fixtures
// ===========================================

const RIFLE = SQUAD_TYPES.find((t) => t.id === "rifle");
const ROCKET = SQUAD_TYPES.find((t) => t.id === "rocket");
if (!RIFLE || !ROCKET) throw new Error("shipped squad types missing");

const AT: UnitPlacement = { pos: { x: 3, y: 0, z: 4 }, facing: "n" };

function squad(strength = 5, typeId = "rifle"): Squad {
  return {
    id: "squad-1",
    name: "Alpha",
    typeId,
    strength,
    maxStrength: 5,
    kills: 0,
    missionsSurvived: 0,
    xp: 0,
  };
}

function deps(): UnitFactoryDeps {
  return { ids: new SequentialIdGenerator(), tuning: UNIT_TUNING };
}

/** The starter mech and its validated sheet. */
function starterMech(damage = 0): { mech: Mech; sheet: MechStatSheet } {
  const mech = {
    ...createMech(STARTER_LOADOUT, "mech-1", "Hammerhead"),
    damage,
  };
  const result = validateLoadout(
    STARTER_LOADOUT,
    new StaticPartCatalogue(STARTER_PARTS),
    MECH_RATING_TUNING,
    UPGRADE_TUNING,
  );
  if (!result.ok) throw new Error("starter loadout should validate");
  return { mech, sheet: result.value };
}

const SWARMER: BugUnitSource = {
  id: "swarmer",
  name: "Swarmer",
  hp: 6,
  armor: 0,
  move: 7,
  ap: 2,
  weapon: { range: 1, accuracy: 60, damage: 3, armorPen: 0 },
  sightRange: 12,
  modelId: "bug.swarmer",
};

// ===========================================
// Squads
// ===========================================

describe("squadUnit", () => {
  it("derives the template from the squad type and the unit from the squad", () => {
    const { unit, template } = squadUnit(squad(), RIFLE, AT, deps());
    expect(template).toEqual({
      id: "squad:squad-1",
      name: "Rifle Squad",
      maxHp: 20,
      maxAp: 2,
      move: 5,
      weapons: [
        {
          id: PRIMARY_WEAPON_ID,
          name: "Carbine",
          profile: { range: 8, accuracy: 65, damage: 3, armorPen: 0 },
          charges: 3,
        },
      ],
      sightRange: 12,
      armor: 0,
      passClass: "infantry",
      modelId: "tdf.infantry.rifle",
      // A green squad is a Private, and a Private earns nothing yet (#1130).
      rank: { name: "Private", index: 0 },
    });
    expect(unit).toEqual({
      id: "unit-1",
      kind: "squad",
      team: "tdf",
      sourceId: "squad-1",
      templateId: "squad:squad-1",
      pos: { x: 3, y: 0, z: 4 },
      facing: "n",
      hp: 20,
      maxHp: 20,
      ap: 2,
      maxAp: 2,
      status: [],
      passClass: "infantry",
      charges: { [PRIMARY_WEAPON_ID]: 3 },
    });
  });

  it("starts a depleted squad hurt and scales damage with the type's rating", () => {
    const { unit } = squadUnit(squad(2), RIFLE, AT, deps());
    expect(unit.hp).toBe(8);
    expect(unit.maxHp).toBe(20);
    const rocket = squadUnit(squad(5, "rocket"), ROCKET, AT, deps());
    expect(rocket.template.weapons[0]!.profile.damage).toBe(
      Math.ceil(ROCKET.combatRating * deps().tuning.infantry.weapon.damage),
    );
    expect(rocket.template.modelId).toBe("tdf.infantry.rocket");
  });

  it("falls back to the default model for an unknown squad type and never hits for zero", () => {
    const odd: SquadType = {
      ...RIFLE,
      id: "cavalry",
      name: "Cavalry",
      combatRating: 1,
    };
    const { template } = squadUnit(squad(5, "cavalry"), odd, AT, deps());
    expect(template.modelId).toBe(UNIT_TUNING.infantry.fallbackModelId);
    expect(template.weapons[0]!.profile.damage).toBe(1);
  });

  /**
   * Each squad type fights with its own weapon (#1130): the numbers here
   * are the table on `UNIT_TUNING.infantry.weaponByType`, pinned so a
   * tuning slip shows up as a diff rather than in play.
   */
  it("arms each shipped squad type with its own weapon", () => {
    const armed = Object.fromEntries(
      SQUAD_TYPES.map((type) => {
        const weapon = squadUnit(squad(5, type.id), type, AT, deps()).template
          .weapons[0]!;
        const { range, accuracy, damage, armorPen, endsTurn } = weapon.profile;
        return [
          type.id,
          {
            name: weapon.name,
            range,
            accuracy,
            damage,
            armorPen,
            endsTurn,
            charges: weapon.charges,
          },
        ];
      }),
    );
    expect(armed).toEqual({
      rifle: {
        name: "Carbine",
        range: 8,
        accuracy: 65,
        damage: 3,
        armorPen: 0,
        endsTurn: undefined,
        charges: 3,
      },
      medic: {
        name: "Carbine",
        range: 8,
        accuracy: 65,
        damage: 2,
        armorPen: 0,
        endsTurn: undefined,
        charges: 3,
      },
      radio: {
        name: "SMG",
        range: 5,
        accuracy: 70,
        damage: 4,
        armorPen: 0,
        endsTurn: true,
        charges: 4,
      },
      engineer: {
        name: "Shotgun",
        range: 3,
        accuracy: 75,
        damage: 5,
        armorPen: 0,
        endsTurn: undefined,
        charges: 2,
      },
      sniper: {
        name: "Marksman Rifle",
        range: 12,
        accuracy: 80,
        damage: 6,
        armorPen: 0,
        endsTurn: true,
        charges: 2,
      },
      rocket: {
        name: "Rocket Launcher",
        range: 10,
        accuracy: 65,
        damage: 5,
        armorPen: 2,
        endsTurn: true,
        charges: 1,
      },
    });
    // The rocket keeps its blast and its force (#1121).
    const rocket = squadUnit(squad(5, "rocket"), ROCKET, AT, deps()).template
      .weapons[0]!.profile;
    expect(rocket.aoe).toEqual({ radius: 1, falloff: 0.5 });
    expect(rocket.demoForce).toBe(2);
  });

  it("gives a squad type with no weapon tuning the shared shape under the fallback name", () => {
    const odd: SquadType = { ...RIFLE, id: "cavalry", name: "Cavalry" };
    const { template } = squadUnit(squad(5, "cavalry"), odd, AT, deps());
    const weapon = template.weapons[0]!;
    expect(weapon.name).toBe(UNIT_TUNING.infantry.fallbackWeaponName);
    expect(weapon.profile).toEqual({
      ...UNIT_TUNING.infantry.weapon,
      damage: 3,
    });
    expect(weapon.profile.endsTurn).toBeUndefined();
  });

  it("scales the rating's damage by the type's scale, never to zero", () => {
    const tuning = {
      ...UNIT_TUNING,
      infantry: {
        ...UNIT_TUNING.infantry,
        weaponByType: { rifle: { damageScale: 0.01 } },
      },
    };
    const { template } = squadUnit(squad(), RIFLE, AT, { ...deps(), tuning });
    expect(template.weapons[0]!.profile.damage).toBe(1);
  });
});

// ===========================================
// Ranks (#1130)
// ===========================================

describe("rank bonuses", () => {
  const rifle = () => squadUnit(squad(), RIFLE, AT, deps()).template;

  it("gives a Corporal (30 xp, three swarmers) one more tile of move and nothing else", () => {
    const { unit, template } = squadUnit(
      { ...squad(), xp: 30 },
      RIFLE,
      AT,
      deps(),
    );
    expect(template.rank).toEqual({ name: "Corporal", index: 2 });
    expect(template.move).toBe(rifle().move + 1);
    expect(template.maxAp).toBe(rifle().maxAp);
    expect(template.weapons[0]?.profile.accuracy).toBe(
      rifle().weapons[0]!.profile.accuracy + 4,
    );
    expect(unit.maxAp).toBe(template.maxAp);
  });

  it("gives a Staff Sergeant (100 xp, ten swarmers) a third action point", () => {
    const { unit, template } = squadUnit(
      { ...squad(), xp: 100 },
      RIFLE,
      AT,
      deps(),
    );
    expect(template.rank?.name).toBe("Staff Sergeant");
    expect(template.maxAp).toBe(3);
    expect(unit.ap).toBe(3);
    expect(template.move).toBe(rifle().move + 2);
  });

  it("lifts a mech pilot the same way, on every weapon, and never past 100 accuracy", () => {
    const { mech, sheet } = starterMech();
    const green = mechUnit(mech, sheet, AT, deps()).template;
    const veteran = mechUnit({ ...mech, xp: 100 }, sheet, AT, deps()).template;
    expect(veteran.rank).toEqual({ name: "Staff Sergeant", index: 4 });
    expect(veteran.move).toBe(green.move + 2);
    expect(veteran.maxAp).toBe(green.maxAp + 1);
    for (const [i, weapon] of veteran.weapons.entries()) {
      expect(weapon.profile.accuracy).toBe(
        Math.min(100, green.weapons[i]!.profile.accuracy + 8),
      );
    }
    const sharp = mechUnit(
      { ...mech, xp: 100 },
      { ...sheet, accuracy: 40 },
      AT,
      deps(),
    ).template;
    for (const weapon of sharp.weapons) {
      expect(weapon.profile.accuracy).toBeLessThanOrEqual(100);
    }
  });

  it("stops at the top of the ladder however much experience piles up", () => {
    const top = deps().tuning.ranks.ladder.length - 1;
    const { template } = squadUnit(
      { ...squad(), xp: 1_000_000 },
      RIFLE,
      AT,
      deps(),
    );
    expect(template.rank?.index).toBe(top);
  });

  it("copies what a bug is worth onto its template, and nothing when the species says nothing", () => {
    expect(
      bugUnit({ ...SWARMER, xpValue: 10 }, AT, deps()).template.xpValue,
    ).toBe(10);
    expect(bugUnit(SWARMER, AT, deps()).template).not.toHaveProperty("xpValue");
  });
});

// ===========================================
// Mechs
// ===========================================

describe("mechUnit", () => {
  it("derives the template from the stat sheet", () => {
    const { mech, sheet } = starterMech();
    const { unit, template } = mechUnit(mech, sheet, AT, deps());
    // The Vanguard's plate was halved in #1130: 20 armor on the sheet
    // is 70 hit points and 6 per hit, where 30 was 80 and 9.
    expect(sheet).toMatchObject({
      armor: 20,
      mobility: 5,
      accuracy: 0,
      firepower: 40,
    });
    expect(template).toMatchObject({
      id: "mech:mech-1",
      name: "Hammerhead",
      maxHp: 70,
      maxAp: 2,
      move: 8,
      sightRange: 14,
      armor: 6,
      passClass: "mech",
      modelId: "tdf.mech.assembled-a",
    });
    // The loadout rides along, so graphics draws the parts the player
    // fitted rather than the reference assembly (#1115).
    expect(template.loadout).toBe(mech.loadout);
    // One attack per fitted weapon (#532), each with that part's own
    // reach and penetration rather than the tuning's single profile.
    expect(template.weapons).toHaveLength(sheet.weapons.length);
    expect(sheet.weapons.length).toBeGreaterThan(0);
    for (const [i, fitted] of sheet.weapons.entries()) {
      expect(template.weapons[i]).toMatchObject({
        id: fitted.id,
        name: fitted.name,
        charges: UNIT_TUNING.mech.charges,
      });
      expect(template.weapons[i]?.profile.range).toBe(fitted.range);
      expect(template.weapons[i]?.profile.armorPen).toBe(fitted.armorPen);
    }
    expect(unit).toMatchObject({
      kind: "mech",
      team: "tdf",
      sourceId: "mech-1",
      hp: 70,
      maxHp: 70,
      passClass: "mech",
    });
  });

  it("starts a damaged mech reduced by its accumulated damage", () => {
    const { mech, sheet } = starterMech(25);
    const { unit } = mechUnit(mech, sheet, AT, deps());
    // 70 × 75 % is 52.5, and the factory rounds half up.
    expect(unit.hp).toBe(53);
    expect(unit.maxHp).toBe(70);
  });

  it("clamps move and accuracy into their bounds", () => {
    const { mech, sheet } = starterMech();
    const sluggish: MechStatSheet = { ...sheet, mobility: -10, accuracy: 500 };
    const { template } = mechUnit(mech, sluggish, AT, deps());
    expect(template.move).toBe(UNIT_TUNING.mech.minMove);
    expect(template.weapons[0]!.profile.accuracy).toBe(100);
  });
});

// ===========================================
// Bugs
// ===========================================

describe("bugUnit", () => {
  it("takes the species stats as they are and shares one template per species", () => {
    const d = deps();
    const first = bugUnit(SWARMER, AT, d);
    const second = bugUnit(
      SWARMER,
      { pos: { x: 1, y: 0, z: 1 }, facing: "s" },
      d,
    );
    expect(first.template).toEqual({
      id: "bug:swarmer",
      name: "Swarmer",
      maxHp: 6,
      maxAp: 2,
      move: 7,
      weapons: [
        {
          id: PRIMARY_WEAPON_ID,
          name: DEFAULT_WEAPON_NAME,
          profile: SWARMER.weapon,
        },
      ],
      sightRange: SWARMER.sightRange,
      armor: 0,
      passClass: "infantry",
      modelId: "bug.swarmer",
    });
    expect("charges" in first.unit).toBe(false);
    expect(second.template).toEqual(first.template);
    expect([first.unit.id, second.unit.id]).toEqual(["unit-1", "unit-2"]);
    expect(first.unit).toMatchObject({
      kind: "bug",
      team: "bugs",
      sourceId: "swarmer",
      hp: 6,
    });
    expect(second.unit.facing).toBe("s");
  });
});

// ===========================================
// Contract
// ===========================================

describe("unit factory contract", () => {
  it("round-trips every build through JSON and is deterministic", () => {
    const { mech, sheet } = starterMech(10);
    const builds = [
      squadUnit(squad(4), RIFLE, AT, deps()),
      mechUnit(mech, sheet, AT, deps()),
      bugUnit(SWARMER, AT, deps()),
    ];
    for (const build of builds) {
      expect(JSON.parse(JSON.stringify(build))).toEqual(build);
      expect(build.unit.templateId).toBe(build.template.id);
      expect(build.unit.maxHp).toBe(build.template.maxHp);
      expect(build.unit.ap).toBe(build.template.maxAp);
      expect(build.unit.passClass).toBe(build.template.passClass);
    }
    expect(squadUnit(squad(), RIFLE, AT, deps())).toEqual(
      squadUnit(squad(), RIFLE, AT, deps()),
    );
  });

  it("never mutates its inputs", () => {
    const s = squad(3);
    const before = JSON.parse(JSON.stringify(s)) as Squad;
    squadUnit(s, RIFLE, AT, deps());
    expect(s).toEqual(before);
    const { mech, sheet } = starterMech(40);
    const mechBefore = JSON.parse(JSON.stringify(mech)) as Mech;
    mechUnit(mech, sheet, AT, deps());
    expect(mech).toEqual(mechBefore);
  });

  it("names templates by kind and source and maps pass classes to mapgen masks", () => {
    expect(templateIdFor("squad", "squad-7")).toBe("squad:squad-7");
    expect(passMaskFor("infantry")).toBe(PassMask.INFANTRY);
    expect(passMaskFor("mech")).toBe(PassMask.MECH);
  });
});

describe("bugUnit with a footprint (#1130)", () => {
  it("copies a species' footprint onto the template and leaves it off otherwise", () => {
    const d = deps();
    const big = bugUnit({ ...SWARMER, id: "big", footprint: 2 }, AT, d);
    expect(big.template.footprint).toBe(2);
    expect("footprint" in bugUnit(SWARMER, AT, d).template).toBe(false);
  });
});
