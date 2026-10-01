import { manhattanDistance } from "../../../core/service/grid-math";
import { PassMask, allows } from "../../../mapgen/model/pass-mask";
import type { Tile } from "../../../mapgen/model/tile";
import { attack } from "../../model/attack-command";
import { mechAction } from "../../model/mech-action-command";
import { overwatch } from "../../model/overwatch-command";
import { reload } from "../../model/reload-command";
import type { TacticalCommand } from "../../model/tactical-command";
import type { Unit, UnitId } from "../../model/unit";
import { isCombatUnit, passMaskFor } from "../../model/unit";
import { useEquipment } from "../../model/use-equipment-command";
import { damageRange } from "../attack-formulae";
import { attackEndsTurn } from "../combat-service";
import { validateMechAction } from "../mech-action-service";
import { hasLineOfSight } from "../sight-service";
import { sightRangeOf } from "../vision-service";
import type { UnitOrder } from "./objective-strategy.test-helper";
import type { PlayerRules, ShotOption } from "./player-combat.test-helper";
import {
  canFire,
  exposure,
  healOptions,
  needsReload,
  shotAtTarget,
  shotOptions,
  throwOptions,
} from "./player-combat.test-helper";
import {
  awakeView,
  berthField,
  crossesGround,
  crossesUnseen,
  isLoudShot,
  sleeperGround,
  wakesSleepers,
} from "./brood-berth.test-helper";
import { dangerKeys, vantagePoints } from "./player-goals.test-helper";
import type { MoveOption, Reach } from "./player-navigation.test-helper";
import {
  fieldAround,
  fieldAvoiding,
  fieldFor,
  moveTo,
  reachNow,
} from "./player-navigation.test-helper";
import type { ForcePlan, PlayerPolicy } from "./player-policy.test-helper";
import {
  canTake,
  extractNow,
  extractOrder,
  fallbackOrder,
  interactNow,
  netNow,
  standingOrders,
  stepsTo,
} from "./player-policy.test-helper";
import type { PlayerView } from "./player-view.test-helper";

// ===========================================
// The expert player (#1179, campaign arc §12)
// ===========================================
//
// Plays the way a veteran plays: the force works one objective at a
// time together, fire goes where it kills (the lowest effective hit
// points it can finish), grenades go where two bugs stand, moves end in
// cover facing the spitters, and a unit with nothing to shoot watches.
// It escorts freed civilians, guards the pod, pulls a badly hurt unit
// out while the rest can carry on, uses the mech's jump jets, and goes
// home when the objective is done or the force is breaking.
//
//   force ──► collapsing? all home ──► settled? escort the couriers home
//         ──► hurt home ──► crewed jobs ──► the main job, together
//
//   unit ──► extract? ──► a priority bug in the sights, before the
//            order's objective action? ──► objective action? ──► net?
//        ──► heal? ──► grenade?
//        ──► focused target, bar a likely kill? ──► kill shot / best shot,
//            at the order's first priority bug in the sights, if any
//        ──► reload? ──► the nest in sight? ──► jump?
//        ──► move to cover toward the goal ──► overwatch, bar a gun
//            whose reaction could kill the specimen it hunts
//
// Bugs asleep in a hive's chambers are neither contact nor targets: the
// expert walks round them where the cavern allows, keeps its loud guns
// quiet near them, remembers where it saw them, and in a cavern where
// broods sleep walks no further than the ground it has seen
// (`brood-berth.test-helper.ts`).

/** Hit points, as a share of the maximum, at or under which a unit is pulled out. */
const RETREAT_HP_SHARE = 0.35;

/** The share of the force deployed at or under which the rest is pulled out. */
const COLLAPSE_SHARE = 0.25;

/** A shot this likely to kill is taken before anything else is weighed. */
const KILL_SHOT_CHANCE = 0.3;

/** Steps from a courier its escorts' ground behind it reaches. */
const ESCORT_RADIUS = 2;

/**
 * Steps a courier may lead its nearest escort home by before it waits:
 * one more than the escorts' ground behind it reaches, so an escort
 * standing there never holds it up.
 */
const COURIER_LEAD = ESCORT_RADIUS + 1;

/**
 * Extra steps an escort ahead of a courier may walk to get round it to
 * its rear. Round a courier in the open costs two; more than twice that
 * and the two are in a corridor, where the escort only blocks the way.
 */
const ESCORT_DETOUR = 4;

/** Candidate tiles checked for a firing line after a move. */
const FIRING_LINE_CHECKS = 10;

