import { describe, expect, it } from "vitest";

import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { COMBAT_TUNING } from "../../data/combat-tuning";
import { BREACHING_CHARGE, EQUIPMENT } from "../../data/equipment";
import { OBJECTIVE_TUNING } from "../../data/objective-tuning";
import { RADAR_TUNING } from "../../data/radar-tuning";
import { TUNNEL_TUNING } from "../../data/tunnel-tuning";
import { TURRET_TUNING } from "../../data/turret-tuning";
import { CHARGE_DETONATED } from "../../model/charge-detonated-event";
import { endTurn } from "../../model/end-turn-command";
import { interact } from "../../model/interact-command";
import type { TacticalOutcome } from "../../model/tactical-handler";
import type {
  SealTunnelsObjective,
  TacticalState,
} from "../../model/tactical-state";
import { TUNNEL_CHARGE_SET } from "../../model/tunnel-charge-set-event";
import type { TunnelMouth } from "../../model/tunnel-mouth";
import { TUNNEL_SEALED } from "../../model/tunnel-sealed-event";
import type { Unit } from "../../model/unit";
import { createEquipmentCatalogue } from "../../repository/equipment-catalogue";
import type { EquipmentDeps } from "../equipment-service";
import { createDetonateStep } from "../equipment-service";
import {
  createInteractHandler,
  DEFAULT_OBJECTIVE_INTERACTIONS,
  reachableObjectives,
} from "../objective-service";
import {
  ctxWith,
  fixtureAttackDeps,
  missionWith,
  openField,
  riggedRng,
  unitAt,
} from "../tactical-fixtures.test-helper";
import { createEndTurnHandler, DEFAULT_PHASE_STEPS } from "../turn-service";
import { OBJECTIVE_RULES } from "./objective-rules";
import {
  objectiveComplete,
  objectiveFailed,
  objectiveResultFields,
  objectiveResults,
} from "./objective-status";
import {
  createSealTunnelsObjective,
  createSetTunnelCharge,
  sealBlownMouths,
  sealProgress,
  tunnelChargeId,
} from "./seal-tunnels-objective";

// ===========================================
// Fixtures
// ===========================================

/** The arc's fuse, written out: a tuning change to it must fail here. */
const TUNING = {
  fuseTurns: 3,
  chargeEquipmentId: BREACHING_CHARGE.id,
} as const;

const RULES = createSealTunnelsObjective(TUNING);
const CTX = ctxWith(riggedRng(true));
const MAP = openField().build();
const interactWith = createInteractHandler(OBJECTIVE_TUNING, {
  ...DEFAULT_OBJECTIVE_INTERACTIONS,
  "seal-tunnels": createSetTunnelCharge(TUNING),
});

/** The shipped catalogue and tunings, as the detonate step reads them. */
const DEPS: EquipmentDeps = {
  catalogue: createEquipmentCatalogue(EQUIPMENT),
  combat: COMBAT_TUNING,
  attack: fixtureAttackDeps(),
  radar: RADAR_TUNING,
  turret: TURRET_TUNING,
};

/** EndTurn as the composition orders it: the charges go off, then the mouths cave in. */
const END_TURN = createEndTurnHandler([
  ...DEFAULT_PHASE_STEPS,
  createDetonateStep(DEPS),
  sealBlownMouths,
]);

/** Ground tile (x, z). */
function at(x: number, z: number): TileCoord {
  return { x, y: 0, z };
}

/** A 2 × 2 mouth with its corner, and charge tile, at (x, z). */
function mouthAt(id: string, x: number, z: number): TunnelMouth {
  return {
    id,
    pos: at(x, z),
    tiles: [at(x, z), at(x + 1, z), at(x, z + 1), at(x + 1, z + 1)],
  };
}

/**
 * Three mouths on the 8 × 8 field, the squad beside the first.
 *
 * ```
 *   z 6  . 1 1 . . 2 2 .
 *   z 5  s 1 1 . . 2 2 .     s squad at (0, 5): one tile off (1, 5)
 *   z 2  . . . . . 3 3 .
 *   z 1  . . . . . 3 3 .
 *        0 1 2 3 4 5 6 7
 * ```
 */
