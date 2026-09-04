import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** Days to advance before giving up on a mission appearing for the fixed seed. */
const MAX_DAYS = 40;

/** How long to let the autosave catch up before calling a move refused. */
const MOVE_SETTLE_MS = 400;

/**
 * #484: an egg spawner is a mission's primary objective, so it has to be
 * visible on the map and clickable. Before this it had no mesh at all —
 * the objective tracker listed it and the map showed nothing.
 */
test("egg spawners are drawn on the tactical map and can be targeted by clicking one", async ({
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
  await page.locator('#deploy-squads input[type="checkbox"]').first().check();
  await page.locator('[data-action="launch"]').click();
  await expect(body).toHaveAttribute("data-screen", "tactical");
  await expect(page.locator("#tactical-viewport canvas")).toBeVisible();

  // Since #551 the scene draws the player's view, so a spawner nobody has
  // scouted is not on the map at all. That is the point: the objective
  // tracker names it, the map does not give away where it is.
  const objectives = page.locator('[data-role="objective-list"] li');
  expect(await objectives.count()).toBeGreaterThan(0);
  await expect(body).toHaveAttribute("data-tactical-spawners", "0");

  // Scout until one is found: walk the squad at the nearest spawner a
  // few tiles a turn. This is the spotting step ADR 0006 §3 asks every
  // spec that used to look straight at the map to gain.
  const spawnerId = await scoutToASpawner(page);
  expect(spawnerId, "no spawner found while scouting").toBeTruthy();
  await expect(body).not.toHaveAttribute("data-tactical-spawners", "0");

  // It has a place on screen, which is what makes it clickable at all.
  const at = await page.evaluate(
    (id: string) =>
      (globalThis as HookGlobal).__tutTactical__?.spawnerScreenPosition(id),
    spawnerId ?? "",
  );
  expect(at).toBeTruthy();

  // Scouting spent the squad's action points, and Attack is disabled for
  // a unit that cannot act. End the turn so the side refreshes before
  // the targeting half of this spec — otherwise whether the button is
  // clickable depends on how many moves the walk happened to take.
  await page.locator('#action-bar [data-action="end-turn"]').click();
  await expect(
    page.locator('#turn-banner [data-field="phase"]'),
  ).toHaveAttribute("data-phase", "player");
  await expect(
    page.locator('#action-bar [data-action="attack"]'),
  ).toBeEnabled();

  // Selecting a squad, arming attack and clicking the spawner targets it.
  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-1"),
  );
  await expect(body).toHaveAttribute("data-selected-unit", "unit-1");
  await page.locator('#action-bar [data-action="attack"]').click();
  await page.evaluate(
    (id: string) =>
      (globalThis as HookGlobal).__tutTactical__?.selectSpawner(id),
    spawnerId ?? "",
  );
  await expect(body).toHaveAttribute("data-selected-spawner", spawnerId ?? "");
  // The squad keeps the card; a spawner is aimed at, never selected.
  await expect(body).toHaveAttribute("data-selected-unit", "unit-1");

  expect(errors).toEqual([]);
});

// ===========================================
// Scouting (#551)
// ===========================================

/** The mission as the autosave holds it. */
interface SavedMission {
  units: {
    id: string;
    team: string;
    /** Action points left, so the walk knows when to end the turn. */
    ap: number;
    pos: { x: number; y: number; z: number };
  }[];
  spawners: { id: string; pos: { x: number; y: number; z: number } }[];
}

/** Reads the live mission out of the autosave. */
async function savedMission(page: Page): Promise<SavedMission | null> {
  return page.evaluate(() => {
    const raw = localStorage.getItem("tut:save:autosave");
    if (raw === null) return null;
    const envelope = JSON.parse(raw) as {
      state: { activeMission?: SavedMission };
    };
    return envelope.state.activeMission ?? null;
  });
}

/**
 * Walks the squad toward the nearest spawner until one is drawn, and
 * returns the id of a spawner the objectives track — or undefined if
 * none turned up.
 *
 * It routes rather than aims. A straight line at the target stalls the
 * moment a building or a prop is in the way: the move is correctly
 * refused, the unit stays put, and every later turn recomputes the same
 * impossible target from the same tile. So each turn tries candidate
 * tiles in order of how much they close the gap and keeps the first one
 * that actually moves the unit, which lets it walk around what is in the
 * way instead of into it.
 */
