import { SceneService } from "./graphics/service/scene-service";

/**
 * Application entry point: mounts the three.js scene into the page.
 */
function main(): void {
  const container = document.getElementById("app");
  if (!container) {
    throw new Error("Missing #app container element");
  }

  new SceneService(container).start();
}

main();
