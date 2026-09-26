import { describe, expect, it } from "vitest";

import { BUG_SPECIES } from "../../bugs/data/species";
import { MISSION_TYPES } from "../../content/data/mission-types";
import { ok } from "../../core/model/result";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { PassMask } from "../../mapgen/model/pass-mask";
import { createDefaultRegistries } from "../../mapgen/service/default-registries";
import { hatchTiles, snapshotMap } from "../../mapgen/service/hatch-space";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { Deployment } from "../../overworld/model/deployment";
import type { Mission } from "../../overworld/model/mission";
import { MECH_RATING_TUNING } from "../../roster/data/mech-rating-tuning";
import { STARTER_PARTS } from "../../roster/data/parts";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { UPGRADE_TUNING } from "../../roster/data/upgrade-tuning";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import { StaticPartCatalogue } from "../../roster/repository/static-part-catalogue";
import { validateLoadout } from "../../roster/service/loadout-validation-service";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import { CIVILIAN_TUNING } from "../data/civilian-tuning";
import { GARRISON_TUNING } from "../data/garrison-tuning";
import { GENERATOR_TUNING } from "../data/generator-tuning";
import { SPAWN_TUNING } from "../data/spawn-tuning";
import { UNIT_TUNING } from "../data/unit-tuning";
import type { StorySetupRule } from "../model/story-setup-rule";
import type { TacticalState } from "../model/tactical-state";
import type { MissionStartDeps } from "./mission-start-service";
import { startTacticalMission } from "./mission-start-service";
import { decidingObjectives } from "./objectives/objective-status";

// ===========================================
// Fixtures
// ===========================================

const PARTS = new StaticPartCatalogue(STARTER_PARTS);

/** The shipped start content with fresh ids and the shipped species. */
function deps(overrides: Partial<MissionStartDeps> = {}): MissionStartDeps {
  return {
    missionTypes: MISSION_TYPES,
    squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
    sheetFor: (mech) => {
      const result = validateLoadout(
        mech.loadout,
        PARTS,
        MECH_RATING_TUNING,
        UPGRADE_TUNING,
      );
      return result.ok ? result.value : undefined;
    },
    unitTuning: UNIT_TUNING,
    spawnTuning: SPAWN_TUNING,
    garrison: GARRISON_TUNING,
    generator: GENERATOR_TUNING,
    civilian: CIVILIAN_TUNING,
    ids: new SequentialIdGenerator(),
    registries: createDefaultRegistries(),
    species: Object.values(BUG_SPECIES),
    ...overrides,
  };
}

/**
 * A new campaign offering one d3 clearance on its first infested city,
 * as Live Specimen when `story` is set, on the map seed `seed`.
 */
function campaign(
  seed: number,
  story: boolean,
): { state: GameState; deployment: Deployment } {
  const base = createNewGame(
    { seed: 3, createdAt: "2026-09-26T00:00:00.000Z" },
    {
      map: EARTH_MAP,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      starterRoster: STARTER_ROSTER,
      newGameTuning: NEW_GAME_TUNING,
      threatTuning: THREAT_TUNING,
      economyTuning: ECONOMY_TUNING,
    },
  );
  const city = base.overworld.map.cities.find((c) => c.infestation > 0);
  if (!city) throw new Error("fixture needs an infested city");
  const region = base.overworld.map.regions.find((r) => r.id === city.regionId);
  if (!region) throw new Error("fixture needs a region");
  const mission: Mission = {
    id: "mission-1",
    typeId: "infestation-clearance",
    cityId: city.id,
    difficulty: 3,
    mapParams: {
      biome: city.biome ?? region.biome,
      settlement: city.scale,
      size: "small",
      seed: `specimen-${String(seed)}`,
    },
    rewards: { credits: 900, techPoints: 0 },
    createdDay: 1,
    expiresDay: 6,
    ignorePenalty: 10,
    ...(story ? { storyId: "live-specimen", pinned: true, act: "act-1" } : {}),
  };
  return {
    state: { ...base, overworld: { ...base.overworld, missions: [mission] } },
    deployment: {
      missionId: mission.id,
      squadIds: base.roster.squads.map((s) => s.id),
      mechIds: base.roster.mechs.map((m) => m.id),
    },
  };
}

