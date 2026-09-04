import { expect, test } from "@playwright/test";

import type { TutTestHooks } from "../src/app/model/test-hooks";
import { MAP_READY_ATTRIBUTE } from "../src/ui/model/map-viewport-host";

/** The page's global object as seen from `page.evaluate`, with the dev hooks. */
interface HookGlobal {
  __tut__?: TutTestHooks;
}

test("renders the overworld map into #map-viewport and selects cities", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-app-state", "ready");
  await expect(page.locator("#map-viewport canvas")).toBeVisible();

  // The selected-city label lives on the overworld panel; start a campaign to show it.
  await page.locator('[data-action="new-game"]').click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-screen",
    "overworld",
  );
  await expect(page.locator("body")).toHaveAttribute(
    MAP_READY_ATTRIBUTE,
    "true",
  );

  // The dev-only hook selects a city without pointer input.
  await page.evaluate(() =>
    (globalThis as HookGlobal).__tut__?.selectCity("new-york"),
  );
  await expect(page.locator("body")).toHaveAttribute(
    "data-selected-city",
    "new-york",
  );
  await expect(page.locator("#selected-city")).toHaveText("New York");

  // A real click on the projected marker goes through raycast picking.
  const position = await page.evaluate(() =>
    (globalThis as HookGlobal).__tut__?.cityScreenPosition("london"),
  );
  expect(position).toBeDefined();
  if (!position) {
    throw new Error("unreachable");
  }
  await page.mouse.click(position.x, position.y);
  await expect(page.locator("body")).toHaveAttribute(
    "data-selected-city",
    "london",
  );
  await expect(page.locator("#selected-city")).toHaveText("London");

  expect(errors).toEqual([]);
});
