/* global document, location */
import { STARTER_LOADOUT } from "../../../src/roster/data/starter-roster";
import { MODEL_MANIFEST } from "../../../src/graphics/data/model-manifest";
import { GltfModelLoader } from "../../../src/graphics/service/gltf-model-loader";
import { OrthographicCameraRig } from "../../../src/graphics/service/orthographic-camera-rig";
import { PlaceholderModelFactory } from "../../../src/graphics/service/placeholder-model-factory";
import { SceneService } from "../../../src/graphics/service/scene-service";
import { TacticalSceneBuilder } from "../../../src/graphics/service/tactical-scene-builder";
import { tileTop } from "../../../src/graphics/view/tactical-map-view";
import { FixtureMapBuilder } from "../../../src/mapgen/service/fixture-map-builder";
import {
  DEFAULT_WEAPON_NAME,
  PRIMARY_WEAPON_ID,
} from "../../../src/tactical/model/unit-weapon";

/**
 * Four mechs in a row through the production scene builder (#1115): the
 * reference assembly a mission drew before the loadout reached the
 * template, then three loadouts the player can build. `?reference=0`
 * drops the first.
 */
const LOADOUTS = [
  { name: "Skirmisher (starter)", loadout: STARTER_LOADOUT },
  {
    name: "Atlas / Jumper / Tracker / Railgun / Mortar",
    loadout: {
      ...STARTER_LOADOUT,
      name: "Longshot",
      chassisId: "chassis-atlas",
      legsId: "legs-jumper",
      armsId: "arms-tracker",
      armWeaponId: "arm-weapon-railgun",
      backWeaponId: "back-weapon-mortar",
    },
  },
  {
    name: "Bulwark / Bastion / Brace / Flamer / Rotary",
    loadout: {
      ...STARTER_LOADOUT,
      name: "Bulwark",
      chassisId: "chassis-bulwark",
      legsId: "legs-bastion",
      armsId: "arms-brace",
      armWeaponId: "arm-weapon-flamer",
      backWeaponId: "back-weapon-rotary-cannon",
    },
  },
];

/** A mech template; `loadout` absent draws the reference assembly. */
function mechTemplate(id, name, loadout) {
  return {
    id,
    name,
    maxHp: 80,
    maxAp: 2,
    move: 8,
    weapons: [
      {
        id: PRIMARY_WEAPON_ID,
        name: DEFAULT_WEAPON_NAME,
        profile: { range: 10, accuracy: 70, damage: 40, armorPen: 2 },
      },
    ],
    sightRange: 14,
    armor: 9,
    passClass: "mech",
    modelId: "tdf.mech.assembled-a",
    ...(loadout ? { loadout } : {}),
  };
}

/** Renders the row and marks the body ready once the first frame is up. */
async function main() {
  const query = new URLSearchParams(location.search);
  const withReference = query.get("reference") !== "0";
  const map = new FixtureMapBuilder(12, 6, 1).fillGround().build();
  const models = new GltfModelLoader({
    manifest: MODEL_MANIFEST,
    baseUrl: "/",
    fallback: new PlaceholderModelFactory(),
    logger: console,
  });
  const builder = new TacticalSceneBuilder({ map, models });
  const rows = [
    ...(withReference
      ? [{ name: "Reference assembly", loadout: undefined }]
      : []),
    ...LOADOUTS,
  ];
  const templates = {};
  const units = rows.map((row, i) => {
    const templateId = `mech:${String(i)}`;
    templates[templateId] = mechTemplate(templateId, row.name, row.loadout);
    return {
      id: `m${String(i)}`,
      kind: "mech",
      team: "tdf",
      sourceId: `mech-${String(i)}`,
      templateId,
      pos: { x: 2 + i * 2, y: 0, z: 3 },
      facing: "s",
      hp: 80,
      maxHp: 80,
      ap: 2,
      maxAp: 2,
      status: [],
      passClass: "mech",
    };
  });
  await builder.loadMapModels();
  await builder.update(units, templates);
  const rig = new OrthographicCameraRig({
    yawIndex: Number(query.get("yaw") ?? 0),
    zoom: Number(query.get("zoom") ?? 110),
    target: { x: 2 + (rows.length - 1), y: tileTop(0) + 1.2, z: 3.5 },
  });
  const scene = new SceneService(document.querySelector("#scene"), {
    camera: rig,
    content: builder.root,
    updatables: [],
  });
  scene.start();
  await scene.whenFirstFrameRendered();
  document.body.dataset.units = String(builder.unitIds().length);
  document.body.dataset.rows = JSON.stringify(rows.map((row) => row.name));
  document.body.dataset.ready = "true";
}
void main();
