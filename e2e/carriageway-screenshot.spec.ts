import { expect, test } from "@playwright/test";

/** The material and lane-width acceptance composite uses the shipped scene consumer. */
test("captures the carriageway kit in trail, street and avenue styles", async ({
  page,
}) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to capture the carriageway kit",
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning")
      errors.push(message.text());
  });
  await page.setViewportSize({ width: 2200, height: 1402 });
  await page.goto("/tools/art/preview/carriageways.html");
  await expect(page.locator("body")).toHaveAttribute(
    "data-carriageways-ready",
    "true",
    { timeout: 30_000 },
  );
  await page.waitForTimeout(400);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "docs/design/kits/carriageways-composite.png",
  });
});
