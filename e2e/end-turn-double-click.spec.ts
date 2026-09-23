import { expect, test } from "@playwright/test";

import { waitForBugPhasePlayed } from "./bug-phase.helper";
import { launchMission, settleForShot } from "./mission-capture.helper";

/**
 * Two presses of End turn end one turn (#1132).
 *
 * The Executive Director found End turn still enabled during the bug
 * phase and a double click ending two turns. The controls are held
 * from the first press until the scene has settled *and* the "Bug
 * phase" banner has passed; a bug phase with nothing to draw settles
 * at once, and the banner is what the player is still reading.
 *
 * Three routes, each expected to move the turn by exactly one: a
 * `dblclick`, two clicks dispatched back to back inside the page (a
 * synthetic click ignores `disabled`, so this checks the HUD's own
 * gate), and the keyboard shortcut pressed twice.
 */
test("End turn pressed twice ends one turn, and is disabled while the bug phase plays", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const jevRequests: string[] = [];
  await page.route("**/v1/systemone", async (route) => {
    jevRequests.push(route.request().method());
    await route.abort();
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await launchMission(page, "4242");
  await settleForShot(page);

  const body = page.locator("body");
  const endTurn = page.locator('#action-bar [data-action="end-turn"]');
  const turn = async (): Promise<number> =>
    Number(
      await page.locator('#turn-banner [data-field="turn"]').textContent(),
    );
  await expect(endTurn).toBeEnabled();
  expect(await turn()).toBe(1);

  // One: a double click. The second click lands on a button the first
  // press disabled in the same tick.
  await endTurn.dblclick();
  await expect(body).toHaveAttribute("data-phase-playing", "true");
  await expect(endTurn).toBeDisabled();
  await waitForBugPhasePlayed(page);
  await expect(endTurn).toBeEnabled();
  expect(await turn()).toBe(2);

  // Two: two synthetic clicks in one task, which `disabled` does not
  // stop; the HUD's playback gate must.
  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>(
      '#action-bar [data-action="end-turn"]',
    );
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await expect(body).toHaveAttribute("data-phase-playing", "true");
  await expect(endTurn).toBeDisabled();
  await waitForBugPhasePlayed(page);
  expect(await turn()).toBe(3);

  // Three: the shortcut, twice.
  await page.keyboard.press("7");
  await page.keyboard.press("7");
  await expect(body).toHaveAttribute("data-phase-playing", "true");
  await waitForBugPhasePlayed(page);
  await expect(endTurn).toBeEnabled();
  expect(await turn()).toBe(4);
  expect(jevRequests).toEqual([]);
});
