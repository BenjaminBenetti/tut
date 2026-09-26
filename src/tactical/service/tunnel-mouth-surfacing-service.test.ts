import { describe, expect, it } from "vitest";

import { STOREY_LAYERS } from "../../core/model/elevation";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { TUNNEL_TUNING } from "../data/tunnel-tuning";
import type { BugUnitSource } from "../model/bug-unit-source";
import { BUGS_SPAWNED } from "../model/bugs-spawned-event";
import { endTurn } from "../model/end-turn-command";
import type { TacticalState } from "../model/tactical-state";
import type { TunnelMouth } from "../model/tunnel-mouth";
import { isBurrowed } from "../model/unit";
import { ctxWith, missionWith, unitAt } from "./tactical-fixtures.test-helper";
import {
  createTunnelSurfacingStep,
  surfacesOn,
} from "./tunnel-mouth-surfacing-service";
import { createEndTurnHandler, DEFAULT_PHASE_STEPS } from "./turn-service";

// ===========================================
// Fixtures
// ===========================================

/** A digging species with the burrower's shape; tactical never imports bug data. */
const DIGGER: BugUnitSource = {
  id: "burrower",
  name: "Burrower",
  hp: 14,
  armor: 1,
  move: 5,
  ap: 2,
  weapon: { range: 1, accuracy: 75, damage: 8, armorPen: 1 },
  sightRange: 12,
  modelId: "bug.burrower",
  burrows: true,
};

/** The shipped schedule: the first mouth on turn 2, each every 3 turns, a turn apart. */
const SCHEDULE = {
  firstSurfaceTurn: 2,
  surfaceEvery: 3,
} as const;

const at = (x: number, z: number): TileCoord => ({ x, y: 0, z });

/** A 2 × 2 mouth with its corner, and charge tile, at (x, z). */
function mouthAt(id: string, x: number, z: number): TunnelMouth {
  return {
    id,
    pos: at(x, z),
    tiles: [at(x, z), at(x + 1, z), at(x, z + 1), at(x + 1, z + 1)],
  };
}

/**
 * Three mouths across a 24 × 24 field, far from the squad in the
 * corner, the middle one sealed when asked.
 *
 * ```
 *   m0 (4, 12)      m1 (12, 12)      m2 (20, 12)      squad (0, 0)
 * ```
 */
function missionWithMouths(sealMiddle = false): TacticalState {
  const map = new FixtureMapBuilder(24, 24, 3 * STOREY_LAYERS)
    .fillGround()
    .build();
  const middle = mouthAt("tunnel-2", 12, 12);
  return {
    ...missionWith(map, [unitAt("squad", "infantry", at(0, 0))]),
    tunnelMouths: [
      mouthAt("tunnel-1", 4, 12),
      sealMiddle
        ? { ...middle, chargeId: "tunnel-2-charge", sealedOnTurn: 1 }
        : middle,
      mouthAt("tunnel-3", 20, 12),
    ],
  };
}

/** EndTurn with the default steps and the mouths' surfacing, as the composition orders them. */
const END_TURN = createEndTurnHandler([
  ...DEFAULT_PHASE_STEPS,
  createTunnelSurfacingStep({ species: DIGGER, tuning: SCHEDULE }),
]);

/**
 * Ends phases through `turns` whole turns from turn 1 and returns every
 * tunnel spawn in order, with the turn whose bug phase it came in.
 */
function tunnelSpawns(
  mission: TacticalState,
  turns: number,
): { readonly turn: number; readonly mouth: string }[] {
  const ctx = ctxWith(new Mulberry32Rng(7));
  let state = mission;
  const seen: { turn: number; mouth: string }[] = [];
  for (let phase = 0; phase < turns * 2; phase++) {
    const ended = END_TURN(state, endTurn(), ctx);
    if (!ended.ok) throw new Error(`EndTurn refused: ${ended.error.kind}`);
    state = ended.value.state;
    for (const event of ended.value.events) {
      if (event.type === BUGS_SPAWNED && event.payload.source === "tunnel") {
        seen.push({ turn: state.turn, mouth: event.payload.sourceId });
      }
    }
  }
  return seen;
}

