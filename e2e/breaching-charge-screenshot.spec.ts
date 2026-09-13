import { expect, test } from "@playwright/test";

import { FixtureMapBuilder } from "../src/mapgen/service/fixture-map-builder";
import type { TileCoord } from "../src/mapgen/model/tile-coord";
import type { GameState } from "../src/save/model/game-state";
import type { PlacedCharge } from "../src/tactical/model/equipment";
import type { Unit } from "../src/tactical/model/unit";
import type { UnitTemplate } from "../src/tactical/model/unit-template";
import { initialVision } from "../src/tactical/service/vision-service";
import { drawnFrame, tacticalModelsReady } from "./capture-frame.helper";
import { launchMission, settleForShot } from "./mission-capture.helper";

/** The autosave the mission is rewritten through. */
const SAVE_KEY = "tut:save:autosave";

/** Where the charge sits: four tiles south of the line, two swarmers beside it. */
const CHARGE_TILE: TileCoord = { x: 10, y: 0, z: 11 };

/** A swarmer as the unit factory would freeze it. */
const SWARMER_TEMPLATE: UnitTemplate = {
  id: "bug:swarmer",
  name: "Swarmer",
  maxHp: 6,
  maxAp: 2,
  move: 7,
  weapons: [
    {
      id: "primary",
      name: "Attack",
      profile: { range: 1, accuracy: 60, damage: 3, armorPen: 0 },
    },
  ],
  sightRange: 10,
  armor: 0,
  passClass: "infantry",
  modelId: "bug.swarmer",
  equipment: [],
  xpValue: 10,
};

/** Frames shot in a row once the bug phase has been triggered, to catch the detonation. */
const FRAMES = 14;

/**
 * A placed breaching charge and its detonation (#1132, item 4). The
 * board is rewritten with a charge already placed, due on the next
 * turn, and two swarmers beside it: the first frame shows the marker on
 * its tile; End turn plays the bug phase, and as the player's turn opens
 * the charge goes off, which the burst of frames catches.
 *
 *   CAPTURE=1 pnpm exec playwright test e2e/breaching-charge-screenshot.spec.ts
 *
 * The marker frame lands in `docs/design/ui-breaching-charge.png`; the
 * burst lands in `test-results/breaching-charge/frame-N.png`.
 */
test("a placed breaching charge is marked, then goes off as the next turn opens", async ({
  page,
}) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the breaching charge frames",
  );
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await launchMission(page, "4242");
  await tacticalModelsReady(page);

  const envelope = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!) as { state: GameState },
    SAVE_KEY,
  );
  const mission = envelope.state.activeMission!;
  const force = mission.units.filter(
    (unit) => unit.team === "tdf" && unit.hp > 0,
  );
  const owner = force.find((unit) => unit.kind === "squad") ?? force[0];
  const swarmers: Unit[] = [
    { x: 10, y: 0, z: 12 },
    { x: 11, y: 0, z: 11 },
  ].map((pos, index) => ({
    id: `swarmer-${String(index + 1)}`,
    kind: "bug",
    team: "bugs",
    sourceId: "swarmer",
    templateId: SWARMER_TEMPLATE.id,
    pos,
    facing: "n",
    hp: SWARMER_TEMPLATE.maxHp,
    maxHp: SWARMER_TEMPLATE.maxHp,
    ap: SWARMER_TEMPLATE.maxAp,
    maxAp: SWARMER_TEMPLATE.maxAp,
    status: [],
    passClass: "infantry",
  }));
  const charge: PlacedCharge = {
    id: "charge-1",
    ownerId: owner.id,
    equipmentId: "breaching-charge",
    tile: CHARGE_TILE,
    detonatesOnTurn: mission.turn + 1,
  };
  const { vision: _stale, ...blind } = {
    ...mission,
    map: new FixtureMapBuilder(32, 24, 1).fillGround().build(),
    units: [
      ...force.map((unit, index) => ({
        ...unit,
        pos: { x: 6 + index * 2, y: 0, z: 7 },
        facing: "s" as const,
      })),
      ...swarmers,
    ],
    templates: {
      ...mission.templates,
      [SWARMER_TEMPLATE.id]: SWARMER_TEMPLATE,
    },
    spawners: [],
    objectives: [],
    extraction: [],
    radars: [],
    effects: [],
    charges: [charge],
  };
  const rewritten: GameState = {
    ...envelope.state,
    activeMission: { ...blind, vision: initialVision(blind) },
  };
  await page.evaluate(
    ({ key, saved }) => {
      localStorage.setItem(key, JSON.stringify(saved));
    },
    { key: SAVE_KEY, saved: { ...envelope, state: rewritten } },
  );

  await page.reload();
  await page.locator('[data-action="continue"]').click();
  await tacticalModelsReady(page);
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-tactical-charges", "1");
  await settleForShot(page);
  await drawnFrame(page);
  await page.locator("#tactical-viewport").screenshot({
    path: "docs/design/ui-breaching-charge.png",
  });

  await page.locator('[data-action="end-turn"]').click();
  for (let frame = 0; frame < FRAMES; frame++) {
    await page.locator("#tactical-viewport").screenshot({
      path: `test-results/breaching-charge/frame-${String(frame).padStart(2, "0")}.png`,
    });
  }
  await expect(body).not.toHaveAttribute("data-phase-playing", "true", {
    timeout: 60_000,
  });
  await expect(body).toHaveAttribute("data-tactical-charges", "0");
  const dead = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (raw === null) return 0;
    const saved = JSON.parse(raw) as { state: GameState };
    return (saved.state.activeMission?.units ?? []).filter(
      (unit) => unit.team === "bugs" && unit.hp <= 0,
    ).length;
  }, SAVE_KEY);
  expect(dead, "the charge should have caught both swarmers").toBe(2);
  expect(errors).toEqual([]);
});
