import type {
  MechAction,
  MechActionPayload,
} from "../../tactical/model/mech-action-command";
import { validateMechAction } from "../../tactical/service/mech-action-service";
import type { Result } from "../../core/model/result";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { TacticalError } from "../../tactical/model/tactical-error";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit, UnitId } from "../../tactical/model/unit";
import type { WeaponId } from "../../tactical/model/unit-weapon";
import { findAttackTarget } from "../../tactical/service/attack-target-service";
import type { PreviewDeps } from "../../tactical/service/combat-service";
import {
  previewAttack,
  previewTileAttack,
  tileWeaponOptions,
  weaponOptions,
} from "../../tactical/service/combat-service";
import type { AttackPreview } from "../../tactical/model/attack-preview";
import type { MoveGraph } from "../../tactical/service/movement-service";
import { pathTo } from "../../tactical/service/movement-service";
import type { TacticalInvokeTarget } from "../model/tactical-intent";
import type { RadialMenuHub, RadialMenuItem } from "../view/radial-menu-view";
import type { ActionAvailabilityDeps, UnitAction } from "./action-availability";
import { actionRefusal, isDropshipTile } from "./action-availability";
import { chargeRegisterFor } from "./charge-register";
import { RADAR_DISH, TURRET } from "../../tactical/data/equipment";
import {
  DEFAULT_CHARGE_DELAY_TURNS,
  isDeployable,
} from "../../tactical/model/equipment";
import { RADAR_TUNING } from "../../tactical/data/radar-tuning";
import { TURRET_TUNING } from "../../tactical/data/turret-tuning";
import { overwatchShotsOf } from "../../tactical/model/weapon-profile";
import { canBeNetted } from "../../tactical/model/carried-specimen";
import type {
  EquipmentDefinition,
  EquipmentId,
} from "../../tactical/model/equipment";
import { SHIPPED_EQUIPMENT } from "../../tactical/repository/equipment-catalogue";
import { chargeDelayText } from "./charge-delay-text";
import { specimenWanted } from "../../tactical/service/capture-service";
import {
  carryRefusal,
  droppedSpecimens,
} from "../../tactical/service/specimen-service";
import { reachableObjectives } from "../../tactical/service/objective-service";
import type {
  EquipmentCarried,
  EquipmentRules,
} from "../../tactical/service/equipment-service";
import {
  equipmentOf,
  previewEquipmentUse,
  previewHealUse,
  validateEquipmentUse,
} from "../../tactical/service/equipment-service";
import type { HealPreview } from "../../tactical/model/heal-preview";
import type { TacticalNames } from "./tactical-error-text";
import { attackTargetName, describeRefusal } from "./tactical-error-text";
import type { TechCarcass } from "../../tactical/model/tech-carcass";
import {
  reachableCarcasses,
  validateHarvest,
} from "../../tactical/service/harvest-service";

// ===========================================
// Types
// ===========================================

/** What the wheel is built against. */
export interface WheelContext {
  readonly mission: TacticalState;
  /** The unit that would act: the selection. */
  readonly unitId: UnitId;
  /** Traversal structures for the mission's map, so Move asks the rules. */
  readonly graph: MoveGraph;
  /** Names for the refusal tooltips, so they never read an id. */
  readonly names: TacticalNames;
  readonly deps: ActionAvailabilityDeps;
  /**
   * The content a blast preview asks about what would fall (#1121).
   * Optional: without it the entries still show the blast and who is
   * in it, and say nothing about structures.
   */
  readonly previewDeps?: PreviewDeps;
}

/** One page of the wheel: its entries and the fact at its centre. */
export interface WheelPage {
  readonly items: readonly RadialMenuItem[];
  readonly hub?: RadialMenuHub;
}

/** What a chosen entry stands for, parsed back out of its id. */
export type WheelChoice =
  | {
      readonly action: "mech";
      readonly system: MechAction;
      readonly tile?: TileCoord;
      readonly targetId?: string;
    }
  | { readonly action: "move"; readonly tile: TileCoord }
  | { readonly action: "deploy-radar"; readonly tile: TileCoord }
  /** Put a turret on the tile (#1138); its own entry on the ring, like the dish. */
  | { readonly action: "deploy-turret"; readonly tile: TileCoord }
  | {
      readonly action: "use-equipment";
      readonly equipmentId: EquipmentId;
      readonly tile: TileCoord;
    }
  | {
      readonly action: "attack";
      readonly targetId: string;
      /** Undefined opens the weapon page or fires the unit's single weapon. */
      readonly weaponId: WeaponId | undefined;
    }
  | {
      /** Fire at the ground (#1121). Undefined opens the weapon page or fires the unit's single weapon. */
      readonly action: "attack-tile";
      readonly tile: TileCoord;
      readonly weaponId: WeaponId | undefined;
    }
  | { readonly action: "overwatch" }
  | { readonly action: "reload" }
  | { readonly action: "interact"; readonly objectiveId: string }
  /** Strip a tech carcass in reach (#1171). */
  | { readonly action: "harvest"; readonly carcassId: string }
  | { readonly action: "extract" }
  | { readonly action: "back"; readonly targetId: string };

// ===========================================
// Constants
// ===========================================

/**
 * The words on the ring when an entry cannot be taken. Shorter than the
 * refusal sentence, which is the tooltip: a ring entry has room for two
 * or three words under its label, and "Rifle Squad has no action points
 * left" is neither short nor news beside a card that says so.
 */
