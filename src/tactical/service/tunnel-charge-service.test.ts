import { describe, expect, it } from "vitest";

import type { TileCoord } from "../../mapgen/model/tile-coord";
import { BREACHING_CHARGE } from "../data/equipment";
import type { PlacedCharge } from "../model/equipment";
import type {
  SealTunnelsObjective,
  TacticalState,
} from "../model/tactical-state";
import { TUNNEL_CHARGE_DISARMED } from "../model/tunnel-charge-disarmed-event";
import type { TunnelMouth } from "../model/tunnel-mouth";
import { isCharged, isPulled } from "../model/tunnel-mouth";
import { enemyAttackTargets, findAttackTarget } from "./attack-target-service";
import {
  missionWith,
  openField,
  unitAt,
} from "./tactical-fixtures.test-helper";
import {
  burningTunnelCharges,
  findBurningTunnelCharge,
  strikeTunnelCharge,
  TUNNEL_CHARGE_NAME,
  tunnelChargeAttackTarget,
} from "./tunnel-charge-service";

// ===========================================
// Fixtures
// ===========================================

/** Ground tile (x, z). */
function at(x: number, z: number): TileCoord {
  return { x, y: 0, z };
}

/** A charge set on `tile`. */
function charge(id: string, tile: TileCoord): PlacedCharge {
  return {
    id,
    ownerId: "s",
    equipmentId: BREACHING_CHARGE.id,
    tile,
    detonatesOnTurn: 6,
  };
}

/** A 2 × 2 mouth at (x, z), with whatever else it carries. */
function mouthAt(
  id: string,
  x: number,
  z: number,
  extra: Partial<TunnelMouth> = {},
): TunnelMouth {
  return {
    id,
    pos: at(x, z),
    tiles: [at(x, z), at(x + 1, z), at(x, z + 1), at(x + 1, z + 1)],
    ...extra,
  };
}

const SEAL: SealTunnelsObjective = {
  id: "objective-1",
  kind: "seal-tunnels",
  mouthIds: ["tunnel-1", "tunnel-2", "tunnel-3"],
  complete: false,
};

/**
 * Three mouths: tunnel-1 burning, tunnel-2 sealed, tunnel-3 open; a
 * breaching charge on a wall at (6, 6) besides.
 */
function mission(tunnel1: Partial<TunnelMouth> = {}): TacticalState {
  return {
    ...missionWith(
      openField().build(),
      [
        unitAt("s", "infantry", at(0, 0)),
        unitAt("b", "infantry", at(0, 2), { team: "bugs" }),
      ],
      { objectives: [SEAL], turn: 4 },
    ),
    tunnelMouths: [
      mouthAt("tunnel-1", 1, 5, {
        chargeId: "tunnel-1-charge",
        chargeHitsLeft: 1,
        ...tunnel1,
      }),
      mouthAt("tunnel-2", 5, 5, {
        chargeId: "tunnel-2-charge",
        sealedOnTurn: 3,
      }),
      mouthAt("tunnel-3", 5, 1),
    ],
    charges: [
      charge("wall-charge", at(6, 6)),
      charge("tunnel-1-charge", at(1, 5)),
    ],
  };
}

// ===========================================
// Lookup
// ===========================================

describe("burningTunnelCharges", () => {
  it("lists the charges burning on unsealed mouths, never one on a wall", () => {
    expect(
      burningTunnelCharges(mission()).map((burning) => [
        burning.mouth.id,
        burning.charge.id,
      ]),
    ).toEqual([["tunnel-1", "tunnel-1-charge"]]);
    expect(findBurningTunnelCharge(mission(), "wall-charge")).toBeUndefined();
    expect(
      findBurningTunnelCharge(mission(), "tunnel-2-charge"),
    ).toBeUndefined();
  });

  it("is empty on a mission with no mouths", () => {
    const plain = { ...mission(), tunnelMouths: undefined };
    expect(burningTunnelCharges(plain)).toEqual([]);
  });
});

describe("tunnelChargeAttackTarget", () => {
  it("is the TDF's, on the charge tile, unarmoured, with its hits left as hit points", () => {
    const burning = findBurningTunnelCharge(
      mission({ chargeHitsLeft: 2 }),
      "tunnel-1-charge",
    );
    expect(burning && tunnelChargeAttackTarget(burning)).toEqual({
      kind: "charge",
      id: "tunnel-1-charge",
      name: TUNNEL_CHARGE_NAME,
      pos: at(1, 5),
      hp: 2,
      armor: 0,
      team: "tdf",
    });
  });

  it("reads a charge set before the rule as one hit from pulled", () => {
    const burning = findBurningTunnelCharge(
      mission({ chargeHitsLeft: undefined }),
      "tunnel-1-charge",
    );
    expect(burning && tunnelChargeAttackTarget(burning).hp).toBe(1);
  });

  it("is what the targeting port resolves the charge id to, and what a bug may aim at", () => {
    expect(findAttackTarget(mission(), "tunnel-1-charge")).toMatchObject({
      kind: "charge",
      team: "tdf",
    });
    expect(findAttackTarget(mission(), "wall-charge")).toBeUndefined();
    expect(enemyAttackTargets(mission(), "bugs").map((t) => t.id)).toEqual([
      "s",
      "tunnel-1-charge",
    ]);
    expect(enemyAttackTargets(mission(), "tdf").map((t) => t.id)).toEqual([
      "b",
    ]);
  });
});

// ===========================================
// Strike
// ===========================================

describe("strikeTunnelCharge", () => {
  it("pulls the charge on its last hit: gone unexploded, the mouth open and counted, the event logged", () => {
    const before = mission();
    const pulled = strikeTunnelCharge(before, "tunnel-1-charge", "b");
    expect(pulled.state.charges.map((c) => c.id)).toEqual(["wall-charge"]);
    const mouth = pulled.state.tunnelMouths?.[0];
    expect(mouth).toEqual(mouthAt("tunnel-1", 1, 5, { chargesPulled: 1 }));
    expect(mouth && isCharged(mouth)).toBe(false);
    expect(mouth && isPulled(mouth)).toBe(true);
    expect(pulled.events).toEqual([
      {
        type: TUNNEL_CHARGE_DISARMED,
        payload: {
          unitId: "b",
          mouthId: "tunnel-1",
          objectiveId: SEAL.id,
          chargeId: "tunnel-1-charge",
          pulled: 1,
        },
      },
    ]);
    // The input is untouched.
    expect(before).toEqual(mission());
  });

  it("counts every pull on the mouth", () => {
    const again = strikeTunnelCharge(
      mission({ chargesPulled: 2 }),
      "tunnel-1-charge",
      "b",
    );
    expect(again.state.tunnelMouths?.[0]?.chargesPulled).toBe(3);
    expect(again.events[0]?.payload).toMatchObject({ pulled: 3 });
  });

  it("takes one hit off a charge with more left and leaves it burning", () => {
    const struck = strikeTunnelCharge(
      mission({ chargeHitsLeft: 3 }),
      "tunnel-1-charge",
      "b",
    );
    expect(struck.events).toEqual([]);
    expect(struck.state.charges).toHaveLength(2);
    expect(struck.state.tunnelMouths?.[0]).toMatchObject({
      chargeId: "tunnel-1-charge",
      chargeHitsLeft: 2,
    });
  });

  it("leaves the mission itself for a charge not burning on a mouth", () => {
    const m = mission();
    expect(strikeTunnelCharge(m, "wall-charge", "b").state).toBe(m);
    expect(strikeTunnelCharge(m, "nothing", "b")).toEqual({
      state: m,
      events: [],
    });
  });
});
