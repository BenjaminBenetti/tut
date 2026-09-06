import { writeFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

/**
 * The two #799 controls, captured through the harness so they cannot go
 * stale the next time the generator moves (#728): the city control, where a
 * graded plat has no natural step and so no slope, and a terrain-heavy
 * snowy rural seed with five levels, where every terrace edge is a wedge.
 *
 *   CAPTURE=1 pnpm exec playwright test e2e/slope-screenshot.spec.ts
 */
const CONTROLS = [
  {
    query: "seed=730982385&biome=temperate&settlement=city&size=small",
    seed: "730982385",
    file: "docs/design/shots/799-preview-control-seed730982385.png",
  },
  {
    query: "seed=hills-1&biome=snowy&settlement=rural&size=medium",
    seed: "hills-1",
    file: "docs/design/shots/799-preview-terrain-heavy-snowy-rural-hills-1.png",
  },
  // #808: the same hillside in half steps, and a big city so the graded
  // plat, its buildings and its man-made edges are judged at the new unit.
  {
    query: "seed=hills-1&biome=snowy&settlement=rural&size=medium",
    seed: "hills-1",
    file: "docs/design/shots/808-preview-half-steps-snowy-rural-hills-1.png",
  },
  {
    query: "seed=big-city&biome=temperate&settlement=city&size=large",
    seed: "big-city",
    file: "docs/design/shots/808-preview-big-city-temperate-large.png",
  },
  // #829: the same big city and a rural map at the ADR 0009 scale.
  {
    query: "seed=big-city&biome=temperate&settlement=city&size=large",
    seed: "big-city",
    file: "docs/design/shots/829-preview-big-city-temperate-large.png",
  },
  {
    query: "seed=hills-1&biome=temperate&settlement=rural&size=medium",
    seed: "hills-1",
    file: "docs/design/shots/829-preview-rural-temperate-medium-hills-1.png",
  },
  // #847: QA's J2 seed from the #813 catalogue, where a terrace stopped
  // ramping beside a plot, and the two #799 controls at the new scale.
  {
    query:
      "seed=qa813-temperate-rural-small-0&biome=temperate&settlement=rural&size=small",
    seed: "qa813-temperate-rural-small-0",
    file: "docs/design/shots/847-preview-lot-margin-qa813-temperate-rural-small-0.png",
  },
  {
    query: "seed=730982385&biome=temperate&settlement=city&size=small",
    seed: "730982385",
    file: "docs/design/shots/847-preview-control-seed730982385.png",
  },
  {
    query: "seed=hills-1&biome=snowy&settlement=rural&size=medium",
    seed: "hills-1",
    file: "docs/design/shots/847-preview-terrain-heavy-snowy-rural-hills-1.png",
  },
  // The same city cut at its ground floors (`?floor=0`), so the interiors
  // are judged as structures: corridors, doorways, cover, stairs.
  {
    query: "seed=big-city&biome=temperate&settlement=city&size=large&floor=0",
    seed: "big-city",
    file: "docs/design/shots/829-preview-big-city-ground-floor-cut.png",
  },
  // #863: QA's K2 seed, the carriageway seam at (32, 2, 11..13) with a
  // detail crop around it; K1's one-layer kerb at (33, 2, 10) is in frame.
  {
    query:
      "seed=qa813-temperate-town-small-0&biome=temperate&settlement=town&size=small&units=1",
    seed: "qa813-temperate-town-small-0",
    file: "docs/design/shots/863-preview-k2-carriageway-seam-qa813-temperate-town-small-0.png",
    detail: { x: 32, y: 2, z: 12 },
  },
] as const;

/** Client-pixel crop around a tile, for a detail frame. */
const DETAIL = { width: 700, height: 500 };

/** Frames counted over this long give the big city's frame rate. */
const FRAME_SAMPLE_MS = 3000;

/** Where the large city's frame rate is written beside its capture. */
const FRAME_RATE_FILE = "docs/design/shots/829-big-city-frame-rate.txt";

for (const control of CONTROLS) {
  test(`captures ${control.file.split("/").pop() ?? control.seed} without fog for review`, async ({
    page,
  }) => {
    test.skip(process.env.CAPTURE === undefined, "set CAPTURE=1 to capture");
    // A large city at the ADR 0009 scale needs well over the default
    // minute on the runner's software renderer (#829).
    test.setTimeout(300_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.setViewportSize({ width: 2400, height: 1500 });
    await page.goto(`/mapgen-preview.html?${control.query}&models=1`);
    const body = page.locator("body");
    await expect(body).toHaveAttribute("data-app-state", "ready");
    await expect(body).toHaveAttribute("data-models-ready", "true", {
      timeout: 60_000,
    });
    await expect(body).toHaveAttribute("data-map-seed", control.seed);
    await expect(page.locator("#status")).toBeEmpty();
    await expect(page.locator("#stats")).toContainText("Slopes");
    await page.mouse.move(0, 0);
    await page.waitForTimeout(400);
    expect(errors).toEqual([]);
    await page.screenshot({ path: control.file });
    if ("detail" in control) {
      // `units=1` in the query is what exposes the tile-position hook.
      const at = await page.evaluate(
        (tile) =>
          (
            globalThis as {
              __tutTactical__?: {
                tileScreenPosition(t: {
                  x: number;
                  y: number;
                  z: number;
                }): { x: number; y: number } | undefined;
              };
            }
          ).__tutTactical__?.tileScreenPosition(tile),
        control.detail,
      );
      expect(at, "the detail tile projects on screen").toBeDefined();
      if (at) {
        await page.screenshot({
          path: control.file.replace(/\.png$/, "-detail.png"),
          clip: {
            x: Math.max(0, at.x - DETAIL.width / 2),
            y: Math.max(0, at.y - DETAIL.height / 2),
            width: DETAIL.width,
            height: DETAIL.height,
          },
        });
      }
    }
    if (
      control.query.includes("size=large") &&
      !control.query.includes("floor=")
    ) {
      const frames = await page.evaluate(
        (sampleMs) =>
          new Promise<number>((resolve) => {
            let count = 0;
            const start = performance.now();
            const tick = (): void => {
              count++;
              if (performance.now() - start < sampleMs) {
                requestAnimationFrame(tick);
              } else {
                resolve(count);
              }
            };
            requestAnimationFrame(tick);
          }),
        FRAME_SAMPLE_MS,
      );
      const stats = await page
        .locator("#stats")
        .evaluate((list) =>
          [...list.querySelectorAll("dt")].map(
            (term) =>
              `${term.textContent ?? ""}: ${term.nextElementSibling?.textContent ?? ""}`,
          ),
        );
      const fps = (frames * 1000) / FRAME_SAMPLE_MS;
      writeFileSync(
        FRAME_RATE_FILE,
        [
          `${control.query} (models=1, 2400×1500, headless chromium on the runner's software renderer)`,
          `${String(frames)} frames in ${String(FRAME_SAMPLE_MS)} ms = ${fps.toFixed(1)} fps`,
          ...stats.filter((line) =>
            /^(Map|Tiles|Buildings|Props|Generated in)/.test(line),
          ),
        ].join("\n") + "\n",
      );
    }
  });
}
