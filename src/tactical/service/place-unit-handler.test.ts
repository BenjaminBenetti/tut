import { describe, expect, it } from "vitest";

import { BUG_SPECIES } from "../../bugs/data/species";
import { MECH_RATING_TUNING } from "../../roster/data/mech-rating-tuning";
import { STARTER_PARTS } from "../../roster/data/parts";
import { ROCKET_SQUAD, SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_LOADOUT } from "../../roster/data/starter-roster";
import { UPGRADE_TUNING } from "../../roster/data/upgrade-tuning";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import { StaticPartCatalogue } from "../../roster/repository/static-part-catalogue";
import { validateLoadout } from "../../roster/service/loadout-validation-service";
import { UNIT_TUNING } from "../data/unit-tuning";
import { placeUnit } from "../model/place-unit-command";
import type { TacticalState } from "../model/tactical-state";
import { UNIT_PLACED } from "../model/unit-placed-event";
import type { PlaceUnitDeps } from "./place-unit-handler";
import { createPlaceUnitHandler, placeableUnits } from "./place-unit-handler";
import {
  blockUnitAt,
  ctxWith,
  missionWith,
  openField,
  riggedRng,
  unitAt,
  walledField,
} from "./tactical-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

const PARTS = new StaticPartCatalogue(STARTER_PARTS);

/** The shipped catalogues over the switch. */
function depsWith(enabled: boolean): PlaceUnitDeps {
  return {
    enabled,
    species: Object.values(BUG_SPECIES),
    squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
    mechs: [
      { id: "starter", name: "Mech (starter)", loadout: STARTER_LOADOUT },
    ],
    sheetFor: (loadout) => {
      const sheet = validateLoadout(
        loadout,
        PARTS,
        MECH_RATING_TUNING,
        UPGRADE_TUNING,
      );
      return sheet.ok ? sheet.value : undefined;
    },
    unitTuning: UNIT_TUNING,
  };
}

/** An open field with one squad at (1,0,1) and one swarmer at (6,0,6). */
function field(): TacticalState {
  return missionWith(openField().build(), [
    unitAt("s1", "infantry", { x: 1, y: 0, z: 1 }),
    unitAt("b1", "infantry", { x: 6, y: 0, z: 6 }, { team: "bugs" }),
  ]);
}

const handler = createPlaceUnitHandler(depsWith(true));
const ctx = (): ReturnType<typeof ctxWith> => ctxWith(riggedRng(true));

// ===========================================
// Tests
// ===========================================

