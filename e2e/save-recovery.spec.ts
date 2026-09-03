import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

/** Storage key the main menu autosaves to (`AUTOSAVE_SLOT_ID` under the save prefix). */
const AUTOSAVE_KEY = "tut:save:autosave";

/** Collects console and page errors so a test can assert none were logged. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  return errors;
}

/** Boots the app and starts a campaign so a real autosave exists. */
async function startCampaign(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-action="new-game"]').click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-screen",
    "overworld",
  );
}

/** Overwrites the autosave slot and reloads to the main menu. */
async function reloadWithAutosave(page: Page, value: string): Promise<void> {
  await page.evaluate(
    ([key, text]) => {
      localStorage.setItem(key, text);
    },
    [AUTOSAVE_KEY, value] as const,
  );
  await page.reload();
  await expect(page.locator("body")).toHaveAttribute("data-app-state", "ready");
  await expect(page.locator("body")).toHaveAttribute(
    "data-screen",
    "main-menu",
  );
}

/**
 * Pins the current recovery behaviour found in the 2026-09-03 QA pass:
 * an autosave whose envelope cannot be decoded disables Continue
 * without any console error, and one whose state fails the campaign
 * guard is offered but reports a visible message instead of crashing.
 * #219 tracks making the two cases consistent; fixing it should update
 * this test deliberately.
 */
test("an undecodable autosave disables Continue without console errors", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startCampaign(page);

  const envelope = await page.evaluate(
    (key) => localStorage.getItem(key) ?? "",
    AUTOSAVE_KEY,
  );
  const parsed = JSON.parse(envelope) as { schemaVersion: number };
  const newerSchema = JSON.stringify({
    ...(JSON.parse(envelope) as object),
    schemaVersion: parsed.schemaVersion + 1,
  });

  for (const value of ["{not json", "", "null", "[]", newerSchema]) {
    await reloadWithAutosave(page, value);
    await expect(page.locator('[data-action="continue"]')).toBeDisabled();
  }

  // The real envelope still loads afterwards.
  await reloadWithAutosave(page, envelope);
  await expect(page.locator('[data-action="continue"]')).toBeEnabled();
  await page.locator('[data-action="continue"]').click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-screen",
    "overworld",
  );

  expect(errors).toEqual([]);
});

test("an autosave whose state is not a campaign reports a message and stays on the menu", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startCampaign(page);

  const envelope = await page.evaluate(
    (key) => localStorage.getItem(key) ?? "",
    AUTOSAVE_KEY,
  );
  const brokenState = JSON.stringify({
    ...(JSON.parse(envelope) as object),
    state: 42,
  });
  await reloadWithAutosave(page, brokenState);

  const cont = page.locator('[data-action="continue"]');
  await expect(cont).toBeEnabled();
  await cont.click();

  await expect(page.locator("body")).toHaveAttribute(
    "data-screen",
    "main-menu",
  );
  const status = page.locator('[data-role="status"]');
  await expect(status).toBeVisible();
  await expect(status).toContainText("Could not load autosave");

  expect(errors).toEqual([]);
});
