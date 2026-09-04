import "../../ui/style/theme.css";
import "../../ui/style/screens.css";

import { randomSeed } from "../../core/service/random-seed";
import { CameraInputController } from "../../graphics/controller/camera-input-controller";
import {
  cityPickerAdapter,
  PickingController,
} from "../../graphics/controller/picking-controller";
import { TEXTURE_MANIFEST } from "../../graphics/data/texture-manifest";
import {
  CAMERA_ZOOM,
  TOP_DOWN_PROJECTION,
} from "../../graphics/model/camera-state";
import { OVERWORLD_SCENE_CONFIG } from "../../graphics/model/overworld-scene-config";
import { IsometricCameraRig } from "../../graphics/service/isometric-camera-rig";
import { ManifestTextureLoader } from "../../graphics/service/manifest-texture-loader";
import { loadOverworldAssets } from "../../graphics/service/overworld-asset-loader";
import { OverworldSceneBuilder } from "../../graphics/service/overworld-scene-builder";
import { SceneService } from "../../graphics/service/scene-service";
import { SvgGlyphRasteriser } from "../../graphics/service/svg-glyph-rasteriser";
import { DEPLOYABLE_TYPES } from "../../overworld/data/deployable-types";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { OBJECTIVE_TUNING } from "../../tactical/data/objective-tuning";
import { DEPLOYABLE_TYPE_IDS } from "../../overworld/model/deployable-type";
import { DataDeployableTypeCatalogue } from "../../overworld/repository/deployable-type-catalogue";
import type { SaveClock } from "../../save/model/save-clock";
import { WebStorageKeyValueStore } from "../../save/repository/web-storage-key-value-store";
import { iconHref } from "../../ui/data/icon-manifest";
import type { ScreenId } from "../../ui/model/screen";
import { GameOverScreen } from "../../ui/screen/game-over-screen";
import { MainMenuScreen } from "../../ui/screen/main-menu-screen";
import type { OverworldSelection } from "../../ui/model/overworld-selection";
import { DeploymentScreen } from "../../ui/screen/deployment-screen";
import { OverworldScreen } from "../../ui/screen/overworld-screen";
import { TacticalScreen } from "../../ui/screen/tactical-screen";
import { OverworldSelectionState } from "../../ui/service/overworld-selection-state";
import { MechBayScreen } from "../../ui/screen/mech-bay-screen";
import { MissionResultsScreen } from "../../ui/screen/mission-results-screen";
import { RosterScreen } from "../../ui/screen/roster-screen";
import { NoticeBarView } from "../../ui/view/notice-bar-view";
import type { TutTestHooks } from "../model/test-hooks";
import type { ScreenFactory } from "./dom-screen-router";
import { DomMapViewportHost } from "./dom-map-viewport-host";
import { parseDebugOptions } from "./debug-options";
import { DomScreenRouter } from "./dom-screen-router";
import type { GameComposition } from "./game-composition";
import { composeGame } from "./game-composition";
import { MapSceneSync } from "./map-scene-sync";
import { DomTacticalSceneHost } from "./tactical-scene-host";
import { DefaultMetaServiceRestorer } from "../../overworld/service/meta-service-restorer";
import { startTacticalMission } from "../../tactical/service/mission-start-service";
import { describeTacticalError } from "../../tactical/model/tactical-error";

// ===========================================
// Constants
// ===========================================

/** Id of the element inside `#app` the map canvas mounts into; e2e waits on it. */
const MAP_VIEWPORT_ID = "map-viewport";

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
 *     └── #ui                   ◀── DomScreenRouter ──▶ MainMenuScreen / OverworldScreen / RosterScreen / MechBayScreen
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
  const selection = new OverworldSelectionState();
  const debug = import.meta.env.DEV
    ? parseDebugOptions(window.location.search)
    : undefined;

  const clock: SaveClock = { now: () => new Date().toISOString() };
  const mapSync = new MapSceneSync();
  // The notice bar sits in #ui beside the screens, so it survives every
  // navigation; the router only ever removes the screen it mounted (#217).
  const notices = new NoticeBarView();
  notices.mount(uiRoot);
  const game = composeGame({
    storage: new WebStorageKeyValueStore(window.localStorage),
    clock,
    newSeed: randomSeed,
    onAutosaveFailure: (error) => {
      console.error(`Autosave failed (${error.kind}): ${error.message}`);
      notices.notify({
        tone: "danger",
        message: `Autosave failed: ${error.message} Progress will not survive a reload until saving works; use Export from the main menu to keep a copy.`,
      });
    },
    onStore: mapSync.observe,
    ...(debug === undefined ? {} : { debug }),
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
            selection,
            missionTypes: game.content.missionTypes,
            eventTypes: game.content.eventTypes,
            deployableTypes: new DataDeployableTypeCatalogue(
              DEPLOYABLE_TYPE_IDS.map((id) => DEPLOYABLE_TYPES[id]),
            ),
            mapViewport,
          }),
      ],
      [
        "deployment",
        () =>
          new DeploymentScreen({
            router,
            session: game.session,
            selection,
            assessor: game.assessor,
            squadTypes: game.content.squadTypes,
            missionTypes: game.content.missionTypes,
            autoResolve: game.autoResolve,
          }),
      ],
      [
        "mission-results",
        () => new MissionResultsScreen({ router, session: game.session }),
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
      [
        "mech-bay",
        () =>
          new MechBayScreen({
            router,
            session: game.session,
            parts: game.content.parts,
            rating: game.content.rating,
            upgrades: game.content.upgrades,
          }),
      ],
      [
        "game-over",
        () => new GameOverScreen({ router, session: game.session }),
      ],
      [
        "tactical",
        () =>
          new TacticalScreen({
            router,
            session: game.session,
            combatTuning: COMBAT_TUNING,
            objectiveTuning: OBJECTIVE_TUNING,
            sceneHost: new DomTacticalSceneHost({
              baseUrl: import.meta.env.BASE_URL,
              onHooks: (hooks) => {
                if (import.meta.env.DEV) {
                  window.__tutTactical__ = hooks;
                }
              },
            }),
          }),
      ],
    ]),
  );
  router.navigate("main-menu");

  const scene = await composeScene(
    doc,
    viewport,
    window,
    selection,
    mapSync,
    (id) => startMissionForTests(id, game, router),
  );
  scene.start();
  // The host raises `data-map-ready` whenever the scene has drawn at the
  // size of the container the viewport is in (#473); it has to know the
  // scene, which only exists now.
  mapViewport.useScene(scene);
  await scene.whenFirstFrameRendered();
  doc.body.dataset.appState = "ready";
}