const SHORT_REASONS: Readonly<Partial<Record<TacticalError["kind"], string>>> =
  {
    "no-action-points": "no AP",
    "wrong-phase": "not your turn",
    "unit-dead": "down",
    "no-charges": "empty",
    "charges-full": "already full",
    "no-reload": "nothing to reload",
    "out-of-range": "out of range",
    "no-line-of-sight": "no line of sight",
    "not-in-extraction-zone": "not on the ramp",
    "no-objective-in-reach": "nothing in reach",
    "target-destroyed": "destroyed",
    "tile-out-of-sight": "no line of sight",
    "no-area-weapon": "not at the ground",
    "radar-out-of-reach": `range ${String(RADAR_DISH.range)}`,
    "radar-tile-blocked": "tile blocked",
    "turret-out-of-reach": `range ${String(TURRET.range)}`,
    "turret-tile-blocked": "tile blocked",
    "takes-no-orders": "no orders",
    "unit-trapped": "trapped",
    "no-such-weapon": "unarmed",
    "cannot-interact": "squads only",
    "no-equipment": "not carried",
    "equipment-spent": "none left",
    "nothing-to-heal": "nobody to heal",
    "not-a-squad": "squads only",
    "carcass-already-harvested": "already stripped",
    "carcass-out-of-reach": "out of reach",
    "target-too-healthy": "too strong",
    "already-carrying": "hands full",
    "cannot-carry": "squads only",
    "no-capture-target": "nothing to net",
    "specimen-not-wanted": "not wanted",
    "objective-worked-this-turn": "done this turn",
    "wreck-stripped": "stripped",
  };

/** The ring's word for throwing the capture net (#1179): a verb, like Heal and Repair. */
const NET_LABEL = "Net";

/** The ring's words for picking up a dropped specimen (#1179). */
const PICK_UP_LABEL = "Pick up";

/** The ring's words for a repair kit with nothing to mend; the medkit's are in `SHORT_REASONS`. */
const NOTHING_TO_REPAIR = "nothing to repair";

/** Separates an entry's action from its argument in the id. */
const ID_SEPARATOR = ":";

/** Whole percent from which the hub reads as a comfortable shot. */
const COMFORTABLE_HIT_CHANCE = 50;

// ===========================================
// Pages
// ===========================================

/**
 * The wheel for a left click on `target` (#1112): the actions the
 * selected unit can take *there*, then the ones it can take anywhere.
 *
 * Entries come from the **same predicates the rules use** — `pathTo`
 * decides whether Move is open, `previewAttack` supplies the hit chance
 * and damage, `actionRefusal` says why the rest are closed. A wheel that
 * offers a shot the rules then refuse is the #517 defect wearing a
 * different hat, and a wheel that lies is worse than no wheel.
 *
 * ```
 *   tile      ──► Move (path) · Attack at the ground (#1121) · Board (drop
 *                 ship tile) · Deploy radar · Deploy turret · Heal / Repair
 *                 (#1138) · Overwatch · Reload
 *                   └─ Attack turns to a page — weapons, then the grenade
 *                      and the charge (#1136) — when there is more than one
 *                      way to hit the tile; a lone weapon is the shot itself
 *   enemy     ──► Attack (hub: hit chance) · Net (a bug a capture
 *                 objective wants, #1179) · Overwatch · Reload
 *                   └─ the same page, the grenade and the charge thrown at
 *                      the tile the enemy stands on (#1143)
 *   spawner   ──► Attack (as at an enemy, at the spawner's tile) · Interact
 *                 (if this one is in reach) · Overwatch · Reload
 *   other unit ─► as at an enemy, with Interact when it is an objective's
 *                 target in reach (a trapped group its rescue frees)
 *   own unit  ──► Overwatch · Reload · Interact (one per objective in reach)
 *                 · Harvest (a carcass in reach, #1171) · Board
 *   a tile with a carcass on it also carries Harvest, closed with the
 *   reason when the unit cannot strip it
 * ```
 *
 * Closed entries stay on the ring, marked, with the reason as their
 * detail line and the full sentence as their tooltip (#1030): a wheel
 * that hides an empty gun teaches the player nothing.
 *
 * @param target - What the click landed on.
 * @param ctx - The mission, the acting unit and the rules' tuning.
 * @returns The page to open, possibly with no entries.
 */
export function actionWheel(
  target: TacticalInvokeTarget,
  ctx: WheelContext,
): WheelPage {
  const unit = ctx.mission.units.find((u) => u.id === ctx.unitId);
  if (unit === undefined) {
    return { items: [] };
  }
  const page =
    target.kind === "tile"
      ? tilePage(target.tile, unit, ctx)
      : target.kind === "spawner"
        ? enemyPage(target.spawnerId, unit, ctx)
        : target.unitId === unit.id
          ? selfPage(unit, ctx)
          : enemyPage(target.unitId, unit, ctx);
  return { ...page, items: [...page.items, ...mechItems(target, unit, ctx)] };
}

/**
 * The sub-wheel behind Attack for a unit carrying several weapons
 * (#1112, GDD §6.2: one attack per weapon). One entry per weapon with
 * its own hit chance and damage against this target, and a way back.
 * The same page whether the target is an enemy or a tile (#1121): the
 * player picks a weapon the same way, and a weapon that cannot be
 * fired at the ground is on the ring, closed, with the reason. The
 * grenade and the charge follow the weapons at an enemy or a spawner
 * as they do at a tile (#1143), thrown at the tile the target stands
 * on: the Executive Director clicked a bug and found no grenade to
 * throw at it, and a thing that is an attack at the ground is an
 * attack at whatever stands there.
 *
 * ```
 *   Swarmer · pick an attack
 *     Rifle        62% · 8–13 dmg
 *     Grenade      55% · 8–13 dmg · 2/2      → equipment:grenade:4,0,1
 *     Back
 * ```
 *
 * @param target - The enemy unit, spawner or tile being aimed at.
 * @param ctx - The mission, the acting unit and the rules' tuning.
 * @returns The page, or an empty one when nothing can be aimed.
 */
