/// <reference lib="dom" />
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { TutTestHooks } from "../src/app/model/test-hooks";
import { EARTH_MAP } from "../src/overworld/data/earth-map";

// ===========================================
// Types
// ===========================================

/** The page's global object as seen from `page.evaluate`, with the dev hooks. */
interface HookGlobal {
  __tut__?: TutTestHooks;
}

/** A client-pixel rectangle. */
interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A city whose marker stands on water, with how far the nearest land is. */
interface WaterHit {
  readonly name: string;
  readonly texel: readonly number[];
  readonly texturePixel: string;
  readonly pixelsToLand: number;
}

/** What the plate looks like on screen and what stands on it. */
interface MarkerReport {
  readonly plate: Box;
  readonly aspect: number;
  readonly measured: number;
  readonly water: readonly WaterHit[];
}

// ===========================================
// Constants
// ===========================================

/**
 * Public URL of the Earth albedo the slab is textured with. The path is
 * `TEXTURE_MANIFEST["overworld.earth-map"]`, written out here because
 * importing that module pulls `import.meta.env` into the Node-side test
 * project.
 */
const EARTH_TEXTURE_URL = "/assets/textures/overworld/earth-map_albedo.png";

/** How far the search for solid land gives up, in texture pixels. */
const LAND_SEARCH_LIMIT = 80;

/**
 * How far from solid land a marker may stand, in texture pixels. The
 * coastline is a stylised drawing and a marker on a headland can sample
 * a pixel the art paints as sea; four texture pixels is under two screen
 * pixels at the default camera, so it is invisible under the glyph.
 * Anything past that is a marker sitting in open water, which is #439.
 */
const MAX_PIXELS_FROM_LAND = 4;

/** The slab is a 24 × 12 plane, so its drawn rectangle must stay 2:1. */
const PLATE_ASPECT = { min: 1.95, max: 2.05 };

/** Cities used for the label check: well inside the plate, spread widely. */
const LABEL_SAMPLE = ["london", "chicago", "cairo", "sao-paulo", "beijing"];

// ===========================================
// Helpers
// ===========================================

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

/**
 * Waits until the map canvas has taken the size of its cell. The scene
 * is mounted a frame or two after the screen appears, and measuring the
 * plate before that reads a half-resized render.
 */
async function waitForMapSettled(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const canvas = document.querySelector("#map-viewport canvas");
          const cell = document.getElementById("map-viewport");
          if (!canvas || !cell) {
            return -1;
          }
          const drawn = canvas.getBoundingClientRect();
          const box = cell.getBoundingClientRect();
          return Math.round(
            Math.abs(drawn.width - box.width) +
              Math.abs(drawn.height - box.height),
          );
        }),
      { timeout: 10000 },
    )
    .toBeLessThanOrEqual(2);
  await page.waitForTimeout(250);
}

/** Where each city's marker is drawn, in client pixels. */
async function markerAnchors(
  page: Page,
  cityIds: readonly string[],
): Promise<Record<string, { x: number; y: number } | null>> {
  return page.evaluate(
    (ids) =>
      Object.fromEntries(
        ids.map((id) => {
          const point = (globalThis as HookGlobal).__tut__?.cityScreenPosition(
            id,
          );
          return [id, point ? { x: point.x, y: point.y } : null];
        }),
      ),
    cityIds,
  );
}

// ===========================================
// Markers on land
// ===========================================

/**
 * No city marker may stand on an ocean pixel of the Earth texture (#439).
 *
 * This reads the render, not the data, so it holds however the markers
 * are placed: it finds the plate's rectangle on screen, turns each
 * marker's drawn anchor into a texture coordinate, and samples the
 * albedo there. Ocean is blue-dominant; green, sand, rock and polar
 * white all count as ground, and five of the nine pixels around the
 * sample must be ground so one antialiased coast pixel cannot decide it.
 *
 * ```
 *   marker anchor (px) ──▶ (anchor − plate) / plate ──▶ texel ──▶ blue? ──▶ fail
 * ```
 *
 * A failure names every offending city and how far solid land is, so the
 * size of the error is visible without re-running anything.
 */
