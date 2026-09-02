import { expect, test } from "@playwright/test";

/**
 * The map generation preview page generates a fixed seed on load, renders
 * it through the isometric rig and marks the body ready after the first
 * frame. Any console error (including a `MapGenerationError` surfaced by
 * the panel) fails the test.
 */
test("mapgen preview renders a fixed seed without console errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  await page.goto(
    "/mapgen-preview.html?seed=smoke&biome=coastal&settlement=town&size=small",
  );

  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-app-state", "ready");
  await expect(page.locator("body")).toHaveAttribute("data-map-seed", "smoke");
  await expect(page.locator("#status")).toBeEmpty();
  await expect(page.locator("#ascii")).not.toBeEmpty();
  await expect(page.locator("#stats")).toContainText("Buildings");
  expect(errors).toEqual([]);
});
