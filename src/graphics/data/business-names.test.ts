/// <reference types="node" />
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import atlasMetadata from "../../../public/assets/textures/business-signs/names/manifest.json";
import type { BusinessFrontageKind } from "../model/building-frontage-style";
import { BUSINESS_NAMES } from "./business-names";
import {
  BUSINESS_SIGN_ATLASES,
  BUSINESS_SIGN_ATLAS_LAYOUT,
} from "./business-sign-atlases";
import { TEXTURE_MANIFEST } from "./texture-manifest";

const KINDS = [
  "grocery",
  "bakery-cafe",
  "pharmacy",
  "clothing",
  "electronics",
  "hardware",
  "bookshop",
  "offices",
  "depot",
] as const satisfies readonly BusinessFrontageKind[];

/** Matches the exporter without relying on its implementation or any image-decoding dependency. */
function sha256(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("business names and printed atlases", () => {
  it("contains exactly nine trades with fifty short printable names each and no reused business names", () => {
    expect(Object.keys(BUSINESS_NAMES).sort()).toEqual([...KINDS].sort());
    const unique = new Set<string>();
    for (const kind of KINDS) {
      expect(BUSINESS_NAMES[kind], kind).toHaveLength(50);
      for (const name of BUSINESS_NAMES[kind]) {
        expect(name, `${kind}: ${name}`).toMatch(/^[\x20-\x7e]{1,22}$/);
        expect(name).toBe(name.trim());
        const key = name.toLowerCase();
        expect(unique.has(key), `Business name is reused: ${name}`).toBe(false);
        unique.add(key);
      }
    }
    expect(unique.size).toBe(450);
  });

  it("records the exact canonical source used to print the shipped atlas pages", () => {
    expect(atlasMetadata.schemaVersion).toBe(1);
    expect(atlasMetadata.source).toBe("src/graphics/data/business-names.json");
    expect(atlasMetadata.nameOrderHashEncoding).toBe(
      "SHA256 of UTF-8 JSON.stringify(names)",
    );
    expect(atlasMetadata.sourceSha256).toBe(
      sha256(readFileSync(new URL("./business-names.json", import.meta.url))),
    );
    expect(Object.keys(atlasMetadata.types).sort()).toEqual([...KINDS].sort());
    expect(Object.keys(BUSINESS_SIGN_ATLASES).sort()).toEqual(
      [...KINDS].sort(),
    );
  });

  it("keeps runtime name crops aligned with the exported strip layout", () => {
    const layout = BUSINESS_SIGN_ATLAS_LAYOUT;
    expect(atlasMetadata.layout).toEqual({
      pageWidth: layout.width,
      pageHeight: layout.height,
      stripWidth: layout.width,
      stripHeight: layout.labelHeight,
      rowStride: layout.rowStride,
      topInset: layout.topInset,
      namesPerPage: layout.labelsPerPage,
      pagesPerType: Math.ceil(50 / layout.labelsPerPage),
      texelInset: 0.5,
    });
  });

  it.each(KINDS)(
    "keeps the printed %s names in canonical selection order",
    (kind) => {
      const metadata = atlasMetadata.types[kind];
      expect(metadata.nameCount).toBe(BUSINESS_NAMES[kind].length);
      expect(metadata.nameOrderSha256).toBe(
        sha256(JSON.stringify(BUSINESS_NAMES[kind])),
      );
    },
  );

  it.each(KINDS)(
    "ships the exact five %s pages registered in the same selection order",
    (kind) => {
      const pages = atlasMetadata.types[kind].pages;
      const ids = BUSINESS_SIGN_ATLASES[kind];
      expect(pages).toHaveLength(5);
      expect(ids).toHaveLength(pages.length);
      expect(new Set(pages.map((page) => page.path)).size).toBe(5);
      for (const [index, page] of pages.entries()) {
        expect(page.page).toBe(index);
        expect(page.firstNameIndex).toBe(
          index * BUSINESS_SIGN_ATLAS_LAYOUT.labelsPerPage,
        );
        const entry = TEXTURE_MANIFEST[ids[index]!];
        expect(entry.path).toBe(page.path);
        expect(page.sha256, page.path).toBe(
          sha256(
            readFileSync(
              new URL(`../../../public/${entry.path}`, import.meta.url),
            ),
          ),
        );
      }
    },
  );
});
