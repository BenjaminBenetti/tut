import { expect, type Page } from "@playwright/test";

/** Days to advance before giving up on a mission appearing for the fixed seed. */
const MAX_DAYS = 40;

/**
 * Drives a new campaign into a live mission with the whole starter force
 * deployed, which is what every capture spec needs before it can take a
 * picture of anything.
 *
 * Shared rather than copied: two specs wanted the same forty lines, and
 * a capture that quietly stops reaching the tactical screen is a capture
 * that keeps committing a stale frame.
 *
 * @param page - The page to drive.
 * @param seed - The campaign seed, which fixes the map and the mission.
 */
export async function launchMission(page: Page, seed: string): Promise<void> {
  await page.goto("/");
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-field="seed"]').fill(seed);
  await page.locator('[data-action="new-game"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");

  const rows = page.locator('[data-role="mission-list"] [data-mission-id]');
  const advance = page.locator('[data-action="advance-day"]');
  const choice = page.locator('[data-role="event-dialog"] [data-choice-id]');
  for (let day = 0; day < MAX_DAYS && (await rows.count()) === 0; day++) {
    if (await choice.first().isVisible()) {
      await choice.first().click();
    }
    await expect(advance).toBeEnabled();
    await advance.click();
  }
  await expect(rows.first()).toBeVisible();

  await rows.first().click();
  await page
    .locator('[data-role="mission-details"] [data-action="plan-deployment"]')
    .click();
  await expect(body).toHaveAttribute("data-screen", "deployment");
  for (const box of await page
    .locator('[data-role="deployment-picker"] input[type="checkbox"]')
    .all()) {
    await box.check();
  }
  await page.locator('[data-action="launch"]').click();
  await expect(body).toHaveAttribute("data-screen", "tactical");
  await expect(page.locator("#tactical-viewport canvas")).toBeVisible();
}

/**
 * Waits for the phase banner to clear before the shutter. It animates in
 * over the map on the first turn and covers the middle of any frame
 * taken while it is up.
 *
 * @param page - The page to settle.
 */
export async function settleForShot(page: Page): Promise<void> {
  await expect
    .poll(
      async () => page.locator("#phase-banner").getAttribute("data-visible"),
      { timeout: 15_000 },
    )
    .not.toBe("true");
  await page.waitForTimeout(600);
}
