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
  // domcontentloaded, not load: `load` waits for every asset the page
  // pulls — models, textures, fonts — and this spec only ever asserts on
  // the main menu. Six full boots in one spec, under a loaded machine,
  // is enough for one of them to pass 30s waiting for art it never looks
  // at, which is the flake in #578. The app-state attribute below is the
  // signal that actually matters and it is still awaited.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toHaveAttribute("data-app-state", "ready");
  await expect(page.locator("body")).toHaveAttribute(
    "data-screen",
    "main-menu",
  );
}

/**
 * Recovery behaviour after #219: whatever is wrong with the autosave,
 * the menu disables Continue and says so on its status line, naming the
 * reason; a save from a newer schema is called out as such. Only a
 * missing slot is silent.
 */
test("an undecodable autosave disables Continue and explains why, without console errors", async ({
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

  const status = page.locator('[data-role="status"]');
  for (const value of ["{not json", "", "null", "[]"]) {
    await reloadWithAutosave(page, value);
    await expect(page.locator('[data-action="continue"]')).toBeDisabled();
    await expect(status).toBeVisible();
    await expect(status).toContainText("cannot be read");
  }
  await reloadWithAutosave(page, newerSchema);
  await expect(page.locator('[data-action="continue"]')).toBeDisabled();
  await expect(status).toContainText("newer version");

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

test("an autosave whose state is not a campaign is refused the same way", async ({
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

  await expect(page.locator('[data-action="continue"]')).toBeDisabled();
  const status = page.locator('[data-role="status"]');
  await expect(status).toBeVisible();
  await expect(status).toContainText("not a campaign");

  expect(errors).toEqual([]);
});
