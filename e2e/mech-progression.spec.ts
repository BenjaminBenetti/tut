import { expect, test, type Page } from "@playwright/test";
import type { TacticalState } from "../src/tactical/model/tactical-state";
import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";
import { openTileWheel, openUnitWheel, wheelItem } from "./action-wheel.helper";
import { tacticalModelsReady } from "./capture-frame.helper";
import { settleForShot } from "./mission-capture.helper";

/** The current autosaved battlefield, after the command pipeline has persisted it. */
async function missionOf(page: Page): Promise<TacticalState> {
  return page.evaluate(() => {
    const envelope = JSON.parse(localStorage.getItem("tut:save:autosave")!) as {
      state: { activeMission: TacticalState };
    };
    return envelope.state.activeMission;
  });
}

test("all six blueprints assemble; a purchased Jump Scout deploys, jumps and vents", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-field="seed"]').fill("4242");
  await page.locator('[data-action="new-game"]').click();
  await page.locator('#top-bar [data-action="roster"]').click();
  await page.locator('[data-action="mech-bay"]').click();
  await expect(page.locator("#part-palette [data-part-id]")).toHaveCount(48);
  const blueprints = page.getByLabel("Example mech blueprints");
  for (const name of [
    "Jump Scout",
    "Forward Observer",
    "Urban Breacher",
    "Siege Battery",
    "Beam Crucible",
    "Rapid Response",
  ]) {
    await blueprints.selectOption({ label: name });
    await expect(page.locator('#stat-sheet [data-field="verdict"]')).toHaveText(
      "Buildable",
    );
    await expect(page.locator('[data-role="slot-anchors"]')).toHaveClass(
      /is-anchored/,
    );
    await expect(
      page.locator('#stat-sheet [data-field="cooling"]').first(),
    ).toContainText("capacity");
    if (process.env.CAPTURE) {
      await page.waitForTimeout(500);
      await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
    }
  }
  await blueprints.selectOption({ label: "Jump Scout" });
  await page.locator('[data-field="mech-name"]').fill("Skylark");
  await page.locator('[data-action="build-mech"]').click();
  await expect(page.locator('[data-role="status"]')).toHaveText(
    "Built Skylark.",
  );
  await page.locator('#mech-bay-bar [data-action="roster"]').click();
  await expect(page.locator("#mech-list tbody tr").last()).toContainText(
    "Courser · Pulse Laser / Smoke Launcher",
  );
  await page.locator('[data-action="overworld"]').click();

  const missions = page.locator('[data-role="mission-list"] [data-mission-id]');
  const choices = page.locator('[data-role="event-dialog"] [data-choice-id]');
  for (let day = 0; day < 40 && (await missions.count()) === 0; day++) {
    if (await choices.first().isVisible()) await choices.first().click();
    await page.locator('[data-action="advance-day"]').click();
  }
  if (await choices.first().isVisible()) await choices.first().click();
  await missions.first().click();
  await page
    .locator('[data-role="mission-details"] [data-action="plan-deployment"]')
    .click();
  for (const box of await page
    .locator('[data-role="deployment-picker"] input[type="checkbox"]')
    .all())
    await box.check();
  await page.locator('[data-action="launch"]').click();
  await tacticalModelsReady(page);
  await settleForShot(page);
  const before = await missionOf(page);
  const scout = before.units.find(
    (unit) => before.templates[unit.templateId]?.systems?.jumpRange,
  );
  expect(scout).toBeDefined();
  if (!scout) throw new Error("purchased Jump Scout was not deployed");
  await openUnitWheel(page, scout.id);
  await page.keyboard.press("Escape");
  const candidates = before.map.tiles.filter(
    (tile) =>
      tile.y === scout.pos.y &&
      Math.abs(tile.x - scout.pos.x) + Math.abs(tile.z - scout.pos.z) >= 2 &&
      Math.abs(tile.x - scout.pos.x) + Math.abs(tile.z - scout.pos.z) <= 4,
  );
  let landing: { x: number; y: number; z: number } | undefined;
  for (const tile of candidates) {
    await openTileWheel(page, tile);
    const jump = wheelItem(page, `mech:jump:${tile.x},${tile.y},${tile.z}`);
    if ((await jump.count()) && (await jump.isEnabled())) {
      landing = { x: tile.x, y: tile.y, z: tile.z };
      await jump.hover();
      await expect(page.locator("body")).toHaveAttribute(
        "data-tactical-blast-tiles",
        "1",
      );
      await jump.click();
      break;
    }
    await page.keyboard.press("Escape");
  }
  expect(landing, "the scout has an observed outdoor landing").toBeDefined();
  await expect
    .poll(
      async () =>
        (await missionOf(page)).units.find((unit) => unit.id === scout.id)?.pos,
    )
    .toEqual(landing);
  await expect
    .poll(
      async () =>
        (await missionOf(page)).units.find((unit) => unit.id === scout.id)
          ?.heat,
    )
    .toBe(5);
  await expect(page.locator('#unit-card [data-field="heat"]')).toContainText(
    "5/22",
  );
  await expect(page.locator("body")).not.toHaveAttribute(
    "data-tactical-playing",
    "true",
  );
  await openUnitWheel(page, scout.id);
  await wheelItem(page, "reload").click();
  await expect
    .poll(
      async () =>
        (await missionOf(page)).units.find((unit) => unit.id === scout.id)
          ?.heat,
    )
    .toBe(0);
  await expect
    .poll(
      async () =>
        (await missionOf(page)).units.find((unit) => unit.id === scout.id)?.ap,
    )
    .toBe(0);
  // The same thermal state survives a real autosave/resume cycle.
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  await expect(page.locator("body")).toHaveAttribute("data-screen", "tactical");
  await page.evaluate(
    (id) =>
      (
        globalThis as { __tutTactical__?: TacticalTestHooks }
      ).__tutTactical__?.selectUnit(id),
    scout.id,
  );
  expect(
    (await missionOf(page)).units.find((unit) => unit.id === scout.id),
  ).toMatchObject({ heat: 0, ap: 0, pos: landing });
  expect(errors).toEqual([]);
});
