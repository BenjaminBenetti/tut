import { describe, expect, it } from "vitest";

import { BUG_SPECIES } from "../../../bugs/data/species";
import { STOREY_LAYERS } from "../../../core/model/elevation";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { HookKinds } from "../../../mapgen/model/hook";
import { PassMask } from "../../../mapgen/model/pass-mask";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { FixtureMapBuilder } from "../../../mapgen/service/fixture-map-builder";
import { CIVILIAN_TUNING } from "../../data/civilian-tuning";
import { CRASH_SITE_SETUP_TUNING } from "../../data/crash-site-setup-tuning";
import { GENERATOR_TUNING } from "../../data/generator-tuning";
import { GREAT_POD_SETUP_TUNING } from "../../data/great-pod-setup-tuning";
import { HIVE_ASSAULT_SETUP_TUNING } from "../../data/hive-assault-setup-tuning";
import { SPAWN_TUNING } from "../../data/spawn-tuning";
import type { MissionSetupDeps } from "../../model/mission-setup-rule";
import { spawnerTraitsOf } from "../../model/spawner-variant";
import type { TacticalState } from "../../model/tactical-state";
import { missionWith, unitAt } from "../tactical-fixtures.test-helper";
import {
  GREAT_POD_CORE_VARIANT,
  greatPodCoreHp,
  greatPodRipenTurn,
  placeGreatPod,
} from "./great-pod-setup";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number): TileCoord => ({ x, y: 0, z });

/** The core's 3×3, anchored at (6, 6) on a 16×16 field. */
const CORE_TILES: readonly TileCoord[] = [6, 7, 8].flatMap((z) =>
  [6, 7, 8].map((x) => at(x, z)),
);

/**
 * A field laid out as the great pod's generator lays one, without the
 * walls: the core's hook, the core chamber's brood hook on the core's
 * middle and a route chamber's to the north, each with the label the
 * chamber pass gives it.
 *
 * ```
 *   z=2        N            N = pod's north chamber (radius 2)
 *   z=6..8   C C C          C = the core (hatch radius 3), its chamber
 *            C K C              hook K on the middle (radius 3)
 *            C C C
 * ```
 */
function pod(withCore = true): TacticalMap {
  const builder = new FixtureMapBuilder(16, 16, 3 * STOREY_LAYERS).fillGround();
  if (withCore) {
    builder.objective(HookKinds.GREAT_POD_CORE, CORE_TILES, PassMask.NONE, {
      hatchRadius: 3,
    });
  }
  builder.objective(HookKinds.BROOD_CHAMBER, [at(7, 7)], PassMask.NONE, {
    chamberId: "pod-core",
    role: "core",
    radius: 3,
    label: "pod's core chamber",
  });
  builder.objective(HookKinds.BROOD_CHAMBER, [at(7, 2)], PassMask.NONE, {
    chamberId: "pod-north",
    role: "route",
    radius: 2,
    label: "pod's north chamber",
  });
  return builder.build();
}

/** Setup deps over fresh ids, the shipped tunings and every species. */
function deps(): MissionSetupDeps {
  return {
    ids: new SequentialIdGenerator(),
    spawnTuning: SPAWN_TUNING,
    generator: GENERATOR_TUNING,
    civilian: CIVILIAN_TUNING,
    hiveGuard: BUG_SPECIES["hive-guard"],
    hiveAssault: HIVE_ASSAULT_SETUP_TUNING,
    crashSite: CRASH_SITE_SETUP_TUNING,
    broods: { species: Object.values(BUG_SPECIES), tuning: SPAWN_BROODS },
  };
}

/** The shared brood tuning the great pod's own replaces. */
const SPAWN_BROODS = {
  ...GREAT_POD_SETUP_TUNING.broods,
  baseSize: 9,
  roleScale: { route: 1, side: 1, core: 1 },
};

/** A d`difficulty` mission on `map` with one squad at the drop. */
function landed(map: TacticalMap, difficulty = 1): TacticalState {
  return missionWith(map, [unitAt("u", "infantry", at(0, 15))], {
    difficulty,
  });
}

