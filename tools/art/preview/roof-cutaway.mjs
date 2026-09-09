/* global document, location, requestAnimationFrame */
import { previewUnits } from "../../../src/app/service/preview-units";
import { MODEL_MANIFEST } from "../../../src/graphics/data/model-manifest";
import { GhostController } from "../../../src/graphics/service/ghost-controller";
import { GltfModelLoader } from "../../../src/graphics/service/gltf-model-loader";
import { OrthographicCameraRig } from "../../../src/graphics/service/orthographic-camera-rig";
import { PlaceholderModelFactory } from "../../../src/graphics/service/placeholder-model-factory";
import { SceneService } from "../../../src/graphics/service/scene-service";
import { TacticalSceneBuilder } from "../../../src/graphics/service/tactical-scene-builder";
import { tileTop } from "../../../src/graphics/view/tactical-map-view";
import { DEFAULT_MISSION_HOOKS } from "../../../src/mapgen/data/hook-requirements";
import { generateTacticalMap } from "../../../src/mapgen/service/generate-tactical-map";
/** A visible indoor squad through the same builder/controller as TacticalSceneHost. */
async function main() {
  const query = new URLSearchParams(location.search);
  const flat = query.get("roof") === "flat";
  const map = generateTacticalMap({
    seed: flat ? "mc-opening-02" : "mc-opening-01",
    params: {
      archetype: "settlement",
      biome: "temperate",
      settlement: flat ? "town" : "rural",
      size: "small",
      hooks: DEFAULT_MISSION_HOOKS,
      slopeShare: 1,
    },
  });
  const models = new GltfModelLoader({
    manifest: MODEL_MANIFEST,
    baseUrl: "/",
    fallback: new PlaceholderModelFactory(),
    logger: {
      warn: (message) => {
        throw new Error(message);
      },
    },
  });
  const builder = new TacticalSceneBuilder({ map, models });
  // Capture-only overrides compare tuning through the real shared uniform.
  const radius = Number(query.get("radius"));
  if (Number.isFinite(radius) && radius > 0)
    builder.ghosting.uGhostRadius.value = radius;
  const floor = Number(query.get("floor"));
  if (query.has("floor") && Number.isFinite(floor) && floor >= 0 && floor <= 1)
    builder.ghosting.uGhostFloor.value = floor;
  const sample = previewUnits(map);
  const pos = flat ? { x: 25, y: 6, z: 14 } : { x: 24, y: 4, z: 15 };
  const unit = { ...sample.units[0], pos };
  const positions = query.get("units") === "0" ? [] : [pos];
  if (query.get("units") === "2")
    positions.push(flat ? { x: 23, y: 6, z: 11 } : { x: 21, y: 4, z: 11 });
  // Both squads stand on clear interior floor tiles in the same building.
  for (const position of positions) {
    const matches = (p) =>
      p.x === position.x && p.y === position.y && p.z === position.z;
    const tile = map.tiles.find(matches);
    if (!tile?.buildingId || map.props.some((prop) => matches(prop.tile)))
      throw new Error("Cutaway fixture must use an unoccupied building tile");
  }
  const units = positions.map((position, i) => ({
    ...unit,
    id: i === 0 ? unit.id : `${unit.id}-second`,
    pos: position,
  }));
  await builder.loadMapModels();
  await builder.update(units, sample.templates);
  const rig = new OrthographicCameraRig({
    yawIndex: query.get("yaw") === "2" ? 2 : 0,
    zoom: 80,
    target: { x: pos.x + 0.5, y: tileTop(pos.y) + 0.7, z: pos.z + 0.5 },
  });
  const ghost = new GhostController(
    rig.camera,
    () => builder.ghostTargets(),
    builder.ghosting,
  );
  const scene = new SceneService(document.querySelector("#scene"), {
    camera: rig,
    content: builder.root,
    updatables: query.get("ghost") === "0" ? [] : [ghost],
  });
  // Read live diagnostics on demand, without changing the production HUD.
  globalThis.__cutawayState = () => ({
    ghostCount: builder.ghosting.uGhostCount.value,
    ghostStrength: [...builder.ghosting.uGhostStrength.value],
  });
  scene.start();
  await scene.whenFirstFrameRendered();
  // Let the production 150-ms ramp reach full strength before declaring the frame ready.
  for (let i = 0; i < 20; i++)
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  document.body.dataset.ready = "true";
  document.body.dataset.ghostCount = String(builder.ghosting.uGhostCount.value);
  document.body.dataset.unit = JSON.stringify(pos);
  document.body.dataset.units = JSON.stringify(positions);
  document.body.dataset.radius = String(builder.ghosting.uGhostRadius.value);
  document.body.dataset.floor = String(builder.ghosting.uGhostFloor.value);
  document.body.dataset.yaw = String(rig.getState().yawIndex);
  // A second captured state proves the cutaway closes after the visible unit leaves.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "l") return;
    void builder.update([], sample.templates).then(() => {
      document.body.dataset.left = "true";
    });
  });
}
void main();
