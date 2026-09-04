import { describe, expect, it } from "vitest";

import { err, ok } from "../../core/model/result";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { extract } from "../model/extract-command";
import { interact } from "../model/interact-command";
import { MISSION_ENDED } from "../model/mission-ended-event";
import { OBJECTIVE_UPDATED } from "../model/objective-updated-event";
import type { ObjectiveTuning } from "../model/objective-tuning";
import type { TacticalOutcome } from "../model/tactical-handler";
import { SPAWNER_DAMAGED } from "../model/spawner-damaged-event";
import type {
  Objective,
  Spawner,
  TacticalState,
} from "../model/tactical-state";
import { UNIT_EXTRACTED } from "../model/unit-extracted-event";
import { OBJECTIVE_TUNING } from "../data/objective-tuning";
import {
  createExtractHandler,
  createInteractHandler,
} from "./objective-service";
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

const TUNING: ObjectiveTuning = OBJECTIVE_TUNING;
const CTX = ctxWith(riggedRng(true));
const MAP = openField().build();

function at(x: number, z: number): TileCoord {
  return { x, y: 0, z };
}

function spawner(id: string, pos: TileCoord, hp = 20): Spawner {
  return { id, pos, hatchRadius: 3, hp, timer: 3, destroyed: false };
}

function objective(id: string, targetId: string, complete = false): Objective {
  return { id, kind: "destroy-spawner", targetId, complete };
}

/** A mission with one spawner at (4, 4) and a squad standing beside it. */
function besideSpawner(
  options: { readonly hp?: number; readonly ap?: number } = {},
): TacticalState {
  return missionWith(
    MAP,
    [
      unitAt("u", "infantry", at(3, 4), { ap: options.ap ?? 2 }),
      unitAt("b", "infantry", at(7, 7), { team: "bugs" }),
    ],
    {
      spawners: [spawner("spawner-1", at(4, 4), options.hp ?? 20)],
      objectives: [objective("objective-1", "spawner-1")],
    },
  );
}

// ===========================================
// Interact
// ===========================================

