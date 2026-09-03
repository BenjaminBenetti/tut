import { expect, test } from "@playwright/test";

test("fitting a railgun to the starter mech shows an overweight error in the mech bay", async ({
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
  await page.locator('[data-action="mech-bay"]').click();
  await expect(body).toHaveAttribute("data-screen", "mech-bay");

  const verdict = page.locator('#stat-sheet [data-field="verdict"]');
  await expect(verdict).toHaveAttribute("data-tone", "ok");
  const cost = page.locator('#stat-sheet [data-field="totalCost"]');
  const startingCost = await cost.textContent();

  await page
    .locator('select[data-field="arm-weapon"]')
    .selectOption("arm-weapon-railgun");
  await expect(verdict).toHaveAttribute("data-tone", "danger");
  await expect(
    page.locator('#stat-sheet [data-role="errors"] li[data-code="overweight"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-row="chassis"] [data-role="slot-error"]'),
  ).toContainText("carries at most");

  await page
    .locator('select[data-field="chassis"]')
    .selectOption("chassis-bulwark");
  await expect(verdict).toHaveAttribute("data-tone", "ok");
  await expect(cost).not.toHaveText(startingCost ?? "");

  await page.locator('[data-action="roster"]').click();
  await expect(body).toHaveAttribute("data-screen", "roster");
  expect(errors).toEqual([]);
});
