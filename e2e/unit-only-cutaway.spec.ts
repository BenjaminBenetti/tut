import { expect, test, type Page } from "@playwright/test";
import { drawnFrame } from "./capture-frame.helper";

/** Live diagnostics exposed by the existing production-controller roof fixture. */
interface CutawayGlobal {
  __cutawayState(): { ghostCount: number; ghostStrength: number[] };
}

// Reuse the real generated scene: loading its models twice adds no coverage.
// Default mode keeps these cases together but still runs the second after a failure.
test.describe("unit-only roof reveal", () => {
  test.describe.configure({ mode: "default" });
  let page: Page;
  const errors: string[] = [];

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 600, height: 475 } });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.mouse.move(-10, -10);
    await page.goto(
      "/tools/art/preview/roof-cutaway.html?roof=pitched&yaw=0&units=1&pointer=1",
    );
    // Actual model readiness, within the unchanged hook timeout. A short DOM
    // assertion budget is not the asset loader's completion condition.
    await page.locator('body[data-ready="true"]').waitFor();
    await expect(page.locator("body")).toHaveAttribute("data-radius", "4");
    await expect(page.locator("body")).toHaveAttribute("data-floor", "0.175");
    await settledUnits(1);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  for (const units of [1, 0]) {
    test(`hovering preserves the frame with ${units} squads`, async () => {
      await page.mouse.move(-10, -10);
      if (units === 0) {
        await page.keyboard.press("l");
        await page.locator('body[data-left="true"]').waitFor();
        await settledUnits(0);
        // Also lets the old pointer source close when verifying against main.
        await observeHover();
      }
      await drawnFrame(page);
      const control = await page.screenshot();
      // Same world point as (760,405) at 1200×950: target + (160,-70).
      await page.mouse.move(460, 167.5);
      await observeHover();
      const hovered = await page.screenshot();
      if (!hovered.equals(control)) {
        await test
          .info()
          .attach("before-hover", { body: control, contentType: "image/png" });
        await test
          .info()
          .attach("after-hover", { body: hovered, contentType: "image/png" });
      }
      expect(
        hovered.equals(control),
        `${units} squads: pointer changed the reveal`,
      ).toBe(true);
      expect(errors).toEqual([]);
    });
  }

  /** Wait for the real unit fade; no ghost parameter or renderer override. */
  async function settledUnits(count: number): Promise<void> {
    await page.waitForFunction((n) => {
      const state = (globalThis as unknown as CutawayGlobal).__cutawayState();
      return (
        state.ghostCount === n &&
        state.ghostStrength.slice(0, n).every((s) => s === 1)
      );
    }, count);
  }

  /** Observe beyond the removed dwell/fade, then compare the rendered response. */
  async function observeHover(): Promise<void> {
    await page.evaluate(async () => {
      const start = performance.now();
      do {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
      } while (performance.now() - start < 500);
    });
    await drawnFrame(page);
  }
});
