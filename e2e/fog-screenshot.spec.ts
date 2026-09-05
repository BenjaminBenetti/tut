import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** Days to advance before giving up on a mission appearing for the fixed seed. */
const MAX_DAYS = 40;

/** A tile the walk can aim at. */
interface Tile {
  x: number;
  y: number;
  z: number;
}

/** Hops the walk will try in one turn before giving the tile up. */
const WALK_CANDIDATES = 8;

/** How far from the unit a hop may land, in tiles. */
const WALK_REACH = 6;

/**
 * Reads a unit's tile out of the autosave, which is the only view of the
 * mission a spec has.
 *
 * @param page - The page holding the live mission.
 * @param unitId - The unit to locate.
 * @returns Its tile, or `null` when there is no mission or no such unit.
 */
async function unitTile(page: Page, unitId: string): Promise<Tile | null> {
  return page.evaluate((id) => {
    const raw = localStorage.getItem("tut:save:autosave");
    if (raw === null) return null;
    const envelope = JSON.parse(raw) as {
      state: {
        activeMission?: { units: { id: string; pos: Tile }[] };
      };
    };
    return (
      envelope.state.activeMission?.units.find((u) => u.id === id)?.pos ?? null
    );
  }, unitId);
}

/**
 * Walks a unit one turn'"'"'s worth of ground toward a distant tile.
 *
 * A move longer than the unit'"'"'s budget is **refused outright** rather
 * than walked partway — `move-handler` rejects it as `illegal-move
 * (over-budget)` — so the far extraction tile cannot simply be invoked.
 * This aims at the map'"'"'s own tiles instead: the ones within `WALK_REACH`
 * of the unit, nearest the target first, taking whichever the mover
 * accepts.
 *
 * ```
 *   candidates ──► sort by distance to target ──► invoke ──► moved? ──► done
 *                                                   └── refused ──► next
 * ```
 *
 * The right button is what triggers an action since #520; a left click
 * only selects, which is why this spec used to end its six turns with
 * the force still standing on the deploy zone.
 *
 * @param page - The page holding the live mission.
 * @param unitId - The unit to walk.
 * @param target - The tile to head towards; it is not expected to be reached.
 */
async function walkToward(
  page: Page,
  unitId: string,
  target: Tile,
): Promise<void> {
  const from = await unitTile(page, unitId);
  if (from === null) {
    return;
  }
  await page.evaluate(
    (id) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(id),
    unitId,
  );
  const candidates = await page.evaluate(
    ({ origin, aim, reach, take }) => {
      const raw = localStorage.getItem("tut:save:autosave");
      if (raw === null) return [];
      const envelope = JSON.parse(raw) as {
        state: { activeMission?: { map: { tiles: Tile[] } } };
      };
      const tiles = envelope.state.activeMission?.map.tiles ?? [];
      const near = (a: Tile, b: Tile): number =>
        Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
      return tiles
        .filter((t) => near(t, origin) > 0 && near(t, origin) <= reach)
        .sort((a, b) => near(a, aim) - near(b, aim))
        .slice(0, take);
    },
    { origin: from, aim: target, reach: WALK_REACH, take: WALK_CANDIDATES },
  );
  for (const tile of candidates) {
    await page.evaluate(
      (t) => (globalThis as HookGlobal).__tutTactical__?.invokeTile(t),
      tile,
    );
    await page.waitForTimeout(120);
    const now = await unitTile(page, unitId);
    if (now !== null && (now.x !== from.x || now.z !== from.z)) {
      return;
    }
  }
}

/**
 * Captures a mission with fog of war in place, for the Director to judge
 * before it goes in front of the Executive Director (#531).
 *
 * Not an assertion of how it looks — that is a human call. What it does
 * assert is that the shot is of the real thing: a live mission, on a
 * generated map, with the player's own vision deciding what is drawn.
 */
