import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tut__?: { startTacticalMission(id: string): unknown };
  __tutTactical__?: TacticalTestHooks;
}

/** Where the frames go. */
const FRAMES = "docs/design/tactical-layer-cut-hillside";

/** A tile in the mission's map. */
interface Tile {
  x: number;
  y: number;
  z: number;
}

/** A point in client pixels. */
interface Point {
  x: number;
  y: number;
}

/** Days to advance before giving up on a mission appearing for the fixed seed. */
const MAX_DAYS = 40;

/** The autosave slot every read below goes through. */
const SAVE_KEY = "tut:save:autosave";

/** Plays into a live mission and returns the storeys the map offers. */
async function launch(page: Page, seed: string): Promise<number> {
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
  await expect(rows.first()).toBeVisible();
  const missionId = await rows.first().getAttribute("data-mission-id");
  await page.evaluate(
    (id) => (globalThis as HookGlobal).__tut__?.startTacticalMission(id),
    missionId ?? "",
  );
  await expect(body).toHaveAttribute("data-screen", "tactical");
  await expect(page.locator("#tactical-viewport canvas")).toBeVisible();
  await expect(body).toHaveAttribute("data-tactical-units", /^[1-9]\d*$/);
  await expect(body).toHaveAttribute("data-tactical-storeys", /^[1-9]\d*$/);
  return Number(await body.getAttribute("data-tactical-storeys"));
}

/**
 * A ground-floor tile of the building standing highest, and how far
 * above the lowest building it stands.
 *
 * That building is the one #978 is about: before the fix its ground
 * floor was above a cut taken from the building at the bottom of the
 * hill, so it disappeared instead of opening up.
 *
 * @param page - The page holding the live mission.
 * @returns The tile and the step, or null on a flat map.
 */
async function highestBuildingTile(
  page: Page,
): Promise<{ tile: Tile; step: number; terrainCut: number } | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      return null;
    }
    const save = JSON.parse(raw) as {
      state: {
        activeMission?: {
          map: {
            tiles: (Tile & { buildingId?: string; floorIndex?: number })[];
            buildings: { id: string; groundLevel: number }[];
          };
        };
      };
    };
    const map = save.state.activeMission?.map;
    if (!map || map.buildings.length === 0) {
      return null;
    }
    const grounds = map.buildings.map((b) => b.groundLevel);
    const top = Math.max(...grounds);
    const bottom = Math.min(...grounds);
    const highest = map.buildings.find((b) => b.groundLevel === top);
    const tile = map.tiles.find(
      (t) => t.buildingId === highest?.id && t.floorIndex === 0,
    );
    return tile
      ? {
          tile: { x: tile.x, y: tile.y, z: tile.z },
          step: top - bottom,
          // What the old rule cut at on floor 1: the lowest building's
          // ground plus one layer, the top of its ground floor.
          terrainCut: bottom + 1,
        }
      : null;
  }, SAVE_KEY);
}

/** Where a tile is drawn, in client pixels. */
async function tileAt(page: Page, tile: Tile): Promise<Point | undefined> {
  return page.evaluate(
    (t) => (globalThis as HookGlobal).__tutTactical__?.tileScreenPosition(t),
    tile,
  );
}

/**
 * Presses `key` once and returns how far the view moved.
 *
 * **Presses once and fails rather than retrying.** The first version of
 * this retried until it saw movement, which looked robust and was the
 * opposite: a press that registered slowly got pressed again, and both
 * eventually landed, so the camera moved two taps instead of one and
 * the frame came out somewhere else. Two runs of identical code differed
 * by 27 % of their pixels that way. A press that genuinely does not
 * arrive is a broken capture and should say so, not be compensated for.
 *
 * @param page - The page holding the live mission.
 * @param key - The pan key to press.
 * @param at - Where the framed thing is, in client pixels.
 * @returns How far the view moved.
 */
async function tapOnce(
  page: Page,
  key: string,
  at: () => Promise<Point | undefined>,
): Promise<Point> {
  const before = await at();
  if (!before) {
    throw new Error(`cannot pan: nothing to measure before pressing ${key}`);
  }
  await page.keyboard.press(key);
  // Wait for the rig to STOP, not merely to start. It eases toward its
  // target, so returning on the first pixel of movement hands the caller
  // a mid-ease reading; the loop above then decides its next tap from a
  // position the camera is still leaving, and takes a different path on
  // every run.
  let last: Point | undefined;
  for (let frame = 0; frame < 60; frame++) {
    await page.waitForTimeout(50);
    const now = await at();
    if (!now) {
      continue;
    }
    const movedAtAll = Math.hypot(now.x - before.x, now.y - before.y) > 1;
    const stopped = last && Math.hypot(now.x - last.x, now.y - last.y) < 0.01;
    last = now;
    if (movedAtAll && stopped) {
      return { x: now.x - before.x, y: now.y - before.y };
    }
  }
  throw new Error(`pressing ${key} never settled within 3 s`);
}

