import { expect, test } from "@playwright/test";

test("menu → new game → overworld → reload → continue", async ({ page }) => {
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
  await expect(body).toHaveAttribute("data-screen", "main-menu");
  await expect(page.locator('[data-action="continue"]')).toBeDisabled();

  await page.locator('[data-action="new-game"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");
  const seedField = page.locator(
    '[data-screen="overworld"] [data-field="seed"]',
  );
  await expect(seedField).toBeVisible();
  const seed = (await seedField.textContent()) ?? "";
  expect(seed).toMatch(/^\d+$/);

  await page.reload();
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await expect(body).toHaveAttribute("data-screen", "main-menu");
  const cont = page.locator('[data-action="continue"]');
  await expect(cont).toBeEnabled();

  await cont.click();
  await expect(body).toHaveAttribute("data-screen", "overworld");
  await expect(seedField).toHaveText(seed);

  expect(errors).toEqual([]);
});
