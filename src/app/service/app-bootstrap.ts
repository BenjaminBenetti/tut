import "../../ui/style/theme.css";
import "../../ui/style/screens.css";

import { randomSeed } from "../../core/service/random-seed";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
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
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import { getCity } from "../../overworld/service/earth-map-query-service";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import type { SaveClock } from "../../save/model/save-clock";
import { WebStorageKeyValueStore } from "../../save/repository/web-storage-key-value-store";
import { createGameSaveService } from "../../save/service/game-save-service";
import type { NewGameDeps } from "../../save/service/new-game-service";
import { createNewGame } from "../../save/service/new-game-service";
import { iconHref } from "../../ui/data/icon-manifest";
import type { ScreenId } from "../../ui/model/screen";
import { MainMenuScreen } from "../../ui/screen/main-menu-screen";
import { OverworldScreen } from "../../ui/screen/overworld-screen";
import type { TutTestHooks } from "../model/test-hooks";
import type { ScreenFactory } from "./dom-screen-router";
import { DomScreenRouter } from "./dom-screen-router";
import { InMemoryGameSession } from "./game-session";

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
 * The composition root. Builds every long-lived object once, wires them
 * together, shows the main menu, then loads the overworld art and starts
 * the map scene, marking the document ready after the first rendered
 * frame (the hook end-to-end tests wait on). Art is awaited before the
 * ready flag so a broken asset path surfaces in the smoke test.
 *
 * ```
 *   document
 *     ├── #app / #map-viewport  ◀── SceneService (overworld map, camera rig, input, picking)
 *     └── #ui                   ◀── DomScreenRouter ──▶ MainMenuScreen / OverworldScreen
 *                                        │                        ├── GameSession (live state)
 *                                        │                        └── GameSaveService ◀── localStorage
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

  const clock: SaveClock = { now: () => new Date().toISOString() };
  const saves = createGameSaveService(
    new WebStorageKeyValueStore(window.localStorage),
    clock,
  );
  const newGameDeps = composeNewGameDeps();
  const session = new InMemoryGameSession();

  const router: DomScreenRouter = new DomScreenRouter(
    uiRoot,
    new Map<ScreenId, ScreenFactory>([
      [
        "main-menu",
        () =>
          new MainMenuScreen({
            router,
            session,
            saves,
            createCampaign: (options) => createNewGame(options, newGameDeps),
            newSeed: randomSeed,
            clock,
          }),
      ],
      ["overworld", () => new OverworldScreen({ router, session })],
    ]),
  );
  router.navigate("main-menu");

  const scene = await composeScene(doc, appRoot, window);
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
 * input and city picking, all mounted into a `#map-viewport` inside
 * `#app`. A selected city is mirrored to `body[data-selected-city]` and,
 * when the overworld panel is mounted, to its `#selected-city` label. In
 * dev builds the `window.__tut__` hooks let end-to-end tests select
 * cities without pointer input.
 */
async function composeScene(
  doc: Document,
  appRoot: HTMLElement,
  window: Window,
): Promise<SceneService> {
  const viewport = doc.createElement("div");
  viewport.id = MAP_VIEWPORT_ID;
  appRoot.appendChild(viewport);

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

/** The shipped content and tuning a new campaign is built from. */
function composeNewGameDeps(): NewGameDeps {
  return {
    map: EARTH_MAP,
    squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
    starterRoster: STARTER_ROSTER,
    newGameTuning: NEW_GAME_TUNING,
    threatTuning: THREAT_TUNING,
    economyTuning: ECONOMY_TUNING,
  };
}

/** Looks up a required mount point by id; a missing one is a page bug. */
function requireElement(doc: Document, id: string): HTMLElement {
  const element = doc.getElementById(id);
  if (!element) {
    throw new Error(`Missing #${id} container element`);
  }
  return element;
}