export function weaponWheel(
  target: TacticalInvokeTarget,
  ctx: WheelContext,
): WheelPage {
  const unit = ctx.mission.units.find((u) => u.id === ctx.unitId);
  if (unit === undefined) {
    return { items: [] };
  }
  if (target.kind === "tile") {
    return tileWeaponPage(target.tile, unit, ctx);
  }
  const targetId = target.kind === "unit" ? target.unitId : target.spawnerId;
  const enemy = findAttackTarget(ctx.mission, targetId);
  if (enemy === undefined) {
    return { items: [] };
  }
  const items: RadialMenuItem[] = [];
  let primaryPicked = false;
  for (const option of weaponOptions(
    ctx.mission,
    unit.id,
    ctx.deps.combatTuning,
  )) {
    const preview = previewAttack(
      ctx.mission,
      unit.id,
      targetId,
      ctx.deps.combatTuning,
      option.weapon.id,
      ctx.previewDeps,
    );
    const id = itemId(
      "attack",
      `${targetId}${ID_SEPARATOR}${option.weapon.id}`,
    );
    if (preview.ok) {
      items.push({
        id,
        label: option.weapon.name,
        icon: "attack",
        detail: blastDetail(preview.value, unit),
        primary: !primaryPicked,
      });
      primaryPicked = true;
    } else {
      items.push(closed(id, option.weapon.name, "attack", preview.error, ctx));
    }
  }
  // The grenade and the charge land on the target's tile (#1143); for a
  // spawner that is the tile it occupies. The entry carries the tile, so
  // the same `use-equipment` choice serves here as on the tile's page.
  const kit = attackKitOf(ctx.mission, unit);
  for (const carried of kit) {
    items.push(
      equipmentItem(enemy.pos, unit, carried.definition, carried.usesLeft, ctx),
    );
  }
  items.push({
    id: itemId("back", targetId),
    label: "Back",
    icon: "back",
  });
  return {
    items,
    hub: {
      value: attackTargetName(enemy, ctx.names),
      caption: kit.length > 0 ? "pick an attack" : "pick a weapon",
    },
  };
}

/**
 * Whether Attack turns the page rather than firing (#1112, #1136,
 * #1143). One rule, asked here by the wheel that builds the entry and by
 * the HUD that answers the click, so the two cannot disagree about what
 * the entry does: the page opens for a unit carrying several weapons,
 * and the grenade and the charge count as attacks too (Executive
 * Director, #1136), so one rifle and one grenade open it as two weapons
 * do. The rule no longer asks what the wheel is open on (#1143): the
 * page at an enemy holds the kit as the page at a tile does, so a rifle
 * squad with a grenade would otherwise fire the rifle at a bug the
 * wheel had promised a page for.
 *
 * @param mission - The mission the unit is in.
 * @param unitId - The unit that would attack.
 * @param combatTuning - Tuning `weaponOptions` is asked with.
 * @returns True when the Attack entry opens a page.
 */
export function opensAttackPage(
  mission: TacticalState,
  unitId: UnitId,
  combatTuning: ActionAvailabilityDeps["combatTuning"],
): boolean {
  const weapons = weaponOptions(mission, unitId, combatTuning).length;
  const unit = mission.units.find((u) => u.id === unitId);
  return (
    weapons > 1 || (unit !== undefined && attackKitOf(mission, unit).length > 0)
  );
}

/**
 * Parses an entry id back into what it stands for. The wheel builds ids
 * and this reads them, so the two cannot drift apart; a caller never
 * splits a string itself.
 *
 * @param id - An entry id from a page this module built.
 * @returns The choice, or undefined for an id it did not build.
 */
export function parseWheelChoice(id: string): WheelChoice | undefined {
  const at = id.indexOf(ID_SEPARATOR);
  const action = at === -1 ? id : id.slice(0, at);
  const argument = at === -1 ? "" : id.slice(at + 1);
  switch (action) {
    case "mech": {
      const [system, value = ""] = argument.split(ID_SEPARATOR);
      if (system === "brace" || system === "coolant") return { action, system };
      if (system === "designate") return { action, system, targetId: value };
      const tile = parseTile(value);
      return system === "jump" && tile ? { action, system, tile } : undefined;
    }
    case "move":
    case "deploy-radar":
    case "deploy-turret": {
      const tile = parseTile(argument);
      return tile === undefined ? undefined : { action, tile };
    }
    case "equipment": {
      const split = argument.indexOf(ID_SEPARATOR);
      if (split === -1) {
        return undefined;
      }
      const tile = parseTile(argument.slice(split + 1));
      return tile === undefined
        ? undefined
        : {
            action: "use-equipment",
            equipmentId: argument.slice(0, split),
            tile,
          };
    }
    case "attack": {
      const split = argument.indexOf(ID_SEPARATOR);
      return split === -1
        ? { action, targetId: argument, weaponId: undefined }
        : {
            action,
            targetId: argument.slice(0, split),
            weaponId: argument.slice(split + 1),
          };
    }
    case "attack-tile": {
      const split = argument.indexOf(ID_SEPARATOR);
      const tile = parseTile(
        split === -1 ? argument : argument.slice(0, split),
      );
      if (tile === undefined) {
        return undefined;
      }
      const weaponId = split === -1 ? "" : argument.slice(split + 1);
      return weaponId === ""
        ? { action, tile, weaponId: undefined }
        : { action, tile, weaponId };
    }
    case "interact":
      return { action, objectiveId: argument };
    case "harvest":
      return { action, carcassId: argument };
    case "back":
      return { action, targetId: argument };
    case "overwatch":
    case "reload":
    case "extract":
      return { action };
    default:
      return undefined;
  }
}

// ===========================================
// Private Helpers
// ===========================================

/** Move where reachable, Board on the drop ship, then the unit's own actions. */
function tilePage(tile: TileCoord, unit: Unit, ctx: WheelContext): WheelPage {
  const items: RadialMenuItem[] = [];
  const id = itemId("move", tileArgument(tile));
  const refusal = actionRefusal(ctx.mission, unit.id, "move", ctx.deps);
  const path =
    refusal === undefined
      ? pathTo(ctx.mission, unit.id, tile, ctx.graph)
      : undefined;
  if (refusal !== undefined) {
    items.push(closed(id, "Move", "move", refusal, ctx));
  } else if (path === undefined) {
    items.push({
      id,
      label: "Move",
      icon: "move",
      detail: "out of reach",
      disabled: true,
      reason: "That tile is out of reach this turn.",
    });
  } else if (path.length > 0) {
    items.push({
      id,
      label: "Move",
      icon: "move",
      detail: `${String(path.length)} ${path.length === 1 ? "tile" : "tiles"}`,
      primary: true,
    });
  }
  items.push(tileAttackItem(tile, unit, ctx));
  if (isDropshipTile(ctx.mission, tile)) {
    items.push(boardItem(unit, ctx));
  }
  // A carcass lying on the clicked tile (#1171): Harvest is on the ring
  // whenever the tile holds one, closed with the rules' reason when
  // the unit cannot strip it, so a mech that clicks it learns why.
  const carcass = ctx.mission.carcasses.find(
    (candidate) => !candidate.harvested && sameTile(candidate.pos, tile),
  );
  if (carcass !== undefined) {
    items.push(harvestItem(carcass, unit, ctx));
  }
  // A specimen lying where its carrier fell (#1179): Pick up is on the
  // ring whenever the tile holds one a capture still wants, closed with
  // the reason until the unit stands beside it.
  const pickUp = pickUpItem(tile, unit, ctx);
  if (pickUp !== undefined) {
    items.push(pickUp);
  }
  // The dish where a scanner may go (#1132), the turret beside it, and
  // a medkit or a repair kit where it would land (#1138): none is an
  // attack, so each keeps its own entry. A grenade or a charge is an
  // attack and rides under Attack with the weapons (#1136): the ring
  // used to break them out beside it, and the Executive Director found
  // two places to look for one kind of thing confusing.
  for (const carried of equipmentOf(
    ctx.mission.templates[unit.templateId],
    unit,
    SHIPPED_EQUIPMENT,
  )) {
    if (keepsOwnEntry(carried.definition)) {
      items.push(
        equipmentItem(tile, unit, carried.definition, carried.usesLeft, ctx),
      );
    }
  }
  items.push(overwatchItem(unit, ctx), reloadItem(unit, ctx));
  return { items };
}

