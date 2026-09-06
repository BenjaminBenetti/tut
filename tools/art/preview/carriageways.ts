import { MODEL_MANIFEST } from "../../../src/graphics/data/model-manifest";
import { GltfModelLoader } from "../../../src/graphics/service/gltf-model-loader";
import { PlaceholderModelFactory } from "../../../src/graphics/service/placeholder-model-factory";
import { OrthographicCameraRig } from "../../../src/graphics/service/orthographic-camera-rig";
import { SceneService } from "../../../src/graphics/service/scene-service";
import { TacticalMapView } from "../../../src/graphics/view/tactical-map-view";
import { CARRIAGEWAY_CONTROLS, carriagewayMap } from "./carriageways-fixture";

const models = new GltfModelLoader({
  manifest: MODEL_MANIFEST,
  baseUrl: "/",
  fallback: new PlaceholderModelFactory(),
  logger: console,
});

/** Mounts four real instanced map views, sharing loaded assets and using identical cameras. */
async function main(): Promise<void> {
  for (const control of CARRIAGEWAY_CONTROLS) {
    const section = document.createElement("section");
    const title = document.createElement("h2");
    title.textContent = control.title;
    const viewport = document.createElement("div");
    viewport.className = "viewport";
    section.append(viewport, title);
    document.getElementById("controls")!.append(section);
    const map = carriagewayMap(control);
    const view = new TacticalMapView(map);
    await view.loadModels(models);
    const rig = new OrthographicCameraRig({ zoom: 33, yawIndex: 2 });
    rig.lookAt(view.centre);
    const scene = new SceneService(viewport, {
      camera: rig,
      content: view.root,
    });
    scene.start();
    await scene.whenFirstFrameRendered();
  }
  document.body.dataset.carriagewaysReady = "true";
}

void main();
