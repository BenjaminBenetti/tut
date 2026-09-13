import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import { describe, expect, it } from "vitest";
import { RADAR_TUNING } from "../data/radar-tuning";
import { COMBAT_TUNING } from "../data/combat-tuning";
import { deployRadar } from "../model/deploy-radar-command";
import { endTurn } from "../model/end-turn-command";
import type { Radar } from "../model/radar";
import { RADAR_BURNED_OUT } from "../model/radar-burned-out-event";
import type { TacticalState } from "../model/tactical-state";
import { previewAttack } from "./combat-service";
import { viewFor } from "./mission-view-service";
import {
  createDeployRadarHandler,
  drainRadarBatteries,
  radarContacts,
  validateRadarDeployment,
} from "./radar-service";
import { createEndTurnHandler, refreshSides } from "./turn-service";
import {
  missionWith,
  unitAt,
  ctxWith,
  riggedRng,
} from "./tactical-fixtures.test-helper";
import {
  perceivedSpawners,
  perceivedUnits,
  withVision,
} from "./vision-service";

const ORIGIN = { x: 1, y: 0, z: 1 };
const TILE = { x: 2, y: 0, z: 1 };
const SCANNER: Radar = {
  id: "radar-1",
  team: "tdf",
  pos: ORIGIN,
  range: 30,
  turnsLeft: 3,
};

/** A signals squad on an open field, with the ability frozen into its template. */
function radioMission(): TacticalState {
  const base = missionWith(
    new FixtureMapBuilder(40, 40, 6).fillGround().build(),
    [unitAt("radio", "infantry", ORIGIN)],
  );
  const unit = base.units[0]!;
  return {
    ...base,
    templates: {
      ...base.templates,
      [unit.templateId]: {
        ...base.templates[unit.templateId]!,
        abilities: ["deploy-radar"],
      },
    },
  };
}

