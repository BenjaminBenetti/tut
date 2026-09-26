import { INSTALLATION_SITES } from "./content/data/installation-sites";
import { HookKinds } from "./mapgen/model/hook";
import { PassMask } from "./mapgen/model/pass-mask";
import { mapInfestationLevel } from "./content/model/map-infestation";
import { TEXTURE_MANIFEST } from "./graphics/data/texture-manifest";
import { ManifestTextureLoader } from "./graphics/service/manifest-texture-loader";
import "./ui/style/theme.css";

import { isPlaceProfileId } from "./content/model/place-profile-id";
import { Group } from "three";

import { previewMission } from "./app/service/preview-units";
import { COMBAT_TUNING } from "./tactical/data/combat-tuning";
import { OBJECTIVE_TUNING } from "./tactical/data/objective-tuning";
import { TacticalHudView } from "./ui/view/tactical-hud-view";
import { CameraInputController } from "./graphics/controller/camera-input-controller";
import { MODEL_MANIFEST } from "./graphics/data/model-manifest";
import { STOREY_LAYERS } from "./core/model/elevation";
import { CAMERA_ZOOM } from "./graphics/model/camera-state";
import { GltfModelLoader } from "./graphics/service/gltf-model-loader";
import { OrthographicCameraRig } from "./graphics/service/orthographic-camera-rig";
import { PlaceholderModelFactory } from "./graphics/service/placeholder-model-factory";
import { SceneService } from "./graphics/service/scene-service";
import { TacticalSceneBuilder } from "./graphics/service/tactical-scene-builder";
import {
  ARCHETYPE_MISSION_HOOKS,
  MISSION_HOOK_PRESETS,
} from "./mapgen/data/hook-requirements";
import type { MapArchetype, MapRecipe } from "./mapgen/model/map-recipe";
import { MAP_ARCHETYPES } from "./mapgen/model/map-recipe";
import { ARCHETYPE_RECIPE_DEFAULTS } from "./mapgen/data/archetype-recipe-defaults";
import type { TacticalMap } from "./mapgen/model/tactical-map";
import { renderAscii } from "./mapgen/service/ascii-map-renderer";
import { createDefaultRegistries } from "./mapgen/service/default-registries";
import { withArchetypeDefaults } from "./mapgen/service/archetype-recipe";
import { generateTacticalMapWithDiagnostics } from "./mapgen/service/generate-tactical-map";
import { computeMapMetrics } from "./mapgen/service/map-metrics";
import { assessMap } from "./tactical/service/map-assessment-service";
import type { PreviewControlsState } from "./ui/screen/mapgen-preview-screen";
import { TacticalInputController } from "./ui/controller/tactical-input-controller";
import type { TacticalIntent } from "./ui/model/tactical-intent";
import { MapgenPreviewScreen } from "./ui/screen/mapgen-preview-screen";
import { LAYER_HEIGHT } from "./graphics/data/mapgen-preview-palette";
import { backdropFor } from "./graphics/service/map-backdrop";

// ===========================================
// Query string
// ===========================================

/** Control values when the URL says nothing. */
const DEFAULT_STATE: PreviewControlsState = {
  seed: "terra-01",
  biome: "temperate",
  settlement: "town",
  size: "medium",
  archetype: "settlement",
  slopeShare: 1,
  infestation: 0,
};

/** A percent from the URL as a 0–1 share; missing or malformed means all slope. */
function clampShare(raw: string | null): number {
  if (raw === null) {
    return DEFAULT_STATE.slopeShare;
  }
  const percent = Number(raw);
  if (!Number.isFinite(percent)) {
    return DEFAULT_STATE.slopeShare;
  }
  return Math.min(1, Math.max(0, percent / 100));
}

/** The URL's `?archetype=` when it names one, else the default. */
function archetypeFrom(raw: string | null): MapArchetype {
  return (
    MAP_ARCHETYPES.find((archetype) => archetype === raw) ??
    DEFAULT_STATE.archetype
  );
}

/**
 * Reads `?seed=&biome=&settlement=&size=&archetype=` with defaults for
 * anything missing. `?archetype=crash-site` opens the crater with its
 * spore pod (#1179); the panel's Archetype control switches it too.
 */