/** The expert player's policy. */
export function createExpertPlayerPolicy(rules: PlayerRules): PlayerPolicy {
  return {
    id: "expert",
    /** One objective at a time with the whole force; escorts; retreats. */
    assign(view: PlayerView, plan: ForcePlan): ReadonlyMap<UnitId, UnitOrder> {
      const { orders, free } = standingOrders(view, plan);
      const home = extractOrder(view);
      if (collapsing(view)) {
        for (const unit of free) orders.set(unit.id, home);
        return orders;
      }
      if (plan.settled) {
        escortCouriers(view, plan, orders);
        return orders;
      }
      let fighting = [...free];
      const healthy = fighting.filter((unit) => !badlyHurt(unit));
      if (healthy.length >= 2) {
        for (const unit of fighting.filter(badlyHurt)) {
          orders.set(unit.id, home);
        }
        fighting = healthy;
      }
      // Crew-limited jobs first (escorts), nearest unit each, while the
      // main job keeps at least two.
      const main = mainJob(view, plan, fighting);
      for (const job of plan.jobs) {
        if (job.crew === undefined || job === main) continue;
        for (let slot = 0; slot < job.crew; slot++) {
          if (fighting.length <= 2) break;
          const pick = nearest(
            view,
            fighting.filter((unit) => canTake(unit, job)),
            job.order,
          );
          if (pick === undefined) break;
          orders.set(pick.id, job.order);
          fighting = fighting.filter((unit) => unit.id !== pick.id);
        }
      }
      for (const unit of fighting) {
        if (main !== undefined && canTake(unit, main)) {
          orders.set(unit.id, main.order);
          continue;
        }
        const own = plan.jobs
          .filter((job) => job.crew === undefined && canTake(unit, job))
          .map((job) => ({ job, steps: stepsTo(view, unit, job.order.goals) }))
          .sort((a, b) => a.steps - b.steps)[0];
        orders.set(unit.id, own?.job.order ?? fallbackOrder(view));
      }
      return orders;
    },
    /** Mechs first, then squads, then anyone else: the big guns clear the way. */
    actingOrder(view: PlayerView): readonly UnitId[] {
      const rank = (unit: Unit): number =>
        unit.kind === "mech" ? 0 : unit.kind === "squad" ? 1 : 2;
      return [...view.own]
        .sort((a, b) => rank(a) - rank(b))
        .map((unit) => unit.id);
    },
    /**
     * One command: the first of the expert's habits that applies. The
     * bugs asleep in a hive's chambers are not contact and are not shot;
     * the expert decides on the awake ones and keeps clear of the rest.
     */
    next(
      unit: Unit,
      order: UnitOrder,
      seen: PlayerView,
    ): TacticalCommand | undefined {
      const view = awakeView(seen);
      const boarding = extractNow(unit, order, view);
      if (boarding !== undefined) return boarding;
      if (unit.ap <= 0) return undefined;
      if (order.kind === "extract") {
        return (
          retreatStep(unit, order, view, rules, seen) ??
          jumpToward(unit, order, view, seen, 1) ??
          shoot(bestShot(unit, order, view, rules, seen)) ??
          watch(unit, order, view, rules)
        );
      }
      const clearing = clearFirst(unit, order, view, rules, seen);
      if (clearing !== undefined) return shoot(clearing);
      const action =
        interactNow(unit, order, view, rules) ??
        netNow(unit, order, view, rules);
      if (action !== undefined) return action;
      const heal = healOptions(view, unit, rules)
        .filter((option) => option.mended >= 6)
        .sort((a, b) => b.mended - a.mended)[0];
      if (heal !== undefined) {
        return useEquipment(unit.id, heal.equipmentId, heal.tile);
      }
      const grenade = throwOptions(view, unit, rules)
        .filter(
          (option) =>
            !option.friendlyFire &&
            (option.enemies >= 2 || option.value >= 5) &&
            !wakesSleepers(seen, option.tile, option.tile, true),
        )
        .sort((a, b) => b.value - a.value)[0];
      if (grenade !== undefined && !wantedInBlast(order, view, grenade.tile)) {
        return useEquipment(unit.id, grenade.equipmentId, grenade.tile);
      }
      const shot = bestShot(unit, order, view, rules, seen);
      if (
        order.focus === true &&
        (shot === undefined || shot.killChance < KILL_SHOT_CHANCE)
      ) {
        const atTarget = targetShot(unit, order, view, rules);
        if (atTarget !== undefined) return shoot(atTarget);
      }
      if (
        shot !== undefined &&
        !(movesFirst(unit, order, view, rules) && fresh(unit))
      ) {
        return shoot(shot);
      }
      if (shot === undefined && needsReload(view, unit, rules)) {
        return reload(unit.id);
      }
      if (shot === undefined && view.enemies.length === 0) {
        const atNest = targetShot(unit, order, view, rules);
        if (atNest !== undefined) return shoot(atNest);
      }
      const step =
        jumpToward(unit, order, view, seen) ??
        advance(unit, order, view, rules, seen);
      if (step !== undefined) return step;
      if (shot !== undefined) return shoot(shot);
      return watch(unit, order, view, rules);
    },
  };
}

