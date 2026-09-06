import { expect, test } from "@playwright/test";

/** The three-sided gully acceptance composite uses the shipped scene consumer. */
test("captures the three-sided-slope kit in grass and snow", async ({
  page,
}) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to capture the three-sided-slope kit",
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning")
      errors.push(message.text());
  });
  await page.setViewportSize({ width: 1600, height: 842 });
  await page.goto("/tools/art/preview/three-sided-slopes.html");
  await expect(page.locator("body")).toHaveAttribute(
    "data-three-sided-slopes-ready",
    "true",
    { timeout: 30_000 },
  );
  await page.waitForTimeout(400);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "docs/design/kits/three-sided-slopes-composite.png",
  });
});
