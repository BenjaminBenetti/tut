import { describe, expect, it } from "vitest";

import { GAME_STATE_SCHEMA_VERSION } from "../model/game-state";
import { MigrationRunner } from "../service/migration-runner";
import { GAME_STATE_MIGRATIONS } from "./migrations";

describe("GAME_STATE_MIGRATIONS", () => {
  it("forms an unbroken chain ending at the current schema version", () => {
    expect(
      () =>
        new MigrationRunner(GAME_STATE_MIGRATIONS, GAME_STATE_SCHEMA_VERSION),
    ).not.toThrow();
    const last = GAME_STATE_MIGRATIONS.at(-1);
    expect(last?.to).toBe(GAME_STATE_SCHEMA_VERSION);
  });

  it("v1 → v2 adds empty spread cooldowns and keeps everything else", () => {
    const step = GAME_STATE_MIGRATIONS[0];
    expect(step?.from).toBe(1);
    const v1 = {
      meta: { seed: 7 },
      overworld: { day: 3, map: {} },
      roster: {},
    };
    const before = JSON.parse(JSON.stringify(v1)) as unknown;
    expect(step?.apply(v1)).toEqual({
      meta: { seed: 7 },
      overworld: { day: 3, map: {}, spreadCooldowns: {} },
      roster: {},
    });
    expect(v1).toEqual(before);
  });

  it("v4 → v5 adds a zero threat offset and keeps everything else", () => {
    const step = GAME_STATE_MIGRATIONS.find((m) => m.from === 4);
    expect(step?.to).toBe(5);
    const v4 = {
      meta: { seed: 7 },
      overworld: { day: 3, threat: 40 },
      roster: {},
    };
    expect(step?.apply(v4)).toEqual({
      meta: { seed: 7 },
      overworld: { day: 3, threat: 40, threatOffset: 0 },
      roster: {},
    });
    expect(() => step?.apply({ meta: {} })).toThrow(/overworld/);
  });

  it("v8 → v9 fills unit charges from their templates and leaves the rest alone", () => {
    const step = GAME_STATE_MIGRATIONS.find((m) => m.from === 8);
    expect(step?.to).toBe(9);
    const v8 = {
      meta: { seed: 1 },
      activeMission: {
        templates: { rifle: { charges: 3 }, swarmer: {} },
        units: [
          { id: "u1", templateId: "rifle" },
          { id: "u2", templateId: "swarmer" },
          { id: "u3", templateId: "rifle", charges: 1 },
        ],
      },
    };
    expect(step?.apply(v8)).toEqual({
      meta: { seed: 1 },
      activeMission: {
        templates: { rifle: { charges: 3 }, swarmer: {} },
        units: [
          { id: "u1", templateId: "rifle", charges: 3 },
          { id: "u2", templateId: "swarmer" },
          { id: "u3", templateId: "rifle", charges: 1 },
        ],
      },
    });
    const idle = { meta: { seed: 1 }, overworld: {} };
    expect(step?.apply(idle)).toEqual(idle);
  });

  it("v1 → v2 rejects a state without an overworld slice", () => {
    expect(() => GAME_STATE_MIGRATIONS[0]?.apply({ meta: {} })).toThrow(
      /overworld/,
    );
  });

  it("v2 → v3 gives every city a scale: the seed's for shipped ids, the default otherwise", () => {
    const step = GAME_STATE_MIGRATIONS[1];
    expect(step?.from).toBe(2);
    expect(step?.to).toBe(3);
    const v2 = {
      meta: { seed: 7 },
      overworld: {
        day: 3,
        map: {
          regions: [],
          cities: [
            { id: "perth", name: "Perth", infestation: 5 },
            { id: "london", name: "London", infestation: 0 },
            { id: "atlantis", name: "Atlantis", infestation: 0 },
            { id: "kept", name: "Kept", infestation: 0, scale: "rural" },
          ],
        },
        spreadCooldowns: {},
      },
      roster: {},
    };
    const before = JSON.parse(JSON.stringify(v2)) as unknown;
    const migrated = step?.apply(v2) as typeof v2 & {
      overworld: { map: { cities: { id: string; scale: string }[] } };
    };
    expect(
      migrated.overworld.map.cities.map((city) => [city.id, city.scale]),
    ).toEqual([
      ["perth", "town"],
      ["london", "city"],
      ["atlantis", "city"],
      ["kept", "rural"],
    ]);
    expect(migrated.overworld.map.cities[0]).toMatchObject({
      name: "Perth",
      infestation: 5,
    });
    expect(migrated.overworld.spreadCooldowns).toEqual({});
    expect(v2).toEqual(before);
  });

  it("v2 → v3 rejects a state without a city list", () => {
    const step = GAME_STATE_MIGRATIONS[1];
    expect(() => step?.apply({ meta: {} })).toThrow(/overworld/);
    expect(() => step?.apply({ meta: {}, overworld: { map: {} } })).toThrow(
      /cities/,
    );
  });

  it("v3 → v4 adds an empty graveyard and keeps everything else", () => {
    const step = GAME_STATE_MIGRATIONS.find((m) => m.from === 3)!;
    const roster = { squads: [1], mechs: [], savedLoadouts: [] };
    const state = { meta: {}, overworld: {}, roster, economy: { credits: 1 } };
    const out = step.apply(state) as typeof state & {
      roster: { graveyard: unknown[] };
    };
    expect(out.roster).toEqual({ ...roster, graveyard: [] });
    expect(out.economy).toBe(state.economy);
    expect(state.roster).toEqual(roster);
  });

  it("v3 → v4 keeps a graveyard that is already there and rejects a state without a roster", () => {
    const step = GAME_STATE_MIGRATIONS.find((m) => m.from === 3)!;
    const graveyard = [{ kind: "squad", name: "A", day: 1, missionId: "m" }];
    const state = { roster: { squads: [], graveyard } };
    expect(step.apply(state)).toBe(state);
    expect(() => step.apply({ overworld: {} })).toThrow(/roster/);
  });

  it("v5 → v6 leaves a save without a mission unchanged and drops a stray activeMission", () => {
    const step = GAME_STATE_MIGRATIONS[4];
    expect(step?.from).toBe(5);
    expect(step?.to).toBe(6);
    const v5 = {
      meta: { seed: 7 },
      overworld: { day: 3, map: {}, threatOffset: 0 },
      roster: { graveyard: [] },
    };
    const before = JSON.parse(JSON.stringify(v5)) as unknown;
    expect(step?.apply(v5)).toEqual(v5);
    expect(step?.apply({ ...v5, activeMission: null })).toEqual(v5);
    expect(v5).toEqual(before);
    expect(() => step?.apply({ meta: {} })).toThrow(/overworld/);
  });

  it("v6 → v7 drops meta.debug and leaves a save without it untouched", () => {
    const step = GAME_STATE_MIGRATIONS.find((m) => m.from === 6)!;
    const meta = {
      seed: 1,
      rng: {},
      ids: {},
      createdAt: "x",
      debug: { threatEscalationMultiplier: 10 },
    };
    const state = { meta, overworld: {}, roster: {}, economy: {} };
    const out = step.apply(state) as { meta: Record<string, unknown> };
    expect("debug" in out.meta).toBe(false);
    expect(out.meta.seed).toBe(1);
    const clean = { meta: { seed: 2 }, overworld: {} };
    expect(step.apply(clean)).toBe(clean);
    expect(() => step.apply({ overworld: {} })).toThrow(/meta/);
  });

  it("v7 → v8 gives a mission in progress an empty extracted list and leaves the rest alone", () => {
    const step = GAME_STATE_MIGRATIONS.find((m) => m.from === 7);
    expect(step?.from).toBe(7);
    expect(step?.to).toBe(8);
    const idle = { meta: { seed: 7 }, overworld: { day: 3 }, roster: {} };
    expect(step?.apply(idle)).toBe(idle);
    const v6 = {
      ...idle,
      activeMission: { missionId: "m", turn: 2, units: [] },
    };
    expect(step?.apply(v6)).toEqual({
      ...v6,
      activeMission: { ...v6.activeMission, extracted: [] },
    });
    const already = {
      ...idle,
      activeMission: { missionId: "m", extracted: ["unit-1"] },
    };
    expect(step?.apply(already)).toBe(already);
    expect(() => step?.apply({ meta: {} })).toThrow(/overworld/);
  });

  it("v9 → v10 gives a mission in progress its spawn clocks and leaves the rest alone", () => {
    const step = GAME_STATE_MIGRATIONS.find((m) => m.from === 9);
    expect(step?.to).toBe(10);
    const idle = { meta: { seed: 7 }, overworld: { day: 3 }, roster: {} };
    expect(step?.apply(idle)).toBe(idle);
    const v8 = {
      ...idle,
      activeMission: {
        missionId: "m",
        spawners: [
          { id: "spawner-1", hp: 20 },
          { id: "spawner-2", hp: 0, timer: 1 },
        ],
      },
    };
    expect(step?.apply(v8)).toEqual({
      ...idle,
      activeMission: {
        missionId: "m",
        difficulty: 1,
        threat: 0,
        spawners: [
          { id: "spawner-1", hp: 20, timer: 3 },
          { id: "spawner-2", hp: 0, timer: 1 },
        ],
      },
    });
    const already = {
      ...idle,
      activeMission: {
        missionId: "m",
        difficulty: 4,
        threat: 55,
        spawners: [],
      },
    };
    expect(step?.apply(already)).toEqual(already);
    expect(() => step?.apply({ meta: {} })).toThrow(/overworld/);
  });

  it("v10 → v11 gives a mission in progress empty vision for both sides", () => {
    const v10 = {
      meta: {},
      activeMission: { missionId: "m", units: [], spawners: [] },
    };
    const migrated = GAME_STATE_MIGRATIONS.find((m) => m.to === 11)?.apply(v10);
    expect(migrated).toEqual({
      ...v10,
      activeMission: {
        ...v10.activeMission,
        vision: {
          tdf: { visible: [], explored: [], spotted: [] },
          bugs: { visible: [], explored: [], spotted: [] },
        },
      },
    });
  });

  it("v10 → v11 leaves a campaign with no mission, and any existing vision, alone", () => {
    const step = GAME_STATE_MIGRATIONS.find((m) => m.to === 11);
    expect(step?.apply({ meta: {} })).toEqual({ meta: {} });
    const already = {
      meta: {},
      activeMission: { missionId: "m", vision: { tdf: {}, bugs: {} } },
    };
    expect(step?.apply(already)).toEqual(already);
  });
});

