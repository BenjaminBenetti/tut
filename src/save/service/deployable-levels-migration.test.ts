/// <reference types="node" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { isDeployableLevel } from "../../overworld/model/deployable-level";
import { GAME_STATE_MIGRATIONS } from "../data/migrations";
import { GAME_STATE_SCHEMA_VERSION } from "../model/game-state";
import { ADD_DEPLOYABLE_LEVELS } from "./deployable-levels-migration";
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
      readonly cities: readonly {
        id: string;
        infestation: number;
        detected?: boolean;
      }[];
    };
    readonly deployables: readonly { id: string; level?: number }[];
  };
}

describe("ADD_DEPLOYABLE_LEVELS (v24 → v25, #1155)", () => {
  it("migrates the frozen v1 save through the whole chain: infested cities detected, installations level 1", () => {
    const runner = new MigrationRunner(
      GAME_STATE_MIGRATIONS,
      GAME_STATE_SCHEMA_VERSION,
    );
    const result = runner.migrate(V1_ENVELOPE);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.schemaVersion).toBe(GAME_STATE_SCHEMA_VERSION);
    const { map, deployables } = (result.value.state as MigratedState)
      .overworld;
    expect(map.cities.length).toBeGreaterThan(0);
    expect(map.cities.some((city) => city.infestation > 0)).toBe(true);
    for (const city of map.cities) {
      expect(city.detected, city.id).toBe(city.infestation > 0);
    }
    for (const deployable of deployables) {
      expect(isDeployableLevel(deployable.level), deployable.id).toBe(true);
    }
  });

  it("fills level 1 and detection, keeps fields already there and leaves the rest alone", () => {
    const before = {
      meta: { seed: 1 },
      overworld: {
        day: 3,
        map: {
          regions: [{ id: "r" }],
          cities: [
            { id: "tokyo", infestation: 4 },
            { id: "atlantis", infestation: 0 },
            { id: "lagos", infestation: 9, detected: false },
          ],
        },
        deployables: [
          { id: "d1", typeId: "sensor-array", online: true },
          { id: "d2", typeId: "bank", online: false, level: 3 },
        ],
        missions: [{ id: "m" }],
      },
      economy: { credits: 7 },
      activeMission: { map: { cities: [{ id: "frozen", infestation: 1 }] } },
    };
    const serialized = JSON.stringify(before);
    const after = ADD_DEPLOYABLE_LEVELS.apply(before) as typeof before &
      MigratedState;
    expect(after.overworld.map.cities).toEqual([
      { id: "tokyo", infestation: 4, detected: true },
      { id: "atlantis", infestation: 0, detected: false },
      { id: "lagos", infestation: 9, detected: false },
    ]);
    expect(after.overworld.deployables).toEqual([
      { id: "d1", typeId: "sensor-array", online: true, level: 1 },
      { id: "d2", typeId: "bank", online: false, level: 3 },
    ]);
    expect(after.overworld.map.regions).toBe(before.overworld.map.regions);
    expect(after.overworld.missions).toBe(before.overworld.missions);
    expect(after.economy).toBe(before.economy);
    expect(after.activeMission).toBe(before.activeMission);
    expect(JSON.stringify(before)).toBe(serialized);
  });

  it("rejects a state without the slices it reshapes", () => {
    expect(() => ADD_DEPLOYABLE_LEVELS.apply({})).toThrow(/overworld/);
    expect(() =>
      ADD_DEPLOYABLE_LEVELS.apply({ overworld: { deployables: [] } }),
    ).toThrow(/cities/);
    expect(() =>
      ADD_DEPLOYABLE_LEVELS.apply({ overworld: { map: { cities: [] } } }),
    ).toThrow(/deployables/);
    expect(() =>
      ADD_DEPLOYABLE_LEVELS.apply({
        overworld: { map: { cities: [{ id: "x" }] }, deployables: [] },
      }),
    ).toThrow(/infestation/);
  });

  it("is the step from 24 to 25", () => {
    expect(ADD_DEPLOYABLE_LEVELS.from).toBe(24);
    expect(ADD_DEPLOYABLE_LEVELS.to).toBe(25);
  });
});
