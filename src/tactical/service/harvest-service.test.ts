import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { OBJECTIVE_TUNING } from "../data/objective-tuning";
import { CARCASS_HARVESTED } from "../model/carcass-harvested-event";
import { harvestCarcass } from "../model/harvest-carcass-command";
import type { MissionCampaignState } from "../model/mission-campaign-state";
import type { TacticalState } from "../model/tactical-state";
import type { TechCarcass } from "../model/tech-carcass";
import {
  createHarvestHandler,
  reachableCarcasses,
  validateHarvest,
} from "./harvest-service";
import { liftTacticalHandler } from "./tactical-command-handlers";
import {
  ctxWith,
  missionWith,
  openField,
  riggedRng,
  unitAt,
} from "./tactical-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

const TUNING = OBJECTIVE_TUNING;
const CTX = ctxWith(riggedRng(true));
const MAP = openField().build();

function at(x: number, z: number): TileCoord {
  return { x, y: 0, z };
}

function carcass(
  id: string,
  pos: TileCoord,
  overrides: Partial<TechCarcass> = {},
): TechCarcass {
  return { id, pos, techPoints: 12, harvested: false, ...overrides };
}

/** A mission with one carcass at (4, 4) and a squad standing beside it. */
function besideCarcass(
  options: {
    readonly ap?: number;
    readonly hp?: number;
    readonly harvested?: boolean;
    readonly unitPos?: TileCoord;
    readonly kind?: "infantry" | "mech";
    readonly team?: "tdf" | "bugs";
    readonly phase?: TacticalState["phase"];
  } = {},
): TacticalState {
  return missionWith(
    MAP,
    [
      unitAt("u", options.kind ?? "infantry", options.unitPos ?? at(3, 4), {
        ap: options.ap ?? 2,
        hp: options.hp ?? 10,
        team: options.team ?? "tdf",
      }),
    ],
    {
      carcasses: [
        carcass("carcass-1", at(4, 4), {
          harvested: options.harvested ?? false,
        }),
      ],
      phase: options.phase ?? "player",
    },
  );
}

// ===========================================
// HarvestCarcass
// ===========================================

describe("createHarvestHandler", () => {
  const handler = createHarvestHandler(TUNING);

  it("strips the carcass: one action off the squad, the carcass marked, its points announced", () => {
    const applied = handler(
      besideCarcass(),
      harvestCarcass("u", "carcass-1"),
      CTX,
    );
    if (!applied.ok) throw new Error(`refused: ${applied.error.kind}`);
    const { state, events } = applied.value;
    expect(state.units[0]?.ap).toBe(2 - TUNING.interactApCost);
    expect(state.carcasses[0]?.harvested).toBe(true);
    expect(state.outcome).toBeUndefined();
    expect(events).toEqual([
      {
        type: CARCASS_HARVESTED,
        payload: { unitId: "u", carcassId: "carcass-1", techPoints: 12 },
      },
    ]);
  });

  it("works from the carcass's own tile too", () => {
    const applied = handler(
      besideCarcass({ unitPos: at(4, 4) }),
      harvestCarcass("u", "carcass-1"),
      CTX,
    );
    expect(applied.ok).toBe(true);
  });

  it("never mutates the mission it was given", () => {
    const before = besideCarcass();
    const snapshot = JSON.stringify(before);
    handler(before, harvestCarcass("u", "carcass-1"), CTX);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("refuses each precondition with its own kind, spending nothing", () => {
    const cases: readonly [TacticalState, string, string][] = [
      [besideCarcass(), "ghost", "unit-not-on-map"],
      [besideCarcass({ hp: 0 }), "u", "unit-dead"],
      [besideCarcass({ kind: "mech" }), "u", "not-a-squad"],
      [besideCarcass({ team: "bugs", phase: "bugs" }), "u", "not-a-squad"],
      [besideCarcass({ phase: "bugs" }), "u", "wrong-phase"],
      [besideCarcass({ ap: 0 }), "u", "no-action-points"],
      [besideCarcass({ harvested: true }), "u", "carcass-already-harvested"],
      [besideCarcass({ unitPos: at(1, 1) }), "u", "carcass-out-of-reach"],
    ];
    for (const [mission, unitId, kind] of cases) {
      const applied = handler(
        mission,
        harvestCarcass(unitId, "carcass-1"),
        CTX,
      );
      expect(applied.ok, kind).toBe(false);
      if (applied.ok) continue;
      expect(applied.error.kind, kind).toBe(kind);
    }
    const unknown = handler(
      besideCarcass(),
      harvestCarcass("u", "carcass-9"),
      CTX,
    );
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.error).toEqual({
        kind: "unknown-carcass",
        carcassId: "carcass-9",
      });
    }
    const far = handler(
      besideCarcass({ unitPos: at(1, 1) }),
      harvestCarcass("u", "carcass-1"),
      CTX,
    );
    if (!far.ok) {
      expect(far.error).toEqual({
        kind: "carcass-out-of-reach",
        carcassId: "carcass-1",
        distance: 6,
        range: TUNING.interactRange,
      });
    }
  });

  it("lands in the mission log through the campaign lift, where the resolver reads it", () => {
    // Only `activeMission` is read on this path; the rest of the campaign
    // is not consulted, so a stub stands in for it.
    const state = {
      activeMission: besideCarcass(),
    } as unknown as MissionCampaignState;
    const lifted = liftTacticalHandler<
      MissionCampaignState,
      "tactical:harvest-carcass"
    >(handler);
    const applied = lifted(state, harvestCarcass("u", "carcass-1"), {
      rng: new Mulberry32Rng(1),
      ids: new SequentialIdGenerator(),
    });
    if (!applied.ok) throw new Error(`refused: ${applied.error.code}`);
    expect(applied.value.state.activeMission?.log).toContainEqual({
      type: CARCASS_HARVESTED,
      payload: { unitId: "u", carcassId: "carcass-1", techPoints: 12 },
    });
  });
});

// ===========================================
// Reach
// ===========================================

describe("reachableCarcasses", () => {
  it("lists what the handler would accept, nearest first, and nothing for a unit that cannot act", () => {
    const mission = missionWith(
      MAP,
      [unitAt("u", "infantry", at(3, 4)), unitAt("m", "mech", at(3, 5))],
      {
        carcasses: [
          carcass("far", at(7, 7)),
          carcass("stripped", at(3, 5), { harvested: true }),
          carcass("near", at(4, 4)),
          carcass("here", at(3, 4)),
        ],
      },
    );
    expect(
      reachableCarcasses(mission, "u", TUNING).map((r) => r.carcass.id),
    ).toEqual(["here", "near"]);
    for (const { carcass: found } of reachableCarcasses(mission, "u", TUNING)) {
      expect(validateHarvest(mission, "u", found.id, TUNING).ok).toBe(true);
    }
    expect(reachableCarcasses(mission, "m", TUNING)).toEqual([]);
    expect(reachableCarcasses(mission, "ghost", TUNING)).toEqual([]);
  });
});
