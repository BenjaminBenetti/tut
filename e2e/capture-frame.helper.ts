import { expect, type Page } from "@playwright/test";

/** Wait for fonts and a draw after the preceding scene/input change. */
export async function drawnFrame(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

/** Unit count alone can precede replacement of the map's placeholder art. */
export async function tacticalModelsReady(page: Page): Promise<void> {
  await expect(page.locator("body")).toHaveAttribute(
    "data-tactical-ready",
    "true",
  );
  await drawnFrame(page);
}

/**
 * Deliver a capture's tap through the real DOM handler in one browser task.
 * Playwright's separate keydown/keyup deliveries can straddle rendered frames:
 * a nominal tap then includes continuous held-key pan, which changes framing
 * with machine load. Gameplay input tests should still use real keyboard input.
 */
export async function tapCameraKey(page: Page, key: string): Promise<void> {
  await page.evaluate((key) => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true }),
    );
    document.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
  }, key);
  await drawnFrame(page);
}
