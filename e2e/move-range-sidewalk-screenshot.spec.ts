import { expect, test } from "@playwright/test";

import { SurfaceIds } from "../src/mapgen/data/surfaces";
import type { GameState } from "../src/save/model/game-state";
import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";
import {
  assertNoAssetFallback,
  drawnFrame,
  tacticalModelsReady,
  watchAssetFallback,
} from "./capture-frame.helper";
import { CITY_MISSION_FIXTURE } from "./fixtures/mission-maps";
import { launchMission, settleForShot } from "./mission-capture.helper";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** The autosave the mission is read from. */
const SAVE_KEY = "tut:save:autosave";

/**
 * Move bands are drawn on sidewalk slabs (#1130, item 5). The sidewalk
 * model is a 0.12-thick slab whose top sits 0.035 above the tile top,
 * and the bands used to lie at 0.02 and 0.03: inside the slab, so a
 * squad on a city street saw its reach stop at the kerb. The frame
 * selects the first squad on the pinned city map, whose deploy zone is
 * on a street, and the bands must be visible on the grey slabs.
 *
 *   CAPTURE=1 pnpm exec playwright test e2e/move-range-sidewalk-screenshot.spec.ts
 */
test("move bands show on the sidewalk beside the street", async ({ page }) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the sidewalk overlay screenshot",
  );
  test.setTimeout(180_000);
  watchAssetFallback(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await launchMission(page, "4242", CITY_MISSION_FIXTURE);
  await tacticalModelsReady(page);
  await settleForShot(page);

  const squad = await page.evaluate(
    ({ key, sidewalk }) => {
      const envelope = JSON.parse(localStorage.getItem(key)!) as {
        state: GameState;
      };
      const mission = envelope.state.activeMission!;
      const unit = mission.units.find((u) => u.kind === "squad")!;
      // Sidewalk tiles within one action of the squad, so the frame
      // exhibits the case rather than a street with no kerb in reach.
      const near = mission.map.tiles.filter(
        (tile) =>
          tile.surface === sidewalk &&
          Math.abs(tile.x - unit.pos.x) + Math.abs(tile.z - unit.pos.z) <= 5,
      ).length;
      return { id: unit.id, near };
    },
    { key: SAVE_KEY, sidewalk: SurfaceIds.SIDEWALK },
  );
  expect(squad.near, "no sidewalk within a move of the squad").toBeGreaterThan(
    0,
  );
  await page.evaluate(
    (id) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(id),
    squad.id,
  );
  await expect(page.locator("body")).toHaveAttribute(
    "data-tactical-selected",
    squad.id,
  );
  await drawnFrame(page);
  assertNoAssetFallback(page, "the sidewalk overlay frame");
  await page.locator("#tactical-viewport").screenshot({
    path: "docs/design/ui-move-range-sidewalk.png",
  });
});
