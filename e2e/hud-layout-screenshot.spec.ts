import { expect, test } from "@playwright/test";

import { FixtureMapBuilder } from "../src/mapgen/service/fixture-map-builder";
import type { GameState } from "../src/save/model/game-state";
import type { Unit } from "../src/tactical/model/unit";
import type { UnitTemplate } from "../src/tactical/model/unit-template";
import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";
import { drawnFrame, tacticalModelsReady } from "./capture-frame.helper";
import { launchMission, settleForShot } from "./mission-capture.helper";
import { stageMission } from "./mission-staging.helper";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** The autosave the mission is rewritten through. */
const SAVE_KEY = "tut:save:autosave";

/** A brute as the unit factory would freeze it, two tiles a side. */
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
      profile: {
        range: 1,
        accuracy: 65,
        damage: 10,
        armorPen: 2,
        aoe: { radius: 1, falloff: 0.6 },
        demoForce: 3,
      },
    },
  ],
  sightRange: 10,
  armor: 3,
  passClass: "infantry",
  modelId: "bug.brute",
  equipment: [],
  footprint: 2,
  xpValue: 60,
};

/**
 * The HUD's layout since #1134: the force and the objectives down the
 * left rail over the event log, the unit card alone on the right, and
 * a bug's card when a bug is clicked.
 *
 *   CAPTURE=1 pnpm exec playwright test e2e/hud-layout-screenshot.spec.ts
 */
test("the rail holds the force and the objectives, the card holds one unit, and a clicked bug is read on it", async ({
  page,
}) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the HUD layout screenshots",
  );
  test.setTimeout(180_000);
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
  const brute: Unit = {
    id: "brute-1",
    kind: "bug",
    team: "bugs",
    sourceId: "brute",
    templateId: BRUTE_TEMPLATE.id,
    pos: { x: 12, y: 0, z: 8 },
    facing: "w",
    hp: BRUTE_TEMPLATE.maxHp,
    maxHp: BRUTE_TEMPLATE.maxHp,
    ap: BRUTE_TEMPLATE.maxAp,
    maxAp: BRUTE_TEMPLATE.maxAp,
    status: [],
    passClass: "infantry",
  };
  const rewritten: GameState = {
    ...envelope.state,
    activeMission: stageMission(mission, {
      map: new FixtureMapBuilder(32, 24, 1).fillGround().build(),
      units: [
        ...force.map((unit, index) => ({
          ...unit,
          pos: { x: 4 + index, y: 0, z: 8 },
          facing: "e" as const,
        })),
        brute,
      ],
      templates: { ...mission.templates, [BRUTE_TEMPLATE.id]: BRUTE_TEMPLATE },
    }),
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
  await settleForShot(page);

  // The mech: the tallest card, alone in its column, no scrollbar.
  const mech = force.find((unit) => unit.kind === "mech")!;
  await page.evaluate(
    (id) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(id),
    mech.id,
  );
  await expect(page.locator("body")).toHaveAttribute(
    "data-tactical-selected",
    mech.id,
  );
  const side = page.locator(".tut-hud__side");
  expect(
    await side.evaluate((el) => el.scrollHeight - el.clientHeight),
    "the card must fit its column",
  ).toBeLessThanOrEqual(1);
  await drawnFrame(page);
  await page.screenshot({ path: "docs/design/ui-hud-layout.png" });

  // The brute, clicked with the mech selected: aimed at, and read.
  await page.evaluate(
    (id) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(id),
    brute.id,
  );
  const card = page.locator("#unit-card");
  await expect(card).toHaveAttribute("data-inspecting-enemy", "true");
  await expect(card.locator('[data-field="unit-side"]')).toContainText("2×2");
  await expect(card.locator('[data-field="unit-name"]')).toHaveText("Brute");
  // Shot while the brute is on the card: Escape would put the mech back.
  await drawnFrame(page);
  await page.screenshot({ path: "docs/design/ui-hud-bug-card.png" });
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});
