/// <reference types="node" />
import { expect, test } from "@playwright/test";
import type { OrthographicCameraRig } from "../src/graphics/service/orthographic-camera-rig";
import type { TacticalMap } from "../src/mapgen/model/tactical-map";
import { MISSION_SITES } from "../src/mapgen/data/mission-sites";
import {
  assertNoAssetFallback,
  drawnFrame,
  watchAssetFallback,
} from "./capture-frame.helper";

/** Diagnostic access to the real generated map and camera, injected only by this capture. */
interface SitePreview {
  readonly map: TacticalMap;
  readonly rig: OrthographicCameraRig;
}

for (const site of Object.values(MISSION_SITES)) {
  test(`Map Lab generates and renders the ${site.id} compound`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    watchAssetFallback(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1700, height: 1100 });
    await page.route("**/src/mapgen-preview.ts*", async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      const marker =
        /const builder = new TacticalSceneBuilder\(\{[\s\S]*?\}\);/;
      expect(body).toMatch(marker);
      await route.fulfill({
        response,
        body: body.replace(
          marker,
          "$& globalThis.__sitePreview = { map, rig };",
        ),
      });
    });
    const query = new URLSearchParams({
      seed: "installation-review",
      biome: "temperate",
      settlement: "town",
      size: "medium",
      site: site.id,
      models: "1",
      units: "1",
    });
    await page.goto(`/mapgen-preview.html?${query}`);
    await expect(page.locator("body")).toHaveAttribute(
      "data-models-ready",
      "true",
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-preview-ready",
      "true",
    );
    await expect(page.locator("#site")).toHaveValue(site.id);
    const stats = await page.evaluate((definition) => {
      const { map, rig } = (
        globalThis as typeof globalThis & { __sitePreview: SitePreview }
      ).__sitePreview;
      const anchor = map.props.find(
        (prop) => prop.kind === definition.structures[0].kind,
      )!;
      const origin = {
        x: anchor.tile.x - definition.structures[0].x,
        y: anchor.tile.y,
        z: anchor.tile.z - definition.structures[0].z,
      };
      rig.lookAt({
        x: origin.x + definition.width / 2,
        y: origin.y * 0.75 + 1.8,
        z: origin.z + definition.depth / 2,
      });
      rig.zoomBy(39 / rig.getState().zoom);
      rig.apply();
      return {
        origin,
        structures: map.props
          .filter((prop) => prop.kind.startsWith("installation-"))
          .map((prop) => prop.kind),
        generators: map.hooks.objectives
          .filter((hook) => hook.kind === "generator")
          .map((hook) => hook.tiles[0]),
      };
    }, site);
    expect(stats.structures).toEqual(
      site.structures
        .filter((piece) => piece.kind.startsWith("installation-"))
        .map((piece) => piece.kind),
    );
    expect(stats.generators).toEqual(
      site.objectives.map((socket) => ({
        x: stats.origin.x + socket.x,
        y: stats.origin.y,
        z: stats.origin.z + socket.z,
      })),
    );
    await page.mouse.move(0, 0);
    await drawnFrame(page);
    assertNoAssetFallback(page, site.id);
    expect(errors).toEqual([]);
    await page.locator("#map-viewport").screenshot({
      path: `docs/design/diagnostics/installations/${site.id}.png`,
    });
    // The selector and share URL retain the chosen installation on regeneration.
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(new RegExp(`site=${site.id}`));
    await expect(page.locator("body")).toHaveAttribute(
      "data-models-ready",
      "true",
    );
    expect(errors).toEqual([]);
  });
}
