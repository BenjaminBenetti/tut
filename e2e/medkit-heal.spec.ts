import { expect, test, type Page } from "@playwright/test";

import type { TacticalState } from "../src/tactical/model/tactical-state";
import type { Unit } from "../src/tactical/model/unit";
import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";
import { wheel, wheelItem } from "./action-wheel.helper";
import { drawnFrame, tacticalModelsReady } from "./capture-frame.helper";
import { launchMission, settleForShot } from "./mission-capture.helper";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** A tile on the ground plane, as the hooks name it. */
interface Tile {
  x: number;
  y: number;
  z: number;
}

/** Where the autosave keeps the campaign. */
const AUTOSAVE_KEY = "tut:save:autosave";

/** What the medkit gives each unit it reaches (GDD §6.2.4, #1138). */
const MEDKIT_HEAL = 10;

/** Hit points to take off the squad, more than one heal puts back so the rise is exactly the heal. */
const WOUND = MEDKIT_HEAL + 2;

/** The mission as the autosave last wrote it. */
async function savedMission(page: Page): Promise<TacticalState | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const envelope = JSON.parse(raw) as {
      state: { activeMission?: TacticalState };
    };
    return envelope.state.activeMission ?? null;
  }, AUTOSAVE_KEY);
}

/** `x,y,z` for a set of tiles. */
function keyOf(tile: Tile): string {
  return `${tile.x},${tile.y},${tile.z}`;
}

/**
 * Wounds `unitId` in the autosave and brings the mission back through
 * Continue, the way `tactical-resume` does: there is no hook that hurts
 * a unit, and a bug's attack cannot be counted on to land where the
 * spec needs it. The save is plain JSON with no seal, so the mission
 * resumes with the squad at the hit points written here.
 */
async function woundAndResume(page: Page, unitId: string): Promise<void> {
  await page.evaluate(
    ({ key, unitId, wound }) => {
      const raw = localStorage.getItem(key);
      if (raw === null) throw new Error("no autosave to wound");
      const envelope = JSON.parse(raw) as {
        state: { activeMission?: { units: { id: string; hp: number }[] } };
      };
      const mission = envelope.state.activeMission;
      if (!mission) throw new Error("no active mission in the autosave");
      const unit = mission.units.find((u) => u.id === unitId);
      if (!unit) throw new Error(`no unit ${unitId} to wound`);
      unit.hp -= wound;
      localStorage.setItem(key, JSON.stringify(envelope));
    },
    { key: AUTOSAVE_KEY, unitId, wound: WOUND },
  );
  await page.reload();
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-action="continue"]').click();
  await expect(body).toHaveAttribute("data-screen", "tactical");
  await tacticalModelsReady(page);
  await settleForShot(page);
}

/**
 * Tiles on `around`'s level that exist on the map, hold no living unit,
 * and have no living unit on any of the eight neighbours — a click on
 * the tile behind a unit picks the unit in the isometric view, as the
 * debug-menu spec found — between `min` and `max` tiles out in either
 * axis. Nearest first, so a medic lands as close to the wound as the
 * map allows.
 */
function clearTilesAround(
  mission: TacticalState,
  around: Tile,
  min: number,
  max: number,
): Tile[] {
  const exists = new Set(mission.map.tiles.map(keyOf));
  const living = mission.units.filter((u) => u.hp > 0);
  const taken = new Set(living.map((u) => keyOf(u.pos)));
  const clearOfUnits = (tile: Tile): boolean =>
    living.every(
      (unit) =>
        unit.pos.y !== tile.y ||
        Math.max(Math.abs(unit.pos.x - tile.x), Math.abs(unit.pos.z - tile.z)) >
          1,
    );
  const candidates: Tile[] = [];
  for (let dx = -max; dx <= max; dx += 1) {
    for (let dz = -max; dz <= max; dz += 1) {
      const ring = Math.max(Math.abs(dx), Math.abs(dz));
      if (ring < min) continue;
      const tile = { x: around.x + dx, y: around.y, z: around.z + dz };
      const key = keyOf(tile);
      if (!exists.has(key) || taken.has(key) || !clearOfUnits(tile)) continue;
      candidates.push(tile);
    }
  }
  return candidates.sort(
    (a, b) =>
      Math.hypot(a.x - around.x, a.z - around.z) -
      Math.hypot(b.x - around.x, b.z - around.z),
  );
}

/** The first of `tiles` the scene can put a pointer on, away from the HUD's panels, with where to click it. */
async function clickableTile(
  page: Page,
  tiles: readonly Tile[],
): Promise<{ tile: Tile; at: { x: number; y: number } } | undefined> {
  const bounds = await page.locator("#tactical-viewport canvas").boundingBox();
  if (!bounds) return undefined;
  for (const tile of tiles) {
    const at = await page.evaluate(
      (t: Tile) =>
        (globalThis as HookGlobal).__tutTactical__?.tileScreenPosition(t),
      tile,
    );
    // Clear of the rail on the left and the card on the right, where the
    // HUD's panels take the click (#1113, #1134).
    if (
      at &&
      at.x > bounds.x + bounds.width * 0.3 &&
      at.x < bounds.x + bounds.width * 0.68 &&
      at.y > bounds.y + 80 &&
      at.y < bounds.y + bounds.height - 80
    ) {
      return { tile, at };
    }
  }
  return undefined;
}

/** The unit standing on `tile` in the saved mission, if any. */
async function unitAt(page: Page, tile: Tile): Promise<Unit | undefined> {
  const mission = await savedMission(page);
  return mission?.units.find((u) => keyOf(u.pos) === keyOf(tile));
}

