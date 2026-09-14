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
import {
  actionRefusal,
  interactTarget,
  isDropshipTile,
} from "./action-availability";
import { chargeRegisterFor } from "./charge-register";
import { RADAR_DISH } from "../../tactical/data/equipment";
import { DEFAULT_CHARGE_DELAY_TURNS } from "../../tactical/model/equipment";
import { RADAR_TUNING } from "../../tactical/data/radar-tuning";
import type {
  EquipmentDefinition,
  EquipmentId,
} from "../../tactical/model/equipment";
import { SHIPPED_EQUIPMENT } from "../../tactical/repository/equipment-catalogue";
import { chargeDelayText } from "./charge-delay-text";
import type { EquipmentRules } from "../../tactical/service/equipment-service";
import {
  equipmentOf,
  previewEquipmentUse,
  validateEquipmentUse,
} from "../../tactical/service/equipment-service";
import type { TacticalNames } from "./tactical-error-text";
import { describeRefusal } from "./tactical-error-text";

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
  | { readonly action: "move"; readonly tile: TileCoord }
  | { readonly action: "deploy-radar"; readonly tile: TileCoord }
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
    "no-equipment": "not carried",
    "equipment-spent": "none left",
  };

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
 *   tile      ──► Move (path) · Attack at the ground (#1121; weapons page
 *                 when there are several) · Board (drop ship tile) · Overwatch · Reload
 *   enemy     ──► Attack (hub: hit chance) · Overwatch · Reload
 *   spawner   ──► Attack · Interact (if this one is in reach) · Overwatch · Reload
 *   own unit  ──► Overwatch · Reload · Interact · Board
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
  switch (target.kind) {
    case "tile":
      return tilePage(target.tile, unit, ctx);
    case "unit":
      return target.unitId === unit.id
        ? selfPage(unit, ctx)
        : enemyPage(target.unitId, unit, ctx);
    case "spawner":
      return enemyPage(target.spawnerId, unit, ctx);
  }
}

/**
 * The sub-wheel behind Attack for a unit carrying several weapons
 * (#1112, GDD §6.2: one attack per weapon). One entry per weapon with
 * its own hit chance and damage against this target, and a way back.
 * The same page whether the target is an enemy or a tile (#1121): the
 * player picks a weapon the same way, and a weapon that cannot be
 * fired at the ground is on the ring, closed, with the reason.
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
  items.push({
    id: itemId("back", targetId),
    label: "Back",
    icon: "back",
  });
  return {
    items,
    hub: { value: enemy.name, caption: "pick a weapon" },
  };
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
    case "move":
    case "deploy-radar": {
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
  // Every item the unit carries (#1132): the dish where a scanner may
  // go, a grenade or a charge on any tile it can throw to.
  for (const carried of equipmentOf(
    ctx.mission.templates[unit.templateId],
    unit,
    SHIPPED_EQUIPMENT,
  )) {
    items.push(
      equipmentItem(tile, unit, carried.definition, carried.usesLeft, ctx),
    );
  }
  items.push(overwatchItem(unit, ctx), reloadItem(unit, ctx));
  return { items };
}

/**
 * One item of the unit's equipment at a tile (#1132). The radar dish
 * keeps the entry it has always had — `deploy-radar:x,y,z`, "Deploy
 * radar", `1 AP · scan 30` — so a player and a test find it where it
 * was; a grenade or a charge reads like a shot at the ground, with the
 * uses left last. Closed with the rules' reason when the use is refused.
 */
function equipmentItem(
  tile: TileCoord,
  unit: Unit,
  definition: EquipmentDefinition,
  usesLeft: number,
  ctx: WheelContext,
): RadialMenuItem {
  const rules: EquipmentRules = {
    catalogue: SHIPPED_EQUIPMENT,
    combat: ctx.deps.combatTuning,
  };
  if (definition.kind === "radar") {
    const id = itemId("deploy-radar", tileArgument(tile));
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
          label: "Deploy radar",
          icon: "radar",
          detail: `${String(definition.apCost)} AP · scan ${String(RADAR_TUNING.scanRange)}`,
        }
      : closed(id, "Deploy radar", "radar", site.error, ctx);
  }
  const id = itemId(
    "equipment",
    `${definition.id}${ID_SEPARATOR}${tileArgument(tile)}`,
  );
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
  const uses = `${String(usesLeft)}/${String(definition.uses)}`;
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
 * with several weapons it turns the page, with one it is the shot
 * itself, previewed on the ring. A rifle squad sees it closed with
 * "not at the ground", which is the fact rather than an absence.
 */
