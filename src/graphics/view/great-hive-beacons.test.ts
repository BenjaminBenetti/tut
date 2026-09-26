import type { Mesh, MeshBasicMaterial } from "three";
import { describe, expect, it } from "vitest";

import { EARTH_MAP } from "../../overworld/data/earth-map";
import type { GreatHive } from "../../overworld/model/great-hive";
import { OVERWORLD_SCENE_CONFIG } from "../model/overworld-scene-config";
import { layoutToWorld } from "../service/overworld-layout";
import { OverworldSceneBuilder } from "../service/overworld-scene-builder";
import {
  GREAT_HIVE_BEACONS_NAME,
  GreatHiveBeacons,
} from "./great-hive-beacons";

// ===========================================
// Fixtures
// ===========================================

/** A Great Hive seated in `regionId`, fallen on `destroyedDay` when given. */
function greatHive(
  id: string,
  regionId: string,
  destroyedDay?: number,
): GreatHive {
  return {
    id,
    continentId: "europe",
    name: "Europe",
    regionId,
    regionIds: [regionId],
    revealedDay: 200,
    level: 0,
    ...(destroyedDay === undefined ? {} : { destroyedDay }),
  };
}

/** Three Great Hives on three seats of the Earth map. */
const THREE: readonly GreatHive[] = [
  greatHive("greathive-1", "north-america-east"),
  greatHive("greathive-2", "eastern-europe"),
  greatHive("greathive-3", "east-asia"),
];

/** Beacons over the Earth map. */
function beacons(): GreatHiveBeacons {
  const view = new GreatHiveBeacons(OVERWORLD_SCENE_CONFIG);
  view.setMap(EARTH_MAP);
  return view;
}

/** The colour of every mesh under the beacon of `id`. */
function coloursOf(view: GreatHiveBeacons, id: string): number[] {
  const object = view.root.getObjectByName(`great-hive-beacon:${id}`);
  const colours: number[] = [];
  object?.traverse((child) => {
    const mesh = child as Mesh;
    if (mesh.isMesh) {
      colours.push((mesh.material as MeshBasicMaterial).color.getHex());
    }
  });
  return colours;
}

// ===========================================
// GreatHiveBeacons
// ===========================================

describe("GreatHiveBeacons", () => {
  it("raises one green beam over each standing Great Hive's seat region", () => {
    const view = beacons();
    view.sync(THREE);
    expect(view.ids()).toEqual(THREE.map((hive) => hive.id));
    for (const hive of THREE) {
      const region = EARTH_MAP.regions.find((r) => r.id === hive.regionId);
      if (region === undefined) throw new Error(hive.regionId);
      const anchor = layoutToWorld(region.layout, OVERWORLD_SCENE_CONFIG);
      expect(view.look(hive.id)).toEqual({
        regionId: hive.regionId,
        standing: true,
        beam: true,
        x: anchor.x,
        z: anchor.z,
      });
      expect(new Set(coloursOf(view, hive.id))).toEqual(new Set([0x9cff3d]));
    }
  });

  it("greys a fallen Great Hive and drops its beam, keeping its ring", () => {
    const view = beacons();
    view.sync(THREE);
    view.sync(
      [
        THREE[0],
        greatHive("greathive-2", "eastern-europe", 230),
        THREE[2],
      ].filter((hive): hive is GreatHive => hive !== undefined),
    );
    expect(view.look("greathive-2")).toMatchObject({
      standing: false,
      beam: false,
    });
    expect(new Set(coloursOf(view, "greathive-2"))).toEqual(
      new Set([0x4a4d55]),
    );
    expect(view.look("greathive-1")).toMatchObject({
      standing: true,
      beam: true,
    });
  });

  it("removes a beacon the state no longer names, and draws none without a seat on the map", () => {
    const view = beacons();
    view.sync(THREE);
    view.sync([greatHive("greathive-9", "atlantis")]);
    expect(view.ids()).toEqual([]);
    expect(view.root.children).toHaveLength(0);
  });
});

describe("OverworldSceneBuilder — Great Hive beacons", () => {
  it("draws the beacons the scene state carries, and none before the reveal", () => {
    const builder = new OverworldSceneBuilder();
    builder.build(EARTH_MAP);
    const base = {
      map: EARTH_MAP,
      missionCueCityIds: new Set<string>(),
      deployables: [],
    };
    builder.update(base);
    expect(builder.greatHiveBeaconLook("greathive-1")).toBeUndefined();
    expect(
      builder.root.getObjectByName(GREAT_HIVE_BEACONS_NAME)?.children,
    ).toHaveLength(0);

    builder.update({ ...base, greatHives: THREE });
    for (const hive of THREE) {
      expect(builder.greatHiveBeaconLook(hive.id)?.standing).toBe(true);
    }
    builder.dispose();
  });
});
