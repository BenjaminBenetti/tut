import type { TileCoord } from "../../../mapgen/model/tile-coord";
import type { EquipmentId } from "../../model/equipment";
import { extract } from "../../model/extract-command";
import { interact } from "../../model/interact-command";
import type { TacticalCommand } from "../../model/tactical-command";
import type { Unit, UnitId } from "../../model/unit";
import { isCombatUnit } from "../../model/unit";
import { useEquipment } from "../../model/use-equipment-command";
import { equipmentOf, validateEquipmentUse } from "../equipment-service";
import { reachableObjectives } from "../objective-service";
import { decidingObjectives } from "../objectives/objective-status";
import type {
  Job,
  ObjectiveStrategies,
  UnitOrder,
} from "./objective-strategy.test-helper";
import { strategyFor } from "./objective-strategy.test-helper";
import type { PlayerRules } from "./player-combat.test-helper";
import { frontier, lastSighted } from "./player-goals.test-helper";
import { fieldFor } from "./player-navigation.test-helper";
import type { PlayerView } from "./player-view.test-helper";
import { onExtraction } from "./player-view.test-helper";

// ===========================================
// Player policies (#1179, campaign arc §12)
// ===========================================
//
// A policy is how one kind of player plays: who takes which job, in
// what order the units act, and what each unit does next with its
// order. The strategies say what the objectives need; the driver asks
// the policy for one command at a time and applies it.
//
//   view ──► planForce(strategies) ──► ForcePlan { jobs, couriers, settled }
//        ──► policy.assign ──► unit ──► UnitOrder
//        ──► policy.next(unit, order) ──► TacticalCommand | done

/** What the objectives need of the force this instant. */
export interface ForcePlan {
  /** Jobs of every open deciding objective, in objective order. */
  readonly jobs: readonly Job[];
  /** Units carrying an objective home: they head for the drop ship. */
  readonly couriers: ReadonlySet<UnitId>;
  /** Every deciding objective is settled: only getting home is left. */
  readonly settled: boolean;
}

/** How one kind of player plays a turn. */
export interface PlayerPolicy {
  /** A short id for the matrix: `new`, `expert`. */
  readonly id: string;
  /** An order for every unit of ours that takes orders. */
  assign(view: PlayerView, plan: ForcePlan): ReadonlyMap<UnitId, UnitOrder>;
  /** The units in the order they act this turn. */
  actingOrder(view: PlayerView): readonly UnitId[];
  /** The unit's next command under its order, or undefined when it is done this turn. */
  next(
    unit: Unit,
    order: UnitOrder,
    view: PlayerView,
  ): TacticalCommand | undefined;
}

// ===========================================
// Planning
// ===========================================

/**
 * What the open deciding objectives need, through their strategies. An
 * optional objective (a story mission's host nests) never holds the
 * force on the map, so neither of the players works one.
 */
export function planForce(
  view: PlayerView,
  strategies: ObjectiveStrategies,
): ForcePlan {
  const jobs: Job[] = [];
  const couriers = new Set<UnitId>();
  let settled = true;
  for (const objective of view.mission.objectives) {
    const strategy = strategyFor(strategies, objective);
    for (const id of strategy.couriers?.(objective, view) ?? []) {
      couriers.add(id);
    }
  }
  for (const objective of decidingObjectives(view.mission.objectives)) {
    const strategy = strategyFor(strategies, objective);
    if (strategy.settled(objective, view)) {
      continue;
    }
    settled = false;
    jobs.push(...strategy.jobs(objective, view));
  }
  return { jobs, couriers, settled };
}

// ===========================================
// Orders
// ===========================================

/** Head for the drop ship and board it. */
export function extractOrder(view: PlayerView): UnitOrder {
  return { kind: "extract", goals: view.mission.extraction };
}

/**
 * What a unit does with no job it can take: go after what is in sight,
 * then where bugs were last seen, then the unexplored ground; with
 * nothing left anywhere, go home.
 */