const MOUTHS: readonly TunnelMouth[] = [
  mouthAt("tunnel-1", 1, 5),
  mouthAt("tunnel-2", 5, 5),
  mouthAt("tunnel-3", 5, 1),
];

const OBJECTIVE: SealTunnelsObjective = {
  id: "objective-1",
  kind: "seal-tunnels",
  mouthIds: MOUTHS.map((mouth) => mouth.id),
  complete: false,
};

/** The fixture mission: the mouths, the objective, and `units`. */
function mission(
  units: readonly Unit[] = [unitAt("s", "infantry", at(0, 5))],
  mouths: readonly TunnelMouth[] = MOUTHS,
): TacticalState {
  return {
    ...missionWith(MAP, units, { objectives: [OBJECTIVE] }),
    tunnelMouths: mouths,
  };
}

/** The fixture's mouths with `ids` sealed, as a blast leaves them. */
function sealed(...ids: string[]): readonly TunnelMouth[] {
  return MOUTHS.map((mouth) =>
    ids.includes(mouth.id)
      ? { ...mouth, chargeId: tunnelChargeId(mouth), sealedOnTurn: 1 }
      : mouth,
  );
}

/** The value of an accepted command, failing the test on a refusal. */
function accepted(outcome: TacticalOutcome): {
  readonly state: TacticalState;
  readonly events: readonly { readonly type: string }[];
} {
  if (!outcome.ok) {
    throw new Error(`refused: ${outcome.error.kind}`);
  }
  return outcome.value;
}

/** The refusal's kind, failing the test when the command was accepted. */
function refusal(outcome: TacticalOutcome): string {
  if (outcome.ok) {
    throw new Error("accepted");
  }
  return outcome.error.kind;
}

// ===========================================
// The table
// ===========================================

describe("seal-tunnels in the tables (arc §6.7)", () => {
  it("is the rule for seal-tunnels, on the shipped 3-turn fuse and the breaching charge", () => {
    expect(OBJECTIVE_RULES["seal-tunnels"].kind).toBe("seal-tunnels");
    expect(OBJECTIVE_RULES["seal-tunnels"].phaseStep).toBe(sealBlownMouths);
    expect(TUNNEL_TUNING.fuseTurns).toBe(3);
    expect(TUNNEL_TUNING.chargeEquipmentId).toBe(BREACHING_CHARGE.id);
  });
});

// ===========================================
// Setting a charge
// ===========================================