/**
 * Pans until `tile` is within half a tap of the middle of the viewport.
 *
 * Greedy rather than calibrated: every tap is verified, and the view is
 * re-measured after each one, so the loop ends at the same place on
 * every run from the same starting frame — which is what makes the
 * before/after pair below comparable at all.
 *
 * @param page - The page holding the live mission.
 * @param tile - The tile to centre.
 */
async function centreOn(page: Page, tile: Tile): Promise<void> {
  const at = () => tileAt(page, tile);
  const box = await page.locator("#tactical-viewport").boundingBox();
  if (!box) {
    return;
  }
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  // Half of CAMERA_INPUT_TUNING.tapPanPx: closer than this and a tap
  // would overshoot back the way it came, and the loop would ring.
  const tolerance = 48;
  const moved = { x: 0, y: 0 };
  for (let step = 0; step < 40; step++) {
    const now = await at();
    if (!now) {
      return;
    }
    const dx = centre.x - now.x;
    const dy = centre.y - now.y;
    if (Math.abs(dx) <= tolerance && Math.abs(dy) <= tolerance) {
      break;
    }
    // The axis in most need, and the key that reduces it. Which key
    // moves which way depends on the camera's yaw, so it is learned
    // from the first verified tap rather than assumed.
    const horizontal = Math.abs(dx) > Math.abs(dy);
    if (horizontal && moved.x === 0) {
      moved.x = Math.sign((await tapOnce(page, "d", at)).x);
      continue;
    }
    if (!horizontal && moved.y === 0) {
      moved.y = Math.sign((await tapOnce(page, "s", at)).y);
      continue;
    }
    const key = horizontal
      ? dx > 0 === moved.x > 0
        ? "d"
        : "a"
      : dy > 0 === moved.y > 0
        ? "s"
        : "w";
    await tapOnce(page, key, at);
  }
  // Settle before anyone screenshots. The rig eases toward its target
  // rather than jumping, so returning the moment the loop is inside its
  // tolerance shoots a moving camera: dropping this wait is what made
  // the two "top" frames — the same view either side of a keypress that
  // does nothing — stop being byte-identical.
  await expect
    .poll(
      async () => {
        const a = await at();
        await page.waitForTimeout(120);
        const b = await at();
        return a && b ? Math.hypot(a.x - b.x, a.y - b.y) < 0.5 : false;
      },
      { timeout: 5000 },
    )
    .toBe(true);
}

/** Screenshots the viewport once the scene has drawn the change. */
async function shoot(page: Page, path: string): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await page.locator("#tactical-viewport").screenshot({ path });
}

/**
 * The #978 pair: a map whose buildings stand at different heights, cut
 * to the ground floor, framed on the building standing highest.
 *
 * **Both frames are drawn in one run**, on one camera, seconds apart.
 * That is deliberate and it is the Director's condition for accepting
 * this evidence: the capture harness is not reproducible across runs
 * (#996), so a pair taken in two runs cannot tell a change from the
 * harness. Taken together they share whatever noise this run has, and
 * the difference between them is the change.
 *
 * `before` is the old rule reproduced through `applyHeightCut` — one
 * height for the whole map, anchored to the lowest building — not a
 * mock of it. `after` is what the build actually does.
 *
 *   CAPTURE=1 pnpm exec playwright test e2e/layer-cut-hillside-screenshot.spec.ts
 */
test("captures the hillside cut, before and after, in one run", async ({
  page,
}) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the hillside frames",
  );
  const seed = process.env.LAYER_SEED ?? "555";

  const storeys = await launch(page, seed);
  const highest = await highestBuildingTile(page);
  expect(highest, "the capture seed must have buildings").not.toBeNull();
  if (!highest) {
    return;
  }
  // A flat map would say nothing about this fix, so it is a hard
  // requirement rather than a skip.
  expect(
    highest.step,
    "the capture seed must have buildings at different heights",
  ).toBeGreaterThan(0);

  await centreOn(page, highest.tile);
  for (let i = 0; i < storeys; i++) {
    await page.evaluate(() =>
      (globalThis as HookGlobal).__tutTactical__?.stepLayer(-1),
    );
  }
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-tactical-storey", "1");

  // Before: one height for the whole map, taken from the lowest
  // building, which is what shipped in #961.
  await page.evaluate(
    (cut) => (globalThis as HookGlobal).__tutTactical__?.applyHeightCut(cut),
    highest.terrainCut,
  );
  await shoot(page, `${FRAMES}-before.png`);

  // After: back to the storey focus, which is what this build does.
  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.stepLayer(0),
  );
  await expect(body).toHaveAttribute("data-tactical-storey", "1");
  await shoot(page, `${FRAMES}-after.png`);
});