describe("Deploy radar", () => {
  it("spends one AP, emits feedback, preserves inputs and produces serializable state", () => {
    const before = radioMission();
    const result = createDeployRadarHandler(RADAR_TUNING)(
      before,
      deployRadar("radio", TILE),
      ctxWith(riggedRng(true)),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state.radars).toEqual([{ ...SCANNER, pos: TILE }]);
    expect(result.value.state.units[0]?.ap).toBe(1);
    expect(result.value.events).toEqual([
      {
        type: "tactical:radar-deployed",
        payload: { unitId: "radio", radar: { ...SCANNER, pos: TILE } },
      },
    ]);
    expect(before.radars).toEqual([]);
    expect(before.units[0]?.ap).toBe(2);
    expect(JSON.parse(JSON.stringify(result.value.state))).toEqual(
      result.value.state,
    );
  });

  it.each([
    [
      "ordinary squad",
      (m: TacticalState) => ({ ...m, templates: {} }),
      "no-radar",
    ],
    [
      "spent squad",
      (m: TacticalState) => ({
        ...m,
        units: m.units.map((u) => ({ ...u, ap: 0 })),
      }),
      "no-action-points",
    ],
    [
      "dead squad",
      (m: TacticalState) => ({
        ...m,
        units: m.units.map((u) => ({ ...u, hp: 0 })),
      }),
      "unit-dead",
    ],
    [
      "bug phase",
      (m: TacticalState): TacticalState => ({ ...m, phase: "bugs" }),
      "wrong-phase",
    ],
    [
      "ended mission",
      (m: TacticalState): TacticalState => ({ ...m, outcome: "won" }),
      "mission-over",
    ],
  ])("refuses a %s without creating a scanner", (_label, change, kind) => {
    const mission = change(radioMission());
    const ctx = ctxWith(riggedRng(true));
    const ids = ctx.ids.getState();
    const result = createDeployRadarHandler(RADAR_TUNING)(
      mission,
      deployRadar("radio", TILE),
      ctx,
    );
    expect(result).toEqual({
      ok: false,
      error: {
        kind,
        ...(kind === "mission-over" ? { outcome: "won" } : { unitId: "radio" }),
      },
    });
    expect(ctx.ids.getState()).toEqual(ids);
    expect(mission.radars).toEqual([]);
  });

  it("accepts a diagonal and a two-tile straight placement (#1130: range 2, a diagonal measures 1.41)", () => {
    const mission = radioMission();
    for (const tile of [
      { x: 2, y: 0, z: 2 },
      { x: 3, y: 0, z: 1 },
      { x: 1, y: 0, z: 3 },
    ]) {
      expect(
        validateRadarDeployment(mission, "radio", tile, RADAR_TUNING).ok,
      ).toBe(true);
    }
  });

  it("refuses distant, invalid, occupied, nest and duplicate scanner tiles", () => {
    const mission = radioMission();
    for (const tile of [
      { x: 4, y: 0, z: 1 },
      { x: 3, y: 0, z: 3 },
      { x: 2, y: 2, z: 1 },
    ]) {
      expect(
        validateRadarDeployment(mission, "radio", tile, RADAR_TUNING),
      ).toMatchObject({ ok: false, error: { kind: "radar-out-of-reach" } });
    }
    for (const tile of [
      ORIGIN,
      { ...TILE, x: NaN },
      { ...TILE, x: 1.5 },
      { ...TILE, x: -1 },
    ]) {
      expect(
        validateRadarDeployment(mission, "radio", tile, RADAR_TUNING).ok,
      ).toBe(false);
    }
    const occupied = [
      {
        ...mission,
        units: [...mission.units, unitAt("other", "infantry", TILE)],
      },
      { ...mission, radars: [{ ...SCANNER, pos: TILE }] },
      { ...mission, radars: [{ ...SCANNER, pos: TILE, turnsLeft: 0 }] },
      {
        ...mission,
        spawners: [
          {
            id: "nest",
            pos: TILE,
            hp: 20,
            destroyed: false,
            timer: 3,
            hatchRadius: 3,
          },
        ],
      },
    ];
    for (const state of occupied) {
      expect(
        validateRadarDeployment(state, "radio", TILE, RADAR_TUNING),
      ).toMatchObject({ ok: false, error: { kind: "radar-tile-blocked" } });
    }
  });

  it("carries the scanner on foot: a wall that costs a three-step detour blocks, a comrade in the way does not", () => {
    const base = radioMission();
    // A wall on the east edge of the squad's tile: the straight tile
    // beyond it is two tiles off but three steps round.
    const walled = {
      ...base,
      map: {
        ...base.map,
        tiles: base.map.tiles.map((t) =>
          t.x === ORIGIN.x && t.z === ORIGIN.z
            ? { ...t, walls: { e: "solid" as const } }
            : t,
        ),
      },
    };
    const beyond = { x: 3, y: 0, z: 1 };
    expect(
      validateRadarDeployment(walled, "radio", beyond, RADAR_TUNING),
    ).toMatchObject({ ok: false, error: { kind: "radar-tile-blocked" } });
    // The diagonal past the wall's end is two steps round, so it is fine.
    expect(
      validateRadarDeployment(
        walled,
        "radio",
        { x: 2, y: 0, z: 2 },
        RADAR_TUNING,
      ).ok,
    ).toBe(true);
    const crowded = {
      ...base,
      units: [...base.units, unitAt("other", "infantry", TILE)],
    };
    expect(
      validateRadarDeployment(crowded, "radio", beyond, RADAR_TUNING).ok,
    ).toBe(true);
  });

  it("cannot place through a solid wall or on an impassable tile", () => {
    const base = radioMission();
    for (const change of [{ walls: { w: "solid" as const } }, { pass: 0 }]) {
      const map = {
        ...base.map,
        tiles: base.map.tiles.map((t) =>
          t.x === TILE.x && t.z === TILE.z ? { ...t, ...change } : t,
        ),
      };
      expect(
        validateRadarDeployment({ ...base, map }, "radio", TILE, RADAR_TUNING)
          .ok,
      ).toBe(false);
    }
  });
});

