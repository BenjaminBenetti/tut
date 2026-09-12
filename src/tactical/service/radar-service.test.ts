import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import { describe, expect, it } from "vitest";
import { RADAR_TUNING } from "../data/radar-tuning";
import { COMBAT_TUNING } from "../data/combat-tuning";
import { deployRadar } from "../model/deploy-radar-command";
import type { Radar } from "../model/radar";
import type { TacticalState } from "../model/tactical-state";
import { previewAttack } from "./combat-service";
import { viewFor } from "./mission-view-service";
import {
  createDeployRadarHandler,
  radarContacts,
  validateRadarDeployment,
} from "./radar-service";
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
const SCANNER: Radar = { id: "radar-1", team: "tdf", pos: ORIGIN, range: 30 };

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

  it("refuses distant, diagonal, invalid, occupied, nest and duplicate scanner tiles", () => {
    const mission = radioMission();
    for (const tile of [
      { x: 3, y: 0, z: 1 },
      { x: 2, y: 0, z: 2 },
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
