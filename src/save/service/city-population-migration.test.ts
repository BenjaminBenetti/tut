/// <reference types="node" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { EARTH_MAP } from "../../overworld/data/earth-map";
import { DEFAULT_CITY_POPULATION } from "../../overworld/service/earth-map-builder";
import { CITY_POPULATION_SNAPSHOT } from "../data/city-population-snapshot";
import { GAME_STATE_MIGRATIONS } from "../data/migrations";
import { GAME_STATE_SCHEMA_VERSION } from "../model/game-state";
import { ADD_CITY_POPULATION } from "./city-population-migration";
import { MigrationRunner } from "./migration-runner";

/** The frozen v1 autosave the end-to-end suite also loads. */
const V1_ENVELOPE = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../../../e2e/fixtures/autosave-v1.json", import.meta.url),
    ),
    "utf8",
  ),
) as { schemaVersion: number; savedAt: string; state: unknown };

/** Just the fields the tests read out of a migrated state. */
interface MigratedState {
  readonly overworld: {
    readonly map: {
      readonly cities: readonly { id: string; population?: number }[];
    };
  };
}

describe("ADD_CITY_POPULATION (v23 → v24, #1154)", () => {
  it("fills the frozen v1 save's cities from the snapshot through the whole chain", () => {
    const runner = new MigrationRunner(
      GAME_STATE_MIGRATIONS,
      GAME_STATE_SCHEMA_VERSION,
    );
    const result = runner.migrate(V1_ENVELOPE);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.schemaVersion).toBe(GAME_STATE_SCHEMA_VERSION);
    const cities = (result.value.state as MigratedState).overworld.map.cities;
    expect(cities).toHaveLength(51);
    for (const city of cities) {
      expect(city.population, city.id).toBe(CITY_POPULATION_SNAPSHOT[city.id]);
    }
  });

  it("matches the shipped Earth today, so a migrated save and a new game agree", () => {
    for (const city of EARTH_MAP.cities) {
      expect(CITY_POPULATION_SNAPSHOT[city.id], city.id).toBe(city.population);
    }
    expect(Object.keys(CITY_POPULATION_SNAPSHOT)).toHaveLength(51);
  });

  it("keeps a population already there, defaults an unknown city and leaves the rest alone", () => {
    const before = {
      meta: { seed: 1 },
      overworld: {
        day: 3,
        map: {
          regions: [{ id: "r" }],
          cities: [
            { id: "tokyo", infestation: 4 },
            { id: "atlantis", infestation: 0 },
            { id: "lagos", infestation: 9, population: 5 },
          ],
        },
        missions: [{ id: "m" }],
      },
      economy: { credits: 7 },
    };
    const serialized = JSON.stringify(before);
    const after = ADD_CITY_POPULATION.apply(before) as typeof before &
      MigratedState;
    expect(after.overworld.map.cities).toEqual([
      { id: "tokyo", infestation: 4, population: 37_000_000 },
      { id: "atlantis", infestation: 0, population: DEFAULT_CITY_POPULATION },
      { id: "lagos", infestation: 9, population: 5 },
    ]);
    expect(after.overworld.map.regions).toBe(before.overworld.map.regions);
    expect(after.overworld.missions).toBe(before.overworld.missions);
    expect(after.economy).toBe(before.economy);
    expect(JSON.stringify(before)).toBe(serialized);
  });

  it("rejects a state without a city list", () => {
    expect(() => ADD_CITY_POPULATION.apply("nope")).toThrow(/overworld/);
    expect(() => ADD_CITY_POPULATION.apply({ overworld: { map: {} } })).toThrow(
      /cities/,
    );
    expect(() =>
      ADD_CITY_POPULATION.apply({ overworld: { map: { cities: [{}] } } }),
    ).toThrow(/id/);
  });
});
