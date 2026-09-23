import { test, expect, type Page } from "@playwright/test";
import type { GameState } from "../src/save/model/game-state";
import type { SaveEnvelope } from "../src/save/model/save-envelope";
import { launchMission, settleForShot } from "./mission-capture.helper";
import { CITY_MISSION_FIXTURE } from "./fixtures/mission-maps";
import {
  assertNoAssetFallback,
  drawnFrame,
  tacticalModelsReady,
  watchAssetFallback,
} from "./capture-frame.helper";

/** Read saved controls to cover the same command and persistence path as gameplay. */
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

/** Compare world projections to detect camera shortcuts leaking from the bulk editor. */
async function cameraProjection(page: Page) {
  const mission = await savedMission(page);
  return page.evaluate(
    (positions) =>
      positions.map((position) =>
        window.__tutTactical__!.tileScreenPosition(position),
      ),
    mission.units
      .filter((unit) => unit.team === "tdf")
      .slice(0, 2)
      .map((unit) => unit.pos),
  );
}

test("Squad selection modes apply Jev control and shared unit orders without changing battlefield selection", async ({
  page,
}) => {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("http://localhost:8080/v1/systemone", async (route) => {
    requests.push(route.request().method());
    await route.abort();
  });
  watchAssetFallback(page);
  await launchMission(page, "4242", CITY_MISSION_FIXTURE);
  await tacticalModelsReady(page);
  await settleForShot(page);
  const squad = page.locator("#squad-strip");
  const rows = squad.locator('[data-role="squad-list"] li');
  const first = rows.nth(0);
  const second = rows.nth(1);
  const third = rows.nth(2);
  const firstId = (await first.getAttribute("data-unit-id"))!;
  const secondId = (await second.getAttribute("data-unit-id"))!;
  const thirdId = (await third.getAttribute("data-unit-id"))!;
  const jev = squad.getByTestId("squad-jev-toggle");
  const orders = squad.getByTestId("squad-orders-toggle");
  const cancel = squad.getByTestId("squad-selection-cancel");
  const input = squad.getByTestId("squad-orders-input");
  await first.click();
  await drawnFrame(page);
  const camera = await cameraProjection(page);
  const original = await savedMission(page);
  await expect(jev).toHaveText("Jev");
  await expect(orders).toHaveText("");
  await expect(rows.locator("button")).toHaveCount(0);
  expect((await first.boundingBox())!.height).toBeLessThan(48);
  const lastRow = (await rows.last().boundingBox())!;
  expect((await jev.boundingBox())!.y).toBeGreaterThanOrEqual(
    lastRow.y + lastRow.height,
  );

  await jev.click();
  await expect(jev).toHaveText("Apply");
  await expect(jev).toHaveAttribute("aria-pressed", "true");
  await first.click();
  await first.press("Tab");
  await expect(second).toBeFocused();
  await second.press("Space");
  await expect(first).toBeChecked();
  await expect(second).toBeChecked();
  await expect(third).not.toBeChecked();
  expect((await savedMission(page)).commandSeq).toBe(original.commandSeq);
  expect(await cameraProjection(page)).toEqual(camera);
  await jev.click();
  await expect(first).toHaveAttribute("data-selected", "true");
  await expect
    .poll(
      async () => (await savedMission(page)).jev?.entities[firstId]?.enabled,
    )
    .toBe(true);
  expect((await savedMission(page)).jev?.entities[secondId]?.enabled).toBe(
    true,
  );
  // Individual controls remain available on the selected unit's card.
  await expect(
    page.locator("#unit-card").getByTestId("unit-jev-toggle"),
  ).toHaveAttribute("aria-pressed", "true");

  await orders.click();
  await expect(input).toBeFocused();
  expect(
    await input.evaluate(
      (element) =>
        element.getBoundingClientRect().right <=
        element.closest("label")!.getBoundingClientRect().right,
    ),
  ).toBe(true);
  await expect(orders).toHaveText("Apply");
  await expect(orders).toBeDisabled();
  await input.fill(
    Array.from(
      { length: 60 },
      (_, i) => `Order ${String(i)}: hold position.`,
    ).join("\n"),
  );
  await input.hover();
  await page.mouse.wheel(0, 300);
  await expect
    .poll(() => input.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await input.press("q");
  await input.press("Enter");
  expect(await cameraProjection(page)).toEqual(camera);
  const prompt = "Advance together toward extraction. Cover one another.";
  await input.fill(prompt);
  await first.click();
  await third.click();
  await expect(orders).toBeEnabled();
  await orders.scrollIntoViewIfNeeded();
  await drawnFrame(page);
  assertNoAssetFallback(page, "Squad orders selection");
  await page.screenshot({ path: "docs/design/jev-squad-orders.png" });
  await orders.click();
  let saved = await savedMission(page);
  expect(saved.jev?.entities[firstId]).toEqual({
    enabled: true,
    entityPrompt: prompt,
  });
  expect(saved.jev?.entities[secondId]).toEqual({
    enabled: true,
    entityPrompt: "",
  });
  expect(saved.jev?.entities[thirdId]).toEqual({
    enabled: false,
    entityPrompt: prompt,
  });
  expect(saved.units).toEqual(original.units);
  expect(saved.jev?.commanders).toEqual({ tdf: "", bugs: "" });

  await jev.click();
  await expect(first).toBeChecked();
  await expect(second).toBeChecked();
  await first.click();
  await cancel.click();
  expect((await savedMission(page)).jev).toEqual(saved.jev);
  await jev.click();
  await expect(first).toBeChecked();
  await first.click();
  await jev.click();
  saved = await savedMission(page);
  expect(saved.jev?.entities[firstId]).toEqual({
    enabled: false,
    entityPrompt: prompt,
  });
  expect(saved.jev?.entities[secondId]?.enabled).toBe(true);

  await orders.click();
  await first.click();
  await input.fill("Discard these orders");
  await input.press("Escape");
  await expect(orders).toBeFocused();
  await expect(input).toBeHidden();
  expect((await savedMission(page)).jev).toEqual(saved.jev);

  await page.reload();
  await page.locator('[data-action="continue"]').click();
  await expect(page.locator("body")).toHaveAttribute("data-screen", "tactical");
  expect((await savedMission(page)).jev).toEqual(saved.jev);
  await jev.click();
  await expect(first).not.toBeChecked();
  await expect(second).toBeChecked();
  await expect(third).not.toBeChecked();
  await cancel.click();
  await page.setViewportSize({ width: 800, height: 720 });
  await orders.click();
  await input.fill(prompt);
  await first.click();
  await third.click();
  await orders.scrollIntoViewIfNeeded();
  const bounds = (await orders.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(800);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(720);
  const squadBounds = (await squad.boundingBox())!;
  const cancelBounds = (await cancel.boundingBox())!;
  expect(cancelBounds.x + cancelBounds.width).toBeLessThanOrEqual(
    squadBounds.x + squadBounds.width,
  );
  await page.screenshot({ path: ".producer/jev/squad-orders-narrow.png" });
  await cancel.click();
  expect((await savedMission(page)).jev).toEqual(saved.jev);
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});
