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
  MOUTH_ROLE,
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
 * 2 (set turn 3), the charges listed out of mouth order: the lines still
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

  it("names every charge a mouth was set with by the mouth's place, and nothing else", () => {
    const part = (id: string) =>
      SEAL_TUNNELS_PRESENTATION.partName?.(OBJECTIVE, id);
    expect(part("tunnel-2-charge")).toBe("the charge on tunnel 2");
    // A re-set charge, after the bugs pulled the first two.
    expect(part("tunnel-3-charge-3")).toBe("the charge on tunnel 3");
    expect(part("tunnel-4-charge")).toBeUndefined();
    expect(part("tunnel-1")).toBeUndefined();
    expect(part("squad-1")).toBeUndefined();
  });

  it("reads the mouths sealed and every mouth's state by its place, in mouth order", () => {
    const mission = missionOnTurn5();
    expect(liveReading(OBJECTIVE, mission)).toEqual({
      sealed: 1,
      total: 3,
      turn: 5,
      mouths: [
        { ordinal: 1, state: "sealed" },
        { ordinal: 2, state: "burning", detonatesOnTurn: 6 },
        { ordinal: 3, state: "burning", detonatesOnTurn: 8 },
      ],
    });
    // The HUD takes the same reading through the table.
    expect(objectiveProgress(mission).get(OBJECTIVE.id)).toEqual(
      liveReading(OBJECTIVE, mission),
    );
  });

  it("shows the count beside the label and a line per mouth: sealed, then each fuse, the last turn urgent", () => {
    const row = rowFor(OBJECTIVE, liveReading(OBJECTIVE, missionOnTurn5()));
    expect(row).toEqual({
      icon: "interact",
      label: "Tunnels sealed",
      data: { status: "open" },
      layout: "inline",
      complete: false,
      detail: { text: "1 / 3", role: "tunnels-sealed" },
      lines: [
        {
          text: "Tunnel 1 sealed",
          role: MOUTH_ROLE,
          tone: "quiet",
          data: { mouthState: "sealed" },
        },
        {
          text: "Tunnel 2 blows at the end of this turn",
          role: FUSE_ROLE,
          tone: "timer",
          urgent: true,
          data: { mouthState: "burning" },
        },
        {
          text: "Tunnel 3 blows in 3 turns",
          role: FUSE_ROLE,
          tone: "timer",
          urgent: false,
          data: { mouthState: "burning" },
        },
      ],
    });
  });

  it("reads a mouth whose charge a bug pulled as pulled, in the alert tone, and one never charged as open (Ben's rule, 2026-09-28)", () => {
    const burning = missionOnTurn5();
    const pulled: TacticalState = {
      ...burning,
      tunnelMouths: (burning.tunnelMouths ?? []).map((mouth) =>
        mouth.id === "tunnel-2"
          ? { ...mouthAt("tunnel-2", 8, 2), chargesPulled: 1 }
          : mouth.id === "tunnel-3"
            ? mouthAt("tunnel-3", 2, 8)
            : mouth,
      ),
      charges: [],
    };
    const reading = liveReading(OBJECTIVE, pulled);
    expect(reading.mouths.map((mouth) => mouth.state)).toEqual([
      "sealed",
      "pulled",
      "open",
    ]);
    expect(rowFor(OBJECTIVE, reading).lines).toEqual([
      {
        text: "Tunnel 1 sealed",
        role: MOUTH_ROLE,
        tone: "quiet",
        data: { mouthState: "sealed" },
      },
      {
        text: "Tunnel 2 charge pulled",
        role: MOUTH_ROLE,
        tone: "alert",
        data: { mouthState: "pulled" },
      },
      {
        text: "Tunnel 3 open",
        role: MOUTH_ROLE,
        tone: "quiet",
        data: { mouthState: "open" },
      },
    ]);
    // Re-set: a new charge on the pulled mouth burns on a full fuse.
    const reset: TacticalState = {
      ...pulled,
      tunnelMouths: (pulled.tunnelMouths ?? []).map((mouth) =>
        mouth.id === "tunnel-2"
          ? { ...mouth, chargeId: "tunnel-2-charge-2", chargeHitsLeft: 1 }
          : mouth,
      ),
      charges: [
        { ...chargeOn(mouthAt("tunnel-2", 8, 2), 8), id: "tunnel-2-charge-2" },
      ],
    };
    expect(liveReading(OBJECTIVE, reset).mouths[1]).toEqual({
      ordinal: 2,
      state: "burning",
      detonatesOnTurn: 8,
    });
  });

  it("counts a fuse down the three turns it burns, and drops it once it blows", () => {
    const fuseOn = (turn: number): readonly string[] =>
      (
        rowFor(OBJECTIVE, {
          sealed: 0,
          total: 3,
          turn,
          mouths: [{ ordinal: 1, state: "burning", detonatesOnTurn: 7 }],
        }).lines ?? []
      ).map((line) => line.text);
    // Set on turn 4 with a 3-turn fuse: it blows as turn 7 opens.
    expect(fuseOn(4)).toEqual(["Tunnel 1 blows in 3 turns"]);
    expect(fuseOn(5)).toEqual(["Tunnel 1 blows in 2 turns"]);
    expect(fuseOn(6)).toEqual(["Tunnel 1 blows at the end of this turn"]);
    expect(fuseOn(7)).toEqual([]);
  });

  it("ticks the row the moment the last mouth is sealed, and reads a failure as left open", () => {
    const sealedAll = [1, 2, 3].map((ordinal) => ({
      ordinal,
      state: "sealed" as const,
    }));
    const done = rowFor(OBJECTIVE, {
      sealed: 3,
      total: 3,
      turn: 9,
      mouths: sealedAll,
    });
    expect(done.icon).toBe("check");
    expect(done.complete).toBe(true);
    expect(done.detail?.text).toBe("3 / 3");
    expect(done.lines).toBeUndefined();

    const failed = rowFor(
      { ...OBJECTIVE, failed: true },
      {
        sealed: 2,
        total: 3,
        turn: 9,
        mouths: [
          { ordinal: 1, state: "sealed" },
          { ordinal: 2, state: "sealed" },
          { ordinal: 3, state: "burning", detonatesOnTurn: 10 },
        ],
      },
    );
    expect(failed.icon).toBe("warning");
    expect(failed.label).toBe("Tunnels left open");
    expect(failed.complete).toBe(false);
    expect(failed.lines).toBeUndefined();
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