function tileAttackItem(
  tile: TileCoord,
  unit: Unit,
  ctx: WheelContext,
): RadialMenuItem {
  const id = itemId("attack-tile", tileArgument(tile));
  const refusal = actionRefusal(ctx.mission, unit.id, "attack", ctx.deps);
  if (refusal !== undefined) {
    return closed(id, "Attack", "attack", refusal, ctx);
  }
  const weapons = weaponOptions(ctx.mission, unit.id, ctx.deps.combatTuning);
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
  if (weapons.length > 1) {
    return {
      id,
      label: "Attack",
      icon: "attack",
      detail: `${String(weapons.length)} weapons`,
    };
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
 * The weapon page for a tile (#1121): every weapon the unit carries, the
 * ones that can fire at the ground open with their numbers, the rest
 * closed with the reason, and a way back — the enemy's page with the
 * ground at its centre.
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
  items.push({ id: itemId("back", "ground"), label: "Back", icon: "back" });
  return { items, hub: { value: "Ground", caption: "pick a weapon" } };
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

/** What the unit can do standing where it is. */
function selfPage(unit: Unit, ctx: WheelContext): WheelPage {
  const items: RadialMenuItem[] = [
    overwatchItem(unit, ctx),
    reloadItem(unit, ctx),
  ];
  const objective = interactTarget(
    ctx.mission,
    unit.id,
    ctx.deps.objectiveTuning,
  );
  if (objective !== undefined) {
    items.push(interactItem(objective.objective.id, unit, ctx));
  }
  if (isDropshipTile(ctx.mission, unit.pos)) {
    items.push(boardItem(unit, ctx));
  }
  return { items };
}

/** Attack first, with the hit chance at the centre; Interact for a spawner in reach. */
function enemyPage(targetId: string, unit: Unit, ctx: WheelContext): WheelPage {
  const items: RadialMenuItem[] = [];
  let hub: RadialMenuHub | undefined;
  const weapons = weaponOptions(ctx.mission, unit.id, ctx.deps.combatTuning);
  const refusal = actionRefusal(ctx.mission, unit.id, "attack", ctx.deps);
  const attackId = itemId("attack", targetId);
  if (refusal !== undefined) {
    items.push(closed(attackId, "Attack", "attack", refusal, ctx));
  } else if (weapons.length > 1) {
    // Several weapons: the entry opens the weapon page rather than
    // firing, and the hub shows the best chance among them so the ring
    // still says whether the shot is worth taking before a weapon is
    // chosen.
    const previews = weapons.map((option) =>
      previewAttack(
        ctx.mission,
        unit.id,
        targetId,
        ctx.deps.combatTuning,
        option.weapon.id,
      ),
    );
    const best = previews
      .flatMap((preview) => (preview.ok ? [preview.value.hitChance] : []))
      .sort((a, b) => b - a)[0];
    if (best !== undefined) {
      hub = hitHub(best);
      items.push({
        id: attackId,
        label: "Attack",
        icon: "attack",
        detail: `${String(weapons.length)} weapons`,
        primary: true,
      });
    } else {
      const first = previews[0];
      items.push(
        closed(
          attackId,
          "Attack",
          "attack",
          first !== undefined && !first.ok
            ? first.error
            : { kind: "no-charges", unitId: unit.id },
          ctx,
        ),
      );
    }
  } else {
    // One weapon: the entry is the shot itself, previewed right here.
    const preview = previewAttack(
      ctx.mission,
      unit.id,
      targetId,
      ctx.deps.combatTuning,
      undefined,
      ctx.previewDeps,
    );
    if (preview.ok) {
      hub = hitHub(preview.value.hitChance);
      items.push({
        id: attackId,
        label: "Attack",
        icon: "attack",
        detail: alliesSuffix(
          damageText(preview.value.damage),
          preview.value,
          unit,
        ),
        primary: true,
      });
    } else {
      items.push(closed(attackId, "Attack", "attack", preview.error, ctx));
    }
  }
  const objective = interactTarget(
    ctx.mission,
    unit.id,
    ctx.deps.objectiveTuning,
  );
  if (objective?.spawner.id === targetId) {
    items.push(interactItem(objective.objective.id, unit, ctx));
  }
  items.push(overwatchItem(unit, ctx), reloadItem(unit, ctx));
  return hub === undefined ? { items } : { items, hub };
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

/** Interact with one objective, open or marked with why not. */
function interactItem(
  objectiveId: string,
  unit: Unit,
  ctx: WheelContext,
): RadialMenuItem {
  const refusal = actionRefusal(ctx.mission, unit.id, "interact", ctx.deps);
  const id = itemId("interact", objectiveId);
  return refusal === undefined
    ? { id, label: "Interact", icon: "interact" }
    : closed(id, "Interact", "interact", refusal, ctx);
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
