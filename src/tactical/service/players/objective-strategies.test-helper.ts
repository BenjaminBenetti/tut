import { manhattanDistance } from "../../../core/service/grid-math";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import type { ObjectiveKind } from "../../model/objective-rules";
import { isCharged } from "../../model/tunnel-mouth";
import type { Objective, TacticalState } from "../../model/tactical-state";
import type { Unit } from "../../model/unit";
import { defenceProgress } from "../objectives/defend-generators-objective";
import {
  objectiveComplete,
  objectiveFailed,
} from "../objectives/objective-status";
import { podRecovered } from "../objectives/recover-pod-objective";
import { rescueProgress } from "../objectives/rescue-civilians-objective";
import { isStripped } from "../objectives/strip-wreck-objective";
import type {
  Job,
  ObjectiveStrategies,
  ObjectiveStrategy,
} from "./objective-strategy.test-helper";
import {
  backOfMap,
  frontier,
  lastContacts,
  lastSighted,
  sweep,
} from "./player-goals.test-helper";
import type { PlayerView } from "./player-view.test-helper";

// ===========================================
// One strategy per objective kind (#1179, campaign arc §12)
// ===========================================
//
// What each kind of objective asks of the force, read off the HUD:
//
//   destroy-spawner    walk to the nest's blip, plant charges or shoot it
//   destroy-pod        the same, against the pod's clock
//   destroy-hive-core  find it at the back of the cavern, then the same
//   defend-generators  hold round the generators; hunt the last bugs
//   capture-specimen   find the species, wear it down, net it, carry it home
//   rescue-civilians   free each trapped group; freed groups walk home
//   strip-wreck        squads work the wreck two turns; a worker carries the parts
//   seal-tunnels       charge every open mouth, stand clear of the fuse
//   recover-pod        hold round the pod until the drop lifts it
//
// Alpha Hunt (kill-broodmother) and Spore Platform (board-core,
// destroy-platform-core) have no real strategy yet: their table entries
// are stubs that kill everything, then extract.

/** Field steps from a guarded thing within which a guard holds. */
const GUARD_RADIUS = 3;

/** Tiles from a generator within which a spotted bug means it is under attack. */
const THREAT_RADIUS = 6;

/** Field steps from a freed group within which its escort walks. */
const ESCORT_RADIUS = 2;

// ===========================================
// Wrecking a spawner
// ===========================================

/**
 * A spawner-wrecking objective's jobs: the whole force to its blip,
 * charges in hand, free to shoot the target once it is in sight.
 */
function wreckJobs(
  objective: Objective & { readonly targetId: string },
  view: PlayerView,
  urgent = false,
  focus = false,
): readonly Job[] {
  const goals = view.places.get(objective.id) ?? [];
  if (goals.length === 0) {
    return [];
  }
  return [
    {
      order: {
        kind: "destroy",
        goals,
        interact: objective.id,
        targetId: objective.targetId,
        ...(urgent ? { urgent } : {}),
        ...(focus ? { focus } : {}),
      },
    },
  ];
}

/** Destroy one egg spawner: to its blip, then charges or fire. */
export const DESTROY_SPAWNER_STRATEGY: ObjectiveStrategy<"destroy-spawner"> = {
  /** Done once the nest is down or the tracker says it failed. */
  settled(objective, view) {
    return closed(objective, view.mission);
  },
  /** The whole force to the nest. */
  jobs(objective, view) {
    return wreckJobs(objective, view);
  },
};

/** Wreck the crash site's pod before it ripens: a spawner on a clock. */
export const DESTROY_POD_STRATEGY: ObjectiveStrategy<"destroy-pod"> = {
  /** Done once the pod is down, or ripened. */
  settled(objective, view) {
    return closed(objective, view.mission);
  },
  /** The whole force to the pod, against its clock. */
  jobs(objective, view) {
    return wreckJobs(objective, view, true);
  },
};

/**
 * Bring down the hive core: its blip waits until the core is seen, so
 * until then the force heads for the back of the cavern, where the
 * briefing says it sits. At full pace, even in contact, and with the
 * core in its sights a unit fires on the core before the bugs: the
 * waves, the nests and the broods only add bugs the longer it takes,
 * and the cavern is a long walk there and back.
 */
