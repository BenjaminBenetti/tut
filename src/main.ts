import { CameraInputController } from "./graphics/controller/camera-input-controller";
import { MapPickingController } from "./graphics/controller/map-picking-controller";
import { CAMERA_ZOOM } from "./graphics/model/camera-state";
import { IsometricCameraRig } from "./graphics/service/isometric-camera-rig";
import { OverworldSceneBuilder } from "./graphics/service/overworld-scene-builder";
import { SceneService } from "./graphics/service/scene-service";
import { EARTH_MAP } from "./overworld/data/earth-map";
import { getCity } from "./overworld/service/earth-map-query-service";

/**
 * Application entry point: composes the overworld map scene, the
 * isometric camera rig, camera input and map picking, mounts the
 * three.js canvas into `#map-viewport`, and marks the document ready
 * once the first frame is on screen. The `data-app-state` attribute is
 * the hook end-to-end tests wait on; a selected city is mirrored to
 * `data-selected-city` until the overworld screen (#73) owns it.
 */
async function main(): Promise<void> {
  const app = document.getElementById("app");
  if (!app) {
    throw new Error("Missing #app container element");
  }
  const viewport = document.createElement("div");
  viewport.id = "map-viewport";
  app.appendChild(viewport);
  const selectedLabel = document.getElementById("selected-city");

  const mapScene = new OverworldSceneBuilder();
  mapScene.build(EARTH_MAP);
  const rig = new IsometricCameraRig({
    target: mapScene.centre,
    zoom: CAMERA_ZOOM.min,
  });
  const cameraInput = new CameraInputController(rig);
  const picking = new MapPickingController(mapScene, rig, {
    onCitySelected: (cityId) => {
      document.body.dataset.selectedCity = cityId;
      if (selectedLabel) {
        selectedLabel.textContent = getCity(EARTH_MAP, cityId).name;
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
    window.__tut__ = {
      selectCity: (cityId) => picking.selectCity(cityId),
      cityScreenPosition: (cityId) => picking.screenPositionOf(cityId),
    };
  }

  scene.start();
  await scene.whenFirstFrameRendered();
  document.body.dataset.appState = "ready";
}

void main();
