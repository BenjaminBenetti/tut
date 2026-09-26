/* global document, requestAnimationFrame */
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";

/**
 * Renders the briefing of an offer carrying sitreps, for the design docs
 * (#1179). A new game is started and played until an offer is on the
 * board, its autosave edited so the first offer carries the sitreps
 * (City Ablaze and Local Guides unless `CAPTURE_SITREPS` names others),
 * the game continued from that save, and the offer selected in the
 * mission list. With `CAPTURE_HUD` set, the offer is then started
 * through the dev hook and the mission's HUD shot too, to show what a
 * sitrep puts on it (campaign arc §11: Dust-off Window's countdown).
 * Run against a dev server:
 *
 *   pnpm exec vite --port 4213 --strictPort &
 *   CAPTURE_BASE_URL=http://localhost:4213 node tools/ui/capture-sitreps-briefing.mjs
 *
 *   CAPTURE_SITREPS=dust-off-window,swarm-tide \
 *   CAPTURE_NAME=sitreps-act2-briefing CAPTURE_HUD=sitrep-dustoff-hud \
 *   CAPTURE_BASE_URL=http://localhost:4213 node tools/ui/capture-sitreps-briefing.mjs
 *
 *   new game ──► offer on the board ──► autosave: offer.sitreps = SITREPS
 *     ──► continue ──► select the offer ──► <CAPTURE_NAME>.png
 *     └─ CAPTURE_HUD ──► __tut__.startTacticalMission ──► <CAPTURE_HUD>.png
 */
const baseUrl = process.env.CAPTURE_BASE_URL ?? "http://localhost:4213";
const output = process.env.CAPTURE_OUTPUT ?? "docs/design";
const SEED = "4242";
const SITREPS = (process.env.CAPTURE_SITREPS ?? "city-ablaze,local-guides")
  .split(",")
  .map((id) => id.trim())
  .filter((id) => id.length > 0);
const NAME = process.env.CAPTURE_NAME ?? "sitreps-briefing";
const HUD_NAME = process.env.CAPTURE_HUD;
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
  await expect(briefing.locator("[data-sitrep]")).toHaveCount(SITREPS.length);
  await expect(row.locator('[data-field="sitreps"] [data-sitrep]')).toHaveCount(
    SITREPS.length,
  );
  await settle(page);
  await page.screenshot({
    path: `${output}/${NAME}.png`,
    animations: "disabled",
  });
  assert.deepEqual(errors, []);
  console.log("captured", `${output}/${NAME}.png`);

  if (HUD_NAME !== undefined) {
    // The mission as its first player phase opens: a HUD needs the
    // width, not the height, the briefing wanted.
    await page.setViewportSize({ width: 1400, height: 900 });
    const refused = await page.evaluate(
      (id) => globalThis.__tut__?.startTacticalMission(id),
      missionId,
    );
    assert.equal(refused, undefined, "the offer must start");
    await expect(page.locator("body")).toHaveAttribute(
      "data-screen",
      "tactical",
    );
    await page.locator("#tactical-viewport canvas").waitFor();
    await expect(
      page.locator('[data-sitrep-id] [data-role="deadline"]').first(),
    ).toBeVisible();
    await expect(page.locator('[data-field="deadline"]')).toBeVisible();
    // Models load and the camera settles.
    await page.waitForTimeout(2500);
    await settle(page);
    await page.screenshot({
      path: `${output}/${HUD_NAME}.png`,
      animations: "disabled",
    });
    assert.deepEqual(errors, []);
    console.log("captured", `${output}/${HUD_NAME}.png`);
  }
} finally {
  await browser.close();
}
