import { expect, test } from "@playwright/test";

/** Exercises real GLBs, textures and the production animation queue in WebGL. */
test("TDF and bug models visibly move and attack without browser errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/tools/art/preview/unit-motion.html");
  await expect(page.locator("#status")).toHaveText("Ready");
  for (const id of [
    "tdf.infantry.rifle",
    "tdf.mech.assembled-a",
    "tdf.mech.assembled-b",
    "bug.swarmer",
    "bug.lurker",
    "bug.brute",
    "Siege Battery",
    "Forward Observer",
    "Rapid Response",
  ]) {
    await page.evaluate((id) => {
      const driver = (
        window as unknown as { __unitMotion: { select(id: string): void } }
      ).__unitMotion;
      driver.select(id);
    }, id);
    for (const action of ["Move", "Attack"]) {
      await page.getByRole("button", { name: action, exact: true }).click();
      const before = await page.locator("canvas").screenshot();
      await page.evaluate(() => {
        (
          window as unknown as { __unitMotion: { step(seconds: number): void } }
        ).__unitMotion.step(0.035);
      });
      const during = await page.locator("canvas").screenshot();
      expect(
        during.equals(before),
        `${id} ${action} must change the rendered frame`,
      ).toBe(false);
      await page.evaluate(() => {
        (
          window as unknown as { __unitMotion: { step(seconds: number): void } }
        ).__unitMotion.step(2);
      });
    }
  }
  expect(errors).toEqual([]);
});

/** Checks the production queue's visible deployment and retraction on authored Anchor Legs. */
test("anchor spades deploy and retract visibly", async ({ page }) => {
  await page.goto("/tools/art/preview/unit-motion.html");
  await expect(page.locator("#status")).toHaveText("Ready");
  await page.evaluate(() => {
    (
      window as unknown as { __unitMotion: { select(id: string): void } }
    ).__unitMotion.select("Siege Battery");
  });
  const canvas = page.locator("canvas");
  const rest = await canvas.screenshot();
  await page.getByRole("button", { name: "Brace", exact: true }).click();
  await page.evaluate(() => {
    (
      window as unknown as { __unitMotion: { step(seconds: number): void } }
    ).__unitMotion.step(0.6);
  });
  const deployed = await canvas.screenshot();
  expect(deployed.equals(rest)).toBe(false);
  await page
    .getByRole("button", { name: "Retract & move", exact: true })
    .click();
  await page.evaluate(() => {
    (
      window as unknown as { __unitMotion: { step(seconds: number): void } }
    ).__unitMotion.step(0.2);
  });
  const retracting = await canvas.screenshot();
  expect(retracting.equals(deployed)).toBe(false);
  expect(retracting.equals(rest)).toBe(false);
});