/**
 * Whether an item keeps its own entry on the tile's ring rather than
 * riding under Attack: a deployable (the dish, the turret — #1138) or
 * a kit that mends (#1138). Neither is an attack, and the Executive
 * Director asked that only attacks be grouped under Attack (#1136).
 */
function keepsOwnEntry(definition: Pick<EquipmentDefinition, "kind">): boolean {
  return isDeployable(definition) || definition.kind === "heal";
}

/**
 * Whether an item is thrown over a unit rather than at a tile (#1179):
 * the capture net, which is on a wanted bug's ring as Net and neither
 * under Attack nor on a tile's ring.
 */
function isUnitTargeted(
  definition: Pick<EquipmentDefinition, "kind">,
): boolean {
  return definition.kind === "net";
}

/**
 * One item of the unit's equipment at a tile (#1132). The radar dish
 * keeps the entry it has always had — `deploy-radar:x,y,z`, "Deploy
 * radar", `1 AP · scan 30` — so a player and a test find it where it
 * was, and the turret takes the same shape (#1138): `deploy-turret:x,y,z`,
 * "Deploy turret", `1 AP · 2 shots · 3 turns · 2/2`. A grenade or a
 * charge reads like a shot at the ground, with the uses left last, and
 * since #1136 sits on the Attack page under the same id it had on the
 * ring; a medkit or a repair kit reads "Heal" or "Repair" with what it
 * gives and to how many (#1138). Closed with the rules' reason when the
 * use is refused.
 */
function equipmentItem(
  tile: TileCoord,
  unit: Unit,
  definition: EquipmentDefinition,
  usesLeft: number,
  ctx: WheelContext,
): RadialMenuItem {
  const rules = equipmentRulesOf(ctx);
  if (definition.kind === "radar") {
    const id =
      definition.id === RADAR_DISH.id
        ? itemId("deploy-radar", tileArgument(tile))
        : itemId("equipment", `${definition.id}:${tileArgument(tile)}`);
    const label =
      definition.id === RADAR_DISH.id ? "Deploy radar" : definition.name;
    const site = validateEquipmentUse(
      ctx.mission,
      unit.id,
      definition.id,
      tile,
      rules,
      ctx.graph,
    );
    return site.ok
      ? {
          id,
          label,
          icon: "radar",
          detail: `${String(definition.apCost)} AP · scan ${String(definition.radar?.scanRange ?? RADAR_TUNING.scanRange)}`,
        }
      : closed(id, label, "radar", site.error, ctx);
  }
  if (definition.kind === "turret") {
    const id = itemId("deploy-turret", tileArgument(tile));
    const site = validateEquipmentUse(
      ctx.mission,
      unit.id,
      definition.id,
      tile,
      rules,
      ctx.graph,
    );
    return site.ok
      ? {
          id,
          label: "Deploy turret",
          icon: "overwatch",
          detail: [
            `${String(definition.apCost)} AP`,
            `${String(overwatchShotsOf(TURRET_TUNING.weapon.profile))} shots`,
            `${String(TURRET_TUNING.batteryTurns)} turns`,
            `${String(usesLeft)}/${String(definition.uses)}`,
          ].join(" · "),
        }
      : closed(id, "Deploy turret", "overwatch", site.error, ctx);
  }
  const id = itemId(
    "equipment",
    `${definition.id}${ID_SEPARATOR}${tileArgument(tile)}`,
  );
  const uses = `${String(usesLeft)}/${String(definition.uses)}`;
  if (definition.kind === "heal") {
    return healItem(id, tile, unit, definition, uses, rules, ctx);
  }
  const icon = definition.kind === "charge" ? "warning" : "attack";
  const preview = previewEquipmentUse(
    ctx.mission,
    unit.id,
    definition.id,
    tile,
    rules,
    ctx.previewDeps,
  );
  if (!preview.ok) {
    return closed(id, definition.name, icon, preview.error, ctx);
  }
  const detail =
    definition.kind === "charge"
      ? [
          chargeDetail(preview.value, unit),
          chargeDelayText(definition.delayTurns ?? DEFAULT_CHARGE_DELAY_TURNS),
          uses,
        ].join(" · ")
      : `${blastDetail(preview.value, unit)} · ${uses}`;
  return { id, label: definition.name, icon, detail };
}

/** What the equipment rules are asked with: the shipped catalogue and the wheel's combat tuning. */
function equipmentRulesOf(ctx: WheelContext): EquipmentRules {
  return { catalogue: SHIPPED_EQUIPMENT, combat: ctx.deps.combatTuning };
}

/**
 * The entry for a medkit or a repair kit at a tile (#1138): "Heal" for
 * flesh, "Repair" for metal — the verb rather than the item, since the
 * ring is a list of things to do — with what each unit gets and how
 * many would get it, then the uses left. Closed with the rules' reason
 * when the throw is refused or nobody in the footprint can be mended,
 * which the ring says as "nobody to heal" or "nothing to repair".
 *
 * ```
 *   Heal     +10 hp · 2 allies · 4/4
 *   Repair   +25 hp · 1 ally · 2/2
 *   Repair   nothing to repair            (closed)
 * ```
 */
