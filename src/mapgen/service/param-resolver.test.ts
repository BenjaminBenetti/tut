import { describe, expect, it } from "vitest";

import { HookKinds } from "../model/hook";
import type { MapGenParams } from "../model/map-recipe";
import { PassMask } from "../model/pass-mask";
import { createDefaultRegistries } from "./default-registries";
import { resolveMapGenParams } from "./param-resolver";

const registries = createDefaultRegistries();

const BASE: MapGenParams = {
  archetype: "settlement",
  biome: "temperate",
  settlement: "town",
  size: "medium",
  hooks: [
    { kind: HookKinds.DEPLOY, count: 1, requiredPass: PassMask.ALL },
    {
      kind: HookKinds.EGG_SPAWNER,
      count: 3,
      requiredPass: PassMask.INFANTRY,
      minDistanceFromDeploy: 12,
    },
  ],
};

describe("resolveMapGenParams", () => {
  it("expands a size preset and looks up definitions", () => {
    const resolved = resolveMapGenParams(BASE, registries);
    expect(resolved.width).toBe(48);
    expect(resolved.depth).toBe(48);
    expect(resolved.biome.id).toBe("temperate");
    expect(resolved.settlement.id).toBe("town");
    expect(resolved.hooks).toBe(BASE.hooks);
    expect(resolved.archetype).toBe("settlement");
  });

  it("resolves every preset for every biome and settlement", () => {
    for (const biome of registries.biomes.ids) {
      for (const settlement of registries.settlements.ids) {
        for (const size of registries.mapSizes.ids) {
          const resolved = resolveMapGenParams(
            {
              ...BASE,
              biome: biome as MapGenParams["biome"],
              settlement: settlement as MapGenParams["settlement"],
              size: size as MapGenParams["size"],
            },
            registries,
          );
          expect(resolved.biome.id).toBe(biome);
          expect(resolved.settlement.id).toBe(settlement);
        }
      }
    }
  });

  it("passes explicit dimensions through", () => {
    const resolved = resolveMapGenParams(
      { ...BASE, size: { width: 40, depth: 24 } },
      registries,
    );
    expect(resolved.width).toBe(40);
    expect(resolved.depth).toBe(24);
  });

  it("names the unknown id when a lookup fails", () => {
    expect(() =>
      resolveMapGenParams(
        { ...BASE, biome: "lunar" as MapGenParams["biome"] },
        registries,
      ),
    ).toThrow('Unknown biome id "lunar"');
    expect(() =>
      resolveMapGenParams(
        { ...BASE, settlement: "megacity" as MapGenParams["settlement"] },
        registries,
      ),
    ).toThrow('Unknown settlement id "megacity"');
    expect(() =>
      resolveMapGenParams(
        { ...BASE, size: "huge" as MapGenParams["size"] },
        registries,
      ),
    ).toThrow('Unknown map size id "huge"');
    expect(() =>
      resolveMapGenParams(
        { ...BASE, archetype: "hive" as MapGenParams["archetype"] },
        registries,
      ),
    ).toThrow('Unsupported map archetype "hive"');
  });

  it("rejects dimensions outside the supported range or non-integers", () => {
    for (const size of [
      { width: 8, depth: 32 },
      { width: 32, depth: 300 },
      { width: 32.5, depth: 32 },
    ]) {
      expect(() => resolveMapGenParams({ ...BASE, size }, registries)).toThrow(
        /Map (width|depth) must be an integer/,
      );
    }
  });

  it("rejects hook requirements no placer could satisfy", () => {
    expect(() =>
      resolveMapGenParams(
        {
          ...BASE,
          hooks: [{ kind: "deploy", count: -1, requiredPass: PassMask.ALL }],
        },
        registries,
      ),
    ).toThrow(/count must be a non-negative integer/);
    expect(() =>
      resolveMapGenParams(
        {
          ...BASE,
          hooks: [
            {
              kind: "egg-spawner",
              count: 1,
              requiredPass: PassMask.INFANTRY,
              minDistanceFromDeploy: -3,
            },
          ],
        },
        registries,
      ),
    ).toThrow(/minDistanceFromDeploy must be non-negative/);
  });
});
