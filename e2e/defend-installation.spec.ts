/// <reference types="node" />
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { GameState } from "../src/save/model/game-state";
import type { SaveEnvelope } from "../src/save/model/save-envelope";
import { waitForBugPhasePlayed } from "./bug-phase.helper";
import { tacticalModelsReady } from "./capture-frame.helper";
import {
  deployAndLaunch,
  reachFirstMission,
  settleForShot,
} from "./mission-capture.helper";

const SAVE_KEY = "tut:save:autosave";

/** The defence staged onto the first offer. */
const DEFENCE = {
  installation: "sensor-array" as const,
  deployableId: "staged-sensor-array",
  generators: 2,
  waves: 3,
};

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

/** Ends the player's turn and waits for the bugs to play out. */
async function endTurn(page: Page): Promise<void> {
  await page.locator('#action-bar [data-action="end-turn"]').click();
  await waitForBugPhasePlayed(page);
  await settleForShot(page);
}

/**
 * The defence of #1175, staged and said so: whether a region is offered
 * one is a per-day roll against its installations, so the first offer
 * on the fixed seed is rewritten into a defence through the autosave.
 * What is real from there: the briefing reads the installation and its
 * waves off the offer, the map raises the landmark and stands the
 * generators, the tracker counts them, the first wave lands on the
 * timer and is logged against the total.
 */
test("a defence briefs, stands its generators and counts its waves (#1175)", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });

  await reachFirstMission(page, "4242");
  const rows = page.locator('[data-role="mission-list"] [data-mission-id]');
  const missionId = await rows.first().getAttribute("data-mission-id");
  await patchSave(page, (state) => ({
    ...state,
    overworld: {
      ...state.overworld,
      missions: state.overworld.missions.map((mission) =>
        mission.id === missionId
          ? { ...mission, typeId: "defend-installation", defence: DEFENCE }
          : mission,
      ),
    },
  }));
  await resume(page, "overworld");

  // The briefing names the installation and the waves.
  await rows.first().click();
  const details = page.locator('[data-role="mission-details"]');
  await expect(details.locator('[data-field="detail-type"]')).toHaveText(
    "Defend Installation",
  );
  await expect(
    details.locator('[data-field="detail-installation"]'),
  ).toHaveText("Sensor array · 2 generators");
  await expect(details.locator('[data-field="detail-waves"]')).toHaveText(
    "3 timed waves",
  );
  await details.screenshot({
    path: "docs/design/defend-installation-briefing.png",
  });

  await deployAndLaunch(page);
  await tacticalModelsReady(page);
  await settleForShot(page);

  // The tracker holds the defence, open, with both generators up.
  const row = page.locator("[data-objective-id][data-status]");
  await expect(row).toHaveCount(1);
  await expect(row).toHaveAttribute("data-status", "open");
  await expect(row).toContainText("Defend the sensor array");
  const progress = row.locator('[data-role="defence-progress"]');
  await expect(progress).toHaveText("2 / 2 generators · wave 0 / 3");
  await page.screenshot({ path: "docs/design/defend-installation-hud.png" });

  // Bring a squad beside a generator so the shot shows what the force
  // is holding: the generators stand at least six tiles out, in fog.
  await patchSave(page, (state) => {
    const mission = state.activeMission!;
    const generator = mission.units.find((unit) => unit.kind === "generator");
    const squad = mission.units.find(
      (unit) => unit.team === "tdf" && unit.kind === "squad" && unit.hp > 0,
    );
    if (generator === undefined || squad === undefined) {
      throw new Error("no generator or squad on the map");
    }
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
        x: generator.pos.x + dx,
        y: generator.pos.y,
        z: generator.pos.z + dz,
      }))
      .find((tile) => !taken.has(`${tile.x},${tile.y},${tile.z}`));
    if (beside === undefined) throw new Error("no free tile by the generator");
    return {
      ...state,
      activeMission: {
        ...mission,
        units: mission.units.map((unit) =>
          unit.id === squad.id ? { ...unit, pos: beside } : unit,
        ),
      },
    };
  });
  await resume(page, "tactical");
  await tacticalModelsReady(page);
  await settleForShot(page);
  await page.locator("#tactical-viewport").screenshot({
    path: "docs/design/defend-installation-generators.png",
  });

  // The first wave lands in the bug phase of turn 3, whoever is alive,
  // and the log counts it against the total.
  await endTurn(page);
  await endTurn(page);
  await endTurn(page);
  const log = page.locator('[data-role="event-log-list"] li');
  await expect(log.filter({ hasText: "Wave 1 of 3" })).toHaveCount(1, {
    timeout: 60_000,
  });
  await expect(progress).toContainText("wave 1 / 3");
  await page.screenshot({ path: "docs/design/defend-installation-wave.png" });
  expect(errors).toEqual([]);
});
