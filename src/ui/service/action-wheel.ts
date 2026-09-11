import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { TacticalError } from "../../tactical/model/tactical-error";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit, UnitId } from "../../tactical/model/unit";
import type { WeaponId } from "../../tactical/model/unit-weapon";
import { findAttackTarget } from "../../tactical/service/attack-target-service";
import {
  previewAttack,
  weaponOptions,
} from "../../tactical/service/combat-service";
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
}

/** One page of the wheel: its entries and the fact at its centre. */
export interface WheelPage {
  readonly items: readonly RadialMenuItem[];
  readonly hub?: RadialMenuHub;
}

/** What a chosen entry stands for, parsed back out of its id. */
export type WheelChoice =
  | { readonly action: "move"; readonly tile: TileCoord }
  | {
      readonly action: "attack";
      readonly targetId: string;
      /** Undefined opens the weapon page or fires the unit's single weapon. */
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
  };

/** Separates an entry's action from its argument in the id. */
const ID_SEPARATOR = ":";

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
 *   tile      ──► Move (path) · Board (drop ship tile) · Overwatch · Reload
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
 *
 * @param targetId - The enemy unit or spawner being aimed at.
 * @param ctx - The mission, the acting unit and the rules' tuning.
 * @returns The page, or an empty one when nothing can be aimed.
 */
export function weaponWheel(targetId: string, ctx: WheelContext): WheelPage {
  const unit = ctx.mission.units.find((u) => u.id === ctx.unitId);
  const enemy = findAttackTarget(ctx.mission, targetId);
  if (unit === undefined || enemy === undefined) {
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
        detail: `${String(Math.round(preview.value.hitChance * 100))}% · ${damageText(preview.value.damage)}`,
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
    case "move": {
      const [x, y, z] = argument.split(",").map((part) => Number(part));
      if (x === undefined || y === undefined || z === undefined) {
        return undefined;
      }
      if ([x, y, z].some((n) => Number.isNaN(n))) {
        return undefined;
      }
      return { action, tile: { x, y, z } };
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
  const id = itemId(
    "move",
    `${String(tile.x)},${String(tile.y)},${String(tile.z)}`,
  );
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
  if (isDropshipTile(ctx.mission, tile)) {
    items.push(boardItem(unit, ctx));
  }
  items.push(overwatchItem(unit, ctx), reloadItem(unit, ctx));
  return { items };
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
    );
    if (preview.ok) {
      hub = hitHub(preview.value.hitChance);
      items.push({
        id: attackId,
        label: "Attack",
        icon: "attack",
        detail: damageText(preview.value.damage),
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

/** The hit chance at the centre of an aiming wheel. */
function hitHub(hitChance: number): RadialMenuHub {
  return {
    value: `${String(Math.round(hitChance * 100))}%`,
    caption: "hit chance",
    tone: hitChance >= 0.5 ? "ok" : "warn",
  };
}

/** `8–13 dmg`. */
function damageText(damage: readonly [number, number]): string {
  return `${String(damage[0])}–${String(damage[1])} dmg`;
}

/** Joins an action and its argument into an entry id. */
function itemId(action: string, argument: string): string {
  return argument === "" ? action : `${action}${ID_SEPARATOR}${argument}`;
}
