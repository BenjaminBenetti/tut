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
 * costs a fetch and a decode on every mission and returns nothing.
 *
 * **Empty, and it should stay that way.** It held seven when this guard
 * landed: `vfx.egg-burst`, which now bursts when charges finish a
 * spawner, and the six frame sheets, which now animate the effects they
 * were drawn for.
 */
const KNOWN_UNDRAWN: readonly string[] = [];

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
    const mentioned = (id: string): boolean =>
      sources.some((src) => src.includes(`"${id}"`));
    const undrawn = Object.keys(SPRITE_MANIFEST).filter((id) => {
      if (mentioned(id)) {
        return false;
      }
      // A frame sheet is reached by name from the effect it animates --
      // `sheetIdFor` appends "-sheet" -- so its literal never appears in
      // the source and a plain search calls it undrawn forever. Without
      // this the guard would have gone on reporting six dark sprites the
      // frame after they started animating.
      const base = id.slice(0, -"-sheet".length);
      return !(id.endsWith("-sheet") && mentioned(base));
    });
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

  it("counts a frame sheet as drawn only when its own effect is", () => {
    // The convention this guard leans on, asserted rather than assumed:
    // every `-sheet` entry names a sprite that is itself registered, so
    // "the base id is drawn" is a real answer and not a missing key.
    for (const id of Object.keys(SPRITE_MANIFEST)) {
      if (id.endsWith("-sheet")) {
        expect(Object.keys(SPRITE_MANIFEST)).toContain(
          id.slice(0, -"-sheet".length),
        );
      }
    }
  });
});
