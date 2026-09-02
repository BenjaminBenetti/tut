import type { ModelAssetId } from "./content/data/model-ids";
import { CameraInputController } from "./graphics/controller/camera-input-controller";
import { MODEL_MANIFEST } from "./graphics/data/model-manifest";
import { GltfModelLoader } from "./graphics/service/gltf-model-loader";
import { IsometricCameraRig } from "./graphics/service/isometric-camera-rig";
import { PlaceholderModelFactory } from "./graphics/service/placeholder-model-factory";
import { SceneService } from "./graphics/service/scene-service";
import type { GroundTile } from "./graphics/view/placeholder-tactical-view";
import { PlaceholderTacticalView } from "./graphics/view/placeholder-tactical-view";

/** The one model shown on the placeholder scene, proving the asset pipeline end to end. */
const SHOWCASE_MODEL: ModelAssetId = "tdf.mech.assembled-a";

/** Where the showcase model stands, clear of the scale boxes. */
const SHOWCASE_TILE: GroundTile = { x: 6, z: 10 };

/**
 * Application entry point: composes the placeholder tactical scene, the
 * model loader, the isometric camera rig and its input controller,
 * mounts the three.js scene into the page, and marks the document ready
 * once the first frame is on screen. The `data-app-state` attribute is
 * the hook end-to-end tests wait on; the showcase model is loaded
 * before it is set so a broken asset path fails the smoke test.
 */
async function main(): Promise<void> {
  const container = document.getElementById("app");
  if (!container) {
    throw new Error("Missing #app container element");
  }

  const view = new PlaceholderTacticalView();
  const models = new GltfModelLoader({
    manifest: MODEL_MANIFEST,
    baseUrl: import.meta.env.BASE_URL,
    fallback: new PlaceholderModelFactory(),
    logger: console,
  });
  view.placeOnTile(await models.load(SHOWCASE_MODEL), SHOWCASE_TILE);

  const rig = new IsometricCameraRig({ target: view.centre });
  const cameraInput = new CameraInputController(rig);
  const scene = new SceneService(container, {
    camera: rig,
    content: view.root,
    updatables: [cameraInput],
  });

  cameraInput.attach(container);
  scene.start();
  await scene.whenFirstFrameRendered();
  document.body.dataset.appState = "ready";
}

void main();
