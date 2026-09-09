/// <reference types="node" />
import { readFileSync } from "node:fs";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tut__?: { startTacticalMission(id: string): unknown };
  __tutTactical__?: TacticalTestHooks;
}

/** Where the frames go. */
const FRAMES = "docs/design/tactical-elevation-tether";

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
  // Wait for the camera to STOP, not merely to start.
  //
  // **The rig does not ease** — an earlier version of this comment said
  // it did and that was wrong; eng-3 measured it on #996. What actually
  // happens is that `CameraInputController` applies a fixed 96 px tap on
  // keydown *and* keeps panning at 600 px/s for every frame the key is
  // held, and Playwright delivers keydown and keyup as separate tasks:
  // under rendering load the same nominal tap lasted 0.5 ms in one run
  // and 1054 ms in another. So a "tap" is a hold of unpredictable
  // length, and returning on the first pixel of movement hands the loop
  // a reading taken while the pan is still running.
  //
  // Waiting for it to stop bounds the damage but does not remove the
  // cause; eng-3's fix — delivering both events in one browser task — is
  // the real one, and this should adopt their shared helper when it
  // lands.
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
  // Settle before anyone screenshots: returning the moment the loop is
  // inside its tolerance can shoot a camera that is still panning, for
  // the held-key reason above. Dropping this wait is what made two
  // frames of the same view, either side of a keypress that does
  // nothing, stop being byte-identical.
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
 * A standable tile two storeys above the ground, to stand a unit on.
 *
 * @param page - The page holding the live mission.
 * @returns The tile, or null on a flat map.
 */
async function upperTile(page: Page): Promise<Tile | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      return null;
    }
    const save = JSON.parse(raw) as {
      state: { activeMission?: { map: { tiles: Tile[] } } };
    };
    const tiles = save.state.activeMission?.map.tiles ?? [];
    const levels = [...new Set(tiles.map((t) => t.y))].sort((a, b) => a - b);
    const wanted = levels[Math.min(2, levels.length - 1)];
    return tiles.find((t) => t.y === wanted) ?? null;
  }, SAVE_KEY);
}

/** Where a unit is drawn, in client pixels. */
async function unitAt(page: Page, unitId: string): Promise<Point | undefined> {
  return page.evaluate(
    (id) => (globalThis as HookGlobal).__tutTactical__?.unitScreenPosition(id),
    unitId,
  );
}

/** Moves a unit onto `tile` through the autosave, then resumes. */
async function placeUnit(
  page: Page,
  unitId: string,
  tile: Tile,
): Promise<void> {
  await page.evaluate(
    ({ key, id, pos }) => {
      const raw = localStorage.getItem(key);
      if (raw === null) {
        return;
      }
      const save = JSON.parse(raw) as {
        state: { activeMission?: { units: { id: string; pos: Tile }[] } };
      };
      const unit = save.state.activeMission?.units.find((u) => u.id === id);
      if (unit) {
        unit.pos = pos;
      }
      localStorage.setItem(key, JSON.stringify(save));
    },
    { key: SAVE_KEY, id: unitId, pos: tile },
  );
  await page.reload();
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-action="continue"]').click();
  await expect(body).toHaveAttribute("data-screen", "tactical");
  await expect(page.locator("#tactical-viewport canvas")).toBeVisible();
  await expect(body).toHaveAttribute("data-tactical-units", /^[1-9]\d*$/);
}

/**
 * The #981 pair, and the control the ticket asks for.
 *
 * **Both states of each pair are drawn in one run, on one camera, with
 * no pan between them.** The capture harness is not reproducible across
 * runs (#996 -- eng-3 measured the cause: a nominal key tap becomes a
 * hold of unpredictable length, so the pan distance varies), and a pair
 * taken in two runs could not tell this change from that. Within one
 * run both frames inherit whatever the pan did, equally.
 *
 * `before` is the real pre-#981 rendering, not a mock: `applyHeightCut`
 * puts the map back on the plain height cut, which also clears the
 * storey focus and so draws no tethers -- exactly what shipped.
 *
 *   CAPTURE=1 pnpm exec playwright test e2e/elevation-tether-screenshot.spec.ts
 */
