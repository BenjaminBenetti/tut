/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SPRITE_MANIFEST, spriteUrl } from "./sprite-manifest";

const publicDir = fileURLToPath(new URL("../../../public/", import.meta.url));

/**
 * Reads the width, height and colour type from a PNG header.
 * @param bytes - PNG file contents.
 * @returns Image dimensions and whether the colour type carries alpha.
 */
function pngHeader(bytes: Buffer): {
  width: number;
  height: number;
  hasAlpha: boolean;
} {
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const colourType = bytes.readUInt8(25);
  return { width, height, hasAlpha: colourType === 4 || colourType === 6 };
}

describe("SPRITE_MANIFEST", () => {
  it("points every entry at an existing PNG under public/", () => {
    for (const entry of Object.values(SPRITE_MANIFEST)) {
      expect(existsSync(`${publicDir}${entry.path}`), entry.path).toBe(true);
    }
  });

  it("keeps every sprite square, at its declared size, with alpha, under 150 KB", () => {
    for (const entry of Object.values(SPRITE_MANIFEST)) {
      const bytes = readFileSync(`${publicDir}${entry.path}`);
      const header = pngHeader(bytes);
      expect(header.width, entry.path).toBe(entry.size);
      expect(header.height, entry.path).toBe(entry.size);
      expect(header.hasAlpha, entry.path).toBe(true);
      expect(bytes.length, entry.path).toBeLessThan(150 * 1024);
    }
  });

  it("builds a URL from an id", () => {
    expect(spriteUrl("vfx.muzzle-flash")).toBe(
      "/assets/sprites/vfx/muzzle-flash.png",
    );
  });
});
