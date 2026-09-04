import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { TutTestHooks } from "../src/app/model/test-hooks";
import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";

interface HookGlobal {
  __tut__?: TutTestHooks;
  __tutTactical__?: TacticalTestHooks;
}

const MAX_DAYS = 40;

/** Height of the action bar, which units must not be hidden behind. */
const ACTION_BAR_PX = 60;

/** Starts a mission on `seed` at a fixed window size. */
async function launch(page: Page, seed: string): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 720 });
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
  const missionId = await rows.first().getAttribute("data-mission-id");
  await page.evaluate(
    (id) => (globalThis as HookGlobal).__tut__?.startTacticalMission(id),
    missionId ?? "",
  );
  await expect(body).toHaveAttribute("data-screen", "tactical");
  await expect(page.locator("#tactical-viewport canvas")).toBeVisible();
}

/** Every deployed unit's screen position once the models are placed. */
async function forceOnScreen(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("tut:save:autosave");
    const envelope = raw
      ? (JSON.parse(raw) as {
          state: {
            activeMission?: { units: { id: string; team: string }[] };
          };
        })
      : undefined;
    const units =
      envelope?.state.activeMission?.units.filter((u) => u.team === "tdf") ??
      [];
    const hooks = (globalThis as HookGlobal).__tutTactical__;
    return units.map((u) => ({
      id: u.id,
      at: hooks?.unitScreenPosition(u.id),
    }));
  });
}

/**
 * The camera opens on the deployed force (#538). QA measured four of
 * seven seeds starting with the entire squad off screen and no control
 * bringing it back, which reads as a broken game on the first screen
 * after Launch. `spawner-test` was one of the four.
 */
test("a mission opens with the deployed force on screen", async ({ page }) => {
  await launch(page, "spawner-test");
  await expect
    .poll(async () => {
      const force = await forceOnScreen(page);
      return force.length > 0 && force.every((u) => u.at !== undefined);
    })
    .toBe(true);

  const force = await forceOnScreen(page);
  expect(force.length).toBeGreaterThan(0);
  for (const unit of force) {
    expect(unit.at, unit.id).toBeDefined();
    if (!unit.at) continue;
    expect(unit.at.x, `${unit.id} x`).toBeGreaterThanOrEqual(0);
    expect(unit.at.x, `${unit.id} x`).toBeLessThanOrEqual(1280);
    expect(unit.at.y, `${unit.id} y`).toBeGreaterThanOrEqual(0);
    // Above the action bar, not merely inside the window: QA found the
    // "passing" seeds put the squad in the bottom 50 px behind it.
    expect(unit.at.y, `${unit.id} y`).toBeLessThanOrEqual(720 - ACTION_BAR_PX);
  }
});

/**
 * A tapped pan key moves the view. Panning used to accumulate only while
 * a key was held, so a press and release inside one frame did nothing at
 * all — which is why QA found no control that recovered the camera.
 */
test("a tapped arrow key pans the view", async ({ page }) => {
  await launch(page, "spawner-test");
  await expect
    .poll(async () => {
      const force = await forceOnScreen(page);
      return force[0]?.at !== undefined;
    })
    .toBe(true);
  const before = (await forceOnScreen(page))[0];
  expect(before?.at).toBeDefined();
  if (!before?.at) return;

  await page.locator("#tactical-viewport canvas").hover();
  await page.keyboard.press("ArrowRight");

  await expect
    .poll(async () => {
      const now = (await forceOnScreen(page)).find((u) => u.id === before.id);
      return now?.at ? Math.round(now.at.x) : undefined;
    })
    .not.toBe(Math.round(before.at.x));
});
