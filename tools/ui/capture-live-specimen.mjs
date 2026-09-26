/* global document, requestAnimationFrame */
/**
 * Captures Live Specimen on the overworld (#1179): the offer board the
 * day after Pheromone Analysis, Live Specimen pinned with its briefing
 * open (`docs/design/live-specimen-offer.png`), and that briefing on its
 * own (`docs/design/live-specimen-briefing.png`).
 *
 * The campaign is advanced in Node through the shipped composition root
 * (`composeGame` + `AdvanceDay`) from a new game with First Skyfall won,
 * the spore sample recovered and Pheromone Analysis bought (the
 * `capture-net` flag set, the tech unlocked), then handed to the page as
 * its autosave and continued.
 *
 * ```
 *   vite --port 4229 --strictPort &
 *   CAPTURE_BASE_URL=http://localhost:4229 node tools/ui/capture-live-specimen.mjs
 * ```
 */
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const baseUrl = process.env.CAPTURE_BASE_URL ?? "http://localhost:4229";
const SEED = 1179;
const NOW = "2026-09-26T00:00:00.000Z";

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

  /** A Node-side game holding `state`, advanced `days` or until `until`. */
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
  const base = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("tut:save:autosave")),
  );

  /** Hands `state` to the page as its autosave, continues, opens `missionId`. */
  const show = async (state, missionId, path, element) => {
    await page.evaluate(
      (save) => {
        localStorage.setItem("tut:save:autosave", JSON.stringify(save));
      },
      { ...base, state },
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
    await page
      .locator(`.tut-missions__row[data-mission-id="${missionId}"]`)
      .click();
    await expect(
      page.locator(
        `[data-role="mission-details"][data-mission-id="${missionId}"]`,
      ),
    ).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    await page.mouse.move(0, 0);
    await page.screenshot({ path, animations: "disabled" });
    console.log(`captured ${path}`);
    if (element !== undefined) {
      await page
        .locator(
          `[data-role="mission-details"][data-mission-id="${missionId}"]`,
        )
        .screenshot({ path: element, animations: "disabled" });
      console.log(`captured ${element}`);
    }
  };

  // Act I, First Skyfall won, Pheromone Analysis bought: the next day
  // pins Live Specimen.
  const netted = advance(
    {
      ...base.state,
      tech: {
        ...base.state.tech,
        unlocked: [...base.state.tech.unlocked, "tech.pheromone-analysis"],
      },
      overworld: {
        ...base.state.overworld,
        progress: {
          ...base.state.overworld.progress,
          missionsPlayed: 5,
          storyWon: ["first-skyfall"],
          flags: ["spore-sample", "capture-net"],
        },
      },
    },
    (state) =>
      state.overworld.missions.some((m) => m.storyId === "live-specimen"),
  );
  const specimen = netted.overworld.missions.find(
    (m) => m.storyId === "live-specimen",
  );
  await show(
    netted,
    specimen.id,
    "docs/design/live-specimen-offer.png",
    "docs/design/live-specimen-briefing.png",
  );
  await expect(
    page.locator(
      `.tut-missions__row[data-mission-id="${specimen.id}"] [data-field="story"]`,
    ),
  ).toHaveText("Story · Live Specimen");
  await expect(page.locator('[data-field="briefing-heading"]')).toHaveText(
    "Briefing · Live Specimen",
  );
  await expect(
    page.locator('[data-field="detail-story-objective"]'),
  ).toHaveText("Net a lurker at 50% HP or less, then bring it home");
  await expect(page.locator('[data-field="detail-story-win"]')).toHaveText(
    "Act I ends",
  );
  await expect(page.locator('[data-field="detail-story-kit"]')).toHaveText(
    "Every squad carries a capture net",
  );
  console.log(
    JSON.stringify({
      day: netted.overworld.day,
      cityId: specimen.cityId,
      difficulty: specimen.difficulty,
      size: specimen.mapParams.size,
    }),
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await loader.close();
}
