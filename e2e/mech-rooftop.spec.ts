import { expect, test } from "@playwright/test";
import { SurfaceIds } from "../src/mapgen/data/surfaces";
import { FixtureMapBuilder } from "../src/mapgen/service/fixture-map-builder";
import { MECH_BLUEPRINTS } from "../src/roster/data/mech-blueprints";
import { STARTER_PARTS } from "../src/roster/data/parts";
import type { GameState } from "../src/save/model/game-state";
import { initialVision } from "../src/tactical/service/vision-service";
import { openTileWheel, openUnitWheel, wheelItem } from "./action-wheel.helper";
import { tacticalModelsReady } from "./capture-frame.helper";
import { launchMission, settleForShot } from "./mission-capture.helper";

const SAVE = "tut:save:autosave";
const LANDING = { x: 14, y: 8, z: 7 };

test("a mech jumps twelve tiles onto a four-storey roof, walks and resumes there", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await launchMission(page, "4242");
  await tacticalModelsReady(page);
  const envelope = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!) as { state: GameState },
    SAVE,
  );
  const mission = envelope.state.activeMission!;
  const mech = mission.units.find((unit) => unit.kind === "mech")!;
  const scout = mission.units.find((unit) => unit.kind === "squad")!;
  const bug = mission.units.find((unit) => unit.team === "bugs")!;
  const builder = new FixtureMapBuilder(22, 16, 10).fillGround();
  const floors = Array.from({ length: 4 }, (_, index) => ({
    index,
    y: index * 2,
    rooms: [],
  }));
  builder.building({
    id: "tower",
    kind: "office",
    footprint: [{ x: 13, z: 6, w: 4, d: 4 }],
    groundLevel: 0,
    floors,
    roof: { kind: "flat", walkable: true },
    entrances: [],
    connectorIds: [],
  });
  for (let x = 13; x <= 16; x++)
    for (let z = 6; z <= 9; z++) {
      for (const floor of floors)
        builder.tile({ x, y: floor.y, z }, SurfaceIds.FLOOR, {
          buildingId: "tower",
          floorIndex: floor.index,
        });
      builder.tile({ x, y: 8, z }, SurfaceIds.ROOF, { buildingId: "tower" });
      for (const y of [0, 2, 4, 6, 8]) {
        const wall = y === 8 ? "half" : "window";
        if (x === 13) builder.wall({ x, y, z }, "w", wall);
        if (x === 16) builder.wall({ x, y, z }, "e", wall);
        if (z === 6) builder.wall({ x, y, z }, "n", wall);
        if (z === 9) builder.wall({ x, y, z }, "s", wall);
      }
    }
  const positioned = {
    ...mission,
    map: builder.build(),
    units: [
      { ...mech, pos: { x: 2, y: 0, z: 7 }, heat: 0, ap: 2 },
      { ...scout, pos: { x: 16, y: 8, z: 8 } },
      { ...bug, pos: { x: 20, y: 0, z: 14 } },
    ],
    templates: {
      ...mission.templates,
      [mech.templateId]: {
        ...mission.templates[mech.templateId],
        loadout: MECH_BLUEPRINTS[0],
        systems: {
          heatCapacity: 22,
          cooling: 4,
          idleHeat: 0,
          movementHeat: 0,
          ...STARTER_PARTS.find(({ id }) => id === "legs-jumper")!.traits,
        },
      },
    },
    spawners: [],
    objectives: [],
    effects: [],
    extraction: [],
    radars: [],
  };
  const saved = {
    ...envelope,
    state: {
      ...envelope.state,
      activeMission: { ...positioned, vision: initialVision(positioned) },
    },
  };
  await page.evaluate(
    ({ key, saved }) => localStorage.setItem(key, JSON.stringify(saved)),
    { key: SAVE, saved },
  );
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  await tacticalModelsReady(page);
  await settleForShot(page);
  await openUnitWheel(page, mech.id);
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.__tutTactical__!.stepLayer(999));
  await openTileWheel(page, LANDING);
  const jump = wheelItem(
    page,
    `mech:jump:${LANDING.x},${LANDING.y},${LANDING.z}`,
  );
  await expect(jump).toBeEnabled();
  await jump.hover();
  await expect(page.locator("body")).toHaveAttribute(
    "data-tactical-blast-tiles",
    "1",
  );
  await jump.click();
  await expect(page.locator("body")).not.toHaveAttribute(
    "data-tactical-playing",
    "true",
  );
  const unit = () =>
    page.evaluate(
      ({ key, id }) => {
        const state = (
          JSON.parse(localStorage.getItem(key)!) as { state: GameState }
        ).state;
        return state.activeMission!.units.find((unit) => unit.id === id);
      },
      { key: SAVE, id: mech.id },
    );
  await expect.poll(unit).toMatchObject({ pos: LANDING, heat: 5, ap: 1 });
  // Wait for the rendered feet as well as the authoritative landing state.
  await expect
    .poll(() =>
      page.evaluate(
        ({ id, tile }) => {
          const hooks = window.__tutTactical__!;
          const feet = hooks.unitScreenPosition(id);
          const roof = hooks.tileScreenPosition(tile);
          return feet && roof
            ? Math.hypot(feet.x - roof.x, feet.y - roof.y)
            : Infinity;
        },
        { id: mech.id, tile: LANDING },
      ),
    )
    .toBeLessThan(2);
  if (process.env.CAPTURE)
    await page.screenshot({ path: testInfo.outputPath("rooftop-landing.png") });
  const walk = { x: 15, y: 8, z: 7 };
  await openTileWheel(page, walk);
  await wheelItem(page, `move:${walk.x},${walk.y},${walk.z}`).click();
  await expect.poll(unit).toMatchObject({ pos: walk, ap: 0 });
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  await tacticalModelsReady(page);
  expect(await unit()).toMatchObject({ pos: walk, heat: 5, ap: 0 });
  expect(errors).toEqual([]);
});