describe("createInteractHandler", () => {
  const handler = createInteractHandler(TUNING);

  it("plants charges: one action off the unit, chargeDamage off the spawner", () => {
    const applied = handler(besideSpawner(), interact("u", "objective-1"), CTX);
    if (!applied.ok) throw new Error(`refused: ${applied.error.kind}`);

    const { state, events } = applied.value;
    expect(state.units[0]?.ap).toBe(2 - TUNING.interactApCost);
    expect(state.spawners[0]?.hp).toBe(20 - TUNING.chargeDamage);
    expect(state.spawners[0]?.destroyed).toBe(false);
    expect(state.objectives[0]?.complete).toBe(false);
    expect(state.outcome).toBeUndefined();
    expect(events).toEqual([
      {
        type: SPAWNER_DAMAGED,
        payload: {
          spawnerId: "spawner-1",
          unitId: "u",
          damage: TUNING.chargeDamage,
          hp: 20 - TUNING.chargeDamage,
          destroyed: false,
        },
      },
    ]);
  });

  it("completes the objective and wins the mission with the last spawner", () => {
    const applied = handler(
      besideSpawner({ hp: TUNING.chargeDamage }),
      interact("u", "objective-1"),
      CTX,
    );
    if (!applied.ok) throw new Error(`refused: ${applied.error.kind}`);

    const { state, events } = applied.value;
    expect(state.spawners[0]).toMatchObject({ hp: 0, destroyed: true });
    expect(state.objectives[0]?.complete).toBe(true);
    expect(state.outcome).toBe("won");
    expect(events.map((event) => event.type)).toEqual([
      SPAWNER_DAMAGED,
      OBJECTIVE_UPDATED,
      MISSION_ENDED,
    ]);
    expect(events[2]).toEqual({
      type: MISSION_ENDED,
      payload: { outcome: "won", turn: 1 },
    });
  });

  it("leaves the mission running while another objective is open", () => {
    const mission: TacticalState = {
      ...besideSpawner({ hp: TUNING.chargeDamage }),
      spawners: [
        spawner("spawner-1", at(4, 4), TUNING.chargeDamage),
        spawner("spawner-2", at(7, 0)),
      ],
      objectives: [
        objective("objective-1", "spawner-1"),
        objective("objective-2", "spawner-2"),
      ],
    };
    const applied = handler(mission, interact("u", "objective-1"), CTX);
    if (!applied.ok) throw new Error(`refused: ${applied.error.kind}`);

    expect(applied.value.state.outcome).toBeUndefined();
    expect(applied.value.state.objectives.map((o) => o.complete)).toEqual([
      true,
      false,
    ]);
  });

  it("never takes a spawner below zero", () => {
    const applied = handler(
      besideSpawner({ hp: 1 }),
      interact("u", "objective-1"),
      CTX,
    );
    if (!applied.ok) throw new Error(`refused: ${applied.error.kind}`);
    expect(applied.value.state.spawners[0]?.hp).toBe(0);
  });

  it("refuses a unit that is missing, down, off-phase or out of actions", () => {
    const mission = besideSpawner();
    expect(
      refusal(handler(mission, interact("ghost", "objective-1"), CTX)),
    ).toBe("unit-not-on-map");
    expect(refusal(handler(mission, interact("b", "objective-1"), CTX))).toBe(
      "wrong-phase",
    );
    const down = besideSpawner();
    expect(
      refusal(
        handler(
          {
            ...down,
            units: [{ ...down.units[0]!, hp: 0 }, ...down.units.slice(1)],
          },
          interact("u", "objective-1"),
          CTX,
        ),
      ),
    ).toBe("unit-dead");
    expect(
      refusal(
        handler(besideSpawner({ ap: 0 }), interact("u", "objective-1"), CTX),
      ),
    ).toBe("no-action-points");
  });

  it("refuses an unknown, finished or unreachable objective", () => {
    const mission = besideSpawner();
    expect(refusal(handler(mission, interact("u", "objective-9"), CTX))).toBe(
      "objective-not-found",
    );
    expect(
      refusal(
        handler(
          {
            ...mission,
            objectives: [objective("objective-1", "spawner-1", true)],
          },
          interact("u", "objective-1"),
          CTX,
        ),
      ),
    ).toBe("objective-complete");
    expect(
      refusal(
        handler(
          { ...mission, spawners: [] },
          interact("u", "objective-1"),
          CTX,
        ),
      ),
    ).toBe("objective-target-missing");
    expect(
      refusal(
        handler(
          { ...mission, spawners: [spawner("spawner-1", at(7, 0))] },
          interact("u", "objective-1"),
          CTX,
        ),
      ),
    ).toBe("objective-out-of-reach");
  });

  it("hands the objective's own effect to the interaction for its kind", () => {
    const seen: string[] = [];
    const custom = createInteractHandler(TUNING, {
      "destroy-spawner": (mission, objective, unit) => {
        seen.push(`${objective.id}:${unit.id}`);
        return ok({ state: mission, events: [] });
      },
    });
    const applied = custom(besideSpawner(), interact("u", "objective-1"), CTX);
    if (!applied.ok) throw new Error(`refused: ${applied.error.kind}`);

    expect(seen).toEqual(["objective-1:u"]);
    // The handler still bills the action, even for an interaction that
    // changes nothing else.
    expect(applied.value.state.units[0]?.ap).toBe(2 - TUNING.interactApCost);
    expect(applied.value.state.spawners[0]?.hp).toBe(20);
  });

  it("spends nothing when the interaction refuses", () => {
    const custom = createInteractHandler(TUNING, {
      "destroy-spawner": () => err({ kind: "unit-dead", unitId: "u" }),
    });
    const applied = custom(besideSpawner(), interact("u", "objective-1"), CTX);
    expect(refusal(applied)).toBe("unit-dead");
  });

  it("leaves the mission it was given alone", () => {
    const mission = besideSpawner();
    const before = structuredClone(mission);
    handler(mission, interact("u", "objective-1"), CTX);
    expect(mission).toEqual(before);
  });
});

// ===========================================
// Extract
// ===========================================

