/// <reference types="node" />
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { GameState } from "../src/save/model/game-state";
import type { SaveEnvelope } from "../src/save/model/save-envelope";
import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";
import { openUnitWheel, wheelItem } from "./action-wheel.helper";
import { tacticalModelsReady } from "./capture-frame.helper";
import {
  deployAndLaunch,
  reachFirstMission,
  settleForShot,
} from "./mission-capture.helper";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

const SAVE_KEY = "tut:save:autosave";

/** What the staged carcass is worth. */
const CARCASS_POINTS = 20;

/** Rewrites the autosaved campaign in place. */
async function patchSave(
  page: Page,
  patch: (state: GameState) => GameState,
): Promise<void> {
  const envelope = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!) as SaveEnvelope<GameState>,
    SAVE_KEY,
  );
  const next = { ...envelope, state: patch(envelope.state) };
  await page.evaluate(
    ({ key, saved }) => {
      localStorage.setItem(key, JSON.stringify(saved));
    },
    { key: SAVE_KEY, saved: next },
  );
}

/** Resumes the autosave from the main menu after a patch. */
async function resume(page: Page, screen: string): Promise<void> {
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  await expect(page.locator("body")).toHaveAttribute("data-screen", screen);
}

/** The carcasses the scene host reports. */
async function carcasses(
  page: Page,
): Promise<ReturnType<TacticalTestHooks["carcasses"]>> {
  return page.evaluate(
    () => (globalThis as HookGlobal).__tutTactical__?.carcasses() ?? [],
  );
}

/**
 * The harvest loop of #1171, staged and said so: whether an offer carries
 * a carcass is a per-mission roll, so the first offer on the fixed seed
 * is given one through the autosave before deploying; then, because the
 * placer keeps a carcass at least eight tiles from the deploy zone and
 * a walk there crosses bug phases the capture harness cannot make
 * reproducible, the carcass is moved beside a deployed squad in the
 * mission save and the mission resumed. What is real: the carcass comes
 * from the mission's own map params, is drawn, is offered on the
 * squad's wheel, is stripped by the rules, and reaches the debrief.
 */
test("a squad harvests a tech carcass and the debrief reports it (#1171)", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const body = page.locator("body");

  await reachFirstMission(page, "4242");
  const rows = page.locator('[data-role="mission-list"] [data-mission-id]');
  const missionId = await rows.first().getAttribute("data-mission-id");
  await patchSave(page, (state) => ({
    ...state,
    overworld: {
      ...state.overworld,
      missions: state.overworld.missions.map((mission) =>
        mission.id === missionId
          ? {
              ...mission,
              mapParams: {
                ...mission.mapParams,
                techCarcass: { techPoints: CARCASS_POINTS },
              },
            }
          : mission,
      ),
    },
  }));
  await resume(page, "overworld");
  // The offer advertises it.
  await expect(rows.first().locator('[data-field="carcass"]')).toBeVisible();

  await deployAndLaunch(page);
  await tacticalModelsReady(page);
  await settleForShot(page);
  const found = await carcasses(page);
  expect(found).toHaveLength(1);
  expect(found[0]?.harvested).toBe(false);
  // Drawn only where the force has looked: eight tiles out it is in fog.
  await expect(body).toHaveAttribute("data-tactical-carcasses", "0");

  // Bring the carcass to a squad: a free tile beside it on its level.
  let squadId = "";
  await patchSave(page, (state) => {
    const mission = state.activeMission!;
    const squad = mission.units.find(
      (unit) => unit.team === "tdf" && unit.kind === "squad" && unit.hp > 0,
    );
    if (squad === undefined) throw new Error("no squad deployed");
    squadId = squad.id;
    const taken = new Set(
      mission.units.map((u) => `${u.pos.x},${u.pos.y},${u.pos.z}`),
    );
    const beside = [
      { dx: 1, dz: 0 },
      { dx: -1, dz: 0 },
      { dx: 0, dz: 1 },
      { dx: 0, dz: -1 },
    ]
      .map(({ dx, dz }) => ({
        x: squad.pos.x + dx,
        y: squad.pos.y,
        z: squad.pos.z + dz,
      }))
      .find((tile) => !taken.has(`${tile.x},${tile.y},${tile.z}`));
    if (beside === undefined) throw new Error("no free tile beside the squad");
    return {
      ...state,
      activeMission: {
        ...mission,
        carcasses: mission.carcasses.map((carcass) => ({
          ...carcass,
          pos: beside,
        })),
      },
    };
  });
  await resume(page, "tactical");
  await tacticalModelsReady(page);
  await settleForShot(page);
  const [carcass] = await carcasses(page);
  expect(carcass).toBeDefined();
  // Beside the deploy zone it is explored, so now it is drawn.
  await expect(body).toHaveAttribute("data-tactical-carcasses", "1");
  await page.locator("#tactical-viewport").screenshot({
    path: "docs/design/tech-carcass-on-map.png",
  });

  // Harvest from the squad's own wheel.
  await openUnitWheel(page, squadId);
  const harvest = wheelItem(page, `harvest:${carcass.id}`);
  await expect(harvest).toBeVisible();
  await expect(harvest).toContainText("Harvest");
  await harvest.click();
  await expect
    .poll(async () => (await carcasses(page))[0]?.harvested)
    .toBe(true);
  // Stripped carcasses come off the map.
  await expect(body).toHaveAttribute("data-tactical-carcasses", "0");
  await openUnitWheel(page, squadId);
  await expect(wheelItem(page, `harvest:${carcass.id}`)).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Leaving records the mission as lost, and the debrief says the
  // harvest went with the squad.
  await page.locator('#turn-banner [data-action="leave-mission"]').click();
  await page
    .locator('[data-role="leave-dialog"] [data-action="leave-confirm"]')
    .click();
  await expect(body).toHaveAttribute("data-screen", "mission-results");
  const line = page.locator(
    '[data-screen="mission-results"] [data-field="tech-points"]',
  );
  await expect(line).toContainText(`${CARCASS_POINTS} harvested`);
  await expect(line).toContainText("lost");
  expect(errors).toEqual([]);
});
