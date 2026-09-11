import { expect, test } from "@playwright/test";

import {
  assertNoAssetFallback,
  drawnFrame,
  tacticalModelsReady,
  tapCameraKey,
  tapCameraKeys,
  watchAssetFallback,
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
      // Seed 4242's tallest roof must be visible: the deploy-zone view
      // missed the top-focus roof regression introduced by #978.
      await tapCameraKeys(page, [
        "d",
        "s",
        "w",
        "w",
        "w",
        "w",
        "w",
        "w",
        "w",
        "w",
      ]);
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

/**
 * The guard has to fire on a genuinely broken load, or it is exactly the
 * thing #1021 was filed about: a control that always passes.
 *
 * A failed model fetch is *caught* by the loader — it logs one `[assets]`
 * line and carries on with placeholder geometry — so the scene still
 * reaches `data-tactical-ready`, and a capture would still write a
 * perfectly reproducible PNG of art nobody meant to judge. Byte-exact
 * repetition cannot reject that, because a placeholder repeats exactly
 * too.
 *
 * So this aborts one real model response, proves the scene goes ready
 * anyway, and proves the guard refuses the frame and names the asset.
 * The clean half runs in the same test, so the guard cannot pass by
 * being permanently red.
 */
test("a capture refuses a frame drawn with placeholder art", async ({
  page,
}) => {
  watchAssetFallback(page);

  // The clean half first, on the same page object: no fallback, so the
  // guard is silent. If this ever throws, the guard is over-eager and
  // the failure below would mean nothing.
  await launchMission(page, "4242");
  await tacticalModelsReady(page);
  assertNoAssetFallback(page, "the unbroken capture");

  // Now break one real model and remount. `abort` is a genuine network
  // failure, not a stubbed warning.
  const broken = "**/assets/models/tiles/city-road-straight.glb";
  let aborted = false;
  await page.route(broken, async (route) => {
    aborted = true;
    await route.abort();
  });
  await page.reload();
  await expect(page.locator("body")).toHaveAttribute("data-app-state", "ready");
  await launchMission(page, "4242");

  // The scene reaches its ordinary ready state regardless — which is the
  // whole problem, and why readiness alone cannot be the check.
  await expect(page.locator("body")).toHaveAttribute(
    "data-tactical-ready",
    "true",
  );
  expect(aborted, "the model request was never made").toBe(true);

  // And the capture is refused, naming what fell back.
  let refusal = "";
  try {
    assertNoAssetFallback(page, "the broken capture");
  } catch (error: unknown) {
    refusal = error instanceof Error ? error.message : String(error);
  }
  expect(refusal, "the guard accepted a placeholder frame").not.toBe("");
  expect(refusal).toContain("city-road-straight.glb");
  expect(refusal).toContain("placeholder");
});