/** `placeGreatPod` on `map` at `difficulty`, or a thrown error. */
function placed(map: TacticalMap = pod(), difficulty = 1): TacticalState {
  const result = placeGreatPod(
    landed(map, difficulty),
    map,
    { difficulty },
    deps(),
    GREAT_POD_SETUP_TUNING,
  );
  if (!result.ok) throw new Error(result.error.kind);
  return result.value;
}

// ===========================================
// Tests
// ===========================================

describe("placeGreatPod (#1238)", () => {
  it("stands the core on the hook's square: a 3×3 solid pod core with the hook's hatch radius", () => {
    const mission = placed();
    expect(mission.spawners).toEqual([
      {
        id: "spawner-1",
        variant: GREAT_POD_CORE_VARIANT,
        pos: at(6, 6),
        hatchRadius: 3,
        hp: GREAT_POD_SETUP_TUNING.coreHp,
        maxHp: GREAT_POD_SETUP_TUNING.coreHp,
        timer: 0,
        destroyed: false,
      },
    ]);
    const traits = spawnerTraitsOf(mission.spawners[0]!);
    expect(traits).toMatchObject({
      name: "Pod core",
      footprint: 3,
      solid: true,
      hatches: false,
    });
  });

  it("puts the core on the crash site's clock plus the hull's turns: turn 12 at d1", () => {
    const mission = placed();
    expect(mission.objectives).toEqual([
      {
        id: "objective-1",
        kind: "destroy-pod",
        targetId: "spawner-1",
        complete: false,
        deadlineTurn: 12,
        greatPod: true,
      },
    ]);
    expect(GREAT_POD_SETUP_TUNING.hullTurns).toBe(4);
    expect(greatPodRipenTurn(1, deps(), GREAT_POD_SETUP_TUNING)).toBe(
      SPAWN_TUNING.podMaturityTurn + 4,
    );
    // The crash site's early clock from d5 carries through.
    expect(greatPodRipenTurn(5, deps(), GREAT_POD_SETUP_TUNING)).toBe(
      CRASH_SITE_SETUP_TUNING.earlyMaturityTurn + 4,
    );
  });

  it("toughens the core with difficulty above 1", () => {
    expect(greatPodCoreHp(1, GREAT_POD_SETUP_TUNING)).toBe(80);
    expect(greatPodCoreHp(3, GREAT_POD_SETUP_TUNING)).toBe(100);
    expect(greatPodCoreHp(0, GREAT_POD_SETUP_TUNING)).toBe(80);
    expect(placed(pod(), 3).spawners[0]?.maxHp).toBe(100);
  });

  it("stocks each chamber with a sleeping brood on the pod's own tuning, labelled for the log", () => {
    const mission = placed();
    const broods = mission.broods ?? [];
    expect(broods.map((brood) => brood.label)).toEqual([
      "pod's core chamber",
      "pod's north chamber",
    ]);
    // 2 a chamber, half again in the core's: not the shared tuning's 9.
    expect(broods.map((brood) => brood.memberIds.length)).toEqual([3, 2]);
    expect(broods.map((brood) => brood.wake.radius)).toEqual([3, 2]);
    const core = new Set(CORE_TILES.map((tile) => `${tile.x},${tile.z}`));
    for (const unit of mission.units.filter((u) => u.team === "bugs")) {
      expect(unit.status, unit.id).toContain("dormant");
      expect(core.has(`${unit.pos.x},${unit.pos.z}`), unit.id).toBe(false);
    }
  });

  it("refuses a map without the core's hook", () => {
    const map = pod(false);
    expect(
      placeGreatPod(
        landed(map),
        map,
        { difficulty: 1 },
        deps(),
        GREAT_POD_SETUP_TUNING,
      ),
    ).toEqual({
      ok: false,
      error: { kind: "map-recipe", reason: "the great pod has no core" },
    });
  });

  it("stands the core without broods when the composition gives no species", () => {
    const map = pod();
    const { broods: _none, ...rest } = deps();
    const result = placeGreatPod(
      landed(map),
      map,
      { difficulty: 1 },
      rest,
      GREAT_POD_SETUP_TUNING,
    );
    if (!result.ok) throw new Error(result.error.kind);
    expect(result.value.spawners).toHaveLength(1);
    expect(result.value.broods ?? []).toEqual([]);
  });
});
