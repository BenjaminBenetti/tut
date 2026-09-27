import { attack } from "../../model/attack-command";
import { reload } from "../../model/reload-command";
import type { TacticalCommand } from "../../model/tactical-command";
import type { Unit, UnitId } from "../../model/unit";
import type { UnitOrder } from "./objective-strategy.test-helper";
import type { PlayerRules, ShotOption } from "./player-combat.test-helper";
import {
  coveredTile,
  needsReload,
  shotOptions,
} from "./player-combat.test-helper";
import { dangerKeys } from "./player-goals.test-helper";
import type { MoveOption } from "./player-navigation.test-helper";
import { fieldFor, moveTo, reachNow } from "./player-navigation.test-helper";
import type { ForcePlan, PlayerPolicy } from "./player-policy.test-helper";
import {
  canTake,
  extractNow,
  fallbackOrder,
  interactNow,
  netNow,
  standingOrders,
  stepsTo,
} from "./player-policy.test-helper";
import type { PlayerView } from "./player-view.test-helper";

// ===========================================
// The new player (#1179, campaign arc §12)
// ===========================================
//
// Plays the way a first campaign plays: every unit heads for the
// objective nearest it, shoots the nearest thing it can see, takes cover
// only when cover happens to be on the way, and uses nothing on its
// card but the reload. It does what the objective itself asks — plants
// the charge, frees the group, throws the net the briefing hands it —
// because the HUD tells it to, and goes home only when the objectives
// are done or there is nothing left to do.
//
//   unit ──► extract? ──► objective action? ──► net? ──► reload?
//        ──► shoot the nearest ──► step one action toward the goal ──► done

/** The new player's policy. */
export function createNewPlayerPolicy(rules: PlayerRules): PlayerPolicy {
  return {
    id: "new",
    /** Each unit to the job nearest it; no escorts, no retreat. */
    assign(view: PlayerView, plan: ForcePlan): ReadonlyMap<UnitId, UnitOrder> {
      const { orders, free } = standingOrders(view, plan);
      const jobs = plan.jobs.filter((job) => job.expertOnly !== true);
      for (const unit of free) {
        let best: UnitOrder | undefined;
        let bestSteps = Number.POSITIVE_INFINITY;
        for (const job of jobs) {
          if (!canTake(unit, job)) continue;
          const steps = stepsTo(view, unit, job.order.goals);
          if (steps < bestSteps) {
            best = job.order;
            bestSteps = steps;
          }
        }
        orders.set(unit.id, best ?? fallbackOrder(view));
      }
      return orders;
    },
    /** The roster's order. */
    actingOrder(view: PlayerView): readonly UnitId[] {
      return view.own.map((unit) => unit.id);
    },
    /** One command: the first of the new player's habits that applies. */
    next(
      unit: Unit,
      order: UnitOrder,
      view: PlayerView,
    ): TacticalCommand | undefined {
      const boarding = extractNow(unit, order, view);
      if (boarding !== undefined) return boarding;
      if (unit.ap <= 0) return undefined;
      const action =
        interactNow(unit, order, view, rules) ??
        netNow(unit, order, view, rules);
      if (action !== undefined) return action;
      if (needsReload(view, unit, rules)) return reload(unit.id);
      const shot = nearestShot(unit, view, rules);
      if (shot !== undefined) {
        return attack(unit.id, shot.targetId, shot.weaponId);
      }
      return stepToward(unit, order, view, rules);
    },
  };
}

// ===========================================
// Private
// ===========================================

/** The shot at the nearest spotted enemy, the likeliest to hit on a tie; none that would hit our own. */
function nearestShot(
  unit: Unit,
  view: PlayerView,
  rules: PlayerRules,
): ShotOption | undefined {
  let best: ShotOption | undefined;
  for (const option of shotOptions(view, unit, rules)) {
    if (option.friendlyFire) continue;
    if (
      best === undefined ||
      option.preview.distance < best.preview.distance ||
      (option.preview.distance === best.preview.distance &&
        option.preview.hitChance > best.preview.hitChance)
    ) {
      best = option;
    }
  }
  return best;
}

/**
 * One action's walk toward the order's goals: the tile that gets
 * closest, a covered one among equals, the cheaper walk after that.
 * Nothing once within the order's hold radius, or when no step gets
 * closer.
 */
function stepToward(
  unit: Unit,
  order: UnitOrder,
  view: PlayerView,
  rules: PlayerRules,
): TacticalCommand | undefined {
  if (order.goals.length === 0) return undefined;
  const field = fieldFor(view.graph, unit, order.goals);
  const reach = reachNow(view.mission, unit, view.graph, field, 1);
  if (reach.here <= (order.holdRadius ?? 0)) return undefined;
  const danger = dangerKeys(view, rules.catalogue);
  let best: MoveOption | undefined;
  let bestCovered = false;
  for (const option of reach.options) {
    if (option.distance >= reach.here || danger.has(option.key)) continue;
    if (best !== undefined && option.distance > best.distance) continue;
    const covered = coveredTile(view, option.tile);
    if (
      best === undefined ||
      option.distance < best.distance ||
      (covered && !bestCovered) ||
      (covered === bestCovered && option.cost < best.cost)
    ) {
      best = option;
      bestCovered = covered;
    }
  }
  if (best === undefined) return undefined;
  return moveTo(unit, reach, best, view.graph);
}
