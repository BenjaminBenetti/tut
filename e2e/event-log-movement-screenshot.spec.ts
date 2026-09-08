/// <reference types="node" />
import { readFileSync, rmSync } from "node:fs";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";
import { drawnFrame, tacticalModelsReady } from "./capture-frame.helper";
import { launchMission, settleForShot } from "./mission-capture.helper";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** A tile in the mission's map. */
interface Tile {
  x: number;
  y: number;
  z: number;
}

/** The autosave the mission is read through. */
const SAVE_KEY = "tut:save:autosave";

/** Where the frames go. */
const FRAMES = "docs/design/event-log-movement";

/**
 * Tiles a unit can reach this turn, nearest first.
 *
 * Read from the map rather than guessed: a move the rules refuse
 * produces no event at all, and a capture of an empty log would look
 * exactly like a capture of a log that correctly dropped its moves.
 *
 * @param page - The page holding the live mission.
 * @param unitId - The unit to move.
 * @returns Candidate destination tiles.
 */
async function reachable(page: Page, unitId: string): Promise<Tile[]> {
  return page.evaluate(
    ({ key, id }) => {
      const raw = localStorage.getItem(key);
      const save = JSON.parse(raw ?? "{}") as {
        state: {
          activeMission?: {
            units: { id: string; pos: Tile }[];
            map: { tiles: Tile[] };
          };
        };
      };
      const mission = save.state.activeMission;
      const unit = mission?.units.find((u) => u.id === id);
      if (!mission || !unit) {
        return [];
      }
      const taken = new Set(
        mission.units.map((u) => `${u.pos.x},${u.pos.y},${u.pos.z}`),
      );
      return mission.map.tiles
        .filter(
          (t) =>
            t.y === unit.pos.y &&
            !taken.has(`${t.x},${t.y},${t.z}`) &&
            Math.abs(t.x - unit.pos.x) + Math.abs(t.z - unit.pos.z) <= 4,
        )
        .sort(
          (a, b) =>
            Math.abs(a.x - unit.pos.x) +
            Math.abs(a.z - unit.pos.z) -
            (Math.abs(b.x - unit.pos.x) + Math.abs(b.z - unit.pos.z)),
        )
        .slice(0, 12);
    },
    { key: SAVE_KEY, id: unitId },
  );
}

/** How many rows the event log is showing. */
async function logRows(page: Page): Promise<string[]> {
  return page.locator('[data-role="event-log-list"] li').allTextContents();
}

/**
 * Moves `unitId` once, and reports whether the mission state actually
 * changed — an invoke the rules refuse is silent, and a capture built on
 * one would be a picture of nothing happening.
 */
async function moveOnce(page: Page, unitId: string): Promise<boolean> {
  const before = await page.evaluate(
    ({ key, id }) => {
      const raw = localStorage.getItem(key);
      const save = JSON.parse(raw ?? "{}") as {
        state: { activeMission?: { units: { id: string; pos: Tile }[] } };
      };
      const unit = save.state.activeMission?.units.find((u) => u.id === id);
      return unit ? `${unit.pos.x},${unit.pos.z}` : "";
    },
    { key: SAVE_KEY, id: unitId },
  );
  await page.evaluate(
    (id) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(id),
    unitId,
  );
  for (const tile of await reachable(page, unitId)) {
    await page.evaluate(
      (t) => (globalThis as HookGlobal).__tutTactical__?.invokeTile(t),
      tile,
    );
    await page.waitForTimeout(250);
    const now = await page.evaluate(
      ({ key, id }) => {
        const raw = localStorage.getItem(key);
        const save = JSON.parse(raw ?? "{}") as {
          state: { activeMission?: { units: { id: string; pos: Tile }[] } };
        };
        const unit = save.state.activeMission?.units.find((u) => u.id === id);
        return unit ? `${unit.pos.x},${unit.pos.z}` : "";
      },
      { key: SAVE_KEY, id: unitId },
    );
    if (now !== before) {
      return true;
    }
  }
  return false;
}

/**
 * The #1028 frame: a turn containing several moves and one non-move
 * action, with the event log showing only the latter.
 *
 * The event log is DOM rather than a WebGL canvas, so it has no camera
 * to drift and reproduces across runs — asserted here rather than
 * assumed, since #996 taught the studio not to take that for granted.
 *
 *   CAPTURE=1 pnpm exec playwright test e2e/event-log-movement-screenshot.spec.ts
 */
test("captures the event log across a turn of moves and one other action", async ({
  page,
}) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the event log frames",
  );
  await launchMission(page, "4242");
  await tacticalModelsReady(page);
  await settleForShot(page);

  // Several moves, by different units, all of which really happened.
  let moved = 0;
  // unit-3 is deliberately left alone: overwatch costs AP, and a unit
  // that has spent both on movement cannot take the non-move action the
  // frame is supposed to contain.
  for (const unitId of ["unit-1", "unit-2", "unit-1", "unit-2"]) {
    if (await moveOnce(page, unitId)) {
      moved++;
    }
  }
  expect(
    moved,
    "the capture needs real movement to have happened",
  ).toBeGreaterThanOrEqual(3);

  // One action that is not movement: overwatch needs no target, so it
  // cannot fail for a reason that has nothing to do with this ticket.
  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-3"),
  );
  await page.keyboard.press("3");
  await expect
    .poll(async () => (await logRows(page)).join(" | "), { timeout: 5000 })
    .toContain("overwatch");
  await drawnFrame(page);

  const rows = await logRows(page);
  // LOG_FRAME=before captures the same turn against the old rule, so the
  // pair differs only in whether movement speaks.
  const before = process.env.LOG_FRAME === "before";
  if (!before) {
    expect(rows.join(" | "), "the log must not mention movement").not.toContain(
      "moved",
    );
  }
  const path = `${FRAMES}-${before ? "before" : "after"}.png`;
  await page.locator("#event-log").screenshot({ path });

  // The log is DOM and must reproduce before either frame is evidence.
  const again = `${FRAMES}-reproducibility-check.png`;
  await page.locator("#event-log").screenshot({ path: again });
  const stable = readFileSync(path).equals(readFileSync(again));
  rmSync(again, { force: true });
  expect(stable, "the event log must render identically twice").toBe(true);
});
