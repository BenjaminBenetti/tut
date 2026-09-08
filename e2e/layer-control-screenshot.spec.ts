import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tut__?: { startTacticalMission(id: string): unknown };
  __tutTactical__?: TacticalTestHooks;
}

/** A tile in the mission's map. */
interface Tile {
  x: number;
  y: number;
  z: number;
}

/** A point in client pixels, as the scene's projection hooks report them. */
interface Point {
  x: number;
  y: number;
}

/** Where in the viewport to frame something, as fractions of its size. */
interface Anchor {
  x: number;
  y: number;
}

/** Days to advance before giving up on a mission appearing for the fixed seed. */
const MAX_DAYS = 40;

/** Where the committed frames go. */
const FRAMES = "docs/design/tactical-layer-control";

/** The autosave slot every write below goes through. */
const SAVE_KEY = "tut:save:autosave";

/**
 * Plays into a live mission on `seed` and returns the storey range the
 * map offers.
 *
 * @param page - The page to drive.
 * @param seed - Campaign seed.
 * @returns Storeys the layer control can step through.
 */
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
 * Screenshots the viewport once the scene has actually drawn the change.
 *
 * The readout is DOM and updates synchronously; the map is a WebGL
 * canvas that redraws on the next frame. Shooting straight after the
 * `data-tactical-storey` assertion caught the previous frame: the "one
 * storey down" capture came back identical to the uncut one apart from
 * the banner, which is a frame that says the feature does nothing.
 *
 * @param page - The page holding the live mission.
 * @param path - Where to write the PNG.
 */
async function shoot(page: Page, path: string): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await page.locator("#tactical-viewport").screenshot({ path });
}

/** Steps the view `delta` storeys through the same path the keys take. */
async function step(page: Page, delta: number): Promise<void> {
  await page.evaluate(
    (d) => (globalThis as HookGlobal).__tutTactical__?.stepLayer(d),
    delta,
  );
}

/** Drives the view down to the ground floor, however tall the map is. */
async function toGround(page: Page, storeys: number): Promise<void> {
  for (let i = 0; i < storeys; i++) {
    await step(page, -1);
  }
  await expect(page.locator("body")).toHaveAttribute(
    "data-tactical-storey",
    "1",
  );
}

/**
 * The map's tallest standable tile inside a building, read out of the
 * autosave — the only view of the mission a spec has.
 *
 * @param page - The page holding the live mission.
 * @returns The tile, or null when the map is flat.
 */
async function highestTile(page: Page): Promise<Tile | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      return null;
    }
    const save = JSON.parse(raw) as {
      state: {
        activeMission?: {
          map: { tiles: { x: number; y: number; z: number }[] };
        };
      };
    };
    const tiles = save.state.activeMission?.map.tiles ?? [];
    let best: Tile | null = null;
    for (const tile of tiles) {
      if (best === null || tile.y > best.y) {
        best = { x: tile.x, y: tile.y, z: tile.z };
      }
    }
    return best;
  }, SAVE_KEY);
}

/**
 * A standable tile two storeys above the ground, for the unit frame.
 *
 * Not the roof: a unit ten layers above the cut sits so far up the
 * screen that the building it is missing falls out of frame, and the
 * camera is bounded to the map so it cannot be panned to hold both. Two
 * storeys up is the same case — a unit drawn above what the cut shows —
 * composed so a reader can see the gap.
 *
 * @param page - The page holding the live mission.
 * @returns The tile, or null when the map is flat.
 */
async function upperTile(page: Page): Promise<Tile | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      return null;
    }
    const save = JSON.parse(raw) as {
      state: {
        activeMission?: {
          map: { tiles: { x: number; y: number; z: number }[] };
        };
      };
    };
    const tiles = save.state.activeMission?.map.tiles ?? [];
    const levels = [...new Set(tiles.map((t) => t.y))].sort((a, b) => a - b);
    const wanted = levels[Math.min(2, levels.length - 1)];
    return tiles.find((t) => t.y === wanted) ?? null;
  }, SAVE_KEY);
}

