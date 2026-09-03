import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { TutTestHooks } from "../src/app/model/test-hooks";

/** The page's global object as seen from `page.evaluate`, with the dev hooks. */
interface HookGlobal {
  __tut__?: TutTestHooks;
}

/** A fixed text seed; `resolveSeed` hashes it, so the campaign is the same on every run. */
const SEED = "loop-smoke-1";

/** Most days the test will advance while waiting for the first mission offer. */
const MAX_DAYS_TO_FIRST_MISSION = 40;

/** Parses a `¢5,000` readout back to a number. */
function parseCredits(text: string | null): number {
  return Number((text ?? "").replace(/[^0-9-]/g, ""));
}

/** Collects console and page errors so the test can assert none were logged. */
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

/**
 * Answers a pending event with its first choice, if one is waiting. An
 * event blocks Advance day and overlays the overworld until answered
 * (GDD §5.4), so every step that ticks or navigates calls this first.
 */
async function answerPendingEvent(page: Page): Promise<void> {
  const choice = page
    .locator('[data-role="event-dialog"] [data-choice-id]')
    .first();
  for (let i = 0; i < 3 && (await choice.isVisible()); i++) {
    await choice.click();
  }
}

/** Clicks Advance day, waits for the calendar to move and answers any event it raised. */
async function advanceDay(page: Page): Promise<void> {
  await answerPendingEvent(page);
  const day = page.locator('#top-bar [data-field="day"]');
  const before = parseCredits(await day.textContent());
  await page.locator('[data-action="advance-day"]').click();
  await expect(day).toHaveText(String(before + 1));
  await answerPendingEvent(page);
}

/**
 * The M1 loop in one sitting (#84): new game → advance → select a city →
 * build a deployable → open a mission → deploy → results → continue →
 * roster → hire → mech bay → save loadout → build mech → export/import
 * round trip. Day, credits and roster counts are checked at each step
 * and no console or page error may be logged.
 */
