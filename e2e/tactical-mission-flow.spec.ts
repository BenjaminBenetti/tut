import { expect, test } from "@playwright/test";

import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** Days to advance before giving up on a mission appearing for the fixed seed. */
const MAX_DAYS = 40;

/**
 * The shipped M2 loop (#341): Launch plays the mission on a generated map
 * instead of rolling it, and the debrief is made from the mission that
 * was actually fought.
 *
 * The force deploys onto the extraction hook — baseline missions extract
 * where they deployed (ADR 0004 §4.6) — so a single squad can walk off
 * the map on turn one, which ends the mission as `extracted`.
 */
test("Launch plays the mission out, extraction ends it, and the debrief comes from the tactical result", async ({
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

  // Advance until the fixed seed offers a mission.
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
  await expect(rows.first()).toBeVisible();
  const missionId = await rows.first().getAttribute("data-mission-id");
  expect(missionId).toMatch(/^mission-\d+$/);

  // Deploy one squad and launch into the mission itself.
  await rows.first().click();
  const dayBefore = Number(
    await page.locator('#top-bar [data-field="day"]').textContent(),
  );
  await page
    .locator('[data-role="mission-details"] [data-action="plan-deployment"]')
    .click();
  await expect(body).toHaveAttribute("data-screen", "deployment");
  await page.locator('#deploy-squads input[type="checkbox"]').first().check();
  await page.locator('[data-action="launch"]').click();

  await expect(body).toHaveAttribute("data-screen", "tactical");
  await expect(page.locator("#tactical-viewport canvas")).toBeVisible();
  await expect(
    page.locator('#turn-banner [data-field="mission-id"]'),
  ).toHaveText(missionId ?? "");
  await expect(page.locator('#turn-banner [data-field="turn"]')).toHaveText(
    "1",
  );
  await expect(
    page.locator('#turn-banner [data-field="tdf-units"]'),
  ).toHaveText("1");
  // The objective tracker reads from the mission: every spawner still
  // standing, none of them worked yet. Interact is offered only in reach,
  // and the spawners sit 12+ tiles from the deploy zone (#427).
  const objectives = page.locator('[data-role="objective-list"] li');
  await expect(objectives.first()).toBeVisible();
  await expect(page.locator('[data-field="objective-summary"]')).toHaveText(
    /^0 \/ [1-9]\d*$/,
  );
  await expect(objectives.first()).toContainText("hp");
  await expect(
    page.locator('#action-bar [data-action="interact"]'),
  ).toBeDisabled();

  // The mission is still on offer: nothing is resolved until it ends.

  // The autosave carries the live mission: a reload resumes it here.
  await page.reload();
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-action="continue"]').click();
  await expect(body).toHaveAttribute("data-screen", "tactical");
  await expect(
    page.locator('#turn-banner [data-field="mission-id"]'),
  ).toHaveText(missionId ?? "");

  // Walk the squad off the map. It deployed on the extraction hook, so
  // Extract is offered as soon as it is selected.
  const extract = page.locator('#action-bar [data-action="extract"]');
  await expect(extract).toBeDisabled();
  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-1"),
  );
  await expect(body).toHaveAttribute("data-selected-unit", "unit-1");
  await expect(extract).toBeEnabled();
  await extract.click();

  // The last unit off the map ends the mission, and the debrief is built
  // from it: extracted, with the extraction share of the reward.
  await expect(body).toHaveAttribute("data-screen", "mission-results");
  const results = page.locator('[data-screen="mission-results"]');
  await expect(results.locator('[data-field="outcome"]')).toHaveAttribute(
    "data-outcome",
    "extracted",
  );
  await expect(results.locator('[data-field="credits"]')).toBeVisible();

  // Continue advances the day, returns to the overworld, and the mission
  // is gone from the offers because it was resolved.
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

/**
 * Move is the default action (#519): with a unit selected, a click on a
 * reachable tile walks it there, with no action chosen from the bar
 * first. The Executive Director's first playtest note.
 *
 * The destination is read out of the autosave rather than guessed: the
 * extraction hook shares the first deploy zone's tiles (ADR 0004 §4.6),
 * so any extraction tile the unit is not already standing on is both
 * walkable and a few steps away.
 */
test("a unit moves on a tile click, with no action chosen first", async ({
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
  await rows.first().click();
  await page
    .locator('[data-role="mission-details"] [data-action="plan-deployment"]')
    .click();
  await page.locator('#deploy-squads input[type="checkbox"]').first().check();
  await page.locator('[data-action="launch"]').click();
  await expect(body).toHaveAttribute("data-screen", "tactical");

  /** The deployed unit and the nearest extraction tile it is not on. */
  const plan = await page.evaluate(() => {
    const raw = localStorage.getItem("tut:save:autosave");
    if (raw === null) return null;
    const envelope = JSON.parse(raw) as {
      state: {
        activeMission?: {
          units: {
            id: string;
            team: string;
            pos: { x: number; y: number; z: number };
          }[];
          extraction: { x: number; y: number; z: number }[];
        };
      };
    };
    const mission = envelope.state.activeMission;
    const unit = mission?.units.find((u) => u.team === "tdf");
    if (!mission || !unit) return null;
    const away = mission.extraction
      .filter(
        (t) => t.x !== unit.pos.x || t.y !== unit.pos.y || t.z !== unit.pos.z,
      )
      .sort(
        (a, b) =>
          Math.abs(a.x - unit.pos.x) +
          Math.abs(a.z - unit.pos.z) -
          (Math.abs(b.x - unit.pos.x) + Math.abs(b.z - unit.pos.z)),
      );
    return away[0] === undefined
      ? null
      : { unitId: unit.id, from: unit.pos, to: away[0] };
  });
  expect(plan).not.toBeNull();
  if (!plan) return;

  // Select the unit and click the tile. Nothing on the action bar is
  // touched between the two — that is the whole point of #519.
  await page.evaluate(
    (unitId) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(unitId),
    plan.unitId,
  );
  await expect(body).toHaveAttribute("data-selected-unit", plan.unitId);
  await expect(
    page.locator('#action-bar [data-action="move"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(
    (tile) => (globalThis as HookGlobal).__tutTactical__?.selectTile(tile),
    plan.to,
  );

  // The unit stands where it was sent.
  await expect
    .poll(async () =>
      page.evaluate((unitId) => {
        const raw = localStorage.getItem("tut:save:autosave");
        if (raw === null) return null;
        const envelope = JSON.parse(raw) as {
          state: {
            activeMission?: {
              units: {
                id: string;
                pos: { x: number; y: number; z: number };
              }[];
            };
          };
        };
        const unit = envelope.state.activeMission?.units.find(
          (u) => u.id === unitId,
        );
        return unit ? `${unit.pos.x},${unit.pos.y},${unit.pos.z}` : null;
      }, plan.unitId),
    )
    .toBe(`${plan.to.x},${plan.to.y},${plan.to.z}`);
});

/**
 * Ending a turn plays a whole round. Since #335 the bug-phase runner
 * resolves every living bug inside `EndTurn`, so the phase the player
 * sees afterwards is their own again with the turn counter one higher —
 * the bugs never rest holding the phase. Before #335 this test stopped
 * at the handover, because the bugs did not hand it back.
 */
test("End turn plays the bug phase and comes back to the player", async ({
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
  await rows.first().click();
  await page
    .locator('[data-role="mission-details"] [data-action="plan-deployment"]')
    .click();
  await page.locator('#deploy-squads input[type="checkbox"]').first().check();
  await page.locator('[data-action="launch"]').click();
  await expect(body).toHaveAttribute("data-screen", "tactical");

  const phase = page.locator('#turn-banner [data-field="phase"]');
  const turn = page.locator('#turn-banner [data-field="turn"]');
  await expect(phase).toHaveAttribute("data-phase", "player");
  const before = Number(await turn.textContent());
  expect(before).toBeGreaterThan(0);

  await page.locator('#action-bar [data-action="end-turn"]').click();

  // The bugs act inside EndTurn, so the round is over by the time the
  // banner repaints: same side, next turn.
  await expect(turn).toHaveText(String(before + 1));
  await expect(phase).toHaveAttribute("data-phase", "player");
});
