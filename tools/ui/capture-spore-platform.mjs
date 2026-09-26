/* global document, requestAnimationFrame */
/**
 * Captures the Spore Platform (#1179), the finale:
 *
 * - its briefing on the overworld board, pinned on the finale's first
 *   day (`docs/design/spore-platform-briefing.png`);
 * - the hull, stage 1 of 2, just deployed on the docking ring, the
 *   tracker listing both stages (`docs/design/spore-platform-hull-mission.png`);
 * - the transition once the hull is won: who boards the core and what
 *   they have left (`docs/design/spore-platform-transition.png`);
 * - the core, stage 2 of 2, after Continue (`docs/design/spore-platform-core-mission.png`).
 *
 * The campaign is advanced in Node through the shipped composition root
 * (`composeGame` + `AdvanceDay`) from a new game put in the finale with
 * an empty board, then handed to the page as its autosave. The shipped
 * story pins the platform on the finale's first day; the finale itself is
 * only reachable once every act's ending ships, so the act is set here.
 * The hull is won in Node the cheap way (the force stood on the hatch and
 * extracted, a mech hurt and a squad's stores spent on the way), because
 * the walk is not the subject; the page then opens on the won hull and
 * shows the transition, and Continue is pressed on the page as a player
 * would.
 *
 * ```
 *   vite --port 4237 --strictPort &
 *   CAPTURE_BASE_URL=http://localhost:4237 node tools/ui/capture-spore-platform.mjs
 * ```
 */
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const baseUrl = process.env.CAPTURE_BASE_URL ?? "http://localhost:4237";
const SEED = 1179;
const NOW = "2026-09-26T00:00:00.000Z";
const SAVE_KEY = "tut:save:autosave";
const key = (t) => `${t.x},${t.y},${t.z}`;
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
const chebyshev = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));

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
  const [
    { composeGame },
    { MemoryKeyValueStore },
    { advanceDay },
    { extract },
    { withVision },
  ] = await Promise.all([
    loader.ssrLoadModule("/src/app/service/game-composition.ts"),
    loader.ssrLoadModule("/src/save/repository/memory-key-value-store.ts"),
    loader.ssrLoadModule("/src/overworld/model/advance-day-command.ts"),
    loader.ssrLoadModule("/src/tactical/model/extract-command.ts"),
    loader.ssrLoadModule("/src/tactical/service/vision-service.ts"),
  ]);

  /** A Node-side game holding `state`, over memory storage. */
  const nodeGame = (state) => {
    const game = composeGame({
      storage: new MemoryKeyValueStore(),
      clock: { now: () => NOW },
      newSeed: () => SEED,
      onAutosaveFailure: (error) => {
        throw new Error(`autosave failed: ${error.kind}`);
      },
    });
    game.session.start(state);
    return game;
  };

  const page = await browser.newPage({
    viewport: { width: 1440, height: 1280 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  /** Two animation frames after the fonts. */
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
      timeout: 180_000,
    });
    await expect(page.locator("#phase-banner")).not.toHaveAttribute(
      "data-visible",
      "true",
      { timeout: 15_000 },
    );
    await page.waitForTimeout(800);
    await settle();
  };
  /** Screenshots the page to `path`, the pointer parked on the top bar. */
  const capture = async (path) => {
    await page.mouse.move(720, 24);
    await settle();
    await page.screenshot({ path, animations: "disabled" });
    console.log(`captured ${path}`);
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
  // 1. The briefing, the finale's first day
  // ===========================================

  const finale = nodeGame({
    ...base.state,
    overworld: {
      ...base.state.overworld,
      missions: [],
      progress: { ...base.state.overworld.progress, act: "finale" },
    },
  });
  assert.ok(finale.session.store.dispatch(advanceDay()).ok);
  const pinned = finale.session.state;
  const platform = pinned.overworld.missions.find(
    (m) => m.storyId === "spore-platform",
  );
  assert.ok(platform, "the shipped story pins the platform in the finale");
  assert.equal(platform.typeId, "spore-platform");
  await resume({ ...base, state: pinned }, "overworld");
  await expect(page.locator("body")).toHaveAttribute("data-map-ready", "true");
  const dialog = page.locator('[data-role="event-dialog"]');
  for (let answered = 0; await dialog.isVisible(); answered++) {
    assert.ok(answered < 10, "the events never stop");
    const eventId = await dialog.getAttribute("data-event-id");
    await dialog.locator("[data-choice-id]").first().click();
    await expect(dialog).not.toHaveAttribute("data-event-id", eventId);
  }
  await page
    .locator(`.tut-missions__row[data-mission-id="${platform.id}"]`)
    .click();
  const details = page.locator(
    `[data-role="mission-details"][data-mission-id="${platform.id}"]`,
  );
  await expect(details).toBeVisible();
  await expect(details.locator('[data-field="detail-story-win"]')).toHaveText(
    "Earth is saved",
  );
  await expect(
    details.locator('[data-field="detail-story-first-loss"]'),
  ).toContainText("+30 infestation everywhere");
  await capture("docs/design/spore-platform-briefing.png");

  // ===========================================
  // 2. The hull: the whole roster on the docking ring
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
  const stages = page.locator('[data-role="stage-list"] li');
  await expect(stages).toHaveCount(2);
  await expect(stages.nth(0)).toHaveAttribute("data-stage-state", "current");
  await expect(stages.nth(1)).toHaveAttribute("data-stage-state", "ahead");
  await capture("docs/design/spore-platform-hull-mission.png");

  // ===========================================
  // 3. The hull won: the transition
  // ===========================================

  const launched = await readSave();
  const hull = launched.state.activeMission;
  assert.equal(hull.stage?.index, 0);
  const force = hull.units.filter(
    (u) => u.team === "tdf" && (u.kind === "squad" || u.kind === "mech"),
  );
  const mech = force.find((u) => u.kind === "mech");
  const squad = force.find((u) => u.kind === "squad");
  assert.ok(mech && squad, "the roster fields a mech and a squad");
  /** The squad's stores, part spent: two rounds fired, one item used. */
  const spent = (unit) => {
    const template = hull.templates[unit.templateId];
    const charges = Object.fromEntries(
      template.weapons
        .filter((w) => w.charges !== undefined)
        .map((w) => [w.id, Math.max(0, w.charges - 2)]),
    );
    const [item] = template.equipment ?? [];
    return {
      ...unit,
      hp: unit.hp - 2,
      charges,
      ...(item === undefined ? {} : { equipment: { [item]: 1 } }),
    };
  };
  const game = nodeGame(launched.state);
  // One at a time over the hatch's first tile: an extracted unit leaves
  // the map, so the tile is free for the next.
  const [hatch] = hull.extraction;
  for (const unit of force) {
    const now = game.session.state;
    game.session.replace({
      ...now,
      activeMission: {
        ...now.activeMission,
        units: now.activeMission.units.map((u) => {
          if (u.id !== unit.id) return u;
          const hurt =
            u.id === mech.id
              ? { ...u, hp: u.hp - 4 }
              : u.id === squad.id
                ? spent(u)
                : u;
          return { ...hurt, pos: hatch, ap: u.maxAp };
        }),
      },
    });
    const done = game.session.store.dispatch(extract(unit.id));
    assert.ok(done.ok, `extract ${unit.id}: ${JSON.stringify(done)}`);
  }
  const won = game.session.state;
  assert.equal(won.activeMission.outcome, "won");
  await resume({ ...launched, state: won }, "tactical");
  const transition = page.locator('[data-role="stage-transition"]');
  await expect(transition).toBeVisible({ timeout: 180_000 });
  await tacticalReady();
  await expect(transition.locator('[data-field="stage-next"]')).toHaveText(
    "Next: The core, stage 2 of 2",
  );
  await expect(
    transition.locator('[data-role="stage-survivors"] tr'),
  ).toHaveCount(force.length);
  // Named as the roster names them, and the hull already cleared.
  await expect(
    transition.locator(`[data-unit-id="${mech.id}"] td`).first(),
  ).not.toHaveText("that unit");
  await expect(stages.nth(0)).toHaveAttribute("data-stage-state", "cleared");
  await capture("docs/design/spore-platform-transition.png");

  // ===========================================
  // 4. Continue: the core
  // ===========================================

  await transition.locator('[data-action="stage-continue"]').click();
  await expect(transition).toBeHidden();
  await expect
    .poll(async () => (await readSave()).state.activeMission?.stage?.index)
    .toBe(1);
  await page.waitForTimeout(500);
  await tacticalReady();
  await expect(stages.nth(0)).toHaveAttribute("data-stage-state", "cleared");
  await expect(stages.nth(1)).toHaveAttribute("data-stage-state", "current");
  // The log reads on from the hull: its win by stage, then the core's turn.
  const logTail = await page
    .locator('[data-role="event-log-list"] [data-text]')
    .evaluateAll((rows) => rows.slice(-2).map((row) => row.dataset.text));
  assert.deepEqual(logTail, ["Stage 1 of 2 won", "Turn 1 — TDF phase"]);
  const advanced = await readSave();
  const core = advanced.state.activeMission;
  assert.equal(core.objectives[0]?.kind, "destroy-platform-core");
  const target = core.spawners.find((s) => s.variant === "platform-core");
  assert.ok(target, "the core stage stands the platform core");

  // The walk to the core is not the subject either: the survivors are
  // stood at the chamber's mouth, the guard posts either side and the
  // core ahead, and look again from there. The view opens on the squad,
  // and the core is near enough to be in the frame with it.
  const blocked = new Set([
    ...core.map.props.flatMap((p) =>
      [p.tile, ...(p.occupiedTiles ?? [])].map(key),
    ),
    ...core.units.map((u) => key(u.pos)),
  ]);
  const mouth = { x: target.pos.x, z: target.pos.z - 9 };
  const ring = core.map.tiles
    .filter(
      (t) =>
        t.pass !== 0 &&
        t.y === target.pos.y &&
        !blocked.has(key(t)) &&
        manhattan(t, mouth) <= 3,
    )
    .sort((a, b) => manhattan(a, mouth) - manhattan(b, mouth) || a.x - b.x);
  const survivors = core.units.filter((u) => u.team === "tdf");
  const stands = [];
  for (const tile of ring) {
    if (stands.length === survivors.length) break;
    if (stands.every((s) => chebyshev(s, tile) >= 2)) {
      stands.push({ x: tile.x, y: tile.y, z: tile.z });
    }
  }
  assert.equal(stands.length, survivors.length, "no room round the core");
  const moved = {
    ...core,
    units: core.units.map((u) => {
      const i = survivors.findIndex((s) => s.id === u.id);
      return i < 0 ? u : { ...u, pos: stands[i] };
    }),
  };
  const looked = withVision({ state: moved, events: [] }).state;
  await resume(
    { ...advanced, state: { ...advanced.state, activeMission: looked } },
    "tactical",
  );
  await tacticalReady();
  await capture("docs/design/spore-platform-core-mission.png");

  console.log(
    JSON.stringify({
      day: pinned.overworld.day,
      city: platform.cityId,
      force: force.map((u) => `${u.id}:${u.kind}`),
      hatch,
      core: { pos: target.pos, hp: target.hp },
      stands,
      bugs: core.units.filter((u) => u.team === "bugs").length,
    }),
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await loader.close();
}
