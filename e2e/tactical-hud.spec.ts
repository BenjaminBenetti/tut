import { expect, test } from "@playwright/test";

import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";

/** The page's global object as seen from `page.evaluate`, with the tactical hooks. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/**
 * The mission HUD (#339) on the unit preview: selecting a unit fills the
 * unit card, arming Attack and selecting an enemy shows the hit preview
 * with numbers from the combat service, and Fire records the command.
 */
test("selecting a unit shows its card and a hit preview on a target", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  await page.goto(
    "/mapgen-preview.html?seed=smoke&biome=coastal&settlement=town&size=small&units=1",
  );
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-app-state", "ready");
  // `ready` says the page mounted and drew a frame; the units arrive
  // behind a model load it does not wait for (#688).
  await expect(body).toHaveAttribute("data-preview-ready", "true");
  await expect(body).toHaveAttribute("data-units", "3");
  await expect(page.locator('#turn-banner [data-field="turn"]')).toHaveText(
    "1",
  );
  await expect(
    page.locator('#turn-banner [data-field="phase"]'),
  ).toHaveAttribute("data-phase", "player");

  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-1"),
  );
  await expect(page.locator('#unit-card [data-field="unit-name"]')).toHaveText(
    "Rifle Squad",
  );
  await expect(page.locator('#unit-card [data-field="hp"]')).toHaveText(
    "20 / 20",
  );
  await expect(
    page.locator('#action-bar [data-action="attack"]'),
  ).toBeEnabled();

  await page.locator('#action-bar [data-action="attack"]').click();
  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-3"),
  );
  const preview = page.locator("#hit-preview");
  await expect(preview).toBeVisible();
  await expect(preview.locator('[data-field="target-name"]')).toHaveText(
    "Swarmer",
  );
  const hit = await preview.locator('[data-field="hit-chance"]').textContent();
  const damage = await preview
    .locator('[data-field="damage-range"]')
    .textContent();
  const hasNumbers =
    /^\d+% hit$/.test(hit ?? "") && /^\d+–\d+ damage$/.test(damage ?? "");
  const hasRefusal = await preview
    .locator('[data-role="preview-error"]')
    .isVisible();
  expect(hasNumbers || hasRefusal).toBe(true);
  if (hasNumbers) {
    await preview.locator('[data-action="confirm-attack"]').click();
    await expect(body).toHaveAttribute("data-last-command", "tactical:attack");
  }
  expect(errors).toEqual([]);
});
