import { expect, test } from "@playwright/test";

import {
  drawnFrame,
  tacticalModelsReady,
  tapCameraKey,
} from "./capture-frame.helper";
import { launchMission } from "./mission-capture.helper";

/** Exact PNG controls on the real scene, independently mounted twice. */
test("capture taps and a no-op reproduce the same rendered bytes", async ({
  browser,
  baseURL,
}) => {
  // Two complete mission mounts, each with the ordinary per-test allowance.
  test.setTimeout(test.info().timeout * 2);
  const reference: Buffer[] = [];
  for (let run = 0; run < 2; run++) {
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 800, height: 600 },
    });
    const page = await context.newPage();
    try {
      await launchMission(page, "4242");
      await tacticalModelsReady(page);
      await expect(page.locator("#phase-banner")).not.toHaveAttribute(
        "data-visible",
        "true",
      );
      await page.mouse.move(0, 0);
      for (const key of ["d", "s", "a", "w"]) await tapCameraKey(page, key);
      const viewport = page.locator("#tactical-viewport");
      const top = await viewport.screenshot({
        path: test.info().outputPath(`${run}-top.png`),
      });
      const storeys = await page
        .locator("body")
        .getAttribute("data-tactical-storeys");
      await page.evaluate(() => window.__tutTactical__!.stepLayer(1));
      await expect(page.locator("body")).toHaveAttribute(
        "data-tactical-storey",
        storeys!,
      );
      await drawnFrame(page);
      const unchanged = await viewport.screenshot({
        path: test.info().outputPath(`${run}-no-op.png`),
      });
      expect(unchanged.equals(top), "upper-bound no-op changed the PNG").toBe(
        true,
      );
      await tapCameraKey(page, "d");
      const panned = await viewport.screenshot({
        path: test.info().outputPath(`${run}-panned.png`),
      });
      expect(
        panned.equals(top),
        "the control must also observe a real change",
      ).toBe(false);
      if (run === 0) reference.push(top, panned);
      else {
        expect(
          top.equals(reference[0]),
          "fresh launch changed the top PNG",
        ).toBe(true);
        expect(
          panned.equals(reference[1]),
          "fresh launch changed the panned PNG",
        ).toBe(true);
      }
    } finally {
      await context.close();
    }
  }
});

/** A real map response stays pending after the visible unit models arrive. */
test("capture readiness waits for map art as well as units", async ({
  page,
}) => {
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route(
    "**/assets/models/tiles/city-road-straight.glb",
    async (route) => {
      requested = true;
      await held;
      await route.continue();
    },
  );
  try {
    await launchMission(page, "4242");
    await expect(page.locator("body")).toHaveAttribute(
      "data-tactical-units",
      /^[1-9]\d*$/,
    );
    await expect.poll(() => requested).toBe(true);
    await expect(page.locator("body")).not.toHaveAttribute(
      "data-tactical-ready",
      "true",
    );
  } finally {
    release();
  }
  await tacticalModelsReady(page);
});
