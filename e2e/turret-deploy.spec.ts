import { expect, test, type Page } from "@playwright/test";

import type { TacticalState } from "../src/tactical/model/tactical-state";
import type { Unit } from "../src/tactical/model/unit";
import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";
import { openTileWheel, wheelItem } from "./action-wheel.helper";
import { waitForBugPhasePlayed } from "./bug-phase.helper";
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
async function savedMission(page: Page): Promise<TacticalState> {
  const mission = await page.evaluate(() => {
    const raw = localStorage.getItem("tut:save:autosave");
    if (raw === null) return null;
    const envelope = JSON.parse(raw) as {
      state: { activeMission?: TacticalState };
    };
    return envelope.state.activeMission ?? null;
  });
  if (mission === null) throw new Error("no mission in the autosave");
  return mission;
}

/** The turrets in the saved mission, in `units` order. */
function turretsIn(mission: TacticalState): Unit[] {
  return mission.units.filter((unit) => unit.kind === "turret");
}

/**
 * The first free ground tile beside the force the scene can put a
 * pointer on, with where to click it (the debug-menu spec's search,
 * #1136): two to three tiles out from a member of the force on its own
 * level, with no living unit on any of its eight neighbours so the
 * click cannot land on a model, and clear of the HUD's panels.
 */
