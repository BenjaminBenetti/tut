import { expect, test } from "@playwright/test";

import type { GameState } from "../src/save/model/game-state";
import { launchMission } from "./mission-capture.helper";

/** The autosave the live mission is read from. */
const SAVE_KEY = "tut:save:autosave";

/**
 * Leaving a mission (#1132). The banner's top-right button is Leave, not
 * Overworld: with the force still on the map and the objectives open it
 * asks first, naming every unit that would be left behind and saying the
 * mission will be recorded as failed; Stay keeps the fight exactly where
 * it was; Leave ends it, lands on the debrief as a loss, and the debrief
 * names the units left behind.
 */
test("Leave asks before stranding the force, Stay keeps the mission, and Leave loses it", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await launchMission(page, "4242");
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-tactical-ready", "true");

  // The names the dialog and the debrief must use: the roster's, never
  // a unit id.
  const deployed = await page.evaluate((key) => {
    const envelope = JSON.parse(localStorage.getItem(key)!) as {
      state: GameState;
    };
    const mission = envelope.state.activeMission!;
    const roster = envelope.state.roster;
    return mission.units
      .filter((unit) => unit.team === "tdf" && unit.hp > 0)
      .map(
        (unit) =>
          roster.squads.find((s) => s.id === unit.sourceId)?.name ??
          roster.mechs.find((m) => m.id === unit.sourceId)?.name ??
          unit.id,
      );
  }, SAVE_KEY);
  expect(deployed.length).toBeGreaterThan(0);

  const banner = page.locator("#turn-banner");
  await expect(banner.locator('[data-action="overworld"]')).toHaveCount(0);
  const leave = banner.locator('[data-action="leave-mission"]');
  await expect(leave).toHaveText("Leave");

  // Asked first: the dialog names everyone still on the map and says how
  // the mission will be recorded.
  const dialog = page.locator('[data-role="leave-dialog"]');
  await leave.click();
  await expect(dialog).toBeVisible();
  for (const name of deployed) {
    await expect(dialog).toContainText(name);
  }
  await expect(dialog).toContainText("recorded as failed");
  await expect(dialog).not.toContainText("unit-1");

  // Stay: nothing happened.
  await dialog.locator('[data-action="leave-cancel"]').click();
  await expect(dialog).toBeHidden();
  await expect(body).toHaveAttribute("data-screen", "tactical");
  await expect(body).toHaveAttribute("data-tactical-ready", "true");

  // Escape backs out too.
  await leave.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(body).toHaveAttribute("data-screen", "tactical");

  // Leave: the mission is over and lost, and the debrief says who stayed.
  await leave.click();
  await expect(dialog).toBeVisible();
  await dialog.locator('[data-action="leave-confirm"]').click();
  await expect(body).toHaveAttribute("data-screen", "mission-results");
  const results = page.locator('[data-screen="mission-results"]');
  await expect(results.locator('[data-field="outcome"]')).toContainText("lost");
  const leftBehind = results.locator('[data-field="left-behind"] li');
  await expect(leftBehind).toHaveCount(deployed.length);
  for (const name of deployed) {
    await expect(results.locator('[data-field="left-behind"]')).toContainText(
      name,
    );
  }

  // The debrief closes back onto the overworld with nothing left running.
  await page.locator('[data-action="continue"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");
  await expect(
    page.locator('#top-bar [data-action="resume-mission"]'),
  ).toBeHidden();
  expect(errors).toEqual([]);
});
