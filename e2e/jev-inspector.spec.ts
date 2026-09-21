import { test, expect } from "@playwright/test";
import { launchMission } from "./mission-capture.helper";
import { CITY_MISSION_FIXTURE } from "./fixtures/mission-maps";
import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";
import type { JevRequest } from "../src/tactical/model/jev-control";

test("Jev menu evaluates exact state and questions without acting, and exports observable responses", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const requests: JevRequest[] = [];
  await page.route("http://localhost:8080/v1/systemone", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
      });
      return;
    }
    const request = route.request().postDataJSON() as JevRequest;
    requests.push(request);
    const ids = Object.keys(request.questions.action.criteria);
    const choice = ids.includes("finish") ? "finish" : ids[0];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "X-Request-ID",
        "X-Request-ID": "browser-test",
      },
      body: JSON.stringify({
        model: "jev-test",
        answers: {
          action: {
            type: "choice",
            choice,
            confidence: 1,
            probabilities: Object.fromEntries(
              ids.map((id) => [id, id === choice ? 1 : 0]),
            ),
          },
        },
        usage: { input_tokens: 321, output_tokens: 12 },
      }),
    });
  });
  await launchMission(page, "4242", CITY_MISSION_FIXTURE);
  await expect(page.getByTestId("jev-toggle")).toBeDisabled();
  await page.evaluate(() =>
    (
      globalThis as typeof globalThis & { __tutTactical__?: TacticalTestHooks }
    ).__tutTactical__?.selectUnit("unit-1"),
  );
  await page.getByTestId("jev-toggle").click();
  await expect(page.getByTestId("jev-inspector")).toBeVisible();
  await expect(page.getByTestId("jev-enabled")).not.toBeChecked();
  const before = await page.evaluate(() =>
    localStorage.getItem("tut:save:autosave"),
  );
  await page
    .getByTestId("jev-entity-prompt")
    .fill("Preserve yourself and stay in cover.");
  await page
    .getByTestId("jev-commander-prompt")
    .fill("Hold the extraction zone.");
  await page.getByTestId("jev-evaluate").click();
  await expect
    .poll(async () => {
      const value = await page.getByTestId("jev-output").inputValue();
      return value.startsWith("{")
        ? (JSON.parse(value) as { status: string }).status
        : "waiting";
    })
    .toBe("evaluated");
  expect(requests[0]?.state.entity_prompt).toBe(
    "Preserve yourself and stay in cover.",
  );
  expect(requests[0]?.state.commander_prompt).toBe("Hold the extraction zone.");
  const shownState = JSON.parse(
    await page.getByTestId("jev-state").inputValue(),
  ) as unknown;
  expect(shownState).toEqual(requests.at(-1)?.state);
  expect(
    JSON.parse(await page.getByTestId("jev-questions").inputValue()),
  ).toEqual(requests.at(-1)?.questions);
  await expect(page.getByTestId("jev-output")).toHaveValue(/browser-test/);
  expect(
    await page.evaluate(() => localStorage.getItem("tut:save:autosave")),
  ).toBe(before);
  await page.getByTestId("jev-entity-prompt").fill("Advance cautiously.");
  await page.getByRole("button", { name: "Re-run captured state" }).click();
  await expect(page.getByTestId("jev-output")).toHaveValue(
    /Advance cautiously/,
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  expect((await download).suggestedFilename()).toBe("jev-unit-1.json");
  await page.screenshot({ path: "test-results/jev-inspector.png" });
  expect(errors).toEqual([]);
});
