import { expect, test } from "@playwright/test";

test("saving a loadout from the popover and building a mech shows the mech in the roster", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  await page.goto("/");
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-action="new-game"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");
  await page.locator('#top-bar [data-action="roster"]').click();
  await expect(body).toHaveAttribute("data-screen", "roster");
  const mechRows = page.locator("#mech-list tbody tr");
  const mechsBefore = await mechRows.count();
  await page.locator('[data-action="mech-bay"]').click();
  await expect(body).toHaveAttribute("data-screen", "mech-bay");

  // Fit a cheaper gun by dropping it on the mech, then save under a new
  // name from the loadouts popover (#1145).
  await page
    .locator('#part-palette [data-part-id="arm-weapon-flamer"]')
    .dragTo(page.locator("#mech-stage"));
  await expect(
    page.locator('#mech-stage [data-row="arm-weapon"]'),
  ).toHaveAttribute("data-part-id", "arm-weapon-flamer");
  const popover = page.locator('[data-role="loadout-popover"]');
  await expect(popover).toBeHidden();
  await page.locator('[data-action="toggle-loadouts"]').click();
  await expect(popover).toBeVisible();
  await page.locator('[data-field="loadout-name"]').fill("Brawler");
  await page.locator('[data-action="save-loadout"]').click();
  await expect(
    page.locator('#saved-loadouts li[data-loadout-name="Brawler"]'),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();

  // Build it.
  const build = page.locator('[data-action="build-mech"]');
  await expect(build).toBeEnabled();
  await expect(build).toHaveText(/^Build ¢[\d,]+$/);
  const credits = page.locator('#mech-bay-bar [data-field="credits"]');
  const creditsBefore = await credits.textContent();
  await page.locator('[data-field="mech-name"]').fill("Anvil");
  await build.click();
  await expect(page.locator('[data-role="status"]')).toHaveText("Built Anvil.");
  await expect(credits).not.toHaveText(creditsBefore ?? "");

  // The roster shows it.
  await page.locator('#mech-bay-bar [data-action="roster"]').click();
  await expect(body).toHaveAttribute("data-screen", "roster");
  await expect(mechRows).toHaveCount(mechsBefore + 1);
  await expect(mechRows.last().locator('[data-field="rename"]')).toHaveValue(
    "Anvil",
  );
  await expect(mechRows.last().locator('[data-field="loadout"]')).toContainText(
    "Flamer",
  );

  expect(errors).toEqual([]);
});
