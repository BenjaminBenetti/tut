import { test, expect, type Page } from "@playwright/test";
import type { GameState } from "../src/save/model/game-state";
import type { SaveEnvelope } from "../src/save/model/save-envelope";
import type { JevRequest } from "../src/tactical/model/jev-control";
import {
  buildMoveGraph,
  reachable,
} from "../src/tactical/service/movement-service";
import { drawnFrame, tacticalModelsReady } from "./capture-frame.helper";
import { launchMission } from "./mission-capture.helper";
import { CITY_MISSION_FIXTURE } from "./fixtures/mission-maps";

/** Read authoritative state separately from the model still playing its last action. */
async function savedMission(page: Page) {
  return page.evaluate(
    () =>
      (
        JSON.parse(
          localStorage.getItem("tut:save:autosave")!,
        ) as SaveEnvelope<GameState>
      ).state.activeMission!,
  );
}

test("Auto end waits for the last manual walk to reach its destination", async ({
  page,
}) => {
  await launchMission(page, "4242", CITY_MISSION_FIXTURE);
  await tacticalModelsReady(page);
  const envelope = await page.evaluate(
    () =>
      JSON.parse(
        localStorage.getItem("tut:save:autosave")!,
      ) as SaveEnvelope<GameState>,
  );
  const original = envelope.state.activeMission!;
  const actorId = "unit-2";
  const mission = {
    ...original,
    units: original.units.map((unit) =>
      unit.team === "tdf" ? { ...unit, ap: unit.id === actorId ? 1 : 0 } : unit,
    ),
  };
  const graph = buildMoveGraph(mission.map);
  const [destinationKey, cost] = [...reachable(mission, actorId, graph)].sort(
    (a, b) => b[1] - a[1],
  )[0];
  expect(cost).toBeGreaterThan(2);
  const tile = mission.map.tiles.find(
    (entry) => graph.index.keyOf(entry) === destinationKey,
  )!;
  const destination = { x: tile.x, y: tile.y, z: tile.z };
  await page.evaluate(
    (save) => localStorage.setItem("tut:save:autosave", JSON.stringify(save)),
    {
      ...envelope,
      state: { ...envelope.state, activeMission: mission },
    },
  );
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  await tacticalModelsReady(page);
  const toggle = page.getByTestId("auto-end-toggle");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  // Enter on the preference must not also invoke the game's End Turn shortcut.
  await toggle.focus();
  await toggle.press("Enter");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect((await savedMission(page)).turn).toBe(mission.turn);
  const movement = await page.evaluate(
    async ({ actorId, destination, turn }) => {
      const hooks = window.__tutTactical__!;
      const read = () =>
        (
          JSON.parse(
            localStorage.getItem("tut:save:autosave")!,
          ) as SaveEnvelope<GameState>
        ).state.activeMission!;
      hooks.selectUnit(actorId);
      hooks.invokeTile(destination);
      const immediateTurn = read().turn;
      const deadline = performance.now() + 30_000;
      return new Promise<{ immediateTurn: number; remainingPixels: number }>(
        (resolve, reject) => {
          /** Observe the first rendered frame after the phase advances. */
          const sample = (): void => {
            if (read().turn > turn) {
              const actor = hooks.unitScreenPosition(actorId)!;
              const target = hooks.tileScreenPosition(destination)!;
              resolve({
                immediateTurn,
                remainingPixels: Math.hypot(
                  actor.x - target.x,
                  actor.y - target.y,
                ),
              });
            } else if (performance.now() > deadline) {
              reject(new Error("Auto end did not advance after the last walk"));
            } else {
              requestAnimationFrame(sample);
            }
          };
          requestAnimationFrame(sample);
        },
      );
    },
    { actorId, destination, turn: mission.turn },
  );
  expect(movement.immediateTurn).toBe(mission.turn);
  expect(movement.remainingPixels).toBeLessThan(4);
  await expect(page.locator("body")).toHaveAttribute(
    "data-phase-playing",
    "false",
  );
  expect((await savedMission(page)).turn).toBe(mission.turn + 1);
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
});

test("Auto end waits for Jev, can be cancelled, and respects the inspector pause", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const requests: JevRequest[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("http://localhost:8080/v1/systemone", async (route) => {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    };
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    const request = route.request().postDataJSON() as JevRequest;
    requests.push(request);
    await gate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers,
      body: JSON.stringify({
        model: "jev-test",
        answers: {
          action: {
            type: "choice",
            choice: "overwatch",
            confidence: 1,
            probabilities: Object.fromEntries(
              Object.keys(request.questions.action!.criteria).map((id) => [
                id,
                id === "overwatch" ? 1 : 0,
              ]),
            ),
          },
        },
      }),
    });
  });
  await launchMission(page, "4242", CITY_MISSION_FIXTURE);
  const mission = await savedMission(page);
  const toggle = page.getByTestId("auto-end-toggle");
  await page
    .locator('[data-role="squad-list"] [data-unit-id="unit-1"]')
    .getByTestId("unit-jev-toggle")
    .click();
  await toggle.click();
  for (const unit of mission.units.filter(
    (unit) => unit.team === "tdf" && unit.id !== "unit-1" && unit.ap > 0,
  )) {
    await page.evaluate(
      (id) => window.__tutTactical__!.selectUnit(id),
      unit.id,
    );
    await page.locator('#action-bar [data-action="overwatch"]').click();
  }
  await expect.poll(() => requests.length).toBe(1);
  expect((await savedMission(page)).turn).toBe(mission.turn);
  await toggle.click(); // Cancel while Jev's last action is outstanding.
  release();
  await expect
    .poll(async () => (await savedMission(page)).jev?.decisions?.length)
    .toBe(1);
  expect((await savedMission(page)).turn).toBe(mission.turn);
  await page.evaluate(() => window.__tutTactical__!.selectUnit("unit-1"));
  await page.getByTestId("jev-toggle").click();
  await toggle.click();
  await drawnFrame(page);
  expect((await savedMission(page)).turn).toBe(mission.turn);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect
    .poll(async () => (await savedMission(page)).turn)
    .toBe(mission.turn + 1);
  await expect(page.locator("body")).toHaveAttribute(
    "data-phase-playing",
    "false",
  );
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect(requests).toHaveLength(1);
  await expect(page.locator('[data-role="phase-banner"]')).toBeHidden();
  await page.screenshot({ path: "docs/design/auto-end.png" });
  // Keep the two turn controls together and within the HUD at a smaller size.
  await page.setViewportSize({ width: 800, height: 720 });
  const auto = (await toggle.boundingBox())!;
  const end = (await page
    .locator('#action-bar [data-action="end-turn"]')
    .boundingBox())!;
  expect(auto.y).toBe(end.y);
  expect(auto.x).toBeGreaterThan(end.x);
  expect(auto.x + auto.width).toBeLessThanOrEqual(800);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
});
