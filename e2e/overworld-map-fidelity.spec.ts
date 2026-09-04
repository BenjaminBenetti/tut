/// <reference lib="dom" />
/// <reference types="vite/client" />
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { TEXTURE_MANIFEST } from "../src/graphics/data/texture-manifest";
import { EARTH_MAP } from "../src/overworld/data/earth-map";

// ===========================================
// Types
// ===========================================

/** One city reduced to what the pixel check needs. */
interface CityProbe {
  readonly id: string;
  readonly name: string;
  /** Texture coordinate of the marker: the city's `layout`, which the slab is drawn with. */
  readonly u: number;
  readonly v: number;
}

/** A city whose marker landed on water, with how far the nearest land is. */
interface WaterHit {
  readonly name: string;
  readonly texel: readonly number[];
  readonly texturePixel: string;
  readonly pixelsToLand: number;
}

/** What the page found when it looked for city labels. */
interface LabelReport {
  readonly source: "dom" | "hook" | "none";
  readonly labels: Readonly<Record<string, string>>;
}

// ===========================================
// Constants
// ===========================================

/** Public URL of the Earth albedo the overworld slab is textured with. */
const EARTH_TEXTURE_URL = `/${TEXTURE_MANIFEST["overworld.earth-map"].path}`;

/** How far the search for solid land gives up, in texture pixels. */
const LAND_SEARCH_LIMIT = 80;

// ===========================================
// Helpers
// ===========================================

/** Every city as a texture-coordinate probe. */
function cityProbes(): CityProbe[] {
  return EARTH_MAP.cities.map((city) => ({
    id: city.id,
    name: city.name,
    u: city.layout.x,
    v: city.layout.y,
  }));
}

/** Boots a campaign and leaves the page on the overworld at the default camera. */
async function openOverworld(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-action="new-game"]').click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-screen",
    "overworld",
  );
  return errors;
}

// ===========================================
// Marker fidelity
// ===========================================

/**
 * Every city marker must sit on its city's land, not in the sea (#439).
 *
 * The slab's top face is drawn with `uv = (layout.x, layout.y)` and the
 * marker is placed at the same layout point, so the pixel of the Earth
 * albedo at a city's layout is exactly what the marker stands on. The
 * check reads that pixel out of the texture in the page and classifies
 * it: ocean is blue-dominant, everything else (green, sand, grey rock,
 * polar white) counts as ground.
 *
 * ```
 *   layout (u,v) ──▶ texture pixel (u·W, v·H) ──▶ blue-dominant?  ──▶ fail
 * ```
 *
 * A single antialiased coast pixel does not decide the verdict: five of
 * the nine pixels around the sample must be land. A failure reports how
 * many pixels away solid land is, so the size of the error is visible.
 */
