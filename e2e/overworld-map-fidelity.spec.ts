/// <reference lib="dom" />
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { TutTestHooks } from "../src/app/model/test-hooks";
import { EARTH_COASTLINES } from "../src/graphics/data/earth-coastlines";
import { OVERWORLD_SCENE_CONFIG } from "../src/graphics/model/overworld-scene-config";
import { projectCoastlines } from "../src/graphics/service/coastline-projection";
import { layoutToWorld } from "../src/graphics/service/overworld-layout";
import { EARTH_MAP } from "../src/overworld/data/earth-map";
import { MAP_READY_ATTRIBUTE } from "../src/ui/model/map-viewport-host";

// ===========================================
// Types
// ===========================================

/** The page's global object as seen from `page.evaluate`, with the dev hooks. */
interface HookGlobal {
  __tut__?: TutTestHooks;
}

/** A client-pixel point. */
interface Point {
  readonly x: number;
  readonly y: number;
}

/** A client-pixel rectangle. */
interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Layout space → client pixels, as fitted from two markers. */
interface ScreenFit {
  readonly originX: number;
  readonly originY: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

/**
 * One coastal city, where its nearest drawn coast vertex projects to, and
 * where the coast is probed for a pixel: the nearest vertex clear of
 * every settlement model.
 */
interface CoastProbe {
  readonly id: string;
  readonly marker: Point;
  readonly coast: Point;
  readonly visible: Point;
  readonly coastDistancePx: number;
}

/** What the screenshot showed at each probe. */
interface ProbeReport {
  readonly coastPixels: number;
  readonly missingCoast: string[];
  readonly litOcean: number;
}

// ===========================================
// Constants
// ===========================================

/**
 * Coastal cities the wireframe has to put on their coast: spread over
 * every ocean, several of them the ones the drawn texture used to miss
 * (#439), now with no nudge table behind them (#1144).
 */
const COASTAL_SAMPLE = [
  "new-york",
  "tokyo",
  "sydney",
  "auckland",
  "reykjavik",
  "singapore",
  "lisbon",
  "cairo",
];

/** Two cities far apart in both axes, to fit layout → screen from. */
const FIT_PAIR = ["vancouver", "sydney"] as const;

/**
 * How far from a marker its nearest drawn coast vertex may be, in
 * client pixels. At the default zoom the map is 960 px for 360°, so
 * this is six degrees: a coastal city whose coast is further away than
 * that is a marker in open water.
 */
const MAX_COAST_DISTANCE_PX = 16;

/** Half-size of the window searched for a coast pixel around a vertex. */
const PROBE_RADIUS_PX = 4;

/**
 * The fewest coastline pixels a full map may draw. Earth's 110m
 * coastline is over 15 000 px long at the default zoom; a tenth of that
 * still fails on a map with no lines, and passes one that is cropped.
 */
const MIN_COAST_PIXELS = 1500;

/** Open ocean, off every graticule line: the map must be dark here. */
const OPEN_OCEAN = { latitude: -10, longitude: -140 };

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
 * Waits until the map is worth measuring: the app says so (#473). The
 * screen attribute flips before the camera has been rebuilt for the
 * map cell, so for two frames every projected position is wrong.
 */
async function waitForMapSettled(page: Page): Promise<void> {
  await expect(page.locator("body")).toHaveAttribute(
    MAP_READY_ATTRIBUTE,
    "true",
    { timeout: 10000 },
  );
}

/** Where each city's marker is drawn, in client pixels. */
async function markerAnchors(
  page: Page,
  cityIds: readonly string[],
): Promise<Record<string, Point | null>> {
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

/** The layout of a shipped city. */
function layoutOf(cityId: string): { x: number; y: number } {
  const city = EARTH_MAP.cities.find((candidate) => candidate.id === cityId);
  if (!city) {
    throw new Error(`EARTH_MAP has no city ${cityId}`);
  }
  return city.layout;
}

/**
 * Fits the axis-aligned layout → screen mapping from two markers. The
 * orientation spec proves the map is axis aligned with one scale; this
 * only needs the numbers.
 */
function fitScreen(anchors: Record<string, Point | null>): ScreenFit {
  const [a, b] = FIT_PAIR;
  const pa = anchors[a];
  const pb = anchors[b];
  if (!pa || !pb) {
    throw new Error(`fit cities ${a} and ${b} did not project`);
  }
  const la = layoutOf(a);
  const lb = layoutOf(b);
  const scaleX = (pb.x - pa.x) / (lb.x - la.x);
  const scaleY = (pb.y - pa.y) / (lb.y - la.y);
  return {
    scaleX,
    scaleY,
    originX: pa.x - scaleX * la.x,
    originY: pa.y - scaleY * la.y,
  };
}

/** A layout point on screen. */
function toScreen(fit: ScreenFit, layout: { x: number; y: number }): Point {
  return {
    x: fit.originX + fit.scaleX * layout.x,
    y: fit.originY + fit.scaleY * layout.y,
  };
}

/** A pair of drawn coast vertices for one city, in layout space. */
interface CoastVertices {
  /** The ring vertex closest to the city: how far its marker is from the coast. */
  readonly nearest: { x: number; y: number };
  /** The closest ring vertex no settlement model covers: where a coast pixel can be seen. */
  readonly clear: { x: number; y: number };
}

/**
 * The drawn coast vertices a city is measured against. Every ring
 * vertex lies on a drawn segment, so a coast pixel must be there, but
 * since #1155 every city stands as an opaque settlement model inside a
 * halo, so the vertex nearest a coastal city is usually under a model.
 * The pixel probe therefore reads the closest vertex that is at least a
 * `settlementFootprint` from every city.
 */
function coastVertices(cityId: string): CoastVertices {
  const config = OVERWORLD_SCENE_CONFIG;
  const world = layoutToWorld(layoutOf(cityId), config);
  const cities = EARTH_MAP.cities.map((city) =>
    layoutToWorld(city.layout, config),
  );
  const covered = (vertex: { x: number; z: number }): boolean =>
    cities.some(
      (city) =>
        Math.hypot(vertex.x - city.x, vertex.z - city.z) <
        config.settlementFootprint,
    );
  let nearest = { x: 0, z: 0 };
  let nearestDistance = Number.POSITIVE_INFINITY;
  let clear = { x: 0, z: 0 };
  let clearDistance = Number.POSITIVE_INFINITY;
  for (const polygon of projectCoastlines(EARTH_COASTLINES, config)) {
    for (const ring of [polygon.outer, ...polygon.holes]) {
      for (const vertex of ring) {
        const distance = Math.hypot(vertex.x - world.x, vertex.z - world.z);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = vertex;
        }
        if (distance < clearDistance && !covered(vertex)) {
          clearDistance = distance;
          clear = vertex;
        }
      }
    }
  }
  const toLayout = (vertex: { x: number; z: number }) => ({
    x: vertex.x / config.mapWidth,
    y: vertex.z / config.mapDepth,
  });
  return { nearest: toLayout(nearest), clear: toLayout(clear) };
}

// ===========================================
// Markers on the drawn coast
// ===========================================

/**
 * The strategic map draws the Earth as vector coastlines through the
 * same projection the markers use (#1144), so a coastal city's marker
 * must stand on a drawn coast: the coast vertex nearest the city
 * projects to within a few pixels of the marker, and the screenshot
 * shows a coastline-coloured pixel at the nearest coast vertex that no
 * settlement model covers (#1155).
 *
 * ```
 *   city layout ──▶ nearest ring vertex ──▶ screen (fitted from markers)
 *              └──▶ nearest clear vertex ──▶ screen ──▶ cyan pixel in a 9×9 window?
 * ```
 *
 * Two controls keep the measurement honest: the whole plate must draw
 * a coastline's worth of coast pixels, and open ocean must stay dark.
 */
test("coastal city markers stand on the drawn coastline", async ({ page }) => {
  const errors = await openOverworld(page);
  await waitForMapSettled(page);

  const anchors = await markerAnchors(page, [...FIT_PAIR, ...COASTAL_SAMPLE]);
  const fit = fitScreen(anchors);
  // A 2:1 plane drawn with one scale: the two axes agree.
  expect(fit.scaleX / fit.scaleY).toBeGreaterThan(1.95);
  expect(fit.scaleX / fit.scaleY).toBeLessThan(2.05);

  const cell = await page.locator("#map-viewport").boundingBox();
  if (!cell) {
    throw new Error("The overworld has no #map-viewport");
  }
  // The map cell ends where the Situation panel's column begins, so a
  // coast that projects past it is clipped, not drawn: this is a check
  // of where the coast is drawn, not of the panel's width (#1151), so
  // those cities are left out rather than failed.
  const hidden = (point: Point): boolean =>
    point.x + PROBE_RADIUS_PX > cell.x + cell.width ||
    point.x - PROBE_RADIUS_PX < cell.x ||
    point.y + PROBE_RADIUS_PX > cell.y + cell.height ||
    point.y - PROBE_RADIUS_PX < cell.y;
  const probes: CoastProbe[] = [];
  for (const id of COASTAL_SAMPLE) {
    const marker = anchors[id];
    if (!marker) {
      throw new Error(`${id} did not project`);
    }
    const vertices = coastVertices(id);
    const coast = toScreen(fit, vertices.nearest);
    const visible = toScreen(fit, vertices.clear);
    if (hidden(coast) || hidden(visible)) {
      continue;
    }
    probes.push({
      id,
      marker,
      coast,
      visible,
      coastDistancePx: Math.hypot(coast.x - marker.x, coast.y - marker.y),
    });
  }
  const adrift = probes.filter(
    (probe) => probe.coastDistancePx > MAX_COAST_DISTANCE_PX,
  );
  expect(
    adrift.map(
      (probe) => `${probe.id}: ${probe.coastDistancePx.toFixed(1)} px`,
    ),
    `markers further than ${String(MAX_COAST_DISTANCE_PX)} px from the drawn coast`,
  ).toEqual([]);

  const plate: Box = {
    x: Math.max(cell.x, fit.originX),
    y: Math.max(cell.y, fit.originY),
    width:
      Math.min(cell.x + cell.width, fit.originX + fit.scaleX) -
      Math.max(cell.x, fit.originX),
    height:
      Math.min(cell.y + cell.height, fit.originY + fit.scaleY) -
      Math.max(cell.y, fit.originY),
  };
  const ocean = toScreen(fit, {
    x: (OPEN_OCEAN.longitude + 180) / 360,
    y: (90 - OPEN_OCEAN.latitude) / 180,
  });
  const shot = `data:image/png;base64,${(await page.screenshot()).toString("base64")}`;

  const report: ProbeReport = await page.evaluate(
    async ({ shot, plate, probes, ocean, radius }) => {
      const bitmap = await createImageBitmap(await (await fetch(shot)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("No 2d context available");
      }
      context.drawImage(bitmap, 0, 0);
      const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
      /** The pixel at `(x, y)`, clamped into the image. */
      const rgb = (x: number, y: number): [number, number, number] => {
        const cx = Math.min(image.width - 1, Math.max(0, Math.round(x)));
        const cy = Math.min(image.height - 1, Math.max(0, Math.round(y)));
        const index = (cy * image.width + cx) * 4;
        return [
          image.data[index],
          image.data[index + 1],
          image.data[index + 2],
        ];
      };
      /**
       * The coastline tone, `ui-info` and its glow: blue-led, blue at
       * least as strong as green, and well clear of red. Orange markers,
       * the grey graticule, white labels and green washes all fail it.
       */
      const isCoast = (x: number, y: number): boolean => {
        const [r, g, b] = rgb(x, y);
        return b >= 150 && b >= g && b - r >= 40;
      };
      /** True when any pixel within `radius` of the point is coast. */
      const coastNear = (point: { x: number; y: number }): boolean => {
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (isCoast(point.x + dx, point.y + dy)) {
              return true;
            }
          }
        }
        return false;
      };

      let coastPixels = 0;
      for (let y = Math.ceil(plate.y); y < plate.y + plate.height; y++) {
        for (let x = Math.ceil(plate.x); x < plate.x + plate.width; x++) {
          if (isCoast(x, y)) {
            coastPixels++;
          }
        }
      }
      let litOcean = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const [r, g, b] = rgb(ocean.x + dx, ocean.y + dy);
          if (r + g + b > 90) {
            litOcean++;
          }
        }
      }
      return {
        coastPixels,
        missingCoast: probes
          .filter((probe) => !coastNear(probe.visible))
          .map((probe) => probe.id),
        litOcean,
      };
    },
    { shot, plate, probes, ocean, radius: PROBE_RADIUS_PX },
  );

  expect(
    report.coastPixels,
    "too few coastline pixels on the plate: the wireframe Earth is not drawn",
  ).toBeGreaterThan(MIN_COAST_PIXELS);
  expect(
    report.missingCoast,
    `no coastline pixel drawn where these cities' coast should be: ${report.missingCoast.join(", ")}`,
  ).toEqual([]);
  expect(report.litOcean, "open ocean is not dark").toBe(0);
  expect(errors).toEqual([]);
});

// ===========================================
// City names
// ===========================================

/**
 * A city must show its name, not a blank plate (#439). The name is drawn
 * in the scene for the hovered or selected city, so this selects a city
 * and asserts that fresh marks appear on the ground just below its
 * settlement model, outside the selection ring (#1155: the label sits
 * `settlementFootprint × 1.15` south of the city, past the ring's outer
 * edge of `settlementFootprint × 0.83`, so at the initial 64 px/unit the
 * ring ends 32 px below the anchor and the label spans roughly 33–55 px).
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
    // A band below the settlement model, clear of it and its selection ring.
    const band = {
      x: Math.round(anchor.x) - 55,
      y: Math.round(anchor.y) + 34,
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