// ===========================================
// Composition helpers
// ===========================================

/**
 * The overworld map scene from #160: loads textures and marker glyphs,
 * builds the Earth scene, the isometric rig at minimum zoom, camera
 * input and city picking, all mounted into the given `#map-viewport`. A
 * selected city is mirrored to `body[data-selected-city]` and pushed into
 * `selection`, which the overworld panels render. The scene attaches to
 * `mapSync` so every campaign store's state retints and badges the
 * markers (#302). In dev builds the `window.__tut__` hooks let
 * end-to-end tests select cities and read marker looks without pointer
 * input.
 */
async function composeScene(
  doc: Document,
  viewport: HTMLElement,
  window: Window,
  selection: OverworldSelection,
  mapSync: MapSceneSync,
  startMission: (missionId: string) => string | undefined,
): Promise<SceneService> {
  const assets = await loadOverworldAssets({
    textures: new ManifestTextureLoader({
      manifest: TEXTURE_MANIFEST,
      baseUrl: import.meta.env.BASE_URL,
      logger: console,
    }),
    glyphs: new SvgGlyphRasteriser({ logger: console }),
    markerGlyphUrl: iconHref("marker-city"),
    missionGlyphUrl: iconHref("mission"),
  });

  const mapScene = new OverworldSceneBuilder({ assets });
  mapScene.build(EARTH_MAP);
  mapSync.attach(mapScene);
  const rig = new IsometricCameraRig({
    target: mapScene.centre,
    zoom: CAMERA_ZOOM.min,
    // The strategic map is looked at straight on with north up, the way
    // a map is read, rather than from an isometric corner (#420).
    projection: TOP_DOWN_PROJECTION,
    // The target stays on the map plate, so a held pan key can never
    // carry Earth off screen (#218).
    bounds: {
      x: 0,
      z: 0,
      w: OVERWORLD_SCENE_CONFIG.mapWidth,
      d: OVERWORLD_SCENE_CONFIG.mapDepth,
    },
  });
  // No rotation on the strategic map: north stays up (#420).
  const cameraInput = new CameraInputController(rig, { rotate: false });
  const picking = new PickingController(cityPickerAdapter(mapScene), rig, {
    onSelected: (cityId) => {
      selection.select(cityId);
    },
  });
  // The selection is the truth for both directions: a map click lands
  // in it above, and a mission chosen in the side panel highlights its
  // city here. The identity checks stop the two from echoing.
  selection.subscribe(({ cityId }) => {
    if (cityId === undefined) {
      delete doc.body.dataset.selectedCity;
      return;
    }
    doc.body.dataset.selectedCity = cityId;
    if (mapScene.getSelected() !== cityId) {
      picking.select(cityId);
    }
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
        picking.select(cityId);
      },
      cityScreenPosition: (cityId) => picking.screenPositionOf(cityId),
      cityMarkerLook: (cityId) => mapScene.markerLook(cityId),
      startTacticalMission: startMission,
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

/**
 * Dev-only: puts the campaign into the given offered mission with every
 * squad and mech deployed, then opens the tactical screen. Goes through
 * `startTacticalMission` and `session.replace`, the same state the real
 * launch (#341) will write, so the tactical Playwright specs can reach
 * the screen before that lands. Returns the reason when it cannot.
 */
function startMissionForTests(
  missionId: string,
  game: GameComposition,
  router: DomScreenRouter,
): string | undefined {
  const state = game.session.state;
  if (!state) {
    return "No active campaign.";
  }
  const ids = new DefaultMetaServiceRestorer().restoreIds(state.meta.ids);
  const started = startTacticalMission(
    state,
    missionId,
    {
      missionId,
      squadIds: state.roster.squads.map((s) => s.id),
      mechIds: state.roster.mechs.map((m) => m.id),
    },
    game.tactical.missionStartDepsFor(ids),
  );
  if (!started.ok) {
    return describeTacticalError(started.error);
  }
  game.session.replace({
    ...started.value,
    meta: { ...started.value.meta, ids: ids.getState() },
  });
  router.navigate("tactical");
  return undefined;
}
