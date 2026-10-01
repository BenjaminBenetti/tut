/**
 * Captures a defence's hold on the tracker (#1179): the last counted
 * wave lands through the real End Turn, the defence step starts the
 * hold, and the tracker counts it down under the defence's row
 * (`docs/design/defend-installation-hold.png`, the HUD, and
 * `docs/design/defend-installation-hold-tracker.png`, the panel). A
 * second panel shot moves the hold to its last turn, where the
 * countdown turns urgent (`defend-installation-hold-urgent.png`).
 *
 * The defence is staged as `e2e/defend-installation.spec.ts` stages it:
 * the first offer on the fixed seed is rewritten into a sensor-array
 * defence through the autosave. Then the mission is patched to two
 * waves landed of three with the third due this turn, so one End Turn
 * lands the last wave in its bug phase: the hold runs eight bug phases
 * from that one, so the next turn reads "Hold ends in 7 turns".
 *
 * ```
 *   vite --port 4255 --strictPort &
 *   CAPTURE_BASE_URL=http://localhost:4255 node tools/ui/capture-defence-hold.mjs
 * ```
 */
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";

const baseUrl = process.env.CAPTURE_BASE_URL ?? "http://localhost:4255";
const SAVE_KEY = "tut:save:autosave";
const MAX_DAYS = 20;

const browser = await chromium.launch({
  args: [
    "--use-angle=swiftshader",
    "--use-gl=angle",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1400, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const body = page.locator("body");

  /** Rewrites the autosave's state in place. */
  const patchSave = async (patch) => {
    const envelope = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)),
      SAVE_KEY,
    );
    await page.evaluate(
      ({ key, saved }) => localStorage.setItem(key, JSON.stringify(saved)),
      { key: SAVE_KEY, saved: { ...envelope, state: patch(envelope.state) } },
    );
  };

  /** Reloads and continues the autosave onto `screen`. */
  const resume = async (screen) => {
    await page.reload();
    await expect(body).toHaveAttribute("data-app-state", "ready");
    await page.locator('[data-action="continue"]').click();
    await expect(body).toHaveAttribute("data-screen", screen);
  };

  /** Waits for the tactical scene to draw and the phase banner to clear. */
  const settle = async () => {
    await expect(body).toHaveAttribute("data-tactical-ready", "true", {
      timeout: 60_000,
    });
    await expect
      .poll(
        async () => page.locator("#phase-banner").getAttribute("data-visible"),
        { timeout: 15_000 },
      )
      .not.toBe("true");
    await page.waitForTimeout(800);
  };

  // A new campaign, days advanced until the board offers a mission.
  await page.goto(baseUrl);
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-field="seed"]').fill("4242");
  await page.locator('[data-action="new-game"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");
  const rows = page.locator('[data-role="mission-list"] [data-mission-id]');
  const advance = page.locator('[data-action="advance-day"]');
  const choice = page.locator('[data-role="event-dialog"] [data-choice-id]');
  for (let day = 0; day < MAX_DAYS && (await rows.count()) === 0; day++) {
    if (await choice.first().isVisible()) await choice.first().click();
    await expect(advance).toBeEnabled();
    await advance.click();
  }
  await expect(rows.first()).toBeVisible();
  if (await choice.first().isVisible()) await choice.first().click();

  // The first offer becomes a three-wave sensor-array defence.
  const missionId = await rows.first().getAttribute("data-mission-id");
  await patchSave((state) => ({
    ...state,
    overworld: {
      ...state.overworld,
      missions: state.overworld.missions.map((mission) =>
        mission.id === missionId
          ? {
              ...mission,
              typeId: "defend-installation",
              defence: {
                installation: "sensor-array",
                deployableId: "staged-sensor-array",
                generators: 2,
                waves: 3,
              },
            }
          : mission,
      ),
    },
  }));
  await resume("overworld");
  await rows.first().click();
  await page
    .locator('[data-role="mission-details"] [data-action="plan-deployment"]')
    .click();
  await expect(body).toHaveAttribute("data-screen", "deployment");
  for (const box of await page
    .locator('[data-role="deployment-picker"] input[type="checkbox"]')
    .all()) {
    await box.check();
  }
  await page.locator('[data-action="launch"]').click();
  await expect(body).toHaveAttribute("data-screen", "tactical");
  await settle();

  // Two waves in, the last due in this turn's bug phase.
  await patchSave((state) => {
    const mission = state.activeMission;
    assert.ok(mission, "the defence is under way");
    return {
      ...state,
      activeMission: {
        ...mission,
        edgeSpawn: {
          ...mission.edgeSpawn,
          nextTurn: mission.turn,
          wave: 2,
          totalWaves: 3,
        },
      },
    };
  });
  await resume("tactical");
  await settle();

  // End Turn lands the last wave; the defence step starts the hold.
  await page.locator('#action-bar [data-action="end-turn"]').click();
  await expect(body).not.toHaveAttribute("data-phase-playing", "true", {
    timeout: 120_000,
  });
  await settle();
  const row = page.locator("[data-objective-id][data-status]");
  await expect(row).toHaveAttribute("data-status", "open");
  await expect(row.locator('[data-role="defence-progress"]')).toContainText(
    "wave 3 / 3",
  );
  const hold = row.locator('[data-role="hold"]');
  await expect(hold).toHaveText("Hold ends in 7 turns");
  await page.mouse.move(0, 0);
  await page.screenshot({ path: "docs/design/defend-installation-hold.png" });
  await page.locator("#objectives").screenshot({
    path: "docs/design/defend-installation-hold-tracker.png",
  });
  console.log(`hold: ${await hold.textContent()}`);

  // The hold's last turn: the countdown turns urgent.
  await patchSave((state) => {
    const mission = state.activeMission;
    return {
      ...state,
      activeMission: {
        ...mission,
        objectives: mission.objectives.map((objective) =>
          objective.kind === "defend-generators"
            ? { ...objective, holdUntilTurn: mission.turn + 1 }
            : objective,
        ),
      },
    };
  });
  await resume("tactical");
  await settle();
  await expect(hold).toHaveText("Hold ends at the end of this turn");
  await page.mouse.move(0, 0);
  await page.locator("#objectives").screenshot({
    path: "docs/design/defend-installation-hold-urgent.png",
  });
  console.log(`urgent: ${await hold.textContent()}`);
  assert.deepEqual(errors, [], "the page threw");
} finally {
  await browser.close();
}
