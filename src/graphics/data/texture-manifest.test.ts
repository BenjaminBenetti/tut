/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TEXTURE_MANIFEST, textureUrl } from "./texture-manifest";

const publicDir = fileURLToPath(new URL("../../../public/", import.meta.url));

/**
 * Reads the width and height from a PNG header.
 * @param bytes - PNG file contents.
 * @returns Image dimensions.
 */
function pngSize(bytes: Buffer): { width: number; height: number } {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("TEXTURE_MANIFEST", () => {
  it("points every entry at an existing PNG under public/", () => {
    for (const entry of Object.values(TEXTURE_MANIFEST)) {
      expect(existsSync(`${publicDir}${entry.path}`), entry.path).toBe(true);
    }
  });

  it("keeps every texture at its declared size and under 1.5 MB", () => {
    for (const entry of Object.values(TEXTURE_MANIFEST)) {
      const bytes = readFileSync(`${publicDir}${entry.path}`);
      expect(pngSize(bytes), entry.path).toEqual({
        width: entry.width,
        height: entry.height,
      });
      expect(bytes.length, entry.path).toBeLessThan(1.5 * 1024 * 1024);
    }
  });

  it("builds a URL from an id", () => {
    expect(textureUrl("overworld.earth-map")).toBe(
      "/assets/textures/overworld/earth-map_albedo.png",
    );
  });
});