// ===========================================
// Assignment
// ===========================================

/**
 * Once only getting home is left, the healthy units walk home with the
 * units carrying the objective rather than ahead of them: a courier left
 * alone is the one the bugs catch, and the force that boards without it
 * has lost what it came for. Each escort keeps to the ground just behind
 * a courier (`rearOf`), at full pace, so it covers the courier without
 * standing in its way, and boards once no courier is left on the ground.
 * A courier that has pulled ahead of every escort waits for them
 * (`waitsForEscort`), so the force moves home together. An escort ahead
 * of every courier that cannot get round to its rear (`inTheWay`) leads
 * the way home instead, since standing its ground would block the
 * courier's only way out.
 *
 * ```
 *   drop ship ◄── e C r r      a corridor: e, ahead, cannot reach the
 *                              rear r but through C, so it goes home
 * ```
 */
function escortCouriers(
  view: PlayerView,
  plan: ForcePlan,
  orders: Map<UnitId, UnitOrder>,
): void {
  const couriers = view.own.filter((unit) => plan.couriers.has(unit.id));
  if (couriers.length === 0) return;
  const escorts = view.own.filter(
    (unit) =>
      isCombatUnit(unit) && !plan.couriers.has(unit.id) && !badlyHurt(unit),
  );
  const walks: CourierWalk[] = [];
  for (const courier of couriers) {
    const field = fieldFor(view.graph, courier, view.mission.extraction);
    const rear = rearOf(view, courier, field);
    walks.push({ courier, field, rear });
    if (waitsForEscort(view, courier, escorts, field)) {
      orders.set(courier.id, {
        kind: "guard",
        goals: [courier.pos],
        holdRadius: 0,
      });
    }
  }
  const rear = walks.flatMap((walk) => walk.rear);
  const escort: UnitOrder = {
    kind: "escort",
    goals: rear.length > 0 ? rear : couriers.map((unit) => unit.pos),
    holdRadius: 1,
    protect: couriers.map((unit) => unit.id),
    urgent: true,
  };
  const home = extractOrder(view);
  for (const unit of escorts) {
    orders.set(unit.id, inTheWay(view, unit, walks) ? home : escort);
  }
}

/** A courier, its walk home and the ground behind it on that walk. */
interface CourierWalk {
  readonly courier: Unit;
  readonly field: ReadonlyMap<number, number>;
  readonly rear: readonly Tile[];
}

/**
 * Whether `escort` is nearer home than every courier, on each one's own
 * walk, and can reach none of their rears without setting foot on the
 * courier's tile or going more than `ESCORT_DETOUR` steps round it:
 * then heading for the rear only blocks the courier's way home.
 */
function inTheWay(
  view: PlayerView,
  escort: Unit,
  walks: readonly CourierWalk[],
): boolean {
  const index = view.graph.index;
  const at = index.keyOf(escort.pos);
  for (const { courier, field, rear } of walks) {
    const here = field.get(index.keyOf(courier.pos));
    const ahead = field.get(at);
    if (here === undefined || ahead === undefined || ahead >= here) {
      return false;
    }
    if (rear.length === 0) return false;
    const through = fieldFor(view.graph, escort, rear).get(at);
    const round = fieldAvoiding(
      view.graph,
      rear,
      passMaskFor(escort.passClass),
      new Set([index.keyOf(courier.pos)]),
    ).get(at);
    if (
      through !== undefined &&
      round !== undefined &&
      round - through <= ESCORT_DETOUR
    ) {
      return false;
    }
  }
  return true;
}

/**
 * The ground within `ESCORT_RADIUS` of `courier` that is farther from
 * the drop ship than the courier, on its own walk home (`field`): behind
 * it, where an escort never blocks its way.
 *
 * ```
 *        drop ship
 *            ▲
 *        . . C . .     C  the courier
 *        r r r r r     r  the rear its escorts keep to
 *          r r r
 * ```
 */
