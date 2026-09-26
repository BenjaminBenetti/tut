import { expect, test } from "@playwright/test";

import { FixtureMapBuilder } from "../src/mapgen/service/fixture-map-builder";
import type { GameState } from "../src/save/model/game-state";
// Registers the blast event in the log's union for the check below.
import "../src/tactical/model/blast-resolved-event";
import type { TileCoord } from "../src/mapgen/model/tile-coord";
import type { Unit } from "../src/tactical/model/unit";
import type { UnitTemplate } from "../src/tactical/model/unit-template";
import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";
import { wheel, wheelItem } from "./action-wheel.helper";
import { tacticalModelsReady } from "./capture-frame.helper";
import { launchMission, settleForShot } from "./mission-capture.helper";
import { stageMission } from "./mission-staging.helper";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** The autosave the mission is rewritten through. */
const SAVE_KEY = "tut:save:autosave";

/** Where the shell is aimed: an empty tile with a swarmer on three sides. */
const IMPACT: TileCoord = { x: 10, y: 0, z: 9 };

/** Where the mech stands, five tiles from the impact. */
const MECH_POS: TileCoord = { x: 6, y: 0, z: 8 };

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
  xpValue: 10,
};

/** Three swarmers, each one tile from the impact. */
const SWARMERS: readonly TileCoord[] = [
  { x: 10, y: 0, z: 8 },
  { x: 9, y: 0, z: 9 },
  { x: 11, y: 0, z: 9 },
];

/** Seeds tried until the shell lands; each rerolls the shot. */
const SEEDS = [11, 12, 13, 14, 15];

/** Frames shot in a row after the trigger, to catch the burst. */
const FRAMES = 8;

/**
 * A blast is one explosion (#1130, item 8): the missile pod fired at a
 * tile with three swarmers around it plays the shell, then one burst
 * at the impact with every number landing at once. The frame is caught
 * by shooting several in a row straight after the trigger; the shell
 * lands at about a quarter second and the burst lasts half a second,
 * so one of the first frames has it.
 *
 *   CAPTURE=1 pnpm exec playwright test e2e/blast-explosion-screenshot.spec.ts
 *
 * Frames land in `test-results/blast-explosion/frame-N.png`; pick the
 * one with the burst for `docs/design/ui-blast-explosion.png`.
 */
test("the missile pod's blast plays as one explosion", async ({ page }) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the explosion frames",
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
  const mech = mission.units.find((unit) => unit.kind === "mech")!;
  const mechTemplate = mission.templates[mech.templateId];
  const squads = mission.units.filter(
    (unit) => unit.kind === "squad" && unit.hp > 0,
  );
  const swarmers: Unit[] = SWARMERS.map((pos, index) => ({
    id: `swarmer-${String(index + 1)}`,
    kind: "bug",
    team: "bugs",
    sourceId: "swarmer",
    templateId: SWARMER_TEMPLATE.id,
    pos,
    facing: "w",
    hp: SWARMER_TEMPLATE.maxHp,
    maxHp: SWARMER_TEMPLATE.maxHp,
    ap: SWARMER_TEMPLATE.maxAp,
    maxAp: SWARMER_TEMPLATE.maxAp,
    status: [],
    passClass: "infantry",
  }));
  const staged = stageMission(mission, {
    map: new FixtureMapBuilder(32, 24, 1).fillGround().build(),
    units: [
      { ...mech, pos: MECH_POS, facing: "e" as const },
      ...squads.map((unit, index) => ({
        ...unit,
        pos: { x: 4, y: 0, z: 6 + index * 4 },
        facing: "e" as const,
      })),
      ...swarmers,
    ],
    templates: {
      ...mission.templates,
      // The pod at full accuracy, so the shot is the 95 % ceiling and the
      // seeds below only have to beat a one-in-twenty miss.
      [mech.templateId]: {
        ...mechTemplate,
        weapons: mechTemplate.weapons.map((weapon) =>
          weapon.id === "back-weapon"
            ? { ...weapon, profile: { ...weapon.profile, accuracy: 100 } }
            : weapon,
        ),
      },
      [SWARMER_TEMPLATE.id]: SWARMER_TEMPLATE,
    },
  });
  const tileId = `attack-tile:${String(IMPACT.x)},${String(IMPACT.y)},${String(IMPACT.z)}`;

  let landed = false;
  for (const seed of SEEDS) {
    const rewritten: GameState = {
      ...envelope.state,
      activeMission: { ...staged, seed },
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
    await page.evaluate(
      (id) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(id),
      mech.id,
    );
    await page.evaluate(
      (tile) => (globalThis as HookGlobal).__tutTactical__?.selectTile(tile),
      IMPACT,
    );
    await expect(wheel(page)).toHaveAttribute("data-open", "true");
    await wheelItem(page, tileId).click();
    const pod = wheelItem(page, `${tileId}:back-weapon`);
    await expect(pod).toContainText("Missile Pod");
    await pod.click();
    for (let frame = 0; frame < FRAMES; frame++) {
      await page.locator("#tactical-viewport").screenshot({
        path: `test-results/blast-explosion/seed-${String(seed)}-frame-${String(frame)}.png`,
      });
    }
    // The literal, not the constant: the function runs in the page, where
    // the spec's imports do not exist. The import above only brings the
    // event's registration into the union so the literal narrows.
    landed = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      if (raw === null) return false;
      const saved = JSON.parse(raw) as { state: GameState };
      return (saved.state.activeMission?.log ?? []).some(
        (event) =>
          event.type === "tactical:blast-resolved" && event.payload.hit,
      );
    }, SAVE_KEY);
    if (landed) break;
  }
  expect(landed, "no seed landed the shell").toBe(true);
  expect(errors).toEqual([]);
});
