import { expect, test } from "@playwright/test";

test("menu → new game → overworld → reload → continue → export → import", async ({
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
  await expect(body).toHaveAttribute("data-screen", "main-menu");
  await expect(page.locator('[data-action="continue"]')).toBeDisabled();
  await expect(page.locator('[data-action="export"]')).toBeDisabled();

  // The seed box offers a random numeric seed; a typed one is used verbatim.
  const seedInput = page.locator('[data-field="seed"]');
  await expect(seedInput).toHaveValue(/^\d+$/);
  await seedInput.fill("12345");
  await page.locator('[data-action="new-game"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");
  const seedField = page.locator(
    '[data-screen="overworld"] [data-field="seed"]',
  );
  await expect(seedField).toHaveText("12345");

  // Autosave survives a reload and Continue restores the same campaign.
  await page.reload();
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await expect(body).toHaveAttribute("data-screen", "main-menu");
  const cont = page.locator('[data-action="continue"]');
  await expect(cont).toBeEnabled();
  await cont.click();
  await expect(body).toHaveAttribute("data-screen", "overworld");
  await expect(seedField).toHaveText("12345");

  // Export dumps the autosave as JSON; Import starts a campaign from it.
  await page.locator('[data-action="main-menu"]').click();
  await expect(body).toHaveAttribute("data-screen", "main-menu");
  await page.locator('[data-action="export"]').click();
  const saveJson = page.locator('[data-field="save-json"]');
  await expect(saveJson).toHaveValue(/"schemaVersion"/);
  await page.locator('[data-action="import"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");
  await expect(seedField).toHaveText("12345");

  expect(errors).toEqual([]);
});