describe("createExtractHandler", () => {
  const handler = createExtractHandler(TUNING);

  /** Two squads on the extraction tiles, one bug elsewhere. */
  function onTheZone(units = ["u", "v"]): TacticalState {
    return missionWith(
      MAP,
      [
        ...units.map((id, index) => unitAt(id, "infantry", at(index, 0))),
        unitAt("b", "infantry", at(7, 7), { team: "bugs" }),
      ],
      { objectives: [objective("objective-1", "spawner-1")] },
    );
  }

  const ZONE = { extraction: [at(0, 0), at(1, 0)] };

  it("moves the unit out of the fight and into the extracted list", () => {
    const applied = handler({ ...onTheZone(), ...ZONE }, extract("u"), CTX);
    if (!applied.ok) throw new Error(`refused: ${applied.error.kind}`);

    const { state, events } = applied.value;
    expect(state.units.map((unit) => unit.id)).toEqual(["v", "b"]);
    expect(state.extracted.map((unit) => unit.id)).toEqual(["u"]);
    expect(state.extracted[0]?.hp).toBe(10);
    expect(state.outcome).toBeUndefined();
    expect(events).toEqual([
      { type: UNIT_EXTRACTED, payload: { unitId: "u", remaining: 1 } },
    ]);
  });

  it("ends the mission as extracted once the last unit walks out", () => {
    const first = handler({ ...onTheZone(), ...ZONE }, extract("u"), CTX);
    if (!first.ok) throw new Error(`refused: ${first.error.kind}`);
    const second = handler(first.value.state, extract("v"), CTX);
    if (!second.ok) throw new Error(`refused: ${second.error.kind}`);

    expect(second.value.state.outcome).toBe("extracted");
    expect(second.value.state.extracted.map((unit) => unit.id)).toEqual([
      "u",
      "v",
    ]);
    expect(second.value.events.map((event) => event.type)).toEqual([
      UNIT_EXTRACTED,
      MISSION_ENDED,
    ]);
  });

  it("keeps a fallen comrade out of the extracted count", () => {
    const mission = { ...onTheZone(), ...ZONE };
    const withCasualty: TacticalState = {
      ...mission,
      units: mission.units.map((unit) =>
        unit.id === "v" ? { ...unit, hp: 0 } : unit,
      ),
    };
    const applied = handler(withCasualty, extract("u"), CTX);
    if (!applied.ok) throw new Error(`refused: ${applied.error.kind}`);

    expect(applied.value.state.outcome).toBe("extracted");
    expect(applied.value.events[0]).toEqual({
      type: UNIT_EXTRACTED,
      payload: { unitId: "u", remaining: 0 },
    });
  });

  it("costs no action points by default, so a spent unit still leaves", () => {
    const mission = { ...onTheZone(), ...ZONE };
    const spent: TacticalState = {
      ...mission,
      units: mission.units.map((unit) =>
        unit.id === "u" ? { ...unit, ap: 0 } : unit,
      ),
    };
    const applied = handler(spent, extract("u"), CTX);
    expect(applied.ok).toBe(true);
  });

  it("refuses a unit off the zone, a bug, a corpse and a stranger", () => {
    const mission = { ...onTheZone(), ...ZONE };
    expect(refusal(handler(mission, extract("ghost"), CTX))).toBe(
      "unit-not-on-map",
    );
    expect(refusal(handler(mission, extract("b"), CTX))).toBe(
      "not-extractable",
    );
    expect(
      refusal(
        handler({ ...mission, extraction: [at(5, 5)] }, extract("u"), CTX),
      ),
    ).toBe("not-in-extraction-zone");
    const down: TacticalState = {
      ...mission,
      units: mission.units.map((unit) =>
        unit.id === "u" ? { ...unit, hp: 0 } : unit,
      ),
    };
    expect(refusal(handler(down, extract("u"), CTX))).toBe("unit-dead");
  });

  it("refuses a unit whose side is not acting", () => {
    const mission: TacticalState = {
      ...onTheZone(),
      ...ZONE,
      phase: "bugs",
    };
    expect(refusal(handler(mission, extract("u"), CTX))).toBe("wrong-phase");
  });

  it("charges action points when the tuning asks for them", () => {
    const costly = createExtractHandler({ ...TUNING, extractApCost: 2 });
    const mission = { ...onTheZone(), ...ZONE };
    const applied = costly(mission, extract("u"), CTX);
    if (!applied.ok) throw new Error(`refused: ${applied.error.kind}`);
    expect(applied.value.state.extracted[0]?.ap).toBe(0);

    const spent: TacticalState = {
      ...mission,
      units: mission.units.map((unit) =>
        unit.id === "u" ? { ...unit, ap: 1 } : unit,
      ),
    };
    expect(refusal(costly(spent, extract("u"), CTX))).toBe("no-action-points");
  });

  it("leaves the mission it was given alone", () => {
    const mission = { ...onTheZone(), ...ZONE };
    const before = structuredClone(mission);
    handler(mission, extract("u"), CTX);
    expect(mission).toEqual(before);
  });
});

// ===========================================
// Determinism
// ===========================================

describe("objective handlers", () => {
  it("draw nothing, so the same command twice gives the same state", () => {
    const handler = createInteractHandler(TUNING);
    const mission = besideSpawner();
    const first = handler(mission, interact("u", "objective-1"), {
      ...CTX,
      rng: new Mulberry32Rng(1),
    });
    const second = handler(mission, interact("u", "objective-1"), {
      ...CTX,
      rng: new Mulberry32Rng(999),
    });
    if (!first.ok || !second.ok) throw new Error("refused");
    expect(first.value).toEqual(second.value);
  });
});

// ===========================================
// Helpers
// ===========================================

/** The rejection kind of a refused outcome, or `"ok"` when it was allowed. */
function refusal(outcome: TacticalOutcome): string {
  return outcome.ok ? "ok" : outcome.error.kind;
}
