import { describe, expect, it } from "vitest";

import { STOREY_LAYERS } from "../../../core/model/elevation";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { FixtureMapBuilder } from "../../../mapgen/service/fixture-map-builder";
import { TileIndex } from "../../../mapgen/service/tile-index";
import { OBJECTIVE_TUNING } from "../../data/objective-tuning";
import { interact } from "../../model/interact-command";
import { OBJECTIVE_UPDATED } from "../../model/objective-updated-event";
import type {
  DestroyHiveCoreObjective,
  Spawner,
  TacticalState,
} from "../../model/tactical-state";
import { NO_VISION } from "../../model/tactical-state";
import { spawnerAttackTarget } from "../attack-target-service";
import { blastVictims } from "../blast-service";
import { leaveMissionSummary } from "../abandon-mission-handler";
import { missionOutcome } from "../mission-end-service";
import { buildMoveGraph, occupiedKeys, searchMoves } from "../movement-service";
import { objectiveMarkers } from "../objective-marker-service";
import {
  createInteractHandler,
  reachableObjectives,
} from "../objective-service";
import { damageSpawner } from "../spawner-damage-service";
import {
  ctxWith,
  missionWith,
  riggedRng,
  unitAt,
} from "../tactical-fixtures.test-helper";
import { perceivedOccupantAt } from "../vision-service";
import { DESTROY_HIVE_CORE_OBJECTIVE } from "./destroy-hive-core-objective";
import { OBJECTIVE_RULES } from "./objective-rules";
import {
  objectiveComplete,
  objectiveFailed,
  objectiveResultFields,
  objectiveResults,
} from "./objective-status";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number): TileCoord => ({ x, y: 0, z });

/** The core's anchor on the 12×12 field: it covers x 5–7, z 5–7. */
const CORE_POS = at(5, 5);

/** A standing level-0 hive core. */
const CORE: Spawner = {
  id: "spawner-1",
  variant: "hive-core",
  pos: CORE_POS,
  hatchRadius: 2,
  hp: 60,
  maxHp: 60,
  timer: 0,
  destroyed: false,
};

/** Bring the core down and get out. */
const OBJECTIVE: DestroyHiveCoreObjective = {
  id: "objective-1",
  kind: "destroy-hive-core",
  targetId: CORE.id,
  complete: false,
};

/** An open 12×12 field, so every side of the core has ground round it. */
function field() {
  return new FixtureMapBuilder(12, 12, 3 * STOREY_LAYERS)
    .fillGround()
    .deploy([at(0, 0)])
    .build();
}

/** The core, its objective and one rifle squad at `squadPos`. */
function missionOn(
  squadPos: TileCoord = at(0, 0),
  options: {
    readonly core?: Partial<Spawner>;
    readonly objective?: Partial<DestroyHiveCoreObjective>;
    readonly extracted?: TacticalState["extracted"];
  } = {},
): TacticalState {
  return missionWith(field(), [unitAt("u", "infantry", squadPos)], {
    spawners: [{ ...CORE, ...options.core }],
    objectives: [{ ...OBJECTIVE, ...options.objective }],
    extracted: options.extracted ?? [],
  });
}

/** `mission` with TDF having explored exactly `tiles`. */
function explored(
  mission: TacticalState,
  tiles: readonly TileCoord[],
): TacticalState {
  const index = new TileIndex(mission.map);
  return {
    ...mission,
    vision: {
      ...mission.vision,
      tdf: { ...NO_VISION, explored: tiles.map((tile) => index.keyOf(tile)) },
    },
  };
}

/** A squad already aboard the drop ship. */
const ABOARD = [unitAt("aboard", "infantry", at(0, 0))];

// ===========================================
// Completion
// ===========================================

describe("DESTROY_HIVE_CORE_OBJECTIVE — complete only after destruction and extraction", () => {
  it("is filed under its kind", () => {
    expect(OBJECTIVE_RULES["destroy-hive-core"]).toBe(
      DESTROY_HIVE_CORE_OBJECTIVE,
    );
  });

  it("is open while the core stands, aboard or not", () => {
    expect(objectiveComplete(missionOn(), OBJECTIVE)).toBe(false);
    expect(
      objectiveComplete(missionOn(at(0, 0), { extracted: ABOARD }), OBJECTIVE),
    ).toBe(false);
  });

  it("is still open once the core falls until someone is aboard", () => {
    const fallen = { ...OBJECTIVE, complete: true };
    const mission = missionOn(at(0, 0), {
      core: { hp: 0, destroyed: true },
      objective: { complete: true },
    });

    expect(objectiveComplete(mission, fallen)).toBe(false);
    expect(leaveMissionSummary(mission).objectivesOpen).toBe(1);
    expect(objectiveComplete({ ...mission, extracted: ABOARD }, fallen)).toBe(
      true,
    );
  });

  it("wins only when the core fell and the rest of the force got out", () => {
    const aboardAfterWreck = missionWith(field(), [], {
      spawners: [{ ...CORE, hp: 0, destroyed: true }],
      objectives: [{ ...OBJECTIVE, complete: true }],
      extracted: ABOARD,
    });
    const aboardCoreStanding = { ...aboardAfterWreck, spawners: [CORE] };
    const aboardCoreStandingOpen = {
      ...aboardCoreStanding,
      objectives: [OBJECTIVE],
    };

    expect(missionOutcome(aboardAfterWreck)).toBe("won");
    expect(missionOutcome(aboardCoreStandingOpen)).toBe("extracted");
  });

  it("fails with the mission: a wiped squad leaves the hive standing", () => {
    const lost = missionOn(at(0, 0), {
      core: { hp: 0, destroyed: true },
      objective: { complete: true },
    });
    const ended: TacticalState = { ...lost, outcome: "lost" };

    expect(objectiveFailed(ended, ended.objectives[0] ?? OBJECTIVE)).toBe(true);
    expect(objectiveResults(ended)).toEqual([
      {
        kind: "destroy-hive-core",
        complete: false,
        failed: true,
        done: 1,
        total: 1,
      },
    ]);
  });

  it("reports whether the core fell on the mission result", () => {
    expect(objectiveResultFields(missionOn())).toEqual({
      hiveCoreDestroyed: false,
    });
    expect(
      objectiveResultFields(
        missionOn(at(0, 0), { objective: { complete: true } }),
      ),
    ).toEqual({ hiveCoreDestroyed: true });
  });
});

