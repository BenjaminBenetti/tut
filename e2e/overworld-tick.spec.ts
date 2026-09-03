import { expect, test } from "@playwright/test";

test("advancing three days moves the calendar and pays the stipend", async ({
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
  await page.locator('[data-action="new-game"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");

  const day = page.locator('#top-bar [data-field="day"]');
  const credits = page.locator('#top-bar [data-field="credits"]');
  const threatTone = page.locator('#top-bar [data-field="threat-tone"]');
  await expect(day).toHaveText("1");
  await expect(threatTone).toHaveAttribute("data-tone", /ok|warn|danger/);
  const startingCredits = await credits.textContent();

  const advance = page.locator('[data-action="advance-day"]');
  await expect(advance).toBeEnabled();
  for (let i = 0; i < 3; i++) {
    await advance.click();
  }
  await expect(day).toHaveText("4");
  await expect(credits).not.toHaveText(startingCredits ?? "");
  await expect(page.locator("#side-panel")).toBeVisible();

  expect(errors).toEqual([]);
});
