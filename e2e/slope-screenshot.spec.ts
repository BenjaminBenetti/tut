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
] as const;

for (const control of CONTROLS) {
  test(`captures the slope control ${control.seed} without fog for review`, async ({
    page,
  }) => {
    test.skip(process.env.CAPTURE === undefined, "set CAPTURE=1 to capture");
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
  });
}