function healItem(
  id: string,
  tile: TileCoord,
  unit: Unit,
  definition: EquipmentDefinition,
  uses: string,
  rules: EquipmentRules,
  ctx: WheelContext,
): RadialMenuItem {
  const label = definition.heal?.target === "mechanical" ? "Repair" : "Heal";
  const preview = previewHealUse(
    ctx.mission,
    unit.id,
    definition.id,
    tile,
    rules,
  );
  if (!preview.ok) {
    const item = closed(id, label, "hp", preview.error, ctx);
    return preview.error.kind === "nothing-to-heal" && label === "Repair"
      ? { ...item, detail: NOTHING_TO_REPAIR }
      : item;
  }
  return {
    id,
    label,
    icon: "hp",
    detail: `${healDetail(preview.value)} · ${uses}`,
  };
}

/** `+10 hp · 2 allies`: what each gets, and how many get it. */
function healDetail(preview: HealPreview): string {
  const count = preview.beneficiaries.length;
  return `+${String(preview.amount)} hp · ${String(count)} ${count === 1 ? "ally" : "allies"}`;
}

/**
 * `18–22 dmg · 1 ally` for a charge, which cannot miss and so prints no
 * chance; the unit itself counts among the allies, because a charge
 * spares nobody and the squad has to walk away from it.
 */
function chargeDetail(preview: AttackPreview, unit: Unit): string {
  const parts = [damageText(preview.damage)];
  const allies =
    preview.blast?.victims.filter((victim) => victim.team === unit.team)
      .length ?? 0;
  if (allies > 0) {
    parts.push(`${String(allies)} ${allies === 1 ? "ally" : "allies"}`);
  }
  return parts.join(" · ");
}

/**
 * Attack at the ground (#1121), built the way the enemy page builds it
 * so the two read as one action: closed with the rules' reason when the
 * unit cannot attack at all or nothing it carries marks the ground;
 * with more than one way to hit the tile it turns the page, with one
 * weapon it is the shot itself, previewed on the ring. A rifle squad
 * with no kit sees it closed with "not at the ground", which is the
 * fact rather than an absence.
 *
 * A grenade or a charge is a way to hit the tile (#1136), so a rifle
 * squad carrying one gets the page — the rifle on it closed, the
 * grenade open — and dry weapons alone do not close the entry while
 * there is a grenade to throw: `no-charges` is the weapons' refusal,
 * not the unit's.
 */
function tileAttackItem(
  tile: TileCoord,
  unit: Unit,
  ctx: WheelContext,
): RadialMenuItem {
  const id = itemId("attack-tile", tileArgument(tile));
  const kit = attackKitOf(ctx.mission, unit);
  const refusal = actionRefusal(ctx.mission, unit.id, "attack", ctx.deps);
  if (
    refusal !== undefined &&
    (kit.length === 0 || refusal.kind !== "no-charges")
  ) {
    return closed(id, "Attack", "attack", refusal, ctx);
  }
  const weapons = weaponOptions(ctx.mission, unit.id, ctx.deps.combatTuning);
  if (weapons.length > 1 || kit.length > 0) {
    return {
      id,
      label: "Attack",
      icon: "attack",
      detail: optionsDetail(weapons.length + kit.length),
    };
  }
  const capable = tileWeaponOptions(
    ctx.mission,
    unit.id,
    ctx.deps.combatTuning,
  );
  const first = capable[0];
  if (first === undefined) {
    return closed(
      id,
      "Attack",
      "attack",
      { kind: "no-area-weapon", unitId: unit.id },
      ctx,
    );
  }
  const preview = previewTileAttack(
    ctx.mission,
    unit.id,
    tile,
    ctx.deps.combatTuning,
    first.weapon.id,
    ctx.previewDeps,
  );
  return preview.ok
    ? {
        id,
        label: "Attack",
        icon: "attack",
        detail: blastDetail(preview.value, unit),
      }
    : closed(id, "Attack", "attack", preview.error, ctx);
}

/**
 * The attack page for a tile (#1121, #1136): every weapon the unit
 * carries, the ones that can fire at the ground open with their
 * numbers, the rest closed with the reason; then the grenade and the
 * charge it carries, with the entries they had on the ring (#1132); and
 * a way back — the enemy's page with the ground at its centre.
 *
 * ```
 *   Ground · pick an attack
 *     Autocannon  (closed: not at the ground)
 *     Missile Pod  62% · 18–22 dmg
 *     Grenade      55% · 8–13 dmg · 2/2
 *     Back
 * ```
 */
function tileWeaponPage(
  tile: TileCoord,
  unit: Unit,
  ctx: WheelContext,
): WheelPage {
  const items: RadialMenuItem[] = [];
  let primaryPicked = false;
  for (const option of weaponOptions(
    ctx.mission,
    unit.id,
    ctx.deps.combatTuning,
  )) {
    const id = itemId(
      "attack-tile",
      `${tileArgument(tile)}${ID_SEPARATOR}${option.weapon.id}`,
    );
    const preview = previewTileAttack(
      ctx.mission,
      unit.id,
      tile,
      ctx.deps.combatTuning,
      option.weapon.id,
      ctx.previewDeps,
    );
    if (preview.ok) {
      items.push({
        id,
        label: option.weapon.name,
        icon: "attack",
        detail: blastDetail(preview.value, unit),
        primary: !primaryPicked,
      });
      primaryPicked = true;
    } else {
      items.push(closed(id, option.weapon.name, "attack", preview.error, ctx));
    }
  }
  for (const carried of attackKitOf(ctx.mission, unit)) {
    items.push(
      equipmentItem(tile, unit, carried.definition, carried.usesLeft, ctx),
    );
  }
  items.push({ id: itemId("back", "ground"), label: "Back", icon: "back" });
  return { items, hub: { value: "Ground", caption: "pick an attack" } };
}

/**
 * The equipment the unit attacks with (#1136): everything it carries
 * but the deployables — the radar dish, which is a scan, and the turret
 * (#1138), which is put down — and a medkit or a repair kit, which mends
 * (#1138); each keeps its own entry on the ring. In the order the
 * template lists it, so the page and the card agree.
 */