function stateFromUrl(): PreviewControlsState {
  const query = new URLSearchParams(window.location.search);
  const place = query.get("place");
  return {
    ...(isPlaceProfileId(place) ? { placeProfile: place } : {}),
    seed: query.get("seed") ?? DEFAULT_STATE.seed,
    ...(query.has("site") ? { site: query.get("site")! } : {}),
    biome:
      (query.get("biome") as PreviewControlsState["biome"] | null) ??
      DEFAULT_STATE.biome,
    settlement:
      (query.get("settlement") as PreviewControlsState["settlement"] | null) ??
      DEFAULT_STATE.settlement,
    size:
      (query.get("size") as PreviewControlsState["size"] | null) ??
      DEFAULT_STATE.size,
    archetype: archetypeFrom(query.get("archetype")),
    // `?slope=` is a percent, the way the slider shows it (#799).
    slopeShare: clampShare(query.get("slope")),
    infestation: mapInfestationLevel(Number(query.get("infestation")) * 10),
  };
}

/**
 * `?floor=N` cuts the view through building floor N (0 is the ground
 * floor): the highest layer shown is the top layer of that floor on the
 * lowest-standing building, so interiors are judged as structures (#829).
 * Undefined without the parameter or without buildings.
 */
function floorCutFromUrl(map: TacticalMap): number | undefined {
  const raw = new URLSearchParams(window.location.search).get("floor");
  const floor = raw === null ? Number.NaN : Number(raw);
  if (!Number.isInteger(floor) || floor < 0 || map.buildings.length === 0) {
    return undefined;
  }
  const ground = Math.min(...map.buildings.map((b) => b.groundLevel));
  return ground + (floor + 1) * STOREY_LAYERS - 1;
}

/**
 * Mirrors the controls into the URL so a map can be shared by link.
 *
 * `models` is carried across rather than rebuilt from the controls,
 * which have no knob for it. Without that the flag survives exactly
 * until the first generate: the art loads, the URL is rewritten without
 * it, and the next reload or shared link comes back as placeholder
 * boxes (#786). Map Lab opens with it on, so dropping it here would
 * hand the Executive Director boxes one refresh into his first session.
 */
