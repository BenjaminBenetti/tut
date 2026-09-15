import { expect, test } from "@playwright/test";

/**
 * The mech bay's drag-and-drop path in a real browser (#1145): a palette
 * card dragged onto the stage fits its part, the chassis badge shows the
 * overweight error, and dragging a heavier frame on clears it. The
 * jsdom specs dispatch synthetic drag events; this is the one place the
 * browser's own `DataTransfer` and drop sequence run.
 */
test("dragging a railgun onto the starter mech shows an overweight error in the mech bay", async ({
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
  const cost = page.locator(
    '#stat-sheet [data-field="totalCost"]:not([data-role="delta"])',
  );
  const startingCost = await cost.textContent();
  const stage = page.locator("#mech-stage");

  // Resting on the card previews the swap before anything is fitted.
  const railgun = page.locator(
    '#part-palette [data-part-id="arm-weapon-railgun"]',
  );
  await railgun.hover();
  await expect(
    page.locator('#stat-sheet [data-role="delta"][data-field="weight"]'),
  ).toBeVisible();
  await expect(page.locator('[data-role="preview-warning"]')).toContainText(
    "carries at most",
  );
  await expect(verdict).toHaveAttribute("data-tone", "ok");

  await railgun.dragTo(stage);
  await expect(
    page.locator('#mech-stage [data-row="arm-weapon"]'),
  ).toHaveAttribute("data-part-id", "arm-weapon-railgun");
  await expect(verdict).toHaveAttribute("data-tone", "danger");
  await expect(
    page.locator('#stat-sheet [data-role="errors"] li[data-code="overweight"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-row="chassis"] [data-role="slot-error"]'),
  ).toContainText("carries at most");

  await page
    .locator('#part-palette [data-part-id="chassis-bulwark"]')
    .dragTo(stage);
  await expect(verdict).toHaveAttribute("data-tone", "ok");
  await expect(cost).not.toHaveText(startingCost ?? "");

  await page.locator('[data-action="roster"]').click();
  await expect(body).toHaveAttribute("data-screen", "roster");
  expect(errors).toEqual([]);
});
