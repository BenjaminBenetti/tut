/* global document, requestAnimationFrame, window */
/**
 * Captures Act III's first story beat (#1179): the offer board the day
 * Act III opens, Uplink pinned with its briefing open
 * (`docs/design/uplink-offer.png`), the briefing itself
 * (`docs/design/uplink-briefing.png`), and the tech web the day after
 * Uplink is won, Platform Approach revealed and selected
 * (`docs/design/platform-approach-node.png`).
 *
 * The campaign is advanced in Node through the shipped composition root
 * (`composeGame` + `AdvanceDay`), then handed to the page as its
 * autosave and continued.
 *
 * ```
 *   vite --port 4231 --strictPort &
 *   CAPTURE_BASE_URL=http://localhost:4231 node tools/ui/capture-uplink.mjs
 * ```
 */
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const baseUrl = process.env.CAPTURE_BASE_URL ?? "http://localhost:4231";
const SEED = 1179;
const NOW = "2026-09-26T00:00:00.000Z";
const SAVE_KEY = "tut:save:autosave";
const PLATFORM_APPROACH = "tech.platform-approach";

// Load only simulation modules here; the browser renders the application.
const loader = await createServer({
  configFile: false,
  server: { middlewareMode: true, watch: null, hmr: false },
  appType: "custom",
});
const browser = await chromium.launch({
  args: [
    "--use-angle=swiftshader",
    "--use-gl=angle",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const [{ composeGame }, { MemoryKeyValueStore }, { advanceDay }] =
    await Promise.all([
      loader.ssrLoadModule("/src/app/service/game-composition.ts"),
      loader.ssrLoadModule("/src/save/repository/memory-key-value-store.ts"),
      loader.ssrLoadModule("/src/overworld/model/advance-day-command.ts"),
    ]);

  /** A Node-side game holding `state`, advanced until `until` holds. */
  const advance = (state, until, maxDays = 40) => {
    const game = composeGame({
      storage: new MemoryKeyValueStore(),
      clock: { now: () => NOW },
      newSeed: () => SEED,
      onAutosaveFailure: (error) => {
        throw new Error(`autosave failed: ${error.kind}`);
      },
    });
    game.session.start(state);
    for (let day = 0; day < maxDays; day++) {
      const result = game.session.store.dispatch(advanceDay());
      assert.ok(result.ok, "the day must advance");
      if (until(game.session.state)) return game.session.state;
    }
    throw new Error("the board never showed what the capture needs");
  };

  const viewport = { width: 1440, height: 1280 };
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(baseUrl);
  await expect(page.locator("body")).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-field="seed"]').fill(String(SEED));
  await page.locator('[data-action="new-game"]').click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-screen",
    "overworld",
  );
  const base = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    SAVE_KEY,
  );

  /** Waits two frames after the fonts, so a screenshot shows a settled page. */
  const settle = () =>
    page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });

  /** Hands `state` to the page as its autosave and continues to the board. */
  const load = async (state) => {
    await page.evaluate(
      ({ key, save }) => localStorage.setItem(key, JSON.stringify(save)),
      { key: SAVE_KEY, save: { ...base, state } },
    );
    await page.reload();
    await expect(page.locator("body")).toHaveAttribute(
      "data-app-state",
      "ready",
    );
    await page.locator('[data-action="continue"]').click();
    await expect(page.locator("body")).toHaveAttribute(
      "data-screen",
      "overworld",
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-map-ready",
      "true",
    );
    // A day's event waits for an answer before the board takes clicks.
    const dialog = page.locator('[data-role="event-dialog"]');
    for (let answered = 0; await dialog.isVisible(); answered++) {
      assert.ok(answered < 10, "the events never stop");
      const eventId = await dialog.getAttribute("data-event-id");
      await dialog.locator("[data-choice-id]").first().click();
      await expect(dialog).not.toHaveAttribute("data-event-id", eventId);
    }
  };

  // The day Act III opens: Uplink pinned at the quietest detected city.
  const actThree = advance(
    {
      ...base.state,
      overworld: {
        ...base.state.overworld,
        progress: {
          ...base.state.overworld.progress,
          act: "act-3",
          actStartedAt: base.state.overworld.day,
          missionsPlayed: 30,
          storyWon: ["first-skyfall", "live-specimen", "intact-pod"],
          flags: ["spore-sample", "capture-net"],
        },
      },
    },
    (state) => state.overworld.missions.some((m) => m.storyId === "uplink"),
  );
  const uplink = actThree.overworld.missions.find(
    (m) => m.storyId === "uplink",
  );
  await load(actThree);
  await page
    .locator(`.tut-missions__row[data-mission-id="${uplink.id}"]`)
    .click();
  const details = page.locator(
    `[data-role="mission-details"][data-mission-id="${uplink.id}"]`,
  );
  await expect(details).toBeVisible();
  await expect(
    page.locator(
      `.tut-missions__row[data-mission-id="${uplink.id}"] [data-field="story"]`,
    ),
  ).toHaveText("Story · Uplink");
  await expect(page.locator('[data-field="briefing-heading"]')).toHaveText(
    "Briefing · Uplink",
  );
  // The story's own line and rows, ahead of the defence's (#1179).
  await expect(details.locator('[data-field="description"]')).toContainText(
    "Keep the tracking array powered",
  );
  await expect(
    details.locator('[data-field="detail-story-objective"]'),
  ).toHaveText("Hold the tracking array through 5 waves");
  await expect(details.locator('[data-field="detail-story-win"]')).toHaveText(
    "The platform's beacons are revealed",
  );
  await expect(
    details.locator('[data-field="detail-story-lost"]'),
  ).toBeHidden();
  await expect(details.locator('[data-field="detail-story-kit"]')).toBeHidden();
  await settle();
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: "docs/design/uplink-offer.png",
    animations: "disabled",
  });
  console.log("captured docs/design/uplink-offer.png");
  await details.screenshot({
    path: "docs/design/uplink-briefing.png",
    animations: "disabled",
  });
  console.log("captured docs/design/uplink-briefing.png");
  const briefing = await details.innerText();

  // The day after Uplink is won: Platform Approach revealed on the web.
  const won = {
    ...actThree,
    economy: { ...actThree.economy, techPoints: 300 },
    // Intel I was researched on the way here: the support spoke shows it.
    tech: {
      unlocked: [...actThree.tech.unlocked, "tech.pheromone-analysis"],
    },
    overworld: {
      ...actThree.overworld,
      missions: actThree.overworld.missions.filter((m) => m !== uplink),
      progress: {
        ...actThree.overworld.progress,
        storyWon: [...actThree.overworld.progress.storyWon, "uplink"],
        flags: [...actThree.overworld.progress.flags, "uplink-won"],
      },
    },
  };
  await load(won);
  await page.locator('#top-bar [data-action="tech-tree"]').click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-screen",
    "tech-tree",
  );
  await expect(
    page.locator('[data-role="tech-graph"][data-tech-models-ready="true"]'),
  ).toBeVisible({ timeout: 60_000 });
  await page.evaluate((id) => {
    window.__tutTech__?.focus(id);
    window.__tutTech__?.select(id);
  }, PLATFORM_APPROACH);
  await expect(
    page.locator(
      `#tech-tree-detail[data-selected-node="${PLATFORM_APPROACH}"]`,
    ),
  ).toBeVisible();
  await settle();
  await page.waitForTimeout(500);
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: "docs/design/platform-approach-node.png",
    animations: "disabled",
  });
  console.log("captured docs/design/platform-approach-node.png");
  const detail = await page.locator("#tech-tree-detail").innerText();
  console.log(
    JSON.stringify({
      uplink: {
        day: actThree.overworld.day,
        cityId: uplink.cityId,
        difficulty: uplink.difficulty,
        defence: uplink.defence,
      },
      briefing,
      detail,
    }),
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await loader.close();
}
