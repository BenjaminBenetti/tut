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

/** Capture-only access to the live rig; no camera result is replaced. */
interface LandingCameraGlobal {
  __landingRig?: {
    /** The live rig's current orientation. */
    getState(): { yawIndex: number };
  };
}

// Seed 9 covers the south-facing arrival; 4242 is the west-facing control.
for (const fixture of [
  { seed: "4242", facing: "w", yaw: 0, folder: "mission" },
  { seed: "9", facing: "s", yaw: 2, folder: "mission-s" },
]) {
  /** Real campaign consumer: generated transport, external deployment and return point. */
  test(`lands campaign ${fixture.seed} beside its rendered transport`, async ({
    page,
  }) => {
    // Three software-rendered shutters are optional evidence work; the normal
    // integration assertion retains the suite's regular test budget.
    if (process.env.CAPTURE !== undefined) test.setTimeout(120_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    const errors: string[] = [];
    const loaded: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.ok()) loaded.push(response.url());
    });
    await page.route(
      "**/src/graphics/service/orthographic-camera-rig.ts*",
      async (route) => {
        const response = await route.fetch();
        const source = await response.text();
        const marker = "this.state = createCameraState(initial);";
        expect(source).toContain(marker);
        await route.fulfill({
          response,
          body: source.replace(marker, marker + " window.__landingRig = this;"),
        });
      },
    );
    await launchMission(page, fixture.seed);
    await tacticalModelsReady(page);
    const mission = await page.evaluate(() => {
      const raw = localStorage.getItem("tut:save:autosave");
      if (!raw) throw new Error("The real campaign has no autosave");
      const save = JSON.parse(raw) as {
        state: { activeMission: TacticalState };
      };
      return save.state.activeMission;
    });
    expect(mission.map.dropships).toHaveLength(1);
    const site = mission.map.dropships![0];
    expect(site.facing).toBe(fixture.facing);
    // Read the host-created camera before any capture rotation. Disabling the
    // arrival rule must fail this integration check, even with valid placement.
    const initialYaw = await page.evaluate(
      () =>
        (globalThis as LandingCameraGlobal).__landingRig?.getState().yawIndex,
    );
    expect(initialYaw).toBe(fixture.yaw);
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
    const out = `${process.env.CAPTURE_OUTPUT ?? "docs/design/diagnostics/911/generated"}/${fixture.folder}`;
    mkdirSync(out, { recursive: true });
    await settleForShot(page);
    await page.mouse.move(0, 0);
    await drawnFrame(page);
    const arrival = await page.screenshot({ path: `${out}/arrival.png` });
    await tapCameraKey(page, "e");
    await tapCameraKey(page, "e");
    const opposite = await page.screenshot({
      path: `${out}/arrival-opposite.png`,
    });
    expect(arrival.equals(opposite)).toBe(false);
    await tapCameraKey(page, "e");
    await tapCameraKey(page, "e");
    const restored = await page.screenshot();
    expect(arrival.equals(restored)).toBe(true);
    writeFileSync(
      `${out}/arrival.json`,
      JSON.stringify(
        {
          campaignSeed: fixture.seed,
          initialYaw,
          oppositeYaw: (fixture.yaw + 2) % 4,
          restoredByteIdentical: true,
          recipe: mission.map.recipe,
          site,
          boarding: boarding.tiles,
          extraction: mission.extraction,
          force: force.map(({ id, kind, pos }) => ({ id, kind, pos })),
          viewport: { width: 1600, height: 1000 },
          framing:
            "Actual host-created arrival camera, then two synchronous E taps, then two more restore a byte-identical arrival. Seed 9 opposite is the old yaw-0 arrival defect on the same generated map. Real campaign fog, pointer at (0,0).",
        },
        null,
        2,
      ) + "\n",
    );
  });
}
