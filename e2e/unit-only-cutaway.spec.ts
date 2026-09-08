import { expect, test } from "@playwright/test";
import { drawnFrame } from "./capture-frame.helper";

/** The same building stays closed or squad-revealed when the real pointer enters it. */
test("hovering a roof leaves the closed and squad-only frames unchanged", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 950 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const units of [0, 1]) {
    await page.mouse.move(-10, -10);
    await page.goto(
      `/tools/art/preview/roof-cutaway.html?roof=pitched&yaw=0&units=${units}&pointer=1`,
    );
    const body = page.locator("body");
    await expect(body).toHaveAttribute("data-ready", "true");
    await expect(body).toHaveAttribute("data-ghost-count", String(units));
    await expect(body).toHaveAttribute("data-radius", "4");
    await expect(body).toHaveAttribute("data-floor", "0.175");
    await drawnFrame(page);
    const control = await page.screenshot();
    await page.mouse.move(760, 405);
    // Observe beyond the removed dwell/fade. This is the absence being tested,
    // not an assumed asset-load or camera-settling delay.
    await page.evaluate(async () => {
      const start = performance.now();
      do {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
      } while (performance.now() - start < 500);
    });
    await drawnFrame(page);
    const hovered = await page.screenshot();
    expect(
      hovered.equals(control),
      `${units} units: pointer changed the reveal`,
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});
