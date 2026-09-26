/* global document, requestAnimationFrame, window */
/**
 * Captures the Alpha Hunt (#1179, campaign arc §6.8, §8, §11):
 *
 *   - the scripted Broodmother sighting on the overworld board, a
 *     Broodmother met for the first time (`docs/design/alpha-hunt-briefing.png`);
 *   - an ordinary hunt for a nemesis come back, her name, scar and level
 *     in the briefing (`docs/design/alpha-hunt-nemesis-briefing.png`);
 *   - that hunt in progress, the squad on her as she runs for the map
 *     edge at half health, her card and the tracker's hit points
 *     (`docs/design/alpha-hunt-mission.png`);
 *   - the Nemeses readout in the side panel, beside an offer whose
 *     Alpha Present sitrep brings a nemesis alpha back
 *     (`docs/design/nemesis-readout.png`).
 *
 * The campaign is staged in Act II with a hive in the region of the
 * first detected city, and advanced in Node through the shipped
 * composition root (`composeGame` + `AdvanceDay`) until the director
 * offers what the capture needs, then handed to the page as its
 * autosave. Her half health and the turn she runs on are played in Node
 * through the shipped `EndTurn`; the force is stood within sight of her
 * afterwards (the chase is not the subject), and the page resumes there.
 *
 * ```
 *   new game ──► stage Act II + hive ──► advance ──► sighting offered ──► briefing.png
 *            └─ + Old Scald on the record ──► advance ──► her hunt offered ──► nemesis-briefing.png
 *                 ──► deploy, launch ──► (Node) half hp, EndTurn: she flees ──► mission.png
 *            └─ + Grinder on the record, an offer with Alpha Present ──► nemesis-readout.png
 * ```
 *
 * ```
 *   vite --port 4235 --strictPort &
 *   CAPTURE_BASE_URL=http://localhost:4235 node tools/ui/capture-alpha-hunt.mjs
 * ```
 */
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const baseUrl = process.env.CAPTURE_BASE_URL ?? "http://localhost:4235";
const SEED = 7;
const NOW = "2026-09-26T00:00:00.000Z";
const SAVE_KEY = "tut:save:autosave";

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
    { endTurn },
    { BROODMOTHER_TUNING },
    { isBroodmother },
    { buildMoveGraph, occupiedKeys },
    { findAttackTarget },
    { positionsWithin },
    { withVision },
  ] = await Promise.all([
    loader.ssrLoadModule("/src/app/service/game-composition.ts"),
    loader.ssrLoadModule("/src/save/repository/memory-key-value-store.ts"),
    loader.ssrLoadModule("/src/overworld/model/advance-day-command.ts"),
    loader.ssrLoadModule("/src/tactical/model/end-turn-command.ts"),
    loader.ssrLoadModule("/src/bugs/data/broodmother-tuning.ts"),
    loader.ssrLoadModule("/src/bugs/service/broodmother-service.ts"),
    loader.ssrLoadModule("/src/tactical/service/movement-service.ts"),
    loader.ssrLoadModule("/src/tactical/service/attack-target-service.ts"),
    loader.ssrLoadModule("/src/tactical/service/mission-driver.test-helper.ts"),
    loader.ssrLoadModule("/src/tactical/service/vision-service.ts"),
  ]);

  /** A Node-side game over an in-memory store. */
  const nodeGame = () =>
    composeGame({
      storage: new MemoryKeyValueStore(),
      clock: { now: () => NOW },
      newSeed: () => SEED,
      onAutosaveFailure: (error) => {
        throw new Error(`autosave failed: ${error.kind}`);
      },
    });
  /** `state` advanced a day at a time until `until` holds. */
  const advance = (state, until, maxDays = 60) => {
    const game = nodeGame();
    game.session.start(state);
    for (let day = 0; day < maxDays; day++) {
      if (until(game.session.state)) return game.session.state;
      const result = game.session.store.dispatch(advanceDay());
      assert.ok(result.ok, "the day must advance");
    }
    throw new Error("the board never showed what the capture needs");
  };
  /** `state` after the shipped `command`, which must succeed. */
  const play = (state, command) => {
    const game = nodeGame();
    game.session.start(state);
    const result = game.session.store.dispatch(command);
    assert.ok(result.ok, `${command.type} must succeed`);
    return game.session.state;
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
  /** Resumes on the overworld, answers the day's events and opens `missionId`'s briefing. */
  const briefing = async (envelope, missionId) => {
    await resume(envelope, "overworld");
    await expect(page.locator("body")).toHaveAttribute(
      "data-map-ready",
      "true",
    );
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
    const details = page.locator(
      `[data-role="mission-details"][data-mission-id="${missionId}"]`,
    );
    await expect(details).toBeVisible();
    return details;
  };
  /** Shoots the page to `path` with the pointer parked off the board. */
  const shoot = async (path, park = { x: 0, y: 0 }) => {
    await settle();
    await page.mouse.move(park.x, park.y);
    await page.screenshot({ path, animations: "disabled" });
    console.log(`captured ${path}`);
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

  await page.goto(baseUrl);
  await expect(page.locator("body")).toHaveAttribute("data-app-state", "ready");
  // The dev server points Jev at a relay nobody runs here, so the
  // enemies play their shipped behaviours, as they do without a relay.
  const smart = page.locator('[data-field="smart-enemies"]');
  if ((await smart.count()) > 0) await smart.uncheck();
  await page.locator('[data-field="seed"]').fill(String(SEED));
  await page.locator('[data-action="new-game"]').click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-screen",
    "overworld",
  );
  const base = await readSave();

  // ===========================================
  // The stage: Act II, twelve missions in, a hive
  // ===========================================

  const { map } = base.state.overworld;
  const home = map.cities.find((city) => city.detected);
  assert.ok(home, "the campaign starts with a detected city");
  const lair = home.regionId;
  /** The campaign ten missions into Act II, a hive in `lair`, with `progress` on top. */
  const actTwo = (progress = {}) => ({
    ...base.state,
    overworld: {
      ...base.state.overworld,
      missions: [],
      hives: [
        { id: "hive-1", regionId: lair, formedDay: base.state.overworld.day },
      ],
      progress: {
        ...base.state.overworld.progress,
        act: "act-2",
        actStartedAt: 2,
        missionsPlayed: 12,
        missionsWon: 9,
        ...progress,
      },
    },
  });
  const sighted = [
    ...base.state.overworld.progress.flags,
    "broodmother-sighted",
  ];
  const OLD_SCALD = {
    id: "nemesis-old-scald",
    speciesId: "broodmother",
    name: "Old Scald",
    scar: "burned along the flank",
    regionId: lair,
    level: 2,
    escapes: 2,
  };

  // ===========================================
  // 1. The sighting: a Broodmother met for the first time
  // ===========================================

  const sighting = advance(actTwo(), (state) =>
    state.overworld.missions.some((m) => m.typeId === "alpha-hunt"),
  );
  const first = sighting.overworld.missions.find(
    (m) => m.typeId === "alpha-hunt",
  );
  assert.equal(first.storyId, "broodmother-sighting");
  const firstDetails = await briefing({ ...base, state: sighting }, first.id);
  await expect(
    firstDetails.locator('[data-field="detail-quarry"]'),
  ).toContainText(first.alphaHunt.name);
  await expect(
    firstDetails.locator('[data-field="detail-nemesis"]'),
  ).toBeHidden();
  await shoot("docs/design/alpha-hunt-briefing.png");

  // ===========================================
  // 2. A nemesis come back: Old Scald, level 2
  // ===========================================

  const hunted = advance(
    actTwo({ flags: sighted, nemeses: [OLD_SCALD] }),
    (state) =>
      state.overworld.missions.some(
        (m) => m.alphaHunt?.nemesisId === OLD_SCALD.id,
      ),
  );
  const hunt = hunted.overworld.missions.find(
    (m) => m.alphaHunt?.nemesisId === OLD_SCALD.id,
  );
  const details = await briefing({ ...base, state: hunted }, hunt.id);
  await expect(details.locator('[data-field="detail-nemesis"]')).toHaveText(
    "Old Scald, scarred: burned along the flank. Level 2",
  );
  await shoot("docs/design/alpha-hunt-nemesis-briefing.png");

  // ===========================================
  // 3. The hunt: she runs at half health
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

  const launched = await readSave();
  const opening = launched.state.activeMission;
  const mother = opening.units.find(isBroodmother);
  assert.ok(mother, "she is on the map");
  const half = Math.floor(mother.maxHp * BROODMOTHER_TUNING.fleeAtHpFraction);
  const ran = play(
    {
      ...launched.state,
      activeMission: {
        ...opening,
        units: opening.units.map((unit) =>
          unit.id === mother.id ? { ...unit, hp: half } : unit,
        ),
      },
    },
    endTurn(),
  );
  const running = ran.activeMission;
  const her = running.units.find((unit) => unit.id === mother.id);
  assert.ok(her?.fleeing, "at half health she runs");

  // The force is stood within five of her with a clear line, nearest
  // first; the march that would get it there is not the subject.
  const target = findAttackTarget(running, her.id);
  const graph = buildMoveGraph(running.map);
  const taken = new Set(occupiedKeys(running, graph.index));
  const force = running.units.filter(
    (unit) => unit.team === "tdf" && unit.hp > 0 && unit.kind !== "turret",
  );
  const stood = new Map();
  for (const unit of force) {
    const spot = positionsWithin(running, unit, target, 5, true, graph)
      .filter((p) => p.distance >= 3 && !taken.has(graph.index.keyOf(p.tile)))
      .sort(
        (a, b) =>
          a.distance - b.distance ||
          a.tile.z - b.tile.z ||
          a.tile.x - b.tile.x ||
          a.tile.y - b.tile.y,
      )[0];
    if (spot === undefined) continue;
    taken.add(graph.index.keyOf(spot.tile));
    stood.set(unit.id, spot);
  }
  assert.ok(stood.size > 0, "no room near her");
  // Vision is stored, not derived (ADR 0006): recomputed as a move would.
  const caughtUp = withVision({
    state: {
      ...running,
      units: running.units.map((unit) =>
        stood.has(unit.id)
          ? { ...unit, pos: stood.get(unit.id).tile, ap: unit.maxAp }
          : unit,
      ),
    },
    events: [],
  }).state;
  assert.ok(caughtUp.vision.tdf.spotted.includes(her.id), "the force sees her");
  await resume(
    { ...launched, state: { ...ran, activeMission: caughtUp } },
    "tactical",
  );
  await tacticalReady();

  // The camera goes to the squad nearest her, zoomed in a step, and the
  // squad aims at her so the card shows her.
  const [hunter] = [...stood.entries()]
    .filter(([id]) => force.find((u) => u.id === id).kind === "squad")
    .sort(([, a], [, b]) => a.distance - b.distance)
    .map(([id]) => id);
  assert.ok(hunter, "no squad stands near her");
  await page
    .locator(`[data-role="squad-list"] [data-unit-id="${hunter}"]`)
    .click();
  await page.waitForTimeout(500);
  const canvas = await page.locator("#tactical-viewport canvas").boundingBox();
  await page.mouse.move(
    canvas.x + canvas.width / 2,
    canvas.y + canvas.height / 2,
  );
  for (let i = 0; i < 2; i++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(120);
  }
  await page
    .locator(`[data-role="squad-list"] [data-unit-id="${hunter}"]`)
    .click();
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
  await page.evaluate((id) => window.__tutTactical__.selectUnit(id), hunter);
  await page.waitForTimeout(300);
  await page.evaluate((id) => window.__tutTactical__.selectUnit(id), her.id);
  await page.waitForTimeout(600);
  const hp = page.locator('[data-role="broodmother-hp"]').first();
  await expect(hp).toContainText("fleeing");
  await shoot("docs/design/alpha-hunt-mission.png", { x: 720, y: 24 });
  const huntObjective = running.objectives.find(
    (o) => o.kind === "kill-broodmother",
  );
  const tracker = await page
    .locator(`[data-objective-id="${huntObjective.id}"]`)
    .first()
    .textContent();

  // ===========================================
  // 4. The Nemeses readout, beside an Alpha Present offer
  // ===========================================

  /** An ordinary clearance, the commonest offer a sitrep rides on. */
  const clearance = (m) =>
    m.typeId === "infestation-clearance" && m.storyId === undefined;
  const board = advance(
    actTwo({ flags: sighted, nemeses: [OLD_SCALD] }),
    (state) =>
      state.overworld.missions.some(clearance) &&
      state.overworld.missions.some((m) => m.typeId === "alpha-hunt"),
  );
  const offer = board.overworld.missions.find(clearance);
  assert.ok(offer, "an ordinary offer is on the board");
  const offerRegion = map.cities.find((c) => c.id === offer.cityId).regionId;
  const GRINDER = {
    id: "nemesis-grinder",
    speciesId: "brute",
    name: "Grinder",
    scar: "a leg lost to the squad's guns",
    regionId: offerRegion,
    level: 1,
    escapes: 1,
  };
  // The offer is edited to carry Alpha Present for Grinder, as the
  // sitrep director would freeze it (named-alpha-offer).
  const readout = {
    ...board,
    overworld: {
      ...board.overworld,
      missions: board.overworld.missions.map((m) =>
        m.id === offer.id
          ? {
              ...m,
              sitreps: ["alpha-present"],
              alpha: {
                name: GRINDER.name,
                level: GRINDER.level,
                nemesisId: GRINDER.id,
                speciesId: GRINDER.speciesId,
                scar: GRINDER.scar,
              },
            }
          : m,
      ),
      progress: {
        ...board.overworld.progress,
        nemeses: [OLD_SCALD, GRINDER],
      },
    },
  };
  const offerDetails = await briefing({ ...base, state: readout }, offer.id);
  await expect(offerDetails).toContainText("Grinder, level 1, leads");
  const nemeses = page.locator('[data-role="nemeses"]');
  await expect(nemeses).toBeVisible();
  await expect(nemeses.locator("li.tut-nemesis")).toHaveCount(2);
  // The panel scrolled to the mission list: the offer, its briefing and
  // the readout under it in one frame.
  await page
    .locator('[data-role="missions"]')
    .evaluate((section) => section.scrollIntoView({ block: "start" }));
  await shoot("docs/design/nemesis-readout.png");

  console.log(
    JSON.stringify({
      lair,
      sighting: {
        day: sighting.overworld.day,
        city: first.cityId,
        difficulty: first.difficulty,
        name: first.alphaHunt.name,
        map: first.mapParams,
      },
      hunt: {
        day: hunted.overworld.day,
        city: hunt.cityId,
        difficulty: hunt.difficulty,
        spec: hunt.alphaHunt,
        map: hunt.mapParams,
      },
      mission: {
        maxHp: mother.maxHp,
        half,
        from: mother.pos,
        to: her.pos,
        turn: running.turn,
        stood: [...stood.entries()].map(([id, p]) => ({
          id,
          tile: p.tile,
          distance: p.distance,
        })),
        hunter,
        tracker,
      },
      readout: { offer: offer.id, type: offer.typeId, region: offerRegion },
    }),
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await loader.close();
}