function rearOf(
  view: PlayerView,
  courier: Unit,
  field: ReadonlyMap<number, number>,
): readonly Tile[] {
  const index = view.graph.index;
  const here = field.get(index.keyOf(courier.pos));
  if (here === undefined) return [];
  const rear: Tile[] = [];
  for (let dx = -ESCORT_RADIUS; dx <= ESCORT_RADIUS; dx++) {
    const span = ESCORT_RADIUS - Math.abs(dx);
    for (let dz = -span; dz <= span; dz++) {
      for (const tile of index.column(courier.pos.x + dx, courier.pos.z + dz)) {
        const distance = field.get(index.keyOf(tile));
        if (distance !== undefined && distance > here) rear.push(tile);
      }
    }
  }
  return rear;
}

/**
 * Whether `courier` is more than `COURIER_LEAD` steps nearer home, on
 * its own walk (`field`), than the nearest of `escorts` that can walk
 * there: then it holds where it stands until one catches up. With no
 * escort left it goes on alone.
 */
function waitsForEscort(
  view: PlayerView,
  courier: Unit,
  escorts: readonly Unit[],
  field: ReadonlyMap<number, number>,
): boolean {
  const index = view.graph.index;
  const here = field.get(index.keyOf(courier.pos));
  if (here === undefined) return false;
  let nearest = Number.POSITIVE_INFINITY;
  for (const escort of escorts) {
    const distance = field.get(index.keyOf(escort.pos));
    if (distance !== undefined) nearest = Math.min(nearest, distance);
  }
  return Number.isFinite(nearest) && nearest - here > COURIER_LEAD;
}

/** Whether a unit is hurt badly enough to be pulled out. */
function badlyHurt(unit: Unit): boolean {
  return isCombatUnit(unit) && unit.hp <= unit.maxHp * RETREAT_HP_SHARE;
}

/**
 * Whether the force is breaking: at or under a quarter of what was
 * deployed is still standing (a squad or mech counts as one).
 */
function collapsing(view: PlayerView): boolean {
  const deployed =
    view.mission.units.filter(
      (unit) => unit.team === "tdf" && isCombatUnit(unit),
    ).length + view.mission.extracted.filter(isCombatUnit).length;
  const out = view.mission.extracted.filter(isCombatUnit).length;
  return (
    deployed > 0 &&
    view.force.length > 0 &&
    view.force.length + out <= deployed * COLLAPSE_SHARE
  );
}

/**
 * The job the force works together: the uncrewed job nearest the force
 * as a whole (the least summed walk over the units that can take it).
 */
function mainJob(
  view: PlayerView,
  plan: ForcePlan,
  units: readonly Unit[],
): ForcePlan["jobs"][number] | undefined {
  let best: ForcePlan["jobs"][number] | undefined;
  let bestSteps = Number.POSITIVE_INFINITY;
  for (const job of plan.jobs) {
    if (job.crew !== undefined) continue;
    const crew = units.filter((unit) => canTake(unit, job));
    if (crew.length === 0) continue;
    const steps = Math.min(
      ...crew.map((unit) => stepsTo(view, unit, job.order.goals)),
    );
    if (steps < bestSteps) {
      best = job;
      bestSteps = steps;
    }
  }
  return best;
}

/** The unit nearest the order's goals. */
function nearest(
  view: PlayerView,
  units: readonly Unit[],
  order: UnitOrder,
): Unit | undefined {
  let best: Unit | undefined;
  let bestSteps = Number.POSITIVE_INFINITY;
  for (const unit of units) {
    const steps = stepsTo(view, unit, order.goals);
    if (steps < bestSteps) {
      best = unit;
      bestSteps = steps;
    }
  }
  return best;
}

// ===========================================
// Fire
// ===========================================

/**
 * A shot at the order's target from where the unit stands: a named bug
 * in sight (the Broodmother) wherever it is, or a spawner (a nest, a
 * pod, a hive core) while it stands and the unit is more than two steps
 * off it (closer, it plants charges instead). A brood sleeping round
 * the target does not stop it: the target is the point, as its ground
 * is in `sleeperGround`.
 */
function targetShot(
  unit: Unit,
  order: UnitOrder,
  view: PlayerView,
  rules: PlayerRules,
): ShotOption | undefined {
  if (order.targetId === undefined) return undefined;
  const named = view.enemies.find((enemy) => enemy.id === order.targetId);
  if (named !== undefined) {
    return shotAtTarget(view, unit, named.id, named.hp, rules);
  }
  const spawner = view.mission.spawners.find(
    (candidate) => candidate.id === order.targetId && !candidate.destroyed,
  );
  if (spawner === undefined || stepsTo(view, unit, order.goals) <= 2) {
    return undefined;
  }
  return shotAtTarget(view, unit, spawner.id, spawner.hp, rules);
}

