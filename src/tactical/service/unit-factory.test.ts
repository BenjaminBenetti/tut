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
      weapon: { range: 8, accuracy: 65, damage: 3, armorPen: 0 },
      armor: 0,
      passClass: "infantry",
      modelId: "tdf.infantry.rifle",
      charges: 3,
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
      charges: 3,
    });
  });

  it("starts a depleted squad hurt and scales damage with the type's rating", () => {
    const { unit } = squadUnit(squad(2), RIFLE, AT, deps());
    expect(unit.hp).toBe(8);
    expect(unit.maxHp).toBe(20);
    const rocket = squadUnit(squad(5, "rocket"), ROCKET, AT, deps());
    expect(rocket.template.weapon.damage).toBe(
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
    expect(template.weapon.damage).toBe(1);
  });
});

// ===========================================
// Mechs
// ===========================================

describe("mechUnit", () => {
  it("derives the template from the stat sheet", () => {
    const { mech, sheet } = starterMech();
    const { unit, template } = mechUnit(mech, sheet, AT, deps());
    expect(sheet).toMatchObject({
      armor: 30,
      mobility: 7,
      accuracy: 0,
      firepower: 40,
    });
    expect(template).toEqual({
      id: "mech:mech-1",
      name: "Hammerhead",
      maxHp: 80,
      maxAp: 2,
      move: 8,
      weapon: { range: 10, accuracy: 70, damage: 40, armorPen: 2 },
      armor: 9,
      passClass: "mech",
      modelId: "tdf.mech.assembled-a",
      charges: 4,
    });
    expect(unit).toMatchObject({
      kind: "mech",
      team: "tdf",
      sourceId: "mech-1",
      hp: 80,
      maxHp: 80,
      passClass: "mech",
    });
  });

  it("starts a damaged mech reduced by its accumulated damage", () => {
    const { mech, sheet } = starterMech(25);
    const { unit } = mechUnit(mech, sheet, AT, deps());
    expect(unit.hp).toBe(60);
    expect(unit.maxHp).toBe(80);
  });

  it("clamps move and accuracy into their bounds", () => {
    const { mech, sheet } = starterMech();
    const sluggish: MechStatSheet = { ...sheet, mobility: -10, accuracy: 500 };
    const { template } = mechUnit(mech, sluggish, AT, deps());
    expect(template.move).toBe(UNIT_TUNING.mech.minMove);
    expect(template.weapon.accuracy).toBe(100);
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
      weapon: SWARMER.weapon,
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
