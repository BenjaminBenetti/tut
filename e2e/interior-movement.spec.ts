import { expect, test, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";

import { ASSET_WARNING_PREFIX } from "../src/graphics/model/asset-logger";
import {
  directionOffset,
  oppositeDirection,
  stepGridPos,
} from "../src/core/service/grid-math";
import { allows, PassMask } from "../src/mapgen/model/pass-mask";
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
  const building = original.map.buildings.find((b) => b.id === "building-3");
  expect(building).toBeDefined();
  const entrance = building!.entrances[0];
  const entry = entrance.tile;
  const inward = stepGridPos(entry, oppositeDirection(entrance.side));
  const outward = directionOffset(entrance.side);
  /** Positions on the real entrance's exterior apron, in door-relative coordinates. */
  const outside = (distance: number, lateral = 0): TileCoord => ({
    x: entry.x + outward.x * distance - outward.z * lateral,
    y: entry.y,
    z: entry.z + outward.z * distance + outward.x * lateral,
  });
  const positions: Record<string, TileCoord> = {
    // Keep the unrelated mech out of the doorway ray; units still win picks.
    "unit-1": outside(3, -4),
    "unit-2": outside(2),
    "unit-3": outside(2, -1),
  };
  const index = new TileIndex(original.map);
  expect(index.getAt(inward)?.buildingId).toBe(building!.id);
  for (const [id, pos] of Object.entries(positions)) {
    const tile = index.getAt(pos);
    expect(tile?.buildingId).toBeUndefined();
    expect(
      allows(
        tile?.pass ?? PassMask.NONE,
        id === "unit-1" ? PassMask.MECH : PassMask.INFANTRY,
      ),
    ).toBe(true);
  }
  const positioned = {
    ...original,
    units: original.units.map((u) => ({ ...u, pos: positions[u.id] ?? u.pos })),
  };
  const mission = { ...positioned, vision: initialVision(positioned) };
  expect(mission.vision.tdf.explored).not.toContain(index.keyOf(entry));
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
    { id: "unit-2", to: entry, cut: -999 },
    { id: "unit-2", to: inward, cut: 0 },
    { id: "unit-3", to: entry, cut: 999 },
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
      // The full-roof CI trace renders once per ~2 s, while SceneService
      // caps animation deltas at 0.1 s. Three 0.24 s tile steps therefore
      // need about eight rendered frames: the old 15 s limit expired with
      // the squad still advancing through its final tile. Allow 30 s on CI
      // for that playback; keep the local limit and exact arrival assertion.
      await expect
        .poll(
          () =>
            page.evaluate(({ id, to }) => {
              const unit = window.__tutTactical__!.unitScreenPosition(id);
              const tile = window.__tutTactical__!.tileScreenPosition(to);
              return unit && tile
                ? Math.hypot(unit.x - tile.x, unit.y - tile.y)
                : Infinity;
            }, attempt),
          { timeout: process.env.CI ? 30_000 : 5_000 },
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
