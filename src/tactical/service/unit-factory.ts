import type { Direction } from "../../core/model/direction";
import type { IdGenerator } from "../../core/model/id-generator";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { Mech } from "../../roster/model/mech";
import { MECH_MAX_DAMAGE } from "../../roster/model/mech";
import type { MechStatSheet } from "../../roster/model/mech-stat-sheet";
import type { Squad } from "../../roster/model/squad";
import type { SquadType } from "../../roster/model/squad-type";
import type { BugUnitSource } from "../model/bug-unit-source";
import type { Unit, UnitKind } from "../model/unit";
import { UNIT_ID_PREFIX } from "../model/unit";
import type { UnitTemplate, UnitTemplateId } from "../model/unit-template";
import type { UnitTuning } from "../model/unit-tuning";

// ===========================================
// Types
// ===========================================

/** Where a new unit is put down; mission start (#323) decides this. */
export interface UnitPlacement {
  readonly pos: TileCoord;
  readonly facing: Direction;
}

/** What building a unit needs injected. */
export interface UnitFactoryDeps {
  /** Issues unit ids with the `"unit"` prefix; the mission's generator. */
  readonly ids: IdGenerator;
  readonly tuning: UnitTuning;
}

/** A built unit and the template it references, for the mission state to store. */
export interface UnitBuild {
  readonly unit: Unit;
  readonly template: UnitTemplate;
}

// ===========================================
// Template ids
// ===========================================

/** The derived template id for a source: `"<kind>:<sourceId>"`. */
export function templateIdFor(
  kind: UnitKind,
  sourceId: string,
): UnitTemplateId {
  return `${kind}:${sourceId}`;
}

// ===========================================
// Factories
// ===========================================

/**
 * Builds an infantry unit from a roster squad (GDD §6.1). Hit points
 * scale with soldiers: `maxHp = maxStrength × hpPerSoldier`, and the unit
 * starts at `strength × hpPerSoldier`, so a depleted squad enters hurt.
 * Weapon damage is the type's `combatRating` times the tuning's damage
 * per point, rounded up so no squad hits for zero. Pure: reads only its
 * arguments and draws one id.
 */
export function squadUnit(
  squad: Squad,
  squadType: SquadType,
  placement: UnitPlacement,
  deps: UnitFactoryDeps,
): UnitBuild {
  const { infantry } = deps.tuning;
  const template: UnitTemplate = {
    id: templateIdFor("squad", squad.id),
    name: squadType.name,
    maxHp: squad.maxStrength * infantry.hpPerSoldier,
    maxAp: infantry.maxAp,
    move: infantry.move,
    weapon: {
      ...infantry.weapon,
      damage: Math.max(
        1,
        Math.ceil(squadType.combatRating * infantry.weapon.damage),
      ),
    },
    armor: infantry.armor,
    passClass: "infantry",
    modelId: infantry.modelIdByType[squadType.id] ?? infantry.fallbackModelId,
    charges: infantry.chargesByType[squadType.id] ?? infantry.fallbackCharges,
  };
  return build(
    "squad",
    "tdf",
    squad.id,
    template,
    squad.strength * infantry.hpPerSoldier,
    placement,
    deps.ids,
  );
}

/**
 * Builds a mech unit from a roster mech and its validated stat sheet
 * (#49). `maxHp = baseHp + armor × hpPerArmor`; the unit starts reduced
 * by the mech's accumulated damage. Move is `baseMove + mobility`
 * clamped to the tuning's bounds; the weapon fires for `firepower`
 * scaled by the tuning's damage, at the base accuracy plus the sheet's
 * modifier, clamped to `[0, 100]`; per-hit armor is `armor × armorFactor`.
 * Pure: reads only its arguments and draws one id.
 */
export function mechUnit(
  mech: Mech,
  sheet: MechStatSheet,
  placement: UnitPlacement,
  deps: UnitFactoryDeps,
): UnitBuild {
  const { mech: tuning } = deps.tuning;
  const maxHp = Math.max(
    1,
    Math.round(tuning.baseHp + sheet.armor * tuning.hpPerArmor),
  );
  const template: UnitTemplate = {
    id: templateIdFor("mech", mech.id),
    name: mech.name,
    maxHp,
    maxAp: tuning.maxAp,
    move: clamp(
      Math.round(tuning.baseMove + sheet.mobility),
      tuning.minMove,
      tuning.maxMove,
    ),
    weapon: {
      range: tuning.weapon.range,
      accuracy: clamp(
        Math.round(tuning.weapon.accuracy + sheet.accuracy),
        0,
        100,
      ),
      damage: Math.max(1, Math.round(sheet.firepower * tuning.weapon.damage)),
      armorPen: tuning.weapon.armorPen,
    },
    armor: Math.max(0, Math.round(sheet.armor * tuning.armorFactor)),
    passClass: "mech",
    modelId: tuning.modelId,
    charges: tuning.charges,
  };
  const hp = Math.round(
    (maxHp * (MECH_MAX_DAMAGE - mech.damage)) / MECH_MAX_DAMAGE,
  );
  return build("mech", "tdf", mech.id, template, hp, placement, deps.ids);
}

/**
 * Builds a bug from its species data, which is already in tactical
 * terms (#322). Every bug of a species shares one template
 * (`"bug:<species>"`) and starts at full health. Pure: reads only its
 * arguments and draws one id.
 */
export function bugUnit(
  species: BugUnitSource,
  placement: UnitPlacement,
  deps: UnitFactoryDeps,
): UnitBuild {
  const template: UnitTemplate = {
    id: templateIdFor("bug", species.id),
    name: species.name,
    maxHp: species.hp,
    maxAp: species.ap,
    move: species.move,
    weapon: species.weapon,
    armor: species.armor,
    passClass: "infantry",
    modelId: species.modelId,
  };
  return build(
    "bug",
    "bugs",
    species.id,
    template,
    species.hp,
    placement,
    deps.ids,
  );
}

// ===========================================
// Helpers
// ===========================================

/** Assembles the unit record around a template at full action points and a full charge pool. */
function build(
  kind: UnitKind,
  team: Unit["team"],
  sourceId: string,
  template: UnitTemplate,
  hp: number,
  placement: UnitPlacement,
  ids: IdGenerator,
): UnitBuild {
  const unit: Unit = {
    id: ids.nextId(UNIT_ID_PREFIX),
    kind,
    team,
    sourceId,
    templateId: template.id,
    pos: placement.pos,
    facing: placement.facing,
    hp: clamp(Math.round(hp), 0, template.maxHp),
    maxHp: template.maxHp,
    ap: template.maxAp,
    maxAp: template.maxAp,
    status: [],
    passClass: template.passClass,
    ...(template.charges === undefined ? {} : { charges: template.charges }),
  };
  return { unit, template };
}

/** Clamps `value` into `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
