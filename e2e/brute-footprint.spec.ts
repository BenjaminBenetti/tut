import { expect, test } from "@playwright/test";

import { FixtureMapBuilder } from "../src/mapgen/service/fixture-map-builder";
import type { GameState } from "../src/save/model/game-state";
import type { Unit } from "../src/tactical/model/unit";
import type { UnitTemplate } from "../src/tactical/model/unit-template";
import { initialVision } from "../src/tactical/service/vision-service";
import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";
import { drawnFrame, tacticalModelsReady } from "./capture-frame.helper";
import { launchMission, settleForShot } from "./mission-capture.helper";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** The autosave the mission is rewritten through. */
const SAVE_KEY = "tut:save:autosave";

/** Where the brute's four tiles start: the anchor, lowest x and lowest z. */
const ANCHOR = { x: 12, y: 0, z: 8 };

/** The brute as the tactical unit factory would freeze it, two tiles a side (#1130). */
const BRUTE_TEMPLATE: UnitTemplate = {
  id: "bug:brute",
  name: "Brute",
  maxHp: 30,
  maxAp: 2,
  move: 3,
  weapons: [
    {
      id: "primary",
      name: "Attack",
      profile: { range: 1, accuracy: 65, damage: 10, armorPen: 2 },
    },
  ],
  sightRange: 10,
  armor: 3,
  passClass: "infantry",
  modelId: "bug.brute",
  footprint: 2,
};

/**
 * A 2×2 brute stands on the corner its four tiles share (#1130).
 *
 * The starter force is launched for real, then the mission is rewritten
 * onto a flat field with the force in a line and one brute two tiles
 * a side just east of it, in plain sight, so it is spotted and drawn on
 * load. The check is geometric and camera-independent: the brute's
 * drawn feet must project to the midpoint of its anchor tile and the
 * tile diagonally across the block, which is where the shared corner
 * is under any orthographic view. Before this the model stood on the
 * anchor tile's own centre, squashed into one tile of the four.
 *
 *   CAPTURE=1 pnpm exec playwright test e2e/brute-footprint.spec.ts
 */
test("a 2×2 brute is drawn on the corner its four tiles share", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await launchMission(page, "4242");
  await tacticalModelsReady(page);

  const map = new FixtureMapBuilder(32, 24, 1).fillGround().build();
  // Two trips: the save is read in the page, the board is rebuilt here
  // so the real vision rules can look from it (a resumed save keeps the
  // vision it was given; nothing recomputes it on load), and the result
  // is written back.
  const envelope = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!) as { state: GameState },
    SAVE_KEY,
  );
  const mission = envelope.state.activeMission!;
  const force = mission.units.filter(
    (unit) => unit.team === "tdf" && unit.hp > 0,
  );
  const tdfCount = force.length;
  const brute: Unit = {
    id: "brute-1",
    kind: "bug",
    team: "bugs",
    sourceId: "brute",
    templateId: BRUTE_TEMPLATE.id,
    pos: ANCHOR,
    facing: "w",
    hp: BRUTE_TEMPLATE.maxHp,
    maxHp: BRUTE_TEMPLATE.maxHp,
    ap: BRUTE_TEMPLATE.maxAp,
    maxAp: BRUTE_TEMPLATE.maxAp,
    status: [],
    passClass: "infantry",
  };
  const { vision: _stale, ...blind } = {
    ...mission,
    map,
    // The force in a line four tiles west of the brute, well inside its
    // sight, so the brute is spotted as the save loads.
    units: [
      ...force.map((unit, index) => ({
        ...unit,
        pos: { x: 4 + index, y: 0, z: 8 },
        facing: "e" as const,
      })),
      brute,
    ],
    templates: { ...mission.templates, [BRUTE_TEMPLATE.id]: BRUTE_TEMPLATE },
    spawners: [],
    objectives: [],
    extraction: [],
    radars: [],
    effects: [],
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
  expect(tdfCount).toBeGreaterThan(0);

  await page.reload();
  await page.locator('[data-action="continue"]').click();
  await tacticalModelsReady(page);
  await expect(page.locator("body")).toHaveAttribute(
    "data-tactical-units",
    String(tdfCount + 1),
  );
  await settleForShot(page);
  await drawnFrame(page);

  const points = await page.evaluate(
    ({ anchor }) => {
      const hooks = (globalThis as HookGlobal).__tutTactical__;
      return {
        brute: hooks?.unitScreenPosition("brute-1"),
        anchor: hooks?.tileScreenPosition(anchor),
        across: hooks?.tileScreenPosition({
          x: anchor.x + 1,
          y: anchor.y,
          z: anchor.z + 1,
        }),
      };
    },
    { anchor: ANCHOR },
  );
  expect(points.brute).toBeDefined();
  expect(points.anchor).toBeDefined();
  expect(points.across).toBeDefined();
  // The shared corner of the block projects to the midpoint of the two
  // diagonal tile centres under any orthographic camera.
  const mid = {
    x: (points.anchor!.x + points.across!.x) / 2,
    y: (points.anchor!.y + points.across!.y) / 2,
  };
  expect(Math.abs(points.brute!.x - mid.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(points.brute!.y - mid.y)).toBeLessThanOrEqual(2);
  // And it is not on the anchor tile's own centre, which is where a
  // one-tile unit stands and where the brute used to be squashed.
  const off = Math.hypot(
    points.brute!.x - points.anchor!.x,
    points.brute!.y - points.anchor!.y,
  );
  expect(off).toBeGreaterThan(4);

  if (process.env.CAPTURE) {
    await page.screenshot({ path: "docs/design/brute-footprint.png" });
  }
  expect(errors).toEqual([]);
});