function attackKitOf(
  mission: TacticalState,
  unit: Unit,
): readonly EquipmentCarried[] {
  return equipmentOf(
    mission.templates[unit.templateId],
    unit,
    SHIPPED_EQUIPMENT,
  ).filter(
    (carried) =>
      !keepsOwnEntry(carried.definition) && !isUnitTargeted(carried.definition),
  );
}

/**
 * `2 options` under an Attack entry that turns the page: the count of
 * what the page will list. One word whether the options are two weapons
 * or a rifle and a grenade (#1136), so the entry reads the same on every
 * ring.
 */
function optionsDetail(count: number): string {
  return `${String(count)} ${count === 1 ? "option" : "options"}`;
}

/**
 * `62% · 8–13 dmg · 2 allies` — the numbers and, when any of the
 * player's own units stand in the blast, how many (#1121). The count
 * is the warning; it is printed last so it is the last thing read
 * before the click.
 */
function blastDetail(preview: AttackPreview, unit: Unit): string {
  const parts = [`${String(preview.hitChance)}%`, damageText(preview.damage)];
  const allies =
    preview.blast?.victims.filter((victim) => victim.team === unit.team)
      .length ?? 0;
  if (allies > 0) {
    parts.push(`${String(allies)} ${allies === 1 ? "ally" : "allies"}`);
  }
  return parts.join(" · ");
}

/** `x,y,z` for an entry id. */
function tileArgument(tile: TileCoord): string {
  return `${String(tile.x)},${String(tile.y)},${String(tile.z)}`;
}

/** A tile back out of `x,y,z`, or undefined for anything else. */
function parseTile(argument: string): TileCoord | undefined {
  const [x, y, z] = argument.split(",").map((part) => Number(part));
  if (x === undefined || y === undefined || z === undefined) {
    return undefined;
  }
  if ([x, y, z].some((n) => Number.isNaN(n))) {
    return undefined;
  }
  return { x, y, z };
}

/**
 * What the unit can do standing where it is. One Interact per objective
 * in reach, in `reachableObjectives` order — nearest target first, ties
 * in `mission.objectives` order — so the first is the one the Interact
 * key works (`interactTarget`) and the tracker marks "in reach", and a
 * squad beside both a trapped group and a wreck (#1179) can pick either:
 *
 * ```
 *   one in reach   ──► Interact
 *   several        ──► Interact  the wreck        (the key's: first)
 *                      Interact  the townsfolk
 * ```
 *
 * With several, each entry names its objective in the detail line, the
 * way the tracker names it, so two entries never read the same.
 */
function selfPage(unit: Unit, ctx: WheelContext): WheelPage {
  const items: RadialMenuItem[] = [
    overwatchItem(unit, ctx),
    reloadItem(unit, ctx),
  ];
  const reachable = reachableObjectives(
    ctx.mission,
    unit.id,
    ctx.deps.objectiveTuning,
  );
  for (const { objective } of reachable) {
    items.push(interactItem(objective.id, unit, ctx, reachable.length > 1));
  }
  const carcass = reachableCarcasses(
    ctx.mission,
    unit.id,
    ctx.deps.objectiveTuning,
  )[0];
  if (carcass !== undefined) {
    items.push(harvestItem(carcass.carcass, unit, ctx));
  }
  if (isDropshipTile(ctx.mission, unit.pos)) {
    items.push(boardItem(unit, ctx));
  }
  return { items };
}

/**
 * Attack first, with the hit chance at the centre; Interact when the
 * clicked thing is itself the target of an objective in reach — a
 * spawner, or a trapped group its rescue would free — whether or not
 * that objective is the one the Interact key would work first.
 */
function enemyPage(targetId: string, unit: Unit, ctx: WheelContext): WheelPage {
  const attack = enemyAttackItem(targetId, unit, ctx);
  const items: RadialMenuItem[] = [attack.item];
  const hub = attack.hub;
  const objective = reachableObjectives(
    ctx.mission,
    unit.id,
    ctx.deps.objectiveTuning,
  ).find((candidate) => candidate.target.id === targetId);
  if (objective !== undefined) {
    items.push(interactItem(objective.objective.id, unit, ctx));
  }
  items.push(...netItems(targetId, unit, ctx));
  items.push(overwatchItem(unit, ctx), reloadItem(unit, ctx));
  return hub === undefined ? { items } : { items, hub };
}

/**
 * Net on the ring of a bug a capture objective wants alive (#1179): one
 * entry per net the unit carries, thrown over the tile the bug stands
 * on, open with its cost and the nets left, or closed with the rules'
 * reason — "too strong" until the bug is worn down, "out of range"
 * until the squad is beside it. Not on the ring of any other enemy: the
 * net is for the specimen, and a closed Net on every swarmer would be
 * noise.
 *
 * ```
 *   Net   1 AP · 1/1                         → equipment:capture-net:x,y,z
 *   Net   too strong                         (closed)
 * ```
 */
function netItems(
  targetId: string,
  unit: Unit,
  ctx: WheelContext,
): readonly RadialMenuItem[] {
  const bug = ctx.mission.units.find(
    (candidate) => candidate.id === targetId && canBeNetted(candidate),
  );
  if (bug === undefined || !specimenWanted(ctx.mission, bug.sourceId)) {
    return [];
  }
  return equipmentOf(
    ctx.mission.templates[unit.templateId],
    unit,
    SHIPPED_EQUIPMENT,
  ).flatMap((carried) => {
    const { definition, usesLeft } = carried;
    if (!isUnitTargeted(definition)) {
      return [];
    }
    const id = itemId(
      "equipment",
      `${definition.id}${ID_SEPARATOR}${tileArgument(bug.pos)}`,
    );
    const use = validateEquipmentUse(
      ctx.mission,
      unit.id,
      definition.id,
      bug.pos,
      equipmentRulesOf(ctx),
      ctx.graph,
    );
    return [
      use.ok
        ? {
            id,
            label: NET_LABEL,
            icon: "bug",
            detail: `${String(definition.apCost)} AP · ${String(usesLeft)}/${String(definition.uses)}`,
          }
        : closed(id, NET_LABEL, "bug", use.error, ctx),
    ];
  });
}

