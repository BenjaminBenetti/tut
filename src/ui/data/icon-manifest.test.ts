/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ICON_MANIFEST, iconUrl } from "./icon-manifest";

const publicDir = fileURLToPath(new URL("../../../public/", import.meta.url));

describe("ICON_MANIFEST", () => {
  it("points every entry at an existing SVG under public/", () => {
    for (const entry of Object.values(ICON_MANIFEST)) {
      expect(existsSync(`${publicDir}${entry.path}`), entry.path).toBe(true);
    }
  });

  it("keeps every icon single-colour, 24×24 and under 1 KB", () => {
    for (const entry of Object.values(ICON_MANIFEST)) {
      const svg = readFileSync(`${publicDir}${entry.path}`, "utf8");
      expect(svg).toContain('viewBox="0 0 24 24"');
      expect(svg).toContain('stroke="currentColor"');
      expect(svg.length).toBeLessThan(1024);
    }
  });

  it("builds a CSS url() from an id", () => {
    expect(iconUrl("mech")).toBe("url(/assets/ui/icons/mech.svg)");
  });
});