/**
 * The shot to take: the likeliest kill when one is likely enough, the
 * one at the lowest effective hit points first on a tie; otherwise the
 * most expected damage. At the first of the order's priority bugs it
 * has a shot at, when there is one, with whichever weapon that rule
 * picks. Never one that reaches our own, never one that could kill a
 * bug the order wants alive (its capture species, or one it spares),
 * and never one that would wake a brood asleep in `seen` (a loud gun in
 * earshot, a target among them).
 */
function bestShot(
  unit: Unit,
  order: UnitOrder,
  view: PlayerView,
  rules: PlayerRules,
  seen: PlayerView,
): ShotOption | undefined {
  const wanted = new Set([
    ...(order.spare ?? []),
    ...view.enemies
      .filter(
        (enemy) =>
          order.capture !== undefined && enemy.sourceId === order.capture,
      )
      .map((enemy) => enemy.id),
  ]);
  const at = new Map(view.enemies.map((enemy) => [enemy.id, enemy.pos]));
  const options = shotOptions(view, unit, rules).filter(
    (option) =>
      !option.friendlyFire &&
      !(
        wanted.has(option.targetId) &&
        option.preview.damage[1] >= option.targetHp
      ) &&
      !wakesSleepers(
        seen,
        unit.pos,
        at.get(option.targetId) ?? unit.pos,
        isLoudShot(view, unit, option.weaponId),
      ),
  );
  const first = (order.priority ?? []).find((id) =>
    options.some((option) => option.targetId === id),
  );
  const pool =
    first === undefined
      ? options
      : options.filter((option) => option.targetId === first);
  let kill: ShotOption | undefined;
  let most: ShotOption | undefined;
  for (const option of pool) {
    if (
      option.killChance >= KILL_SHOT_CHANCE &&
      (kill === undefined ||
        option.killChance > kill.killChance ||
        (option.killChance === kill.killChance &&
          option.targetHp < kill.targetHp))
    ) {
      kill = option;
    }
    if (most === undefined || option.expected > most.expected) {
      most = option;
    }
  }
  return kill ?? most;
}

/**
 * The shot at the first of the order's priority bugs in the unit's
 * sights, taken before the order's objective action: a tunnel charge
 * set under a bug that pulls it in the coming bug phase is an action
 * thrown away, so the bugs in reach of the mouth go first. Undefined
 * for an order with no objective action or no priority bugs, or when
 * none of them is in the sights; then the objective comes first.
 */
function clearFirst(
  unit: Unit,
  order: UnitOrder,
  view: PlayerView,
  rules: PlayerRules,
  seen: PlayerView,
): ShotOption | undefined {
  const priority = order.priority ?? [];
  if (order.interact === undefined || priority.length === 0) return undefined;
  const shot = bestShot(unit, order, view, rules, seen);
  return shot !== undefined && priority.includes(shot.targetId)
    ? shot
    : undefined;
}

/** The Attack command for a shot, when there is one. */
function shoot(shot: ShotOption | undefined): TacticalCommand | undefined {
  return shot === undefined
    ? undefined
    : attack(shot.attackerId, shot.targetId, shot.weaponId);
}

/**
 * Overwatch with what is left when there is nothing to shoot: a unit
 * that could fire and has an action watches rather than idles, unless
 * its reaction could kill the bug the order wants alive.
 */
function watch(
  unit: Unit,
  order: UnitOrder,
  view: PlayerView,
  rules: PlayerRules,
): TacticalCommand | undefined {
  return unit.ap >= 1 &&
    canFire(view, unit, rules) &&
    !reactionMayKillWanted(unit, order, view, rules)
    ? overwatch(unit.id)
    : undefined;
}

/**
 * Whether a reaction shot from `unit` could finish a bug the order wants
 * alive. A watcher cannot pick what walks into its fire, so while it
 * hunts a specimen the careful player keeps a gun off overwatch when the
 * gun a reaction fires (the first) hits hard enough to kill the wanted
 * bug in sight at the fewest hit points, or, with none in sight, a fresh
 * one of the species (the codex's figure). A bug the order spares is
 * wanted alive whatever the order's own job.
 *
 * ```
 *   no capture order, none spared             ──► false
 *   wanted bugs in sight ──► any within the band's top ──► true
 *   none in sight, capture order ──► a fresh one within it ──► true
 * ```
 */
