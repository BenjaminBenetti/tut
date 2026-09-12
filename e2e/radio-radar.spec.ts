import { expect, test } from "@playwright/test";
import type { GameState } from "../src/save/model/game-state";
import { FixtureMapBuilder } from "../src/mapgen/service/fixture-map-builder";
import { emptyVision } from "../src/tactical/service/vision-service";
import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";
import { openTileWheel, wheelItem } from "./action-wheel.helper";

interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** Exercises real hiring, template construction, wheel dispatch, fog drawing and resuming. */
test("radio squads deploy persistent scanners that mark hidden units and nests", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-field="seed"]').fill("4242");
  await page.locator('[data-action="new-game"]').click();
  await page.locator('#top-bar [data-action="roster"]').click();
  await page.locator('[data-field="hire-type"]').selectOption("radio");
  await expect(page.locator("#hire-description")).toContainText(
    "30-tile circle",
  );
  await page.locator('[data-field="hire-name"]').fill("Signals");
  await page.locator('[data-action="hire"]').click();
  await expect(
    page.locator('#squad-list [data-field="name"]', { hasText: "Signals" }),
  ).toBeVisible();
  await page.locator('[data-action="overworld"]').click();
  const rows = page.locator('[data-role="mission-list"] [data-mission-id]');
  for (let day = 0; day < 40 && (await rows.count()) === 0; day++) {
    const choice = page
      .locator('[data-role="event-dialog"] [data-choice-id]')
      .first();
    if (await choice.isVisible()) await choice.click();
    await page.locator('[data-action="advance-day"]').click();
  }
  const missionId = await rows.first().getAttribute("data-mission-id");
  const refusal = await page.evaluate(
    (id) => window.__tut__?.startTacticalMission(id),
    missionId!,
  );
  expect(refusal).toBeUndefined();
  await expect(body).toHaveAttribute("data-tactical-ready", "true");

  // Keep the genuinely hired/deployed squad and its frozen template. Use a small
  // deterministic board to put both contact types just beyond the squad's sight.
  const map = new FixtureMapBuilder(40, 32, 1).fillGround().build();
  const radioId = await page.evaluate(
    ({ fixtureMap, vision }) => {
      const envelope = JSON.parse(
        localStorage.getItem("tut:save:autosave")!,
      ) as { state: GameState };
      const mission = envelope.state.activeMission!;
      const radio = mission.units.find((unit) =>
        mission.templates[unit.templateId]?.abilities?.includes("deploy-radar"),
      )!;
      if (!radio) throw new Error("Hiring did not create a radio template");
      envelope.state = {
        ...envelope.state,
        activeMission: {
          ...mission,
          map: fixtureMap,
          units: [
            { ...radio, pos: { x: 6, y: 0, z: 8 } },
            {
              ...radio,
              id: "radar-test-bug",
              templateId: "radar-test-bug",
              sourceId: "swarmer",
              team: "bugs",
              kind: "bug",
              pos: { x: 18, y: 0, z: 15 },
            },
          ],
          templates: {
            ...mission.templates,
            "radar-test-bug": {
              ...mission.templates[radio.templateId],
              id: "radar-test-bug",
              name: "Swarmer",
              modelId: "bug.swarmer",
              abilities: [],
            },
          },
          spawners: [
            {
              id: "radar-test-nest",
              pos: { x: 20, y: 0, z: 8 },
              hp: 20,
              timer: 10,
              hatchRadius: 3,
              destroyed: false,
            },
          ],
          objectives: [
            {
              id: "radar-test-objective",
              kind: "destroy-spawner",
              targetId: "radar-test-nest",
              complete: false,
            },
          ],
          extraction: [],
          vision,
        },
      };
      localStorage.setItem("tut:save:autosave", JSON.stringify(envelope));
      return radio.id;
    },
    { fixtureMap: map, vision: emptyVision() },
  );
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  await expect(body).toHaveAttribute("data-tactical-ready", "true");
  await expect(body).toHaveAttribute("data-tactical-radars", "0");
  await expect(body).toHaveAttribute("data-tactical-radar-contacts", "0");
  await expect(body).toHaveAttribute("data-tactical-units", "1");
  await expect(body).toHaveAttribute("data-tactical-spawners", "0");
  await page.evaluate(
    (id) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(id),
    radioId,
  );
  const tile = { x: 7, y: 0, z: 8 };
  await openTileWheel(page, tile);
  await expect(wheelItem(page, "deploy-radar:7,0,8")).toBeEnabled();
  await wheelItem(page, "deploy-radar:7,0,8").click();
  await expect(body).toHaveAttribute("data-tactical-radars", "1");
  await expect(body).toHaveAttribute("data-tactical-radar-contacts", "2");
  await expect(body).toHaveAttribute("data-tactical-units", "1");
  await expect(body).toHaveAttribute("data-tactical-spawners", "0");
  await expect(page.locator('[data-role="radar-legend"]')).toBeVisible();
  const state = await page.evaluate(
    () =>
      (
        JSON.parse(localStorage.getItem("tut:save:autosave")!) as {
          state: GameState;
        }
      ).state.activeMission!,
  );
  expect(state.units.find((unit) => unit.id === radioId)?.ap).toBe(1);
  expect(state.radars[0]).toMatchObject({ pos: tile, range: 30, team: "tdf" });
  expect(state.vision.tdf.spotted).toEqual([]);
  await openTileWheel(page, tile);
  await expect(wheelItem(page, "deploy-radar:7,0,8")).toBeDisabled();
  await page.keyboard.press("Escape");

  await page.reload();
  await page.locator('[data-action="continue"]').click();
  await expect(body).toHaveAttribute("data-tactical-ready", "true");
  await expect(body).toHaveAttribute("data-tactical-radars", "1");
  await expect(body).toHaveAttribute("data-tactical-radar-contacts", "2");
  await expect(body).toHaveAttribute("data-tactical-spawners", "0");
  await page.mouse.move(900, 450);
  await page.mouse.wheel(0, 700);
  if (process.env.CAPTURE) {
    await page.screenshot({ path: "docs/design/radio-radar.png" });
  }
  expect(errors).toEqual([]);
});