/** The Attack entry of an enemy's ring, and the hub it puts at the centre when the shot is open. */
interface EnemyAttackEntry {
  readonly item: RadialMenuItem;
  readonly hub?: RadialMenuHub;
}

/**
 * Attack at an enemy or a spawner, built the way `tileAttackItem` builds
 * it so the two rings read as one action: closed with the rules' reason
 * when the unit cannot attack at all; with more than one way to hit the
 * target — several weapons, or a weapon and a grenade (#1143) — it turns
 * the page and the hub shows the best chance among them, so the ring
 * still says whether the attack is worth making before one is chosen;
 * with one weapon and no kit it is the shot itself, previewed on the
 * ring.
 *
 * The grenade and the charge are previewed at the target's tile, and a
 * dry weapon alone does not close the entry while there is a grenade to
 * throw: `no-charges` is the weapons' refusal, not the unit's. A charge
 * bids nothing for the hub — it prints no chance on its own entry
 * either, since it cannot miss.
 */
function enemyAttackItem(
  targetId: string,
  unit: Unit,
  ctx: WheelContext,
): EnemyAttackEntry {
  const attackId = itemId("attack", targetId);
  const kit = attackKitOf(ctx.mission, unit);
  const refusal = actionRefusal(ctx.mission, unit.id, "attack", ctx.deps);
  if (
    refusal !== undefined &&
    (kit.length === 0 || refusal.kind !== "no-charges")
  ) {
    return { item: closed(attackId, "Attack", "attack", refusal, ctx) };
  }
  const weapons = weaponOptions(ctx.mission, unit.id, ctx.deps.combatTuning);
  if (weapons.length > 1 || kit.length > 0) {
    const previews: Result<AttackPreview, TacticalError>[] = weapons.map(
      (option) =>
        previewAttack(
          ctx.mission,
          unit.id,
          targetId,
          ctx.deps.combatTuning,
          option.weapon.id,
        ),
    );
    const enemy = findAttackTarget(ctx.mission, targetId);
    if (enemy !== undefined) {
      for (const carried of kit) {
        if (carried.definition.kind === "charge") {
          continue;
        }
        previews.push(
          previewEquipmentUse(
            ctx.mission,
            unit.id,
            carried.definition.id,
            enemy.pos,
            equipmentRulesOf(ctx),
          ),
        );
      }
    }
    const best = previews
      .flatMap((preview) => (preview.ok ? [preview.value.hitChance] : []))
      .sort((a, b) => b - a)[0];
    if (best !== undefined) {
      return {
        item: {
          id: attackId,
          label: "Attack",
          icon: "attack",
          detail: optionsDetail(weapons.length + kit.length),
          primary: true,
        },
        hub: hitHub(best),
      };
    }
    const first = previews[0];
    return {
      item: closed(
        attackId,
        "Attack",
        "attack",
        first !== undefined && !first.ok
          ? first.error
          : { kind: "no-charges", unitId: unit.id },
        ctx,
      ),
    };
  }
  // One weapon: the entry is the shot itself, previewed right here.
  const preview = previewAttack(
    ctx.mission,
    unit.id,
    targetId,
    ctx.deps.combatTuning,
    undefined,
    ctx.previewDeps,
  );
  if (!preview.ok) {
    return { item: closed(attackId, "Attack", "attack", preview.error, ctx) };
  }
  return {
    item: {
      id: attackId,
      label: "Attack",
      icon: "attack",
      detail: alliesSuffix(
        damageText(preview.value.damage),
        preview.value,
        unit,
      ),
      primary: true,
    },
    hub: hitHub(preview.value.hitChance),
  };
}

/** Overwatch, open or marked with why not. */
function overwatchItem(unit: Unit, ctx: WheelContext): RadialMenuItem {
  return openOrClosed("overwatch", "Overwatch", "overwatch", unit, ctx);
}

/** Reload or Vent by the unit's kind (#409), open or marked with why not. */
function reloadItem(unit: Unit, ctx: WheelContext): RadialMenuItem {
  return openOrClosed(
    "reload",
    chargeRegisterFor(unit.kind).actionLabel,
    "reload",
    unit,
    ctx,
  );
}

/**
 * Interact with one objective, open or marked with why not. `named`
 * puts the objective's name in the detail line, for a ring with more
 * than one Interact on it.
 */
function interactItem(
  objectiveId: string,
  unit: Unit,
  ctx: WheelContext,
  named = false,
): RadialMenuItem {
  const refusal = actionRefusal(ctx.mission, unit.id, "interact", ctx.deps);
  const id = itemId("interact", objectiveId);
  const label = interactLabel(ctx.mission, objectiveId);
  if (refusal !== undefined) {
    return closed(id, label, "interact", refusal, ctx);
  }
  return named
    ? { id, label, icon: "interact", detail: ctx.names.objective(objectiveId) }
    : { id, label, icon: "interact" };
}

/**
 * What working the objective is called on the ring: "Pick up" for a
 * capture (#1179), whose only interaction is picking up a dropped
 * specimen, and "Interact" for the rest, as it always was.
 */
function interactLabel(mission: TacticalState, objectiveId: string): string {
  return mission.objectives.find((objective) => objective.id === objectiveId)
    ?.kind === "capture-specimen"
    ? PICK_UP_LABEL
    : "Interact";
}

/**
 * Pick up on the ring of a tile where a wanted specimen lies (#1179):
 * open when the unit can reach it now, closed with the rules' reason —
 * "squads only" or "hands full" (`carryRefusal`, the pick-up's own
 * check), else why it cannot act, else "nothing in reach" — when it
 * cannot. Undefined when nothing a capture wants lies there.
 */