export const DESTROY_HIVE_CORE_STRATEGY: ObjectiveStrategy<"destroy-hive-core"> =
  {
    /** Done, as far as the fight goes, the moment the core falls; then home. */
    settled(objective, view) {
      return objective.complete || objectiveFailed(view.mission, objective);
    },
    /** To the core once seen, fire on it first; the back of the map before; urgent. */
    jobs(objective, view) {
      const jobs = wreckJobs(objective, view, true, true);
      if (jobs.length > 0) {
        return jobs;
      }
      return [
        { order: { kind: "explore", goals: backOfMap(view), urgent: true } },
      ];
    },
  };

// ===========================================
// Holding
// ===========================================

/**
 * Hold the generators through every wave: the force stands round the
 * running generators; once the tracker says every wave has landed and
 * nothing is in sight, it goes after the last bugs where they were seen.
 */
export const DEFEND_GENERATORS_STRATEGY: ObjectiveStrategy<"defend-generators"> =
  {
    /** Done once the tracker reads complete or failed. */
    settled(objective, view) {
      return closed(objective, view.mission);
    },
    /**
     * Guard the generators, the ones under attack first; after the last
     * wave, with no generator under attack and the tracker still counting
     * bugs, go and find them: what is in sight, the last contact, the
     * unexplored ground, then whatever is out of sight.
     */
    jobs(objective, view) {
      const generators = view.mission.units.filter(
        (unit) => objective.targetIds.includes(unit.id) && unit.hp > 0,
      );
      const progress = defenceProgress(view.mission, objective);
      const lastWave =
        progress.totalWaves !== undefined &&
        progress.wave >= progress.totalWaves;
      const threatened = generators.filter((generator) =>
        view.enemies.some(
          (enemy) =>
            manhattanDistance(enemy.pos, generator.pos) <= THREAT_RADIUS,
        ),
      );
      if (lastWave && threatened.length === 0 && progress.bugsLeft > 0) {
        const goals = straggler(
          view,
          generators.map((unit) => unit.pos),
        );
        if (goals.length > 0) {
          return [{ order: { kind: "hunt", goals } }];
        }
      }
      const held = threatened.length > 0 ? threatened : generators;
      return [
        {
          order: {
            kind: "guard",
            goals: held.map((unit) => unit.pos),
            holdRadius: GUARD_RADIUS,
            protect: held.map((unit) => unit.id),
          },
        },
      ];
    },
  };

/**
 * Keep the pod alive until the drop lifts it: the force stands round
 * the pod, which the swarm hunts.
 */
export const RECOVER_POD_STRATEGY: ObjectiveStrategy<"recover-pod"> = {
  /** Done once the pod is lifted or lost. */
  settled(objective, view) {
    return (
      podRecovered(objective, view.mission) ||
      objectiveFailed(view.mission, objective)
    );
  },
  /** Guard the pod. */
  jobs(objective, view) {
    const pod = view.mission.units.find(
      (unit) => unit.id === objective.targetId && unit.hp > 0,
    );
    if (pod === undefined) {
      return [];
    }
    return [
      {
        order: {
          kind: "guard",
          goals: [pod.pos],
          holdRadius: GUARD_RADIUS,
          protect: [pod.id],
        },
      },
    ];
  },
};

// ===========================================
// Interacting
// ===========================================

/**
 * Free the trapped groups: the force goes to the nearest blip and frees
 * it; freed groups walk themselves home (the policy orders them). The
 * careful player also walks a unit beside each freed group.
 */
export const RESCUE_CIVILIANS_STRATEGY: ObjectiveStrategy<"rescue-civilians"> =
  {
    /** Done once the tracker reads complete or failed. */
    settled(objective, view) {
      const progress = rescueProgress(view.mission, objective);
      return progress.status !== "open";
    },
    /** Free each trapped group; escort each freed one. */
    jobs(objective, view) {
      const jobs: Job[] = [];
      for (const place of view.places.get(objective.id) ?? []) {
        jobs.push({
          order: { kind: "work", goals: [place], interact: objective.id },
        });
      }
      const freed = view.own.filter(
        (unit) => objective.groupIds.includes(unit.id) && unit.hp > 0,
      );
      for (const group of freed) {
        jobs.push({
          order: {
            kind: "escort",
            goals: [group.pos],
            holdRadius: ESCORT_RADIUS,
            protect: [group.id],
          },
          crew: 1,
          expertOnly: true,
        });
      }
      return jobs;
    },
  };

