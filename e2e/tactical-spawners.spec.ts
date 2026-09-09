import type { Page } from "@playwright/test";

import type { TacticalMap } from "../src/mapgen/model/tactical-map";
import { PassMask } from "../src/mapgen/model/pass-mask";
import {
  nearestSightPosition,
  pathBetween,
} from "../src/tactical/service/map-assessment-service";
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
  // Scouting is not a promise that a lone rifle squad survives a wave (#911).
  // Use the available starting force; keep the campaign seed and real scout walk.
  for (const option of await page
    .locator(
      '#deploy-mechs input[type="checkbox"]:enabled, #deploy-squads input[type="checkbox"]:enabled',
    )
    .all())
    await option.check();
  await page.locator('[data-action="launch"]').click();
  await expect(body).toHaveAttribute("data-screen", "tactical");
  await expect(page.locator("#tactical-viewport canvas")).toBeVisible();

  // Since #551 the scene draws the player's view, so a spawner nobody has
  // scouted is not on the map at all. That is the point: the objective
  // tracker names it, the map does not give away where it is.
  const objectives = page.locator('[data-role="objective-list"] li');
  expect(await objectives.count()).toBeGreaterThan(0);
  await expect(body).toHaveAttribute("data-tactical-spawners", "0");

  // Scout until one is found: walk the leading unit at the nearest spawner a
  // few tiles a turn. This is the spotting step ADR 0006 §3 asks every
  // spec that used to look straight at the map to gain.
  const sighting = await scoutToASpawner(page);
  expect(sighting, "no spawner found while scouting").toBeTruthy();
  if (!sighting) throw new Error("No scouted spawner");
  const { spawnerId, unitId } = sighting;
  await expect(body).not.toHaveAttribute("data-tactical-spawners", "0");

  // It has a place on screen, which is what makes it clickable at all.
  const at = await page.evaluate(
    (id: string) =>
      (globalThis as HookGlobal).__tutTactical__?.spawnerScreenPosition(id),
    spawnerId ?? "",
  );
  expect(at).toBeTruthy();

  // Scouting spent the scout's action points, and Attack is disabled for
  // a unit that cannot act. End the turn so the side refreshes before
  // the targeting half of this spec — otherwise whether the button is
  // clickable depends on how many moves the walk happened to take.
  await page.locator('#action-bar [data-action="end-turn"]').click();
  await expect(
    page.locator('#turn-banner [data-field="phase"]'),
  ).toHaveAttribute("data-phase", "player");
  await expect(
    page.locator('#action-bar [data-action="attack"]').first(),
  ).toBeEnabled();

  // Selecting the scout, arming attack and clicking the spawner targets it.
  await page.evaluate(
    (id: string) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(id),
    unitId,
  );
  await expect(body).toHaveAttribute("data-selected-unit", unitId);
  await page.locator('#action-bar [data-action="attack"]').first().click();
  // Use real view controls to expose and frame the scouted interior before
  // testing the picker. The old direct selection hook also accepted offscreen
  // coordinates; a real mouse click must hit the visible spawner mesh.
  const layerDown = page.locator('[data-action="layer-down"]');
  while (await layerDown.isEnabled()) await layerDown.click();
  const canvas = page.locator("#tactical-viewport canvas");
  await canvas.hover();
  await page.mouse.wheel(0, 360);
  const bounds = await canvas.boundingBox();
  expect(bounds).toBeTruthy();
  let point: { x: number; y: number } | undefined;
  await expect
    .poll(async () => {
      point = await page.evaluate(
        (id: string) =>
          (globalThis as HookGlobal).__tutTactical__?.spawnerScreenPosition(id),
        spawnerId,
      );
      return (
        point !== undefined &&
        bounds !== null &&
        point.x > bounds.x + 20 &&
        point.x < bounds.x + bounds.width - 20 &&
        point.y > bounds.y + 20 &&
        point.y < bounds.y + bounds.height - 20
      );
    })
    .toBe(true);
  await expect(body).not.toHaveAttribute("data-selected-spawner", spawnerId);
  await page.mouse.click(point!.x, point!.y);
  await expect(body).toHaveAttribute("data-selected-spawner", spawnerId ?? "");
  // The scout keeps the card; a spawner is aimed at, never selected.
  await expect(body).toHaveAttribute("data-selected-unit", unitId);

  expect(errors).toEqual([]);
});

// ===========================================
// Scouting (#551)
// ===========================================

/** The mission as the autosave holds it. */
interface SavedMission {
  map: TacticalMap;
  units: {
    id: string;
    team: string;
    hp: number;
    passClass: "infantry" | "mech";
    templateId: string;
    /** Action points left, so the walk knows when to end the turn. */
    ap: number;
    pos: { x: number; y: number; z: number };
  }[];
  templates: Record<string, { sightRange: number }>;
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
 * Walks a living unit toward the nearest spawner until one is drawn, and
 * returns that scout and a spawner the objectives track — or undefined if
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
async function scoutToASpawner(
  page: Page,
): Promise<{ spawnerId: string; unitId: string } | undefined> {
  const body = page.locator("body");
  for (let turn = 0; turn < 14; turn++) {
    const mission = await savedMission(page);
    const unit = mission?.units.find((u) => u.team === "tdf" && u.hp > 0);
    const spawner = nearestSpawner(mission, unit);
    if (!mission || !unit || !spawner) return undefined;

    // Walk to where the squad can see it, not to it: since ADR 0009 (#829)
    // a spawner may sit deep inside a building, and the wall beside it
    // shows nothing. The game says which reachable tile has the sight line.
    const vantage =
      nearestSightPosition(
        mission.map,
        unit.pos,
        spawner.pos,
        unit.passClass === "mech" ? PassMask.MECH : PassMask.INFANTRY,
        mission.templates[unit.templateId].sightRange,
      ) ?? spawner.pos;
    const moved = await stepToward(page, unit, vantage, mission.map);
    const found = await drawnSpawnerId(page);
    if (found !== undefined) return { spawnerId: found, unitId: unit.id };
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
  map: TacticalMap,
): Promise<boolean> {
  // Follow the walk the game says exists, a few tiles at a time: the
  // vantage may be a storey up a ramp the offsets below would never find.
  const path = pathBetween(
    map,
    unit.pos,
    target,
    unit.passClass === "mech" ? PassMask.MECH : PassMask.INFANTRY,
  );
  if (path !== undefined && path.length > 0) {
    for (const hop of [6, 5, 4, 3, 2, 1]) {
      const tile = path[Math.min(hop, path.length) - 1];
      if (tile === undefined) continue;
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
  }
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
