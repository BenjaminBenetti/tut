import type { Direction } from "../../core/model/direction";
import type { IdGenerator } from "../../core/model/id-generator";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { Mech } from "../../roster/model/mech";
import { MECH_MAX_DAMAGE } from "../../roster/model/mech";
import type { MechStatSheet } from "../../roster/model/mech-stat-sheet";
import type { RankTuning } from "../../roster/model/rank";
import { rankBonuses, rankIndexOf } from "../../roster/service/rank-service";
import type { Squad } from "../../roster/model/squad";
import type { SquadType } from "../../roster/model/squad-type";
import type { BugUnitSource } from "../model/bug-unit-source";
import type { Unit, UnitKind } from "../model/unit";
import { UNIT_ID_PREFIX } from "../model/unit";
import type { UnitTemplate, UnitTemplateId } from "../model/unit-template";
import type { WeaponId } from "../model/unit-weapon";
import { DEFAULT_WEAPON_NAME, PRIMARY_WEAPON_ID } from "../model/unit-weapon";
import type { UnitTuning } from "../model/unit-tuning";
import { mechCombatProfile } from "./mech-combat-profile";
import { squadCombatProfile } from "./squad-combat-profile";

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
 * Builds an infantry unit from a roster squad (GDD §6.1). The template
 * is the type's combat profile (`squadCombatProfile`, #1132) — the one
 * derivation the screens print too — at the squad's own full strength:
 * `maxHp = maxStrength × hpPerSoldier`, and the unit starts at
 * `strength × hpPerSoldier`, so a depleted squad enters hurt. The
 * squad's rank (#1130) is folded in last, over everything the type
 * decided. Pure: reads only its arguments and draws one id.
 */
export function squadUnit(
  squad: Squad,
  squadType: SquadType,
  placement: UnitPlacement,
  deps: UnitFactoryDeps,
): UnitBuild {
  const { infantry } = deps.tuning;
  const profile = squadCombatProfile(squadType, infantry, squad.maxStrength);
  const template: UnitTemplate = {
    id: templateIdFor("squad", squad.id),
    name: squadType.name,
    maxHp: profile.maxHp,
    maxAp: profile.maxAp,
    move: profile.move,
    weapons: [profile.weapon],
    sightRange: profile.sightRange,
    armor: profile.armor,
    passClass: "infantry",
    modelId: infantry.modelIdByType[squadType.id] ?? infantry.fallbackModelId,
    ...(squadType.abilities === undefined
      ? {}
      : { abilities: [...squadType.abilities] }),
  };
  return build(
    "squad",
    "tdf",
    squad.id,
    withRankBonuses(template, squad.xp, deps.tuning.ranks),
    squad.strength * infantry.hpPerSoldier,
    placement,
    deps.ids,
  );
}

/**
 * Builds a mech unit from a roster mech and its validated stat sheet
 * (#49). The template is the sheet's combat profile
 * (`mechCombatProfile`, #1132) — the one derivation the mech bay prints
 * too, so the mech on the field is the mech the bay described — and the
 * unit starts reduced by the mech's accumulated damage. The template
 * carries the loadout, so graphics draws the fitted parts (#1115), and
 * the pilot's rank (#1130) is folded in last, over the sheet. Pure:
 * reads only its arguments and draws one id.
 */
export function mechUnit(
  mech: Mech,
  sheet: MechStatSheet,
  placement: UnitPlacement,
  deps: UnitFactoryDeps,
): UnitBuild {
  const profile = mechCombatProfile(sheet, deps.tuning.mech);
  const template: UnitTemplate = {
    id: templateIdFor("mech", mech.id),
    name: mech.name,
    maxHp: profile.maxHp,
    maxAp: profile.maxAp,
    move: profile.move,
    weapons: profile.weapons,
    sightRange: profile.sightRange,
    armor: profile.armor,
    passClass: "mech",
    modelId: deps.tuning.mech.modelId,
    // Graphics assembles the fitted parts from this, so the mech on the
    // field is the one the player built in the bay (#1115).
    loadout: mech.loadout,
  };
  const hp = Math.round(
    (profile.maxHp * (MECH_MAX_DAMAGE - mech.damage)) / MECH_MAX_DAMAGE,
  );
  return build(
    "mech",
    "tdf",
    mech.id,
    withRankBonuses(template, mech.xp, deps.tuning.ranks),
    hp,
    placement,
    deps.ids,
  );
}

