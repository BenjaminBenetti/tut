import { expect, test } from "@playwright/test";

/** In-scene material and edge continuity control for the three slope meshes (#798). */
test("captures the grass and sand slope terraces", async ({ page }) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to render the slope kit",
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning")
      errors.push(message.text());
  });
  await page.setViewportSize({ width: 1440, height: 880 });
  await page.goto("/tools/art/preview/terrain-slopes.html");
  await expect(page.locator("body")).toHaveAttribute(
    "data-slopes-ready",
    "true",
  );
  await page.waitForTimeout(400);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "docs/design/kits/terrain-slopes-terrace.png",
  });
});
