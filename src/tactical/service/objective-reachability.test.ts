import { describe, expect, it } from "vitest";

import { MISSION_TYPES } from "../../content/data/mission-types";
import type { Mission } from "../../overworld/model/mission";
import { createDefaultRegistries } from "../../mapgen/service/default-registries";
import { generateTacticalMap } from "../../mapgen/service/generate-tactical-map";
import { missionToMapRecipe } from "../../mapgen/service/mission-map-recipe-adapter";
import { UNIT_TUNING } from "../data/unit-tuning";
import { objectiveApproach } from "./map-assessment-service";

// ===========================================
// Fixtures
// ===========================================

/** Every settlement and size a generated mission can ask for. */
const SETTLEMENTS = ["rural", "town", "city"] as const;
const SIZES = ["small", "medium"] as const;
const SEEDS = 4;

/**
 * Seeds for the firing-position sweep alone. Before #544 a spawner landed
 * where no mech could shoot it on about one map in seventy-five, so four
 * seeds passed that guarantee on luck; the other assertions here keep
 * their original scope.
 */
const FIRING_SEEDS = 12;

/**
 * Steps a class covers in one turn at its worst: infantry is fixed, and a
 * mech's move is `clamp(baseMove + mobility, minMove, maxMove)`, so the
 * floor is `minMove` however poor its legs.
 */
const INFANTRY_STEPS_PER_TURN =
  UNIT_TUNING.infantry.move * UNIT_TUNING.infantry.maxAp;
const MECH_STEPS_PER_TURN = UNIT_TUNING.mech.minMove * UNIT_TUNING.mech.maxAp;

/**
 * Turns a player should not have to exceed before it can open fire on the
 * primary objective. Ten is deliberately loose — the point is to catch a
 * map or tuning change that puts an objective out of practical reach, not
 * to pin the current numbers, which sit far below it.
 */
const TURNS_TO_ENGAGE = 10;

/** A clearance mission on the given map parameters. */
function mission(seed: string, settlement: string, size: string): Mission {
  return {
    id: "mission-probe",
    typeId: "infestation-clearance",
    cityId: "lagos",
    difficulty: 5,
    mapParams: {
      biome: "temperate",
      settlement,
      size,
      seed,
    } as Mission["mapParams"],
    rewards: { credits: 1000 },
    createdDay: 1,
    expiresDay: 9,
    ignorePenalty: 10,
  };
}

/** Every shipped settlement × size × seed, as generated maps. */
function shippedMaps(): {
  label: string;
  map: ReturnType<typeof generateTacticalMap>;
}[] {
  const registries = createDefaultRegistries();
  const maps = [];
  for (const settlement of SETTLEMENTS) {
    for (const size of SIZES) {
      for (let seed = 0; seed < SEEDS; seed++) {
        const label = `${settlement}/${size}/${String(seed)}`;
        const recipe = missionToMapRecipe(
          mission(`reach-${label}`, settlement, size),
          MISSION_TYPES["infestation-clearance"],
          registries,
        );
        expect(recipe.ok, `${label} recipe`).toBe(true);
        if (!recipe.ok) continue;
        maps.push({
          label,
          map: generateTacticalMap(recipe.value, { registries }),
        });
      }
    }
  }
  return maps;
}

// ===========================================
// Tests
// ===========================================

describe("objective reachability on shipped mission maps (#345)", () => {
  const maps = shippedMaps();

  it("generates an objective on every map, so there is something to destroy", () => {
    expect(maps).not.toHaveLength(0);
    for (const { label, map } of maps) {
      expect(
        map.hooks.objectives.length,
        `${label} objectives`,
      ).toBeGreaterThan(0);
    }
  });

  it("puts every spawner within a walk of somewhere it can be shot from, for both classes", () => {
    // The failure this guards is a mission no player can finish except by
    // extracting: an objective nothing can get a shot at.
    for (const { label, map } of maps) {
      for (const approach of objectiveApproach(map)) {
        const at = `${label} obj${String(approach.objective)}`;
        expect(
          approach.infantryFiringSteps,
          `${at} infantry firing`,
        ).toBeGreaterThanOrEqual(0);
        expect(
          approach.mechFiringSteps,
          `${at} mech firing`,
        ).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("keeps every spawner shootable across a wider spread of seeds (#544)", () => {
    for (const settlement of SETTLEMENTS) {
      for (const size of SIZES) {
        for (let seed = 0; seed < FIRING_SEEDS; seed++) {
          const label = `${settlement}/${size}/${String(seed)}`;
          const recipe = missionToMapRecipe(
            mission(`firing-${label}`, settlement, size),
            MISSION_TYPES["infestation-clearance"],
            createDefaultRegistries(),
          );
          expect(recipe.ok, `${label} recipe`).toBe(true);
          if (!recipe.ok) continue;
          const map = generateTacticalMap(recipe.value, {
            registries: createDefaultRegistries(),
          });
          for (const approach of objectiveApproach(map)) {
            const at = `${label} obj${String(approach.objective)}`;
            expect(
              approach.mechFiringSteps,
              `${at} mech`,
            ).toBeGreaterThanOrEqual(0);
            expect(
              approach.infantryFiringSteps,
              `${at} infantry`,
            ).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  }, 30_000);

  it("starts the nearest spawner inside a turn budget a player would sit through", () => {
    // The reported failure (#345) was a force that spent 40 turns without
    // ever getting a shot off. This is the guard against a map or a
    // movement change that makes that the honest state of the game.
    for (const { label, map } of maps) {
      const approaches = objectiveApproach(map);
      const infantryTurns = Math.min(
        ...approaches.map((a) =>
          Math.ceil(a.infantryFiringSteps / INFANTRY_STEPS_PER_TURN),
        ),
      );
      const mechTurns = Math.min(
        ...approaches.map((a) =>
          Math.ceil(a.mechFiringSteps / MECH_STEPS_PER_TURN),
        ),
      );
      expect(
        infantryTurns,
        `${label} infantry turns to first shot`,
      ).toBeLessThanOrEqual(TURNS_TO_ENGAGE);
      expect(
        mechTurns,
        `${label} mech turns to first shot`,
      ).toBeLessThanOrEqual(TURNS_TO_ENGAGE);
    }
  });

  it("leaves infantry a route onto the tile itself, which is what planting charges needs", () => {
    // Mechs are not held to this: an objective indoors has no mech route
    // to the tile, by design, and the mech brings it down with fire.
    for (const { label, map } of maps) {
      for (const approach of objectiveApproach(map)) {
        expect(
          approach.infantrySteps,
          `${label} obj${String(approach.objective)} infantry route to the tile`,
        ).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
