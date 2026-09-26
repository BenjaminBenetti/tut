import { describe, expect, it } from "vitest";

import { err, ok } from "../../core/model/result";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { CIVILIANS_EXTRACTED } from "../model/civilians-extracted-event";
import { CIVILIANS_FREED } from "../model/civilians-freed-event";
import { extract } from "../model/extract-command";
import { interact } from "../model/interact-command";
import { MISSION_ENDED } from "../model/mission-ended-event";
import { OBJECTIVE_UPDATED } from "../model/objective-updated-event";
import type { ObjectiveTuning } from "../model/objective-tuning";
import type { TacticalOutcome } from "../model/tactical-handler";
import { SPAWNER_DAMAGED } from "../model/spawner-damaged-event";
import type {
  Objective,
  RescueCiviliansObjective,
  Spawner,
  TacticalState,
} from "../model/tactical-state";
import { UNIT_EXTRACTED } from "../model/unit-extracted-event";
import { OBJECTIVE_TUNING } from "../data/objective-tuning";
import { DEFEND_GENERATORS_OBJECTIVE } from "./objectives/defend-generators-objective";
import { DESTROY_SPAWNER_OBJECTIVE } from "./objectives/destroy-spawner-objective";
import { OBJECTIVE_RULES } from "./objectives/objective-rules";
import { rescueProgress } from "./objectives/rescue-civilians-objective";
import {
  createExtractHandler,
  createInteractHandler,
  reachableObjectives,
  DEFAULT_OBJECTIVE_INTERACTIONS,
} from "./objective-service";
import {
  ctxWith,
  missionWith,
  openField,
  riggedRng,
  unitAt,
  withCivilian,
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

  it("completes the objective with the last spawner; the mission ends on extraction", () => {
    const applied = handler(
      besideSpawner({ hp: TUNING.chargeDamage }),
      interact("u", "objective-1"),
      CTX,
    );
    if (!applied.ok) throw new Error(`refused: ${applied.error.kind}`);

    const { state, events } = applied.value;
    expect(state.spawners[0]).toMatchObject({ hp: 0, destroyed: true });
    expect(state.objectives[0]?.complete).toBe(true);
    // Not over: the unit is still on the map, and the force has to
    // board the drop ship to bring the result home.
    expect(state.outcome).toBeUndefined();
    expect(events.map((event) => event.type)).toEqual([
      SPAWNER_DAMAGED,
      OBJECTIVE_UPDATED,
    ]);
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

  it("refuses a bug in either phase: objectives are the player's (#434)", () => {
    const mission = besideSpawner();
    // A bug in the player's phase was already refused, but for the phase
    // rather than for being a bug.
    expect(refusal(handler(mission, interact("b", "objective-1"), CTX))).toBe(
      "objective-not-yours",
    );
    // The one that mattered: in its own phase a bug passes the phase
    // check, and without a team guard it plants charges on its own hive
    // and wins the mission for the player.
    const bugPhase = { ...mission, phase: "bugs" as const };
    expect(refusal(handler(bugPhase, interact("b", "objective-1"), CTX))).toBe(
      "objective-not-yours",
    );
  });

  it("refuses a unit that is missing, down, off-phase or out of actions", () => {
    const mission = besideSpawner();
    expect(
      refusal(handler(mission, interact("ghost", "objective-1"), CTX)),
    ).toBe("unit-not-on-map");
    expect(
      refusal(
        handler(
          { ...mission, phase: "bugs" as const },
          interact("u", "objective-1"),
          CTX,
        ),
      ),
    ).toBe("wrong-phase");
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
      ...DEFAULT_OBJECTIVE_INTERACTIONS,
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
      ...DEFAULT_OBJECTIVE_INTERACTIONS,
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
// Reach
// ===========================================

describe("reachableObjectives", () => {
  it("offers the objective a unit is standing next to", () => {
    const found = reachableObjectives(besideSpawner(), "u", TUNING);
    expect(found).toHaveLength(1);
    expect(found[0]?.objective.id).toBe("objective-1");
    expect(found[0]?.spawner.id).toBe("spawner-1");
    expect(found[0]?.distance).toBe(1);
  });

  it("sorts by distance, nearest first, keeping objective order on a tie", () => {
    const mission: TacticalState = {
      ...besideSpawner(),
      spawners: [
        spawner("spawner-far", at(6, 4)),
        spawner("spawner-tie-a", at(3, 3)),
        spawner("spawner-tie-b", at(3, 5)),
      ],
      objectives: [
        objective("objective-far", "spawner-far"),
        objective("objective-tie-a", "spawner-tie-a"),
        objective("objective-tie-b", "spawner-tie-b"),
      ],
    };
    const found = reachableObjectives(mission, "u", {
      ...TUNING,
      interactRange: 5,
    });
    expect(found.map((entry) => entry.objective.id)).toEqual([
      "objective-tie-a",
      "objective-tie-b",
      "objective-far",
    ]);
  });

  it("skips what the handler would refuse: complete, destroyed, missing or out of range", () => {
    const mission = besideSpawner();
    expect(
      reachableObjectives(
        {
          ...mission,
          objectives: [objective("objective-1", "spawner-1", true)],
        },
        "u",
        TUNING,
      ),
    ).toEqual([]);
    expect(
      reachableObjectives(
        {
          ...mission,
          spawners: [{ ...spawner("spawner-1", at(4, 4), 0), destroyed: true }],
        },
        "u",
        TUNING,
      ),
    ).toEqual([]);
    expect(
      reachableObjectives({ ...mission, spawners: [] }, "u", TUNING),
    ).toEqual([]);
    expect(
      reachableObjectives(
        { ...mission, spawners: [spawner("spawner-1", at(7, 0))] },
        "u",
        TUNING,
      ),
    ).toEqual([]);
  });

  it("offers nothing to a unit that cannot act: missing, down, a bug, off-phase or spent", () => {
    const mission = besideSpawner();
    expect(reachableObjectives(mission, "ghost", TUNING)).toEqual([]);
    expect(reachableObjectives(mission, "b", TUNING)).toEqual([]);
    expect(reachableObjectives(besideSpawner({ ap: 0 }), "u", TUNING)).toEqual(
      [],
    );
    const down: TacticalState = {
      ...mission,
      units: mission.units.map((unit) =>
        unit.id === "u" ? { ...unit, hp: 0 } : unit,
      ),
    };
    expect(reachableObjectives(down, "u", TUNING)).toEqual([]);
    expect(
      reachableObjectives({ ...mission, phase: "bugs" }, "u", TUNING),
    ).toEqual([]);
  });

  it("agrees with the handler: everything it offers is accepted, and nothing else is", () => {
    const mission: TacticalState = {
      ...besideSpawner(),
      spawners: [
        spawner("spawner-1", at(4, 4)),
        spawner("spawner-2", at(7, 0)),
      ],
      objectives: [
        objective("objective-1", "spawner-1"),
        objective("objective-2", "spawner-2"),
      ],
    };
    const handler = createInteractHandler(TUNING);
    const offered = new Set(
      reachableObjectives(mission, "u", TUNING).map((e) => e.objective.id),
    );
    for (const candidate of mission.objectives) {
      const applied = handler(mission, interact("u", candidate.id), CTX);
      expect([candidate.id, applied.ok]).toEqual([
        candidate.id,
        offered.has(candidate.id),
      ]);
    }
  });
});

describe("objective rules behind Interact and reach (ADR 0013 §2.3)", () => {
  /** The squad beside a spawner objective and a defence of one generator at (3, 3). */
  function withDefence(): TacticalState {
    const mission = besideSpawner();
    return {
      ...mission,
      units: [
        ...mission.units,
        { ...unitAt("gen-1", "infantry", at(3, 3)), kind: "generator" },
      ],
      objectives: [
        ...mission.objectives,
        {
          id: "objective-2",
          kind: "defend-generators",
          installation: "sensor-array",
          targetIds: ["gen-1"],
          complete: false,
          failed: false,
        },
      ],
    };
  }

  it("takes each kind's interaction from the table, refusing a kind without one", () => {
    expect(DEFAULT_OBJECTIVE_INTERACTIONS["destroy-spawner"]).toBe(
      DESTROY_SPAWNER_OBJECTIVE.interaction,
    );
    const handler = createInteractHandler(TUNING);
    expect(
      refusal(handler(withDefence(), interact("u", "objective-2"), CTX)),
    ).toBe("objective-not-interactive");
  });

  it("asks the kind's rules for the target a unit works", () => {
    const mission = withDefence();
    expect(
      reachableObjectives(mission, "u", TUNING).map((e) => e.objective.id),
    ).toEqual(["objective-1"]);
    const found = reachableObjectives(mission, "u", TUNING, {
      ...OBJECTIVE_RULES,
      "defend-generators": {
        ...DEFEND_GENERATORS_OBJECTIVE,
        reachable: () => ({ id: "gen-1", pos: at(3, 3) }),
      },
    });
    expect(found.map((e) => [e.objective.id, e.target.id, e.distance])).toEqual(
      [
        ["objective-1", "spawner-1", 1],
        ["objective-2", "gen-1", 1],
      ],
    );
  });

  it("still offers a deadline-missed spawner objective while its spawner stands, as the handler accepts it", () => {
    const mission: TacticalState = {
      ...besideSpawner(),
      objectives: [{ ...objective("objective-1", "spawner-1"), failed: true }],
    };
    expect(
      reachableObjectives(mission, "u", TUNING).map((e) => e.objective.id),
    ).toEqual(["objective-1"]);
    const applied = createInteractHandler(TUNING)(
      mission,
      interact("u", "objective-1"),
      CTX,
    );
    if (!applied.ok) throw new Error(`refused: ${applied.error.kind}`);
    expect(applied.value.state.spawners[0]?.hp).toBe(20 - TUNING.chargeDamage);
    expect(applied.value.state.objectives[0]).toMatchObject({
      complete: false,
      failed: true,
    });
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

  it("counts only squads and mechs as remaining: a group, a turret and a generator are not the force", () => {
    const mission = withCivilian(
      {
        ...missionWith(MAP, [
          unitAt("u", "infantry", at(0, 0)),
          unitAt("m", "mech", at(5, 5)),
          { ...unitAt("t", "infantry", at(4, 4)), kind: "turret" },
          { ...unitAt("g", "infantry", at(3, 3)), kind: "generator" },
        ]),
        ...ZONE,
      },
      "civ",
      at(6, 2),
      { trapped: false },
    );
    const applied = handler(mission, extract("u"), CTX);
    if (!applied.ok) throw new Error(`refused: ${applied.error.kind}`);
    // Only the mech is left of the force.
    expect(applied.value.events).toEqual([
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

describe("createExtractHandler with a deployed turret (#1138)", () => {
  it("refuses to board a turret standing on the zone: it is left behind", () => {
    const handler = createExtractHandler(TUNING);
    const mission: TacticalState = {
      ...missionWith(MAP, [
        { ...unitAt("t", "infantry", at(0, 0)), kind: "turret" },
        unitAt("u", "infantry", at(1, 0)),
      ]),
      extraction: [at(0, 0), at(1, 0)],
    };
    expect(refusal(handler(mission, extract("t"), CTX))).toBe(
      "not-extractable",
    );
    expect(refusal(handler(mission, extract("u"), CTX))).toBe("ok");
  });
});

// ===========================================
// Civilian groups (campaign arc §6.4)
// ===========================================

describe("rescue-civilians through Interact and Extract (campaign arc §6.4)", () => {
  const interactHandler = createInteractHandler(TUNING);
  const extractHandler = createExtractHandler(TUNING);

  /** Three groups; two must get out. */
  const RESCUE: RescueCiviliansObjective = {
    id: "objective-rescue",
    kind: "rescue-civilians",
    groupIds: ["civ-1", "civ-2", "civ-3"],
    complete: false,
    failed: false,
  };

  /** How a group stands: trapped at a tile, freed at a tile, or aboard. */
  type Group = { readonly at: TileCoord; readonly trapped: boolean } | "aboard";

  /**
   * The squad `u` at `squad`, a bug far off, the extraction zone on
   * (0, 0) and (1, 0), and the three groups of `RESCUE` as given. A
   * group aboard is freed and in `extracted`.
   */
  function town(
    squad: TileCoord,
    groups: readonly [Group, Group, Group],
    rescue: RescueCiviliansObjective = RESCUE,
  ): TacticalState {
    let mission: TacticalState = {
      ...missionWith(
        MAP,
        [
          unitAt("u", "infantry", squad),
          unitAt("b", "infantry", at(7, 7), { team: "bugs" }),
        ],
        { objectives: [rescue] },
      ),
      extraction: [at(0, 0), at(1, 0)],
    };
    const aboard: string[] = [];
    groups.forEach((group, index) => {
      const id = RESCUE.groupIds[index]!;
      if (group === "aboard") {
        aboard.push(id);
        mission = withCivilian(mission, id, at(0, 0), { trapped: false });
      } else {
        mission = withCivilian(mission, id, group.at, {
          trapped: group.trapped,
        });
      }
    });
    return {
      ...mission,
      units: mission.units.filter((unit) => !aboard.includes(unit.id)),
      extracted: mission.units.filter((unit) => aboard.includes(unit.id)),
    };
  }

  const trapped = (x: number, z: number): Group => ({
    at: at(x, z),
    trapped: true,
  });
  const freed = (x: number, z: number): Group => ({
    at: at(x, z),
    trapped: false,
  });

  /** The outcome's events' types, or the refusal. */
  function typesOf(outcome: TacticalOutcome): readonly string[] {
    if (!outcome.ok) throw new Error(`refused: ${outcome.error.kind}`);
    return outcome.value.events.map((event) => event.type);
  }

  it("frees the group beside the squad for one action, and nothing else changes", () => {
    const mission = town(at(3, 4), [
      trapped(4, 4),
      trapped(6, 1),
      trapped(1, 6),
    ]);
    expect(
      reachableObjectives(mission, "u", TUNING).map((reach) => reach.target),
    ).toEqual([{ id: "civ-1", pos: at(4, 4) }]);

    const applied = interactHandler(mission, interact("u", RESCUE.id), CTX);
    expect(typesOf(applied)).toEqual([CIVILIANS_FREED]);
    if (!applied.ok) return;
    const { state } = applied.value;
    const civ1 = state.units.find((unit) => unit.id === "civ-1")!;
    expect(civ1.trapped).toBeUndefined();
    expect(civ1.ap).toBe(civ1.maxAp);
    expect(state.units.find((unit) => unit.id === "u")?.ap).toBe(
      2 - TUNING.interactApCost,
    );
    expect(state.objectives).toEqual([RESCUE]);
    expect(state.outcome).toBeUndefined();

    // With civ-1 out, nothing trapped is in reach: offered nothing,
    // and the handler agrees.
    expect(reachableObjectives(state, "u", TUNING)).toEqual([]);
    expect(refusal(interactHandler(state, interact("u", RESCUE.id), CTX))).toBe(
      "objective-out-of-reach",
    );
  });

  it("refuses a group trying to free another, trapped or freed", () => {
    const mission = town(at(7, 0), [freed(4, 4), trapped(5, 4), trapped(4, 5)]);
    expect(
      refusal(interactHandler(mission, interact("civ-1", RESCUE.id), CTX)),
    ).toBe("cannot-interact");
    expect(
      refusal(interactHandler(mission, interact("civ-2", RESCUE.id), CTX)),
    ).toBe("cannot-interact");
    expect(reachableObjectives(mission, "civ-1", TUNING)).toEqual([]);
  });

  it("keeps freeing groups after the half is aboard, and says so when none is left", () => {
    const done: RescueCiviliansObjective = { ...RESCUE, complete: true };
    const mission = town(at(3, 4), ["aboard", "aboard", trapped(4, 4)], done);
    expect(
      typesOf(interactHandler(mission, interact("u", RESCUE.id), CTX)),
    ).toEqual([CIVILIANS_FREED]);
    const empty = town(at(3, 4), ["aboard", "aboard", freed(4, 4)], done);
    expect(refusal(interactHandler(empty, interact("u", RESCUE.id), CTX))).toBe(
      "no-objective-in-reach",
    );
  });

  it("boards a freed group, but never a trapped one", () => {
    const mission = town(at(5, 5), [freed(0, 0), trapped(1, 0), trapped(6, 1)]);
    expect(refusal(extractHandler(mission, extract("civ-2"), CTX))).toBe(
      "unit-trapped",
    );
    expect(refusal(extractHandler(mission, extract("civ-1"), CTX))).toBe("ok");
  });

  it("counts each group aboard and completes the rescue with the one that makes the half", () => {
    const mission = town(at(5, 5), [freed(0, 0), freed(1, 0), trapped(6, 1)]);
    const first = extractHandler(mission, extract("civ-1"), CTX);
    expect(typesOf(first)).toEqual([UNIT_EXTRACTED, CIVILIANS_EXTRACTED]);
    if (!first.ok) return;
    expect(first.value.events[1]?.payload).toMatchObject({
      rescued: 1,
      total: 3,
    });
    expect(first.value.state.objectives).toEqual([RESCUE]);

    const second = extractHandler(first.value.state, extract("civ-2"), CTX);
    expect(typesOf(second)).toEqual([
      UNIT_EXTRACTED,
      CIVILIANS_EXTRACTED,
      OBJECTIVE_UPDATED,
    ]);
    if (!second.ok) return;
    expect(second.value.events[1]?.payload).toMatchObject({
      rescued: 2,
      total: 3,
    });
    expect(second.value.state.objectives).toEqual([
      { ...RESCUE, complete: true },
    ]);
    // The squad is still out there: the groups do not end the mission.
    expect(second.value.state.outcome).toBeUndefined();
  });

  it("ends the mission when the last squad boards, with every group still out there lost", () => {
    // One aboard of the two needed, one walking, one still trapped.
    const short = town(at(0, 0), ["aboard", freed(3, 3), trapped(6, 1)]);
    const left = extractHandler(short, extract("u"), CTX);
    expect(typesOf(left)).toEqual([UNIT_EXTRACTED, MISSION_ENDED]);
    if (!left.ok) return;
    expect(left.value.state.outcome).toBe("extracted");
    expect(rescueProgress(left.value.state, RESCUE)).toMatchObject({
      rescued: 1,
      lost: 2,
      status: "failed",
    });

    // Half aboard: the mission is won, and the group left behind is lost.
    const half = town(at(0, 0), ["aboard", "aboard", trapped(6, 1)]);
    const won = extractHandler(half, extract("u"), CTX);
    if (!won.ok) throw new Error(`refused: ${won.error.kind}`);
    expect(won.value.state.outcome).toBe("won");
    expect(rescueProgress(won.value.state, RESCUE)).toMatchObject({
      rescued: 2,
      lost: 1,
      status: "complete",
    });
  });
});
