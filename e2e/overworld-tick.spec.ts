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
  // A fixed seed keeps the first days deterministic; the random default
  // sometimes raised an event on day 2 or 3, which disables Advance Day
  // until it is answered (#77).
  await page.locator('[data-field="seed"]').fill("777");
  await page.locator('[data-action="new-game"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");

  const day = page.locator('#top-bar [data-field="day"]');
  const credits = page.locator('#top-bar [data-field="credits"]');
  const threatTone = page.locator('#top-bar [data-field="threat-tone"]');
  await expect(day).toHaveText("1");
  await expect(threatTone).toHaveAttribute("data-tone", /ok|warn|danger/);
  const startingCredits = await credits.textContent();

  const advance = page.locator('[data-action="advance-day"]');
  const choice = page.locator('[data-role="event-dialog"] [data-choice-id]');
  await expect(advance).toBeEnabled();
  for (let i = 0; i < 3; i++) {
    // An event blocks Advance Day until answered; take the default option.
    if (await choice.first().isVisible()) {
      await choice.first().click();
    }
    await expect(advance).toBeEnabled();
    await advance.click();
  }
  await expect(day).toHaveText("4");
  await expect(credits).not.toHaveText(startingCredits ?? "");
  await expect(page.locator("#side-panel")).toBeVisible();

  expect(errors).toEqual([]);
});
