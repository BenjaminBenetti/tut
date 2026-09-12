import { expect, test } from "@playwright/test";

import { wheel, wheelItem } from "./action-wheel.helper";
import { drawnFrame } from "./capture-frame.helper";
import { launchMission, settleForShot } from "./mission-capture.helper";
import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";

interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

interface Tile {
  x: number;
  y: number;
  z: number;
}

/** The starter mech: an autocannon on the arm, a missile pod on the back. */
const MECH = "unit-1";

/** The weapon slot that can fire at the ground: the missile pod bursts (#1121). */
const POD = "back-weapon";

/**
 * A weapon that marks the ground can be fired at a tile (#1121), from
 * the wheel, in a real mission: the entry is offered with its numbers,
 * the footprint is painted while it is considered, and choosing it
 * spends the shot whether or not the shell lands.
 *
 * The unit tests cover the wheel, the rules and the overlay each on
 * their own; this walks the wiring between them, which is where #627
 * and #1117 lived.
 */
test("the starter mech fires its missile pod at an empty tile from the wheel", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await launchMission(page, "4242");
  await settleForShot(page);

  const mech = await page.evaluate((unitId) => {
    const raw = localStorage.getItem("tut:save:autosave");
    if (raw === null) return null;
    const envelope = JSON.parse(raw) as {
      state: {
        activeMission?: {
          units: { id: string; pos: Tile; ap: number }[];
          map: { tiles: Tile[] };
        };
      };
    };
    const m = envelope.state.activeMission;
    const unit = m?.units.find((u) => u.id === unitId);
    if (!m || !unit) return null;
    const taken = new Set(
      m.units.map((u) => `${u.pos.x},${u.pos.y},${u.pos.z}`),
    );
    const exists = new Set(m.map.tiles.map((t) => `${t.x},${t.y},${t.z}`));
    // Ground tiles two steps out on the mech's own level, nobody on them:
    // inside the pod's range and, on flat ground, in sight.
    const candidates: Tile[] = [];
    const offsets: readonly [number, number][] = [
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ];
    for (const [dx, dz] of offsets) {
      const tile = { x: unit.pos.x + dx, y: unit.pos.y, z: unit.pos.z + dz };
      const key = `${tile.x},${tile.y},${tile.z}`;
      if (exists.has(key) && !taken.has(key)) candidates.push(tile);
    }
    return { pos: unit.pos, ap: unit.ap, candidates };
  }, MECH);
  expect(mech).not.toBeNull();
  if (!mech) return;
  expect(mech.candidates.length).toBeGreaterThan(0);

  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          (globalThis as HookGlobal).__tutTactical__?.unitScreenPosition(id) !==
          undefined,
        MECH,
      ),
    )
    .toBe(true);
  await page.evaluate(
    (id) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(id),
    MECH,
  );

  // The first candidate whose wheel offers the pod, open: the map is
  // generated, so a tile two steps out may be behind a wall.
  let chosen: Tile | undefined;
  let entryId = "";
  for (const tile of mech.candidates) {
    await page.evaluate(
      (t) => (globalThis as HookGlobal).__tutTactical__?.selectTile(t),
      tile,
    );
    await expect(wheel(page)).toHaveAttribute("data-open", "true");
    const id = `attack-tile:${String(tile.x)},${String(tile.y)},${String(tile.z)}:${POD}`;
    const entry = wheelItem(page, id);
    if ((await entry.count()) === 1 && !(await entry.isDisabled())) {
      chosen = tile;
      entryId = id;
      break;
    }
    await page.keyboard.press("Escape");
    await expect(wheel(page)).toBeHidden();
  }
  expect(chosen, "no tile beside the mech takes a missile").toBeDefined();
  if (!chosen) return;

  // The entry carries the numbers, and the footprint is on the ground
  // while it is considered: a radius-1 burst reaches up to five tiles.
  const entry = wheelItem(page, entryId);
  await expect(entry).toContainText("%");
  await expect(entry).toContainText("dmg");
  await expect(entry).toContainText("Missile Pod");
  await expect(page.locator("body")).toHaveAttribute(
    "data-tactical-blast-tiles",
    /^[1-5]$/,
  );
  await drawnFrame(page);
  if (process.env.CAPTURE !== undefined) {
    await page.locator("#tactical-viewport").screenshot({
      path: "docs/design/ui-tile-attack-wheel.png",
    });
  }

  // Choosing it fires: the wheel closes, the footprint is gone, the log
  // says where the shell went, and the mech's turn is spent — a miss
  // costs the shot too, which is the rule.
  await entry.click();
  await expect(wheel(page)).toBeHidden();
  await expect(page.locator("body")).not.toHaveAttribute(
    "data-tactical-blast-tiles",
    /.+/,
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.querySelectorAll('[data-role="event-log-list"] li')]
          .map((row) => row.textContent ?? "")
          .some((text) =>
            /fired at the ground|hit the ground|blast caught/.test(text),
          ),
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate((unitId) => {
        const raw = localStorage.getItem("tut:save:autosave");
        if (raw === null) return null;
        const envelope = JSON.parse(raw) as {
          state: { activeMission?: { units: { id: string; ap: number }[] } };
        };
        return (
          envelope.state.activeMission?.units.find((u) => u.id === unitId)
            ?.ap ?? null
        );
      }, MECH),
    )
    .toBe(0);
  await drawnFrame(page);
  if (process.env.CAPTURE !== undefined) {
    await page.locator("#tactical-viewport").screenshot({
      path: "docs/design/ui-tile-attack-after.png",
    });
  }
});
