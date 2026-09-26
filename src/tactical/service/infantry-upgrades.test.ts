import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { INFANTRY_UPGRADES } from "../../roster/data/infantry-upgrades";
import { MEDIC_SQUAD, RIFLE_SQUAD } from "../../roster/data/squad-types";
import type { InfantryUpgradeId } from "../../roster/model/infantry-upgrade";
import type { SquadType } from "../../roster/model/squad-type";
import { COMBAT_TUNING } from "../data/combat-tuning";
import { EQUIPMENT } from "../data/equipment";
import { RADAR_TUNING } from "../data/radar-tuning";
import { TURRET_TUNING } from "../data/turret-tuning";
import { UNIT_TUNING } from "../data/unit-tuning";
import { attack } from "../model/attack-command";
import type { TacticalState } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import { useEquipment } from "../model/use-equipment-command";
import { createEquipmentCatalogue } from "../repository/equipment-catalogue";
import { resolveAttack } from "./combat-service";
import type { EquipmentDeps } from "./equipment-service";
import { createUseEquipmentHandler } from "./equipment-service";
import {
  ctxWith,
  FIXTURE_TEMPLATES,
  fixtureAttackDeps,
  missionWith,
  openField,
  riggedRng,
  unitAt,
} from "./tactical-fixtures.test-helper";
import { squadUnit } from "./unit-factory";

// ===========================================
// Fixtures
// ===========================================
//
// The infantry upgrades of campaign arc §10.3 through the real rules: a
// squad is built by the unit factory with the campaign's upgrades, the
// way mission start builds it, then shot at, throws its grenade or opens
// its medkit through the shipped services and catalogue.
//
//      x → 1  2  3  4  5  6
//   z  1     S  .  B  .  .  B'     S  the upgraded squad (1,1)
//      2     .  .  B  .  .  .      B  a bug on the impact (3,1), one beside it
//                                  B' a bug out of the blast (6,1)

const at = (x: number, z: number): TileCoord => ({ x, y: 0, z });
const SQUAD_AT = at(1, 1);
const IMPACT = at(3, 1);

const ATTACK = fixtureAttackDeps();
const EQUIPMENT_DEPS: EquipmentDeps = {
  catalogue: createEquipmentCatalogue(EQUIPMENT),
  combat: COMBAT_TUNING,
  attack: ATTACK,
  radar: RADAR_TUNING,
  turret: TURRET_TUNING,
};
const useKit = createUseEquipmentHandler(EQUIPMENT_DEPS);

/**
 * A mission with a squad of `type` built by the unit factory under the
 * `upgrades` (id `"squad"`, at (1,1), `hp` if given), and `others`.
 */
function missionWithSquad(
  type: SquadType,
  upgrades: readonly InfantryUpgradeId[],
  others: readonly Unit[] = [],
  options: { readonly hp?: number; readonly phase?: "player" | "bugs" } = {},
): TacticalState {
  const built = squadUnit(
    {
      id: "squad-1",
      name: "Alpha",
      typeId: type.id,
      strength: 5,
      maxStrength: 5,
      kills: 0,
      missionsSurvived: 0,
      xp: 0,
    },
    type,
    { pos: SQUAD_AT, facing: "e" },
    {
      ids: new SequentialIdGenerator(),
      tuning: UNIT_TUNING,
      infantryUpgrades: upgrades.map((id) => INFANTRY_UPGRADES[id]),
    },
  );
  const squad: Unit = {
    ...built.unit,
    id: "squad",
    hp: options.hp ?? built.unit.hp,
  };
  const base = missionWith(openField().build(), [squad, ...others], {
    phase: options.phase ?? "player",
  });
  return {
    ...base,
    templates: { ...base.templates, [built.template.id]: built.template },
  };
}

/** Three bugs of the fixture stats: on the impact, beside it, and out of the blast. */
function bugsAroundImpact(): Unit[] {
  return [
    unitAt("on", "infantry", IMPACT, { team: "bugs" }),
    unitAt("beside", "infantry", at(3, 2), { team: "bugs" }),
    unitAt("off", "infantry", at(6, 1), { team: "bugs" }),
  ];
}

/** Hit points of every unit, by id. */
function hpOf(mission: TacticalState): Record<string, number> {
  return Object.fromEntries(mission.units.map((u) => [u.id, u.hp]));
}

// ===========================================
// Armour
// ===========================================