/**
 * Strip the lost mech's wreck: squads work it once a turn until the
 * parts are loose, anyone else stands guard over them; then a worker
 * carries the parts home (the courier rule).
 */
export const STRIP_WRECK_STRATEGY: ObjectiveStrategy<"strip-wreck"> = {
  /** Done with the wreck once it is stripped, or the tracker says failed. */
  settled(objective, view) {
    return (
      isStripped(objective) ||
      objectiveComplete(view.mission, objective) ||
      objectiveFailed(view.mission, objective)
    );
  },
  /** Squads to the wreck; the rest guard it. */
  jobs(objective, view) {
    const goals = view.places.get(objective.id) ?? [];
    if (goals.length === 0) {
      return [];
    }
    return [
      {
        order: { kind: "work", goals, interact: objective.id },
        who: "squad",
      },
      { order: { kind: "guard", goals, holdRadius: GUARD_RADIUS } },
    ];
  },
  /** The squads that worked a stripped wreck carry its parts home. */
  couriers(objective, view) {
    return isStripped(objective)
      ? objective.workedBy.filter((id) =>
          view.force.some((unit) => unit.id === id),
        )
      : [];
  },
};

/**
 * Seal the tunnel mouths: the force to the nearest open, uncharged
 * mouth; a charged one is left to its fuse (the policy keeps clear of
 * the blast the HUD draws).
 */
export const SEAL_TUNNELS_STRATEGY: ObjectiveStrategy<"seal-tunnels"> = {
  /** Done once the tracker reads complete or failed. */
  settled(objective, view) {
    return closed(objective, view.mission);
  },
  /** One job per chargeable mouth. */
  jobs(objective, view) {
    const charged = (view.mission.tunnelMouths ?? []).filter(isCharged);
    const jobs: Job[] = [];
    for (const place of view.places.get(objective.id) ?? []) {
      if (charged.some((mouth) => samePlace(mouth.pos, place))) {
        continue;
      }
      jobs.push({
        order: { kind: "work", goals: [place], interact: objective.id },
      });
    }
    return jobs;
  },
};

/**
 * Take a specimen alive: once one of the species is in sight, the force
 * closes on it to wear it down and net it; until then it heads for the
 * other objectives' blips (where the bugs are) or the unexplored ground.
 * A carrier takes it home (the courier rule).
 */
export const CAPTURE_SPECIMEN_STRATEGY: ObjectiveStrategy<"capture-specimen"> =
  {
    /** Done with the hunt once a squad carries one, or it can no longer be done. */
    settled(objective, view) {
      return (
        closed(objective, view.mission) ||
        carriers(view, objective.species).length > 0
      );
    },
    /** After the species when seen; else toward the nests and the fog. */
    jobs(objective, view) {
      const wanted = view.enemies.filter(
        (unit) => unit.sourceId === objective.species,
      );
      if (wanted.length > 0) {
        return [
          {
            order: {
              kind: "capture",
              goals: wanted.map((unit) => unit.pos),
              capture: objective.species,
              interact: objective.id,
            },
          },
        ];
      }
      const dropped = view.places.get(objective.id) ?? [];
      if (dropped.length > 0) {
        return [
          {
            order: { kind: "work", goals: dropped, interact: objective.id },
            who: "squad",
          },
        ];
      }
      const elsewhere: TileCoord[] = [];
      for (const [id, places] of view.places) {
        if (id !== objective.id) elsewhere.push(...places);
      }
      const goals = elsewhere.length > 0 ? elsewhere : frontier(view);
      return goals.length > 0
        ? [{ order: { kind: "explore", goals, capture: objective.species } }]
        : [];
    },
    /** Whoever carries the species takes it home. */
    couriers(objective, view) {
      return carriers(view, objective.species).map((unit) => unit.id);
    },
  };

// ===========================================
// Stubs for kinds without a real strategy yet
// ===========================================

/**
 * STUB — "kill everything, then extract". For an objective kind with
 * no real strategy yet (Alpha Hunt, Spore Platform, #1179): walk to
 * whatever the HUD blips for it, otherwise after what is in sight, where
 * bugs were last seen, then the unexplored ground; done once the flags
 * say so or nothing is left to find. Replace with a real strategy when
 * the kind is calibrated.
 */