test("every city marker sits on land in the Earth texture", async ({
  page,
}) => {
  const errors = await openOverworld(page);

  const water = await page.evaluate(
    async ({ cities, textureUrl, searchLimit }) => {
      const response = await fetch(textureUrl);
      const bitmap = await createImageBitmap(await response.blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("No 2d context to read the Earth texture with");
      }
      context.drawImage(bitmap, 0, 0);
      const { width, height, data } = context.getImageData(
        0,
        0,
        bitmap.width,
        bitmap.height,
      );

      /** The pixel at `(x, y)`, clamped to the texture. */
      const rgb = (x: number, y: number): number[] => {
        const cx = Math.min(width - 1, Math.max(0, x));
        const cy = Math.min(height - 1, Math.max(0, y));
        const index = (cy * width + cx) * 4;
        return [data[index], data[index + 1], data[index + 2]];
      };
      /** True for the ocean blue of the albedo. */
      const isOcean = (x: number, y: number): boolean => {
        const [r, g, b] = rgb(x, y);
        return b > r + 18 && b >= g && b > 45;
      };
      /** True when most of the 3×3 block around the pixel is not ocean. */
      const isLand = (x: number, y: number): boolean => {
        let ground = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!isOcean(x + dx, y + dy)) {
              ground++;
            }
          }
        }
        return ground >= 5;
      };
      /** Chebyshev rings outward until solid land is found. */
      const distanceToLand = (x: number, y: number): number => {
        for (let r = 1; r <= searchLimit; r++) {
          for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) {
                continue;
              }
              if (isLand(x + dx, y + dy)) {
                return Math.round(Math.hypot(dx, dy));
              }
            }
          }
        }
        return searchLimit;
      };

      const hits = [];
      for (const city of cities) {
        const x = Math.round(city.u * width);
        const y = Math.round(city.v * height);
        if (!isLand(x, y)) {
          hits.push({
            name: city.name,
            texel: rgb(x, y),
            texturePixel: `${String(x)},${String(y)}`,
            pixelsToLand: distanceToLand(x, y),
          });
        }
      }
      return hits;
    },
    {
      cities: cityProbes(),
      textureUrl: EARTH_TEXTURE_URL,
      searchLimit: LAND_SEARCH_LIMIT,
    },
  );

  expect(
    water,
    `these markers stand on ocean pixels of ${EARTH_TEXTURE_URL}: ${water
      .map(
        (hit: WaterHit) =>
          `${hit.name} at ${hit.texturePixel} rgb(${hit.texel.join(",")}), ${String(hit.pixelsToLand)} px from land`,
      )
      .join("; ")}`,
  ).toEqual([]);
  expect(errors).toEqual([]);
});

// ===========================================
// Label fidelity
// ===========================================

/**
 * Every city must show its name (#439). The label plate that shipped
 * with the flat camera drew no text at all, so this asserts the text is
 * there and reads the city's name.
 *
 * Two surfaces are accepted, whichever the map uses: a DOM overlay node
 * per city carrying `data-city-label="<cityId>"` with the name as its
 * text, or a dev hook `window.__tut__.cityLabel(cityId)` returning the
 * string the scene draws. A run that finds neither fails naming both, so
 * the contract is discoverable from the failure alone.
 */
test("every city shows its name as a label", async ({ page }) => {
  const errors = await openOverworld(page);

  const report = (await page.evaluate(
    (cityIds) => {
      const nodes = document.querySelectorAll<HTMLElement>("[data-city-label]");
      if (nodes.length > 0) {
        const labels: Record<string, string> = {};
        for (const node of nodes) {
          const id = node.dataset.cityLabel;
          if (id !== undefined) {
            labels[id] = (node.textContent ?? "").trim();
          }
        }
        return { source: "dom", labels };
      }
      const hooks = (
        globalThis as { __tut__?: { cityLabel?: (id: string) => string } }
      ).__tut__;
      if (typeof hooks?.cityLabel === "function") {
        const labels: Record<string, string> = {};
        for (const id of cityIds) {
          labels[id] = (hooks.cityLabel(id) ?? "").trim();
        }
        return { source: "hook", labels };
      }
      return { source: "none", labels: {} };
    },
    cityProbes().map((city) => city.id),
  )) as LabelReport;

  expect(
    report.source,
    'the overworld exposes no city labels: expected DOM nodes carrying data-city-label="<cityId>", or a dev hook __tut__.cityLabel(cityId)',
  ).not.toBe("none");

  const missing = cityProbes()
    .filter((city) => (report.labels[city.id] ?? "") === "")
    .map((city) => city.name);
  expect(
    missing,
    `cities drawing a label with no text: ${missing.join(", ")}`,
  ).toEqual([]);

  const wrong = cityProbes()
    .filter(
      (city) =>
        report.labels[city.id] !== undefined &&
        report.labels[city.id] !== "" &&
        !report.labels[city.id].includes(city.name),
    )
    .map((city) => `${city.name} -> "${report.labels[city.id]}"`);
  expect(
    wrong,
    `labels that do not name their city: ${wrong.join("; ")}`,
  ).toEqual([]);

  expect(errors).toEqual([]);
});
