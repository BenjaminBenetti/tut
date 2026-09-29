import { footprintDistance } from "../../../bugs/ai/utility";
import { PassMask, allows } from "../../../mapgen/model/pass-mask";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import type { PlacedCharge } from "../../model/equipment";
import type {
  RescueCiviliansObjective,
  SealTunnelsObjective,
} from "../../model/tactical-state";
import type { UnitId } from "../../model/unit";
import { isMelee } from "../../model/weapon-profile";
import { SHIPPED_EQUIPMENT } from "../../repository/equipment-catalogue";
import { unitFootprintSize } from "../footprint-service";
import {
  rescueProgress,
  trappedGroups,
} from "../objectives/rescue-civilians-objective";
import { hasLineOfSight } from "../sight-service";
import type { BurningTunnelCharge } from "../tunnel-charge-service";
import { burningTunnelCharges } from "../tunnel-charge-service";
import {
  OBJECTIVE_STRATEGIES,
  SEAL_TUNNELS_STRATEGY,
} from "./objective-strategies.test-helper";
import type {
  Job,
  ObjectiveStrategies,
  ObjectiveStrategy,
  UnitOrder,
} from "./objective-strategy.test-helper";
import { fieldFor } from "./player-navigation.test-helper";
import { stepsTo } from "./player-policy.test-helper";
import type { PlayerView } from "./player-view.test-helper";

// ===========================================
// The expert's own strategies (#1179, campaign arc §12)
// ===========================================
//
// Where the careful player reads an objective differently from the new
// one, not only fights it differently. The table is the shared one with
// the expert's own entries laid over it, so every other kind is played
// exactly as the new player plays it, and a kind the shared table gains
// reaches the expert with no edit here.
//
//   OBJECTIVE_STRATEGIES ──► both players
//   EXPERT_OBJECTIVE_STRATEGIES = OBJECTIVE_STRATEGIES
//                                 + rescue-civilians (below)
//                                 + seal-tunnels (below)      ──► the expert
//
// Rescue (arc §6.4). The bugs hunt the trapped groups, so the rescue is
// a race. The expert policy works one job with the whole force, and
// escorts every freed group with one unit, and on the shared table that
// loses the race twice over (C2b-1-field, forces 15/35 and filled):
//
// - The force frees one group at a time while the others wait to be
//   eaten.
// - An escort holding beside a group just out of its building stands
//   in its doorway, and the group never gets out. Freed groups were
//   left on the map at the turn cap with their escort beside them.
//
// So the expert splits the force and leaves the freed groups to walk:
//
//   every trapped group ──► a job, cheapest round trip first
//                             (force → group → drop ship)
//     the cheapest ──► the main job: everyone not on a team
//     each other   ──► a team of RESCUE_TEAM
//     all of them  ──► at full pace (urgent): no creeping from cover
//   freed groups   ──► walk home on their own (the standing order)

/** Units sent to free each group other than the one the force works. */
const RESCUE_TEAM = 2;

// Tunnel Sabotage (arc §6.7, Ben's rule of 2026-09-28). A bug's melee
// attack pulls a burning charge, and a burrower comes up each open
// mouth every few turns, so a charge left alone is a charge pulled. The
// expert works every mouth at once and holds each charge until it
// blows, watching it from a ring just outside the blast. One body
// walking mouth to mouth reached the last among the waves and lost it
// to a pull every turn (act 2, 13/16 at best); crews of two, the main
// body to the furthest mouth, win 31/32 in act 2 and 32/32 in act 3
// (C2b-2-defence.md).
//
//   each charge burning ──► a crew of TUNNEL_CREW guards its ring
//   each open mouth     ──► a crew of TUNNEL_CREW sets it
//   the rest            ──► the furthest open mouth, else the soonest charge
//
//   ring:  flat distance blast + 2 .. blast + 1 + GUARD_RING_DEPTH from
//          the charge (the danger the HUD draws is blast + 1), standing
//          ground a squad can hold, with a line of sight to the charge
//          tile, where a burrower that surfaces comes up into fire.
//   fire:  the bugs in sight that could reach the charge (or the mouth
//          about to be set) in the next bug phase, nearest first, before
//          any other; the rest only when none of those is in the sights.
//   set:   only with none of those in the unit's sights: a charge set
//          under a bug that reaches it is a charge pulled.

/**
 * Units the expert leaves on each burning charge, and sends to each
 * open mouth, other than the one the rest of the force works.
 */
const TUNNEL_CREW = 2;

/** Rings of tiles past the blast's danger the guards may stand on. */
const GUARD_RING_DEPTH = 2;

/**
 * Flat tiles past a bug's walk and bite it may stand and still be
 * counted as able to reach a charge: the reach a storey of height adds.
 */
const STOREY_SLACK = 1;

// ===========================================
// Rescue
// ===========================================

