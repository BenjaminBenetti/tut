import { test, expect, type Page } from "@playwright/test";
import { launchMission } from "./mission-capture.helper";
import { CITY_MISSION_FIXTURE } from "./fixtures/mission-maps";
import type { GameState } from "../src/save/model/game-state";
import type { SaveEnvelope } from "../src/save/model/save-envelope";
import { drawnFrame } from "./capture-frame.helper";

/** Read saved settings so the checks cover the command and persistence pipeline. */
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

/** Track world points to detect accidental camera rotation or zoom while editing. */
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

test("compact squad rows select units whose card controls Jev and independent orders", async ({
  page,
}) => {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("http://localhost:8080/v1/systemone", async (route) => {
    requests.push(route.request().method());
    await route.abort();
  });
  await launchMission(page, "4242", CITY_MISSION_FIXTURE);
  const rows = page.locator('[data-role="squad-list"] li');
  const row = rows.first();
  const secondRow = rows.nth(1);
  const id = (await row.getAttribute("data-unit-id"))!;
  const secondId = (await secondRow.getAttribute("data-unit-id"))!;
  const card = page.locator("#unit-card");
  const toggle = card.getByTestId("unit-jev-toggle");
  const flag = card.getByTestId("entity-command-toggle");
  await expect(rows.locator("button")).toHaveCount(0);
  await expect(toggle).toBeHidden();
  await row.click();
  await drawnFrame(page);
  const rowBounds = (await row.boundingBox())!;
  expect(rowBounds.height).toBeLessThan(48);
  const aligned = await row.evaluate((element) =>
    [...element.children].map((child) => {
      const bounds = child.getBoundingClientRect();
      return bounds.y + bounds.height / 2;
    }),
  );
  expect(Math.max(...aligned) - Math.min(...aligned)).toBeLessThan(2);
  await expect(
    card.locator(".tut-panel__title").first().getByTestId("unit-jev-toggle"),
  ).toBeVisible();
  const panel = page.locator(
    '[data-testid="entity-orders-popover"]:not([hidden])',
  );
  const input = panel.getByRole("textbox", {
    name: "Unit orders",
    exact: true,
  });
  const original = await savedMission(page);
  const camera = await cameraProjection(page);
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(flag).toHaveText("");
  await flag.click();
  await expect(input).toBeFocused();
  await input.fill(
    Array.from(
      { length: 80 },
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
  expect((await savedMission(page)).commandSeq).toBe(original.commandSeq);
  await input.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(flag).toBeFocused();
  await flag.click();
  await expect(input).toHaveValue("");
  const orders =
    "Follow Alpha. Cover the medic and keep your distance from enemies.";
  await input.fill(orders);
  await panel.getByRole("button", { name: "Apply orders" }).click();
  await expect
    .poll(async () => (await savedMission(page)).jev?.entities[id])
    .toEqual({ enabled: false, entityPrompt: orders });

  await page.getByTestId("command-toggle").click();
  await page.getByTestId("commander-orders-input").fill("Protect the force");
  await page
    .getByTestId("commander-popover")
    .getByRole("button", { name: "Apply orders" })
    .click();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toHaveCSS("color", "rgb(142, 216, 255)");
  expect((await savedMission(page)).jev?.entities[id]).toEqual({
    enabled: true,
    entityPrompt: orders,
  });
  await flag.click();
  await expect(input).toHaveValue(orders);
  await input.fill("Discard this draft");
  await page.evaluate((id) => window.__tutTactical__!.selectUnit(id), secondId);
  await expect(panel).toHaveCount(0);
  await flag.click();
  await expect(panel).toHaveCount(1);
  await expect(input).toHaveValue("");
  await input.fill("Guard extraction");
  await panel.getByRole("button", { name: "Apply orders" }).click();
  expect((await savedMission(page)).jev?.entities[secondId]).toEqual({
    enabled: false,
    entityPrompt: "Guard extraction",
  });
  await page.evaluate((id) => window.__tutTactical__!.selectUnit(id), id);
  await flag.click();
  await expect(input).toHaveValue(orders);
  await panel.getByRole("button", { name: "Cancel" }).click();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect((await savedMission(page)).jev?.entities[id]?.entityPrompt).toBe(
    orders,
  );
  await toggle.click();
  const saved = await savedMission(page);
  expect(saved.units).toEqual(original.units);
  expect(saved.jev?.commanders).toEqual({ tdf: "Protect the force", bugs: "" });
  expect(await cameraProjection(page)).toEqual(camera);
  await expect(row).toHaveAttribute("data-selected", "true");
  await flag.click();
  await page.screenshot({ path: "docs/design/jev-unit-orders.png" });
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  await expect(page.locator("body")).toHaveAttribute("data-screen", "tactical");
  await expect(toggle).toBeHidden();
  await row.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await flag.click();
  await expect(input).toHaveValue(orders);
  await page.setViewportSize({ width: 800, height: 720 });
  // Browser resize listeners run on the next rendering step, after setViewportSize returns.
  await expect
    .poll(async () => {
      const bounds = (await panel.boundingBox())!;
      return bounds.x + bounds.width;
    })
    .toBeLessThanOrEqual(800);
  const bounds = await panel.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(800);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(720);
  await page.locator('[data-field="mission-name"]').click();
  await expect(panel).toHaveCount(0);
  await toggle.click();
  await expect
    .poll(async () => (await savedMission(page)).jev?.entities[id]?.enabled)
    .toBe(false);
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});
