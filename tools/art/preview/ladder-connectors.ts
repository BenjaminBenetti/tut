import { LAYER_HEIGHT } from "../../../src/graphics/data/mapgen-preview-palette";
import { MODEL_MANIFEST } from "../../../src/graphics/data/model-manifest";
import { GltfModelLoader } from "../../../src/graphics/service/gltf-model-loader";
import { PlaceholderModelFactory } from "../../../src/graphics/service/placeholder-model-factory";
import { OrthographicCameraRig } from "../../../src/graphics/service/orthographic-camera-rig";
import { SceneService } from "../../../src/graphics/service/scene-service";
import { TacticalMapView } from "../../../src/graphics/view/tactical-map-view";
import { ladderFacade } from "../../../src/graphics/service/ladder-fixture.test-helper";

const models = new GltfModelLoader({
  manifest: MODEL_MANIFEST,
  baseUrl: "/",
  fallback: new PlaceholderModelFactory(),
  logger: console,
});

/** Shows repeated steel ladder sections on brick and concrete through the shipped scene consumer. */
async function main(): Promise<void> {
  for (const family of ["concrete", "brick"] as const)
    for (const layers of [2, 4] as const) {
      const section = document.createElement("section");
      const title = document.createElement("h2");
      title.textContent = `${layers} layers · ${family === "brick" ? "weathered steel / brick" : "brushed steel / concrete"}`;
      const viewport = document.createElement("div");
      viewport.className = "viewport";
      section.append(viewport, title);
      document.getElementById("controls")!.append(section);
      const map = ladderFacade(layers, family, 2);
      const terrain = new TacticalMapView(map);
      await terrain.loadModels(models);
      const rig = new OrthographicCameraRig({ zoom: 90, yawIndex: 0 });
      rig.lookAt({ ...terrain.centre, y: (LAYER_HEIGHT * layers) / 2 });
      const scene = new SceneService(viewport, {
        camera: rig,
        content: terrain.root,
      });
      scene.start();
      await scene.whenFirstFrameRendered();
    }
  document.body.dataset.ladderConnectorsReady = "true";
}
void main();
