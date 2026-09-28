import { describe, expect, it } from "vitest";

import { HookKinds } from "../model/hook";
import type { Hook } from "../model/hook";
import { PassMask } from "../model/pass-mask";
import type { TileCoord } from "../model/tile-coord";
import {
  extractionZoneTiles,
  forwardExtractionHooks,
  onForwardExtraction,
} from "./extraction-zones";

// ===========================================
// Fixtures
// ===========================================

/** A hook of `kind` on `tiles`. */
function hook(id: string, kind: string, tiles: readonly TileCoord[]): Hook {
  return { id, kind, tiles, requiredPass: PassMask.ALL };
}

const LANDING = hook("hook-1", HookKinds.EXTRACTION, [
  { x: 0, y: 2, z: 0 },
  { x: 1, y: 2, z: 0 },
]);
const FORWARD = hook("hook-9", HookKinds.FORWARD_EXTRACTION, [
  { x: 5, y: 2, z: 9 },
  { x: 6, y: 2, z: 9 },
]);
const NEST = hook("hook-3", HookKinds.EGG_SPAWNER, [{ x: 4, y: 2, z: 4 }]);

// ===========================================
// Extraction zones
// ===========================================

describe("extraction zones (#1179)", () => {
  it("are the landing zone's tiles, then each forward point's", () => {
    const hooks = { extraction: LANDING, objectives: [NEST, FORWARD] };
    expect(forwardExtractionHooks(hooks)).toEqual([FORWARD]);
    expect(extractionZoneTiles(hooks)).toEqual([
      ...LANDING.tiles,
      ...FORWARD.tiles,
    ]);
  });

  it("are the landing zone's alone, in its order, on a map with no forward point", () => {
    const hooks = { extraction: LANDING, objectives: [NEST] };
    expect(forwardExtractionHooks(hooks)).toEqual([]);
    expect(extractionZoneTiles(hooks)).toEqual(LANDING.tiles);
  });

  it("tells a forward point's column from the landing zone's and plain ground", () => {
    const hooks = { objectives: [NEST, FORWARD] };
    expect(onForwardExtraction(hooks, { x: 6, z: 9 })).toBe(true);
    expect(onForwardExtraction(hooks, { x: 0, z: 0 })).toBe(false);
    expect(onForwardExtraction(hooks, { x: 4, z: 4 })).toBe(false);
  });
});