// ===========================================
// Wrecking the 3×3
// ===========================================

describe("the hive core as a 3×3 target", () => {
  it("sets the objective's flag when any damage brings the core down", () => {
    const { state, events } = damageSpawner(missionOn(), CORE.id, 60, "u");

    expect(state.spawners[0]?.destroyed).toBe(true);
    expect(state.objectives[0]?.complete).toBe(true);
    expect(events).toContainEqual({
      type: OBJECTIVE_UPDATED,
      payload: { objectiveId: OBJECTIVE.id, complete: true },
    });
  });

  it("takes charges from beside its far face, not only its anchor", () => {
    // (8, 6) is three columns from the anchor but beside the east face.
    const farFace = missionOn(at(8, 6));

    const reach = reachableObjectives(farFace, "u", OBJECTIVE_TUNING);
    expect(reach.map((entry) => [entry.objective.id, entry.distance])).toEqual([
      [OBJECTIVE.id, 1],
    ]);
    const planted = createInteractHandler(OBJECTIVE_TUNING)(
      farFace,
      interact("u", OBJECTIVE.id),
      ctxWith(riggedRng(true)),
    );
    expect(planted.ok && planted.value.state.spawners[0]?.hp).toBe(
      60 - OBJECTIVE_TUNING.chargeDamage,
    );
  });

  it("is an attack target three tiles on a side", () => {
    expect(spawnerAttackTarget(CORE).footprint).toBe(3);
    expect(
      spawnerAttackTarget({ ...CORE, variant: "egg-spawner" }).footprint,
    ).toBeUndefined();
  });

  it("is struck once by a blast that covers several of its tiles", () => {
    const mission = missionOn();
    const index = new TileIndex(mission.map);
    const footprint = [at(5, 5), at(6, 5), at(7, 7)].flatMap(
      (pos, distance) => {
        const tile = index.getAt(pos);
        return tile === undefined ? [] : [{ tile, distance }];
      },
    );
    expect(footprint).toHaveLength(3);
    const victims = blastVictims(mission, footprint, new Set());

    expect(
      victims.map((victim) => [victim.target.id, victim.distance]),
    ).toEqual([[CORE.id, 0]]);
  });

  it("is solid: every one of its tiles is held, and nobody walks through it", () => {
    const mission = missionOn(at(4, 6));
    const graph = buildMoveGraph(mission.map);
    const held = occupiedKeys(mission, graph.index);
    const reach = searchMoves(
      mission,
      mission.units[0] ?? unitAt("x", "infantry", at(0, 0)),
      graph,
    );

    for (let z = 5; z <= 7; z++) {
      for (let x = 5; x <= 7; x++) {
        const key = graph.index.keyOf(at(x, z));
        expect(held.has(key), `(${String(x)}, ${String(z)})`).toBe(true);
        expect(reach.costs.has(key), `(${String(x)}, ${String(z)})`).toBe(
          false,
        );
      }
    }
    // Once it falls, the ground is open again.
    const fallen = missionOn(at(4, 6), { core: { hp: 0, destroyed: true } });
    expect(
      occupiedKeys(fallen, graph.index).has(graph.index.keyOf(at(6, 6))),
    ).toBe(false);
  });

  it("answers a click on any of its tiles once it has been seen", () => {
    const seen = explored(missionOn(), [at(7, 7)]);

    expect(perceivedOccupantAt(seen, "tdf", at(7, 7))).toEqual({
      kind: "spawner",
      spawner: CORE,
    });
    expect(perceivedOccupantAt(seen, "tdf", at(5, 5))?.kind).toBe("spawner");
  });
});

// ===========================================
// Marker
// ===========================================

describe("DESTROY_HIVE_CORE_OBJECTIVE — marker once seen", () => {
  it("marks nothing until a tile of the core has been explored", () => {
    expect(objectiveMarkers(missionOn(), "tdf")).toEqual([]);
    expect(objectiveMarkers(explored(missionOn(), [at(4, 4)]), "tdf")).toEqual(
      [],
    );
  });

  it("marks the core's middle tile once any of it has been seen", () => {
    expect(objectiveMarkers(explored(missionOn(), [at(7, 5)]), "tdf")).toEqual([
      { objectiveId: OBJECTIVE.id, pos: at(6, 6) },
    ]);
  });

  it("marks nothing once the core has fallen", () => {
    const fallen = missionOn(at(0, 0), { core: { hp: 0, destroyed: true } });

    expect(
      DESTROY_HIVE_CORE_OBJECTIVE.marker?.(
        OBJECTIVE,
        explored(fallen, [CORE_POS]),
      ),
    ).toBeUndefined();
  });

  it("always tells an entity controller where the core is", () => {
    expect(
      DESTROY_HIVE_CORE_OBJECTIVE.destination?.(OBJECTIVE, missionOn()),
    ).toEqual({
      position: at(6, 6),
    });
  });
});
