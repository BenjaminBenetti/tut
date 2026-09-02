import { expect, test } from "@playwright/test";

/**
 * Warnings carrying this prefix mean an asset fell back to a placeholder
 * (see `ASSET_WARNING_PREFIX` in graphics/service/gltf-model-loader). The
 * app keeps running on placeholders, so this is the only signal a broken
 * asset path leaves; the dev server serves index.html for missing files
 * rather than a 404, so no network error appears.
 */
const ASSET_WARNING_PREFIX = "[assets]";

test("boots headless without console errors or asset fallbacks and renders a canvas", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    const isError = message.type() === "error";
    const isAssetFallback =
      message.type() === "warning" &&
      message.text().startsWith(ASSET_WARNING_PREFIX);
    if (isError || isAssetFallback) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  await page.goto("/");

  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-app-state", "ready");
  expect(errors).toEqual([]);
});
