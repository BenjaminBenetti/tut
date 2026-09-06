import { MODEL_MANIFEST } from "../../../src/graphics/data/model-manifest";
import { GltfModelLoader } from "../../../src/graphics/service/gltf-model-loader";
import { PlaceholderModelFactory } from "../../../src/graphics/service/placeholder-model-factory";
import { OrthographicCameraRig } from "../../../src/graphics/service/orthographic-camera-rig";
import { SceneService } from "../../../src/graphics/service/scene-service";
import { TacticalMapView } from "../../../src/graphics/view/tactical-map-view";
import { rampTerrace } from "../../../src/graphics/service/ramp-fixture.test-helper";

const models = new GltfModelLoader({
  manifest: MODEL_MANIFEST,
  baseUrl: "/",
  fallback: new PlaceholderModelFactory(),
  logger: console,
});

/** Shows the connector at both rises in road and ground materials through the shipped scene consumer. */
async function main(): Promise<void> {
  for (const surface of ["road", "grass"])
    for (const layers of [1, 2] as const) {
      const section = document.createElement("section");
      const title = document.createElement("h2");
      title.textContent = `${layers} layer${layers === 1 ? "" : "s"} · ${surface === "road" ? "asphalt" : "grass"}`;
      const viewport = document.createElement("div");
      viewport.className = "viewport";
      section.append(viewport, title);
      document.getElementById("controls")!.append(section);
      const map = rampTerrace(layers, surface, 0, 3);
      const terrain = new TacticalMapView(map);
      await terrain.loadModels(models);
      const rig = new OrthographicCameraRig({ zoom: 38, yawIndex: 2 });
      rig.lookAt(terrain.centre);
      const scene = new SceneService(viewport, {
        camera: rig,
        content: terrain.root,
      });
      scene.start();
      await scene.whenFirstFrameRendered();
    }
  document.body.dataset.rampConnectorsReady = "true";
}
void main();
