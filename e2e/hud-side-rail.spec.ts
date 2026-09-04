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

/**
 * 720p, because that is where the rail runs out of room (#657): a common
 * laptop height and the size the review captures use.
 */
test.use({ viewport: { width: 1280, height: 720 } });

test("the side rail stays clear of the action bar, and says when it has more to show (#657)", async ({
  page,
}) => {
  await page.goto("/");
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-field="seed"]').fill("4242");
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

  // The mech is the tall card: two weapons, each with its own pool.
  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-1"),
  );
  await expect(body).toHaveAttribute("data-selected-unit", "unit-1");

  const rail = page.locator(".tut-hud__side");
  const bar = page.locator(".tut-hud__bottom");
  const railBox = await rail.boundingBox();
  const barBox = await bar.boundingBox();
  expect(railBox).not.toBeNull();
  expect(barBox).not.toBeNull();

  // The layout half: the rail is a grid row and the bar cannot overlap it.
  //
  // This is the assertion #657 asked for, and on its own it would have
  // passed on the build that prompted the issue -- the rail measured 647
  // against the bar's 663 and still cut an objective. Kept because it
  // pins the layout, but it is not what catches the defect.
  expect(railBox!.y + railBox!.height).toBeLessThanOrEqual(barBox!.y + 1);

  // The half that does catch it: content taller than the rail must say
  // so, or a cut-off row reads as a rendering fault rather than as more
  // to scroll to.
  // Waited for, not sampled (#709). `data-overflow` is set by a
  // `ResizeObserver` that fires after layout, so a one-shot `evaluate`
  // can read the rail as overflowing and the cue as absent and be right
  // about both for a few milliseconds. That is a wait that is not
  // waiting, and it fired on an unrelated PR at load average 102.
  //
  // The overflow itself is asserted rather than guarded on. `if (hidden
  // > 1)` looks careful and is the opposite: on any build where the rail
  // fits, it asserts nothing at all, so deleting `watchSideOverflow`
  // outright would leave this spec green. #674 names the change that
  // would do it — shortening "Destroy spawner spawner-1" buys 40 px.
  const hidden = await rail.evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(
    hidden,
    "the fixture must overflow or the cue below is untested",
  ).toBeGreaterThan(1);
  await expect(rail).toHaveAttribute("data-overflow", "true");

  // And the cue is honest: scrolled to the end, it clears.
  await rail.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect
    .poll(async () => rail.evaluate((el) => el.dataset.overflow ?? "none"))
    .toBe("none");
});
