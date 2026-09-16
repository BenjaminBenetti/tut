import { describe, expect, it } from "vitest";

import { manhattanDistance } from "../../../core/service/grid-math";
import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { PropKindIds } from "../../data/props";
import { SurfaceIds } from "../../data/surfaces";
import { MapDraft } from "../../model/map-draft";
import { HookKinds } from "../../model/hook";
import { PassMask } from "../../model/pass-mask";
import type { TileCoord } from "../../model/tile-coord";
import type { WallKind } from "../../model/wall";
import { createDefaultRegistries } from "../../service/default-registries";
import { DiagnosticsCollector } from "../../service/diagnostics-collector";
import { resolveMapGenParams } from "../../service/param-resolver";
import { EggSpawnerPlacer, hasFiringLine } from "./egg-spawner-placer";

// ===========================================
// Fixture
// ===========================================

/**
 * A one-room building at the left of an 8×3 plat, with the room's east
 * wall set to `east`:
 *
 * ```
 *   x  0    1    2 3 4 5 6 7
 *      wall room east open ground →
 * ```
 */
function room(east: WallKind | undefined): {
  draft: MapDraft;
  spawner: TileCoord;
} {
  const draft = new MapDraft(
    8,
    3,
    new SequentialIdGenerator(),
    SurfaceIds.GRASS,
  );
  const spawner: TileCoord = { x: 1, y: 0, z: 1 };
  draft.addTile({ ...spawner, surface: SurfaceIds.FLOOR, buildingId: "b1" });
  draft.setCovered(0, 1);
  draft.setCovered(1, 1);
  draft.setWall(spawner, "n", "solid");
  draft.setWall(spawner, "s", "solid");
  draft.setWall(spawner, "w", "solid");
  if (east !== undefined) {
    draft.setWall(spawner, "e", east);
  }
  return { draft, spawner };
}

const anywhere = (): boolean => true;

describe("EggSpawnerPlacer", () => {
  it("keeps the first outdoor fallback near deploy when nearby interiors have no firing line", () => {
    const draft = new MapDraft(
      16,
      16,
      new SequentialIdGenerator(),
      SurfaceIds.GRASS,
    );
    // The near room is reachable through a door, but has no window a
    // mech could fire through. Plenty of nearby open ground remains.
    for (const x of [2, 3]) {
      const tile = { x, y: 0, z: 2 };
      draft.setCovered(x, 2);
      draft.addTile({
        ...tile,
        surface: SurfaceIds.FLOOR,
        buildingId: "blind",
      });
      draft.setWall(tile, "n", "solid");
      draft.setWall(tile, "s", "solid");
    }
    draft.setWall({ x: 2, y: 0, z: 2 }, "w", "door");
    draft.setWall({ x: 3, y: 0, z: 2 }, "e", "solid");
    const deploy = { x: 0, y: 0, z: 2 };
    draft.addHook("deployZones", HookKinds.DEPLOY, [deploy], PassMask.ALL);
    const registries = createDefaultRegistries();
    const params = resolveMapGenParams(
      {
        archetype: "settlement",
        biome: "temperate",
        settlement: "town",
        size: { width: 16, depth: 16 },
        hooks: [],
      },
      registries,
    );
    new EggSpawnerPlacer().place(
      {
        kind: HookKinds.EGG_SPAWNER,
        count: 1,
        requiredPass: PassMask.INFANTRY,
        minDistanceFromDeploy: 2,
        maxNearestDistanceFromDeploy: 4,
      },
      {
        draft,
        params,
        registries,
        rng: new Mulberry32Rng(1),
        diagnostics: new DiagnosticsCollector().forPass("hooks"),
      },
    );
    const target = draft.hooks.objectives[0]?.tiles[0];
    expect(target).toBeDefined();
    if (target === undefined) return;
    expect(draft.getTile(target)).toBeUndefined();
    expect(manhattanDistance(deploy, target)).toBeLessThanOrEqual(4);
    expect(hasFiringLine(draft, target, anywhere)).toBe(true);
  });
});

describe("hasFiringLine", () => {
  it("finds a line out through a window", () => {
    const { draft, spawner } = room("window");
    expect(hasFiringLine(draft, spawner, anywhere)).toBe(true);
  });

  it("finds none through a solid wall or a door", () => {
    for (const kind of ["solid", "door"] as const) {
      const { draft, spawner } = room(kind);
      expect(hasFiringLine(draft, spawner, anywhere), kind).toBe(false);
    }
  });

  it("finds a line when the room is simply open on a side", () => {
    const { draft, spawner } = room(undefined);
    expect(hasFiringLine(draft, spawner, anywhere)).toBe(true);
  });

  it("wants ground a mech can actually walk to", () => {
    const { draft, spawner } = room("window");
    // The line is there, but nothing outside is reachable.
    expect(hasFiringLine(draft, spawner, () => false)).toBe(false);
  });

  it("stops at a prop that fills the tile", () => {
    const { draft, spawner } = room("window");
    draft.addProp(PropKindIds.BOULDER, { x: 2, y: 0, z: 1 });
    expect(hasFiringLine(draft, spawner, anywhere)).toBe(false);
  });

  it("stops at the level a shooter would have to stand above", () => {
    const { draft, spawner } = room("window");
    draft.setGroundLevel(2, 1, 1);
    draft.setGroundLevel(3, 1, 1);
    draft.setGroundLevel(4, 1, 1);
    draft.setGroundLevel(5, 1, 1);
    draft.setGroundLevel(6, 1, 1);
    draft.setGroundLevel(7, 1, 1);
    expect(hasFiringLine(draft, spawner, anywhere)).toBe(false);
  });
});