describe("createSetTunnelCharge through Interact", () => {
  it("sets the mission's charge on the nearest mouth: a 3-turn fuse, the mouth charged, the unit's 1 AP spent and no kit used", () => {
    const start = { ...mission(), turn: 4 };
    const set = accepted(interactWith(start, interact("s", OBJECTIVE.id), CTX));
    expect(set.state.charges).toEqual([
      {
        id: "tunnel-1-charge",
        ownerId: "s",
        equipmentId: BREACHING_CHARGE.id,
        tile: at(1, 5),
        detonatesOnTurn: 7,
      },
    ]);
    expect(set.state.tunnelMouths?.map((m) => m.chargeId)).toEqual([
      "tunnel-1-charge",
      undefined,
      undefined,
    ]);
    expect(set.events).toEqual([
      {
        type: TUNNEL_CHARGE_SET,
        payload: {
          unitId: "s",
          mouthId: "tunnel-1",
          objectiveId: OBJECTIVE.id,
          chargeId: "tunnel-1-charge",
          detonatesOnTurn: 7,
        },
      },
    ]);
    const squad = set.state.units.find((u) => u.id === "s");
    expect(squad?.ap).toBe(2 - OBJECTIVE_TUNING.interactApCost);
    // The mission's charge, not the unit's: nothing is used up.
    expect(squad?.equipment).toBeUndefined();
    // Open until the blast: charging completes nothing.
    expect(objectiveComplete(set.state, OBJECTIVE)).toBe(false);
  });

  it("lets a mech set one too, from beside any tile of the mouth", () => {
    const mech = unitAt("m", "mech", at(3, 6));
    const set = accepted(
      interactWith(mission([mech]), interact("m", OBJECTIVE.id), CTX),
    );
    expect(set.state.charges.map((c) => c.id)).toEqual(["tunnel-1-charge"]);
  });

  it("charges the next open mouth once the nearest burns, and refuses when every open mouth has one", () => {
    const squad = unitAt("s", "infantry", at(4, 5));
    // (4, 5): one tile off tunnel-2's (5, 5), two off tunnel-1's (2, 5).
    const first = accepted(
      interactWith(mission([squad]), interact("s", OBJECTIVE.id), CTX),
    );
    expect(first.state.charges.map((c) => c.id)).toEqual(["tunnel-2-charge"]);
    // With tunnel-2 burning, the nearest chargeable mouth is out of reach.
    const again = { ...first.state, units: [{ ...squad, ap: 2 }] };
    expect(refusal(interactWith(again, interact("s", OBJECTIVE.id), CTX))).toBe(
      "objective-out-of-reach",
    );
    // Every open mouth charged, or sealed: nothing left to set.
    const allSet = mission(
      [squad],
      MOUTHS.map((m) => ({ ...m, chargeId: tunnelChargeId(m) })),
    );
    expect(
      refusal(interactWith(allSet, interact("s", OBJECTIVE.id), CTX)),
    ).toBe("tunnels-charged");
    const doneOrBurning = mission(
      [squad],
      sealed("tunnel-1", "tunnel-3").map((m) =>
        m.id === "tunnel-2" ? { ...m, chargeId: tunnelChargeId(m) } : m,
      ),
    );
    expect(
      refusal(interactWith(doneOrBurning, interact("s", OBJECTIVE.id), CTX)),
    ).toBe("tunnels-charged");
  });

  it("refuses a unit out of reach, a turret, a missing mouth and another kind, spending nothing", () => {
    const far = mission([unitAt("s", "infantry", at(3, 3))]);
    expect(refusal(interactWith(far, interact("s", OBJECTIVE.id), CTX))).toBe(
      "objective-out-of-reach",
    );
    const setCharge = createSetTunnelCharge(TUNING);
    const squad = unitAt("s", "infantry", at(0, 5));
    const turret: Unit = { ...squad, id: "t", kind: "turret" };
    expect(
      setCharge(mission([turret]), OBJECTIVE, turret, OBJECTIVE_TUNING),
    ).toMatchObject({ ok: false, error: { kind: "cannot-interact" } });
    expect(
      setCharge(mission([squad], []), OBJECTIVE, squad, OBJECTIVE_TUNING),
    ).toMatchObject({
      ok: false,
      error: { kind: "objective-target-missing", targetId: "tunnel-1" },
    });
    expect(
      setCharge(
        mission([squad]),
        {
          id: "objective-2",
          kind: "destroy-spawner",
          targetId: "x",
          complete: false,
        },
        squad,
        OBJECTIVE_TUNING,
      ),
    ).toMatchObject({
      ok: false,
      error: { kind: "objective-not-interactive" },
    });
  });
});

// ===========================================
// The fuse
// ===========================================

