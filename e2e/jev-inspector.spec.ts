import { test, expect, type Page } from "@playwright/test";
import { drawnFrame } from "./capture-frame.helper";
import { launchMission } from "./mission-capture.helper";
import { CITY_MISSION_FIXTURE } from "./fixtures/mission-maps";
import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";
import type { JevRequest } from "../src/tactical/model/jev-control";
import type { GameState } from "../src/save/model/game-state";
import type { SaveEnvelope } from "../src/save/model/save-envelope";

/** Two fixed world points detect both camera zoom and pan without relying on animated units. */
async function cameraProjection(page: Page) {
  return page.evaluate(() => {
    const save = JSON.parse(
      localStorage.getItem("tut:save:autosave")!,
    ) as SaveEnvelope<GameState>;
    return save.state
      .activeMission!.units.filter((unit) => unit.team === "tdf")
      .slice(0, 2)
      .map((unit) => window.__tutTactical__!.tileScreenPosition(unit.pos));
  });
}

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
    const ids = Object.keys(request.questions.action?.criteria ?? {});
    const choice = ids.includes("move") ? "move" : ids[0];
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
        answers: request.questions.distance
          ? {
              distance: {
                type: "score",
                score: 3.3,
                confidence: 0.8,
                probabilities: { "0": 0, "1": 0, "2": 0, "3": 0.7, "4": 0.3 },
              },
            }
          : {
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
    .toBe("ready");
  expect(requests).toHaveLength(1);
  await expect(page.getByTestId("jev-next-step")).toBeEnabled();
  expect(
    JSON.parse(await page.getByTestId("jev-questions").inputValue()),
  ).toEqual(requests[0].questions);
  expect(
    JSON.parse(await page.getByTestId("jev-output").inputValue()),
  ).toMatchObject({
    step: 1,
    exchange: { stage: "action-type", answer: { choice: "move" } },
  });
  // Each click sends exactly one request; the next question can be inspected before sending it.
  for (let index = 0; index < 7; index++) {
    const output = JSON.parse(
      await page.getByTestId("jev-output").inputValue(),
    ) as { status: string };
    if (output.status === "evaluated") break;
    expect(output.status).toBe("ready");
    const count = requests.length;
    await page.getByTestId("jev-step").selectOption(String(count));
    const nextQuestions = JSON.parse(
      await page.getByTestId("jev-questions").inputValue(),
    ) as unknown;
    expect(
      JSON.parse(await page.getByTestId("jev-output").inputValue()),
    ).toMatchObject({
      exchange: { status: "not sent" },
    });
    expect(requests).toHaveLength(count);
    await page.getByTestId("jev-next-step").click();
    await expect
      .poll(
        async () =>
          (
            JSON.parse(await page.getByTestId("jev-output").inputValue()) as {
              status: string;
            }
          ).status,
      )
      .not.toBe("running");
    expect(requests).toHaveLength(count + 1);
    expect(requests.at(-1)!.questions).toEqual(nextQuestions);
  }
  await expect(page.getByTestId("jev-next-step")).toBeDisabled();
  expect(
    JSON.parse(await page.getByTestId("jev-output").inputValue()),
  ).toMatchObject({ status: "evaluated" });
  expect(requests[0]?.state.entity_prompt).toBe(
    "Preserve yourself and stay in cover.",
  );
  expect(requests[0]?.state.commander_prompt).toBe("Hold the extraction zone.");
  expect(requests[0]?.state).not.toHaveProperty("navigation");
  expect(requests[0]?.state.capabilities).toBeDefined();
  expect(requests[0]?.questions.action!.criteria).toHaveProperty("move");
  // The starter mech's ground-fire options name its actual weapons, not a shared attack bucket.
  const top = requests[0].questions.action!.criteria;
  expect(top).not.toHaveProperty("attack-ground");
  expect(top).not.toHaveProperty("equipment");
  expect(top).not.toHaveProperty("finish");
  expect(JSON.stringify(top)).toContain("Autocannon");
  expect(JSON.stringify(top)).toContain("Missile Pod");
  expect(
    Object.keys(requests[0].questions.action!.criteria).some((id) =>
      id.startsWith("action-"),
    ),
  ).toBe(false);
  expect(requests).toHaveLength(3);
  expect(requests[1].questions.action!.instructions).toContain(
    "short move does not save any AP",
  );
  expect(
    Object.keys(requests[1].questions.action!.criteria).some((id) =>
      id.startsWith("move_"),
    ),
  ).toBe(true);
  expect(requests[2].questions.distance).toMatchObject({
    type: "score",
    criteria: expect.any(Array),
  });
  expect(requests[2].state.selected_movement).toMatchObject({
    ap_cost: 1,
    proposed_endpoint: expect.any(Object),
  });
  expect(
    JSON.parse(await page.getByTestId("jev-output").inputValue()),
  ).toMatchObject({
    exchange: { stage: "movement-distance", answer: { score: 3.3 } },
    chosen_action: { command: { type: "tactical:move" } },
  });
  // Completed requests remain individually reviewable with their matching response.
  await page.getByTestId("jev-step").selectOption("0");
  expect(
    JSON.parse(await page.getByTestId("jev-questions").inputValue()),
  ).toEqual(requests[0].questions);
  expect(
    JSON.parse(await page.getByTestId("jev-output").inputValue()),
  ).toMatchObject({
    exchange: { stage: "action-type", answer: { choice: "move" } },
  });
  await page.getByTestId("jev-step").selectOption(String(requests.length - 1));
  const campaign = (JSON.parse(before!) as SaveEnvelope<GameState>).state;
  const observation = requests[0].state;
  const entities = [observation.actor, ...(observation.entities as unknown[])];
  for (const unit of campaign.activeMission!.units.filter(
    (unit) => unit.team === "tdf",
  )) {
    const rosterEntry = [
      ...campaign.roster.squads,
      ...campaign.roster.mechs,
    ].find((entry) => entry.id === unit.sourceId);
    expect(rosterEntry).toBeDefined();
    expect(entities).toContainEqual(
      expect.objectContaining({ id: unit.id, name: rosterEntry!.name }),
    );
  }
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
  const beforeRerun = requests.length;
  await page.getByRole("button", { name: "Re-run captured state" }).click();
  await expect(page.getByTestId("jev-state")).toHaveValue(/Advance cautiously/);
  await expect
    .poll(
      async () =>
        (
          JSON.parse(await page.getByTestId("jev-output").inputValue()) as {
            status: string;
          }
        ).status,
    )
    .toBe("ready");
  expect(requests).toHaveLength(beforeRerun + 1);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  expect((await download).suggestedFilename()).toBe("jev-unit-1.json");
  await page.screenshot({ path: "test-results/jev-inspector.png" });

  // Native scrolling must work in every pane without reaching the camera.
  for (const id of ["jev-entity-prompt", "jev-commander-prompt"])
    await page
      .getByTestId(id)
      .fill("Hold position and preserve cover.\n".repeat(60));
  await drawnFrame(page);
  const camera = await cameraProjection(page);
  expect(camera.every((point) => point !== undefined)).toBe(true);
  for (const id of [
    "jev-state",
    "jev-questions",
    "jev-output",
    "jev-entity-prompt",
    "jev-commander-prompt",
  ]) {
    const area = page.getByTestId(id);
    await area.evaluate((element) => {
      element.scrollTop = 0;
    });
    await area.hover();
    await page.mouse.wheel(0, 300);
    await expect
      .poll(() => area.evaluate((element) => element.scrollTop), {
        message: `${id} should scroll its own content`,
      })
      .toBeGreaterThan(0);
    await drawnFrame(page);
    expect(await cameraProjection(page)).toEqual(camera);

    // Scrolling beyond a textarea's end must stay inside the inspector too.
    await area.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const panelTop = await page
      .getByTestId("jev-inspector")
      .evaluate((element) => element.scrollTop);
    await page.mouse.wheel(0, 300);
    await drawnFrame(page);
    expect(await cameraProjection(page)).toEqual(camera);
    expect(
      await page
        .getByTestId("jev-inspector")
        .evaluate((element) => element.scrollTop),
    ).toBe(panelTop);
  }
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.locator("#tactical-viewport canvas").hover();
  await page.mouse.wheel(0, -200);
  await expect.poll(() => cameraProjection(page)).not.toEqual(camera);
  expect(errors).toEqual([]);
});

