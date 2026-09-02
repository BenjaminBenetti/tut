import { CameraInputController } from "./graphics/controller/camera-input-controller";
import { IsometricCameraRig } from "./graphics/service/isometric-camera-rig";
import { SceneService } from "./graphics/service/scene-service";
import { PlaceholderTacticalView } from "./graphics/view/placeholder-tactical-view";

/**
 * Application entry point: composes the placeholder tactical scene, the
 * isometric camera rig and its input controller, mounts the three.js
 * scene into the page, and marks the document ready once the first
 * frame is on screen. The `data-app-state` attribute is the hook
 * end-to-end tests wait on.
 */
async function main(): Promise<void> {
  const container = document.getElementById("app");
  if (!container) {
    throw new Error("Missing #app container element");
  }

  const view = new PlaceholderTacticalView();
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
