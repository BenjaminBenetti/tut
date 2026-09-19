import { expect, test, type Page } from "@playwright/test";
import type { GameState } from "../src/save/model/game-state";
import type { TacticalState } from "../src/tactical/model/tactical-state";
import { TECH_NODES } from "../src/tech/data/tech-tree";
import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";
import { openTileWheel, openUnitWheel, wheelItem } from "./action-wheel.helper";
import { tacticalModelsReady } from "./capture-frame.helper";
import { settleForShot } from "./mission-capture.helper";

const SAVE_KEY = "tut:save:autosave";

/**
 * Buys the whole tech tree (#1171): every blueprint but the starter's
 * fits tier 2 and 3 parts, which the tree gates, so the bay would call
 * them all "Not buildable". Grants a pool through the autosave, resumes,
 * and unlocks Jump Jets first — the part the Jump Scout stands on —
 * then every other card as it becomes available, tier 2 before tier 3.
 */
async function researchEverything(page: Page): Promise<void> {
  const envelope = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!) as { state: GameState },
    SAVE_KEY,
  );
  const funded: GameState = {
    ...envelope.state,
    economy: { ...envelope.state.economy, techPoints: 1000 },
  };
  await page.evaluate(
    ({ key, saved }) => {
      localStorage.setItem(key, JSON.stringify(saved));
    },
    { key: SAVE_KEY, saved: { ...envelope, state: funded } },
  );
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  await page.locator('#top-bar [data-action="tech-tree"]').click();
  await expect(
    page.locator('#tech-tree-bar [data-field="techPoints"]'),
  ).toHaveText("1,000 TP");
  // The web is three: a node is selected through the dev hook rather
  // than by finding its pedestal on screen, and Unlock lives in the
  // detail panel (#1171).
  const detail = page.locator("#tech-tree-detail");
  const unlock = detail.locator('[data-action="unlock"]');
  const buy = async (nodeId: string): Promise<void> => {
    await page.evaluate((id) => window.__tutTech__?.select(id), nodeId);
    await expect(detail).toHaveAttribute("data-selected-node", nodeId);
    await unlock.click();
    await expect(page.locator(`[data-node="${nodeId}"]`)).toHaveAttribute(
      "data-status",
      "unlocked",
    );
  };
  await buy("tech.jump-jets");
  const available = page.locator('[data-node][data-status="available"]');
  while ((await available.count()) > 0) {
    const nodeId = await available.first().getAttribute("data-node");
    if (nodeId === null) break;
    await buy(nodeId);
  }
  await expect(page.locator('[data-node][data-status="unlocked"]')).toHaveCount(
    TECH_NODES.length,
  );
  await page.locator('#tech-tree-bar [data-action="overworld"]').click();
}

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
  await expect(page.locator("body")).toHaveAttribute(
    "data-screen",
    "overworld",
  );
  await researchEverything(page);
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
  await page.keyboard.down("Shift");
  await expect(
    page.locator(
      `.tut-status-chip[data-unit-id="${scout.id}"] [data-field="status-charge"]`,
    ),
  ).toHaveText("heat 5 / 22");
  await page.keyboard.up("Shift");
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