/** The autosave is authoritative while the scene finishes playing the preceding commands. */
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

test("Jev TDF labels persist, Tab skips them, and End Turn waits for their decisions", async ({
  page,
}) => {
  test.setTimeout(90_000);
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
    const ids = Object.keys(request.questions.action!.criteria);
    const choice = ids.includes("overwatch") ? "overwatch" : ids[0];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers,
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
      }),
    });
  });
  await launchMission(page, "4242", CITY_MISSION_FIXTURE);
  await page
    .locator('[data-role="squad-list"] [data-unit-id="unit-1"]')
    .click();
  await page.getByTestId("jev-toggle").click();
  await page.getByTestId("jev-enabled").check();
  await page.getByTestId("jev-save").click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const label = page.locator(
    '.tut-status-chip[data-unit-id="unit-1"] [data-field="jev-label"]',
  );
  await expect(label).toBeVisible();
  await expect(label).toHaveText("Jev");
  await expect(label).toHaveCSS("color", "rgb(142, 216, 255)");
  await page.screenshot({ path: "test-results/jev-control-label.png" });
  for (let index = 0; index < 6; index++) {
    await page.keyboard.press("Tab");
    await expect(page.locator("body")).not.toHaveAttribute(
      "data-selected-unit",
      "unit-1",
    );
  }
  expect(requests).toHaveLength(0);
  const before = await savedMission(page);
  const end = page.locator('[data-action="end-turn"]');
  await end.click();
  await expect.poll(() => requests.length).toBe(1);
  await expect(end).toBeDisabled();
  expect(await savedMission(page)).toMatchObject({
    turn: before.turn,
    phase: "player",
    jev: { activation: { endTurnRequested: true } },
  });
  release();
  await expect
    .poll(async () => (await savedMission(page)).turn, { timeout: 20_000 })
    .toBe(before.turn + 1);
  expect(requests).toHaveLength(1);
  expect((await savedMission(page)).jev?.decisions).toHaveLength(1);
});