describe("radar contacts", () => {
  it("detects through walls inside weapon range without making the contact attackable", () => {
    const base = radioMission();
    const builder = new FixtureMapBuilder(8, 8, 1).fillGround();
    for (let z = 0; z < 8; z++) builder.wall({ x: 3, y: 0, z }, "e", "solid");
    const bug = unitAt(
      "behind-wall",
      "infantry",
      { x: 5, y: 0, z: 1 },
      { team: "bugs" },
    );
    const mission = withVision({
      state: {
        ...base,
        map: builder.build(),
        radars: [SCANNER],
        units: [...base.units, bug],
      },
      events: [],
    }).state;
    expect(radarContacts(mission, "tdf")).toEqual([
      { kind: "unit", pos: bug.pos },
    ]);
    expect(
      previewAttack(mission, "radio", bug.id, COMBAT_TUNING),
    ).toMatchObject({ ok: false, error: { kind: "no-line-of-sight" } });
    expect(perceivedUnits(mission, "tdf").map((unit) => unit.id)).toEqual([
      "radio",
    ]);
  });

  it("uses a 30-tile circle, includes hidden units and nests across floors, and deduplicates overlapping scans", () => {
    const base = radioMission();
    const positions = [
      { x: 31, y: 0, z: 1 },
      { x: 19, y: 0, z: 25 },
      { x: 23, y: 0, z: 23 },
      { x: 32, y: 0, z: 1 },
    ];
    const mission = {
      ...base,
      map: new FixtureMapBuilder(40, 40, 6)
        .fillGround()
        .tile({ x: 17, y: 4, z: 1 }, SurfaceIds.GRASS)
        .build(),
      radars: [SCANNER, { ...SCANNER, id: "radar-2" }],
      units: [
        ...base.units,
        ...positions.map((pos, i) =>
          unitAt(`bug-${String(i)}`, "infantry", pos, {
            team: "bugs",
            status: ["hidden"],
          }),
        ),
      ],
      spawners: [
        {
          id: "nest",
          pos: { x: 17, y: 4, z: 1 },
          hp: 20,
          destroyed: false,
          timer: 3,
          hatchRadius: 3,
        },
      ],
    };
    expect(radarContacts(mission, "tdf")).toEqual([
      { kind: "unit", pos: positions[0] },
      { kind: "unit", pos: positions[1] },
      { kind: "structure", pos: mission.spawners[0]?.pos },
    ]);
    expect(radarContacts(mission, "bugs")).toEqual([]);
    expect(viewFor(mission, "bugs").radars).toEqual([]);
  });

  it("updates contacts after movement, death, destruction and normal spotting without revealing terrain", () => {
    const base = radioMission();
    const pos = { x: 16, y: 0, z: 1 };
    const bug = unitAt("bug", "infantry", pos, { team: "bugs" });
    const nest = {
      id: "nest",
      pos: { x: 17, y: 0, z: 1 },
      hp: 20,
      destroyed: false,
      timer: 3,
      hatchRadius: 3,
    };
    const mission = withVision({
      state: {
        ...base,
        radars: [SCANNER],
        units: [...base.units, bug],
        spawners: [nest],
      },
      events: [],
    }).state;
    const beforeVision = JSON.stringify(mission.vision);
    expect(radarContacts(mission, "tdf")).toHaveLength(2);
    expect(perceivedUnits(mission, "tdf").map((u) => u.id)).toEqual(["radio"]);
    expect(perceivedSpawners(mission, "tdf")).toEqual([]);
    expect(previewAttack(mission, "radio", "bug", COMBAT_TUNING).ok).toBe(
      false,
    );
    expect(JSON.stringify(mission.vision)).toBe(beforeVision);
    expect(radarContacts({ ...mission, radars: [] }, "tdf")).toEqual([]);
    for (const changed of [
      { ...bug, hp: 0 },
      { ...bug, pos: { x: 35, y: 0, z: 1 } },
    ]) {
      expect(
        radarContacts(
          {
            ...mission,
            units: [changed],
            spawners: [{ ...nest, destroyed: true }],
          },
          "tdf",
        ),
      ).toEqual([]);
    }
    const spotted = withVision({
      state: {
        ...mission,
        units: [...base.units, { ...bug, pos: TILE }],
        spawners: [],
      },
      events: [],
    }).state;
    expect(radarContacts(spotted, "tdf")).toEqual([]);
    // Scanners remain autonomous after the deploying squad extracts.
    expect(radarContacts({ ...mission, units: [bug] }, "tdf")).toHaveLength(2);
  });
});

