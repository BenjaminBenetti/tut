import { describe, expect, it } from "vitest";

import {
  fieldMap,
  motherMission,
} from "../../../bugs/service/broodmother.test-helper";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import type {
  KillBroodmotherObjective,
  TacticalState,
} from "../../model/tactical-state";
import type { Unit } from "../../model/unit";
import { unitAt } from "../tactical-fixtures.test-helper";
import { KILL_BROODMOTHER_STRATEGY } from "./kill-broodmother-strategy.test-helper";
import { observe } from "./player-view.test-helper";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number): TileCoord => ({ x, y: 0, z });

/** The squad, in the south-west corner, well clear of her. */
const SQUAD: Unit = unitAt("squad-1", "infantry", at(0, 0));

/**
 * A `size`×`size` field with the squad and the Broodmother's 3×3 block
 * anchored at `anchor`, on `hp` when given, and the hunt on her.
 */
function hunt(
  size: number,
  anchor: TileCoord,
  hp?: number,
): {
  mission: TacticalState;
  mother: Unit;
  objective: KillBroodmotherObjective;
} {
  const { mission, mother } = motherMission(
    fieldMap(size, size).build(),
    [SQUAD],
    anchor,
    { phase: "player", ...(hp === undefined ? {} : { hp }) },
  );
  const objective: KillBroodmotherObjective = {
    id: "objective-1",
    kind: "kill-broodmother",
    targetId: mother.id,
    complete: false,
    failed: false,
  };
  return {
    mission: { ...mission, objectives: [objective] },
    mother,
    objective,
  };
}

/** The 3×3 of ground tiles round `middle`, south row first, west to east. */
function square(middle: TileCoord): readonly TileCoord[] {
  const tiles: TileCoord[] = [];
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      tiles.push(at(middle.x + dx, middle.z + dz));
    }
  }
  return tiles;
}

// ===========================================
// Jobs
// ===========================================

describe("the Alpha Hunt strategy (campaign arc §6.8)", () => {
  it("sends everyone after her marker, firing on her first, at the pace that keeps a shot", () => {
    const { mission, mother, objective } = hunt(24, at(10, 10));
    const [job] = KILL_BROODMOTHER_STRATEGY.jobs(objective, observe(mission));
    expect(job).toEqual({
      order: {
        kind: "hunt",
        goals: [mother.pos],
        targetId: mother.id,
        focus: true,
      },
    });
  });

  // Her block covers anchor..anchor+2 on each axis. The post lies off
  // her middle toward the nearest edge, half the gap out, at least
  // 2 and at most 8 tiles past her block.
  it.each([
    {
      case: "halfway to the nearest edge (south, gap 6)",
      size: 24,
      anchor: at(10, 6),
      middle: at(11, 3),
    },
    {
      case: "no nearer her than two tiles (west, gap 3)",
      size: 24,
      anchor: at(3, 10),
      middle: at(1, 11),
    },
    {
      case: "no further out than eight tiles (south, gap 20)",
      size: 48,
      anchor: at(22, 20),
      middle: at(23, 12),
    },
  ])(
    "posts the careful player's squad on her way out: $case",
    ({ size, anchor, middle }) => {
      const { mission, objective } = hunt(size, anchor);
      const jobs = KILL_BROODMOTHER_STRATEGY.jobs(objective, observe(mission));
      expect(jobs.map((job) => job.order.kind)).toEqual(["hunt", "guard"]);
      expect(jobs[1]).toEqual({
        order: { kind: "guard", goals: square(middle), holdRadius: 2 },
        crew: 1,
        who: "squad",
        expertOnly: true,
      });
    },
  );

  it("posts nobody once she stands within two tiles of an edge", () => {
    const { mission, objective } = hunt(24, at(1, 10));
    const jobs = KILL_BROODMOTHER_STRATEGY.jobs(objective, observe(mission));
    expect(jobs.map((job) => job.order.kind)).toEqual(["hunt"]);
  });

  it("has nothing to do once she is off the map", () => {
    const { mission, mother, objective } = hunt(24, at(10, 10));
    const gone: TacticalState = {
      ...mission,
      units: mission.units.filter((unit) => unit.id !== mother.id),
      escaped: [mother],
    };
    expect(KILL_BROODMOTHER_STRATEGY.jobs(objective, observe(gone))).toEqual(
      [],
    );
  });
});

// ===========================================
// Settled
// ===========================================

describe("the Alpha Hunt strategy's end", () => {
  it("is open while she lives on the map", () => {
    const { mission, objective } = hunt(24, at(10, 10));
    expect(KILL_BROODMOTHER_STRATEGY.settled(objective, observe(mission))).toBe(
      false,
    );
  });

  it("is settled the moment she lies dead", () => {
    const { mission, objective } = hunt(24, at(10, 10), 0);
    expect(KILL_BROODMOTHER_STRATEGY.settled(objective, observe(mission))).toBe(
      true,
    );
  });

  it("is settled once she has escaped off an edge", () => {
    const { mission, mother, objective } = hunt(24, at(10, 10));
    const gone: TacticalState = {
      ...mission,
      units: mission.units.filter((unit) => unit.id !== mother.id),
      escaped: [mother],
    };
    expect(KILL_BROODMOTHER_STRATEGY.settled(objective, observe(gone))).toBe(
      true,
    );
  });
});
