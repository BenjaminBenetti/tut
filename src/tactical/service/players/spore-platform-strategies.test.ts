import { describe, expect, it } from "vitest";

import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import type {
  BoardCoreObjective,
  DestroyPlatformCoreObjective,
  Spawner,
  TacticalState,
} from "../../model/tactical-state";
import type { Unit } from "../../model/unit";
import {
  missionWith,
  openField,
  unitAt,
  walledField,
} from "../tactical-fixtures.test-helper";
import { lookingMission } from "./player-fixtures.test-helper";
import { observe } from "./player-view.test-helper";
import {
  BOARD_CORE_STRATEGY,
  DESTROY_PLATFORM_CORE_STRATEGY,
} from "./spore-platform-strategies.test-helper";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number): TileCoord => ({ x, y: 0, z });

/** The hatch: four tiles in the far corner of the hull. */
const HATCH = [at(6, 6), at(7, 6), at(6, 7), at(7, 7)];

const BOARD: BoardCoreObjective = {
  id: "objective-1",
  kind: "board-core",
  complete: false,
};

/** The squad crossing the hull, in the near corner. */
const SQUAD: Unit = unitAt("squad-1", "infantry", at(0, 0));

/** The hull, stage 1 of 2, the hatch its extraction, `extracted` aboard. */
function hull(
  extraction: readonly TileCoord[] = HATCH,
  extracted: readonly Unit[] = [],
): TacticalState {
  return {
    ...missionWith(openField().build(), [SQUAD], {
      objectives: [BOARD],
      extracted,
    }),
    extraction,
    stage: { index: 0, count: 2, earlier: [] },
  };
}

/** The core, filling the 3×3 anchored at (3, 3): its middle is (4, 4). */
const CORE: Spawner = {
  id: "spawner-1",
  variant: "platform-core",
  pos: at(3, 3),
  hatchRadius: 3,
  hp: 200,
  timer: 0,
  destroyed: false,
};

const DESTROY: DestroyPlatformCoreObjective = {
  id: "objective-2",
  kind: "destroy-platform-core",
  targetId: CORE.id,
  coreHp: 200,
  complete: false,
};

/** The squad in the chamber, west of the core and in sight of the whole west side. */
const BOARDER: Unit = unitAt("squad-1", "infantry", at(1, 4));

/** The core chamber, stage 2 of 2, on `map`, with `cores` and the objective. */
function chamber(
  cores: readonly Spawner[] = [CORE],
  objective: DestroyPlatformCoreObjective = DESTROY,
  map: TacticalMap = openField().build(),
): TacticalState {
  return {
    ...lookingMission(
      [BOARDER],
      { spawners: cores, objectives: [objective] },
      map,
    ),
    extraction: [],
    endsOnObjectives: true,
    stage: { index: 1, count: 2, earlier: [] },
  };
}

// ===========================================
// The hull
// ===========================================

describe("the hull strategy (campaign arc §6.9)", () => {
  it("sends the whole force to the hatch and through it", () => {
    const jobs = BOARD_CORE_STRATEGY.jobs(BOARD, observe(hull()));
    expect(jobs).toEqual([{ order: { kind: "extract", goals: HATCH } }]);
  });

  it("has nothing to do on a hull with no hatch", () => {
    expect(BOARD_CORE_STRATEGY.jobs(BOARD, observe(hull([])))).toEqual([]);
  });

  it("is open until someone is aboard, and settled after", () => {
    expect(BOARD_CORE_STRATEGY.settled(BOARD, observe(hull()))).toBe(false);
    const aboard = unitAt("squad-2", "infantry", at(7, 7));
    expect(
      BOARD_CORE_STRATEGY.settled(BOARD, observe(hull(HATCH, [aboard]))),
    ).toBe(true);
  });
});

// ===========================================
// The core chamber
// ===========================================

describe("the core chamber strategy (campaign arc §6.9)", () => {
  it("goes at the core's blip at full pace, firing on the core first and planting once beside it", () => {
    const jobs = DESTROY_PLATFORM_CORE_STRATEGY.jobs(
      DESTROY,
      observe(chamber()),
    );
    expect(jobs).toEqual([
      {
        order: {
          kind: "destroy",
          goals: [at(4, 4)],
          interact: DESTROY.id,
          targetId: CORE.id,
          urgent: true,
          focus: true,
        },
      },
    ]);
  });

  it("searches the unexplored ground at full pace when the core has no blip", () => {
    // The squad stands west of the wall: the east side is unexplored,
    // and no core stands anywhere to blip.
    const view = observe(chamber([], DESTROY, walledField()));
    const [job, ...rest] = DESTROY_PLATFORM_CORE_STRATEGY.jobs(DESTROY, view);
    expect(rest).toEqual([]);
    expect(job?.order).toMatchObject({ kind: "explore", urgent: true });
    expect(job?.order.goals.length).toBeGreaterThan(0);
    expect(job?.order.goals.every((tile) => tile.x >= 4)).toBe(true);
  });

  it("is open while the core stands, and settled the moment it falls", () => {
    expect(
      DESTROY_PLATFORM_CORE_STRATEGY.settled(DESTROY, observe(chamber())),
    ).toBe(false);
    // `damageSpawner` flags the objective on the killing blow.
    const done = { ...DESTROY, complete: true };
    const wrecked = chamber([{ ...CORE, hp: 0, destroyed: true }], done);
    expect(DESTROY_PLATFORM_CORE_STRATEGY.settled(done, observe(wrecked))).toBe(
      true,
    );
  });
});
