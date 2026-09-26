import "../../ui/style/jev.css";
import { JevController } from "../controller/jev-controller";
import { JevDefaultPolicy } from "../controller/jev-default-policy";
import { KeyValueJevPreference } from "../repository/jev-preference-repository";
import { PERSONAS } from "../../bugs/data/personas";
import { createPersonaLookup } from "../../bugs/service/persona-lookup";
import { JevClient } from "./jev-client";
import { SHIPPED_EQUIPMENT } from "../../tactical/repository/equipment-catalogue";
import { MECH_BLUEPRINTS } from "../../roster/data/mech-blueprints";
import "../../ui/style/theme.css";
import "../../ui/style/screens.css";

import { randomSeed } from "../../core/service/random-seed";
import { CameraInputController } from "../../graphics/controller/camera-input-controller";
import {
  overworldPickerAdapter,
  PickingController,
} from "../../graphics/controller/picking-controller";
import {
  cityPick,
  installationPick,
} from "../../graphics/model/overworld-pick";
import {
  CAMERA_ZOOM,
  STRATEGIC_PROJECTION,
} from "../../graphics/model/camera-state";
import { MODEL_MANIFEST } from "../../graphics/data/model-manifest";
import { OVERWORLD_SCENE_CONFIG } from "../../graphics/model/overworld-scene-config";
import { GltfModelLoader } from "../../graphics/service/gltf-model-loader";
import { OrthographicCameraRig } from "../../graphics/service/orthographic-camera-rig";
import { loadOverworldAssets } from "../../graphics/service/overworld-asset-loader";
import { OverworldSceneBuilder } from "../../graphics/service/overworld-scene-builder";
import { PlaceholderModelFactory } from "../../graphics/service/placeholder-model-factory";
import { SceneService } from "../../graphics/service/scene-service";
import { SettlementDisplayLook } from "../../graphics/service/settlement-display-look";
import { DEPLOYABLE_TYPES } from "../../overworld/data/deployable-types";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { OBJECTIVE_TUNING } from "../../tactical/data/objective-tuning";
import { DEPLOYABLE_TYPE_IDS } from "../../overworld/model/deployable-type";
import type { DeployableTypeCatalogue } from "../../overworld/model/deployable-type-catalogue";
import { DataDeployableTypeCatalogue } from "../../overworld/repository/deployable-type-catalogue";
import { findCity } from "../../overworld/service/earth-map-query-service";
import type { SaveClock } from "../../save/model/save-clock";
import { WebStorageKeyValueStore } from "../../save/repository/web-storage-key-value-store";
import type { ScreenId } from "../../ui/model/screen";
import { GameOverScreen } from "../../ui/screen/game-over-screen";
import { MainMenuScreen } from "../../ui/screen/main-menu-screen";
import type { OverworldSelection } from "../../ui/model/overworld-selection";
import { DeploymentScreen } from "../../ui/screen/deployment-screen";
import { OverworldScreen } from "../../ui/screen/overworld-screen";
import { TacticalScreen } from "../../ui/screen/tactical-screen";
import { CityPickChannel } from "../../ui/service/city-pick-channel";
import { InstallationPickChannel } from "../../ui/service/installation-pick-channel";
import { OverworldSelectionState } from "../../ui/service/overworld-selection-state";
import { MechBayScreen } from "../../ui/screen/mech-bay-screen";
import { DomMechPreviewHost } from "./mech-preview-host";
import { MissionResultsScreen } from "../../ui/screen/mission-results-screen";
import { RosterScreen } from "../../ui/screen/roster-screen";
import { TechTreeScreen } from "../../ui/screen/tech-tree-screen";
import { TECH_EFFECT_LABELS } from "../../ui/data/tech-effect-labels";
import { DomTechGraphHost } from "./tech-graph-host";
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
 *     └── #ui                   ◀── DomScreenRouter ──▶ MainMenuScreen / OverworldScreen / RosterScreen / MechBayScreen / TechTreeScreen
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
  const debug = import.meta.env.DEV
    ? parseDebugOptions(window.location.search)
    : undefined;

  const clock: SaveClock = { now: () => new Date().toISOString() };
  const mapSync = new MapSceneSync();
  // The notice bar sits in #ui beside the screens, so it survives every
  // navigation; the router only ever removes the screen it mounted (#217).
  const notices = new NoticeBarView();
  notices.mount(uiRoot);
  const storage = new WebStorageKeyValueStore(window.localStorage);
  // One relay client for the page: it holds no state, and the main menu
  // asks it whether smart enemies can be offered at all.
  const jevClient = new JevClient(
    import.meta.env.VITE_JEV_RELAY_URL ??
      (import.meta.env.DEV ? "http://localhost:8080" : ""),
  );
  // The player's "Smart enemies (Jev)" setting: beside the saves in
  // browser storage, never inside one (campaign arc §9).
  const jevPreference = new KeyValueJevPreference(storage);
  const personaOf = createPersonaLookup(PERSONAS);
  const game = composeGame({
    storage,
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
    // The development tools (#1136) exist in dev builds only; this is
    // the one place the flag enters, and everything below reads what
    // the composition made of it rather than the environment.
    devTools: import.meta.env.DEV,
  });
  // Region-first selection (#1154): a city's region is looked up on the
  // running campaign's map, so a custom or migrated map answers for
  // itself rather than the shipped data.
  const selection = new OverworldSelectionState((cityId) => {
    const state = game.session.state;
    return state ? findCity(state.overworld.map, cityId)?.regionId : undefined;
  });
  // The map reports pointer picks here and the overworld screen opens
  // the city or installation wheel on them; the projectors arrive with
  // the scene.
  const cityPicks = new CityPickChannel();
  const installationPicks = new InstallationPickChannel();
  const deployableTypes = new DataDeployableTypeCatalogue(
    DEPLOYABLE_TYPE_IDS.map((id) => DEPLOYABLE_TYPES[id]),
  );

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
            // Offered only where a relay is configured: without one no
            // enemy is ever smart, and a switch would promise otherwise.
            ...(jevClient.configured ? { smartEnemies: jevPreference } : {}),
            openMapLab: () => {
              // A real navigation, not a route: the harness is its own
              // page in the bundle (#786). Relative to the document so
              // it resolves under the Pages sub-path as well as at the
              // root — `TUT_BASE_PATH` makes those differ.
              //
              // `models=1` because Map Lab exists to judge map
              // *generation*, and the harness's default is the mapgen
              // specialist's placeholder-box view — grey boxes for
              // props, flat slabs for buildings. Opening that would
              // invite a bug report about the art instead (#765 exists
              // because boxes, fog and models took a day to tell apart).
              // The bare URL keeps its boxes for whoever wants them.
              window.location.assign(
                new URL("mapgen-preview.html?models=1", window.location.href)
                  .href,
              );
            },
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
            deployableTypes,
            mapViewport,
            cityPicks,
            installationPicks,
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
        () =>
          new MissionResultsScreen({
            router,
            session: game.session,
            rosterTuning: game.content.rosterTuning,
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
      [
        "mech-bay",
        () =>
          new MechBayScreen({
            blueprints: MECH_BLUEPRINTS,
            router,
            session: game.session,
            parts: game.content.parts,
            tech: game.content.tech,
            rating: game.content.rating,
            unitTuning: game.content.unitTuning,
            upgrades: game.content.upgrades,
            preview: new DomMechPreviewHost({
              baseUrl: import.meta.env.BASE_URL,
            }),
          }),
      ],
      [
        "tech-tree",
        () =>
          new TechTreeScreen({
            router,
            session: game.session,
            tech: game.content.tech,
            parts: game.content.parts,
            conditionsOf: game.techConditionsOf,
            squadTypes: game.content.squadTypes,
            effectLabels: TECH_EFFECT_LABELS,
            graph: new DomTechGraphHost({
              baseUrl: import.meta.env.BASE_URL,
              onHooks: (hooks) => {
                if (import.meta.env.DEV) {
                  window.__tutTech__ = hooks;
                }
              },
            }),
            ...(game.techDevTools === undefined
              ? {}
              : { devTools: game.techDevTools }),
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
            jev: game.session.store
              ? new JevController(game.session.store, jevClient, {
                  handlers: game.tactical.handlers,
                  combat: COMBAT_TUNING,
                  equipment: {
                    catalogue: SHIPPED_EQUIPMENT,
                    combat: COMBAT_TUNING,
                  },
                })
              : undefined,
            // Named enemies go to Jev by default (ADR 0013 §2.8). The
            // policy reads the preference each time a persona is due,
            // so turning it off stops new actors, not ones already
            // under Jev.
            jevPolicy: game.session.store
              ? new JevDefaultPolicy({
                  store: game.session.store,
                  configured: jevClient.configured,
                  preference: jevPreference,
                  personaOf,
                })
              : undefined,
            router,
            session: game.session,
            combatTuning: COMBAT_TUNING,
            objectiveTuning: OBJECTIVE_TUNING,
            rankTuning: game.content.rosterTuning.ranks,
            previewDeps: game.tactical.attackDeps,
            ...(game.devTools === undefined ? {} : { devTools: game.devTools }),
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
    { cityPicks, installationPicks, deployableTypes },
    mapSync,
    (id) => startMissionForTests(id, game, router),
    (deployableId) =>
      game.session.state?.overworld.deployables.find(
        (d) => d.id === deployableId,
      )?.regionId,
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

/** The channels and catalogue the map's picking is wired through. */
interface ScenePickWiring {
  /** Where city picks go, and where the city wheel asks for a marker's screen position. */
  readonly cityPicks: CityPickChannel;
  /** The same for installation picks and the installation wheel (#1155). */
  readonly installationPicks: InstallationPickChannel;
  /** Names the installation types for their hover labels. */
  readonly deployableTypes: DeployableTypeCatalogue;
}

/**
 * The overworld map scene from #160: preloads the settlement and
 * installation models (#1155), builds the wireframe Earth scene
 * (#1144), the top-down rig at minimum zoom, camera input and picking,
 * all mounted into the given `#map-viewport`. A picked city is pushed
 * into `selection`, which the overworld panels render, and reported
 * through `cityPicks` so the screen can open the city wheel on it
 * (#1154); a picked installation selects its region and is reported
 * through `installationPicks` for the installation wheel; a click on a
 * region's bare land selects the region alone, and one at sea clears
 * the selection (#1155). The selection's city and region are mirrored
 * to `body[data-selected-city]` and `body[data-selected-region]`. The
 * scene attaches to `mapSync` so every campaign store's state retints
 * the settlements, adds their egg cues and places the installations
 * (#302, #1155). In dev builds the `window.__tut__` hooks let
 * end-to-end tests select cities, focus the camera and read marker and
 * installation looks without pointer input.
 */
async function composeScene(
  doc: Document,
  viewport: HTMLElement,
  window: Window,
  selection: OverworldSelection,
  picks: ScenePickWiring,
  mapSync: MapSceneSync,
  startMission: (missionId: string) => string | undefined,
  regionOfInstallation: (deployableId: string) => string | undefined,
): Promise<SceneService> {
  const { cityPicks, installationPicks } = picks;
  // The settlements, egg overlays and installations are GLBs (#1155),
  // loaded through the same manifest-backed loader the tactical scene
  // uses, so a missing file falls back to a placeholder box and a
  // warning rather than an empty map. The settlements are dressed for
  // the WarGames display as they load: dark bodies, cyan edges.
  const displayLook = new SettlementDisplayLook();
  const assets = await loadOverworldAssets({
    models: new GltfModelLoader({
      manifest: MODEL_MANIFEST,
      baseUrl: import.meta.env.BASE_URL,
      fallback: new PlaceholderModelFactory(),
      logger: console,
      dresser: displayLook,
    }),
  });

  const mapScene = new OverworldSceneBuilder({
    assets,
    deployableTypes: picks.deployableTypes,
  });
  mapScene.build(EARTH_MAP);
  mapSync.attach(mapScene);
  const rig = new OrthographicCameraRig({
    target: mapScene.centre,
    zoom: CAMERA_ZOOM.min,
    // The strategic map is looked at from the south with north up, the
    // way a map is read, pitched back just enough that the settlements
    // show their skylines (#420, ADR 0005 §5).
    projection: STRATEGIC_PROJECTION,
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
  const picking = new PickingController(overworldPickerAdapter(mapScene), rig, {
    // A city pick (pointer, or the test hook) selects the city and its
    // region, then tells the screen so the city wheel opens on it. The
    // order matters: a different city closes the old wheel through the
    // selection first, so the new one is not dismissed by its own pick.
    // An installation pick selects its region alone, then tells the
    // screen so the installation wheel opens on it (#1155). A pick on a
    // region's land selects the region alone, no wheel.
    onSelected: (pick) => {
      switch (pick.kind) {
        case "city":
          selection.select(pick.cityId);
          cityPicks.emit(pick.cityId);
          return;
        case "installation":
          selection.selectRegion(regionOfInstallation(pick.deployableId));
          installationPicks.emit(pick.deployableId);
          return;
        case "region":
          selection.selectRegion(pick.regionId);
      }
    },
    // A click at sea, or off the map, picks nothing and clears.
    onMissed: () => {
      selection.selectRegion(undefined);
    },
  });
  cityPicks.useProjector((cityId) =>
    picking.screenPositionOf(cityPick(cityId)),
  );
  installationPicks.useProjector((id) =>
    picking.screenPositionOf(installationPick(id)),
  );
  // The selection is the truth for both directions: a map click lands
  // in it above, and a mission or city row chosen in the side panel
  // highlights its city here. The scene is told directly rather than
  // through `picking.select`, which would report a pick and open the
  // wheel over a click that happened in a list. A region selected with
  // no city is lit on its own; with a city, the city's region is.
  selection.subscribe(({ cityId, regionId }) => {
    if (regionId === undefined) {
      delete doc.body.dataset.selectedRegion;
    } else {
      doc.body.dataset.selectedRegion = regionId;
    }
    if (cityId === undefined) {
      delete doc.body.dataset.selectedCity;
    } else {
      doc.body.dataset.selectedCity = cityId;
    }
    if (mapScene.getSelected() !== cityId) {
      mapScene.setSelected(cityId);
    }
    const bareRegion = cityId === undefined ? regionId : undefined;
    if (mapScene.getSelectedRegion() !== bareRegion) {
      mapScene.setSelectedRegion(bareRegion);
    }
    // A picked installation stays lit only while its region is the
    // bare selection; a city or another region chosen anywhere drops it.
    const installation = mapScene.getSelectedInstallation();
    if (
      installation !== undefined &&
      (bareRegion === undefined ||
        regionOfInstallation(installation) !== bareRegion)
    ) {
      mapScene.setSelectedInstallation(undefined);
    }
  });
  const scene = new SceneService(viewport, {
    camera: rig,
    content: mapScene.root,
    // The map's installations idle every frame (#1155): dishes turn,
    // barrels traverse, the dispersal sprays; the settlement edges
    // follow the zoom.
    updatables: [
      cameraInput,
      mapScene.animator,
      displayLook.followZoom(() => rig.getState().zoom),
    ],
  });

  cameraInput.attach(viewport);
  picking.attach(viewport);
  if (import.meta.env.DEV) {
    const hooks: TutTestHooks = {
      selectCity: (cityId) => {
        picking.select(cityPick(cityId));
      },
      cityScreenPosition: (cityId) =>
        picking.screenPositionOf(cityPick(cityId)),
      cityMarkerLook: (cityId) => mapScene.markerLook(cityId),
      focusCity: (cityId, zoom) => {
        const world = mapScene.markerWorldPosition(cityId);
        if (!world) {
          return;
        }
        rig.lookAt(world);
        if (zoom !== undefined) {
          rig.zoomBy(zoom / rig.getState().zoom);
        }
      },
      installationLook: (id) => mapScene.installationLook(id),
      installationScreenPosition: (id) =>
        picking.screenPositionOf(installationPick(id)),
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