/** Where a tile is drawn, in client pixels. */
async function tileAt(page: Page, tile: Tile): Promise<Point | undefined> {
  return page.evaluate(
    (t) => (globalThis as HookGlobal).__tutTactical__?.tileScreenPosition(t),
    tile,
  );
}

/** Where a unit is drawn, in client pixels. */
async function unitAt(page: Page, unitId: string): Promise<Point | undefined> {
  return page.evaluate(
    (id) => (globalThis as HookGlobal).__tutTactical__?.unitScreenPosition(id),
    unitId,
  );
}

/**
 * Pans the camera until `at()` sits at `where` in the viewport.
 *
 * Calibrated rather than guessed: one tap of `d` and one of `s` are
 * measured against `tileScreenPosition`, and the remaining distance is
 * divided by what a tap actually moved. `tapPanPx` is a screen-space
 * constant but its sign in world terms depends on the camera's yaw, so
 * measuring is both shorter and more honest than deriving it.
 *
 * @param page - The page holding the live mission.
 * @param at - Where the thing to frame is, in client pixels.
 * @param where - Fractions of the viewport to put it at; the middle by default.
 */
async function panTo(
  page: Page,
  at: () => Promise<Point | undefined>,
  where: Anchor = { x: 0.5, y: 0.5 },
): Promise<void> {
  const box = await page.locator("#tactical-viewport").boundingBox();
  const start = await at();
  if (!box || !start) {
    return;
  }
  const centre = {
    x: box.x + box.width * where.x,
    y: box.y + box.height * where.y,
  };
  const tap = async (key: string): Promise<void> => {
    await page.keyboard.press(key);
    await page.waitForTimeout(60);
  };
  await tap("d");
  const afterD = await at();
  await tap("s");
  const afterS = await at();
  if (!afterD || !afterS) {
    return;
  }
  const perTapX = afterD.x - start.x;
  const perTapY = afterS.y - afterD.y;
  if (Math.abs(perTapX) > 1) {
    const taps = Math.round((centre.x - afterS.x) / perTapX);
    for (let i = 0; i < Math.min(30, Math.abs(taps)); i++) {
      await tap(taps > 0 ? "d" : "a");
    }
  }
  if (Math.abs(perTapY) > 1) {
    const after = (await at()) ?? afterS;
    const taps = Math.round((centre.y - after.y) / perTapY);
    for (let i = 0; i < Math.min(30, Math.abs(taps)); i++) {
      await tap(taps > 0 ? "s" : "w");
    }
  }
  // Settle before anyone screenshots. The rig eases toward its target
  // rather than jumping, so a fixed wait after the last tap is a guess:
  // the first capture of this spec came back with the "one storey down"
  // frame shot from a different camera than the one above it, because
  // the pan was still arriving. Wait for the projection to stop moving.
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

/**
 * Puts `unitId` on `tile` by editing the autosave and resuming, rather
 * than walking it there.
 *
 * A walk up a staircase is several turns of pathing and would make the
 * frame depend on the mover, the AP budget and the bugs' turn. The frame
 * is about what the *renderer* does with a unit above the cut, so the
 * shortest honest way to produce one is to place it.
 *
 * @param page - The page holding the live mission.
 * @param unitId - The unit to move.
 * @param tile - Where to put it.
 */
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
        state: {
          activeMission?: {
            units: { id: string; pos: { x: number; y: number; z: number } }[];
          };
        };
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
 * Frames for the Director's judgement on #961: a multi-storey building
 * at the ground cut, one storey up, uncut, a unit standing above the
 * cut, and the known-good pair where the control is asked to do
 * something it cannot.
 *
 * Not an assertion of how it looks — that is the Director's call. What
 * it does assert is that the shot is of the real thing: a live mission
 * on a generated map, stepped through the same intent path the keys use,
 * with the readout agreeing at every step.
 */
test("captures the layer control for review", async ({ page }) => {
  // A capture, not a gate. Its output is five files in docs/design, so
  // it stays out of every CI run:
  //   CAPTURE=1 pnpm exec playwright test e2e/layer-control-screenshot.spec.ts
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the layer control frames",
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const body = page.locator("body");
  const readout = page.locator('#turn-banner [data-field="floor"]');

  const storeys = await launch(page, "4242");
  // Put the tallest building in the middle of the frame before cutting
  // anything. The mission opens framed on the deploy zone, where the
  // only multi-storey building sits at the top edge: the first capture
  // of this spec came back with the peel happening off-screen and the
  // frames near-identical for the wrong reason. The camera starts at
  // `CAMERA_ZOOM.min`, so there is no zooming out of that -- it has to
  // be a pan.
  const roof = await highestTile(page);
  expect(
    roof,
    "the capture seed must have a building to look at",
  ).not.toBeNull();
  if (roof) {
    await panTo(page, () => tileAt(page, roof));
  }
  // A frame of a flat map would say nothing about a layer control, so
  // this is a hard requirement rather than a skip.
  expect(
    storeys,
    "the capture seed must offer a multi-storey building",
  ).toBeGreaterThan(1);
  await expect(readout).toHaveText(`${storeys} / ${storeys}`);

  // Uncut: the map as it has always looked.
  await shoot(page, `${FRAMES}-top.png`);

  // The known-good. Up from the top cannot go anywhere, so the frame
  // either matches the one above exactly or the control is changing
  // something it should not.
  await step(page, 1);
  await expect(readout).toHaveText(`${storeys} / ${storeys}`);
  await shoot(page, `${FRAMES}-top-after-up.png`);

  // One storey down: the transition off the top.
  await step(page, -1);
  await expect(body).toHaveAttribute(
    "data-tactical-storey",
    String(storeys - 1),
  );
  await shoot(page, `${FRAMES}-one-down.png`);

  // The ground floor, roofs and upper storeys peeled off.
  await toGround(page, storeys);
  await expect(readout).toHaveText(`1 / ${storeys}`);
  await shoot(page, `${FRAMES}-ground.png`);

  // Down from the ground floor is the other end of the clamp.
  await step(page, -1);
  await expect(readout).toHaveText(`1 / ${storeys}`);

  // A unit standing above the cut: it keeps its true height, because
  // hiding an enemy because the player looked at another floor would be
  // a tactics bug wearing a view option's clothes.
  const perch = await upperTile(page);
  expect(
    perch,
    "the map must have a tile above the ground floor",
  ).not.toBeNull();
  if (perch) {
    await placeUnit(page, "unit-1", perch);
    await page.evaluate(() =>
      (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-1"),
    );
    await expect(body).toHaveAttribute("data-selected-unit", "unit-1");
    // On the unit itself, not on the roof tile under it: the point of
    // the frame is what the unit looks like with nothing beneath it.
    //
    // Waited for, not sampled: the resumed scene reports the unit count
    // before its model has a world position, and `centreOn` reads a
    // projection. The first capture of this frame came back with the
    // unit clipped off the top edge because the pan gave up on an
    // undefined start.
    await expect
      .poll(async () => (await unitAt(page, "unit-1")) !== undefined)
      .toBe(true);
    // High in the frame rather than centred: the unit is ten layers
    // above the floor it is standing over, so centring it pushes the
    // building it is missing off the bottom — and the gap between the
    // two is the whole subject of the frame.
    await panTo(page, () => unitAt(page, "unit-1"), { x: 0.5, y: 0.45 });
    await toGround(page, storeys);
    await shoot(page, `${FRAMES}-unit-above-cut.png`);
  }

  expect(errors).toEqual([]);
});
