import { describe, expect, it } from "vitest";

import type { PlacedCharge } from "../../../tactical/model/equipment";
import type {
  SealTunnelsObjective,
  TacticalState,
} from "../../../tactical/model/tactical-state";
import type { TunnelMouth } from "../../../tactical/model/tunnel-mouth";
import {
  missionWith,
  openField,
  unitAt,
} from "../../../tactical/service/tactical-fixtures.test-helper";
import type { ObjectiveRow } from "../../model/objective-presentation";
import {
  OBJECTIVE_PRESENTATION,
  objectiveProgress,
} from "./objective-presentation";
import type { SealTunnelsReading } from "./seal-tunnels-presentation";
import {
  FUSE_ROLE,
  SEAL_TUNNELS_PRESENTATION,
  liveReading,
} from "./seal-tunnels-presentation";

// ===========================================
// Fixtures
// ===========================================

/** A mouth over the 2 × 2 at (x, z), its charge tile the corner. */
function mouthAt(id: string, x: number, z: number): TunnelMouth {
  return {
    id,
    pos: { x, y: 0, z },
    tiles: [z, z + 1].flatMap((tz) =>
      [x, x + 1].map((tx) => ({ x: tx, y: 0, z: tz })),
    ),
  };
}

const OBJECTIVE: SealTunnelsObjective = {
  id: "objective-1",
  kind: "seal-tunnels",
  mouthIds: ["tunnel-1", "tunnel-2", "tunnel-3"],
  complete: false,
};

/** A charge on `mouth`, blowing as `detonatesOnTurn` opens. */
function chargeOn(mouth: TunnelMouth, detonatesOnTurn: number): PlacedCharge {
  return {
    id: `${mouth.id}-charge`,
    ownerId: "squad-1",
    equipmentId: "breaching-charge",
    tile: mouth.pos,
    detonatesOnTurn,
  };
}

/**
 * Turn 5: mouth 1 sealed, charges burning on mouths 3 (set turn 5) and
 * 2 (set turn 3), the charges listed out of mouth order: the fuses still
 * read in mouth order.
 */
function missionOnTurn5(): TacticalState {
  const one = {
    ...mouthAt("tunnel-1", 2, 2),
    chargeId: "tunnel-1-charge",
    sealedOnTurn: 4,
  };
  const two = { ...mouthAt("tunnel-2", 8, 2), chargeId: "tunnel-2-charge" };
  const three = { ...mouthAt("tunnel-3", 2, 8), chargeId: "tunnel-3-charge" };
  return {
    ...missionWith(openField().build(), [
      unitAt("squad-1", "infantry", { x: 0, y: 0, z: 0 }),
    ]),
    turn: 5,
    tunnelMouths: [one, two, three],
    charges: [chargeOn(three, 8), chargeOn(two, 6)],
    objectives: [OBJECTIVE],
  };
}

/** The row for `objective` with `progress` as its reading. */
function rowFor(
  objective: SealTunnelsObjective,
  progress: SealTunnelsReading | undefined,
): ObjectiveRow {
  return SEAL_TUNNELS_PRESENTATION.row(objective, {
    ordinal: 1,
    spawners: [],
    progress,
  });
}

// ===========================================
// Tests
// ===========================================

describe("SEAL_TUNNELS_PRESENTATION (arc §6.7)", () => {
  it("is the shipped table's entry, and names the mouths for the log", () => {
    expect(OBJECTIVE_PRESENTATION["seal-tunnels"]).toBe(
      SEAL_TUNNELS_PRESENTATION,
    );
    expect(SEAL_TUNNELS_PRESENTATION.name(OBJECTIVE, 1)).toBe(
      "the tunnel mouths",
    );
  });

  it("reads the mouths sealed and each burning charge by its mouth, in mouth order", () => {
    const mission = missionOnTurn5();
    expect(liveReading(OBJECTIVE, mission)).toEqual({
      sealed: 1,
      total: 3,
      turn: 5,
      fuses: [
        { ordinal: 2, detonatesOnTurn: 6 },
        { ordinal: 3, detonatesOnTurn: 8 },
      ],
    });
    // The HUD takes the same reading through the table.
    expect(objectiveProgress(mission).get(OBJECTIVE.id)).toEqual(
      liveReading(OBJECTIVE, mission),
    );
  });

  it("shows the count beside the label and a fuse line per charge, the last turn urgent", () => {
    const row = rowFor(OBJECTIVE, liveReading(OBJECTIVE, missionOnTurn5()));
    expect(row).toEqual({
      icon: "interact",
      label: "Tunnels sealed",
      data: { status: "open" },
      layout: "inline",
      complete: false,
      detail: { text: "1 / 3", role: "tunnels-sealed" },
      countdowns: [
        {
          text: "Tunnel 2 blows at the end of this turn",
          turnsLeft: 1,
          urgent: true,
          role: FUSE_ROLE,
        },
        {
          text: "Tunnel 3 blows in 3 turns",
          turnsLeft: 3,
          urgent: false,
          role: FUSE_ROLE,
        },
      ],
    });
  });

  it("counts a fuse down the three turns it burns, and drops it once it blows", () => {
    const fuseOn = (turn: number): readonly string[] =>
      (
        rowFor(OBJECTIVE, {
          sealed: 0,
          total: 3,
          turn,
          fuses: [{ ordinal: 1, detonatesOnTurn: 7 }],
        }).countdowns ?? []
      ).map((line) => line.text);
    // Set on turn 4 with a 3-turn fuse: it blows as turn 7 opens.
    expect(fuseOn(4)).toEqual(["Tunnel 1 blows in 3 turns"]);
    expect(fuseOn(5)).toEqual(["Tunnel 1 blows in 2 turns"]);
    expect(fuseOn(6)).toEqual(["Tunnel 1 blows at the end of this turn"]);
    expect(fuseOn(7)).toEqual([]);
  });

  it("ticks the row the moment the last mouth is sealed, and reads a failure as left open", () => {
    const done = rowFor(OBJECTIVE, {
      sealed: 3,
      total: 3,
      turn: 9,
      fuses: [],
    });
    expect(done.icon).toBe("check");
    expect(done.complete).toBe(true);
    expect(done.detail?.text).toBe("3 / 3");
    expect(done.countdowns).toBeUndefined();

    const failed = rowFor(
      { ...OBJECTIVE, failed: true },
      {
        sealed: 2,
        total: 3,
        turn: 9,
        fuses: [{ ordinal: 3, detonatesOnTurn: 10 }],
      },
    );
    expect(failed.icon).toBe("warning");
    expect(failed.label).toBe("Tunnels left open");
    expect(failed.complete).toBe(false);
    expect(failed.countdowns).toBeUndefined();
  });

  it("falls back to the objective's own flag without a reading", () => {
    expect(rowFor(OBJECTIVE, undefined)).toEqual({
      icon: "interact",
      label: "Tunnels sealed",
      data: { status: "open" },
      layout: "inline",
      complete: false,
    });
    expect(rowFor({ ...OBJECTIVE, complete: true }, undefined).icon).toBe(
      "check",
    );
  });
});
