/// <reference types="node" />
import { describe, expect, it } from "vitest";

import { BIOME_IDS } from "../../content/model/biome-id";
import { SETTLEMENT_SCALES } from "../../content/model/settlement-scale";
import { DEFAULT_MISSION_HOOKS } from "../data/hook-requirements";
import type { MapRecipe, MapSize } from "../model/map-recipe";
import { MAP_SIZE_PRESETS } from "../model/map-recipe";
import { createDefaultRegistries } from "./default-registries";
import { generateTacticalMapWithDiagnostics } from "./generate-tactical-map";

/**
 * Set `MAPGEN_WIDE=1` to run. Twenty seeds per biome × scale × size,
 * including two explicit sizes the presets do not cover (1200 maps, about
 * 70 s). Failures are collected with their seeds instead of stopping at
 * the first, so one run reports every bad combination. This is the
 * pre-merge check for generator changes; the 216-map sweep beside it is
 * what every `pnpm test` runs.
 */
const WIDE = process.env.MAPGEN_WIDE === "1";

const SEEDS_PER_COMBO = 20;

const SIZES: readonly MapSize[] = [
  ...MAP_SIZE_PRESETS,
  { width: 40, depth: 56 },
  { width: 96, depth: 96 },
];

const WIDE_TIMEOUT_MS = 600_000;

describe.skipIf(!WIDE)("generation wide sweep (MAPGEN_WIDE=1)", () => {
  it(
    "generates a valid map for every combination and seed, with no relocations",
    () => {
      const registries = createDefaultRegistries();
      const failures: string[] = [];
      let generations = 0;
      let relocations = 0;
      for (const size of SIZES) {
        for (const biome of BIOME_IDS) {
          for (const settlement of SETTLEMENT_SCALES) {
            for (let i = 0; i < SEEDS_PER_COMBO; i++) {
              const label = `${JSON.stringify(size)}/${biome}/${settlement}/${i}`;
              const recipe: MapRecipe = {
                seed: `wide-${label}`,
                params: {
                  archetype: "settlement",
                  biome,
                  settlement,
                  size,
                  hooks: DEFAULT_MISSION_HOOKS,
                },
              };
              try {
                const { diagnostics } = generateTacticalMapWithDiagnostics(
                  recipe,
                  { registries },
                );
                relocations += diagnostics.notes.filter(
                  (n) =>
                    n.pass === "connectivity" &&
                    n.message.includes("relocated"),
                ).length;
              } catch (error) {
                failures.push(`${label}: ${(error as Error).message}`);
              }
              generations++;
            }
          }
        }
      }
      expect(generations).toBe(
        SIZES.length *
          BIOME_IDS.length *
          SETTLEMENT_SCALES.length *
          SEEDS_PER_COMBO,
      );
      expect(failures, failures.join("\n")).toEqual([]);
      expect(relocations).toBe(0);
    },
    WIDE_TIMEOUT_MS,
  );
});
