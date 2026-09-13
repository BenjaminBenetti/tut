import { expect, test } from "@playwright/test";

import { FixtureMapBuilder } from "../src/mapgen/service/fixture-map-builder";
import type { GameState } from "../src/save/model/game-state";
import type { Radar } from "../src/tactical/model/radar";
import { initialVision } from "../src/tactical/service/vision-service";
import { drawnFrame, tacticalModelsReady } from "./capture-frame.helper";
import { launchMission, settleForShot } from "./mission-capture.helper";

/** The autosave the mission is rewritten through. */
const SAVE_KEY = "tut:save:autosave";

/** A scanner with a full battery and one whose battery is dead (#1130). */
const RADARS: readonly Radar[] = [
  {
    id: "radar-live",
    team: "tdf",
    pos: { x: 8, y: 0, z: 10 },
    range: 30,
    turnsLeft: 3,
  },
  {
    id: "radar-dead",
    team: "tdf",
    pos: { x: 11, y: 0, z: 10 },
    range: 30,
    turnsLeft: 0,
  },
];

/**
 * A burnt-out radar reads as burnt out (#1130, item 2): the dead
 * scanner smokes and its dish stands still, beside a live one whose
 * dish is turning. The battery is what the save says, so the board is
 * rewritten with one of each rather than played for three turns.
 *
 *   CAPTURE=1 pnpm exec playwright test e2e/radar-burnout-screenshot.spec.ts
 */
test("a burnt-out scanner smokes beside a live one", async ({ page }) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the radar burnout screenshot",
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
    radars: [...RADARS],
    effects: [],
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
    "data-tactical-radars",
    "2",
  );
  await settleForShot(page);
  // Mid-way through the smoke's loop, so the puffs are up and visible.
  await page.waitForTimeout(1200);
  await drawnFrame(page);
  await page.locator("#tactical-viewport").screenshot({
    path: "docs/design/radar-burnout.png",
  });
  expect(errors).toEqual([]);
});
