import { expect, test } from "@playwright/test";

/** The ladder-connector acceptance composite uses the shipped scene consumer. */
test("captures the ladder-connector kit in brushed and weathered steel at both rises", async ({
  page,
}) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to capture the ladder-connector kit",
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning")
      errors.push(message.text());
  });
  await page.setViewportSize({ width: 1600, height: 1282 });
  await page.goto("/tools/art/preview/ladder-connectors.html");
  await expect(page.locator("body")).toHaveAttribute(
    "data-ladder-connectors-ready",
    "true",
    { timeout: 30_000 },
  );
  await page.waitForTimeout(400);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "docs/design/kits/ladder-connectors-composite.png",
  });
});
