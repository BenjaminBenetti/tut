import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { SurfaceIds } from "../../data/surfaces";
import { HookKinds, type HookKind } from "../../model/hook";
import type { HookRequirement } from "../../model/map-recipe";
import { MapDraft, type HookGroup } from "../../model/map-draft";
import { PassMask } from "../../model/pass-mask";
import type { PlatformLayout, PlatformPad } from "../../model/platform-layout";
import type { TileCoord } from "../../model/tile-coord";
import { createDefaultRegistries } from "../../service/default-registries";
import { resolveMapGenParams } from "../../service/param-resolver";
import { PlatformPadPlacer } from "./platform-pad-placer";

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
 *        . . . . . . . .   (the far corner is the fallback's pick)
 * ```
 */
function plain(): MapDraft {
  const draft = new MapDraft(
    SIZE,
    SIZE,
    new SequentialIdGenerator(),
    SurfaceIds.HULL_PLATE,
  );
  draft.addHook("deployZones", HookKinds.DEPLOY, square(0, 0, 2), PassMask.ALL);
  return draft;
}

/** Marks `draft` as a spore platform whose plan holds `pads`. */
function planned(draft: MapDraft, pads: readonly PlatformPad[]): MapDraft {
  const columns = SIZE * SIZE;
  const layout: PlatformLayout = {
    stage: "core",
    deck: new Uint8Array(columns).fill(1),
    route: new Uint8Array(columns),
    routes: [],
    podBeds: new Uint8Array(columns),
    keepClear: new Uint8Array(columns),
    pads,
  };
  draft.platform = layout;
  return draft;
}

/** Runs a placer for `count` hooks of its kind and returns the notes it made. */
function place(
  draft: MapDraft,
  placer: PlatformPadPlacer,
  count: number,
  minDistanceFromDeploy = 0,
): string[] {
  const notes: string[] = [];
  const requirement: HookRequirement = {
    kind: placer.id,
    count,
    requiredPass: PassMask.ALL,
    minDistanceFromDeploy,
  };
  placer.place(requirement, {
    draft,
    params: resolveMapGenParams(
      {
        archetype: "spore-platform-core",
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

/** The `size` square of ground tiles anchored at a corner, at level `y`. */
function square(x0: number, z0: number, size: number, y = 0): TileCoord[] {
  const tiles: TileCoord[] = [];
  for (let z = z0; z < z0 + size; z++) {
    for (let x = x0; x < x0 + size; x++) tiles.push({ x, y, z });
  }
  return tiles;
}

/** A pad of `kind` at a corner. */
function pad(
  kind: HookKind,
  x: number,
  z: number,
  size: number,
  meta?: PlatformPad["meta"],
): PlatformPad {
  return { kind, x, z, size, level: 0, ...(meta ? { meta } : {}) };
}

/** The hooks of `kind` in a group. */
function hooksIn(draft: MapDraft, group: HookGroup, kind: HookKind) {
  return draft.hooks[group].filter((hook) => hook.kind === kind);
}

// ===========================================
// Tests
// ===========================================

describe("PlatformPadPlacer (#1179)", () => {
  it("takes the plan's pads in order, with their footprint and metadata", () => {
    const draft = planned(plain(), [
      pad(HookKinds.GUARD_POST, 6, 10, 2, { side: "west" }),
      pad(HookKinds.SOVEREIGN_DAIS, 9, 9, 4),
      pad(HookKinds.GUARD_POST, 14, 10, 2, { side: "east" }),
    ]);
    place(draft, new PlatformPadPlacer(HookKinds.GUARD_POST, 2), 2);
    const guards = hooksIn(draft, "objectives", HookKinds.GUARD_POST);
    expect(guards.map((hook) => hook.tiles)).toEqual([
      square(6, 10, 2),
      square(14, 10, 2),
    ]);
    expect(guards.map((hook) => hook.meta)).toEqual([
      { footprint: 2, side: "west" },
      { footprint: 2, side: "east" },
    ]);
  });

  it("stands the pads it has planned on the ground they were levelled to", () => {
    const draft = planned(plain(), [pad(HookKinds.PLATFORM_CORE, 12, 12, 3)]);
    for (const tile of square(12, 12, 3)) {
      draft.setGroundLevel(tile.x, tile.z, 2);
    }
    place(draft, new PlatformPadPlacer(HookKinds.PLATFORM_CORE, 3), 1);
    expect(draft.hooks.objectives[0]?.tiles).toEqual(square(12, 12, 3, 2));
  });

  it("falls back to the farthest level open square beyond the plan", () => {
    const draft = planned(plain(), [
      pad(HookKinds.DOCKING_RING, 5, 5, 3, { side: "east" }),
    ]);
    // A bump in the far corner: the squares over it are not level.
    draft.setGroundLevel(19, 19, 1);
    place(draft, new PlatformPadPlacer(HookKinds.DOCKING_RING, 3), 2);
    const rings = hooksIn(draft, "objectives", HookKinds.DOCKING_RING);
    expect(rings.map((hook) => hook.tiles)).toEqual([
      square(5, 5, 3),
      // Of the two squares tied beside the bump, scan order takes the lower z.
      square(17, 16, 3),
    ]);
    expect(rings[1]?.meta).toEqual({ footprint: 3 });
  });

  it("works off a platform too, and never on another hook", () => {
    const draft = plain();
    draft.addHook(
      "objectives",
      HookKinds.HIVE_CORE,
      square(17, 17, 3),
      PassMask.ALL,
    );
    place(draft, new PlatformPadPlacer(HookKinds.PLATFORM_EXIT, 3), 1);
    const exits = hooksIn(draft, "objectives", HookKinds.PLATFORM_EXIT);
    expect(exits[0]?.tiles).toEqual(square(17, 14, 3));
  });

  it("puts a deploy pad among the deploy zones, without a distance check", () => {
    // A second zone beside the corner one: a distance check would note it.
    const draft = planned(plain(), [pad(HookKinds.DEPLOY, 3, 0, 4)]);
    const notes = place(
      draft,
      new PlatformPadPlacer(HookKinds.DEPLOY, 4, 0, "deployZones"),
      1,
      1_000,
    );
    expect(draft.hooks.deployZones.map((hook) => hook.tiles)).toEqual([
      square(0, 0, 2),
      square(3, 0, 4),
    ]);
    expect(draft.hooks.objectives).toEqual([]);
    expect(notes).toEqual([]);
  });

  it("places a pad nearer deploy than asked and says so", () => {
    const draft = planned(plain(), [pad(HookKinds.PLATFORM_CORE, 3, 3, 3)]);
    const notes = place(
      draft,
      new PlatformPadPlacer(HookKinds.PLATFORM_CORE, 3),
      1,
      1_000,
    );
    expect(draft.hooks.objectives).toHaveLength(1);
    expect(notes).toEqual(["platform-core only 4 from deploy"]);
  });
});