describe("the fuse through live EndTurns (arc §6.7)", () => {
  it("seals the mouth exactly 3 turns after the charge is set, as that player phase opens", () => {
    const set = accepted(
      interactWith(mission(), interact("s", OBJECTIVE.id), CTX),
    );
    const setOn = set.state.turn;
    // The squad walks well clear of the blast before ending the turn.
    let state: TacticalState = {
      ...set.state,
      units: set.state.units.map((u) => ({ ...u, pos: at(7, 0) })),
    };
    const ctx = ctxWith(riggedRng(true));
    const sealedOn: number[] = [];
    const blasts: number[] = [];
    while (state.turn < setOn + 5) {
      const ended = accepted(END_TURN(state, endTurn(), ctx));
      state = ended.state;
      if (ended.events.some((e) => e.type === CHARGE_DETONATED)) {
        blasts.push(state.turn);
      }
      if (ended.events.some((e) => e.type === TUNNEL_SEALED)) {
        sealedOn.push(state.turn);
      }
      if (state.phase === "player" && state.turn < setOn + 3) {
        expect(state.tunnelMouths?.[0]?.sealedOnTurn).toBeUndefined();
      }
    }
    expect(blasts).toEqual([setOn + 3]);
    expect(sealedOn).toEqual([setOn + 3]);
    expect(state.tunnelMouths?.[0]).toMatchObject({
      chargeId: "tunnel-1-charge",
      sealedOnTurn: setOn + 3,
    });
    expect(state.charges).toEqual([]);
  });
});

// ===========================================
// The phase step
// ===========================================

describe("sealBlownMouths", () => {
  it("caves in a charged mouth whose charge has gone, says so with the running count, and leaves the rest", () => {
    const blowing: TacticalState = {
      // Listed out of the objective's order: the count follows the objective.
      ...mission(undefined, [
        { ...mouthAt("tunnel-3", 5, 1), chargeId: "x", sealedOnTurn: 1 },
        { ...mouthAt("tunnel-1", 1, 5), chargeId: "tunnel-1-charge" },
        { ...mouthAt("tunnel-2", 5, 5), chargeId: "tunnel-2-charge" },
      ]),
      turn: 6,
      charges: [
        {
          id: "tunnel-2-charge",
          ownerId: "s",
          equipmentId: BREACHING_CHARGE.id,
          tile: at(5, 5),
          detonatesOnTurn: 8,
        },
      ],
    };
    const applied = sealBlownMouths(blowing, CTX);
    const byId = new Map(applied.state.tunnelMouths?.map((m) => [m.id, m]));
    expect(byId.get("tunnel-1")?.sealedOnTurn).toBe(6);
    expect(byId.get("tunnel-2")?.sealedOnTurn).toBeUndefined();
    expect(byId.get("tunnel-3")?.sealedOnTurn).toBe(1);
    expect(applied.events).toEqual([
      {
        type: TUNNEL_SEALED,
        payload: {
          mouthId: "tunnel-1",
          objectiveId: OBJECTIVE.id,
          chargeId: "tunnel-1-charge",
          sealed: 2,
          total: 3,
        },
      },
    ]);
  });

  it("returns the mission itself when nothing is charged", () => {
    const quiet = mission(undefined, sealed("tunnel-1"));
    expect(sealBlownMouths(quiet, CTX)).toEqual({ state: quiet, events: [] });
    expect(sealBlownMouths(quiet, CTX).state).toBe(quiet);
  });
});

// ===========================================
// Status, reach, markers, result
// ===========================================