function writeUrl(state: PreviewControlsState): void {
  const query = new URLSearchParams({
    seed: state.seed,
    biome: state.biome,
    settlement: state.settlement,
    size: state.size,
    archetype: state.archetype,
    slope: String(Math.round(state.slopeShare * 100)),
    infestation: String(state.infestation ?? 0),
  });
  if (state.site !== undefined) query.set("site", state.site);
  if (state.placeProfile !== undefined) query.set("place", state.placeProfile);
  if (new URLSearchParams(window.location.search).get("models") === "1") {
    query.set("models", "1");
  }
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}?${query.toString()}`,
  );
}

// ===========================================
// Entry
// ===========================================

/** Mirrors an input intent onto the body so end-to-end tests can read it. */
function recordIntent(intent: TacticalIntent): void {
  const body = document.body.dataset;
  body.lastIntent = intent.kind;
  if (intent.kind === "select-unit") {
    body.selectedUnit = intent.unitId;
  } else if (intent.kind === "select-tile") {
    body.selectedTile = `${String(intent.tile.x)},${String(intent.tile.y)},${String(intent.tile.z)}`;
  } else if (intent.kind === "action") {
    body.lastAction = intent.action;
  }
}

/**
 * Map generation preview (ADR 0004 §7.5, GDD §7): a second page that
 * generates a map from the controls, renders it with placeholder
 * geometry through the isometric camera rig, and prints the ASCII render
 * and pass diagnostics beside it. `data-app-state="ready"` on the body
 * is the hook end-to-end tests wait on.
 */
async function main(): Promise<void> {
  const panel = document.getElementById("panel");
  const viewport = document.getElementById("map-viewport");
  if (!panel || !viewport) {
    throw new Error("Missing #panel or #map-viewport element");
  }

  const registries = createDefaultRegistries();
  const content = new Group();
  const rig = new OrthographicCameraRig({ zoom: CAMERA_ZOOM.min });
  const cameraInput = new CameraInputController(rig);
  const models = new GltfModelLoader({
    manifest: MODEL_MANIFEST,
    baseUrl: import.meta.env.BASE_URL,
    fallback: new PlaceholderModelFactory(),
    logger: console,
  });
  const textures = new ManifestTextureLoader({
    manifest: TEXTURE_MANIFEST,
    baseUrl: import.meta.env.BASE_URL,
    logger: console,
  });
  // `?units=1` drops a few sample units on the map (#337's smoke test).
  const showUnits =
    new URLSearchParams(window.location.search).get("units") === "1";
  // `?models=1` swaps the placeholder boxes for the registered art the
  // tactical scene draws (#474), so a map can be looked at the way the
  // game shows it, with no fog. Added for #748: the preview is the only
  // place that renders a map with nothing else in the frame.
  const showModels =
    new URLSearchParams(window.location.search).get("models") === "1";
  // `?hooks=tunnel-sabotage` lays a mission type's own hook set in
  // place of the archetype's (#1179): the three tunnel mouths.
  const hookPreset =
    MISSION_HOOK_PRESETS[
      new URLSearchParams(window.location.search).get("hooks") ?? ""
    ];
  let view: TacticalSceneBuilder | undefined;
  let input: TacticalInputController | undefined;
  let hud: TacticalHudView | undefined;

  const regenerate = (state: PreviewControlsState): void => {
    const requested: MapRecipe = {
      seed: state.seed,
      params: {
        archetype: state.archetype,
        biome: state.biome,
        ...(state.placeProfile === undefined
          ? {}
          : { placeProfile: state.placeProfile }),
        settlement: state.settlement,
        size: state.size,
        ...(state.site === undefined ? {} : { site: state.site }),
        // Each archetype's own mission hooks: egg spawners in a
        // settlement, the spore pod in a crash site's crater, the core
        // and brood chambers in a hive cavern.
        hooks:
          state.site === undefined
            ? (hookPreset ?? ARCHETYPE_MISSION_HOOKS[state.archetype])
            : [
                ...ARCHETYPE_MISSION_HOOKS[state.archetype].filter(
                  (hook) => hook.kind !== HookKinds.EGG_SPAWNER,
                ),
                {
                  kind: HookKinds.GENERATOR,
                  count:
                    INSTALLATION_SITES[
                      state.site as keyof typeof INSTALLATION_SITES
                    ]?.generators ?? 0,
                  requiredPass: PassMask.INFANTRY,
                  minDistanceFromDeploy: 6,
                },
              ],
        slopeShare: state.slopeShare,
        infestation: state.infestation ?? 0,
      },
    };
    // A hive cavern brings its own long board and hive-core hooks (#1179).
    const recipe = withArchetypeDefaults(requested, ARCHETYPE_RECIPE_DEFAULTS);
    const started = performance.now();
    try {
      const { map, diagnostics } = generateTacticalMapWithDiagnostics(recipe, {
        registries,
      });
      const elapsedMs = performance.now() - started;
      input?.detach();
      hud?.unmount();
      view?.dispose();
      // Objective slabs (spawners, carcass, generators, the spore pod)
      // are the diagnostic view Map Lab judges a map by; the unit
      // preview plays a mission, which marks them its own way (#1173).
      const builder = new TacticalSceneBuilder({
        map,
        models,
        textures,
        objectiveMarkers: !showUnits,
      });
      view = builder;
      content.add(builder.root);
      // A spore platform hangs in orbit, over Earth's limb (#1179).
      scene.setBackdrop(backdropFor(map));
      rig.setBounds({ x: 0, z: 0, w: map.width, d: map.depth });
      // Map Lab exists to judge whole maps, so the far end of the zoom
      // range is sized to this one (#828). Without it the harness opens
      // framed on a corner and the Executive Director's first view of a
      // generated map is a quarter of it.
      rig.setMapExtent({
        width: map.width,
        depth: map.depth,
        height: map.levels * LAYER_HEIGHT,
      });
      rig.lookAt(builder.centre);
      delete document.body.dataset.previewReady;
      delete document.body.dataset.modelsReady;
      if (showModels) {
        // Same shape as the unit load below: a terminal attribute either
        // way, so a spec can wait on it and know which way it went.
        void builder
          .loadMapModels()
          .then(() => {
            if (view === builder) {
              document.body.dataset.modelsReady = "true";
            }
          })
          .catch((error: unknown) => {
            if (view === builder) {
              document.body.dataset.modelsReady = "error";
              // Report it the way the sibling `update` path does (#735).
              // This used to take no argument at all, so a model load
              // that failed set an attribute and vanished: nothing in
              // the console, nothing on the panel, and the harness
              // looked like it had simply drawn an empty map.
              screen.showError(
                error instanceof Error ? error.message : String(error),
              );
            }
          });
      }
      if (showUnits) {
        delete document.body.dataset.units;
        const mission = previewMission(map);
        const { units, templates } = mission;
        // The HUD (#339) sits over the map; commands are recorded, not run.
        const hudView = new TacticalHudView(
          {
            onCommand: (command) => {
              document.body.dataset.lastCommand = command.type;
            },
            onLeave: () => undefined,
          },
          {
            combatTuning: COMBAT_TUNING,
            objectiveTuning: OBJECTIVE_TUNING,
          },
        );
        hudView.mount(viewport);
        hudView.update(mission);
        hud = hudView;
        // The tactical input controller owns the camera input while a
        // unit preview is up (#340); intents land on the body for tests.
        input = new TacticalInputController({
          picker: builder,
          camera: rig,
          cameraInput,
          intents: {
            emit: (intent) => {
              recordIntent(intent);
              hudView.handleIntent(intent);
              builder.setSelected(hudView.getSelectedUnitId());
            },
          },
        });
        input.attach(viewport);
        // The preview drives the height cut from its own slider, so the
        // hook is wired to that rather than to a scene focus (#978).
        window.__tutTactical__ = {
          ...input.hooks(),
          applyHeightCut: (level) => {
            view?.setMaxLevel(level);
          },
          // The preview's mission is built from hooks alone (#339) and
          // prices no carcass, so there is nothing to report.
          carcasses: () => [],
        };
        // Always reaches a terminal state, which is the point (#688).
        // `data-app-state` says the page mounted and a frame drew; it
        // cannot say the units are on the board, because they arrive
        // behind an async model load that nothing awaits. A spec that
        // waits on the first and reads the second is asking one question
        // and trusting the answer to another.
        //
        // The failure it produced was not slowness. Idle, the gap from
        // `ready` to `data-units` is 9-37 ms; the run that failed had
        // retried for five seconds and found the attribute still absent.
        // A `.then` with no `.catch` leaves it absent for ever if the
        // load rejects, and a superseded render skips it silently. So
        // this settles either way, and says which.
        void builder
          .update(units, templates)
          .then(() => {
            if (view === builder) {
              document.body.dataset.units = String(builder.unitIds().length);
              document.body.dataset.previewReady = "true";
            }
          })
          .catch((error: unknown) => {
            if (view === builder) {
              document.body.dataset.previewReady = "error";
              screen.showError(
                error instanceof Error ? error.message : String(error),
              );
            }
          });
      }
      screen.showResult({
        map,
        diagnostics,
        metrics: computeMapMetrics(map),
        assessment: assessMap(map),
        ascii: renderAscii(map),
        elapsedMs,
      });
      document.body.dataset.mapSeed = state.seed;
      const floorCut = floorCutFromUrl(map);
      if (floorCut !== undefined) {
        screen.showLevelCut(floorCut);
      }
      // Without units there is nothing async to wait for, so this render
      // is already done. Set unconditionally so `data-preview-ready`
      // means the same thing on both paths (#688).
      if (!showUnits) {
        document.body.dataset.previewReady = "true";
      }
      writeUrl(state);
    } catch (error) {
      screen.showError(error instanceof Error ? error.message : String(error));
    }
  };

  const screen = new MapgenPreviewScreen(panel, stateFromUrl(), {
    onGenerate: regenerate,
    onLevelChange: (maxLevel) => view?.setMaxLevel(maxLevel),
  });

  const scene = new SceneService(viewport, {
    camera: rig,
    content,
    updatables: [
      {
        update: (dt) => {
          (input ?? cameraInput).update(dt);
        },
      },
    ],
  });
  if (!showUnits) {
    cameraInput.attach(viewport);
  }
  // N steps the seed unless the user is typing in a control.
  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const typing =
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement;
    if (!typing && !event.repeat && event.key.toLowerCase() === "n") {
      screen.advanceSeed();
    }
  });
  regenerate(screen.getState());

  scene.start();
  await scene.whenFirstFrameRendered();
  document.body.dataset.appState = "ready";
}

void main();
