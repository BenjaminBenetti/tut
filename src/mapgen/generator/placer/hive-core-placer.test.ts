import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { SurfaceIds } from "../../data/surfaces";
import { HookKinds } from "../../model/hook";
import type { HookRequirement } from "../../model/map-recipe";
import { MapDraft } from "../../model/map-draft";
import { PassMask } from "../../model/pass-mask";
import type { TileCoord } from "../../model/tile-coord";
import { createDefaultRegistries } from "../../service/default-registries";
import { resolveMapGenParams } from "../../service/param-resolver";
import { HiveCorePlacer } from "./hive-core-placer";

// ===========================================
// Fixture
// ===========================================

const SIZE = 20;
const registries = createDefaultRegistries();

/**
 * A 20×20 plain with a 2×2 deploy zone in the low corner:
 *
 * ```
 *   z ↓  D D . . . . . .
 *        D D . . . . . .
 *        . . . . . . . .   (the far corner is where a core wants to be)
 * ```
 */
function plain(): MapDraft {
  const draft = new MapDraft(
    SIZE,
    SIZE,
    new SequentialIdGenerator(),
    SurfaceIds.GRASS,
  );
  draft.addHook(
    "deployZones",
    HookKinds.DEPLOY,
    [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 1, y: 0, z: 1 },
    ],
    PassMask.ALL,
  );
  return draft;
}

/** Runs the placer for one hive core and returns the notes it made. */
function place(draft: MapDraft, minDistanceFromDeploy = 0): string[] {
  const notes: string[] = [];
  const requirement: HookRequirement = {
    kind: HookKinds.HIVE_CORE,
    count: 1,
    requiredPass: PassMask.ALL,
    minDistanceFromDeploy,
  };
  new HiveCorePlacer().place(requirement, {
    draft,
    params: resolveMapGenParams(
      {
        archetype: "settlement",
        biome: "temperate",
        settlement: "rural",
        size: { width: SIZE, depth: SIZE },
        hooks: [requirement],
      },
      registries,
    ),
    registries,
    rng: new Mulberry32Rng(1),
    diagnostics: { note: (message) => notes.push(message) },
  });
  return notes;
}

/** The 3×3 of ground tiles anchored at a corner. */
function square(x0: number, z0: number): TileCoord[] {
  const tiles: TileCoord[] = [];
  for (let z = z0; z < z0 + 3; z++) {
    for (let x = x0; x < x0 + 3; x++) tiles.push({ x, y: 0, z });
  }
  return tiles;
}

// ===========================================
// Tests
// ===========================================

describe("HiveCorePlacer without a cavern (#1179)", () => {
  it("takes the level square farthest from deploy", () => {
    const draft = plain();
    // A bump in the far corner: the squares over it are not level.
    draft.setGroundLevel(19, 19, 1);
    place(draft);
    const cores = draft.hooks.objectives;
    expect(cores).toHaveLength(1);
    expect(cores[0]?.kind).toBe(HookKinds.HIVE_CORE);
    // Of the two squares tied beside the bump, scan order takes the lower z.
    expect(cores[0]?.tiles).toEqual(square(17, 16));
    expect(cores[0]?.meta).toEqual({ footprint: 3 });
  });

  it("passes over squares a mech cannot reach", () => {
    const draft = plain();
    // Water down column 10 cuts the far half off.
    for (let z = 0; z < SIZE; z++) {
      draft.setGroundSurface(10, z, SurfaceIds.WATER);
    }
    place(draft);
    expect(draft.hooks.objectives[0]?.tiles).toEqual(square(7, 17));
  });

  it("places a core nearer than asked and says so", () => {
    const draft = plain();
    const notes = place(draft, 1_000);
    expect(draft.hooks.objectives).toHaveLength(1);
    expect(notes.some((note) => note.startsWith("hive core only"))).toBe(true);
  });
});