// ===========================================
// v11 → v12: weapons per unit (#532)
// ===========================================

describe("v11 → v12", () => {
  /** A v11 save mid-mission: one template with a single weapon and a pool. */
  const v11 = {
    meta: { version: 11 },
    activeMission: {
      templates: {
        "squad:s1": {
          id: "squad:s1",
          name: "Rifle Squad",
          weapon: { range: 8, accuracy: 65, damage: 3, armorPen: 0 },
          charges: 3,
        },
        "bug:swarmer": {
          id: "bug:swarmer",
          name: "Swarmer",
          weapon: { range: 1, accuracy: 60, damage: 3, armorPen: 0 },
        },
      },
      units: [
        { id: "unit-1", templateId: "squad:s1", charges: 1 },
        { id: "unit-2", templateId: "bug:swarmer" },
      ],
    },
  };

  /** The shape the v12 step produces, as much of it as these cases read. */
  interface V12 {
    activeMission: {
      templates: Record<
        string,
        {
          weapons: { id: string; name: string; charges?: number }[];
          weapon?: unknown;
          charges?: unknown;
        }
      >;
      units: { charges?: Record<string, number> }[];
    };
  }

  /** Runs just the v11 → v12 step, the way the other cases here do. */
  const step = (state: unknown): V12 =>
    GAME_STATE_MIGRATIONS.find((m) => m.to === 12)?.apply(state) as V12;

  it("turns the single weapon into a one-entry list, keeping its pool", () => {
    const out = step(v11);
    const templates = out.activeMission.templates;
    expect(templates["squad:s1"]?.weapons).toEqual([
      {
        id: "primary",
        name: "Attack",
        profile: { range: 8, accuracy: 65, damage: 3, armorPen: 0 },
        charges: 3,
      },
    ]);
    // The old scalar fields are gone, not left beside the new list.
    expect("weapon" in (templates["squad:s1"] ?? {})).toBe(false);
    expect("charges" in (templates["squad:s1"] ?? {})).toBe(false);
    // A template with no pool keeps none.
    expect(templates["bug:swarmer"]?.weapons[0]?.charges).toBeUndefined();
  });

  it("files a unit's remaining charges under that weapon", () => {
    const out = step(v11);
    expect(out.activeMission.units[0]?.charges).toEqual({ primary: 1 });
    // A unit that never had a pool still has none.
    expect("charges" in (out.activeMission.units[1] ?? {})).toBe(false);
  });

  it("leaves a save with no mission in progress alone", () => {
    const idle = { meta: { version: 11 }, activeMission: undefined };
    expect(() => step(idle)).not.toThrow();
  });
});
