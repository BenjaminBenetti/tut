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
  // outright would leave this spec green.
  //
  // That shortening has now happened, in two steps, and the measurements
  // are worth keeping because both were predicted wrongly once.
  //
  // #949 replaced "Destroy spawner spawner-1" with "Destroy spawner 1"
  // and bought **nothing** here: `hidden` was 64 px before and after,
  // because the label wrapped to two lines either way (195 px of text
  // before, 132 px after, into a 130 px slot). The 40 px in the original
  // note was an estimate that assumed the shorter label would unwrap.
  //
  // #991 then made the row actually fit — one line instead of two, 56 px
  // to 37 px — and `hidden` is now **24 px**. The fixture still
  // overflows, so it is left alone, but the margin is thin: one more row
  // of saved height and this spec asserts nothing. If that happens,
  // widen the fixture (more objectives, a shorter viewport) rather than
  // weakening the assertion below.
  const hidden = await rail.evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(
    hidden,
    "the fixture must overflow or the cue below is untested",
  ).toBeGreaterThan(1);
  await expect(rail).toHaveAttribute("data-overflow", "true");

  // The row fits the rail (#991). Two lines per objective was the
  // defect: the label and the hp chip each shrank by a hair and both
  // wrapped, so every objective cost two rows of a rail that is already
  // short. Asserted on the rendered line count rather than a height in
  // pixels, so it says what it means and does not drift with the font.
  const objectiveLines = await page
    .locator("[data-objective-id]")
    .evaluateAll((rows) =>
      rows.map((row) =>
        [...row.children]
          .filter((child) => !child.classList.contains("tut-icon"))
          .map((child) => {
            const range = document.createRange();
            range.selectNodeContents(child);
            return range.getClientRects().length;
          }),
      ),
    );
  expect(objectiveLines.length).toBeGreaterThan(0);
  for (const row of objectiveLines) {
    expect(row, "an objective row wrapped onto a second line").toEqual(
      row.map(() => 1),
    );
  }

  // And the cue is honest: scrolled to the end, it clears.
  await rail.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect
    .poll(async () => rail.evaluate((el) => el.dataset.overflow ?? "none"))
    .toBe("none");
});