function reactionMayKillWanted(
  unit: Unit,
  order: UnitOrder,
  view: PlayerView,
  rules: PlayerRules,
): boolean {
  const species = order.capture;
  const spare = new Set(order.spare ?? []);
  const weapon = view.mission.templates[unit.templateId]?.weapons[0];
  if ((species === undefined && spare.size === 0) || weapon === undefined) {
    return false;
  }
  const kills = (bug: Unit, hp: number): boolean => {
    const plate = view.mission.templates[bug.templateId];
    return (
      plate !== undefined &&
      damageRange(weapon.profile, plate.armor, rules.combat, plate.resist)[1] >=
        hp
    );
  };
  const inSight = view.enemies.filter(
    (enemy) =>
      spare.has(enemy.id) ||
      (species !== undefined && enemy.sourceId === species),
  );
  if (inSight.length > 0) {
    return inSight.some((bug) => kills(bug, bug.hp));
  }
  if (species === undefined) return false;
  const codex = view.mission.units.find((bug) => bug.sourceId === species);
  return codex !== undefined && kills(codex, codex.maxHp);
}

/** Whether a grenade on `tile` would catch a bug the order wants alive: its capture species, or one it spares. */
function wantedInBlast(
  order: UnitOrder,
  view: PlayerView,
  tile: { x: number; z: number },
): boolean {
  if (order.capture === undefined && (order.spare ?? []).length === 0) {
    return false;
  }
  return view.enemies.some(
    (enemy) =>
      ((order.capture !== undefined && enemy.sourceId === order.capture) ||
        order.spare?.includes(enemy.id) === true) &&
      Math.abs(enemy.pos.x - tile.x) + Math.abs(enemy.pos.z - tile.z) <= 3,
  );
}

/** Whether the unit's shot ends its turn, so it moves before it fires. */
function movesFirst(
  unit: Unit,
  order: UnitOrder,
  view: PlayerView,
  rules: PlayerRules,
): boolean {
  const template = view.mission.templates[unit.templateId];
  if (template === undefined || template.weapons.length === 0) return false;
  const endsTurn = template.weapons.every((weapon) =>
    attackEndsTurn(weapon.profile, unit.kind, rules.combat),
  );
  return (
    endsTurn &&
    order.goals.length > 0 &&
    stepsTo(view, unit, order.goals) > (order.holdRadius ?? 0)
  );
}

/** Whether the unit has not acted this turn. */
function fresh(unit: Unit): boolean {
  return unit.ap >= unit.maxAp;
}

// ===========================================
// Movement
// ===========================================

/**
 * The walk toward the order's goals: the tile that trades progress,
 * cover against the spotted shooters, the bugs that could reach it, and
 * a firing line from it. With nothing in sight (or a clock running) the
 * unit spends every action walking; with enemies in sight it walks one
 * action and fires or watches with the rest, and one with a firing line
 * where it stands only steps to another. Inside the order's hold radius
 * it only shifts to a better tile nearby. A unit out looking,
 * with nothing in sight and its goal near, walks to where it could see
 * the goal rather than at it (`lookingField`). In a cavern where broods
 * sleep, no walk crosses ground the side has not seen (`crossesUnseen`):
 * a step blind into a chamber can end inside a wake zone.
 */
function advance(
  unit: Unit,
  order: UnitOrder,
  view: PlayerView,
  rules: PlayerRules,
  seen: PlayerView,
): TacticalCommand | undefined {
  if (order.goals.length === 0) return undefined;
  const contact = view.enemies.length > 0;
  const cautious = contact && order.urgent !== true;
  if (cautious && !fresh(unit)) return undefined;
  const berth = berthField(seen, unit, order.goals);
  const field =
    (contact ? undefined : lookingField(unit, order, view)) ??
    berth ??
    fieldFor(view.graph, unit, order.goals);
  const ground = keptClear(seen, order, unit, berth);
  const actions = cautious ? 1 : unit.ap;
  const reach = reachNow(view.mission, unit, view.graph, field, actions);
  const hold = order.holdRadius ?? 0;
  const holding = reach.here <= hold;
  if (holding && !contact) return undefined;
  const danger = dangerKeys(view, rules.catalogue);
  const scored = reach.options
    .filter((option) => !danger.has(option.key) && !burning(view, option.tile))
    .filter((option) =>
      holding ? option.distance <= hold : option.distance < reach.here,
    )
    .filter((option) => !crossesGround(unit, reach, option, ground, view.graph))
    .filter((option) => !crossesUnseen(unit, reach, option, seen))
    .map((option) => ({
      option,
      score: groundScore(view, option, reach, hold),
    }))
    .sort((a, b) => b.score - a.score || a.option.cost - b.option.cost);
  if (scored.length === 0) return undefined;
  let best = scored[0];
  if (contact) {
    const firingHere = firingLineBonus(view, unit, unit.pos);
    const here =
      groundScore(
        view,
        {
          tile: tileOf(view, unit),
          key: view.graph.index.keyOf(unit.pos),
          cost: 0,
          distance: reach.here,
        },
        reach,
        hold,
      ) + firingHere;
    let bestTotal = Number.NEGATIVE_INFINITY;
    best = undefined;
    for (const entry of scored.slice(0, FIRING_LINE_CHECKS)) {
      const firing = firingLineBonus(view, unit, entry.option.tile);
      // A unit that can fire where it stands never steps to where it
      // cannot: a mech whose shot ends its turn walks first, and a step
      // behind the wall the target hides behind wastes the turn.
      if (firingHere > 0 && firing === 0) continue;
      const total = entry.score + firing;
      if (total > bestTotal) {
        best = entry;
        bestTotal = total;
      }
    }
    if (best === undefined || (holding && bestTotal <= here)) return undefined;
  }
  return best === undefined
    ? undefined
    : moveTo(unit, reach, best.option, view.graph);
}