describe("createPlaceUnitHandler (#1136)", () => {
  it("places a bug of the species on the tile, on the bugs' side, whole and ready", () => {
    const mission = field();
    const tile = { x: 4, y: 0, z: 4 };
    const result = handler(
      mission,
      placeUnit(mission.missionId, "bug", "lurker", tile),
      ctx(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const placed = result.value.state.units.at(-1);
    expect(placed).toMatchObject({
      kind: "bug",
      team: "bugs",
      sourceId: "lurker",
      templateId: "bug:lurker",
      pos: tile,
      hp: BUG_SPECIES.lurker.hp,
      ap: BUG_SPECIES.lurker.ap,
    });
    // The species' template joins the mission's; one the mission already
    // holds (the fixture's `bug:swarmer`) is kept, not overwritten.
    expect(result.value.state.templates["bug:lurker"]?.name).toBe("Lurker");
    expect(result.value.state.templates["bug:swarmer"]).toBe(
      mission.templates["bug:swarmer"],
    );
    expect(result.value.events).toEqual([
      {
        type: UNIT_PLACED,
        payload: { unitId: placed?.id, kind: "bug", team: "bugs", tile },
      },
    ]);
    // Pure: the mission handed in is what it was.
    expect(mission.units).toHaveLength(2);
  });

  it("places a squad of the type on the player's side at full strength, carrying the type's kit", () => {
    const mission = field();
    const result = handler(
      mission,
      placeUnit(mission.missionId, "squad", "rocket", { x: 2, y: 0, z: 2 }),
      ctx(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const placed = result.value.state.units.at(-1);
    expect(placed).toMatchObject({
      kind: "squad",
      team: "tdf",
      passClass: "infantry",
      hp: 5 * UNIT_TUNING.infantry.hpPerSoldier,
    });
    const template = result.value.state.templates[placed?.templateId ?? ""];
    expect(template?.name).toBe("Rocket Squad");
    expect(template?.equipment).toEqual(ROCKET_SQUAD.equipment);
    expect(placed?.ap).toBe(template?.maxAp);
  });

  it("places the starter mech, undamaged, wearing the starter loadout", () => {
    const mission = field();
    const result = handler(
      mission,
      placeUnit(mission.missionId, "mech", "starter", { x: 3, y: 0, z: 5 }),
      ctx(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const placed = result.value.state.units.at(-1);
    expect(placed).toMatchObject({
      kind: "mech",
      team: "tdf",
      passClass: "mech",
    });
    expect(placed?.hp).toBe(placed?.maxHp);
    const template = result.value.state.templates[placed?.templateId ?? ""];
    expect(template?.loadout).toEqual(STARTER_LOADOUT);
    expect(template?.name).toBe("Mech (starter)");
  });

  it("places a brute on its whole 2×2 block when every tile of it is free", () => {
    const mission = field();
    const result = handler(
      mission,
      placeUnit(mission.missionId, "bug", "brute", { x: 2, y: 0, z: 4 }),
      ctx(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state.templates["bug:brute"]?.footprint).toBe(2);
  });

  it("refuses every placement when the tools are disabled, and touches nothing", () => {
    const disabled = createPlaceUnitHandler(depsWith(false));
    const mission = field();
    const result = disabled(
      mission,
      placeUnit(mission.missionId, "bug", "swarmer", { x: 4, y: 0, z: 4 }),
      ctx(),
    );
    expect(result).toEqual({ ok: false, error: { kind: "debug-disabled" } });
    expect(mission.units).toHaveLength(2);
  });

  it("refuses a command meant for another mission", () => {
    const mission = field();
    const result = handler(
      mission,
      placeUnit("mission-elsewhere", "bug", "swarmer", { x: 4, y: 0, z: 4 }),
      ctx(),
    );
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "mission-mismatch",
        expected: "mission-elsewhere",
        active: mission.missionId,
      },
    });
  });

  it("refuses a kind and id the catalogues do not know", () => {
    const mission = field();
    for (const [kind, id] of [
      ["bug", "rifle"],
      ["squad", "swarmer"],
      ["mech", "vanguard"],
    ] as const) {
      const result = handler(
        mission,
        placeUnit(mission.missionId, kind, id, { x: 4, y: 0, z: 4 }),
        ctx(),
      );
      expect(result).toEqual({
        ok: false,
        error: { kind: "unknown-unit-type", unitKind: kind, id },
      });
    }
  });

  it("refuses a tile off the map", () => {
    const mission = field();
    const result = handler(
      mission,
      placeUnit(mission.missionId, "bug", "swarmer", { x: 8, y: 0, z: 0 }),
      ctx(),
    );
    expect(result).toEqual({
      ok: false,
      error: { kind: "no-such-tile", x: 8, y: 0, z: 0 },
    });
  });

  it("refuses a tile a living unit or a live spawner already holds", () => {
    const mission = missionWith(
      openField().build(),
      [unitAt("s1", "infantry", { x: 1, y: 0, z: 1 })],
      {
        spawners: [
          {
            id: "spawner-1",
            pos: { x: 5, y: 0, z: 5 },
            hatchRadius: 3,
            hp: 20,
            timer: 3,
            destroyed: false,
          },
        ],
      },
    );
    const onUnit = handler(
      mission,
      placeUnit(mission.missionId, "bug", "swarmer", { x: 1, y: 0, z: 1 }),
      ctx(),
    );
    expect(onUnit).toEqual({
      ok: false,
      error: { kind: "tile-occupied", x: 1, y: 0, z: 1 },
    });
    const onSpawner = handler(
      mission,
      placeUnit(mission.missionId, "squad", "rifle", { x: 5, y: 0, z: 5 }),
      ctx(),
    );
    expect(onSpawner).toEqual({
      ok: false,
      error: { kind: "tile-occupied", x: 5, y: 0, z: 5 },
    });
  });

  it("refuses a brute whose block would overlap a unit standing beside the anchor", () => {
    const mission = missionWith(openField().build(), [
      blockUnitAt("brute-1", { x: 3, y: 0, z: 3 }),
    ]);
    // Anchor (2,0,2) covers (3,0,3), the brute's own anchor.
    const result = handler(
      mission,
      placeUnit(mission.missionId, "bug", "brute", { x: 2, y: 0, z: 2 }),
      ctx(),
    );
    expect(result).toEqual({
      ok: false,
      error: { kind: "tile-occupied", x: 2, y: 0, z: 2 },
    });
  });

  it("refuses a brute whose block would hang off the map or straddle a wall", () => {
    const edge = field();
    const offMap = handler(
      edge,
      placeUnit(edge.missionId, "bug", "brute", { x: 7, y: 0, z: 7 }),
      ctx(),
    );
    expect(offMap).toEqual({
      ok: false,
      error: { kind: "tile-blocked", x: 7, y: 0, z: 7 },
    });
    // The wall runs between x = 3 and x = 4; a block anchored at x = 3
    // would have its east half across it.
    const walled = missionWith(walledField(), []);
    const acrossWall = handler(
      walled,
      placeUnit(walled.missionId, "bug", "brute", { x: 3, y: 0, z: 5 }),
      ctx(),
    );
    expect(acrossWall).toEqual({
      ok: false,
      error: { kind: "tile-blocked", x: 3, y: 0, z: 5 },
    });
    // A swarmer on the same anchor stands on one tile and fits.
    const oneTile = handler(
      walled,
      placeUnit(walled.missionId, "bug", "swarmer", { x: 3, y: 0, z: 5 }),
      ctx(),
    );
    expect(oneTile.ok).toBe(true);
  });

  it("draws no id for a placement it refuses", () => {
    const mission = field();
    const context = ctx();
    handler(
      mission,
      placeUnit(mission.missionId, "bug", "swarmer", { x: 1, y: 0, z: 1 }),
      context,
    );
    expect(context.ids.getState().counters).toEqual({});
  });
});

describe("placeableUnits (#1136)", () => {
  it("lists every squad type, then the mechs, then every species, from the handler's own deps", () => {
    const listed = placeableUnits(depsWith(true));
    expect(listed.map((entry) => entry.kind)).toEqual([
      ...SQUAD_TYPES.map(() => "squad"),
      "mech",
      ...Object.keys(BUG_SPECIES).map(() => "bug"),
    ]);
    expect(listed).toContainEqual({
      kind: "bug",
      id: "swarmer",
      name: "Swarmer",
    });
    expect(listed).toContainEqual({
      kind: "squad",
      id: "rifle",
      name: "Rifle Squad",
    });
    expect(listed).toContainEqual({
      kind: "mech",
      id: "starter",
      name: "Mech (starter)",
    });
  });
});
