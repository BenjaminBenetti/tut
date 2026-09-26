import type { Direction } from "../../core/model/direction";
import type { IdGenerator } from "../../core/model/id-generator";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { Mech } from "../../roster/model/mech";
import { MECH_MAX_DAMAGE } from "../../roster/model/mech";
import type { MechStatSheet } from "../../roster/model/mech-stat-sheet";
import type { InfantryUpgradeDefinition } from "../../roster/model/infantry-upgrade";
import type { RankTuning } from "../../roster/model/rank";
import { upgradedEquipment } from "../../roster/service/infantry-upgrade-effect-service";
import { rankBonuses, rankIndexOf } from "../../roster/service/rank-service";
import type { Squad } from "../../roster/model/squad";
import type { SquadType } from "../../roster/model/squad-type";
import type { BugUnitSource } from "../model/bug-unit-source";
import type { EquipmentId } from "../model/equipment";
import type { CivilianTuning } from "../model/civilian";
import { CIVILIAN_SOURCE_ID } from "../model/civilian";
import type { GeneratorTuning } from "../model/generator";
import { GENERATOR_SOURCE_ID } from "../model/generator";
import type { TurretTuning } from "../model/turret";
import { TURRET_SOURCE_ID } from "../model/turret";
import type { Team, Unit, UnitKind } from "../model/unit";
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
  /**
   * The campaign's infantry upgrades (campaign arc §10.3), in
   * application order, folded into every squad built: its armour and
   * the items it carries. Absent means none, as before the branch.
   */
  readonly infantryUpgrades?: readonly InfantryUpgradeDefinition[];
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
 * campaign's infantry upgrades (campaign arc §10.3) add their armour to
 * the profile, swap the items the type carries (a grenade for a frag
 * grenade, say) and hand out items of their own after the type's kit
 * (the capture net, #1179), each once. The squad's rank (#1130) is
 * folded in last, over everything the type decided. With no upgrades
 * the template is exactly what it was before them. Pure: reads only its
 * arguments and draws one id.
 *
 * @param squad - The roster squad.
 * @param squadType - Its type.
 * @param placement - Where it stands and faces.
 * @param deps - The id generator, the unit tuning and the campaign's upgrades.
 * @returns The unit and its template.
 */
export function squadUnit(
  squad: Squad,
  squadType: SquadType,
  placement: UnitPlacement,
  deps: UnitFactoryDeps,
): UnitBuild {
  const { infantry } = deps.tuning;
  const upgrades = deps.infantryUpgrades ?? [];
  const profile = squadCombatProfile(
    squadType,
    infantry,
    squad.maxStrength,
    upgrades,
  );
  const equipment = squadEquipment(squadType, upgrades);
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
    // The type's kit rides on the template (#1132), upgraded by the
    // campaign's research (§10.3, and the capture net after it, #1179);
    // uses are counted on the unit as it draws on them, full until it
    // does.
    ...(equipment === undefined ? {} : { equipment }),
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
    ...(profile.systems === undefined
      ? {}
      : { systems: profile.systems, equipment: profile.systems.equipment }),
    maxHp: profile.maxHp,
    maxAp: profile.maxAp,
    move: profile.move,
    weapons: profile.weapons,
    sightRange: profile.sightRange,
    armor: profile.armor,
    ...(profile.resist === undefined ? {} : { resist: profile.resist }),
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
 * footprint carries it onto the template (#1130). Explicit weapons and
 * equipment are copied into the same loadout used by player and Jev rules;
 * older species retain their single default attack. A species that
 * burrows (#1179) says so on the template and arrives `burrowed`, so a
 * burrower that hatches, walks in with a wave or is placed by a setup
 * rule starts under the ground. Pure: reads only its arguments and
 * draws one id.
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
    weapons: species.weapons
      ? [...species.weapons]
      : [
          {
            id: PRIMARY_WEAPON_ID,
            name: DEFAULT_WEAPON_NAME,
            profile: species.weapon,
          },
        ],
    ...(species.equipment === undefined
      ? {}
      : { equipment: [...species.equipment] }),
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
    // Only a digger says so (#1179); every other template stays as it was.
    ...(species.burrows === true ? { burrows: true } : {}),
  };
  const built = build(
    "bug",
    "bugs",
    species.id,
    template,
    species.hp,
    placement,
    deps.ids,
  );
  return template.burrows === true
    ? { template, unit: { ...built.unit, status: ["burrowed"] } }
    : built;
}

/**
 * Builds a turret from a turret tuning (#1138), for `placeTurret` and
 * the garrison (#1155). Every turret of a source shares one template
 * (`"turret:turret"` for an engineer's, `"turret:garrison-turret"` for
 * the region's), as every bug of a species does, and starts at full
 * health with a full battery — or with none, when the tuning has no
 * `batteryTurns`, in which case the unit carries no `turnsLeft` and
 * never burns out. The template says it is `mechanical`, so a repair
 * kit mends it and a medkit passes it over (`constructionOf`). Pure:
 * reads only its arguments and draws one id.
 *
 * @param tuning - The turret's stats, and its battery if it has one.
 * @param team - The side it fights for.
 * @param placement - Where it stands and which way it faces.
 * @param ids - Issues its unit id.
 * @param sourceId - Which kind of turret it is; the engineer's by default.
 */
export function turretUnit(
  tuning: TurretTuning,
  team: Team,
  placement: UnitPlacement,
  ids: IdGenerator,
  sourceId: string = TURRET_SOURCE_ID,
): UnitBuild {
  const template: UnitTemplate = {
    id: templateIdFor("turret", sourceId),
    name: tuning.name,
    maxHp: tuning.maxHp,
    // A turret takes no orders: its overwatch is granted by the turn,
    // never bought with an action, so it has none to spend.
    maxAp: 0,
    move: 0,
    weapons: [tuning.weapon],
    sightRange: tuning.sightRange,
    armor: tuning.armor,
    passClass: "infantry",
    modelId: tuning.modelId,
    construction: "mechanical",
  };
  const built = build(
    "turret",
    team,
    sourceId,
    template,
    tuning.maxHp,
    placement,
    ids,
  );
  return {
    template,
    unit:
      tuning.batteryTurns === undefined
        ? built.unit
        : { ...built.unit, turnsLeft: tuning.batteryTurns },
  };
}

/**
 * Builds a generator from its tuning (#1175), for the start of a
 * defend-installation mission. Every generator shares one template
 * (`"generator:generator"`). No weapon, no movement, no action points:
 * it is `mechanical`, so a repair kit mends it while the squad holds
 * the yard. Pure: reads only its arguments and draws one id.
 *
 * @param tuning - The generator's stats.
 * @param placement - Where it stands and which way it faces.
 * @param ids - Issues its unit id.
 */
export function generatorUnit(
  tuning: GeneratorTuning,
  placement: UnitPlacement,
  ids: IdGenerator,
): UnitBuild {
  const template: UnitTemplate = {
    id: templateIdFor("generator", GENERATOR_SOURCE_ID),
    name: tuning.name,
    maxHp: tuning.maxHp,
    maxAp: 0,
    move: 0,
    weapons: [],
    sightRange: tuning.sightRange,
    armor: tuning.armor,
    passClass: "infantry",
    modelId: tuning.modelId,
    construction: "mechanical",
  };
  return build(
    "generator",
    "tdf",
    GENERATOR_SOURCE_ID,
    template,
    tuning.maxHp,
    placement,
    ids,
  );
}

/**
 * Builds a civilian group from its tuning (campaign arc §6.4), for an
 * evacuation's start and the debug menu. Every group shares one template
 * (`"civilian:civilians"`): no weapon, a squad's pace, `organic`, so a
 * medkit mends it. A group starts **trapped** — no action points, and
 * `trapped` set — until a squad or mech frees it with Interact; pass
 * `trapped: false` for one already walking. Pure: reads only its
 * arguments and draws one id.
 *
 * ```
 *   trapped ──► ap 0, trapped: true     (waits for Interact)
 *   free    ──► ap maxAp                 (moves and boards like a squad)
 * ```
 *
 * @param tuning - The group's stats.
 * @param placement - Where it huddles and which way it faces.
 * @param ids - Issues its unit id.
 * @param trapped - Whether it starts shut in; true by default.
 */
export function civilianUnit(
  tuning: CivilianTuning,
  placement: UnitPlacement,
  ids: IdGenerator,
  trapped = true,
): UnitBuild {
  const template: UnitTemplate = {
    id: templateIdFor("civilian", CIVILIAN_SOURCE_ID),
    name: tuning.name,
    maxHp: tuning.maxHp,
    maxAp: tuning.maxAp,
    move: tuning.move,
    weapons: [],
    sightRange: tuning.sightRange,
    armor: tuning.armor,
    passClass: "infantry",
    modelId: tuning.modelId,
    construction: "organic",
  };
  const built = build(
    "civilian",
    "tdf",
    CIVILIAN_SOURCE_ID,
    template,
    tuning.maxHp,
    placement,
    ids,
  );
  return {
    template,
    unit: trapped ? { ...built.unit, ap: 0, trapped: true } : built.unit,
  };
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

/**
 * A squad's kit: its type's equipment with the campaign's upgrades
 * applied (`upgradedEquipment`: swaps, then added items). Undefined when
 * the type carries nothing and no upgrade adds anything, so such a squad
 * gets a template with no `equipment` field, as before upgrades.
 *
 * @param squadType - The squad's type.
 * @param upgrades - The active upgrades, in application order.
 * @returns The kit, or undefined for none.
 */
function squadEquipment(
  squadType: SquadType,
  upgrades: readonly InfantryUpgradeDefinition[],
): EquipmentId[] | undefined {
  const equipment = upgradedEquipment(squadType.equipment ?? [], upgrades);
  if (squadType.equipment === undefined && equipment.length === 0) {
    return undefined;
  }
  return [...equipment];
}

/** Clamps `value` into `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
