/// <reference types="node" />
import { expect, test } from "@playwright/test";
import type { LayerFocus } from "../src/graphics/model/layer-focus";
import type { TileCoord } from "../src/mapgen/model/tile-coord";
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
  readonly builder: {
    /** Use the ordinary gameplay storey cut for interior review. */
    setLayerFocus(focus: LayerFocus): void;
    /** Whether a tile is hidden by that same renderer cut. */
    isCut(tile: TileCoord): boolean;
  };
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
          "$& globalThis.__sitePreview = { map, rig, builder };",
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
      const parcel = definition.buildings![0];
      const anchor = map.buildings.find(
        (building) => building.kind === parcel.template,
      )!;
      const origin = {
        x: anchor.footprint[0].x - parcel.rect.x,
        y: anchor.groundLevel,
        z: anchor.footprint[0].z - parcel.rect.z,
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
        buildings: map.buildings
          .filter((b) =>
            definition.buildings!.some((p) => p.template === b.kind),
          )
          .map((b) => ({
            kind: b.kind,
            floors: b.floors.length,
            entrances: b.entrances.length,
            rooms: b.floors.flatMap((f) => f.rooms).length,
          })),
        generators: map.hooks.objectives
          .filter((hook) => hook.kind === "generator")
          .map((hook) => ({
            tile: hook.tiles[0],
            buildingId: map.tiles.find(
              (tile) =>
                tile.x === hook.tiles[0].x &&
                tile.y === hook.tiles[0].y &&
                tile.z === hook.tiles[0].z,
            )?.buildingId,
          })),
      };
    }, site);
    expect(
      stats.buildings.map((b) => ({ kind: b.kind, floors: b.floors })),
    ).toEqual(
      site.buildings!.map((b) => ({ kind: b.template, floors: b.floors })),
    );
    for (const building of stats.buildings) {
      expect(building.entrances).toBe(2);
      expect(building.rooms).toBeGreaterThan(1);
    }
    expect(stats.generators).toHaveLength(site.objectives.length);
    expect(
      stats.generators.filter((generator) => generator.buildingId),
    ).toHaveLength(1);
    for (const [i, socket] of site.objectives.entries()) {
      const generator = stats.generators[i];
      if (socket.interior) {
        const building = site.buildings!.find(
          ({ rect }) =>
            socket.x >= rect.x &&
            socket.x < rect.x + rect.w &&
            socket.z >= rect.z &&
            socket.z < rect.z + rect.d,
        )!;
        expect(generator.buildingId).toBeTruthy();
        expect(generator.tile.y).toBe(stats.origin.y);
        expect(generator.tile.x).toBeGreaterThanOrEqual(
          stats.origin.x + building.rect.x,
        );
        expect(generator.tile.x).toBeLessThan(
          stats.origin.x + building.rect.x + building.rect.w,
        );
        expect(generator.tile.z).toBeGreaterThanOrEqual(
          stats.origin.z + building.rect.z,
        );
        expect(generator.tile.z).toBeLessThan(
          stats.origin.z + building.rect.z + building.rect.d,
        );
      } else {
        expect(generator.tile).toEqual({
          x: stats.origin.x + socket.x,
          y: stats.origin.y,
          z: stats.origin.z + socket.z,
        });
        expect(generator.buildingId).toBeUndefined();
      }
    }
    await page.mouse.move(0, 0);
    await drawnFrame(page);
    assertNoAssetFallback(page, site.id);
    expect(errors).toEqual([]);
    await page.locator("#map-viewport").screenshot({
      path: `docs/design/diagnostics/installations/${site.id}.png`,
    });
    const cut = await page.evaluate(() => {
      const { map, builder } = (
        globalThis as typeof globalThis & { __sitePreview: SitePreview }
      ).__sitePreview;
      builder.setLayerFocus({
        storey: 0,
        storeyCount: Math.max(...map.buildings.map((b) => b.floors.length)) + 1,
      });
      const installation = map.buildings.filter(
        (b) => b.kind === map.recipe.params.site,
      );
      return installation.map((b) => ({
        groundVisible: map.tiles
          .filter((t) => t.buildingId === b.id && t.y === b.groundLevel)
          .every((t) => !builder.isCut(t)),
        roofsHidden: map.tiles
          .filter((t) => t.buildingId === b.id && t.surface === "roof")
          .every((t) => builder.isCut(t)),
      }));
    });
    expect(cut).toHaveLength(site.buildings!.length);
    expect(cut.every((b) => b.groundVisible && b.roofsHidden)).toBe(true);
    await drawnFrame(page);
    await page.locator("#map-viewport").screenshot({
      path: `docs/design/diagnostics/installations/${site.id}-interior.png`,
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
