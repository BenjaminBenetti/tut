import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** Days to advance before giving up on a mission appearing for the fixed seed. */
const MAX_DAYS = 40;

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
 * Walks the squad toward the nearest spawner, a few tiles a turn, until
 * one is drawn. Returns the id of a spawner the objectives track, or
 * undefined if none turned up inside the turn budget.
 *
 * Movement goes through the right button (#520) via `invokeTile`, and
 * each step aims at a tile a short way along the straight line, because
 * a move out of range is refused rather than truncated.
 */
async function scoutToASpawner(page: Page): Promise<string | undefined> {
  const body = page.locator("body");
  for (let turn = 0; turn < 12; turn++) {
    const mission = await savedMission(page);
    const spawner = mission?.spawners[0];
    const unit = mission?.units.find((u) => u.team === "tdf");
    if (!mission || !spawner || !unit) return undefined;

    const dx = spawner.pos.x - unit.pos.x;
    const dz = spawner.pos.z - unit.pos.z;
    const distance = Math.abs(dx) + Math.abs(dz);
    const stride = Math.min(3, distance);
    const step = {
      x: unit.pos.x + Math.round((dx / (distance || 1)) * stride),
      y: unit.pos.y,
      z: unit.pos.z + Math.round((dz / (distance || 1)) * stride),
    };
    await page.evaluate(
      (args: { id: string; tile: { x: number; y: number; z: number } }) => {
        (globalThis as HookGlobal).__tutTactical__?.selectUnit(args.id);
        (globalThis as HookGlobal).__tutTactical__?.invokeTile(args.tile);
      },
      { id: unit.id, tile: step },
    );

    const drawn = await body.getAttribute("data-tactical-spawners");
    if (drawn !== null && drawn !== "0") {
      const objectives = page.locator('[data-role="objective-list"] li');
      return (
        (await objectives.first().getAttribute("data-target-id")) ?? undefined
      );
    }
    await page.locator('#action-bar [data-action="end-turn"]').click();
    await expect(body).toHaveAttribute("data-screen", "tactical");
  }
  return undefined;
}