describe("squad armour through an attack (campaign arc §10.3)", () => {
  /**
   * Hit points a squad under `upgrades` loses to one hit of the fixture
   * bug at the top of its damage band, with the bug's penetration set
   * to `armorPen`.
   */
  function lossFromBite(
    upgrades: readonly InfantryUpgradeId[],
    armorPen: number,
  ): number {
    const mission = missionWithSquad(
      RIFLE_SQUAD,
      upgrades,
      [unitAt("bug", "infantry", at(2, 1), { team: "bugs" })],
      { phase: "bugs" },
    );
    const bug = mission.templates[FIXTURE_TEMPLATES.bug]!;
    const biting: TacticalState = {
      ...mission,
      templates: {
        ...mission.templates,
        [FIXTURE_TEMPLATES.bug]: {
          ...bug,
          weapons: bug.weapons.map((w) => ({
            ...w,
            profile: { ...w.profile, armorPen },
          })),
        },
      },
    };
    const result = resolveAttack(
      biting,
      attack("bug", "squad"),
      ctxWith(riggedRng(true, "high")),
      COMBAT_TUNING,
      ATTACK,
    );
    if (!result.ok) throw new Error(`attack refused: ${result.error.kind}`);
    const before = hpOf(biting).squad!;
    return before - hpOf(result.value.state).squad!;
  }

  it("takes one hit point off a swarmer's bite per rung", () => {
    const bare = lossFromBite([], 0);
    expect(bare).toBeGreaterThan(2);
    expect(lossFromBite(["squad-armour-1"], 0)).toBe(bare - 1);
    expect(lossFromBite(["squad-armour-1", "squad-armour-2"], 0)).toBe(
      bare - 2,
    );
  });

  it("is noticed by a penetration-1 claw only at the second rung", () => {
    const bare = lossFromBite([], 1);
    expect(lossFromBite(["squad-armour-1"], 1)).toBe(bare);
    expect(lossFromBite(["squad-armour-1", "squad-armour-2"], 1)).toBe(
      bare - 1,
    );
  });
});

// ===========================================
// Grenades
// ===========================================

describe("frag and incendiary grenades through a throw (campaign arc §10.3)", () => {
  /** The mission after the squad throws its (only) grenade at the impact. */
  function afterThrow(
    upgrades: readonly InfantryUpgradeId[],
    kitId: string,
  ): TacticalState {
    const mission = missionWithSquad(RIFLE_SQUAD, upgrades, bugsAroundImpact());
    const result = useKit(
      mission,
      useEquipment("squad", kitId, IMPACT),
      ctxWith(riggedRng(true, "low")),
    );
    if (!result.ok) throw new Error(`throw refused: ${result.error.kind}`);
    return result.value.state;
  }

  it("carries the frag grenade in place of the grenade, and the grenade no longer", () => {
    const mission = missionWithSquad(RIFLE_SQUAD, ["frag-grenades"]);
    const refused = useKit(
      mission,
      useEquipment("squad", "grenade", IMPACT),
      ctxWith(riggedRng(true)),
    );
    expect(refused.ok).toBe(false);
  });

  it("hits harder with the frag grenade, on the impact and beside it", () => {
    const plain = hpOf(afterThrow([], "grenade"));
    const frag = hpOf(afterThrow(["frag-grenades"], "frag-grenade"));
    // Every bug in the blast is hurt more; the one out of it is not.
    expect(frag.on).toBeLessThan(plain.on!);
    expect(frag.beside).toBeLessThan(plain.beside!);
    expect(frag.off).toBe(10);
    expect(plain.off).toBe(10);
  });

  it("leaves the impact burning with the incendiary grenade, and deals the frag grenade's blast", () => {
    const frag = afterThrow(["frag-grenades"], "frag-grenade");
    const fire = afterThrow(
      ["frag-grenades", "incendiary-grenades"],
      "incendiary-grenade",
    );
    expect(frag.effects).toEqual([]);
    expect(fire.effects.length).toBeGreaterThan(0);
    expect(fire.effects.every((effect) => effect.kind === "fire")).toBe(true);
    expect(
      fire.effects.some(
        (effect) =>
          effect.tile.x === IMPACT.x &&
          effect.tile.z === IMPACT.z &&
          effect.phasesLeft > 0,
      ),
    ).toBe(true);
    // The blast itself is the frag grenade's.
    expect(hpOf(fire)).toEqual(hpOf(frag));
  });
});

// ===========================================
// Field medicine
// ===========================================

describe("field medic training through a heal (campaign arc §10.3)", () => {
  /** Hit points the medic squad, at 3, mends on itself with its kit. */
  function mended(
    upgrades: readonly InfantryUpgradeId[],
    kitId: string,
  ): number {
    const mission = missionWithSquad(MEDIC_SQUAD, upgrades, [], { hp: 3 });
    const result = useKit(
      mission,
      useEquipment("squad", kitId, at(2, 1)),
      ctxWith(riggedRng(false)),
    );
    if (!result.ok) throw new Error(`heal refused: ${result.error.kind}`);
    return hpOf(result.value.state).squad! - 3;
  }

  it("mends 15 with the field medkit where the medkit mends 10", () => {
    expect(mended([], "medkit")).toBe(10);
    expect(mended(["field-medic-training"], "field-medkit")).toBe(15);
  });
});
