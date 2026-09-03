import { expect, test } from "@playwright/test";

import type { TutTestHooks } from "../src/app/model/test-hooks";
import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";

/** The page's global object as seen from `page.evaluate`, with both hook sets. */
interface HookGlobal {
  __tut__?: TutTestHooks;
  __tutTactical__?: TacticalTestHooks;
}

/** Days to advance before giving up on a mission appearing for the fixed seed. */
const MAX_DAYS = 40;

test("the tactical screen mounts a generated map with the deployed roster and exposes its hooks", async ({
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
  const missionId = await rows.first().getAttribute("data-mission-id");
  expect(missionId).toMatch(/^mission-\d+$/);

  const problem = await page.evaluate(
    (id) => (globalThis as HookGlobal).__tut__?.startTacticalMission(id),
    missionId ?? "",
  );
  expect(problem).toBeUndefined();
  await expect(body).toHaveAttribute("data-screen", "tactical");
  await expect(page.locator("#tactical-viewport canvas")).toBeVisible();
  await expect(
    page.locator('#tactical-bar [data-field="mission-id"]'),
  ).toHaveText(missionId ?? "");
  await expect(page.locator('#tactical-bar [data-field="turn"]')).toHaveText(
    "1",
  );
  await expect(body).toHaveAttribute("data-tactical-units", /^[1-9]\d*$/);

  // The input controller's hooks are on the window and select a unit.
  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-1"),
  );
  await expect(body).toHaveAttribute("data-selected-unit", "unit-1");

  // A reload resumes the mission from the autosave (one store, one save).
  await page.reload();
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-action="continue"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");

  expect(errors).toEqual([]);
});
