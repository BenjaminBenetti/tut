import { expect, test } from "@playwright/test";

/** Days to advance before giving up on a mission appearing for the fixed seed. */
const MAX_DAYS = 40;

test("a mission appears on the list, opens a briefing, selects its city and routes to deployment", async ({
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
  await page.locator('[data-field="seed"]').fill("4242");
  await page.locator('[data-action="new-game"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");

  const rows = page.locator('[data-role="mission-list"] [data-mission-id]');
  const advance = page.locator('[data-action="advance-day"]');
  for (let day = 0; day < MAX_DAYS && (await rows.count()) === 0; day++) {
    await advance.click();
  }
  await expect(rows.first()).toBeVisible();

  const first = rows.first();
  const missionId = await first.getAttribute("data-mission-id");
  const cityId = await first.getAttribute("data-city-id");
  expect(missionId).toMatch(/^mission-\d+$/);
  expect(cityId).toBeTruthy();
  await first.click();

  const details = page.locator('[data-role="mission-details"]');
  await expect(details).toBeVisible();
  await expect(details).toHaveAttribute("data-mission-id", missionId ?? "");
  await expect(details.locator('[data-field="detail-biome"]')).toHaveText(
    /temperate|snowy|desert|coastal/,
  );
  await expect(details.locator('[data-field="detail-settlement"]')).toHaveText(
    /rural|town|city/,
  );
  await expect(details.locator('[data-field="detail-penalty"]')).toHaveText(
    /\+\d+ infestation/,
  );
  await expect(body).toHaveAttribute("data-selected-city", cityId ?? "");
  await expect(page.locator("#selected-city")).not.toHaveText("—");

  await details.locator('[data-action="plan-deployment"]').click();
  await expect(body).toHaveAttribute("data-screen", "deployment");
  await expect(
    page.locator('[data-screen="deployment"] [data-field="mission-id"]'),
  ).toHaveText(missionId ?? "");
  await page.locator('[data-action="back-to-overworld"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");

  expect(errors).toEqual([]);
});