describe("radar battery", () => {
  /** A scanner deployed on turn 1, in the player's phase. */
  function deployed(turnsLeft = RADAR_TUNING.batteryTurns): TacticalState {
    return { ...radioMission(), radars: [{ ...SCANNER, turnsLeft }] };
  }

  it("deploys with the tuning's full battery", () => {
    const result = createDeployRadarHandler(RADAR_TUNING)(
      radioMission(),
      deployRadar("radio", TILE),
      ctxWith(riggedRng(true)),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state.radars[0]?.turnsLeft).toBe(3);
  });

  it("drains one turn as a player phase opens and nothing as the bug phase opens, without touching its input", () => {
    const player = deployed();
    const before = JSON.stringify(player);
    const drained = drainRadarBatteries(player, ctxWith(riggedRng(true)));
    expect(drained.state.radars).toEqual([{ ...SCANNER, turnsLeft: 2 }]);
    expect(drained.events).toEqual([]);
    expect(JSON.stringify(player)).toBe(before);
    const bugs: TacticalState = { ...player, phase: "bugs" };
    const untouched = drainRadarBatteries(bugs, ctxWith(riggedRng(true)));
    expect(untouched.state).toBe(bugs);
    expect(untouched.events).toEqual([]);
  });

  it("announces the scanner that dies and leaves a dead one alone", () => {
    const mission: TacticalState = {
      ...deployed(1),
      radars: [
        { ...SCANNER, turnsLeft: 1 },
        { ...SCANNER, id: "radar-dead", turnsLeft: 0 },
      ],
    };
    const drained = drainRadarBatteries(mission, ctxWith(riggedRng(true)));
    expect(drained.state.radars).toEqual([
      { ...SCANNER, turnsLeft: 0 },
      { ...SCANNER, id: "radar-dead", turnsLeft: 0 },
    ]);
    expect(drained.events).toEqual([
      {
        type: RADAR_BURNED_OUT,
        payload: { radarId: "radar-1", pos: ORIGIN },
      },
    ]);
  });

  it("scans through turns T, T+1 and T+2 and the bug phases between, and is burnt out when T+3 opens", () => {
    const bug = unitAt(
      "bug",
      "infantry",
      { x: 16, y: 0, z: 1 },
      { team: "bugs" },
    );
    let mission: TacticalState = {
      ...deployed(),
      units: [...radioMission().units, bug],
    };
    const handler = createEndTurnHandler([refreshSides, drainRadarBatteries]);
    const ctx = ctxWith(riggedRng(true));
    const seen: {
      turn: number;
      phase: string;
      left: number;
      contacts: number;
    }[] = [];
    const burnouts: number[] = [];
    for (let step = 0; step < 6; step++) {
      const result = handler(mission, endTurn(), ctx);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      mission = result.value.state;
      for (const event of result.value.events) {
        if (event.type === RADAR_BURNED_OUT) burnouts.push(mission.turn);
      }
      seen.push({
        turn: mission.turn,
        phase: mission.phase,
        left: mission.radars[0]?.turnsLeft ?? -1,
        contacts: radarContacts(mission, "tdf").length,
      });
    }
    expect(seen).toEqual([
      { turn: 1, phase: "bugs", left: 3, contacts: 1 },
      { turn: 2, phase: "player", left: 2, contacts: 1 },
      { turn: 2, phase: "bugs", left: 2, contacts: 1 },
      { turn: 3, phase: "player", left: 1, contacts: 1 },
      { turn: 3, phase: "bugs", left: 1, contacts: 1 },
      { turn: 4, phase: "player", left: 0, contacts: 0 },
    ]);
    expect(burnouts).toEqual([4]);
    // The dead scanner stays on the map for the renderer and the save.
    expect(mission.radars).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(mission))).toEqual(mission);
  });

  it("reports nothing from a burnt-out scanner while a live one beside it still does", () => {
    const bug = unitAt(
      "bug",
      "infantry",
      { x: 16, y: 0, z: 1 },
      { team: "bugs" },
    );
    const base = { ...radioMission(), units: [...radioMission().units, bug] };
    expect(
      radarContacts({ ...base, radars: [{ ...SCANNER, turnsLeft: 0 }] }, "tdf"),
    ).toEqual([]);
    expect(
      radarContacts(
        {
          ...base,
          radars: [
            { ...SCANNER, turnsLeft: 0 },
            { ...SCANNER, id: "radar-2", turnsLeft: 1 },
          ],
        },
        "tdf",
      ),
    ).toEqual([{ kind: "unit", pos: bug.pos }]);
  });
});
