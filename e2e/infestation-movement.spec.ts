import { expect, test } from "@playwright/test";
import type { GameState } from "../src/save/model/game-state";
import type { SaveEnvelope } from "../src/save/model/save-envelope";
import {
  buildMoveGraph,
  pathCost,
  pathTo,
  searchMoves,
} from "../src/tactical/service/movement-service";
import { CITY_MISSION_FIXTURE } from "./fixtures/mission-maps";
import { launchMission, settleForShot } from "./mission-capture.helper";
import {
  assertNoAssetFallback,
  drawnFrame,
  tacticalModelsReady,
  watchAssetFallback,
} from "./capture-frame.helper";

/** Generated infestation survives saves and a real tactical move spends the weighted AP. */
test("a squad pays two actions for a resin route that would cost one on clean ground", async ({
  page,
}) => {
  test.setTimeout(120_000);
  watchAssetFallback(page);
  await page.setViewportSize({ width: 1440, height: 1080 });
  await launchMission(page, "4242", {
    ...CITY_MISSION_FIXTURE,
    mapParams: { ...CITY_MISSION_FIXTURE.mapParams, infestationLevel: 10 },
  });
  await tacticalModelsReady(page);
  await settleForShot(page);
  const save = await page.evaluate(
    () =>
      JSON.parse(
        localStorage.getItem("tut:save:autosave")!,
      ) as SaveEnvelope<GameState>,
  );
  const mission = save.state.activeMission!;
  expect(mission.map.recipe.params.infestationLevel).toBe(10);
  expect(mission.map.tiles.filter((t) => t.infested).length).toBeGreaterThan(
    mission.map.tiles.length * 0.9,
  );
  const squad = mission.units.find((u) => u.kind === "squad")!;
  const move = mission.templates[squad.templateId].move;
  const graph = buildMoveGraph(mission.map);
  const search = searchMoves(mission, squad, graph);
  const target = [...search.tiles.values()].find((tile) => {
    if (tile.y !== squad.pos.y || tile.buildingId) return false;
    const route = pathTo(mission, squad.id, tile, graph)!;
    return (
      route.length > 0 &&
      route.length <= move &&
      pathCost(mission, squad, route, graph.index) > move
    );
  });
  expect(target).toBeDefined();
  const to = { x: target!.x, y: target!.y, z: target!.z };
  await page.evaluate((id) => window.__tutTactical__!.selectUnit(id), squad.id);
  await drawnFrame(page);
  if (process.env.CAPTURE)
    await page.screenshot({
      path: "docs/design/diagnostics/infestation/tactical-level-10-move-range.png",
    });
  await page.evaluate((tile) => window.__tutTactical__!.invokeTile(tile), to);
  await expect
    .poll(async () =>
      page.evaluate((id) => {
        const saved = JSON.parse(
          localStorage.getItem("tut:save:autosave")!,
        ) as SaveEnvelope<GameState>;
        const unit = saved.state.activeMission!.units.find((u) => u.id === id)!;
        return { pos: unit.pos, ap: unit.ap };
      }, squad.id),
    )
    .toEqual({ pos: to, ap: squad.ap - 2 });
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  await tacticalModelsReady(page);
  const resumed = await page.evaluate(
    () =>
      JSON.parse(
        localStorage.getItem("tut:save:autosave")!,
      ) as SaveEnvelope<GameState>,
  );
  expect(resumed.state.activeMission!.map).toEqual(mission.map);
  expect(
    resumed.state.activeMission!.units.find((u) => u.id === squad.id)!.ap,
  ).toBe(squad.ap - 2);
  assertNoAssetFallback(page, "infested tactical move and resume");
});