export function killEverythingStub(): ObjectiveStrategy {
  return {
    /** Done once flagged, or once nothing is seen, remembered or blipped. */
    settled(objective, view) {
      if (objective.complete || objective.failed === true) {
        return true;
      }
      return (
        view.enemies.length === 0 &&
        lastSighted(view).length === 0 &&
        (view.places.get(objective.id) ?? []).length === 0 &&
        frontier(view).length === 0
      );
    },
    /** Blips first, then the enemy, then the fog. */
    jobs(objective, view) {
      const places = view.places.get(objective.id) ?? [];
      if (places.length > 0) {
        return [
          { order: { kind: "destroy", goals: places, interact: objective.id } },
        ];
      }
      const enemies = view.enemies.map((unit) => unit.pos);
      const leads = enemies.length > 0 ? enemies : lastSighted(view);
      const goals = leads.length > 0 ? leads : frontier(view);
      return goals.length > 0 ? [{ order: { kind: "hunt", goals } }] : [];
    },
  };
}

/** STUB: Alpha Hunt (arc §6.10) — kill everything, then extract; see `killEverythingStub`. */
export const ALPHA_HUNT_STRATEGY_STUB: ObjectiveStrategy = killEverythingStub();

/** STUB: Spore Platform (arc §6.11) — kill everything, then extract; see `killEverythingStub`. */
export const SPORE_PLATFORM_STRATEGY_STUB: ObjectiveStrategy =
  killEverythingStub();

/** The kinds a stub stands in for, for the report and the tests. */
export const STUBBED_OBJECTIVE_KINDS: readonly string[] = [
  "alpha-hunt",
  "spore-platform",
];

// ===========================================
// The table
// ===========================================

/** Every objective kind's strategy, shared by both players. */
export const OBJECTIVE_STRATEGIES: ObjectiveStrategies = {
  "destroy-spawner": DESTROY_SPAWNER_STRATEGY,
  "defend-generators": DEFEND_GENERATORS_STRATEGY,
  "destroy-pod": DESTROY_POD_STRATEGY,
  "capture-specimen": CAPTURE_SPECIMEN_STRATEGY,
  "rescue-civilians": RESCUE_CIVILIANS_STRATEGY,
  "strip-wreck": STRIP_WRECK_STRATEGY,
  "destroy-hive-core": DESTROY_HIVE_CORE_STRATEGY,
  "seal-tunnels": SEAL_TUNNELS_STRATEGY,
  "recover-pod": RECOVER_POD_STRATEGY,
  "kill-broodmother": ALPHA_HUNT_STRATEGY_STUB,
  "board-core": SPORE_PLATFORM_STRATEGY_STUB,
  "destroy-platform-core": SPORE_PLATFORM_STRATEGY_STUB,
};

// ===========================================
// Private
// ===========================================

/** Complete or failed, as the tracker reads it. */
function closed(objective: Objective, mission: TacticalState): boolean {
  return (
    objective.complete ||
    objectiveComplete(mission, objective) ||
    objectiveFailed(mission, objective)
  );
}

/** Units of ours carrying a specimen of `species`. */
function carriers(view: PlayerView, species: string): readonly Unit[] {
  return view.force.filter((unit) => unit.carrying?.species === species);
}

/** Whether two tiles are the same column and level. */
function samePlace(a: TileCoord, b: TileCoord): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

/**
 * Where to look for bugs the force cannot account for: those in sight,
 * else the last contact, else the unexplored ground, else anything out
 * of sight. The search starts nearest where the missing bugs were last
 * seen, the leads gone cold, since a straggler that slipped away is
 * most likely still near there; with no contact at all it starts
 * nearest `objective`, where the waves were headed.
 *
 * ```
 *   a lead goes cold ──► search round it, not back at the objective
 *   (walking back would take the cold lead out of sight, make it live
 *    again, and send the force to and fro between the two)
 * ```
 */
function straggler(
  view: PlayerView,
  objective: readonly TileCoord[],
): readonly TileCoord[] {
  if (view.enemies.length > 0) {
    return view.enemies.map((enemy) => enemy.pos);
  }
  const leads = lastSighted(view);
  if (leads.length > 0) {
    return leads;
  }
  const cold = lastContacts(view);
  const near = cold.length > 0 ? cold : objective;
  const unexplored = frontier(view, near);
  return unexplored.length > 0 ? unexplored : sweep(view, near);
}

/** Every objective kind the table covers, in table order. */
export const COVERED_OBJECTIVE_KINDS: readonly ObjectiveKind[] = Object.keys(
  OBJECTIVE_STRATEGIES,
) as ObjectiveKind[];
