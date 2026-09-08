import { expect, test } from "@playwright/test";

test("a campaign with fast threat escalation reaches defeat and the game-over screen", async ({
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

  await page.goto("/?threatEscalation=100");
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-field="seed"]').fill("751");
  await page.locator('[data-action="new-game"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");

  const advance = page.locator('[data-action="advance-day"]');
  for (let day = 0; day < 14; day++) {
    if ((await body.getAttribute("data-screen")) === "game-over") {
      break;
    }
    // An event blocks Advance Day until answered; take the default option.
    const choice = page.locator('[data-role="event-dialog"] [data-choice-id]');
    if (await choice.first().isVisible()) {
      await choice.first().click();
    }
    await expect(advance).toBeEnabled();
    await advance.click();
  }
  await expect(body).toHaveAttribute("data-screen", "game-over");
  await expect(page.locator('[data-field="outcome-kind"]')).toHaveAttribute(
    "data-kind",
    "defeat",
  );
  await expect(page.locator('[data-field="outcome-kind"]')).toHaveText(
    "Threat limit reached",
  );
  await expect(page.locator('[data-field="outcome-tagline"]')).toHaveText(
    "Global threat reached 100, ending the campaign.",
  );
  // The threat threshold can end a campaign before any city reaches 100 infestation.
  await expect(page.locator('[data-field="cities-lost"]')).toHaveText("0 / 37");
  await expect(page.locator('[data-field="final-threat"]')).toHaveText("100");
  const day = Number(await page.locator('[data-field="day"]').textContent());
  expect(day).toBeGreaterThan(1);
  expect(day).toBeLessThanOrEqual(15);

  await page.locator('[data-action="main-menu"]').click();
  await expect(body).toHaveAttribute("data-screen", "main-menu");
  expect(errors).toEqual([]);
});
