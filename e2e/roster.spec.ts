import { expect, test } from "@playwright/test";

test("hiring a squad from the roster adds a row and spends credits", async ({
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

  const rows = page.locator("#squad-list tbody tr");
  const credits = page.locator('#roster-bar [data-field="credits"]');
  const before = await rows.count();
  const startingCredits = await credits.textContent();
  expect(before).toBeGreaterThan(0);

  await page.locator('[data-field="hire-name"]').fill("Echo");
  await page.locator('[data-action="hire"]').click();
  await expect(rows).toHaveCount(before + 1);
  await expect(rows.last().locator('[data-field="name"]')).toHaveText("Echo");
  await expect(credits).not.toHaveText(startingCredits ?? "");
  await expect(page.locator("#graveyard")).toBeVisible();

  await page.locator('[data-action="overworld"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");

  expect(errors).toEqual([]);
});
