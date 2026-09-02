import { expect, test } from "@playwright/test";

test("boots headless without console errors and renders a canvas", async ({
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

  await page.goto("/");

  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-app-state", "ready");
  expect(errors).toEqual([]);
});
