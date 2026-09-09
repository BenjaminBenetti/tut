import { expect, test, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";

import { ASSET_WARNING_PREFIX } from "../src/graphics/model/asset-logger";
import type { TileCoord } from "../src/mapgen/model/tile-coord";
import { TileIndex } from "../src/mapgen/service/tile-index";
import type { GameState } from "../src/save/model/game-state";
import type { SaveEnvelope } from "../src/save/model/save-envelope";
import {
  buildMoveGraph,
  pathTo,
} from "../src/tactical/service/movement-service";
import { initialVision } from "../src/tactical/service/vision-service";
import { drawnFrame, tacticalModelsReady } from "./capture-frame.helper";
import { launchMission } from "./mission-capture.helper";

const SAVE_KEY = "tut:save:autosave";
const ENTRY = { x: 9, y: 2, z: 29 };
const CAPTURE = process.env.CAPTURE !== undefined;
if (process.env.REPRO_BASE_URL)
  test.use({ baseURL: process.env.REPRO_BASE_URL });
if (CAPTURE)
  test.use({ video: { mode: "on", size: { width: 1280, height: 720 } } });
test.use({ viewport: { width: 1280, height: 720 } });

/** Reads actual persisted mission state, not just the last input intent. */
async function saveIn(page: Page): Promise<SaveEnvelope<GameState>> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!) as SaveEnvelope<GameState>,
    SAVE_KEY,
  );
}

/** Real right clicks cross a doorway and continue inside, with and without a floor cut. */
test("highlighted interior tiles move the squad through the doorway", async ({
  page,
}) => {
  // A normal campaign mount followed by the positioned mission fixture.
  test.setTimeout(test.info().timeout * 2);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" ||
      message.text().startsWith(ASSET_WARNING_PREFIX)
    ) {
      errors.push(message.text());
    }
  });
  await launchMission(page, "4242");
  await tacticalModelsReady(page);
  const save = await saveIn(page);
  const original = save.state.activeMission!;
  expect(
    original.map.buildings.find((b) => b.id === "building-3")?.entrances[0],
  ).toEqual({
    tile: ENTRY,
    side: "e",
  });
  const positions: Record<string, TileCoord> = {
    // Keep the unrelated mech out of the doorway ray; units still win picks.
    "unit-1": { x: 12, y: 2, z: 25 },
    "unit-2": { x: 10, y: 2, z: 29 },
    "unit-3": { x: 10, y: 2, z: 28 },
  };
  const positioned = {
    ...original,
    units: original.units.map((u) => ({ ...u, pos: positions[u.id] ?? u.pos })),
  };
  const mission = { ...positioned, vision: initialVision(positioned) };
  expect(mission.vision.tdf.explored).not.toContain(
    new TileIndex(mission.map).keyOf(ENTRY),
  );
  const prepared = {
    ...save,
    state: { ...save.state, activeMission: mission },
  };
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: SAVE_KEY,
    value: JSON.stringify(prepared),
  });
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  await tacticalModelsReady(page);
  await expect(page.locator("#phase-banner")).not.toHaveAttribute(
    "data-visible",
    "true",
  );
  expect(errors).toEqual([]);
  const attempts = [
    { id: "unit-2", to: ENTRY, cut: -999 },
    { id: "unit-2", to: { x: 8, y: 2, z: 29 }, cut: 0 },
    { id: "unit-3", to: ENTRY, cut: 999 },
  ];
  const recorded: unknown[] = [];
  try {
    for (const [i, attempt] of attempts.entries()) {
      await page.evaluate(({ id, cut }) => {
        window.__tutTactical__!.selectUnit(id);
        window.__tutTactical__!.stepLayer(cut);
      }, attempt);
      await drawnFrame(page);
      const before = (await saveIn(page)).state.activeMission!;
      const from = before.units.find((u) => u.id === attempt.id)!.pos;
      expect(
        pathTo(before, attempt.id, attempt.to, buildMoveGraph(before.map)),
      ).toBeDefined();
      const point = await page.evaluate(
        (tile) => window.__tutTactical__!.tileScreenPosition(tile),
        attempt.to,
      );
      expect(point).toBeDefined();
      if (CAPTURE && i === 0)
        await page.screenshot({ path: test.info().outputPath("before.png") });
      await page.mouse.click(point!.x, point!.y, { button: "right" });
      try {
        await expect
          .poll(
            async () =>
              (await saveIn(page)).state.activeMission!.units.find(
                (u) => u.id === attempt.id,
              )!.pos,
          )
          .toEqual(attempt.to);
      } catch (error) {
        if (CAPTURE)
          await page.screenshot({
            path: test.info().outputPath(`failed-move-${i + 1}.png`),
          });
        throw error;
      } finally {
        recorded.push({
          ...attempt,
          from,
          point,
          actual: (await saveIn(page)).state.activeMission!.units.find(
            (u) => u.id === attempt.id,
          )!.pos,
        });
      }
      // Wait for the rendered mover as well as the state transition.
      await expect
        .poll(() =>
          page.evaluate(({ id, to }) => {
            const unit = window.__tutTactical__!.unitScreenPosition(id);
            const tile = window.__tutTactical__!.tileScreenPosition(to);
            return unit && tile
              ? Math.hypot(unit.x - tile.x, unit.y - tile.y)
              : Infinity;
          }, attempt),
        )
        .toBeLessThan(1);
      await drawnFrame(page);
      if (CAPTURE)
        await page.screenshot({
          path: test.info().outputPath(`move-${i + 1}.png`),
        });
    }
    expect(errors).toEqual([]);
  } finally {
    writeFileSync(
      test.info().outputPath("browser-diagnostics.json"),
      JSON.stringify(errors, null, 2),
    );
    writeFileSync(
      test.info().outputPath("movement-attempts.json"),
      JSON.stringify(recorded, null, 2),
    );
    await test.info().attach("movement-attempts", {
      body: JSON.stringify(recorded, null, 2),
      contentType: "application/json",
    });
  }
});
