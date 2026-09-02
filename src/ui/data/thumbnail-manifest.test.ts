/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MODEL_IDS } from "../../content/data/model-ids";
import { THUMBNAIL_MANIFEST, thumbnailUrl } from "./thumbnail-manifest";

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
  const colourType = bytes.readUInt8(25);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    hasAlpha: colourType === 4 || colourType === 6,
  };
}

describe("THUMBNAIL_MANIFEST", () => {
  it("keys every entry by the model it depicts, and that model exists", () => {
    for (const [id, entry] of Object.entries(THUMBNAIL_MANIFEST)) {
      expect(entry.model, id).toBe(id);
      expect(MODEL_IDS, id).toContain(entry.model);
    }
  });

  it("points every entry at a 128×128 PNG with alpha under 20 KB", () => {
    for (const entry of Object.values(THUMBNAIL_MANIFEST)) {
      const file = `${publicDir}${entry.path}`;
      expect(existsSync(file), entry.path).toBe(true);
      const bytes = readFileSync(file);
      expect(pngHeader(bytes), entry.path).toEqual({
        width: 128,
        height: 128,
        hasAlpha: true,
      });
      expect(bytes.length, entry.path).toBeLessThan(20 * 1024);
    }
  });

  it("builds a URL from an id", () => {
    expect(thumbnailUrl("tdf.mech.chassis-a")).toBe(
      "/assets/ui/thumbs/tdf.mech.chassis-a.png",
    );
  });
});