describe("createSealTunnelsObjective", () => {
  it("is complete only with every named mouth sealed, read live", () => {
    expect(RULES.complete(OBJECTIVE, mission())).toBe(false);
    expect(
      RULES.complete(
        OBJECTIVE,
        mission(undefined, sealed("tunnel-1", "tunnel-2")),
      ),
    ).toBe(false);
    const done = mission(undefined, sealed("tunnel-1", "tunnel-2", "tunnel-3"));
    expect(RULES.complete(OBJECTIVE, done)).toBe(true);
    expect(objectiveComplete(done, OBJECTIVE)).toBe(true);
    // A name with no mouth behind it can never be sealed.
    expect(
      RULES.complete(
        { ...OBJECTIVE, mouthIds: [...OBJECTIVE.mouthIds, "tunnel-9"] },
        done,
      ),
    ).toBe(false);
    expect(RULES.complete({ ...OBJECTIVE, mouthIds: [] }, done)).toBe(false);
  });

  it("fails with the mission lost or nobody left standing, unless already sealed", () => {
    const squad = unitAt("s", "infantry", at(0, 5));
    expect(RULES.failed?.(OBJECTIVE, mission([squad]))).toBe(false);
    expect(RULES.failed?.(OBJECTIVE, mission([{ ...squad, hp: 0 }]))).toBe(
      true,
    );
    expect(RULES.failed?.(OBJECTIVE, mission([]))).toBe(true);
    expect(
      RULES.failed?.(OBJECTIVE, { ...mission([squad]), outcome: "lost" }),
    ).toBe(true);
    const done = mission([], sealed("tunnel-1", "tunnel-2", "tunnel-3"));
    expect(RULES.failed?.(OBJECTIVE, done)).toBe(false);
    expect(objectiveFailed(mission([]), OBJECTIVE)).toBe(true);
  });

  it("reaches the nearest open, uncharged mouth at its nearest tile, for a squad or mech only", () => {
    const squad = unitAt("s", "infantry", at(3, 6));
    expect(RULES.reachable?.(OBJECTIVE, mission([squad]), squad)).toEqual({
      id: "tunnel-1",
      pos: at(2, 6),
    });
    const charged = mission(
      [squad],
      MOUTHS.map((m) =>
        m.id === "tunnel-1" ? { ...m, chargeId: tunnelChargeId(m) } : m,
      ),
    );
    expect(RULES.reachable?.(OBJECTIVE, charged, squad)).toEqual({
      id: "tunnel-2",
      pos: at(5, 6),
    });
    const turret: Unit = { ...squad, kind: "turret" };
    expect(
      RULES.reachable?.(OBJECTIVE, mission([turret]), turret),
    ).toBeUndefined();
    // With nobody asking, the first chargeable mouth at its own tile.
    expect(RULES.reachable?.(OBJECTIVE, charged, undefined)).toEqual({
      id: "tunnel-2",
      pos: at(5, 5),
    });
    // The wheel offers it only from within reach.
    expect(
      reachableObjectives(mission([squad]), "s", OBJECTIVE_TUNING).map(
        (r) => r.objective.id,
      ),
    ).toEqual([OBJECTIVE.id]);
    expect(
      reachableObjectives(
        mission([unitAt("s", "infantry", at(3, 3))]),
        "s",
        OBJECTIVE_TUNING,
      ),
    ).toEqual([]);
  });

  it("marks every mouth not yet sealed, and sends Jev to the next one to charge", () => {
    const partly = mission(
      undefined,
      sealed("tunnel-1").map((m) =>
        m.id === "tunnel-2" ? { ...m, chargeId: tunnelChargeId(m) } : m,
      ),
    );
    expect(RULES.markers?.(OBJECTIVE, partly)).toEqual([at(5, 5), at(5, 1)]);
    expect(RULES.destination?.(OBJECTIVE, partly)).toEqual({
      position: at(5, 1),
    });
    const burning = mission(
      undefined,
      sealed("tunnel-1", "tunnel-3").map((m) =>
        m.id === "tunnel-2" ? { ...m, chargeId: tunnelChargeId(m) } : m,
      ),
    );
    expect(RULES.destination?.(OBJECTIVE, burning)).toEqual({
      position: at(5, 5),
    });
    expect(
      RULES.destination?.(
        OBJECTIVE,
        mission(undefined, sealed("tunnel-1", "tunnel-2", "tunnel-3")),
      ),
    ).toEqual({});
  });

  it("tallies and reports the mouths sealed of the mouths named", () => {
    const two = mission(undefined, sealed("tunnel-1", "tunnel-3"));
    expect(RULES.tally?.(OBJECTIVE, two)).toEqual({ done: 2, total: 3 });
    expect(objectiveResultFields(two)).toEqual({
      tunnelsSealed: 2,
      tunnelsTotal: 3,
    });
    expect(objectiveResults(two)).toEqual([
      expect.objectContaining({ kind: "seal-tunnels", done: 2, total: 3 }),
    ]);
    expect(sealProgress(OBJECTIVE, two)).toEqual({
      sealed: 2,
      total: 3,
      burning: [],
    });
  });
});
