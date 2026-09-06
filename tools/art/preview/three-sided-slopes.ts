import { MODEL_MANIFEST } from "../../../src/graphics/data/model-manifest";
import { GltfModelLoader } from "../../../src/graphics/service/gltf-model-loader";
import { PlaceholderModelFactory } from "../../../src/graphics/service/placeholder-model-factory";
import { OrthographicCameraRig } from "../../../src/graphics/service/orthographic-camera-rig";
import { SceneService } from "../../../src/graphics/service/scene-service";
import { TacticalMapView } from "../../../src/graphics/view/tactical-map-view";
import { threeSidedTerrace } from "../../../src/graphics/service/three-sided-slope-fixture.test-helper";

const models = new GltfModelLoader({
  manifest: MODEL_MANIFEST,
  baseUrl: "/",
  fallback: new PlaceholderModelFactory(),
  logger: console,
});

/** Shows the three-sided end in two ground materials through the shipped scene consumer. */
async function main(): Promise<void> {
  for (const surface of ["grass", "snow"]) {
    const section = document.createElement("section");
    const title = document.createElement("h2");
    title.textContent = `Three-sided gully · ${surface}`;
    const viewport = document.createElement("div");
    viewport.className = "viewport";
    section.append(viewport, title);
    document.getElementById("controls")!.append(section);
    const map = threeSidedTerrace(0, surface);
    const terrain = new TacticalMapView(map);
    await terrain.loadModels(models);
    const rig = new OrthographicCameraRig({ zoom: 78, yawIndex: 2 });
    rig.lookAt(terrain.centre);
    const scene = new SceneService(viewport, {
      camera: rig,
      content: terrain.root,
    });
    scene.start();
    await scene.whenFirstFrameRendered();
  }
  document.body.dataset.threeSidedSlopesReady = "true";
}
void main();
