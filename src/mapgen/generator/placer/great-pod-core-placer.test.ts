import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { GREAT_POD_TUNING } from "../../data/great-pod-tuning";
import { SurfaceIds } from "../../data/surfaces";
import { HookKinds } from "../../model/hook";
import type { HookRequirement } from "../../model/map-recipe";
import { MapDraft } from "../../model/map-draft";
import { PassMask } from "../../model/pass-mask";
import { createDefaultRegistries } from "../../service/default-registries";
import { resolveMapGenParams } from "../../service/param-resolver";
import { planGreatPod } from "../great-pod/great-pod-planner";
import { GreatPodCorePlacer } from "./great-pod-core-placer";

// ===========================================
// Fixture
// ===========================================

const SIZE = 30;
const registries = createDefaultRegistries();

/** The core's requirement, as the great pod's recipe asks for it. */
function requirement(count = 1): HookRequirement {
  return {
    kind: HookKinds.GREAT_POD_CORE,
    count,
    requiredPass: PassMask.NONE,
    meta: { hatchRadius: 3 },
  };
}

/** A 30×30 plain, with a great pod planned round its middle when `withPod`. */
function plain(withPod: boolean): MapDraft {
  const draft = new MapDraft(
    SIZE,
    SIZE,
    new SequentialIdGenerator(),
    SurfaceIds.GRASS,
  );
  if (withPod) {
    draft.greatPod = planGreatPod({ x: 15, z: 14 }, 0, "ns", GREAT_POD_TUNING);
  }
  return draft;
}

/** Runs the placer and returns the notes it made. */
function place(draft: MapDraft, wanted: HookRequirement): string[] {
  const notes: string[] = [];
  new GreatPodCorePlacer().place(wanted, {
    draft,
    params: resolveMapGenParams(
      {
        archetype: "great-pod",
        biome: "temperate",
        settlement: "rural",
        size: { width: SIZE, depth: SIZE },
        hooks: [wanted],
      },
      registries,
    ),
    registries,
    rng: new Mulberry32Rng(1),
    diagnostics: { note: (message) => notes.push(message) },
  });
  return notes;
}

// ===========================================
// Tests
// ===========================================

describe("GreatPodCorePlacer", () => {
  it("places the core on the plan's square, anchor first, sealed and with its hatch radius", () => {
    const draft = plain(true);
    place(draft, requirement());
    const hooks = draft.hooks.objectives;
    expect(hooks).toHaveLength(1);
    const core = hooks[0]!;
    expect(core.kind).toBe(HookKinds.GREAT_POD_CORE);
    expect(core.requiredPass).toBe(PassMask.NONE);
    expect(core.meta).toEqual({ footprint: 3, hatchRadius: 3 });
    expect(core.tiles).toHaveLength(9);
    expect(core.tiles[0]).toEqual({ x: 14, y: 0, z: 13 });
    for (const tile of core.tiles) {
      expect(tile.x).toBeGreaterThanOrEqual(14);
      expect(tile.x).toBeLessThanOrEqual(16);
      expect(tile.z).toBeGreaterThanOrEqual(13);
      expect(tile.z).toBeLessThanOrEqual(15);
    }
  });

  it("places one core however many are asked for, and says so", () => {
    const draft = plain(true);
    const notes = place(draft, requirement(2));
    expect(draft.hooks.objectives).toHaveLength(1);
    expect(notes.join(" ")).toMatch(/one core/);
  });

  it("places nothing without a pod, and notes it for the validator to report", () => {
    const draft = plain(false);
    const notes = place(draft, requirement());
    expect(draft.hooks.objectives).toEqual([]);
    expect(notes.join(" ")).toMatch(/no great pod/);
  });
});
