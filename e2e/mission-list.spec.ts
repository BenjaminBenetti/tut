import { expect, test } from "@playwright/test";

/** Days to advance before giving up on a mission appearing for the fixed seed. */
const MAX_DAYS = 40;

test("a mission appears, opens a briefing, routes to deployment, auto-resolves and reaches the results", async ({
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

  // `?autoResolve=1` keeps this session on the M1 auto-resolver (#341), so
  // this spec stays the overworld loop's regression: Launch settles the
  // mission where it stands. The tactical path is
  // `tactical-mission-flow.spec.ts`.
  await page.goto("/?autoResolve=1");
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-field="seed"]').fill("4242");
  await page.locator('[data-action="new-game"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");

  const rows = page.locator('[data-role="mission-list"] [data-mission-id]');
  const advance = page.locator('[data-action="advance-day"]');
  const choice = page.locator('[data-role="event-dialog"] [data-choice-id]');
  for (let day = 0; day < MAX_DAYS && (await rows.count()) === 0; day++) {
    // An event blocks Advance Day until answered; take the default option.
    if (await choice.first().isVisible()) {
      await choice.first().click();
    }
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

  const dayBefore = Number(
    await page.locator('#top-bar [data-field="day"]').textContent(),
  );
  await details.locator('[data-action="plan-deployment"]').click();
  await expect(body).toHaveAttribute("data-screen", "deployment");
  await expect(
    page.locator('[data-screen="deployment"] [data-field="mission-id"]'),
  ).toHaveText(missionId ?? "");
  // Pick one squad, watch the resolver-side readout move, launch.
  const launch = page.locator('[data-action="launch"]');
  await expect(launch).toBeDisabled();
  const firstSquad = page
    .locator('#deploy-squads input[type="checkbox"]')
    .first();
  await firstSquad.check();
  await expect(launch).toBeEnabled();
  await expect(page.locator('[data-field="force"]')).not.toHaveText("0");
  await expect(page.locator('[data-field="win-chance"]')).toHaveText(/\d+ %/);
  await launch.click();

  await expect(body).toHaveAttribute("data-screen", "mission-results");
  await expect(
    page.locator('[data-screen="mission-results"] [data-field="outcome"]'),
  ).toHaveAttribute("data-outcome", /^(won|lost|extracted)$/);
  // The debrief names the outcome and every loss section, then Continue
  // advances the day (#83) and returns to the overworld.
  const results = page.locator('[data-screen="mission-results"]');
  await expect(results.locator('[data-field="mechs-destroyed"]')).toBeVisible();
  await expect(results.locator('[data-field="credits"]')).toBeVisible();
  await page.locator('[data-action="continue"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");
  await expect(page.locator('#top-bar [data-field="day"]')).toHaveText(
    String(dayBefore + 1),
  );
  await expect(
    page.locator(
      `[data-role="mission-list"] [data-mission-id="${missionId ?? ""}"]`,
    ),
  ).toHaveCount(0);

  expect(errors).toEqual([]);
});
