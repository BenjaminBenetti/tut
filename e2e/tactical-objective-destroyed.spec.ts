import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** Days to advance before giving up on a mission appearing for the fixed seed. */
const MAX_DAYS = 40;

/** Turns to allow for closing on the objective and shooting it. */
const MAX_TURNS = 20;

/** Attack attempts per turn, one per action point plus slack for a refusal. */
const ATTEMPTS_PER_TURN = 3;

/** How long the autosave needs to catch up with a move or a shot. */
const SETTLE_MS = 250;

/**
 * Playing a mission out costs far more than the suite's 30 s default. It is
 * still bounded: the mech closes on the objective in a handful of turns.
 */
const TEST_TIMEOUT_MS = 180_000;

/** Seed whose first mission puts a spawner within reach of the deploy zone. */
const SEED = "f2";

/** What the mission looks like from outside: just enough to drive and assert. */
interface MissionSnapshot {
  readonly phase: string;
  readonly units: readonly {
    readonly id: string;
    readonly team: string;
    readonly kind?: string;
    readonly hp: number;
    readonly pos: { x: number; y: number; z: number };
  }[];
  readonly spawners: readonly {
    readonly id: string;
    readonly hp: number;
    readonly destroyed?: boolean;
    readonly pos: { x: number; y: number; z: number };
  }[];
}

/** Reads the live mission out of the autosave. */
async function snapshot(page: Page): Promise<MissionSnapshot | null> {
  return page.evaluate(() => {
    const raw = localStorage.getItem("tut:save:autosave");
    if (raw === null) {
      return null;
    }
    const mission = (
      JSON.parse(raw) as { state: { activeMission?: MissionSnapshot } }
    ).state.activeMission;
    return mission ?? null;
  });
}