/** No ground kept clear: the walk has no way round the sleepers. */
const NO_GROUND: ReadonlySet<number> = new Set();

/**
 * The sleeper ground `unit` keeps off on this walk: the ground its berth
 * field (`berth`) went round, or none when there was no way round (a
 * brood across the only way to the goal is the goal's price, and a unit
 * that would not cross it would never get there).
 */
function keptClear(
  seen: PlayerView,
  order: UnitOrder,
  unit: Unit,
  berth: ReadonlyMap<number, number> | undefined,
): ReadonlySet<number> {
  return berth === undefined
    ? NO_GROUND
    : sleeperGround(seen, order.goals, unit.pos);
}

/** Orders whose point is to see their goals: what a vantage serves. */
const LOOKING_ORDERS: ReadonlySet<UnitOrder["kind"]> = new Set([
  "hunt",
  "explore",
]);

/**
 * Sight ranges from its nearest goal inside which a unit out looking
 * walks to a vantage rather than at the goal: wide enough that the walk
 * round a building to the far door stays inside it.
 */
const LOOK_SIGHT_RANGES = 2;

/**
 * The field a unit out looking walks by once it is near: steps to the
 * nearest tile it could see a goal from, round every body standing now.
 * Walking at the goal itself fails where it matters, at a bug holding
 * the doorway it hides behind, a room a mech cannot enter, a floor above
 * seen through its window: the unit-blind field calls the doorway one
 * step away and the unit waits there to the cap. Undefined when the
 * order is not a looking one, the goals are far, or none can be seen
 * from anywhere the unit can walk.
 *
 * ```
 *   x: 0 1 2 3 │ 4 5 6 7        A  at the door: one step, sees nothing
 *   z=2    . A D b . .         b  holds the doorway
 *   z=6    . . D v . .         v  a vantage, through the other door
 * ```
 */
function lookingField(
  unit: Unit,
  order: UnitOrder,
  view: PlayerView,
): ReadonlyMap<number, number> | undefined {
  if (!LOOKING_ORDERS.has(order.kind)) return undefined;
  const near =
    LOOK_SIGHT_RANGES * sightRangeOf(view.mission, unit) >=
    Math.min(...order.goals.map((goal) => manhattanDistance(goal, unit.pos)));
  if (!near) return undefined;
  const walkable = fieldAround(view.mission, view.graph, unit, [unit.pos]);
  const points = vantagePoints(view, unit, order.goals, walkable);
  return points.length === 0
    ? undefined
    : fieldAround(view.mission, view.graph, unit, points);
}

/**
 * The walk home: the tile nearest the drop ship within every action
 * left, the best covered among the nearest.
 */
function retreatStep(
  unit: Unit,
  order: UnitOrder,
  view: PlayerView,
  rules: PlayerRules,
  seen: PlayerView,
): TacticalCommand | undefined {
  const berth = berthField(seen, unit, order.goals);
  const field = berth ?? fieldFor(view.graph, unit, order.goals);
  const reach = reachNow(view.mission, unit, view.graph, field, unit.ap);
  const danger = dangerKeys(view, rules.catalogue);
  const ground = keptClear(seen, order, unit, berth);
  const options = reach.options.filter(
    (option) =>
      option.distance < reach.here &&
      !danger.has(option.key) &&
      !crossesGround(unit, reach, option, ground, view.graph),
  );
  if (options.length === 0) return undefined;
  const closest = Math.min(...options.map((option) => option.distance));
  const best = options
    .filter((option) => option.distance <= closest + 1)
    .map((option) => ({
      option,
      score: exposure(view, option.tile).cover - option.distance * 2,
    }))
    .sort((a, b) => b.score - a.score || a.option.cost - b.option.cost)[0];
  return best === undefined
    ? undefined
    : moveTo(unit, reach, best.option, view.graph);
}

/**
 * The mech's jump jets toward a far goal: a landing an ally can see, in
 * jump range and height, that saves at least `saving` steps of walking
 * (two actions' worth by default; one step when the mech is boxed in on
 * its way home). At most two landings are put to the rules per decision.
 */