/**
 * Builds a bug from its species data, which is already in tactical
 * terms (#322). Every bug of a species shares one template
 * (`"bug:<species>"`) and starts at full health; a species with a
 * footprint carries it onto the template (#1130). Pure: reads only its
 * arguments and draws one id.
 */
export function bugUnit(
  species: BugUnitSource,
  placement: UnitPlacement,
  deps: Pick<UnitFactoryDeps, "ids">,
): UnitBuild {
  const template: UnitTemplate = {
    id: templateIdFor("bug", species.id),
    name: species.name,
    maxHp: species.hp,
    maxAp: species.ap,
    move: species.move,
    weapons: [
      {
        id: PRIMARY_WEAPON_ID,
        name: DEFAULT_WEAPON_NAME,
        profile: species.weapon,
      },
    ],
    sightRange: species.sightRange,
    armor: species.armor,
    passClass: "infantry",
    modelId: species.modelId,
    // What the kill is worth rides on the template (#1130), so the
    // resolver reads it off the casualty rather than asking a catalogue.
    ...(species.xpValue === undefined ? {} : { xpValue: species.xpValue }),
    // A species that stands on more than one tile says so (#1130); the
    // rest declare nothing and stand on one, as before.
    ...(species.footprint === undefined
      ? {}
      : { footprint: species.footprint }),
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
    ...chargesFor(template),
  };
  return { unit, template };
}

/**
 * The unit's starting charges, keyed by weapon (#409, per weapon since
 * #532). Omitted entirely when no weapon has a pool, so a bug still
 * carries no `charges` field at all.
 */
function chargesFor(template: UnitTemplate): {
  charges?: Readonly<Record<WeaponId, number>>;
} {
  const entries = template.weapons.flatMap((weapon) =>
    weapon.charges === undefined ? [] : [[weapon.id, weapon.charges] as const],
  );
  return entries.length === 0 ? {} : { charges: Object.fromEntries(entries) };
}

/**
 * The template with the rank its experience has reached folded in
 * (#1130): the ladder's bonuses for that rung are added to move and
 * action points and to every weapon's accuracy, clamped to a percentage,
 * and the rank itself is recorded for the HUD. Runs last, after the
 * squad type or the stat sheet has had its say, so a rule that reads the
 * template never has to ask what the rank was.
 *
 * ```
 *   xp 30 on the shipped ladder ──► rank 2 "Corporal"
 *     move 5 ──► 6     maxAp 2 ──► 2     accuracy 65 ──► 69
 * ```
 *
 * An empty ladder leaves the template alone.
 */
function withRankBonuses(
  template: UnitTemplate,
  xp: number,
  ranks: RankTuning,
): UnitTemplate {
  const index = rankIndexOf(xp, ranks.ladder);
  const rank = ranks.ladder[index];
  if (rank === undefined) {
    return template;
  }
  const bonuses = rankBonuses(index, ranks.bonuses);
  return {
    ...template,
    move: template.move + bonuses.move,
    maxAp: template.maxAp + bonuses.ap,
    weapons: template.weapons.map((weapon) => ({
      ...weapon,
      profile: {
        ...weapon.profile,
        accuracy: clamp(weapon.profile.accuracy + bonuses.accuracy, 0, 100),
      },
    })),
    rank: { name: rank.name, index },
  };
}

/** Clamps `value` into `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