async function scoutToASpawner(page: Page): Promise<string | undefined> {
  const body = page.locator("body");
  for (let turn = 0; turn < 14; turn++) {
    const mission = await savedMission(page);
    const unit = mission?.units.find((u) => u.team === "tdf");
    const spawner = nearestSpawner(mission, unit);
    if (!mission || !unit || !spawner) return undefined;

    const moved = await stepToward(page, unit, spawner.pos);
    const found = await drawnSpawnerId(page);
    if (found !== undefined) return found;
    if (!moved) {
      // Boxed in for this turn's action points; a fresh turn reopens the
      // budget, and a failure to move at all is caught by the cap.
      await endTurn(page, body);
      continue;
    }
    if (await outOfActions(page, unit.id)) {
      await endTurn(page, body);
    }
  }
  return undefined;
}

/** The spawner closest to the unit, so the walk is the short one. */
function nearestSpawner(
  mission: SavedMission | null,
  unit: SavedMission["units"][number] | undefined,
) {
  if (!mission || !unit) return undefined;
  return [...mission.spawners].sort(
    (a, b) => manhattan(a.pos, unit.pos) - manhattan(b.pos, unit.pos),
  )[0];
}

/** Ground-plane distance, which is what the move budget is spent on. */
function manhattan(
  a: { x: number; z: number },
  b: { x: number; z: number },
): number {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

/**
 * Tries reachable tiles in order of how much closer they get, and keeps
 * the first that actually moves the unit. Returns whether it moved.
 */
async function stepToward(
  page: Page,
  unit: SavedMission["units"][number],
  target: { x: number; y: number; z: number },
): Promise<boolean> {
  const offsets: { x: number; z: number }[] = [];
  for (const radius of [3, 2, 1]) {
    for (const [dx, dz] of [
      [radius, 0],
      [-radius, 0],
      [0, radius],
      [0, -radius],
      [radius, radius],
      [radius, -radius],
      [-radius, radius],
      [-radius, -radius],
    ] as const) {
      offsets.push({ x: dx, z: dz });
    }
  }
  const candidates = offsets
    .map((o) => ({ x: unit.pos.x + o.x, y: unit.pos.y, z: unit.pos.z + o.z }))
    .sort((a, b) => manhattan(a, target) - manhattan(b, target));

  for (const tile of candidates.slice(0, 10)) {
    await page.evaluate(
      (args: { id: string; tile: { x: number; y: number; z: number } }) => {
        (globalThis as HookGlobal).__tutTactical__?.selectUnit(args.id);
        (globalThis as HookGlobal).__tutTactical__?.invokeTile(args.tile);
      },
      { id: unit.id, tile },
    );
    if (await movedFrom(page, unit.id, unit.pos)) {
      return true;
    }
  }
  return false;
}

/**
 * Whether the unit left `from`, waiting briefly for the autosave to
 * catch up. The store updates synchronously but the save is written
 * after, and under a full parallel suite that gap is wide enough to read
 * the old position and conclude a legal move was refused.
 */
async function movedFrom(
  page: Page,
  unitId: string,
  from: { x: number; y: number; z: number },
): Promise<boolean> {
  const deadline = Date.now() + MOVE_SETTLE_MS;
  do {
    const mission = await savedMission(page);
    const unit = mission?.units.find((u) => u.id === unitId);
    if (unit && manhattan(unit.pos, from) > 0) {
      return true;
    }
    await page.waitForTimeout(25);
  } while (Date.now() < deadline);
  return false;
}

/** A spawner the objectives track, once one is actually drawn. */
async function drawnSpawnerId(page: Page): Promise<string | undefined> {
  const drawn = await page
    .locator("body")
    .getAttribute("data-tactical-spawners");
  if (drawn === null || drawn === "0") {
    return undefined;
  }
  const objectives = page.locator('[data-role="objective-list"] li');
  return (await objectives.first().getAttribute("data-target-id")) ?? undefined;
}

/** Whether the unit has spent its action points. */
async function outOfActions(page: Page, unitId: string): Promise<boolean> {
  const mission = await savedMission(page);
  const unit = mission?.units.find((u) => u.id === unitId);
  return (unit?.ap ?? 0) <= 0;
}

/** Ends the turn and waits for the tactical screen to settle. */
async function endTurn(page: Page, body: ReturnType<Page["locator"]>) {
  await page.locator('#action-bar [data-action="end-turn"]').click();
  await expect(body).toHaveAttribute("data-screen", "tactical");
}
