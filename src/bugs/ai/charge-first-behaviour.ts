import { attack } from "../../tactical/model/attack-command";
import type { CombatTuning } from "../../tactical/model/combat-tuning";
import type { MissionView } from "../../tactical/model/mission-view";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit, UnitId } from "../../tactical/model/unit";
import { isBurrowed } from "../../tactical/model/unit";
import type { UnitWeapon } from "../../tactical/model/unit-weapon";
import { isMelee } from "../../tactical/model/weapon-profile";
import { validateAttack } from "../../tactical/service/combat-service";
import { unitFootprintSize } from "../../tactical/service/footprint-service";
import type { MoveGraph } from "../../tactical/service/movement-service";
import {
  apCostOf,
  buildMoveGraph,
} from "../../tactical/service/movement-service";
import type { BurningTunnelCharge } from "../../tactical/service/tunnel-charge-service";
import { burningTunnelCharges } from "../../tactical/service/tunnel-charge-service";
import type { BehaviourTag } from "../model/bug-species";
import type { BehaviourLookup } from "./behaviour-registry";
import type { BehaviourContext, BugBehaviour } from "./bug-behaviour";
import { footprintDistance, moveTowards, reachableTiles } from "./utility";

// ===========================================
// Constants
// ===========================================

/**
 * Flat tiles past a melee weapon's range a tile may be from the charge
 * and still be tried for a bite: the reach a storey of height adds. A
 * cheap filter only; `validateAttack` decides.
 */
const REACH_SLACK = 1;

// ===========================================
// Lookup
// ===========================================

/**
 * The bug phase's behaviours with the tunnel charges first (campaign arc
 * §6.7, Ben's rule of 2026-09-28): a `BehaviourLookup` over the
 * registry that hands out each behaviour wrapped in
 * `ChargeFirstBehaviour`, so every species — and a named enemy playing
 * its persona's fallback — goes for a burning charge it can pull this
 * turn before anything its own behaviour would do. The registry itself
 * is untouched (open/closed): the composition root puts this in front
 * of it for the synchronous bug phase and Jev's default act alike.
 *
 * ```
 *   runner ──► ChargeFirstLookup.get(tag) ──► ChargeFirstBehaviour(registry.get(tag))
 * ```
 */
export class ChargeFirstLookup implements BehaviourLookup {
  // ===========================================
  // Fields
  // ===========================================

  private readonly inner: BehaviourLookup;
  private readonly wrapped = new Map<BehaviourTag, BugBehaviour>();

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param inner - The registry the behaviours come from.
   */
  constructor(inner: BehaviourLookup) {
    this.inner = inner;
  }

  // ===========================================
  // BehaviourLookup
  // ===========================================

  /** The tag's behaviour with the charges first, or undefined when the registry has none. */
  get(tag: BehaviourTag): BugBehaviour | undefined {
    const known = this.wrapped.get(tag);
    if (known !== undefined) {
      return known;
    }
    const behaviour = this.inner.get(tag);
    if (behaviour === undefined) {
      return undefined;
    }
    const charged = new ChargeFirstBehaviour(behaviour);
    this.wrapped.set(tag, charged);
    return charged;
  }
}

// ===========================================
// Behaviour
// ===========================================

/**
 * A species' behaviour with a burning tunnel charge in reach put first
 * (campaign arc §6.7). The generator's rule is the precedent: what the
 * swarm came for outranks a soldier. Here the rule is stricter, because
 * a pulled charge undoes the player's whole turn at a mouth: whenever a
 * bug can make a melee attack on a burning charge this turn, it does,
 * whoever else is in reach.
 *
 * ```
 *   no charge burning, or no melee weapon ──► the species' own commands
 *   burrowed ───────────────────────────────► the species' own commands
 *   on the surface, the charge in reach ────► [attack charge]
 *   a tile it can walk to and still bite ───► [move, attack charge]   fewest steps
 *   otherwise ──────────────────────────────► the species' own commands
 * ```
 *
 * A burrower under a mouth plays its own behaviour: it comes up where
 * it will, and a bug that surfaced this turn cannot pull a charge
 * (`charge-just-surfaced`, the decision of 2026-09-28), so one that
 * comes up beside a charge pulls it from its next phase, and the
 * watchers get a turn to kill it. Where several charges are in reach
 * the nearest goes first, the mouths' order breaking a tie.
 *
 * Draws nothing: with no charge burning it returns before touching the
 * context, so every other mission plays exactly as before, and with one
 * the choice is by steps and order, not dice. It reads only the view:
 * the charges are on the TDF's side of the board and every side sees
 * them (the mouth is the bugs' own tunnel).
 */
export class ChargeFirstBehaviour implements BugBehaviour {
  // ===========================================
  // Fields
  // ===========================================

