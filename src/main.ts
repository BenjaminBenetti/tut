import { SceneService } from "./graphics/service/scene-service";

/**
 * Application entry point: mounts the three.js scene into the page and
 * marks the document ready once the first frame is on screen. The
 * `data-app-state` attribute is the hook end-to-end tests wait on.
 */
async function main(): Promise<void> {
  const container = document.getElementById("app");
  if (!container) {
    throw new Error("Missing #app container element");
  }

  const scene = new SceneService(container);
  scene.start();
  await scene.whenFirstFrameRendered();
  document.body.dataset.appState = "ready";
}

void main();
