import { expect, test } from "@playwright/test";

/** The diagonal-chain acceptance composite uses the shipped scene consumer. */
test("captures the diagonal-slope kit in grass and snow", async ({ page }) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to capture the diagonal-slope kit",
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning")
      errors.push(message.text());
  });
  await page.setViewportSize({ width: 2400, height: 1382 });
  await page.goto("/tools/art/preview/diagonal-slopes.html");
  await expect(page.locator("body")).toHaveAttribute(
    "data-diagonal-slopes-ready",
    "true",
    { timeout: 30_000 },
  );
  await page.waitForTimeout(400);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "docs/design/kits/diagonal-slopes-composite.png",
  });
});
