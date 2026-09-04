/// <reference types="node" />
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SPRITE_MANIFEST } from "./sprite-manifest";

// ===========================================
// Constants
// ===========================================

/**
 * Sprites registered, loaded, and drawn by nothing (#697).
 *
 * `TacticalAnimationQueue` preloads the whole manifest, so an entry here
 * costs a fetch and a decode on every mission and returns a frozen
 * billboard. The six `-sheet` entries carry the `sheet` descriptor added
 * in #396 and no code reads `.sheet`, so every effect in the game is
 * still a single static frame.
 *
 * `vfx.egg-burst` has left this list: the burst plays when charges
 * finish a spawner off, which is what the guard is for.
 *
 * **This list should only ever shrink.** A new name in it means art has
 * shipped dark.
 */
const KNOWN_UNDRAWN: readonly string[] = [
  "vfx.bug-death-sheet",
  "vfx.claw-slash-sheet",
  "vfx.egg-burst-sheet",
  "vfx.impact-sheet",
  "vfx.muzzle-flash-sheet",
  "vfx.tdf-death-sheet",
];

/** Where a sprite id may legitimately appear without being drawn. */
const NOT_A_CONSUMER = ["sprite-manifest.ts", "sprite-consumers.test.ts"];

// ===========================================
// Helpers
// ===========================================

/** Every TypeScript file under `src`, excluding tests. */
function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      sourceFiles(path, found);
    } else if (
      entry.endsWith(".ts") &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".test-helper.ts")
    ) {
      found.push(path);
    }
  }
  return found;
}

// ===========================================
// Tests
// ===========================================

describe("every registered sprite has a consumer", () => {
  it("names no sprite that nothing outside the manifest mentions", () => {
    const files = sourceFiles("src").filter(
      (f) => !NOT_A_CONSUMER.some((skip) => f.endsWith(skip)),
    );
    const sources = files.map((f) => readFileSync(f, "utf8"));
    const undrawn = Object.keys(SPRITE_MANIFEST).filter(
      (id) => !sources.some((src) => src.includes(`"${id}"`)),
    );
    // A manifest entry is a promise that something draws it, and until
    // now nothing checked the promise: the manifest's own test asserts
    // the file exists and parses, which it does, dark or not (#697).
    expect(undrawn.sort()).toEqual([...KNOWN_UNDRAWN].sort());
  });

  it("keeps the known list honest, so a fix is noticed", () => {
    // If one of these gains a consumer it has been fixed and should
    // leave the list, or the list rots into a licence to ship dark art.
    for (const id of KNOWN_UNDRAWN) {
      expect(Object.keys(SPRITE_MANIFEST)).toContain(id);
    }
  });
});
