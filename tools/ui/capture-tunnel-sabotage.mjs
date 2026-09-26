/* global document, requestAnimationFrame, window */
/**
 * Captures the tunnel sabotage (#1179, arc §6.7): its briefing on the
 * overworld board (`docs/design/tunnel-sabotage-briefing.png`), and the
 * mission with one mouth sealed and a charge burning on another
 * (`docs/design/tunnel-sabotage-mission.png`).
 *
 * The campaign is staged in Node through the shipped composition root
 * (`composeGame` + `AdvanceDay`): five missions into Act II, with the
 * worst detected city raised to the spread threshold, then advanced
 * until the director offers a tunnel sabotage, and handed to the page
 * as its autosave. On the map a squad is stood a step from one mouth
 * (the long walk is not the subject), walks the last step, so its own
 * sight explores the mouth, and sets its charge through the action
 * wheel; the force waits out the fuse at the drop ship over three real
 * end turns, and a second squad then does the same at the next mouth
 * while a third stands between the two, where the camera looks from.
 *
 * ```
 *   vite --port 4232 --strictPort &
 *   CAPTURE_BASE_URL=http://localhost:4232 node tools/ui/capture-tunnel-sabotage.mjs
 * ```
 */
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const baseUrl = process.env.CAPTURE_BASE_URL ?? "http://localhost:4232";
const SEED = 7;
const NOW = "2026-09-26T00:00:00.000Z";
const SAVE_KEY = "tut:save:autosave";
/** The infantry bit of a tile's pass mask. */
const INFANTRY = 1;
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
  const [
    { composeGame },
    { MemoryKeyValueStore },
    { advanceDay },
    { INFESTATION_TUNING },
  ] = await Promise.all([
    loader.ssrLoadModule("/src/app/service/game-composition.ts"),
    loader.ssrLoadModule("/src/save/repository/memory-key-value-store.ts"),
    loader.ssrLoadModule("/src/overworld/model/advance-day-command.ts"),
    loader.ssrLoadModule("/src/overworld/data/infestation-tuning.ts"),
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
  // A loaded machine renders a tactical frame slowly; wait for it.
  page.setDefaultTimeout(180_000);
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
    await page.reload({ timeout: 180_000 });
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
  /** Ends the player's turn and waits until the next one is played in. */
  const endTurn = async () => {
    const before = (await readSave()).state.activeMission;
    await page
      .locator('#action-bar [data-action="end-turn"]')
      .click({ noWaitAfter: true });
    await expect
      .poll(
        async () => {
          const now = (await readSave()).state.activeMission;
          return { turn: now?.turn, phase: now?.phase };
        },
        { timeout: 120_000 },
      )
      .toEqual({ turn: before.turn + 1, phase: "player" });
    await expect(page.locator("body")).not.toHaveAttribute(
      "data-phase-playing",
      "true",
      { timeout: 120_000 },
    );
    await page.waitForTimeout(400);
  };
  /**
   * Walks `unitId` to the first of `destinations` the game accepts, as a
   * right click does, and returns where it arrived. A tile it cannot
   * reach (a wall between, a bug in the way) is refused and the next is
   * tried.
   */
  const walkTo = async (unitId, destinations) => {
    const where = async () =>
      (await readSave()).state.activeMission.units.find((u) => u.id === unitId)
        .pos;
    const start = await where();
    for (const tile of destinations) {
      await page.evaluate(
        (id) => window.__tutTactical__.selectUnit(id),
        unitId,
      );
      await page.waitForTimeout(300);
      await page.evaluate((t) => window.__tutTactical__.invokeTile(t), tile);
      for (let waited = 0; waited < 40; waited++) {
        await page.waitForTimeout(500);
        const now = await where();
        if (key(now) !== key(start)) {
          await expect(page.locator("body")).not.toHaveAttribute(
            "data-phase-playing",
            "true",
          );
          await page.waitForTimeout(600);
          await page.keyboard.press("Escape");
          return now;
        }
      }
      console.log(`walk to ${key(tile)} refused; trying the next tile`);
      await page.keyboard.press("Escape");
    }
    throw new Error(`${unitId} could not walk from ${key(start)}`);
  };
  /** Centres the camera on `unitId` through the squad list. */
  const centreOn = async (unitId) => {
    await page
      .locator(`[data-role="squad-list"] [data-unit-id="${unitId}"]`)
      .click();
    await page.waitForTimeout(500);
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
  // 1. The briefing, five missions into Act II
  // ===========================================

  const cities = base.state.overworld.map.cities;
  const worst = cities
    .filter((c) => c.detected)
    .sort((a, b) => b.infestation - a.infestation)[0];
  assert.ok(worst, "the fresh campaign has a detected city");
  const offered = advance(
    {
      ...base.state,
      overworld: {
        ...base.state.overworld,
        missions: [],
        map: {
          ...base.state.overworld.map,
          cities: cities.map((c) =>
            c.id === worst.id
              ? {
                  ...c,
                  infestation: Math.max(
                    c.infestation,
                    INFESTATION_TUNING.spreadThreshold,
                  ),
                }
              : c,
          ),
        },
        progress: {
          ...base.state.overworld.progress,
          act: "act-2",
          actStartedAt: 0,
          missionsPlayed: 5,
          missionsWon: 5,
        },
      },
    },
    (state) =>
      state.overworld.missions.some((m) => m.typeId === "tunnel-sabotage"),
  );
  const sabotage = offered.overworld.missions.find(
    (m) => m.typeId === "tunnel-sabotage",
  );
  await resume({ ...base, state: offered }, "overworld");
  await expect(page.locator("body")).toHaveAttribute("data-map-ready", "true");
  const dialog = page.locator('[data-role="event-dialog"]');
  for (let answered = 0; await dialog.isVisible(); answered++) {
    assert.ok(answered < 10, "the events never stop");
    const eventId = await dialog.getAttribute("data-event-id");
    await dialog.locator("[data-choice-id]").first().click();
    await expect(dialog).not.toHaveAttribute("data-event-id", eventId);
  }
  await page
    .locator(`.tut-missions__row[data-mission-id="${sabotage.id}"]`)
    .click();
  const details = page.locator(
    `[data-role="mission-details"][data-mission-id="${sabotage.id}"]`,
  );
  await expect(details).toBeVisible();
  await expect(details.locator('[data-field="detail-tunnels"]')).toHaveText(
    "Seal 3 tunnel mouths, then extract",
  );
  await expect(details.locator('[data-field="detail-fuse"]')).toHaveText(
    "Charges burn for 3 turns",
  );
  await settle();
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: "docs/design/tunnel-sabotage-briefing.png",
    animations: "disabled",
  });
  console.log("captured docs/design/tunnel-sabotage-briefing.png");

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
  // 3. A squad beside the first mouth sets its charge
  // ===========================================

  const envelope = await readSave();
  const mission = envelope.state.activeMission;
  const mouths = mission.tunnelMouths;
  assert.equal(mouths.length, 3);
  const objective = mission.objectives.find((o) => o.kind === "seal-tunnels");
  const tiles = new Map(mission.map.tiles.map((t) => [key(t), t]));
  const props = new Set(
    mission.map.props.flatMap((p) =>
      [p.tile, ...(p.occupiedTiles ?? [])].map(key),
    ),
  );
  const mouthTiles = new Set(mouths.flatMap((m) => m.tiles.map(key)));
  /** Every free tile an infantry squad can stand on beside `mouth`, but off it. */
  const besideMouth = (mouth, taken) =>
    mouth.tiles
      .flatMap((t) =>
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].map(([dx, dz]) => ({ ...t, x: t.x + dx, z: t.z + dz })),
      )
      .filter((t) => {
        const tile = tiles.get(key(t));
        return (
          tile !== undefined &&
          (tile.pass & INFANTRY) !== 0 &&
          !props.has(key(t)) &&
          !mouthTiles.has(key(t)) &&
          !taken.has(key(t))
        );
      });
  /** A free tile a step from `stand`, off every mouth: where the walk starts. */
  const stepBack = (stand, taken) =>
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]
      .map(([dx, dz]) => ({ ...stand, x: stand.x + dx, z: stand.z + dz }))
      .find((t) => {
        const tile = tiles.get(key(t));
        return (
          tile !== undefined &&
          (tile.pass & INFANTRY) !== 0 &&
          !props.has(key(t)) &&
          !mouthTiles.has(key(t)) &&
          !taken.has(key(t))
        );
      });
  /** The nearest free infantry tile to `aim`, off every mouth. */
  const freeNear = (aim, taken) =>
    [...tiles.values()]
      .filter(
        (tile) =>
          tile.y === aim.y &&
          (tile.pass & INFANTRY) !== 0 &&
          !props.has(key(tile)) &&
          !mouthTiles.has(key(tile)) &&
          !taken.has(key(tile)),
      )
      .sort((a, b) => manhattan(a, aim) - manhattan(b, aim))[0];
  // The two mouths nearest each other, so one frame can hold both.
  const pairs = mouths.flatMap((a, i) =>
    mouths.slice(i + 1).map((b) => ({ a, b, gap: manhattan(a.pos, b.pos) })),
  );
  const { a: first, b: second } = pairs.sort((p, q) => p.gap - q.gap)[0];
  const squads = mission.units.filter((u) => u.kind === "squad");
  assert.ok(squads.length >= 2, "the capture needs two squads");
  const [setter, second_setter, watcher] = squads;
  const taken = new Set(mission.units.map((u) => key(u.pos)));
  const firstBeside = besideMouth(first, taken);
  assert.ok(firstBeside.length > 0, "no free tile beside the first mouth");
  const firstFrom = stepBack(firstBeside[0], taken);
  assert.ok(firstFrom, "no tile to walk to the first mouth from");
  await resume(
    {
      ...envelope,
      state: {
        ...envelope.state,
        activeMission: {
          ...mission,
          units: mission.units.map((u) =>
            u.id === setter.id ? { ...u, pos: firstFrom } : u,
          ),
        },
      },
    },
    "tactical",
  );
  await tacticalReady();
  await walkTo(
    setter.id,
    [...firstBeside].sort(
      (a, b) => manhattan(a, firstFrom) - manhattan(b, firstFrom),
    ),
  );
  await wheelOf(setter.id);
  await page
    .locator(`#radial-menu button[data-item="interact:${objective.id}"]`)
    .click();
  await expect
    .poll(async () => (await readSave()).state.activeMission.charges.length)
    .toBe(1);
  await page.keyboard.press("Escape");

  // ===========================================
  // 4. The force waits out the fuse at the drop ship
  // ===========================================

  const charged = await readSave();
  const chargedMission = charged.state.activeMission;
  const ramp = chargedMission.extraction;
  const home = ramp.find((t) => !taken.has(key(t))) ?? ramp[0];
  await resume(
    {
      ...charged,
      state: {
        ...charged.state,
        activeMission: {
          ...chargedMission,
          units: chargedMission.units.map((u) =>
            u.id === setter.id ? { ...u, pos: home } : u,
          ),
        },
      },
    },
    "tactical",
  );
  await tacticalReady();
  for (let turn = 0; turn < 3; turn++) {
    await endTurn();
  }
  const blown = await readSave();
  const blownMission = blown.state.activeMission;
  const sealed = blownMission.tunnelMouths.filter(
    (m) => m.sealedOnTurn !== undefined,
  );
  assert.deepEqual(
    sealed.map((m) => m.id),
    [first.id],
    "the first mouth seals on the third turn",
  );

  // ===========================================
  // 5. A second squad sets a charge on the next mouth
  // ===========================================

  const nowTaken = new Set(
    blownMission.units.filter((u) => u.hp > 0).map((u) => key(u.pos)),
  );
  const secondBeside = besideMouth(second, nowTaken);
  assert.ok(secondBeside.length > 0, "no free tile beside the second mouth");
  const secondFrom = stepBack(secondBeside[0], nowTaken);
  assert.ok(secondFrom, "no tile to walk to the second mouth from");
  nowTaken.add(key(secondFrom));
  const middle = freeNear(
    {
      ...first.pos,
      x: Math.round((first.pos.x + second.pos.x) / 2),
      z: Math.round((first.pos.z + second.pos.z) / 2),
    },
    nowTaken,
  );
  for (const id of [second_setter.id, watcher.id]) {
    const unit = blownMission.units.find((u) => u.id === id);
    assert.ok(unit && unit.hp > 0, `${id} is still standing`);
  }
  await resume(
    {
      ...blown,
      state: {
        ...blown.state,
        activeMission: {
          ...blownMission,
          units: blownMission.units.map((u) =>
            u.id === second_setter.id
              ? { ...u, pos: secondFrom }
              : u.id === watcher.id
                ? { ...u, pos: middle }
                : u,
          ),
        },
      },
    },
    "tactical",
  );
  await tacticalReady();
  await walkTo(
    second_setter.id,
    [...secondBeside].sort(
      (a, b) => manhattan(a, secondFrom) - manhattan(b, secondFrom),
    ),
  );
  await wheelOf(second_setter.id);
  await page
    .locator(`#radial-menu button[data-item="interact:${objective.id}"]`)
    .click();
  await expect
    .poll(async () => (await readSave()).state.activeMission.charges.length)
    .toBe(1);
  await page.keyboard.press("Escape");

  // ===========================================
  // 6. Both mouths in frame, the tracker counting
  // ===========================================

  // From the squad standing between the two, at the default zoom, which
  // holds both; the squad that set the charge selected, spent.
  await centreOn(watcher.id);
  await page.keyboard.press("Escape");
  await page.evaluate(
    (id) => window.__tutTactical__.selectUnit(id),
    second_setter.id,
  );
  await page.waitForTimeout(600);
  await page.keyboard.press("Escape");
  await page.mouse.move(720, 24);
  await settle();
  await page.screenshot({
    path: "docs/design/tunnel-sabotage-mission.png",
    animations: "disabled",
  });
  console.log("captured docs/design/tunnel-sabotage-mission.png");
  const tracker = await page
    .locator(`[data-objective-id="${objective.id}"]`)
    .first()
    .textContent();
  const final = (await readSave()).state.activeMission;
  console.log(
    JSON.stringify({
      day: offered.overworld.day,
      city: sabotage.cityId,
      difficulty: sabotage.difficulty,
      spreadDueDay: sabotage.tunnelSabotage.spreadDueDay,
      mouths: mouths.map((m) => m.id),
      sealed: first.id,
      charged: second.id,
      gap: manhattan(first.pos, second.pos),
      turn: final.turn,
      drawn: await page.evaluate(
        () => document.body.dataset.tacticalTunnelMouths,
      ),
      tracker,
    }),
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await loader.close();
}