  readonly tag: BehaviourTag;
  private readonly species: BugBehaviour;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param species - The behaviour the bug plays when no charge is in reach.
   */
  constructor(species: BugBehaviour) {
    this.tag = species.tag;
    this.species = species;
  }

  // ===========================================
  // BugBehaviour
  // ===========================================

  /** A pull on the nearest charge in reach, else the species' own commands. */
  choose(
    view: MissionView,
    unitId: UnitId,
    ctx: BehaviourContext,
  ): readonly TacticalCommand[] {
    return (
      pullCharge(view, unitId, ctx) ?? this.species.choose(view, unitId, ctx)
    );
  }
}

// ===========================================
// Pulling a charge
// ===========================================

/**
 * The commands that pull a burning tunnel charge this turn, or
 * undefined when the bug can pull none; see `ChargeFirstBehaviour`.
 *
 * @param view - The mission as the bugs perceive it.
 * @param unitId - The bug.
 * @param ctx - Its combat tuning and the shared move graph; its rng is never read.
 * @returns The commands, or undefined.
 */
export function pullCharge(
  view: TacticalState,
  unitId: UnitId,
  ctx: Pick<BehaviourContext, "combat" | "graph">,
): readonly TacticalCommand[] | undefined {
  const burning = burningTunnelCharges(view);
  if (burning.length === 0) {
    return undefined;
  }
  const unit = view.units.find((candidate) => candidate.id === unitId);
  const weapon = unit === undefined ? undefined : meleeWeapon(view, unit);
  if (
    unit === undefined ||
    unit.hp <= 0 ||
    weapon === undefined ||
    isBurrowed(unit)
  ) {
    return undefined;
  }
  const byDistance = [...burning]
    .map((charge, order) => ({
      charge,
      order,
      distance: footprintDistance(
        unit.pos,
        unitFootprintSize(view, unit),
        charge.charge.tile,
      ),
    }))
    .sort((a, b) => a.distance - b.distance || a.order - b.order)
    .map((entry) => entry.charge);
  let graph: MoveGraph | undefined;
  for (const charge of byDistance) {
    const commands = fromAbove(view, unit, weapon, charge, ctx.combat, () => {
      graph ??= ctx.graph ?? buildMoveGraph(view.map);
      return graph;
    });
    if (commands !== undefined) {
      return commands;
    }
  }
  return undefined;
}

/**
 * The bug's pull on `charge` from the surface: bite from where it stands, else
 * walk to the tile it can bite from in the fewest steps with an action
 * left and bite; undefined when no such tile is in this turn's reach.
 * The graph is asked for only once a charge is close enough to walk to.
 */
function fromAbove(
  view: TacticalState,
  unit: Unit,
  weapon: UnitWeapon,
  charge: BurningTunnelCharge,
  combat: CombatTuning,
  graphOf: () => MoveGraph,
): readonly TacticalCommand[] | undefined {
  const chargeId = charge.charge.id;
  if (validateAttack(view, unit.id, chargeId, combat, weapon.id).ok) {
    return [attack(unit.id, chargeId, weapon.id)];
  }
  const size = unitFootprintSize(view, unit);
  const bite = weapon.profile.range + REACH_SLACK;
  const template = view.templates[unit.templateId];
  const stride = (template?.move ?? 0) * unit.ap;
  if (footprintDistance(unit.pos, size, charge.charge.tile) > stride + bite) {
    return undefined;
  }
  const graph = graphOf();
  const landings = reachableTiles(view, unit.id, graph)
    .filter(
      (reach) =>
        footprintDistance(reach.tile, size, charge.charge.tile) <= bite,
    )
    .sort((a, b) => a.steps - b.steps);
  for (const landing of landings) {
    // Validating the bite from the landing with the walk's action points
    // spent is also what refuses a walk that leaves none to bite with.
    const ap = unit.ap - apCostOf(view, unit, landing.steps);
    const there = withUnit(view, { ...unit, pos: landing.tile, ap });
    if (!validateAttack(there, unit.id, chargeId, combat, weapon.id).ok) {
      continue;
    }
    const step = moveTowards(view, unit.id, landing.tile, graph);
    if (step !== undefined) {
      return [step, attack(unit.id, chargeId, weapon.id)];
    }
  }
  return undefined;
}

// ===========================================
// Helpers
// ===========================================

/** The first melee weapon the bug's template carries, or undefined. */
function meleeWeapon(view: TacticalState, unit: Unit): UnitWeapon | undefined {
  return view.templates[unit.templateId]?.weapons.find((weapon) =>
    isMelee(weapon.profile),
  );
}

/** The view with `unit` in place of the unit of its id. */
function withUnit(view: TacticalState, unit: Unit): TacticalState {
  return {
    ...view,
    units: view.units.map((candidate) =>
      candidate.id === unit.id ? unit : candidate,
    ),
  };
}
