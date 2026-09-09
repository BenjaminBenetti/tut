import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { TacticalState } from "../src/tactical/model/tactical-state";
import { MODEL_MANIFEST } from "../src/graphics/data/model-manifest";
import { rectContains } from "../src/core/service/grid-math";
import {
  drawnFrame,
  tacticalModelsReady,
  tapCameraKey,
} from "./capture-frame.helper";
import { launchMission, settleForShot } from "./mission-capture.helper";

/** Real campaign consumer: generated transport, external deployment and return point. */
test("lands the campaign force beside its rendered transport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const errors: string[] = [];
  const loaded: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.ok()) loaded.push(response.url());
  });
  await launchMission(page, "4242");
  await tacticalModelsReady(page);
  const mission = await page.evaluate(() => {
    const raw = localStorage.getItem("tut:save:autosave");
    if (!raw) throw new Error("The real campaign has no autosave");
    const save = JSON.parse(raw) as { state: { activeMission: TacticalState } };
    return save.state.activeMission;
  });
  expect(mission.map.dropships).toHaveLength(1);
  const site = mission.map.dropships![0];
  const boarding = mission.map.hooks.deployZones.find(
    (zone) => zone.id === site.deployZoneId,
  )!;
  expect(boarding.tiles).toHaveLength(16);
  expect(mission.extraction).toEqual(boarding.tiles);
  const force = mission.units.filter((unit) => unit.team === "tdf");
  expect(force).toHaveLength(3);
  expect(new Set(force.map((unit) => unit.kind))).toEqual(
    new Set(["squad", "mech"]),
  );
  for (const unit of force) {
    expect(boarding.tiles).toContainEqual(unit.pos);
    expect(rectContains(site.footprint, unit.pos.x, unit.pos.z)).toBe(false);
  }
  expect(
    loaded.some((url) => url.endsWith(MODEL_MANIFEST["tdf.dropship"].path)),
  ).toBe(true);
  expect(errors).toEqual([]);
  if (process.env.CAPTURE === undefined) return;
  const out =
    process.env.CAPTURE_OUTPUT ??
    "docs/design/diagnostics/911/generated/mission";
  mkdirSync(out, { recursive: true });
  await settleForShot(page);
  await page.mouse.move(0, 0);
  await drawnFrame(page);
  await page.screenshot({ path: `${out}/arrival.png` });
  await tapCameraKey(page, "e");
  await tapCameraKey(page, "e");
  await page.screenshot({ path: `${out}/arrival-opposite.png` });
  writeFileSync(
    `${out}/arrival.json`,
    JSON.stringify(
      {
        campaignSeed: "4242",
        recipe: mission.map.recipe,
        site,
        boarding: boarding.tiles,
        extraction: mission.extraction,
        force: force.map(({ id, kind, pos }) => ({ id, kind, pos })),
        viewport: { width: 1600, height: 1000 },
        framing:
          "Actual arrival camera, then two synchronous E taps; real campaign fog, pointer at (0,0).",
      },
      null,
      2,
    ) + "\n",
  );
});