test("captures a unit above the cut, before and after, and the control", async ({
  page,
}) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the tether frames",
  );
  const body = page.locator("body");
  const storeys = await launch(page, "4242");
  expect(storeys, "the capture seed must be multi-storey").toBeGreaterThan(1);

  // The control comes FIRST, while every unit is still on the deploy
  // zone below the cut. Taken after the perch it is not a control at
  // all: unit-1's own tether is in the frame, which is how the first
  // version of this failed its own byte-identical assertion.
  const heightCutFor = async (): Promise<number> =>
    page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      const save = JSON.parse(raw ?? "{}") as {
        state: {
          activeMission?: { map: { buildings: { groundLevel: number }[] } };
        };
      };
      const grounds = (save.state.activeMission?.map.buildings ?? []).map(
        (b) => b.groundLevel,
      );
      return grounds.length === 0 ? 1 : Math.min(...grounds) + 1;
    }, SAVE_KEY);
  const stepToGround = async (): Promise<void> => {
    for (let i = 0; i < storeys; i++) {
      await page.evaluate(() =>
        (globalThis as HookGlobal).__tutTactical__?.stepLayer(-1),
      );
    }
    await expect(body).toHaveAttribute("data-tactical-storey", "1");
  };

  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-1"),
  );
  await expect(body).toHaveAttribute("data-selected-unit", "unit-1");
  await expect
    .poll(async () => (await unitAt(page, "unit-1")) !== undefined)
    .toBe(true);
  await centreOn(page, { x: 0, y: 0, z: 0 });
  await stepToGround();
  const groundCut = await heightCutFor();
  await page.evaluate(
    (cut) => (globalThis as HookGlobal).__tutTactical__?.applyHeightCut(cut),
    groundCut,
  );
  await shoot(page, `${FRAMES}-below-before.png`);
  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.stepLayer(0),
  );
  await shoot(page, `${FRAMES}-below-after.png`);
  // Asserted, not eyeballed. A unit standing on floor the cut still
  // shows must render exactly as it did before this change, and the two
  // frames are drawn seconds apart on one camera, so anything that
  // touched a supported unit would show up here as a difference.
  expect(
    readFileSync(`${FRAMES}-below-before.png`).equals(
      readFileSync(`${FRAMES}-below-after.png`),
    ),
    "a unit below the cut must render identically before and after",
  ).toBe(true);

  const perch = await upperTile(page);
  expect(
    perch,
    "the seed must have a tile above the ground floor",
  ).not.toBeNull();
  if (!perch) {
    return;
  }
  await placeUnit(page, "unit-1", perch);
  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-1"),
  );
  await expect(body).toHaveAttribute("data-selected-unit", "unit-1");
  await expect
    .poll(async () => (await unitAt(page, "unit-1")) !== undefined)
    .toBe(true);
  await centreOn(page, perch);

  const toGround = async (): Promise<void> => {
    for (let i = 0; i < storeys; i++) {
      await page.evaluate(() =>
        (globalThis as HookGlobal).__tutTactical__?.stepLayer(-1),
      );
    }
    await expect(body).toHaveAttribute("data-tactical-storey", "1");
  };
  await toGround();
  const heightCut = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    const save = JSON.parse(raw ?? "{}") as {
      state: {
        activeMission?: { map: { buildings: { groundLevel: number }[] } };
      };
    };
    const grounds = (save.state.activeMission?.map.buildings ?? []).map(
      (b) => b.groundLevel,
    );
    return grounds.length === 0 ? 1 : Math.min(...grounds) + 1;
  }, SAVE_KEY);

  // Before: the plain height cut, which draws no tether -- the unit
  // hangs in the air exactly as it shipped.
  await page.evaluate(
    (cut) => (globalThis as HookGlobal).__tutTactical__?.applyHeightCut(cut),
    heightCut,
  );
  await shoot(page, `${FRAMES}-above-before.png`);

  // After: the storey focus, which draws the drop line.
  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.stepLayer(0),
  );
  await expect(body).toHaveAttribute("data-tactical-storey", "1");
  await shoot(page, `${FRAMES}-above-after.png`);
  // And the reported case must actually differ, or the pair proves
  // nothing: a control that cannot fail and a case that cannot show a
  // change are the same mistake twice.
  expect(
    readFileSync(`${FRAMES}-above-before.png`).equals(
      readFileSync(`${FRAMES}-above-after.png`),
    ),
    "a unit above the cut must render differently after this change",
  ).toBe(false);
});