/**
 * The expert's rescue: every trapped group at once, the one the round
 * trip makes cheapest with the whole force and each other with a team,
 * at full pace; no escort standing in a freed group's way.
 */
export const EXPERT_RESCUE_CIVILIANS_STRATEGY: ObjectiveStrategy<"rescue-civilians"> =
  {
    /** Done once the tracker reads complete or failed, as for the new player. */
    settled(objective, view) {
      return rescueProgress(view.mission, objective).status !== "open";
    },
    /** A job for every trapped group: the cheapest for the force, the rest for teams. */
    jobs(objective, view) {
      return cheapestFirst(view, objective).map((place, index): Job => ({
        order: {
          kind: "work",
          goals: [place],
          interact: objective.id,
          urgent: true,
        },
        ...(index === 0 ? {} : { crew: RESCUE_TEAM }),
      }));
    },
  };

// ===========================================
// Tunnel Sabotage
// ===========================================

/**
 * The expert's tunnels: every mouth at once, and every charge held
 * until it blows. Each burning charge on the objective's mouths keeps a
 * crew on the ring just outside its blast, and each open mouth but one
 * gets a crew to set it; the rest of the force takes the open mouth
 * furthest from it, where a crew would arrive alone and late to a
 * burrower that came up there first, or, once none is open, reinforces
 * the charge that blows soonest. A pulled charge's mouth is open again,
 * so it comes back as a job. Every job shoots first at the bugs in
 * sight that could reach its charge, or the mouth it is about to set,
 * in the coming bug phase (`chargeThreats`), and a unit with one in its
 * sights shoots it before it sets a charge: a bite on the charge undoes
 * the turn, and a swarmer across the map does not.
 *
 * ```
 *   each burning charge ──► guard its ring, crew TUNNEL_CREW   (soonest first)
 *   each open mouth     ──► set it,         crew TUNNEL_CREW
 *   the rest            ──► the open mouth furthest from the force,
 *                           else the soonest charge's ring    (uncrewed: the main job)
 * ```
 */
export const EXPERT_SEAL_TUNNELS_STRATEGY: ObjectiveStrategy<"seal-tunnels"> = {
  /** Done once the tracker reads complete or failed, as for the new player. */
  settled(objective, view) {
    return SEAL_TUNNELS_STRATEGY.settled(objective, view);
  },
  /** A crew on each charge and each open mouth; the rest to the furthest mouth. */
  jobs(objective, view) {
    const guards = burningOn(view, objective).map((burning): Job => ({
      order: firstAt(
        {
          kind: "guard",
          goals: guardRing(view, burning.charge),
          holdRadius: 0,
        },
        chargeThreats(view, burning.charge.tile),
      ),
      crew: TUNNEL_CREW,
    }));
    const sets = SEAL_TUNNELS_STRATEGY.jobs(objective, view).map((job): Job => {
      const mouth = job.order.goals[0];
      return {
        order:
          mouth === undefined
            ? job.order
            : firstAt(job.order, chargeThreats(view, mouth)),
        crew: TUNNEL_CREW,
      };
    });
    const lead = sets.length > 0 ? farthestJob(view, sets) : guards[0];
    return [...guards, ...sets].map((job) =>
      job === lead ? { order: job.order } : job,
    );
  },
};

// ===========================================
// The table
// ===========================================

/** The expert's strategy table: the shared one, with the expert's own rescue and tunnels. */
export const EXPERT_OBJECTIVE_STRATEGIES: ObjectiveStrategies = {
  ...OBJECTIVE_STRATEGIES,
  "rescue-civilians": EXPERT_RESCUE_CIVILIANS_STRATEGY,
  "seal-tunnels": EXPERT_SEAL_TUNNELS_STRATEGY,
};

// ===========================================
// Private
// ===========================================

/**
 * The trapped groups' places, cheapest round trip first: the walk from
 * the nearest unit of the force to the group, plus the group's walk
 * from there to the drop ship. Ties keep the objective's order.
 *
 * ```
 *   drop ship ◄──── back ──── group ◄──── out ──── force
 *   cost = out + back          (not out alone: a group near the force
 *                               but far from home costs the walk home)
 * ```
 */
function cheapestFirst(
  view: PlayerView,
  objective: RescueCiviliansObjective,
): readonly TileCoord[] {
  return trappedGroups(view.mission, objective)
    .map((group, order) => ({
      place: group.pos,
      order,
      cost: roundTrip(view, group.pos),
    }))
    .sort((a, b) => a.cost - b.cost || a.order - b.order)
    .map((entry) => entry.place);
}

/**
 * Steps from the force's nearest unit to `place`, plus steps from
 * `place` to the nearest drop-ship tile; infinite when nobody can get
 * there or back.
 */
