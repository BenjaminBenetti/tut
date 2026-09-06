import { expect, test } from "@playwright/test";

/** The ramp-connector acceptance composite uses the shipped scene consumer. */
test("captures the ramp-connector kit in asphalt and grass at both rises", async ({
  page,
}) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to capture the ramp-connector kit",
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning")
      errors.push(message.text());
  });
  await page.setViewportSize({ width: 1600, height: 1282 });
  await page.goto("/tools/art/preview/ramp-connectors.html");
  await expect(page.locator("body")).toHaveAttribute(
    "data-ramp-connectors-ready",
    "true",
    { timeout: 30_000 },
  );
  await page.waitForTimeout(400);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "docs/design/kits/ramp-connectors-composite.png",
  });
});