test("no city marker stands on an ocean pixel", async ({ page }) => {
  const errors = await openOverworld(page);

  await waitForMapSettled(page);

  const cityIds = EARTH_MAP.cities.map((city) => city.id);
  const names = Object.fromEntries(
    EARTH_MAP.cities.map((city) => [city.id, city.name]),
  );
  const anchors = await markerAnchors(page, cityIds);
  const cell = await page.locator("#map-viewport").boundingBox();
  if (!cell) {
    throw new Error("The overworld has no #map-viewport");
  }
  const shot = `data:image/png;base64,${(await page.screenshot()).toString("base64")}`;

  const report: MarkerReport = await page.evaluate(
    async ({
      shot,
      cell,
      anchors,
      names,
      textureUrl,
      searchLimit,
      tolerance,
    }) => {
      /** Decodes an image into raw pixels. */
      const load = async (
        url: string,
      ): Promise<{ w: number; h: number; px: Uint8ClampedArray }> => {
        const bitmap = await createImageBitmap(await (await fetch(url)).blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("No 2d context available");
        }
        context.drawImage(bitmap, 0, 0);
        return {
          w: bitmap.width,
          h: bitmap.height,
          px: context.getImageData(0, 0, bitmap.width, bitmap.height).data,
        };
      };
      /** The pixel at `(x, y)`, clamped into the image. */
      const rgb = (
        image: { w: number; h: number; px: Uint8ClampedArray },
        x: number,
        y: number,
      ): number[] => {
        const cx = Math.min(image.w - 1, Math.max(0, Math.round(x)));
        const cy = Math.min(image.h - 1, Math.max(0, Math.round(y)));
        const index = (cy * image.w + cx) * 4;
        return [image.px[index], image.px[index + 1], image.px[index + 2]];
      };

      const texture = await load(textureUrl);
      const screen = await load(shot);

      /** True for the albedo's ocean blue. */
      const isOcean = (x: number, y: number): boolean => {
        const [r, g, b] = rgb(texture, x, y);
        return b > r + 18 && b >= g && b > 45;
      };
      /** True when most of the 3×3 block around the texel is ground. */
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
      /** Rings outward until solid land is found. */
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

      // The plate is the lit region inside the map cell; everything
      // around it is the page background.
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = -1;
      let maxY = -1;
      for (
        let y = Math.round(cell.y);
        y < Math.round(cell.y + cell.height);
        y++
      ) {
        for (
          let x = Math.round(cell.x);
          x < Math.round(cell.x + cell.width);
          x++
        ) {
          const [r, g, b] = rgb(screen, x, y);
          if (r + g + b > 110) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      }
      const plate = {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      };

      const water: WaterHit[] = [];
      let measured = 0;
      for (const [id, anchor] of Object.entries(anchors)) {
        if (!anchor) {
          continue;
        }
        const u = (anchor.x - plate.x) / plate.width;
        const v = (anchor.y - plate.y) / plate.height;
        if (u < 0 || u > 1 || v < 0 || v > 1) {
          continue; // Drawn outside the plate: clipped, not mis-placed.
        }
        measured++;
        const x = Math.round(u * texture.w);
        const y = Math.round(v * texture.h);
        if (!isLand(x, y)) {
          const pixelsToLand = distanceToLand(x, y);
          if (pixelsToLand > tolerance) {
            water.push({
              name: names[id],
              texel: rgb(texture, x, y),
              texturePixel: `${String(x)},${String(y)}`,
              pixelsToLand,
            });
          }
        }
      }
      return {
        plate,
        aspect: plate.width / plate.height,
        measured,
        water,
      };
    },
    {
      shot,
      cell,
      anchors,
      names,
      textureUrl: EARTH_TEXTURE_URL,
      searchLimit: LAND_SEARCH_LIMIT,
      tolerance: MAX_PIXELS_FROM_LAND,
    },
  );

  // Guard the measurement itself: a clipped plate would make every
  // texture coordinate wrong and the result meaningless.
  expect(
    report.aspect,
    `the plate is drawn ${report.plate.width}×${report.plate.height}, which is not the slab's 2:1 — the camera default changed and this measurement cannot be trusted`,
  ).toBeGreaterThan(PLATE_ASPECT.min);
  expect(report.aspect).toBeLessThan(PLATE_ASPECT.max);
  expect(
    report.measured,
    "no city marker was measured against the plate",
  ).toBeGreaterThanOrEqual(EARTH_MAP.cities.length - 2);

  expect(
    report.water,
    `markers standing in open water on ${EARTH_TEXTURE_URL}, more than ${String(MAX_PIXELS_FROM_LAND)} px from land: ${report.water
      .map(
        (hit) =>
          `${hit.name} at ${hit.texturePixel} rgb(${hit.texel.join(",")}), ${String(hit.pixelsToLand)} px from land`,
      )
      .join("; ")}`,
  ).toEqual([]);
  expect(errors).toEqual([]);
});

// ===========================================
// City names
// ===========================================

/**
 * A city must show its name, not a blank plate (#439). The name is drawn
 * in the scene for the hovered or selected city, so this selects a city
 * and asserts that fresh marks appear on the ground just below its
 * marker, outside the selection ring.
 *
 * Reading the string itself needs a dev hook the map does not expose
 * yet; when one lands (`__tut__.cityLabel(cityId)`), assert the text
 * here too. Until then this catches the defect that shipped: a label
 * that draws nothing.
 */
test("selecting a city draws its name under the marker", async ({ page }) => {
  const errors = await openOverworld(page);

  await waitForMapSettled(page);
  const anchors = await markerAnchors(page, LABEL_SAMPLE);
  const blank: string[] = [];
  for (const id of LABEL_SAMPLE) {
    const anchor = anchors[id];
    if (!anchor) {
      continue;
    }
    // A band below the marker, clear of the marker glyph and its ring.
    const band = {
      x: Math.round(anchor.x) - 55,
      y: Math.round(anchor.y) + 10,
      width: 110,
      height: 26,
    };
    const before = await page.screenshot({ clip: band });
    await page.evaluate(
      (cityId) => (globalThis as HookGlobal).__tut__?.selectCity(cityId),
      id,
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-selected-city",
      id,
    );
    const after = await page.screenshot({ clip: band });
    if (before.equals(after)) {
      blank.push(id);
    }
  }

  expect(
    blank,
    `selecting these cities drew nothing under their marker, so their name label is missing or blank: ${blank.join(", ")}`,
  ).toEqual([]);
  expect(errors).toEqual([]);
});
