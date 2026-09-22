import { test, expect, type Page } from "@playwright/test";
import { launchMission } from "./mission-capture.helper";
import { CITY_MISSION_FIXTURE } from "./fixtures/mission-maps";
import type { GameState } from "../src/save/model/game-state";
import type { SaveEnvelope } from "../src/save/model/save-envelope";

/** Read persisted mission state rather than animation timing or presentation labels. */
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

/** Track camera zoom and pan against the same stationary world points. */
async function cameraProjection(page: Page) {
  const mission = await savedMission(page);
  return page.evaluate(
    (positions) =>
      positions.map((pos) => window.__tutTactical__!.tileScreenPosition(pos)),
    mission.units
      .filter((unit) => unit.team === "tdf")
      .slice(0, 2)
      .map((unit) => unit.pos),
  );
}

test("top-center Command edits shared TDF orders, isolates input and survives a reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await launchMission(page, "4242", CITY_MISSION_FIXTURE);
  const toggle = page.getByRole("button", { name: "Command", exact: true });
  const panel = page.getByRole("dialog", { name: "TDF command", exact: true });
  const input = page.getByRole("textbox", {
    name: "Commander orders",
    exact: true,
  });
  await expect(toggle).toBeEnabled();
  await expect(page.getByTestId("jev-toggle")).toBeDisabled();
  const bounds = await toggle.boundingBox();
  const bar = await page.locator("#turn-banner").boundingBox();
  expect(
    Math.abs(bounds!.x + bounds!.width / 2 - page.viewportSize()!.width / 2),
  ).toBeLessThan(1);
  expect(bounds!.y).toBeGreaterThanOrEqual(bar!.y);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(bar!.y + bar!.height);
  const original = await savedMission(page);
  await toggle.click();
  await expect(panel).toBeVisible();
  await expect(input).toBeFocused();
  await input.fill(
    Array.from(
      { length: 80 },
      (_, i) => `Order ${String(i)}: hold position.`,
    ).join("\n"),
  );
  const camera = await cameraProjection(page);
  await input.hover();
  await page.mouse.wheel(0, 300);
  await expect
    .poll(() => input.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  expect(await cameraProjection(page)).toEqual(camera);
  await input.press("Enter");
  await input.press("q");
  expect(await cameraProjection(page)).toEqual(camera);
  expect((await savedMission(page)).commandSeq).toBe(original.commandSeq);
  await input.press("Escape");
  await expect(panel).toBeHidden();
  await expect(toggle).toBeFocused();
  await toggle.click();
  await expect(input).toHaveValue("");
  const orders = "Follow Alpha. Stay together and protect the objective.";
  await input.fill(orders);
  await panel.getByRole("button", { name: "Apply orders" }).click();
  await expect(panel).toBeHidden();
  await expect
    .poll(async () => (await savedMission(page)).jev?.commanders.tdf)
    .toBe(orders);
  const saved = await savedMission(page);
  expect(saved.units).toEqual(original.units);
  expect(saved.jev?.entities).toEqual({});
  expect(saved.jev?.commanders.bugs).toBe("");
  await toggle.click();
  await expect(input).toHaveValue(orders);
  await input.fill("Discard these edits");
  await panel.getByRole("button", { name: "Cancel" }).click();
  await toggle.click();
  await expect(input).toHaveValue(orders);
  await page.locator('[data-field="mission-name"]').click();
  await expect(panel).toBeHidden();
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  await expect(page.locator("body")).toHaveAttribute("data-screen", "tactical");
  await toggle.click();
  await expect(input).toHaveValue(orders);
  await page.screenshot({ path: "docs/design/jev-command.png" });
  await page.setViewportSize({ width: 800, height: 720 });
  const narrowButton = await toggle.boundingBox();
  const narrowPanel = await panel.boundingBox();
  expect(
    Math.abs(narrowButton!.x + narrowButton!.width / 2 - 400),
  ).toBeLessThan(1);
  expect(narrowPanel!.x).toBeGreaterThanOrEqual(0);
  expect(narrowPanel!.x + narrowPanel!.width).toBeLessThanOrEqual(800);
  await input.fill("");
  await panel.getByRole("button", { name: "Apply orders" }).click();
  await expect
    .poll(async () => (await savedMission(page)).jev?.commanders.tdf)
    .toBe("");
  expect(errors).toEqual([]);
});