/**
 * A medic heals a wounded squad from the wheel (#1138), in a real
 * mission: the starter force has no medic, so the debug menu (#1136)
 * places one beside a squad the autosave was edited to wound; the
 * tile beside the wound offers **Heal** at the top level of the ring
 * with `+10 hp`, resting on it paints the kit's area, and choosing it
 * puts the ten hit points back, spends a use, and writes the log line.
 *
 * The unit tests cover the rules, the wheel and the overlay each on
 * their own; this walks the wiring between them.
 */
test("a placed medic heals a wounded squad from the tile's wheel", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 800 });
  await launchMission(page, "4242");
  await tacticalModelsReady(page);
  await settleForShot(page);
  const body = page.locator("body");

  // The first squad of the force, wounded by twelve and brought back.
  await expect.poll(async () => (await savedMission(page)) !== null).toBe(true);
  const fresh = await savedMission(page);
  const squad = fresh!.units.find(
    (u) => u.team === "tdf" && u.kind === "squad" && u.hp > 0,
  );
  expect(squad, "a squad in the starter force").toBeTruthy();
  const woundedId = squad!.id;
  const woundedHp = squad!.hp - WOUND;
  await woundAndResume(page, woundedId);
  const resumed = await savedMission(page);
  const wounded = resumed!.units.find((u) => u.id === woundedId);
  expect(wounded?.hp).toBe(woundedHp);

  // A medic squad, placed two or three tiles from the wound through the
  // debug menu's spawn tool: within a throw of it and clear of the force.
  await page.getByTestId("debug-menu-toggle").click();
  await expect(page.getByTestId("debug-menu")).toBeVisible();
  await page.getByTestId("debug-tool-spawn").click();
  await page.getByTestId("debug-place-squad-medic").click();
  await expect(page.getByTestId("debug-place-squad-medic")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const site = await clickableTile(
    page,
    clearTilesAround(resumed!, wounded!.pos, 2, 3),
  );
  expect(site, "a clear tile near the wounded squad").toBeTruthy();
  const unitsBefore = resumed!.units.length;
  await drawnFrame(page);
  await page.mouse.click(site!.at.x, site!.at.y);
  await expect
    .poll(async () => (await savedMission(page))?.units.length)
    .toBe(unitsBefore + 1);
  const medic = await unitAt(page, site!.tile);
  expect(medic).toMatchObject({ kind: "squad", team: "tdf" });
  const medicId = medic!.id;
  await page.keyboard.press("Escape");
  await page
    .getByTestId("debug-menu")
    .locator('[data-action="debug-menu-close"]')
    .click();
  await expect(page.getByTestId("debug-menu")).toBeHidden();

  // The empty tile beside the wound: the kit's radius-2 area covers the
  // squad from there, and a click on the squad's own tile would pick
  // the squad. Tried in order until one the medic can see offers Heal.
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          (globalThis as HookGlobal).__tutTactical__?.unitScreenPosition(id) !==
          undefined,
        medicId,
      ),
    )
    .toBe(true);
  await page.evaluate(
    (id) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(id),
    medicId,
  );
  const placed = await savedMission(page);
  let healId = "";
  for (const tile of clearTilesAround(placed!, wounded!.pos, 1, 1)) {
    await page.evaluate(
      (t) => (globalThis as HookGlobal).__tutTactical__?.selectTile(t),
      tile,
    );
    await expect(wheel(page)).toHaveAttribute("data-open", "true");
    const id = `equipment:medkit:${keyOf(tile)}`;
    const entry = wheelItem(page, id);
    if ((await entry.count()) === 1 && !(await entry.isDisabled())) {
      healId = id;
      break;
    }
    await page.keyboard.press("Escape");
    await expect(wheel(page)).toBeHidden();
  }
  expect(healId, "a tile beside the wound that offers Heal").not.toBe("");

  // On the ring itself, not under Attack, with what it gives and to
  // whom, and the uses left; resting on it paints the kit's area.
  const heal = wheelItem(page, healId);
  await expect(heal).toContainText("Heal");
  await expect(heal).toContainText(`+${String(MEDKIT_HEAL)} hp`);
  await expect(heal).toContainText("4/4");
  await heal.hover();
  await expect(body).toHaveAttribute(
    "data-tactical-blast-tiles",
    /^([2-9]|1\d)$/,
  );
  await drawnFrame(page);
  if (process.env.CAPTURE !== undefined) {
    await page.locator("#tactical-viewport").screenshot({
      path: "docs/design/ui-medkit-heal-wheel.png",
    });
  }

  // Choosing it heals: the wheel closes, the squad is up by the heal,
  // the medic has spent a use, and the log says who was mended.
  await heal.click();
  await expect(wheel(page)).toBeHidden();
  await expect
    .poll(
      async () =>
        (await savedMission(page))?.units.find((u) => u.id === woundedId)?.hp,
    )
    .toBe(woundedHp + MEDKIT_HEAL);
  const after = await savedMission(page);
  expect(after!.units.find((u) => u.id === medicId)?.equipment?.medkit).toBe(3);
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.querySelectorAll('[data-role="event-log-list"] li')]
          .map((row) => row.textContent ?? "")
          .some((text) => /healed .* for 10/.test(text)),
      ),
    )
    .toBe(true);
  await drawnFrame(page);
  if (process.env.CAPTURE !== undefined) {
    await page.locator("#tactical-viewport").screenshot({
      path: "docs/design/ui-medkit-heal-after.png",
    });
  }
  expect(errors).toEqual([]);
});