/** Manhattan distance, the metric the combat rules and the HUD both use. */
function manhattan(
  a: { x: number; z: number },
  b: { x: number; z: number },
): number {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

/**
 * A mission has to be winnable, and nothing else in the suite asserts it —
 * `tactical-mission-flow` ends by extracting, which is the exit a player
 * takes when they give up on the objective.
 *
 * This drives the real control scheme: select the mech, arm Attack with the
 * number row, target the spawner, and fire when the preview offers a shot;
 * step toward it with a right click when it does not.
 *
 * ```
 *   per turn ──► aim at the spawner
 *                  preview clean ──► right-click Fire ──► spawner hp falls
 *                  preview refuses ──► right-click a tile toward it
 *                └─ repeat until the spawner is destroyed
 * ```
 *
 * It is deliberately map-agnostic: it reads the objective's position from
 * the mission rather than hard-coding tiles, so mapgen changes retune it
 * instead of breaking it.
 */
test("a mech can destroy an egg spawner, so a mission can be won", async ({
  page,
}) => {
  test.setTimeout(TEST_TIMEOUT_MS);
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
  await page.locator('[data-field="seed"]').fill(SEED);
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
  await expect(rows.first()).toBeVisible();

  await rows.first().click();
  await page
    .locator('[data-role="mission-details"] [data-action="plan-deployment"]')
    .click();
  await expect(body).toHaveAttribute("data-screen", "deployment");
  // Both tables: the mech is the unit that can kill a 20 hp spawner outright.
  const picks = page.locator(
    '#deploy-squads input[type="checkbox"]:not(:disabled), #deploy-mechs input[type="checkbox"]:not(:disabled)',
  );
  for (let i = 0, n = await picks.count(); i < n; i++) {
    await picks.nth(i).check();
  }
  await page.locator('[data-action="launch"]').click();
  await expect(body).toHaveAttribute("data-screen", "tactical");
  await expect(page.locator("#tactical-viewport canvas")).toBeVisible();

  const start = await snapshot(page);
  expect(start).not.toBeNull();
  const mech = start?.units.find(
    (unit) => unit.team === "tdf" && unit.kind === "mech",
  );
  expect(mech, "the deployed force includes a mech").toBeDefined();
  const objective = start?.spawners[0];
  expect(objective, "the mission has an egg spawner to destroy").toBeDefined();
  const mechId = mech!.id;
  const spawnerId = objective!.id;

  /** Arms Attack on the mech and targets the spawner, returning the preview. */
  const aim = async (): Promise<{ error: string | null; ready: boolean }> => {
    await page.evaluate(
      (id) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(id),
      mechId,
    );
    await page.keyboard.press("2");
    await page.evaluate(
      (id) => (globalThis as HookGlobal).__tutTactical__?.selectSpawner(id),
      spawnerId,
    );
    await page.waitForTimeout(SETTLE_MS);
    return page.evaluate(() => {
      const panel = document.querySelector("#hit-preview");
      if (panel === null) {
        return { error: "no preview", ready: false };
      }
      const refusal = panel.querySelector('[data-role="preview-error"]');
      const shown =
        refusal !== null && !refusal.hasAttribute("hidden")
          ? (refusal.textContent ?? "").trim()
          : null;
      const fire = panel.querySelector('[data-action="confirm-attack"]');
      return {
        error: shown === "" ? null : shown,
        ready: shown === null && fire !== null && !(fire as HTMLButtonElement).disabled,
      };
    });
  };

  let destroyed = false;
  for (let turn = 0; turn < MAX_TURNS && !destroyed; turn++) {
    for (let attempt = 0; attempt < ATTEMPTS_PER_TURN && !destroyed; attempt++) {
      const preview = await aim();
      if (preview.ready) {
        await page.locator('#hit-preview [data-action="confirm-attack"]').click();
        await page.waitForTimeout(SETTLE_MS);
        const after = await snapshot(page);
        const target = after?.spawners.find((s) => s.id === spawnerId);
        destroyed = target === undefined || target.destroyed === true || target.hp <= 0;
        continue;
      }
      // Out of range or no sight line: close the ground with a right click,
      // which is how a player moves since #520.
      const now = await snapshot(page);
      const self = now?.units.find((u) => u.id === mechId);
      const target = now?.spawners.find((s) => s.id === spawnerId);
      if (self === undefined || target === undefined || self.hp <= 0) {
        break;
      }
      // One move action covers several tiles, so aim near the objective first
      // and fall back to shorter hops; a single step is the last resort.
      const stepX = Math.sign(target.pos.x - self.pos.x);
      const stepZ = Math.sign(target.pos.z - self.pos.z);
      const nearX = Math.sign(self.pos.x - target.pos.x) || 1;
      const nearZ = Math.sign(self.pos.z - target.pos.z) || 1;
      const goals = [
        { x: target.pos.x + nearX * 4, y: self.pos.y, z: target.pos.z + nearZ * 4 },
        { x: target.pos.x + nearX * 5, y: self.pos.y, z: target.pos.z },
        { x: target.pos.x, y: self.pos.y, z: target.pos.z + nearZ * 5 },
        { x: self.pos.x + stepX * 5, y: self.pos.y, z: self.pos.z },
        { x: self.pos.x, y: self.pos.y, z: self.pos.z + stepZ * 5 },
        { x: self.pos.x + stepX, y: self.pos.y, z: self.pos.z },
        { x: self.pos.x, y: self.pos.y, z: self.pos.z + stepZ },
      ].filter((goal) => goal.x !== self.pos.x || goal.z !== self.pos.z);
      await page.evaluate(
        (id) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(id),
        mechId,
      );
      await page.keyboard.press("1");
      for (const goal of goals) {
        await page.evaluate(
          (tile) => (globalThis as HookGlobal).__tutTactical__?.invokeTile(tile),
          goal,
        );
        await page.waitForTimeout(SETTLE_MS);
        const moved = await snapshot(page);
        const nowAt = moved?.units.find((u) => u.id === mechId);
        if (nowAt !== undefined && manhattan(nowAt.pos, self.pos) > 0) {
          break;
        }
      }
    }
    if (destroyed) {
      break;
    }
    const endTurn = page.locator('#action-bar [data-action="end-turn"]');
    if (await endTurn.isEnabled()) {
      await endTurn.click();
      await expect(
        page.locator('#turn-banner [data-field="phase"]'),
      ).toContainText(/player/i, { timeout: 30000 });
    }
  }

  const finished = await snapshot(page);
  const objectiveNow = finished?.spawners.find((s) => s.id === spawnerId);
  expect(
    destroyed,
    `the mech never destroyed ${spawnerId}; it still has ${objectiveNow?.hp ?? "?"} hp`,
  ).toBe(true);
  expect(errors, `console errors during the mission: ${errors.join(" | ")}`).toHaveLength(0);
});