function pickUpItem(
  tile: TileCoord,
  unit: Unit,
  ctx: WheelContext,
): RadialMenuItem | undefined {
  const dropped = droppedSpecimens(ctx.mission).find((candidate) =>
    sameTile(candidate.pos, tile),
  );
  const objective = ctx.mission.objectives.find(
    (candidate) =>
      candidate.kind === "capture-specimen" &&
      !candidate.complete &&
      dropped?.specimen.species === candidate.species,
  );
  if (dropped === undefined || objective === undefined) {
    return undefined;
  }
  const reachable = reachableObjectives(
    ctx.mission,
    unit.id,
    ctx.deps.objectiveTuning,
  ).some(
    (candidate) =>
      candidate.objective.id === objective.id &&
      sameTile(candidate.target.pos, tile),
  );
  if (reachable) {
    return interactItem(objective.id, unit, ctx);
  }
  return closed(
    itemId("interact", objective.id),
    PICK_UP_LABEL,
    "interact",
    carryRefusal(unit) ??
      actionRefusal(ctx.mission, unit.id, "interact", ctx.deps) ?? {
        kind: "no-objective-in-reach",
        unitId: unit.id,
      },
    ctx,
  );
}

/**
 * Strip one tech carcass (#1171), open with its worth as the detail, or
 * closed with why not. `validateHarvest` is the handler's own check, so
 * the ring and the command cannot disagree.
 */
function harvestItem(
  carcass: TechCarcass,
  unit: Unit,
  ctx: WheelContext,
): RadialMenuItem {
  const checked = validateHarvest(
    ctx.mission,
    unit.id,
    carcass.id,
    ctx.deps.objectiveTuning,
  );
  const id = itemId("harvest", carcass.id);
  return checked.ok
    ? {
        id,
        label: "Harvest",
        icon: "interact",
        detail: `${String(carcass.techPoints)} tech`,
      }
    : closed(id, "Harvest", "interact", checked.error, ctx);
}

/** True when both coordinates name the same tile, level included. */
function sameTile(a: TileCoord, b: TileCoord): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

/** Board the drop ship — what Extract is to the player (#1112). */
function boardItem(unit: Unit, ctx: WheelContext): RadialMenuItem {
  const refusal = actionRefusal(ctx.mission, unit.id, "extract", ctx.deps);
  const id = itemId("extract", "");
  return refusal === undefined
    ? { id, label: "Board", icon: "extract", detail: "drop ship" }
    : closed(id, "Board", "extract", refusal, ctx);
}

/** An entry with no argument, open when the rules allow it. */
function openOrClosed(
  action: UnitAction,
  label: string,
  icon: RadialMenuItem["icon"],
  unit: Unit,
  ctx: WheelContext,
): RadialMenuItem {
  const refusal = actionRefusal(ctx.mission, unit.id, action, ctx.deps);
  const id = itemId(action, "");
  return refusal === undefined
    ? { id, label, icon }
    : closed(id, label, icon, refusal, ctx);
}

/** An entry the rules refuse: shown, unpickable, with the reason on it. */
function closed(
  id: string,
  label: string,
  icon: RadialMenuItem["icon"],
  refusal: TacticalError,
  ctx: WheelContext,
): RadialMenuItem {
  const short = SHORT_REASONS[refusal.kind];
  return {
    id,
    label,
    icon,
    ...(short === undefined ? {} : { detail: short }),
    disabled: true,
    reason: describeRefusal(refusal, ctx.names),
  };
}

/**
 * The hit chance at the centre of an aiming wheel. `hitChance` is a
 * whole percent already (`AttackPreview`), so it is printed as it is:
 * the first version multiplied it by a hundred and the hub read 3100%.
 */
function hitHub(hitChance: number): RadialMenuHub {
  return {
    value: `${String(hitChance)}%`,
    caption: "hit chance",
    tone: hitChance >= COMFORTABLE_HIT_CHANCE ? "ok" : "warn",
  };
}

/** `text · 2 allies` when the player's own units stand in the blast (#1121), else `text`. */
function alliesSuffix(
  text: string,
  preview: AttackPreview,
  unit: Unit,
): string {
  const allies =
    preview.blast?.victims.filter((victim) => victim.team === unit.team)
      .length ?? 0;
  return allies > 0
    ? `${text} · ${String(allies)} ${allies === 1 ? "ally" : "allies"}`
    : text;
}

/** `8–13 dmg`. */
function damageText(damage: readonly [number, number]): string {
  return `${String(damage[0])}–${String(damage[1])} dmg`;
}

/** Joins an action and its argument into an entry id. */
function itemId(action: string, argument: string): string {
  return argument === "" ? action : `${action}${ID_SEPARATOR}${argument}`;
}

/** Fitted mech actions, previewed through their command validator before the wheel offers them. */
function mechItems(
  target: TacticalInvokeTarget,
  unit: Unit,
  ctx: WheelContext,
): RadialMenuItem[] {
  const template = ctx.mission.templates[unit.templateId];
  const systems = template?.systems;
  if (!systems) return [];
  const items: RadialMenuItem[] = [];
  const offer = (
    action: MechAction,
    label: string,
    detail: string,
    extra: Partial<MechActionPayload> = {},
  ): void => {
    const payload: MechActionPayload = { unitId: unit.id, action, ...extra };
    const checked = validateMechAction(ctx.mission, payload);
    const argument = extra.tile
      ? tileArgument(extra.tile)
      : (extra.targetId ?? "");
    const id = `mech:${action}${argument ? `:${argument}` : ""}`;
    items.push(
      checked.ok
        ? { id, label, detail, icon: "ability" }
        : closed(id, label, "ability", checked.error, ctx),
    );
  };
  if (
    (systems.braceAccuracy ?? 0) > 0 ||
    template.weapons.some((weapon) => weapon.profile.requiresBrace)
  )
    offer(
      "brace",
      "Brace",
      `1 AP · +${String(systems.braceAccuracy ?? 0)} aim`,
    );
  if (systems.equipment?.includes("mech-coolant"))
    offer(
      "coolant",
      "Inject coolant",
      `0 AP · ${String(unit.equipment?.["mech-coolant"] ?? systems.coolantUses ?? 0)}/${String(systems.coolantUses ?? 0)} left`,
    );
  if (target.kind === "tile" && (systems.jumpRange ?? 0) > 0)
    offer("jump", "Jump", `1 AP · +${String(systems.jumpHeat ?? 0)} heat`, {
      tile: target.tile,
    });
  if (
    target.kind === "unit" &&
    target.unitId !== unit.id &&
    systems.equipment?.includes("mech-designator")
  )
    offer(
      "designate",
      "Designate",
      `1 AP · +${String(systems.designationAccuracy ?? 0)} guided aim`,
      {
        targetId: target.unitId,
      },
    );
  return items;
}