test("plays the overworld loop end to end without console errors", async ({
  page,
}) => {
  const errors = collectErrors(page);
  const body = page.locator("body");
  const day = page.locator('#top-bar [data-field="day"]');
  const credits = page.locator('#top-bar [data-field="credits"]');

  // New game
  await page.goto("/");
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await page.locator('input[data-field="seed"]').fill(SEED);
  await page.locator('[data-action="new-game"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");
  await expect(day).toHaveText("1");
  await expect(credits).toHaveText("¢5,000");
  const seedShown = page.locator('#side-panel [data-field="seed"]');
  await expect(seedShown).toHaveText(/^\d+$/);
  const seedValue = (await seedShown.textContent()) ?? "";

  // Advance a day: the calendar moves and the stipend is paid.
  await advanceDay(page);
  await expect(day).toHaveText("2");
  const afterStipend = parseCredits(await credits.textContent());
  expect(afterStipend).toBeGreaterThan(5000);

  // Select a city and build a deployable in its region.
  await page.evaluate(() =>
    (globalThis as HookGlobal).__tut__?.selectCity("auckland"),
  );
  await expect(page.locator("#selected-city")).toHaveText("Auckland");
  const sensor = page.locator(
    '[data-action="build-deployable"][data-type-id="sensor-array"]',
  );
  await expect(sensor).toBeEnabled();
  await sensor.click();
  await expect(page.locator("#deployables [data-deployable-id]")).toHaveCount(
    1,
  );
  await expect(credits).toHaveText(
    `¢${(afterStipend - 800).toLocaleString("en-US")}`,
  );

  // Advance until a mission is on offer.
  const missionRows = page.locator('[data-action="select-mission"]');
  for (
    let i = 0;
    i < MAX_DAYS_TO_FIRST_MISSION && (await missionRows.count()) === 0;
    i++
  ) {
    await advanceDay(page);
  }
  await expect(missionRows.first()).toBeVisible();
  const dayAtLaunch = (await day.textContent()) ?? "";
  const creditsAtLaunch = parseCredits(await credits.textContent());

  // Open the mission, deploy everything, launch.
  const launchedId = await missionRows.first().getAttribute("data-mission-id");
  await missionRows.first().click();
  const details = page.locator('[data-role="mission-details"]');
  await expect(details.locator('[data-field="description"]')).not.toBeEmpty();
  await details.locator('[data-action="plan-deployment"]').click();
  await expect(body).toHaveAttribute("data-screen", "deployment");
  const boxes = page.locator(
    '[data-role="deployment-picker"] input[type="checkbox"]',
  );
  await expect(boxes).toHaveCount(3);
  for (const box of await boxes.all()) {
    await box.check();
  }
  await expect(
    page.locator('[data-role="assessment"] [data-field="win-chance"]'),
  ).toHaveAttribute("data-tone", /ok|warn|danger/);
  await page.locator('[data-action="launch"]').click();

  // Results; Continue advances the day (#83) and returns to a live overworld.
  await expect(body).toHaveAttribute("data-screen", "mission-results");
  await expect(
    page.locator('[data-screen="mission-results"] [data-field="outcome"]'),
  ).not.toBeEmpty();
  const awarded = parseCredits(
    await page
      .locator('[data-screen="mission-results"] [data-field="credits"]')
      .textContent(),
  );
  await page
    .locator('[data-screen="mission-results"] [data-action="continue"]')
    .click();
  await expect(body).toHaveAttribute("data-screen", "overworld");
  await expect(day).toHaveText(String(Number(dayAtLaunch) + 1));
  await answerPendingEvent(page);
  // Reward plus one day's stipend, less at most one day's upkeep.
  expect(parseCredits(await credits.textContent())).toBeGreaterThan(
    creditsAtLaunch + awarded,
  );
  await expect(page.locator('[data-action="advance-day"]')).toBeEnabled();
  // The launched mission is gone; the tick may have offered new ones.
  await expect(
    page.locator(
      `[data-action="select-mission"][data-mission-id="${launchedId ?? ""}"]`,
    ),
  ).toHaveCount(0);

  // Roster: hire a squad.
  await answerPendingEvent(page);
  await page.locator('#top-bar [data-action="roster"]').click();
  await expect(body).toHaveAttribute("data-screen", "roster");
  const squadRows = page.locator("#squad-list tbody tr");
  const mechRows = page.locator("#mech-list tbody tr");
  await expect(squadRows).toHaveCount(2);
  await expect(mechRows).toHaveCount(1);
  const rosterCredits = page.locator('#roster-bar [data-field="credits"]');
  const beforeHire = parseCredits(await rosterCredits.textContent());
  await page.locator('[data-field="hire-type"]').selectOption("rifle");
  await page.locator('[data-field="hire-name"]').fill("Echo");
  await page.locator('[data-action="hire"]').click();
  await expect(squadRows).toHaveCount(3);
  await expect(rosterCredits).toHaveText(
    `¢${(beforeHire - 500).toLocaleString("en-US")}`,
  );

  // Mech bay: save a loadout and build a mech from it.
  await page.locator('[data-action="mech-bay"]').click();
  await expect(body).toHaveAttribute("data-screen", "mech-bay");
  await expect(
    page.locator('#stat-sheet [data-field="verdict"]'),
  ).toHaveAttribute("data-tone", "ok");
  await page.locator('[data-field="loadout-name"]').fill("Loop");
  await page.locator('[data-action="save-loadout"]').click();
  await expect(
    page.locator('#saved-loadouts [data-loadout-name="Loop"]'),
  ).toBeVisible();
  const build = page.locator('[data-action="build-mech"]');
  await expect(build).toBeEnabled();
  const buildCost = parseCredits(await build.textContent());
  const bayCredits = page.locator('#mech-bay-bar [data-field="credits"]');
  const beforeBuild = parseCredits(await bayCredits.textContent());
  await page.locator('[data-field="mech-name"]').fill("Anvil");
  await build.click();
  await expect(
    page.locator('section[data-screen="mech-bay"] [data-role="status"]'),
  ).toHaveText("Built Anvil.");
  await expect(bayCredits).toHaveText(
    `¢${(beforeBuild - buildCost).toLocaleString("en-US")}`,
  );
  await page.locator('#mech-bay-bar [data-action="roster"]').click();
  await expect(mechRows).toHaveCount(2);
  await expect(mechRows.last().locator('[data-field="rename"]')).toHaveValue(
    "Anvil",
  );
  const finalCredits = parseCredits(await rosterCredits.textContent());

  // Export / import round trip: the imported campaign is the one we played.
  await page.locator('[data-action="overworld"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");
  const finalDay = (await day.textContent()) ?? "";
  await answerPendingEvent(page);
  await page.locator('#top-bar [data-action="main-menu"]').click();
  await expect(body).toHaveAttribute("data-screen", "main-menu");
  await page.locator('[data-action="export"]').click();
  const exported = await page
    .locator('textarea[data-field="save-json"]')
    .inputValue();
  expect(exported.length).toBeGreaterThan(1000);

  await page.locator('input[data-field="seed"]').fill("another-campaign");
  await page.locator('[data-action="new-game"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");
  await expect(day).toHaveText("1");
  await answerPendingEvent(page);
  await page.locator('#top-bar [data-action="main-menu"]').click();
  await page.locator('textarea[data-field="save-json"]').fill(exported);
  await page.locator('[data-action="import"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");
  await expect(seedShown).toHaveText(seedValue);
  await expect(day).toHaveText(finalDay);
  await expect(credits).toHaveText(`¢${finalCredits.toLocaleString("en-US")}`);
  await page.locator('#top-bar [data-action="roster"]').click();
  await expect(squadRows).toHaveCount(3);
  await expect(mechRows).toHaveCount(2);

  expect(errors).toEqual([]);
});