async function freeTileBesideTheForce(
  page: Page,
): Promise<{ tile: Tile; at: { x: number; y: number } } | undefined> {
  const mission = await savedMission(page);
  const living = mission.units.filter((unit) => unit.hp > 0);
  const taken = new Set(
    living.map((unit) => `${unit.pos.x},${unit.pos.y},${unit.pos.z}`),
  );
  const force = living.filter((u) => u.team === "tdf");
  const clearOfUnits = (tile: Tile): boolean =>
    living.every(
      (unit) =>
        unit.pos.y !== tile.y ||
        Math.max(Math.abs(unit.pos.x - tile.x), Math.abs(unit.pos.z - tile.z)) >
          1,
    );
  const candidates: Tile[] = [];
  const seen = new Set<string>();
  for (const unit of force) {
    for (let dx = -3; dx <= 3; dx += 1) {
      for (let dz = -3; dz <= 3; dz += 1) {
        const tile = { x: unit.pos.x + dx, y: unit.pos.y, z: unit.pos.z + dz };
        const key = `${tile.x},${tile.y},${tile.z}`;
        if (seen.has(key) || taken.has(key) || !clearOfUnits(tile)) continue;
        seen.add(key);
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

/**
 * Ends the player's turn and waits for the next player turn to open:
 * the bug phase plays out on screen and the autosave carries the new
 * turn number before the controls come back.
 */
async function endTurn(page: Page, expectedTurn: number): Promise<void> {
  const button = page.locator('#action-bar [data-action="end-turn"]');
  await expect(button).toBeEnabled();
  await button.click();
  await waitForBugPhasePlayed(page, 120_000);
  await expect
    .poll(async () => {
      const mission = await savedMission(page);
      return `${String(mission.turn)}:${mission.phase}`;
    })
    .toBe(`${String(expectedTurn)}:player`);
}

/**
 * The engineer's turret (#1138): placed through the development tools
 * (the engineer is not in the starter roster), an engineer deploys a
 * turret on a tile two away from the wheel's ring. The turret is a unit
 * of its own in the save, on overwatch with a three-turn battery; it is
 * on watch again after every End turn, and as the fourth turn opens it
 * has burnt out, with the log saying so.
 */
test("an engineer deploys a turret that watches for three turns and burns out", async ({
  page,
}) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 800 });
  await launchMission(page, "4242");
  await tacticalModelsReady(page);
  await settleForShot(page);

  // An engineer, through the debug menu's spawn tool (#1136).
  const before = await savedMission(page);
  await page.getByTestId("debug-menu-toggle").click();
  await page.getByTestId("debug-tool-spawn").click();
  await page.getByTestId("debug-place-squad-engineer").click();
  const site = await freeTileBesideTheForce(page);
  expect(site, "a free tile beside the force in the open").toBeTruthy();
  await drawnFrame(page);
  await page.mouse.click(site!.at.x, site!.at.y);
  await expect
    .poll(async () => (await savedMission(page)).units.length)
    .toBe(before.units.length + 1);
  await page.keyboard.press("Escape");
  const placed = await savedMission(page);
  const engineer = placed.units.find(
    (unit) =>
      unit.team === "tdf" &&
      placed.templates[unit.templateId]?.equipment?.includes("turret"),
  );
  expect(engineer, "the placed squad carries the turret").toBeTruthy();

  // Deploy on the first free site two tiles out that the rules accept.
  await page.evaluate(
    (id) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(id),
    engineer!.id,
  );
  const { pos } = engineer!;
  const candidates: Tile[] = [
    { x: pos.x + 2, y: pos.y, z: pos.z },
    { x: pos.x - 2, y: pos.y, z: pos.z },
    { x: pos.x, y: pos.y, z: pos.z + 2 },
    { x: pos.x, y: pos.y, z: pos.z - 2 },
    { x: pos.x + 1, y: pos.y, z: pos.z + 1 },
    { x: pos.x - 1, y: pos.y, z: pos.z - 1 },
    { x: pos.x + 1, y: pos.y, z: pos.z - 1 },
    { x: pos.x - 1, y: pos.y, z: pos.z + 1 },
  ];
  let deployedAt: Tile | undefined;
  for (const tile of candidates) {
    const id = `deploy-turret:${String(tile.x)},${String(tile.y)},${String(tile.z)}`;
    await openTileWheel(page, tile);
    const entry = wheelItem(page, id);
    if ((await entry.count()) > 0 && (await entry.isEnabled())) {
      await expect(entry).toContainText("Deploy turret");
      await entry.click();
      deployedAt = tile;
      break;
    }
    await page.keyboard.press("Escape");
  }
  expect(deployedAt, "a site the rules accept two tiles out").toBeTruthy();
  await expect
    .poll(async () => turretsIn(await savedMission(page)).length)
    .toBe(1);
  const deployed = await savedMission(page);
  const turret = turretsIn(deployed)[0];
  expect(turret).toMatchObject({
    kind: "turret",
    team: "tdf",
    templateId: "turret:turret",
    pos: deployedAt,
    hp: 30,
    turnsLeft: 3,
    overwatchShots: 2,
  });
  expect(turret.status).toContain("overwatch");
  expect(deployed.templates["turret:turret"]).toMatchObject({
    name: "Turret",
    construction: "mechanical",
  });
  expect(
    deployed.units.find((unit) => unit.id === engineer!.id)?.equipment,
  ).toEqual({ turret: 1 });
  const log = page.locator("#event-log");
  await expect(log).toContainText("deployed a turret");
  // Not in the strip: the turret takes no orders (#1138).
  await expect(
    page.locator(`[data-role="squad-list"] [data-unit-id="${turret.id}"]`),
  ).toHaveCount(0);
  await expect(page.locator("body")).toHaveAttribute(
    "data-tactical-units",
    String(deployed.units.filter((unit) => unit.hp > 0).length),
  );

  if (process.env.CAPTURE) {
    // The frame for the design notes: the turret beside its engineer.
    const at = await page.evaluate(
      (t: Tile) =>
        (globalThis as HookGlobal).__tutTactical__?.tileScreenPosition(t),
      deployedAt!,
    );
    if (at) {
      await page.mouse.move(at.x, at.y);
      await page.mouse.wheel(0, -600);
    }
    await page.waitForTimeout(800);
    await drawnFrame(page);
    await page.screenshot({ path: "docs/design/turret-deployed.png" });
  }

  // On watch again as each player turn opens, the battery a turn lower.
  for (const [turn, turnsLeft] of [
    [2, 2],
    [3, 1],
  ] as const) {
    await endTurn(page, turn);
    const mission = await savedMission(page);
    const watching = turretsIn(mission)[0];
    if (watching.hp > 0) {
      expect(watching, `turn ${String(turn)}`).toMatchObject({ turnsLeft });
      expect(watching.status, `turn ${String(turn)}`).toContain("overwatch");
    }
  }
  await endTurn(page, 4);
  const burnt = turretsIn(await savedMission(page))[0];
  expect(burnt.hp).toBe(0);
  if (burnt.turnsLeft === 0) {
    await expect(log).toContainText("Turret burned out");
  }
  expect(errors).toEqual([]);
});