// ===========================================
// Schedule
// ===========================================

describe("surfacesOn (arc §6.7)", () => {
  it("sends each mouth up every third turn, a turn apart, from turn 2", () => {
    const turnsOf = (index: number): number[] =>
      Array.from({ length: 10 }, (_, i) => i + 1).filter((turn) =>
        surfacesOn(turn, index, SCHEDULE),
      );
    expect(turnsOf(0)).toEqual([2, 5, 8]);
    expect(turnsOf(1)).toEqual([3, 6, 9]);
    expect(turnsOf(2)).toEqual([4, 7, 10]);
  });

  it("is the shipped tuning", () => {
    expect(TUNNEL_TUNING.firstSurfaceTurn).toBe(SCHEDULE.firstSurfaceTurn);
    expect(TUNNEL_TUNING.surfaceEvery).toBe(SCHEDULE.surfaceEvery);
  });
});

// ===========================================
// Phase step
// ===========================================

describe("createTunnelSurfacingStep (arc §6.7)", () => {
  it("brings one burrower up an open mouth on its turn, burrowed and spent, and says where from", () => {
    const step = createTunnelSurfacingStep({
      species: DIGGER,
      tuning: SCHEDULE,
    });
    const mission = { ...missionWithMouths(), turn: 2, phase: "bugs" as const };
    const applied = step(mission, ctxWith(new Mulberry32Rng(7)));
    const spawned = applied.state.units.filter((u) => u.team === "bugs");
    expect(spawned).toHaveLength(1);
    const burrower = spawned[0];
    expect(burrower?.pos).toEqual(at(4, 12));
    expect(burrower === undefined ? false : isBurrowed(burrower)).toBe(true);
    expect(burrower?.ap).toBe(0);
    expect(applied.events).toEqual([
      {
        type: BUGS_SPAWNED,
        payload: {
          unitIds: [burrower?.id],
          source: "tunnel",
          sourceId: "tunnel-1",
        },
      },
    ]);
    // Nothing as the player's phase opens, whatever the turn.
    const player = step(
      { ...mission, phase: "player" },
      ctxWith(new Mulberry32Rng(7)),
    );
    expect(player.state.units.filter((u) => u.team === "bugs")).toEqual([]);
    expect(player.events).toEqual([]);
  });

  it("surfaces every open mouth on its schedule through live EndTurns", () => {
    expect(tunnelSpawns(missionWithMouths(), 7)).toEqual([
      { turn: 2, mouth: "tunnel-1" },
      { turn: 3, mouth: "tunnel-2" },
      { turn: 4, mouth: "tunnel-3" },
      { turn: 5, mouth: "tunnel-1" },
      { turn: 6, mouth: "tunnel-2" },
      { turn: 7, mouth: "tunnel-3" },
    ]);
  });

  it("never sends one up a sealed mouth, while the open ones keep theirs", () => {
    const spawns = tunnelSpawns(missionWithMouths(true), 7);
    expect(spawns.map((s) => s.mouth)).not.toContain("tunnel-2");
    expect(spawns).toEqual([
      { turn: 2, mouth: "tunnel-1" },
      { turn: 4, mouth: "tunnel-3" },
      { turn: 5, mouth: "tunnel-1" },
      { turn: 7, mouth: "tunnel-3" },
    ]);
  });

  it("keeps a charged mouth open until the charge goes off", () => {
    const charged = missionWithMouths();
    const mouths = charged.tunnelMouths ?? [];
    const spawns = tunnelSpawns(
      {
        ...charged,
        tunnelMouths: mouths.map((m) =>
          m.id === "tunnel-2" ? { ...m, chargeId: "tunnel-2-charge" } : m,
        ),
      },
      3,
    );
    expect(spawns).toContainEqual({ turn: 3, mouth: "tunnel-2" });
  });
});
