import "./ui/style/theme.css";

import { Group } from "three";

import { previewMission } from "./app/service/preview-units";
import { COMBAT_TUNING } from "./tactical/data/combat-tuning";
import { OBJECTIVE_TUNING } from "./tactical/data/objective-tuning";
import { TacticalHudView } from "./ui/view/tactical-hud-view";
import { CameraInputController } from "./graphics/controller/camera-input-controller";
import { MODEL_MANIFEST } from "./graphics/data/model-manifest";
import { CAMERA_ZOOM } from "./graphics/model/camera-state";
import { GltfModelLoader } from "./graphics/service/gltf-model-loader";
import { IsometricCameraRig } from "./graphics/service/isometric-camera-rig";
import { PlaceholderModelFactory } from "./graphics/service/placeholder-model-factory";
import { SceneService } from "./graphics/service/scene-service";
import { TacticalSceneBuilder } from "./graphics/service/tactical-scene-builder";
import { DEFAULT_MISSION_HOOKS } from "./mapgen/data/hook-requirements";
import type { MapRecipe } from "./mapgen/model/map-recipe";
import { renderAscii } from "./mapgen/service/ascii-map-renderer";
import { createDefaultRegistries } from "./mapgen/service/default-registries";
import { generateTacticalMapWithDiagnostics } from "./mapgen/service/generate-tactical-map";
import { computeMapMetrics } from "./mapgen/service/map-metrics";
import { assessMap } from "./tactical/service/map-assessment-service";
import type { PreviewControlsState } from "./ui/screen/mapgen-preview-screen";
import { TacticalInputController } from "./ui/controller/tactical-input-controller";
import type { TacticalIntent } from "./ui/model/tactical-intent";
import { MapgenPreviewScreen } from "./ui/screen/mapgen-preview-screen";

// ===========================================
// Query string
// ===========================================

/** Control values when the URL says nothing. */
const DEFAULT_STATE: PreviewControlsState = {
  seed: "terra-01",
  biome: "temperate",
  settlement: "town",
  size: "medium",
};

/** Reads `?seed=&biome=&settlement=&size=` with defaults for anything missing. */
function stateFromUrl(): PreviewControlsState {
  const query = new URLSearchParams(window.location.search);
  return {
    seed: query.get("seed") ?? DEFAULT_STATE.seed,
    biome:
      (query.get("biome") as PreviewControlsState["biome"] | null) ??
      DEFAULT_STATE.biome,
    settlement:
      (query.get("settlement") as PreviewControlsState["settlement"] | null) ??
      DEFAULT_STATE.settlement,
    size:
      (query.get("size") as PreviewControlsState["size"] | null) ??
      DEFAULT_STATE.size,
  };
}

/** Mirrors the controls into the URL so a map can be shared by link. */
function writeUrl(state: PreviewControlsState): void {
  const query = new URLSearchParams({
    seed: state.seed,
    biome: state.biome,
    settlement: state.settlement,
    size: state.size,
  });
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
  const rig = new IsometricCameraRig({ zoom: CAMERA_ZOOM.min });
  const cameraInput = new CameraInputController(rig);
  const models = new GltfModelLoader({
    manifest: MODEL_MANIFEST,
    baseUrl: import.meta.env.BASE_URL,
    fallback: new PlaceholderModelFactory(),
    logger: console,
  });
  // `?units=1` drops a few sample units on the map (#337's smoke test).
  const showUnits =
    new URLSearchParams(window.location.search).get("units") === "1";
  let view: TacticalSceneBuilder | undefined;
  let input: TacticalInputController | undefined;
  let hud: TacticalHudView | undefined;

  const regenerate = (state: PreviewControlsState): void => {
    const recipe: MapRecipe = {
      seed: state.seed,
      params: {
        archetype: "settlement",
        biome: state.biome,
        settlement: state.settlement,
        size: state.size,
        hooks: DEFAULT_MISSION_HOOKS,
      },
    };
    const started = performance.now();
    try {
      const { map, diagnostics } = generateTacticalMapWithDiagnostics(recipe, {
        registries,
      });
      const elapsedMs = performance.now() - started;
      input?.detach();
      hud?.unmount();
      view?.dispose();
      const builder = new TacticalSceneBuilder({ map, models });
      view = builder;
      content.add(builder.root);
      rig.setBounds({ x: 0, z: 0, w: map.width, d: map.depth });
      rig.lookAt(builder.centre);
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
            onBack: () => undefined,
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
        window.__tutTactical__ = input.hooks();
        void builder.update(units, templates).then(() => {
          if (view === builder) {
            document.body.dataset.units = String(builder.unitIds().length);
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
