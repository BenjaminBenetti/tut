import "./ui/style/theme.css";

import { Group } from "three";

import { CameraInputController } from "./graphics/controller/camera-input-controller";
import { CAMERA_ZOOM } from "./graphics/model/camera-state";
import { IsometricCameraRig } from "./graphics/service/isometric-camera-rig";
import { SceneService } from "./graphics/service/scene-service";
import { TacticalMapView } from "./graphics/view/tactical-map-view";
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
  let view: TacticalMapView | undefined;

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
      view?.dispose();
      view = new TacticalMapView(map);
      content.add(view.root);
      rig.lookAt(view.centre);
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