function roundTrip(view: PlayerView, place: TileCoord): number {
  const index = view.graph.index;
  let out = Number.POSITIVE_INFINITY;
  let back = Number.POSITIVE_INFINITY;
  for (const unit of view.force) {
    const field = fieldFor(view.graph, unit, [place]);
    out = Math.min(out, field.get(index.keyOf(unit.pos)) ?? out);
    for (const tile of view.mission.extraction) {
      back = Math.min(back, field.get(index.keyOf(tile)) ?? back);
    }
  }
  return out + back;
}

/**
 * The charges burning on the objective's mouths, the one that blows
 * soonest first, the mouths' order breaking a tie.
 */
function burningOn(
  view: PlayerView,
  objective: SealTunnelsObjective,
): readonly BurningTunnelCharge[] {
  const mouths = new Set(objective.mouthIds);
  return burningTunnelCharges(view.mission)
    .map((burning, order) => ({ burning, order }))
    .filter((entry) => mouths.has(entry.burning.mouth.id))
    .sort(
      (a, b) =>
        a.burning.charge.detonatesOnTurn - b.burning.charge.detonatesOnTurn ||
        a.order - b.order,
    )
    .map((entry) => entry.burning);
}

/**
 * The job whose goals are the furthest walk for the force: the most
 * steps its nearest unit takes to reach them, the jobs' order breaking
 * a tie; a job nobody can reach is passed over, and with none reachable
 * the first job.
 *
 * ```
 *   mouth A: 6 steps from the nearest unit    crew
 *   mouth B: 25 steps                         the rest of the force  ◄──
 *   mouth C: 11 steps                         crew
 * ```
 */
function farthestJob(view: PlayerView, jobs: readonly Job[]): Job | undefined {
  let best: Job | undefined;
  let bestSteps = Number.NEGATIVE_INFINITY;
  for (const job of jobs) {
    const steps = Math.min(
      ...view.force.map((unit) => stepsTo(view, unit, job.order.goals)),
    );
    if (Number.isFinite(steps) && steps > bestSteps) {
      best = job;
      bestSteps = steps;
    }
  }
  return best ?? jobs[0];
}

/**
 * The bugs in sight that could pull a charge on `tile` in the coming
 * bug phase, nearest first: each with a melee weapon, standing within
 * what its codex card says it walks in a turn (its move for each
 * action) plus its bite and a storey's slack, block to block. What the
 * player can read off the unit card, not the bugs' own plan.
 */
function chargeThreats(view: PlayerView, tile: TileCoord): readonly UnitId[] {
  return view.enemies
    .flatMap((bug) => {
      const template = view.mission.templates[bug.templateId];
      const bite = template?.weapons.find((weapon) => isMelee(weapon.profile));
      if (template === undefined || bite === undefined) return [];
      const distance = footprintDistance(
        bug.pos,
        unitFootprintSize(view.mission, bug),
        tile,
      );
      const reach =
        template.move * template.maxAp + bite.profile.range + STOREY_SLACK;
      return distance <= reach ? [{ id: bug.id, distance }] : [];
    })
    .sort((a, b) => a.distance - b.distance)
    .map((threat) => threat.id);
}

/** `order` with `threats` to shoot first, when there are any. */
function firstAt(order: UnitOrder, threats: readonly UnitId[]): UnitOrder {
  return threats.length === 0 ? order : { ...order, priority: threats };
}

/**
 * Where the guards stand round a burning charge: squad ground at a flat
 * distance just outside the blast's danger ring (blast + 2 to blast + 1
 * + `GUARD_RING_DEPTH`), with a line of sight to the charge tile, so a
 * burrower surfacing there comes up into their fire. Without a sighted
 * tile the ring itself, and without that the charge tile, so a guard
 * still heads for it.
 *
 * ```
 *   . . r r . .      c  the charge (the mouth's tile)
 *   . r . . r .      .  inside the danger the HUD draws: nobody stops
 *   r . . c . r      r  the ring the guards hold, sight lines to c
 * ```
 */
function guardRing(
  view: PlayerView,
  charge: PlacedCharge,
): readonly TileCoord[] {
  const blast =
    SHIPPED_EQUIPMENT.get(charge.equipmentId)?.profile?.aoe?.radius ?? 0;
  const near = blast + 2;
  const far = blast + 1 + GUARD_RING_DEPTH;
  const index = view.graph.index;
  const ring: TileCoord[] = [];
  for (let dx = -far; dx <= far; dx++) {
    const reach = far - Math.abs(dx);
    for (let dz = -reach; dz <= reach; dz++) {
      if (Math.abs(dx) + Math.abs(dz) < near) continue;
      for (const tile of index.column(charge.tile.x + dx, charge.tile.z + dz)) {
        if (allows(tile.pass, PassMask.INFANTRY)) {
          ring.push({ x: tile.x, y: tile.y, z: tile.z });
        }
      }
    }
  }
  const sighted = ring.filter((tile) =>
    hasLineOfSight(view.mission.map, tile, charge.tile, index),
  );
  if (sighted.length > 0) return sighted;
  return ring.length > 0 ? ring : [charge.tile];
}
