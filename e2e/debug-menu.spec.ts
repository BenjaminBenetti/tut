import { expect, test, type Page } from "@playwright/test";

import type { TacticalState } from "../src/tactical/model/tactical-state";
import type { Unit } from "../src/tactical/model/unit";
import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";
import { drawnFrame, tacticalModelsReady } from "./capture-frame.helper";
import { launchMission, settleForShot } from "./mission-capture.helper";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** A tile on the ground plane, as the hooks name it. */
interface Tile {
  x: number;
  y: number;
  z: number;
}

/** The mission as the autosave last wrote it. */
async function savedMission(page: Page): Promise<TacticalState | null> {
  return page.evaluate(() => {
    const raw = localStorage.getItem("tut:save:autosave");
    if (raw === null) return null;
    const envelope = JSON.parse(raw) as {
      state: { activeMission?: TacticalState };
    };
    return envelope.state.activeMission ?? null;
  });
}

/**
 * The first free ground tile beside a living unit of the player's that
 * the scene can put a pointer on, with where to click it. Searched from
 * the saved mission rather than guessed: the deploy zone is at an edge
 * of the map and its neighbours are not all standing tiles.
 *
 * @param page - The page driving a live mission.
 * @returns The tile and its client-pixel position, or undefined.
 */
async function freeTileBesideTheForce(
  page: Page,
): Promise<{ tile: Tile; at: { x: number; y: number } } | undefined> {
  const mission = await savedMission(page);
  if (!mission) return undefined;
  const taken = new Set(
    mission.units
      .filter((unit) => unit.hp > 0)
      .map((unit) => `${unit.pos.x},${unit.pos.y},${unit.pos.z}`),
  );
  const force = mission.units.filter((u) => u.team === "tdf" && u.hp > 0);
  const candidates: Tile[] = [];
  for (const unit of force) {
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const tile = { x: unit.pos.x + dx, y: unit.pos.y, z: unit.pos.z + dz };
      if (!taken.has(`${tile.x},${tile.y},${tile.z}`)) {
        candidates.push(tile);
      }
    }
  }
  const bounds = await page.locator("#tactical-viewport canvas").boundingBox();
  if (!bounds) return undefined;
  for (const tile of candidates) {
    const at = await page.evaluate(
      (t: Tile) =>
        (globalThis as HookGlobal).__tutTactical__?.tileScreenPosition(t),
      tile,
    );
    // Clear of the rail on the left and the card on the right, where the
    // HUD's panels take the click (#1113, #1134).
    if (
      at &&
      at.x > bounds.x + bounds.width * 0.3 &&
      at.x < bounds.x + bounds.width * 0.68 &&
      at.y > bounds.y + 80 &&
      at.y < bounds.y + bounds.height - 80
    ) {
      return { tile, at };
    }
  }
  return undefined;
}

/** The unit standing on `tile` in the saved mission, if any. */
async function unitAt(page: Page, tile: Tile): Promise<Unit | undefined> {
  const mission = await savedMission(page);
  return mission?.units.find(
    (u) => u.pos.x === tile.x && u.pos.y === tile.y && u.pos.z === tile.z,
  );
}

/**
 * The development tools (#1136): in a dev build — which the Playwright
 * server is — a bug button at the bottom left of the bar opens a debug
 * menu over the left rail. Pressing an entry and clicking the map puts
 * that unit there, on its own side, drawn and listed like any other.
 */
test("the debug menu places a bug and a squad where the map is clicked", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 800 });
  await launchMission(page, "4242");
  await tacticalModelsReady(page);
  await settleForShot(page);
  const body = page.locator("body");

  const toggle = page.getByTestId("debug-menu-toggle");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-label", "Debug menu");
  const menu = page.getByTestId("debug-menu");
  await expect(menu).toBeHidden();
  await toggle.click();
  await expect(menu).toBeVisible();
  await expect(menu).toContainText("Debug");
  await expect(menu).toContainText("Place unit");
  // On the left of the screen, over the rail.
  const box = await menu.boundingBox();
  expect(box).toBeTruthy();
  expect(box!.x + box!.width).toBeLessThan(1400 / 3);

  // A swarmer, on the bugs' side, at the clicked tile.
  const before = await savedMission(page);
  expect(before).not.toBeNull();
  const unitsBefore = before!.units.length;
  const drawnBefore = Number(await body.getAttribute("data-tactical-units"));
  await page.getByTestId("debug-place-bug-swarmer").click();
  await expect(page.getByTestId("debug-place-bug-swarmer")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#turn-banner")).toContainText(
    "Place: Swarmer — click the map, Esc cancels",
  );
  const first = await freeTileBesideTheForce(page);
  expect(first, "a free tile beside the force in the open").toBeTruthy();
  await page.mouse.click(first!.at.x, first!.at.y);
  await expect
    .poll(async () => (await savedMission(page))?.units.length)
    .toBe(unitsBefore + 1);
  const bug = await unitAt(page, first!.tile);
  expect(bug).toMatchObject({ kind: "bug", team: "bugs", sourceId: "swarmer" });
  // Drawn: the scene counts one more unit.
  await expect(body).toHaveAttribute(
    "data-tactical-units",
    String(drawnBefore + 1),
  );
  // Still armed, and no wheel opened for the click.
  await expect(page.getByTestId("debug-place-bug-swarmer")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#radial-menu")).not.toHaveAttribute(
    "data-open",
    "true",
  );

  // A rifle squad, on the player's side, and the squad list grows.
  const rows = page.locator('[data-role="squad-list"] [data-unit-id]');
  const rowsBefore = await rows.count();
  await page.getByTestId("debug-place-squad-rifle").click();
  await expect(page.getByTestId("debug-place-bug-swarmer")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  const second = await freeTileBesideTheForce(page);
  expect(second, "a second free tile beside the force").toBeTruthy();
  await page.mouse.click(second!.at.x, second!.at.y);
  await expect
    .poll(async () => (await savedMission(page))?.units.length)
    .toBe(unitsBefore + 2);
  const squad = await unitAt(page, second!.tile);
  expect(squad).toMatchObject({ kind: "squad", team: "tdf" });
  await expect(rows).toHaveCount(rowsBefore + 1);
  await expect(rows.last()).toContainText("Rifle Squad");

  // Escape disarms; closing the menu leaves the map as it was.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("debug-place-squad-rifle")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await menu.locator('[data-action="debug-menu-close"]').click();
  await expect(menu).toBeHidden();
  expect(errors).toEqual([]);
});

/**
 * The frame for the design notes: the menu open on the left with the
 * swarmer armed, the instruction on the status line.
 *
 *   CAPTURE=1 pnpm exec playwright test e2e/debug-menu.spec.ts
 */
test("captures the debug menu open with an armed entry", async ({ page }) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the debug menu screenshot",
  );
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await launchMission(page, "4242");
  await tacticalModelsReady(page);
  await settleForShot(page);
  await page.getByTestId("debug-menu-toggle").click();
  await page.getByTestId("debug-place-bug-swarmer").click();
  await expect(page.getByTestId("debug-place-bug-swarmer")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await drawnFrame(page);
  await page.screenshot({ path: "docs/design/debug-menu.png" });
});