/** The mission started from `campaign(seed, story)` under `startDeps`. */
function started(
  seed: number,
  story: boolean,
  startDeps: MissionStartDeps = deps(),
): TacticalState {
  const { state, deployment } = campaign(seed, story);
  const result = startTacticalMission(
    state,
    "mission-1",
    deployment,
    startDeps,
  );
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  const mission = result.value.activeMission;
  if (mission === undefined) throw new Error("no active mission");
  return mission;
}

/** `x,y,z` for a coordinate. */
function keyOf(tile: { x: number; y: number; z: number }): string {
  return `${String(tile.x)},${String(tile.y)},${String(tile.z)}`;
}

// ===========================================
// The seam
// ===========================================

describe("startTacticalMission's story setup (ADR 0013 §2.5)", () => {
  it("runs the story's rule on what the type's rule set up, and only for its story", () => {
    const seen: TacticalState[] = [];
    const spy: StorySetupRule = {
      storyId: "live-specimen",
      setup(state) {
        seen.push(state);
        return ok({ ...state, turn: 7 });
      },
    };
    const startDeps = deps({ storySetupRules: { "live-specimen": spy } });

    const plain = started(1, false, startDeps);
    expect(seen).toEqual([]);
    expect(plain.turn).toBe(1);

    const story = started(1, true, startDeps);
    expect(seen).toHaveLength(1);
    // The clearance's nests were already standing when the story ran.
    expect(seen[0]?.spawners.length).toBeGreaterThan(0);
    expect(seen[0]?.objectives.every((o) => o.kind === "destroy-spawner")).toBe(
      true,
    );
    expect(story.turn).toBe(7);
  });

  it("starts a story with no entry as its type alone", () => {
    const bare = started(1, true, deps({ storySetupRules: {} }));
    expect(bare).toEqual(started(1, false, deps({ storySetupRules: {} })));
  });

  it("refuses a mission whose story setup refuses", () => {
    const { state, deployment } = campaign(1, true);
    const result = startTacticalMission(
      state,
      "mission-1",
      deployment,
      deps({ species: [] }),
    );
    expect(result).toEqual({
      ok: false,
      error: { kind: "unknown-unit-type", unitKind: "bug", id: "lurker" },
    });
  });
});

// ===========================================
// Live Specimen on generated maps
// ===========================================

describe("Live Specimen's start on generated maps", () => {
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

  it.each(SEEDS)(
    "map seed %i: a lurker the squad can walk to, off the landing, and the capture decides",
    (seed) => {
      const mission = started(seed, true);
      const lurkers = mission.units.filter(
        (unit) => unit.sourceId === "lurker",
      );
      expect(lurkers.length).toBeGreaterThanOrEqual(1);

      const deploy = mission.map.hooks.deployZones.flatMap((z) => z.tiles);
      const snapshot = snapshotMap(mission.map);
      const ground = new Set(
        deploy
          .flatMap((tile) =>
            hatchTiles(
              snapshot,
              tile,
              Number.POSITIVE_INFINITY,
              PassMask.INFANTRY,
            ),
          )
          .map(keyOf),
      );
      const banned = new Set([...deploy, ...mission.extraction].map(keyOf));
      for (const lurker of lurkers) {
        expect(ground.has(keyOf(lurker.pos))).toBe(true);
        expect(banned.has(keyOf(lurker.pos))).toBe(false);
      }

      expect(decidingObjectives(mission.objectives).map((o) => o.kind)).toEqual(
        ["capture-specimen"],
      );
      expect(
        mission.objectives.filter((o) => o.kind === "destroy-spawner").length,
      ).toBe(mission.spawners.length);
    },
  );

  it("leaves the same clearance without a story as it was: no capture, nothing optional, no placed lurker", () => {
    for (const seed of SEEDS) {
      const plain = started(seed, false);
      expect(plain.objectives.some((o) => o.kind === "capture-specimen")).toBe(
        false,
      );
      expect(plain.objectives.some((o) => o.optional === true)).toBe(false);
      expect(plain.units.some((unit) => unit.team === "bugs")).toBe(false);
    }
  });
});