export function fallbackOrder(view: PlayerView): UnitOrder {
  if (view.enemies.length > 0) {
    return { kind: "hunt", goals: view.enemies.map((unit) => unit.pos) };
  }
  const leads = lastSighted(view);
  if (leads.length > 0) {
    return { kind: "hunt", goals: leads };
  }
  const unexplored = frontier(view);
  if (unexplored.length > 0) {
    return { kind: "explore", goals: unexplored };
  }
  return extractOrder(view);
}

/** Whether `unit` can take `job` at all: its crew rule. */
export function canTake(unit: Unit, job: Job): boolean {
  if (!isCombatUnit(unit)) {
    return false;
  }
  return job.who !== "squad" || unit.kind === "squad";
}

/** Field steps from `unit` to the nearest of `goals`, Infinity when none is walkable for it. */
export function stepsTo(
  view: PlayerView,
  unit: Unit,
  goals: readonly TileCoord[],
): number {
  if (goals.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  const field = fieldFor(view.graph, unit, goals);
  return (
    field.get(view.graph.index.keyOf(unit.pos)) ?? Number.POSITIVE_INFINITY
  );
}

/**
 * The orders every player gives whatever its style: freed civilians and
 * couriers go home, and everyone goes home once the objectives are
 * settled. Returns the orders given and the units still to assign.
 */
export function standingOrders(
  view: PlayerView,
  plan: ForcePlan,
): { readonly orders: Map<UnitId, UnitOrder>; readonly free: readonly Unit[] } {
  const orders = new Map<UnitId, UnitOrder>();
  const free: Unit[] = [];
  const home = extractOrder(view);
  for (const unit of view.own) {
    if (!isCombatUnit(unit) || plan.couriers.has(unit.id) || plan.settled) {
      orders.set(unit.id, home);
    } else {
      free.push(unit);
    }
  }
  return { orders, free };
}

// ===========================================
// Commands every player gives the same way
// ===========================================

/** Extract when standing on the drop zone. */
export function extractNow(
  unit: Unit,
  order: UnitOrder,
  view: PlayerView,
): TacticalCommand | undefined {
  return order.kind === "extract" && onExtraction(view.mission, unit.pos)
    ? extract(unit.id)
    : undefined;
}

/** Interact with the order's objective when the HUD offers it in reach. */
export function interactNow(
  unit: Unit,
  order: UnitOrder,
  view: PlayerView,
  rules: PlayerRules,
): TacticalCommand | undefined {
  const objectiveId = order.interact;
  if (objectiveId === undefined) {
    return undefined;
  }
  const reachable = reachableObjectives(view.mission, unit.id, rules.objective);
  return reachable.some((entry) => entry.objective.id === objectiveId)
    ? interact(unit.id, objectiveId)
    : undefined;
}

/**
 * Throw the capture net over a wanted bug the rules accept now: worn
 * down, beside the squad, in sight. The objective's own action, so both
 * players take it.
 */
export function netNow(
  unit: Unit,
  order: UnitOrder,
  view: PlayerView,
  rules: PlayerRules,
): TacticalCommand | undefined {
  if (order.capture === undefined || unit.kind !== "squad") {
    return undefined;
  }
  const nets = netsOf(unit, view, rules);
  if (nets.length === 0) {
    return undefined;
  }
  for (const bug of view.enemies) {
    if (bug.sourceId !== order.capture) {
      continue;
    }
    for (const net of nets) {
      const use = validateEquipmentUse(
        view.mission,
        unit.id,
        net,
        bug.pos,
        rules,
        view.graph,
      );
      if (use.ok) {
        return useEquipment(unit.id, net, bug.pos);
      }
    }
  }
  return undefined;
}

/** The capture nets `unit` still has a throw of. */
export function netsOf(
  unit: Unit,
  view: PlayerView,
  rules: PlayerRules,
): readonly EquipmentId[] {
  const template = view.mission.templates[unit.templateId];
  return equipmentOf(template, unit, rules.catalogue)
    .filter((item) => item.definition.kind === "net" && item.usesLeft > 0)
    .map((item) => item.definition.id);
}
