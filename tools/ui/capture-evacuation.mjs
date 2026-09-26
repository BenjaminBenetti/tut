/* global document, requestAnimationFrame, window */
/**
 * Captures the evacuation (#1179): an evacuation's briefing on the
 * overworld board, with a won evacuation's +50% stipend badge in the top
 * bar (`docs/design/evacuation-briefing.png`), and the mission in
 * progress with one civilian group freed (`docs/design/evacuation-mission.png`).
 *
 * The campaign is advanced in Node through the shipped composition root
 * (`composeGame` + `AdvanceDay`) until the director offers an
 * evacuation, then handed to the page as its autosave. On the map a
 * squad is stood beside the nearest group (the walk is not the subject)
 * and frees it through the action wheel, as a player would.
 *
 * ```
 *   vite --port 4228 --strictPort &
 *   CAPTURE_BASE_URL=http://localhost:4228 node tools/ui/capture-evacuation.mjs
 * ```
 */
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const baseUrl = process.env.CAPTURE_BASE_URL ?? "http://localhost:4228";
const SEED = 7;
const NOW = "2026-09-26T00:00:00.000Z";
const SAVE_KEY = "tut:save:autosave";
const key = (t) => `${t.x},${t.y},${t.z}`;
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);

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
      if (until(game.session.state)) return game.session.state;
      const result = game.session.store.dispatch(advanceDay());
      assert.ok(result.ok, "the day must advance");
    }
    throw new Error("the board never showed what the capture needs");
  };

  const page = await browser.newPage({
    viewport: { width: 1440, height: 1280 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  /** Two animation frames after the fonts, the pointer parked. */
  const settle = async () => {
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
  };
  /** The autosave envelope the page holds. */
  const readSave = () =>
    page.evaluate((k) => JSON.parse(localStorage.getItem(k)), SAVE_KEY);
  /** Hands `envelope` to the page as its autosave and continues to `screen`. */
  const resume = async (envelope, screen) => {
    await page.evaluate(
      ({ k, save }) => localStorage.setItem(k, JSON.stringify(save)),
      { k: SAVE_KEY, save: envelope },
    );
    await page.reload();
    await expect(page.locator("body")).toHaveAttribute(
      "data-app-state",
      "ready",
    );
    await page.locator('[data-action="continue"]').click();
    await expect(page.locator("body")).toHaveAttribute("data-screen", screen);
  };
  /** Waits for the tactical models and the phase banner to go. */
  const tacticalReady = async () => {
    await page.waitForSelector('body[data-tactical-ready="true"]', {
      timeout: 120_000,
    });
    await expect(page.locator("#phase-banner")).not.toHaveAttribute(
      "data-visible",
      "true",
      { timeout: 15_000 },
    );
    await page.waitForTimeout(600);
    await settle();
  };
  /** Selects `unitId` and waits for its action wheel. */
  const wheelOf = async (unitId) => {
    for (let tries = 0; tries < 3; tries++) {
      await page.evaluate(
        (id) => window.__tutTactical__.selectUnit(id),
        unitId,
      );
      await page.waitForTimeout(300);
      const open = await page.locator("#radial-menu").getAttribute("data-open");
      if (open === "true") return;
    }
    throw new Error(`no action wheel for ${unitId}`);
  };

  await page.goto(baseUrl);
  await expect(page.locator("body")).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-field="seed"]').fill(String(SEED));
  await page.locator('[data-action="new-game"]').click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-screen",
    "overworld",
  );
  const base = await readSave();

  // ===========================================
  // 1. The briefing, two missions into Act I
  // ===========================================

  const offered = advance(
    {
      ...base.state,
      overworld: {
        ...base.state.overworld,
        missions: [],
        progress: { ...base.state.overworld.progress, missionsPlayed: 2 },
      },
    },
    (state) => state.overworld.missions.some((m) => m.typeId === "evacuation"),
  );
  const evacuation = offered.overworld.missions.find(
    (m) => m.typeId === "evacuation",
  );
  // An earlier evacuation won four days ago: its +50% has six days left.
  const staged = {
    ...offered,
    overworld: {
      ...offered.overworld,
      stipendModifiers: [
        { factor: 1.5, daysLeft: 6, source: "evacuation-saved" },
      ],
    },
  };
  await resume({ ...base, state: staged }, "overworld");
  await expect(page.locator("body")).toHaveAttribute("data-map-ready", "true");
  const dialog = page.locator('[data-role="event-dialog"]');
  for (let answered = 0; await dialog.isVisible(); answered++) {
    assert.ok(answered < 10, "the events never stop");
    const eventId = await dialog.getAttribute("data-event-id");
    await dialog.locator("[data-choice-id]").first().click();
    await expect(dialog).not.toHaveAttribute("data-event-id", eventId);
  }
  await page
    .locator(`.tut-missions__row[data-mission-id="${evacuation.id}"]`)
    .click();
  const details = page.locator(
    `[data-role="mission-details"][data-mission-id="${evacuation.id}"]`,
  );
  await expect(details).toBeVisible();
  await expect(details.locator('[data-field="detail-civilians"]')).toHaveText(
    `Free ${String(evacuation.evacuation.groups)} civilian groups`,
  );
  await expect(
    page.locator('#top-bar [data-field="stipend-modifier"]'),
  ).toHaveText("+50% · 6 d");
  await settle();
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: "docs/design/evacuation-briefing.png",
    animations: "disabled",
  });
  console.log("captured docs/design/evacuation-briefing.png");

  // ===========================================
  // 2. Deploy the whole squad list
  // ===========================================

  await details.locator('[data-action="plan-deployment"]').click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-screen",
    "deployment",
  );
  for (const box of await page
    .locator('[data-role="deployment-picker"] input[type="checkbox"]')
    .all()) {
    await box.check();
  }
  await page.locator('[data-action="launch"]').click();
  await expect(page.locator("body")).toHaveAttribute("data-screen", "tactical");
  await tacticalReady();

  // ===========================================
  // 3. A squad beside the nearest group frees it
  // ===========================================

  const envelope = await readSave();
  const mission = envelope.state.activeMission;
  const tiles = new Map(mission.map.tiles.map((t) => [key(t), t]));
  const props = new Set(
    mission.map.props.flatMap((p) =>
      [p.tile, ...(p.occupiedTiles ?? [])].map(key),
    ),
  );
  const occupied = new Set(mission.units.map((u) => key(u.pos)));
  const squads = mission.units.filter((u) => u.kind === "squad");
  const groups = mission.units.filter((u) => u.kind === "civilian");
  const rescue = mission.objectives.find((o) => o.kind === "rescue-civilians");
  assert.equal(groups.length, evacuation.evacuation.groups);
  const standBeside = (group) =>
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]
      .map(([dx, dz]) => ({
        ...group.pos,
        x: group.pos.x + dx,
        z: group.pos.z + dz,
      }))
      .find((t) => {
        const tile = tiles.get(key(t));
        return (
          tile !== undefined &&
          tile.surface === "floor" &&
          tile.buildingId === tiles.get(key(group.pos))?.buildingId &&
          !props.has(key(t)) &&
          !occupied.has(key(t))
        );
      });
  const [rescuer] = squads;
  const pick = groups
    .map((group) => ({ group, stand: standBeside(group) }))
    .filter(({ stand }) => stand !== undefined)
    .sort(
      (a, b) =>
        manhattan(a.group.pos, rescuer.pos) -
        manhattan(b.group.pos, rescuer.pos),
    )[0];
  assert.ok(pick, "no group has a free tile beside it");
  await resume(
    {
      ...envelope,
      state: {
        ...envelope.state,
        activeMission: {
          ...mission,
          units: mission.units.map((u) =>
            u.id === rescuer.id ? { ...u, pos: pick.stand } : u,
          ),
        },
      },
    },
    "tactical",
  );
  await tacticalReady();

  // The wheel opens at the unit, so the camera goes there first: centred
  // on the rescuer, zoomed in, the roofs peeled to the ground floor.
  const centre = async () => {
    await page
      .locator(`[data-role="squad-list"] [data-unit-id="${rescuer.id}"]`)
      .click();
    await page.waitForTimeout(500);
  };
  await centre();
  const canvas = await page.locator("#tactical-viewport canvas").boundingBox();
  await page.mouse.move(
    canvas.x + canvas.width / 2,
    canvas.y + canvas.height / 2,
  );
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(120);
  }
  await centre();
  for (let i = 0; i < 12; i++) {
    const storey = await page.evaluate(
      () => document.body.dataset.tacticalStorey,
    );
    if (storey === "1") break;
    await page.evaluate(() => window.__tutTactical__.stepLayer(-1));
    await page.waitForTimeout(200);
  }
  await page.keyboard.press("Escape");

  await wheelOf(rescuer.id);
  await page
    .locator(`#radial-menu button[data-item="interact:${rescue.id}"]`)
    .click();
  await expect
    .poll(async () => {
      const now = (await readSave()).state.activeMission;
      return now.units.find((u) => u.id === pick.group.id)?.trapped ?? false;
    })
    .toBe(false);

  // ===========================================
  // 4. The freed group selected, its moves drawn
  // ===========================================

  await page.keyboard.press("Escape");
  await page.evaluate(
    (id) => window.__tutTactical__.selectUnit(id),
    pick.group.id,
  );
  await page.waitForTimeout(600);
  await page.mouse.move(720, 24);
  await settle();
  await page.screenshot({
    path: "docs/design/evacuation-mission.png",
    animations: "disabled",
  });
  console.log("captured docs/design/evacuation-mission.png");
  const tracker = await page
    .locator(`[data-objective-id="${rescue.id}"]`)
    .first()
    .textContent();
  console.log(
    JSON.stringify({
      day: offered.overworld.day,
      city: evacuation.cityId,
      difficulty: evacuation.difficulty,
      groups: evacuation.evacuation.groups,
      freed: pick.group.id,
      tracker,
    }),
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await loader.close();
}
