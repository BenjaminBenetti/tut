import "../../ui/style/theme.css";
import "../../ui/style/screens.css";

import { randomSeed } from "../../core/service/random-seed";
import { CameraInputController } from "../../graphics/controller/camera-input-controller";
import { MapPickingController } from "../../graphics/controller/map-picking-controller";
import { TEXTURE_MANIFEST } from "../../graphics/data/texture-manifest";
import { CAMERA_ZOOM } from "../../graphics/model/camera-state";
import { IsometricCameraRig } from "../../graphics/service/isometric-camera-rig";
import { ManifestTextureLoader } from "../../graphics/service/manifest-texture-loader";
import { loadOverworldAssets } from "../../graphics/service/overworld-asset-loader";
import { OverworldSceneBuilder } from "../../graphics/service/overworld-scene-builder";
import { SceneService } from "../../graphics/service/scene-service";
import { SvgGlyphRasteriser } from "../../graphics/service/svg-glyph-rasteriser";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { getCity } from "../../overworld/service/earth-map-query-service";
import type { SaveClock } from "../../save/model/save-clock";
import { WebStorageKeyValueStore } from "../../save/repository/web-storage-key-value-store";
import { iconHref } from "../../ui/data/icon-manifest";
import type { ScreenId } from "../../ui/model/screen";
import { MainMenuScreen } from "../../ui/screen/main-menu-screen";
import { OverworldScreen } from "../../ui/screen/overworld-screen";
import { RosterScreen } from "../../ui/screen/roster-screen";
import type { TutTestHooks } from "../model/test-hooks";
import type { ScreenFactory } from "./dom-screen-router";
import { DomMapViewportHost } from "./dom-map-viewport-host";
import { DomScreenRouter } from "./dom-screen-router";
import { composeGame } from "./game-composition";

// ===========================================
// Constants
// ===========================================

/** Id of the element inside `#app` the map canvas mounts into; e2e waits on it. */
const MAP_VIEWPORT_ID = "map-viewport";

/** Id of the label the overworld panel hosts for the selected city's name. */
const SELECTED_CITY_ID = "selected-city";

// ===========================================
// Bootstrap
// ===========================================

/**
 * The presentation composition root. Gets the simulation-facing services
 * from `composeGame`, builds the DOM router and screens around them,
 * shows the main menu, then loads the overworld art and starts the map
 * scene, marking the document ready after the first rendered frame (the
 * hook end-to-end tests wait on). Art is awaited before the ready flag
 * so a broken asset path surfaces in the smoke test.
 *
 * ```
 *   document
 *     ├── #app / #map-viewport  ◀── SceneService (overworld map, camera rig, input, picking)
 *     └── #ui                   ◀── DomScreenRouter ──▶ MainMenuScreen / OverworldScreen / RosterScreen
 *                                        │                        └── composeGame(): session (GameStore),
 *                                        │                            saves, autosave, createCampaign
 *                                        └── body[data-screen]
 * ```
 */
export async function bootstrapApp(doc: Document): Promise<void> {
  const appRoot = requireElement(doc, "app");
  const uiRoot = requireElement(doc, "ui");
  const window = doc.defaultView;
  if (!window) {
    throw new Error("Document is not attached to a window");
  }

  const viewport = createMapViewport(doc, appRoot);
  const mapViewport = new DomMapViewportHost(viewport, appRoot);

  const clock: SaveClock = { now: () => new Date().toISOString() };
  const game = composeGame({
    storage: new WebStorageKeyValueStore(window.localStorage),
    clock,
    newSeed: randomSeed,
    onAutosaveFailure: (error) => {
      console.error(`Autosave failed (${error.kind}): ${error.message}`);
    },
  });

  const router: DomScreenRouter = new DomScreenRouter(
    uiRoot,
    new Map<ScreenId, ScreenFactory>([
      [
        "main-menu",
        () =>
          new MainMenuScreen({
            router,
            session: game.session,
            saves: game.saves,
            createCampaign: game.createCampaign,
            newSeed: game.newSeed,
            clock: game.clock,
          }),
      ],
      [
        "overworld",
        () =>
          new OverworldScreen({
            router,
            session: game.session,
            mapViewport,
          }),
      ],
      [
        "roster",
        () =>
          new RosterScreen({
            router,
            session: game.session,
            squadTypes: game.content.squadTypes,
            parts: game.content.parts,
            rosterTuning: game.content.rosterTuning,
          }),
      ],
    ]),
  );
  router.navigate("main-menu");

  const scene = await composeScene(doc, viewport, window);
  scene.start();
  await scene.whenFirstFrameRendered();
  doc.body.dataset.appState = "ready";
}

// ===========================================
// Composition helpers
// ===========================================

/**
 * The overworld map scene from #160: loads textures and marker glyphs,
 * builds the Earth scene, the isometric rig at minimum zoom, camera
 * input and city picking, all mounted into the given `#map-viewport`. A selected city is mirrored to `body[data-selected-city]` and,
 * when the overworld panel is mounted, to its `#selected-city` label. In
 * dev builds the `window.__tut__` hooks let end-to-end tests select
 * cities without pointer input.
 */
async function composeScene(
  doc: Document,
  viewport: HTMLElement,
  window: Window,
): Promise<SceneService> {
  const assets = await loadOverworldAssets({
    textures: new ManifestTextureLoader({
      manifest: TEXTURE_MANIFEST,
      baseUrl: import.meta.env.BASE_URL,
      logger: console,
    }),
    glyphs: new SvgGlyphRasteriser({ logger: console }),
    markerGlyphUrl: iconHref("marker-city"),
  });

  const mapScene = new OverworldSceneBuilder({ assets });
  mapScene.build(EARTH_MAP);
  const rig = new IsometricCameraRig({
    target: mapScene.centre,
    zoom: CAMERA_ZOOM.min,
  });
  const cameraInput = new CameraInputController(rig);
  const picking = new MapPickingController(mapScene, rig, {
    onCitySelected: (cityId) => {
      doc.body.dataset.selectedCity = cityId;
      const label = doc.getElementById(SELECTED_CITY_ID);
      if (label) {
        label.textContent = getCity(EARTH_MAP, cityId).name;
      }
    },
  });
  const scene = new SceneService(viewport, {
    camera: rig,
    content: mapScene.root,
    updatables: [cameraInput],
  });

  cameraInput.attach(viewport);
  picking.attach(viewport);
  if (import.meta.env.DEV) {
    const hooks: TutTestHooks = {
      selectCity: (cityId) => {
        picking.selectCity(cityId);
      },
      cityScreenPosition: (cityId) => picking.screenPositionOf(cityId),
    };
    window.__tut__ = hooks;
  }
  return scene;
}

/**
 * Creates the element the map canvas mounts into, inside `#app`. The
 * overworld screen borrows it through a `MapViewportHost` while mounted
 * so the map sits beside its panels; between screens it is the menu's
 * full-window background.
 */
function createMapViewport(doc: Document, appRoot: HTMLElement): HTMLElement {
  const viewport = doc.createElement("div");
  viewport.id = MAP_VIEWPORT_ID;
  appRoot.appendChild(viewport);
  return viewport;
}

/** Looks up a required mount point by id; a missing one is a page bug. */
function requireElement(doc: Document, id: string): HTMLElement {
  const element = doc.getElementById(id);
  if (!element) {
    throw new Error(`Missing #${id} container element`);
  }
  return element;
}