function jumpToward(
  unit: Unit,
  order: UnitOrder,
  view: PlayerView,
  seen: PlayerView,
  saving?: number,
): TacticalCommand | undefined {
  const systems = view.mission.templates[unit.templateId]?.systems;
  const range = systems?.jumpRange ?? 0;
  if (
    unit.kind !== "mech" ||
    systems === undefined ||
    range <= 0 ||
    order.goals.length === 0
  ) {
    return undefined;
  }
  if ((unit.heat ?? 0) + (systems.jumpHeat ?? 0) > systems.heatCapacity)
    return undefined;
  const field = fieldFor(view.graph, unit, order.goals);
  const index = view.graph.index;
  const here = field.get(index.keyOf(unit.pos)) ?? Number.POSITIVE_INFINITY;
  const walk =
    saving ?? (view.mission.templates[unit.templateId]?.move ?? 0) * 2;
  if (!Number.isFinite(here) || here <= (order.holdRadius ?? 0) + walk)
    return undefined;
  const visible = new Set(view.mission.vision.tdf?.visible ?? []);
  const occupied = new Set(
    view.mission.units
      .filter((other) => other.hp > 0 && other.id !== unit.id)
      .map((other) => index.keyOf(other.pos)),
  );
  const ground = sleeperGround(seen, order.goals, unit.pos);
  const landings: { tile: Tile; distance: number }[] = [];
  for (let dx = -range; dx <= range; dx++) {
    for (let dz = -range; dz <= range; dz++) {
      if (Math.abs(dx) + Math.abs(dz) > range || (dx === 0 && dz === 0))
        continue;
      for (const tile of index.column(unit.pos.x + dx, unit.pos.z + dz)) {
        const key = index.keyOf(tile);
        if (
          !visible.has(key) ||
          occupied.has(key) ||
          ground.has(key) ||
          !allows(tile.pass, PassMask.MECH)
        )
          continue;
        if (Math.abs(tile.y - unit.pos.y) > (systems.jumpHeight ?? 0)) continue;
        const distance = field.get(key);
        if (distance !== undefined && distance <= here - walk) {
          landings.push({ tile, distance });
        }
      }
    }
  }
  landings.sort((a, b) => a.distance - b.distance);
  for (const landing of landings.slice(0, 2)) {
    const tile = { x: landing.tile.x, y: landing.tile.y, z: landing.tile.z };
    const payload = { unitId: unit.id, action: "jump" as const, tile };
    if (validateMechAction(view.mission, payload).ok) {
      return mechAction(payload);
    }
  }
  return undefined;
}

/**
 * How good a tile is to stand on: progress toward the goals (or being
 * within the hold radius), cover against the spotted shooters that can
 * reach it, fewer bugs able to close to melee.
 */
function groundScore(
  view: PlayerView,
  option: MoveOption,
  reach: Reach,
  hold: number,
): number {
  const seen = exposure(view, option.tile);
  const progress =
    option.distance <= hold ? reach.here - hold : reach.here - option.distance;
  return Math.max(0, progress) + Math.min(4, seen.cover) - 0.75 * seen.biters;
}

/** Three points for a firing line from the tile to a spotted enemy in the unit's reach. */
function firingLineBonus(
  view: PlayerView,
  unit: Unit,
  tile: { x: number; y: number; z: number },
): number {
  const template = view.mission.templates[unit.templateId];
  const range = Math.max(
    0,
    ...(template?.weapons ?? []).map((weapon) => weapon.profile.range),
  );
  const nearestEnemies = [...view.enemies]
    .sort(
      (a, b) => manhattanDistance(a.pos, tile) - manhattanDistance(b.pos, tile),
    )
    .slice(0, 4);
  for (const enemy of nearestEnemies) {
    if (manhattanDistance(enemy.pos, tile) > range) continue;
    if (hasLineOfSight(view.mission.map, tile, enemy.pos, view.graph.index))
      return 3;
  }
  return 0;
}

/** Whether a fire burns on the tile. */
function burning(
  view: PlayerView,
  tile: { x: number; y: number; z: number },
): boolean {
  return view.mission.effects.some(
    (effect) =>
      effect.tile.x === tile.x &&
      effect.tile.y === tile.y &&
      effect.tile.z === tile.z,
  );
}

/** The tile the unit stands on. */
function tileOf(view: PlayerView, unit: Unit): Tile {
  const tile = view.graph.index.getAt(unit.pos);
  if (tile === undefined) throw new Error(`unit ${unit.id} stands off the map`);
  return tile;
}
