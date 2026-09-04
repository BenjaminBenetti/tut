import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

/** Days to advance before giving up on a mission appearing for the fixed seed. */
const MAX_DAYS = 40;

/** The widths the HUD has to hold: the design target and the #291 minimum. */
const WIDTHS = [
  { label: "1280x720", width: 1280, height: 720 },
  { label: "800 minimum", width: 800, height: 720 },
];

/** True when two rectangles share any area. */
function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

/** The element's box; fails the test rather than returning null. */
async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

/** Plays into a live mission on the fixed seed with one squad deployed. */
async function launchMission(page: Page) {
  await page.goto("/");
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-field="seed"]').fill("4242");
  await page.locator('[data-action="new-game"]').click();
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
  await rows.first().click();
  await page
    .locator('[data-role="mission-details"] [data-action="plan-deployment"]')
    .click();
  await page.locator('#deploy-squads input[type="checkbox"]').first().check();
  await page.locator('[data-action="launch"]').click();
  await expect(body).toHaveAttribute("data-screen", "tactical");
}

test("the event log reads the mission's events and collapses (#525)", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await launchMission(page);
  const log = page.locator("#event-log");
  await expect(log).toBeVisible();
  const entries = log.locator('[data-role="event-log-list"] > li');

  // A mission starts with an empty log: events accumulate as commands
  // apply, and launching applies none. Ending the turn runs the bug
  // phase, which is the first thing there is to report.
  const before = await entries.count();
  await page.locator('#action-bar [data-action="end-turn"]').click();
  await expect
    .poll(async () => entries.count(), { timeout: 20000 })
    .toBeGreaterThan(before);

  // Sentences a player can read, not event-type names.
  await expect(entries.first()).toBeVisible();
  await expect(entries.first()).not.toContainText("tactical:");

  // Collapsing hides the entries and leaves the handle.
  const toggle = log.locator('[data-action="toggle-log"]');
  await toggle.click();
  await expect(log).toHaveAttribute("data-collapsed", "true");
  await expect(entries.first()).toBeHidden();
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(log).toHaveAttribute("data-collapsed", "false");

  expect(errors).toEqual([]);
});

for (const size of WIDTHS) {
  test(`the event log clears the action bar and the unit card at ${size.label} (#525)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await launchMission(page);

    const log = await boxOf(page.locator("#event-log"));
    const actions = await boxOf(page.locator("#action-bar"));
    const objectives = await boxOf(page.locator("#objectives"));

    expect(overlaps(log, actions), "log over the action bar").toBe(false);
    expect(overlaps(log, objectives), "log over the side column").toBe(false);
    // And it is where the issue asks for it: the bottom-left corner.
    expect(log.x).toBeLessThan(size.width / 2);
    expect(log.y + log.height).toBeLessThanOrEqual(actions.y + 1);
  });
}
