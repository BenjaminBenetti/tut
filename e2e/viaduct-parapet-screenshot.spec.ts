import { expect, test } from "@playwright/test";

/** Fixed no-fog control for the Director's viaduct review (#782). */
test("captures the viaduct parapets without fog for review", async ({
  page,
}) => {
  test.skip(process.env.CAPTURE === undefined, "set CAPTURE=1 to capture");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.setViewportSize({ width: 2400, height: 1500 });
  await page.goto(
    "/mapgen-preview.html?seed=730982385&biome=temperate&settlement=city&size=small&models=1",
  );
  await expect(page.locator("body")).toHaveAttribute("data-app-state", "ready");
  await expect(page.locator("body")).toHaveAttribute(
    "data-models-ready",
    "true",
  );
  await expect(page.locator("body")).toHaveAttribute(
    "data-map-seed",
    "730982385",
  );
  await expect(page.locator("#status")).toBeEmpty();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "docs/design/shots/782-preview-models-seed730982385-parapets.png",
  });
});
