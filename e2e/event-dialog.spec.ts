import { expect, test } from "@playwright/test";

/**
 * Seed 9 raises a city plea for Berlin on day 2 (found by running the
 * default tick pipeline over the first sixty seeds); the day is
 * deterministic per seed because every tick step forks the campaign RNG
 * with the day in the label.
 */
test("a seeded event opens the dialog, blocks Advance Day and clears on a choice", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  await page.goto("/");
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-field="seed"]').fill("9");
  await page.locator('[data-action="new-game"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");

  const dialog = page.locator('[data-role="event-dialog"]');
  const advance = page.locator('[data-action="advance-day"]');
  await expect(dialog).toBeHidden();
  await advance.click();
  await expect(page.locator('#top-bar [data-field="day"]')).toHaveText("2");

  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-field="event-title"]')).not.toHaveText("");
  await expect(dialog.locator('[data-field="event-city"]')).toHaveText(
    "Berlin",
  );
  await expect(dialog.locator('[data-field="event-text"]')).toContainText(
    "Berlin",
  );
  const choices = dialog.locator("[data-choice-id]");
  expect(await choices.count()).toBeGreaterThan(0);
  await expect(advance).toBeDisabled();

  await choices.first().click();
  await expect(dialog).toBeHidden();
  await expect(advance).toBeEnabled();

  expect(errors).toEqual([]);
});
