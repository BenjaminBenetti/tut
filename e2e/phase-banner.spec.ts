import { expect, test } from "@playwright/test";

import type { TutTestHooks } from "../src/app/model/test-hooks";

/** The page's global object, with the app hooks and this spec's recorder. */
interface HookGlobal {
  __tut__?: TutTestHooks;
  __phases__?: string[];
  __details__?: string[];
}

/** Days to advance before giving up on a mission appearing for the fixed seed. */
const MAX_DAYS = 40;

/**
 * The phase transition banners (#523). Playtest 1: "No clear player turn
 * start, bug turn start indication, I feel unclear when the bugs are done
 * their turn." One END TURN plays the whole bug phase and hands control
 * back, so both banners must appear, in order, and the second must say
 * the bugs are finished.
 *
 * Each banner holds for about a second, which is too short to poll for
 * reliably on a loaded machine. So the spec records every transition with
 * a `MutationObserver` installed before the turn ends and asserts the
 * sequence afterwards: the same claim, without racing the clock.
 */
test("ending a turn shows the bug phase banner, then the player's turn", async ({
  page,
}) => {
  const errors: string[] = [];
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

  const banner = page.locator('[data-role="phase-banner"]');
  // Nothing is announced until a phase actually changes.
  await expect(banner).toBeHidden();

  // Record every phase the banner shows, from before the turn ends.
  await page.evaluate(() => {
    const scope = globalThis as HookGlobal;
    scope.__phases__ = [];
    scope.__details__ = [];
    const el = document.querySelector<HTMLElement>(
      '[data-role="phase-banner"]',
    );
    if (!el) {
      return;
    }
    const record = (): void => {
      const phase = el.dataset.phase;
      if (phase !== undefined && scope.__phases__?.at(-1) !== phase) {
        scope.__phases__?.push(phase);
        scope.__details__?.push(
          el.querySelector('[data-field="detail"]')?.textContent ?? "",
        );
      }
    };
    new MutationObserver(record).observe(el, {
      attributes: true,
      attributeFilter: ["data-phase", "data-seq"],
    });
  });

  await page.locator('#action-bar [data-action="end-turn"]').click();

  // The bugs act first, then control comes back to the player.
  await expect
    .poll(async () =>
      page.evaluate(() => (globalThis as HookGlobal).__phases__ ?? []),
    )
    .toEqual(["bugs", "player"]);

  // And the player's banner says the bugs are finished rather than
  // leaving it to be inferred from the status line.
  const details = await page.evaluate(
    () => (globalThis as HookGlobal).__details__ ?? [],
  );
  expect(details[1]).toMatch(/bugs have finished/i);

  // It dismisses itself, so it never blocks the map for longer than it
  // is on screen, and the persistent readout is what remains.
  await expect(banner).toBeHidden();
  await expect(
    page.locator('#turn-banner [data-field="phase"]'),
  ).toHaveAttribute("data-phase", "player");
  await expect(page.locator('#turn-banner [data-field="turn"]')).toHaveText(
    "2",
  );

  expect(errors).toEqual([]);
});
