import "./ui/style/theme.css";

import { Group } from "three";

import { previewUnits } from "./app/service/preview-units";
import { CameraInputController } from "./graphics/controller/camera-input-controller";
import {
  PickingController,
  unitPickerAdapter,
} from "./graphics/controller/picking-controller";
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
import type { PreviewControlsState } from "./ui/screen/mapgen-preview-screen";
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
  let picking: PickingController<string> | undefined;

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
      picking?.detach();
      view?.dispose();
      const builder = new TacticalSceneBuilder({ map, models });
      view = builder;
      content.add(builder.root);
      rig.lookAt(builder.centre);
      if (showUnits) {
        delete document.body.dataset.units;
        const { units, templates } = previewUnits(map);
        picking = new PickingController(unitPickerAdapter(builder), rig, {
          onSelected: (unitId) => {
            document.body.dataset.selectedUnit = unitId;
          },
        });
        picking.attach(viewport);
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
    updatables: [cameraInput],
  });
  cameraInput.attach(viewport);
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
