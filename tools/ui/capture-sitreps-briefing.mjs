/* global document, requestAnimationFrame */
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";

/**
 * Renders the briefing of an offer carrying two sitreps, one of them
 * helping the player, for the design docs (#1179). A new game is
 * started and played until an offer is on the board, its autosave
 * edited so the first offer carries City Ablaze
 * and Local Guides, the game continued from that save, and the offer
 * selected in the mission list. Run against a dev server:
 *
 *   pnpm exec vite --port 4213 --strictPort &
 *   CAPTURE_BASE_URL=http://localhost:4213 node tools/ui/capture-sitreps-briefing.mjs
 */
const baseUrl = process.env.CAPTURE_BASE_URL ?? "http://localhost:4213";
const output = process.env.CAPTURE_OUTPUT ?? "docs/design";
const SEED = "4242";
const SITREPS = ["city-ablaze", "local-guides"];
mkdirSync(output, { recursive: true });

const browser = await chromium.launch({
  args: [
    "--use-angle=swiftshader",
    "--use-gl=angle",
    "--enable-unsafe-swiftshader",
  ],
});

/** Waits for two frames after fonts. */
async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
}

try {
  const page = await browser.newPage({
    // Tall enough that the side panel shows the row and the whole
    // briefing without scrolling.
    viewport: { width: 1280, height: 1180 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto(baseUrl);
  await expect(page.locator("body")).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-field="seed"]').fill(SEED);
  await page.locator('[data-action="new-game"]').click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-screen",
    "overworld",
  );
  await expect(page.locator("body")).toHaveAttribute("data-map-ready", "true");

  // Days pass until the director has an offer on the board; an event
  // that asks for a choice is answered with its first.
  const rows = page.locator('[data-action="select-mission"]');
  for (let day = 0; day < 10 && (await rows.count()) === 0; day++) {
    const choice = page.locator('[data-role="event-dialog"] [data-choice-id]');
    if ((await choice.count()) > 0) {
      await choice.first().click();
      continue;
    }
    await page.locator('[data-action="advance-day"]').click();
    await settle(page);
  }
  assert.ok((await rows.count()) > 0, "an offer must reach the board");

  // Put the sitreps on the first offer in the autosave, then continue it.
  const missionId = await page.evaluate((sitreps) => {
    const key = Object.keys(localStorage).find((k) =>
      k.startsWith("tut:save:"),
    );
    if (key === undefined) return undefined;
    const envelope = JSON.parse(localStorage.getItem(key));
    const mission = envelope.state.overworld.missions[0];
    if (mission === undefined) return undefined;
    mission.sitreps = sitreps;
    localStorage.setItem(key, JSON.stringify(envelope));
    return mission.id;
  }, SITREPS);
  assert.ok(missionId, "the new game must autosave an offer");
  await page.reload();
  await expect(page.locator("body")).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-action="continue"]').click();
  await expect(page.locator("body")).toHaveAttribute("data-map-ready", "true");

  const row = page.locator(
    `[data-action="select-mission"][data-mission-id="${missionId}"]`,
  );
  await row.click();
  const briefing = page.locator('[data-role="mission-details"]');
  await expect(briefing).toHaveAttribute("data-mission-id", missionId);
  await expect(briefing.locator("[data-sitrep]")).toHaveCount(2);
  await expect(row.locator('[data-field="sitreps"] [data-sitrep]')).toHaveCount(
    2,
  );
  await settle(page);
  await page.screenshot({
    path: `${output}/sitreps-briefing.png`,
    animations: "disabled",
  });
  assert.deepEqual(errors, []);
  console.log("captured", `${output}/sitreps-briefing.png`);
} finally {
  await browser.close();
}
