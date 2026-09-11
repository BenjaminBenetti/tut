import { expect, type Page } from "@playwright/test";

import { ASSET_WARNING_PREFIX } from "../src/graphics/model/asset-logger";

/**
 * Asset-fallback warnings seen on each page, per capture.
 *
 * `GltfModelLoader`, `ManifestTextureLoader` and `SvgGlyphRasteriser` all
 * catch a failed fetch, log one `[assets]` line and carry on with
 * placeholder art — which is right for the game, and wrong for a capture:
 * the scene reaches its ordinary ready state and saves a frame of
 * something nobody meant to judge (#1021).
 *
 * Repetition cannot catch it either. #1013 made captures byte-exact, and
 * a placeholder repeats byte-exactly too, so "the same frame twice" is
 * silent about whether that frame is the real art.
 */
const fallbacks = new WeakMap<Page, string[]>();

/**
 * Starts recording asset fallback for this page.
 *
 * **Install before navigating.** The map's models are fetched during the
 * first mount, so a listener attached afterwards misses exactly the
 * warnings this exists to catch.
 *
 * @param page - The page about to be driven into a capture.
 */
export function watchAssetFallback(page: Page): void {
  // Enforced rather than asked for in a comment. A listener attached
  // after the page has navigated silently misses the first mount's
  // fetches, and the guard then reports "no fallback" from a capture it
  // never watched — the same shape of always-passing control this whole
  // guard exists to remove. Loud on misuse beats quiet and wrong.
  const url = page.url();
  if (url !== "" && url !== "about:blank") {
    throw new Error(
      `watchAssetFallback must be installed before navigating; the page is already at ${url}, so the first mount's asset fetches cannot be seen`,
    );
  }
  const seen: string[] = [];
  fallbacks.set(page, seen);
  page.on("console", (message) => {
    const text = message.text();
    if (text.includes(ASSET_WARNING_PREFIX)) {
      seen.push(text);
    }
  });
}

/**
 * Refuses a frame drawn with placeholder art, naming the asset and URL.
 *
 * Called immediately before a screenshot rather than at the end of a
 * test: the point is to reject the image, not to report afterwards that
 * the one already written cannot be trusted.
 *
 * @param page - The page being captured.
 * @param where - What was about to be shot, for the failure message.
 */
export function assertNoAssetFallback(page: Page, where: string): void {
  const seen = fallbacks.get(page);
  expect(
    seen,
    `${where}: watchAssetFallback was never installed, so this capture is unguarded`,
  ).toBeDefined();
  expect(
    seen ?? [],
    `${where}: the scene fell back to placeholder art, so the frame is not of the real thing`,
  ).toEqual([]);
}

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

/**
 * A neighbouring tile's client-pixel position, for a real pointer click
 * beside a unit.
 *
 * The hooks say where a *tile* is drawn, not which tile a unit stands
 * on, so the unit's tile is found as the one drawn nearest its feet and
 * the answer is that tile's neighbour. Searched rather than offset: the
 * first version of this guessed that "one tile away" was 24-90 px and
 * found nothing, which measured the guess and not the map.
 *
 * @param page - The page driving a live mission.
 * @param unitId - The unit to find a neighbouring tile for.
 * @returns Where to click, or undefined if no neighbour is on screen.
 */
export async function neighbourTileOf(
  page: Page,
  unitId: string,
): Promise<{ x: number; y: number } | undefined> {
  return page.evaluate((id) => {
    const hooks = (
      globalThis as {
        __tutTactical__?: {
          unitScreenPosition(
            unitId: string,
          ): { x: number; y: number } | undefined;
          tileScreenPosition(tile: {
            x: number;
            y: number;
            z: number;
          }): { x: number; y: number } | undefined;
        };
      }
    ).__tutTactical__;
    const here = hooks?.unitScreenPosition(id);
    if (!hooks || !here) {
      return undefined;
    }
    let mine: { x: number; y: number; z: number } | undefined;
    let best = Infinity;
    for (let x = 0; x < 96; x++) {
      for (let z = 0; z < 96; z++) {
        for (let y = 0; y < 4; y++) {
          const at = hooks.tileScreenPosition({ x, y, z });
          if (!at) {
            continue;
          }
          const d = Math.hypot(at.x - here.x, at.y - here.y);
          if (d < best) {
            best = d;
            mine = { x, y, z };
          }
        }
      }
    }
    if (!mine) {
      return undefined;
    }
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const at = hooks.tileScreenPosition({
        x: mine.x + (dx ?? 0),
        y: mine.y,
        z: mine.z + (dz ?? 0),
      });
      if (at) {
        return { x: at.x, y: at.y };
      }
    }
    return undefined;
  }, unitId);
}
