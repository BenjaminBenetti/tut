/// <reference types="node" />
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { MODEL_IDS } from "../../content/data/model-ids";
import type { ModelAssetEntry } from "../model/asset-manifest";
import { MODEL_MANIFEST } from "./model-manifest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const publicDir = join(repoRoot, "public");
const srcDir = join(repoRoot, "src");
const artManifestPath = join(repoRoot, "tools/art/placeholders.manifest.json");

/** Style guide §6 hard cap for any model file. */
const MAX_MODEL_BYTES = 500 * 1024;

/** The only files allowed to spell out the models folder. */
const MANIFEST_FILES = new Set([
  "graphics/data/model-manifest.ts",
  "graphics/data/model-manifest.test.ts",
]);

/** Shape of one record in the placeholder build manifest. */
type ArtManifestEntry = ModelAssetEntry & {
  readonly id: string;
  readonly triangles: number;
  readonly bytes: number;
};

/** Lists every file under a directory, recursively. */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe("MODEL_MANIFEST", () => {
  it("registers every declared id exactly once and nothing else", () => {
    expect(new Set(MODEL_IDS).size).toBe(MODEL_IDS.length);
    expect(Object.keys(MODEL_MANIFEST).sort()).toEqual([...MODEL_IDS].sort());
    for (const id of MODEL_IDS) {
      expect(MODEL_MANIFEST[id]).toBeDefined();
    }
  });

  it("uses dot-separated faction.subject ids that match their category folder", () => {
    for (const [id, entry] of Object.entries(MODEL_MANIFEST)) {
      expect(id, id).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);
      expect(entry.path, id).toMatch(
        new RegExp(`^assets/models/${entry.category}/[a-z0-9-]+\\.glb$`),
      );
    }
  });

  it("points every entry at a GLB under public/ within the size cap", () => {
    for (const [id, entry] of Object.entries(MODEL_MANIFEST)) {
      const file = join(publicDir, entry.path);
      expect(existsSync(file), entry.path).toBe(true);
      const bytes = readFileSync(file);
      expect(bytes.subarray(0, 4).toString("ascii"), id).toBe("glTF");
      expect(bytes.length, id).toBeLessThan(MAX_MODEL_BYTES);
    }
  });

  it("keeps footprints, heights and sockets sane", () => {
    for (const [id, entry] of Object.entries(MODEL_MANIFEST)) {
      expect(entry.footprint.w, id).toBeGreaterThanOrEqual(0);
      expect(entry.footprint.d, id).toBeGreaterThanOrEqual(0);
      expect(entry.height, id).toBeGreaterThanOrEqual(0);
      for (const socket of entry.sockets) {
        expect(socket, id).toMatch(/^socket_[a-z0-9_]+$/);
      }
    }
  });

  it("matches the placeholder build manifest entry for entry", () => {
    const art = JSON.parse(
      readFileSync(artManifestPath, "utf8"),
    ) as readonly ArtManifestEntry[];
    expect(art.map((entry) => entry.id).sort()).toEqual([...MODEL_IDS].sort());
    for (const { id, triangles: _t, bytes: _b, ...expected } of art) {
      expect(MODEL_MANIFEST[id as keyof typeof MODEL_MANIFEST], id).toEqual(
        expected,
      );
    }
  });

  it("is the only place under src/ that spells out the models folder", () => {
    const offenders = walk(srcDir)
      .filter((file) => !MANIFEST_FILES.has(relative(srcDir, file)))
      .filter((file) => readFileSync(file, "utf8").includes("assets/models/"))
      .map((file) => relative(srcDir, file));
    expect(offenders).toEqual([]);
  });
});
