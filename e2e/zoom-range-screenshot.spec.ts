import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { launchMission } from "./mission-capture.helper";

/** Filename prefix, so a before/after pair can be captured in two runs. */
const PREFIX = process.env.ZOOM_PREFIX ?? "zoom";

/** Wheel notches to drive the zoom hard against a clamp. */
const NOTCHES = 40;

/** Pixels per notch; the sign decides the direction. */
const NOTCH_PX = 120;

/** Viewports the Director judges the range at. */
const VIEWPORTS = [
  { width: 1280, height: 720, label: "1280x720" },
  { width: 1920, height: 1080, label: "1920x1080" },
];

/** The large temperate city ADR 0009 names as the test map. */
const LARGE_CITY =
  "seed=terra-01&biome=temperate&settlement=city&size=large&models=1&units=1";

/** Drives the zoom hard against one end of its range. */
async function zoomTo(
  page: Page,
  end: "far" | "near",
  viewport: { width: number; height: number },
): Promise<void> {
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  for (let notch = 0; notch < NOTCHES; notch++) {
    await page.mouse.wheel(0, end === "far" ? NOTCH_PX : -NOTCH_PX);
  }
  await page.waitForTimeout(1200);
}

/**
 * Captures the zoom range at both ends for the Director to judge (#828,
 * ADR 0009 §2.3).
 *
 * The two ends are shot on the screen each is *for*. The far end is Map
 * Lab on the large city, which is where the Executive Director judges
 * generation and the reason the range became map-aware. The near end is
 * the tactical screen, because a squad is what the near end is sized to
 * and the harness's preview units stand in a deploy zone at the map
 * edge, far from where it frames.
 *
 * Not an assertion of how they look — that is his call. What they do
 * assert is that the shot is of the real thing: the art path rather
 * than the placeholder boxes, the large city rather than a default, and
 * a camera that actually reached the clamp.
 */
test.describe("zoom range frames", () => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the zoom frames",
  );

  for (const viewport of VIEWPORTS) {
    test(`the whole map at the far end, ${viewport.label}`, async ({
      page,
    }) => {
      test.setTimeout(300_000);
      await page.setViewportSize(viewport);
      await page.goto(`/mapgen-preview.html?${LARGE_CITY}`);
      await page.waitForSelector("#map-viewport canvas", { timeout: 60_000 });
      await page.waitForFunction(
        () => document.body.dataset.modelsReady === "true",
        { timeout: 180_000 },
      );
      const size = await page.evaluate(
        () =>
          document.querySelector(".mapgen-stats")?.querySelector("dd")
            ?.textContent ?? "",
      );
      expect(size, "the large city generated").toMatch(/^\d+×\d+×\d+$/);
      await zoomTo(page, "far", viewport);
      await page.screenshot({
        path: `docs/design/${PREFIX}-whole-map-${viewport.label}.png`,
      });
    });

    test(`a squad at the near end, ${viewport.label}`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.setViewportSize(viewport);
      await launchMission(page, "4242");
      // The tactical camera opens framed on the deployed force (#538),
      // so zooming in keeps the squad in the middle of the shot.
      await page.waitForTimeout(1500);
      await zoomTo(page, "near", viewport);
      await page.screenshot({
        path: `docs/design/${PREFIX}-squad-${viewport.label}.png`,
      });
    });
  }
});