test("captures a mission with fog of war for review", async ({ page }) => {
  // A capture, not a gate. It costs about twenty seconds and its output
  // is two files in docs/design, so it stays out of every CI run:
  //   CAPTURE=1 pnpm exec playwright test e2e/fog-screenshot.spec.ts
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the fog screenshots",
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
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
  await rows.first().click();
  await page
    .locator('[data-role="mission-details"] [data-action="plan-deployment"]')
    .click();
  await expect(body).toHaveAttribute("data-screen", "deployment");
  for (const box of await page
    .locator('[data-role="deployment-picker"] input[type="checkbox"]')
    .all()) {
    await box.check();
  }
  await page.locator('[data-action="launch"]').click();
  await expect(body).toHaveAttribute("data-screen", "tactical");
  await expect(page.locator("#tactical-viewport canvas")).toBeVisible();

  // Select a unit so the range field and the selection ring are up too.
  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-1"),
  );
  await expect(body).toHaveAttribute("data-selected-unit", "unit-1");

  // The shot shows the whole terrain, with the player's exploration
  // history deciding its atmosphere.
  const known = await page.evaluate(() => {
    const raw = localStorage.getItem("tut:save:autosave");
    if (raw === null) return null;
    const envelope = JSON.parse(raw) as {
      state: {
        activeMission?: {
          map: { tiles: unknown[] };
          units: { team: string }[];
          vision: {
            tdf: { visible: number[]; explored: number[]; spotted: string[] };
          };
        };
      };
    };
    const m = envelope.state.activeMission;
    if (!m) return null;
    return {
      tiles: m.map.tiles.length,
      explored: m.vision.tdf.explored.length,
      visible: m.vision.tdf.visible.length,
      bugs: m.units.filter((u) => u.team === "bugs").length,
      spottedBugs: m.vision.tdf.spotted.length,
    };
  });
  expect(known).not.toBeNull();
  if (!known) return;
  // Fog is really hiding something: the squad has seen part of the map,
  // not all of it.
  expect(known.explored).toBeGreaterThan(0);
  expect(known.explored).toBeLessThan(known.tiles);

  // The shot has to show every unit the player is entitled to see, or it
  // is evidence of a drawing bug rather than of fog. `data-tactical-units`
  // is what the scene actually put on the board — and the host stamps it
  // only once the unit models have loaded, so this retries to the count
  // rather than reading the attribute once and finding it absent (#650).
  await expect(body).toHaveAttribute(
    "data-tactical-units",
    String(3 + known.spottedBugs),
  );

  await page.waitForTimeout(400);
  await page.screenshot({ path: "docs/design/tactical-fog-of-war.png" });

  // Turn one separates visible ground from never-explored mist. Walk the
  // force and let the bugs come on, so the second shot shows what matters:
  // ground the squad remembers but cannot currently see, and a bug that
  // has actually been spotted.
  const step = await page.evaluate(() => {
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
    const m = envelope.state.activeMission;
    const unit = m?.units.find((u) => u.id === "unit-1");
    if (!m || !unit) return null;
    const away = [...m.extraction].sort(
      (a, b) =>
        Math.abs(b.x - unit.pos.x) +
        Math.abs(b.z - unit.pos.z) -
        (Math.abs(a.x - unit.pos.x) + Math.abs(a.z - unit.pos.z)),
    );
    return away[0] ?? null;
  });
  const start = await unitTile(page, "unit-1");
  for (let turn = 0; turn < 6; turn++) {
    if (step) {
      await walkToward(page, "unit-1", step);
    }
    await page.locator('#action-bar [data-action="end-turn"]').click();
    await page.waitForTimeout(150);
  }
  // The walk is the whole point of the second shot, and it has already
  // failed silently once: #520 moved the trigger to the right button and
  // this spec went on passing while writing a turn-7 image identical to
  // turn 1. Without this the next such regression freezes these images
  // again with the suite still green.
  const end = await unitTile(page, "unit-1");
  expect(end).not.toBeNull();
  expect(`${end?.x},${end?.z}`).not.toBe(`${start?.x},${start?.z}`);
  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-1"),
  );
  // Resume the same live mission to draw turn 7 from its settled state.
  // The turn counter/phase banner can finish before the animation backlog,
  // so a timed shutter otherwise captures terrain with stale vision.
  await page.locator('#turn-banner [data-action="overworld"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");
  await page.locator('#top-bar [data-action="resume-mission"]').click();
  await expect(body).toHaveAttribute("data-screen", "tactical");
  await expect(page.locator("#tactical-viewport canvas")).toBeVisible();
  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-1"),
  );
  await page.waitForTimeout(600);
  const states = await page.evaluate(() => {
    const raw = localStorage.getItem("tut:save:autosave");
    if (!raw) return null;
    const save = JSON.parse(raw) as {
      state: {
        activeMission: {
          turn: number;
          map: { tiles: unknown[] };
          vision: {
            tdf: { visible: number[]; explored: number[] };
          };
        };
      };
    };
    const mission = save.state.activeMission;
    const vision = mission.vision.tdf;
    const visible = new Set(vision.visible);
    return {
      turn: mission.turn,
      visible: visible.size,
      remembered: vision.explored.filter((key) => !visible.has(key)).length,
      unexplored: mission.map.tiles.length - vision.explored.length,
    };
  });
  expect(states?.turn).toBe(7);
  expect(states?.visible).toBeGreaterThan(0);
  expect(states?.remembered).toBeGreaterThan(0);
  expect(states?.unexplored).toBeGreaterThan(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "docs/design/tactical-fog-of-war-turn7.png" });
});
