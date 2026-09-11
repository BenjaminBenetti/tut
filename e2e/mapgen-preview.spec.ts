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
  const levels = page.locator("#level");
  await expect(levels).toHaveAttribute("step", "2");
  await levels.fill("2");
  await expect(levels.locator("..")).toContainText("≤ 1");
  await levels.fill("0");
  await expect(levels.locator("..")).toContainText("≤ 0");
  await expect(page.locator("#status")).toBeEmpty();
  expect(errors).toEqual([]);
});

/** A shared Map Lab URL must reproduce the campaign's local identity after reload. */
test("Map Lab keeps the selected place through generation and reload", async ({
  page,
}) => {
  await page.goto(
    "/mapgen-preview.html?seed=1892582247&biome=temperate&settlement=city&size=small&place=lagos",
  );
  await expect(page.locator("body")).toHaveAttribute("data-app-state", "ready");
  await expect(page.locator("#place")).toHaveValue("lagos");
  await page.locator("#next-seed").click();
  await expect(page).toHaveURL(/place=lagos/);
  await page.reload();
  await expect(page.locator("body")).toHaveAttribute("data-app-state", "ready");
  await expect(page.locator("#place")).toHaveValue("lagos");
  await page.locator("#place").selectOption("");
  await page.locator("#next-seed").click();
  await expect(page).not.toHaveURL(/place=/);
  await expect(page.locator("#status")).toBeEmpty();
});
