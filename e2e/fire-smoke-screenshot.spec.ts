import { expect, test } from "@playwright/test";

import { FixtureMapBuilder } from "../src/mapgen/service/fixture-map-builder";
import type { GameState } from "../src/save/model/game-state";
import type { TileEffect } from "../src/tactical/model/tile-effect";
import { initialVision } from "../src/tactical/service/vision-service";
import { drawnFrame, tacticalModelsReady } from "./capture-frame.helper";
import { launchMission, settleForShot } from "./mission-capture.helper";

/** The autosave the mission is rewritten through. */
const SAVE_KEY = "tut:save:autosave";

/** Three fires in a row beside the force, fresh, a turn old and nearly out. */
const FIRES: readonly TileEffect[] = [
  { id: "effect-1", kind: "fire", tile: { x: 8, y: 0, z: 10 }, phasesLeft: 4 },
  { id: "effect-2", kind: "fire", tile: { x: 9, y: 0, z: 10 }, phasesLeft: 2 },
  { id: "effect-3", kind: "fire", tile: { x: 11, y: 0, z: 11 }, phasesLeft: 1 },
];

/**
 * A burning tile smokes (#1132, item 7): the plume a burnt-out radar
 * wears rises off every fire too. The board is rewritten with three
 * fires beside the force rather than played for them, and the frame is
 * shot mid-loop so the puffs are up.
 *
 *   CAPTURE=1 pnpm exec playwright test e2e/fire-smoke-screenshot.spec.ts
 */
test("burning tiles smoke", async ({ page }) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the fire smoke screenshot",
  );
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await launchMission(page, "4242");
  await tacticalModelsReady(page);

  const envelope = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!) as { state: GameState },
    SAVE_KEY,
  );
  const mission = envelope.state.activeMission!;
  const force = mission.units.filter(
    (unit) => unit.team === "tdf" && unit.hp > 0,
  );
  const { vision: _stale, ...blind } = {
    ...mission,
    map: new FixtureMapBuilder(32, 24, 1).fillGround().build(),
    units: force.map((unit, index) => ({
      ...unit,
      pos: { x: 6 + index * 2, y: 0, z: 7 },
      facing: "s" as const,
    })),
    spawners: [],
    objectives: [],
    extraction: [],
    radars: [],
    effects: [...FIRES],
  };
  const rewritten: GameState = {
    ...envelope.state,
    activeMission: { ...blind, vision: initialVision(blind) },
  };
  await page.evaluate(
    ({ key, saved }) => {
      localStorage.setItem(key, JSON.stringify(saved));
    },
    { key: SAVE_KEY, saved: { ...envelope, state: rewritten } },
  );

  await page.reload();
  await page.locator('[data-action="continue"]').click();
  await tacticalModelsReady(page);
  await expect(page.locator("body")).toHaveAttribute(
    "data-tactical-effects",
    String(FIRES.length),
  );
  await settleForShot(page);
  // Mid-way through the plume's loop, so the puffs are up and visible.
  await page.waitForTimeout(1400);
  await drawnFrame(page);
  await page.locator("#tactical-viewport").screenshot({
    path: "docs/design/fire-smoke.png",
  });
  expect(errors).toEqual([]);
});
