/* global document, requestAnimationFrame */
/**
 * Captures the crash site on the overworld (#1179): the offer board the
 * day after mission one, First Skyfall pinned with its briefing open
 * (`docs/design/first-skyfall-offer.png`), and a drawn crash site's
 * briefing later in Act I (`docs/design/crash-site-briefing.png`).
 *
 * The campaigns are advanced in Node through the shipped composition
 * root (`composeGame` + `AdvanceDay`), then handed to the page as its
 * autosave and continued.
 *
 * ```
 *   vite --port 4220 --strictPort &
 *   CAPTURE_BASE_URL=http://localhost:4220 node tools/ui/capture-crash-site.mjs
 * ```
 */
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const baseUrl = process.env.CAPTURE_BASE_URL ?? "http://localhost:4220";
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
  const show = async (state, missionId, path) => {
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
  };

  // The day after mission one: First Skyfall pinned, the pod landed.
  const afterOne = advance(
    {
      ...base.state,
      overworld: {
        ...base.state.overworld,
        progress: { ...base.state.overworld.progress, missionsPlayed: 1 },
      },
    },
    (state) =>
      state.overworld.missions.some((m) => m.storyId === "first-skyfall"),
  );
  const skyfall = afterOne.overworld.missions.find(
    (m) => m.storyId === "first-skyfall",
  );
  await show(afterOne, skyfall.id, "docs/design/first-skyfall-offer.png");
  await expect(
    page.locator(
      `.tut-missions__row[data-mission-id="${skyfall.id}"] [data-field="story"]`,
    ),
  ).toHaveText("Story · First Skyfall");
  await expect(page.locator('[data-field="briefing-heading"]')).toHaveText(
    "Briefing · First Skyfall",
  );

  // Later in Act I, First Skyfall won: a drawn crash site on the board.
  const drawn = advance(
    {
      ...afterOne,
      overworld: {
        ...afterOne.overworld,
        missions: afterOne.overworld.missions.filter((m) => m !== skyfall),
        progress: {
          ...afterOne.overworld.progress,
          missionsPlayed: 3,
          storyWon: ["first-skyfall"],
          flags: [...afterOne.overworld.progress.flags, "spore-sample"],
        },
      },
    },
    (state) =>
      state.overworld.missions.some(
        (m) => m.typeId === "crash-site" && m.storyId === undefined,
      ),
  );
  const crash = drawn.overworld.missions.find(
    (m) => m.typeId === "crash-site" && m.storyId === undefined,
  );
  await show(drawn, crash.id, "docs/design/crash-site-briefing.png");
  await expect(page.locator('[data-field="briefing-heading"]')).toHaveText(
    "Briefing",
  );
  console.log(
    JSON.stringify({
      skyfall: { day: afterOne.overworld.day, ...skyfall.crashSite },
      crash: {
        day: drawn.overworld.day,
        difficulty: crash.difficulty,
        ...crash.crashSite,
      },
    }),
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await loader.close();
}
