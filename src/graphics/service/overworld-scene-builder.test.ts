import type {
  BoxGeometry,
  LineBasicMaterial,
  LineSegments,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
} from "three";
import { Box3, Group, Texture, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { EARTH_MAP } from "../../overworld/data/earth-map";
import { SELECTION_COLOUR } from "../view/city-marker";
import type { City } from "../../overworld/model/city";
import type { Deployable } from "../../overworld/model/deployable";
import type { EarthMap } from "../../overworld/model/earth-map";
import { CAMERA_ZOOM } from "../model/camera-state";
import type { MapSceneState } from "../model/map-scene-state";
import type { ModelLoader } from "../model/model-loader";
import { OVERWORLD_SCENE_CONFIG } from "../model/overworld-scene-config";
import { INFESTATION_RAMP } from "../view/city-marker";
import { OrthographicCameraRig } from "./orthographic-camera-rig";
import { OverworldSceneBuilder } from "./overworld-scene-builder";

function rampStop(index: number): number {
  const stop = INFESTATION_RAMP[index];
  if (!stop) throw new Error("missing ramp stop");
  return stop.hex;
}

/** The fill of a region's territory, as colour and opacity. */
function fillOf(
  builder: OverworldSceneBuilder,
  regionId: string,
): { colour: number; opacity: number } {
  const mesh = builder.root.getObjectByName(`territory-fill-${regionId}`) as
    Mesh | undefined;
  if (!mesh) throw new Error(`no territory for ${regionId}`);
  const material = mesh.material as MeshBasicMaterial;
  return { colour: material.color.getHex(), opacity: material.opacity };
}

/** The selection outline's core line. */
function outlineOf(builder: OverworldSceneBuilder): LineSegments {
  const lines = builder.root.getObjectByName("territory-selection") as
    LineSegments | undefined;
  if (!lines) throw new Error("no selection outline");
  return lines;
}

function withInfestation(
  map: EarthMap,
  cityId: string,
  infestation: number,
): EarthMap {
  return {
    ...map,
    cities: map.cities.map((city): City =>
      city.id === cityId ? { ...city, infestation } : city,
    ),
  };
}

/** A scene state over `map` with no missions and no installations unless given. */
function stateOf(
  map: EarthMap,
  extra: Partial<Omit<MapSceneState, "map">> = {},
): MapSceneState {
  return {
    map,
    missionCueCityIds: new Set(),
    deployables: [],
    ...extra,
  };
}

/** A loader answering every id with a fresh named group. */
function fakeLoader(): ModelLoader & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    load: (id) => {
      asked.push(id);
      const model = new Group();
      model.name = id;
      return Promise.resolve(model);
    },
    preload: () => Promise.resolve(),
  };
}

/** Lets every pending model load land. */
async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function makeCamera(builder: OverworldSceneBuilder): OrthographicCameraRig {
  const rig = new OrthographicCameraRig({
    target: builder.centre,
    zoom: CAMERA_ZOOM.min,
  });
  rig.resize(1280, 720);
  rig.apply();
  return rig;
}

function markerOf(builder: OverworldSceneBuilder, cityId: string): Object3D {
  const object = builder.root.getObjectByName(`city-${cityId}`);
  if (!object) {
    throw new Error(`No marker for ${cityId}`);
  }
  return object;
}

describe("OverworldSceneBuilder", () => {
  it("builds a slab, the wireframe Earth, one territory per region and one marker per city", () => {
    const builder = new OverworldSceneBuilder();
    builder.build(EARTH_MAP);
    const names = builder.root.children.map((child) => child.name);
    expect(names.filter((name) => name === "map-slab")).toHaveLength(1);
    expect(names.filter((name) => name === "earth-wireframe")).toHaveLength(1);
    expect(names.filter((name) => name === "region-territories")).toHaveLength(
      1,
    );
    for (const region of EARTH_MAP.regions) {
      expect(fillOf(builder, region.id).opacity).toBe(0);
      expect(
        builder.regionTerritories()?.outlineSegmentCount(region.id),
      ).toBeGreaterThan(0);
    }
    expect(names.filter((name) => name.startsWith("city-"))).toHaveLength(
      EARTH_MAP.cities.length,
    );
    expect(builder.cityIds()).toEqual(EARTH_MAP.cities.map((city) => city.id));
  });

  it("places markers inside the map plane and above the wireframe", () => {
    const builder = new OverworldSceneBuilder();
    builder.build(EARTH_MAP);
    for (const city of EARTH_MAP.cities) {
      const position = builder.markerWorldPosition(city.id);
      expect(position).toBeDefined();
      if (!position) continue;
      expect(position.x).toBeGreaterThanOrEqual(0);
      expect(position.x).toBeLessThanOrEqual(24);
      expect(position.z).toBeGreaterThanOrEqual(0);
      expect(position.z).toBeLessThanOrEqual(12);
      expect(position.y).toBeGreaterThanOrEqual(
        OVERWORLD_SCENE_CONFIG.markerLift,
      );
    }
    expect(builder.markerWorldPosition("atlantis")).toBeUndefined();
  });

  it("paints the slab top as the ui-bg ground with ocean sides, and disc markers without art", () => {
    const builder = new OverworldSceneBuilder();
    builder.build(EARTH_MAP);
    const slab = builder.root.getObjectByName("map-slab") as Mesh;
    const materials = slab.material as Material[];
    const top = materials[2] as MeshBasicMaterial;
    expect(top.map).toBeNull();
    expect(top.name).toBe("ui-bg");
    expect(top.color.getHex()).toBe(0x0b0d12);
    expect((materials[0] as MeshStandardMaterial).name).toBe("env-water-deep");
    // The slab is exactly the map plane, so the wireframe lines up with layout.
    const { width, depth } = (slab.geometry as BoxGeometry).parameters;
    expect(width).toBe(24);
    expect(depth).toBe(12);
    expect(
      markerOf(builder, "london").getObjectByName("city-stand-in-london"),
    ).toBeDefined();
    expect(builder.markerLook("london")?.model).toBe("stand-in");
  });

  it("draws the wireframe Earth on the map plane, under the markers (#1144)", () => {
    const builder = new OverworldSceneBuilder();
    builder.build(EARTH_MAP);
    const wireframe = builder.root.getObjectByName("earth-wireframe");
    expect(wireframe).toBeDefined();
    if (!wireframe) return;
    expect(wireframe.getObjectByName("earth-coastlines")).toBeDefined();
    expect(wireframe.getObjectByName("earth-graticule")).toBeDefined();
    const bounds = new Box3().setFromObject(wireframe);
    expect(bounds.min.x).toBeGreaterThanOrEqual(-0.02);
    expect(bounds.max.x).toBeLessThanOrEqual(24.02);
    expect(bounds.min.z).toBeGreaterThanOrEqual(-0.02);
    expect(bounds.max.z).toBeLessThanOrEqual(12.02);
    expect(bounds.min.y).toBeGreaterThan(0);
    expect(bounds.max.y).toBeLessThan(OVERWORLD_SCENE_CONFIG.markerLift);
    // A rebuild replaces it rather than stacking a second Earth.
    builder.build(EARTH_MAP);
    expect(wireframe.parent).toBeNull();
    expect(
      builder.root.children.filter((child) => child.name === "earth-wireframe"),
    ).toHaveLength(1);
  });

  it("stands the settlement model for each city's scale when a loader is given (#1155)", async () => {
    const models = fakeLoader();
    const builder = new OverworldSceneBuilder({ assets: { models } });
    builder.build(EARTH_MAP);
    await settled();
    for (const city of EARTH_MAP.cities) {
      expect(builder.markerLook(city.id)?.model).toBe("glb");
      expect(
        markerOf(builder, city.id).getObjectByName(`city-settlement-${city.id}`)
          ?.children,
      ).toBeDefined();
    }
    const london = EARTH_MAP.cities.find((city) => city.id === "london");
    expect(
      markerOf(builder, "london").getObjectByName("city-settlement-london")
        ?.name,
    ).toBe("city-settlement-london");
    expect(models.asked).toContain(
      `overworld.settlement.${london?.scale ?? ""}`,
    );
  });

  it("adds the egg overlay to a city with a clearance mission on offer and removes it after (#1155)", async () => {
    const builder = new OverworldSceneBuilder({
      assets: { models: fakeLoader() },
    });
    builder.build(EARTH_MAP);
    builder.update(
      stateOf(EARTH_MAP, { missionCueCityIds: new Set(["london"]) }),
    );
    await settled();
    expect(builder.markerLook("london")?.mission).toBe(true);
    expect(
      markerOf(builder, "london").getObjectByName("city-eggs-london"),
    ).toBeDefined();
    expect(builder.markerLook("new-york")?.mission).toBe(false);
    expect(
      markerOf(builder, "new-york").getObjectByName("city-eggs-new-york"),
    ).toBeUndefined();
    builder.update(stateOf(EARTH_MAP));
    expect(builder.markerLook("london")?.mission).toBe(false);
    expect(
      markerOf(builder, "london").getObjectByName("city-eggs-london"),
    ).toBeUndefined();
  });

  it("places every installation in its region, dims offline ones and idles them through the animator (#1155)", async () => {
    const builder = new OverworldSceneBuilder({
      assets: { models: fakeLoader() },
    });
    builder.build(EARTH_MAP);
    const deployables: Deployable[] = [
      {
        id: "deployable-1",
        typeId: "sensor-array",
        regionId: "east-asia",
        builtDay: 1,
        online: true,
      },
      {
        id: "deployable-2",
        typeId: "defensive-battery",
        regionId: "east-asia",
        builtDay: 2,
        online: false,
      },
    ];
    builder.update(stateOf(EARTH_MAP, { deployables }));
    await settled();
    expect([...builder.installationIds()].sort()).toEqual([
      "deployable-1",
      "deployable-2",
    ]);
    expect(builder.installationLook("deployable-1")?.online).toBe(true);
    expect(builder.installationLook("deployable-2")?.online).toBe(false);
    const at = builder.installationWorldPosition("deployable-1");
    expect(at?.y).toBe(OVERWORLD_SCENE_CONFIG.markerLift);
    expect(
      builder.root.getObjectByName("installation-deployable-1"),
    ).toBeDefined();
    // A GLB stand-in from the fake loader has no `animated` node, so nothing turns; the tick must still be safe.
    builder.animator.update(1);
    builder.update(stateOf(EARTH_MAP));
    expect(builder.installationIds()).toEqual([]);
    expect(
      builder.root.getObjectByName("installation-deployable-1"),
    ).toBeUndefined();
  });

  it("picks settlements through the real camera too", () => {
    const builder = new OverworldSceneBuilder({
      assets: { models: fakeLoader() },
    });
    builder.build(EARTH_MAP);
    const rig = makeCamera(builder);
    for (const cityId of ["london", "new-york", "sydney"]) {
      const world = builder.markerWorldPosition(cityId);
      if (!world) throw new Error(`missing ${cityId}`);
      const ndc = new Vector3(world.x, world.y, world.z).project(rig.camera);
      expect(builder.pickCity({ x: ndc.x, y: ndc.y }, rig.camera)).toBe(cityId);
    }
  });

  it("leaves the shared art alone on dispose", () => {
    const label = new Texture();
    const disposed: string[] = [];
    label.addEventListener("dispose", () => disposed.push("label"));
    const builder = new OverworldSceneBuilder({
      assets: { models: fakeLoader(), text: { textTexture: () => label } },
    });
    builder.build(EARTH_MAP);
    builder.dispose();
    expect(disposed).toEqual([]);
  });

  it("update recolours markers in place without rebuilding", () => {
    const builder = new OverworldSceneBuilder();
    builder.build(EARTH_MAP);
    const before = [...builder.root.children];
    const london = markerOf(builder, "london");
    const halo = london.getObjectByName("city-halo-london") as Mesh;
    const material = halo.material as MeshBasicMaterial;
    expect(material.color.getHex()).toBe(rampStop(0));

    builder.update(stateOf(withInfestation(EARTH_MAP, "london", 100)));

    expect(material.color.getHex()).toBe(rampStop(3));
    expect(builder.root.children).toEqual(before);
    expect(markerOf(builder, "london")).toBe(london);
  });

  it("fills a region with its worst city, not its average (#440)", () => {
    const builder = new OverworldSceneBuilder();
    builder.build(EARTH_MAP);
    const london = EARTH_MAP.cities.find((city) => city.id === "london");
    if (!london) throw new Error("fixture has no london");
    const clean = fillOf(builder, london.regionId);
    expect(clean.opacity).toBe(0);

    builder.update(stateOf(withInfestation(EARTH_MAP, "london", 100)));

    // One city at 100 among clean neighbours still lights the region.
    const lit = fillOf(builder, london.regionId);
    expect(lit.opacity).toBeGreaterThan(0);
    expect(lit.colour).toBe(rampStop(3));
  });

  it("leaves other regions clean when one city is infested (#440)", () => {
    const builder = new OverworldSceneBuilder();
    builder.build(EARTH_MAP);
    const london = EARTH_MAP.cities.find((city) => city.id === "london");
    if (!london) throw new Error("fixture has no london");

    builder.update(stateOf(withInfestation(EARTH_MAP, "london", 100)));

    for (const region of EARTH_MAP.regions) {
      if (region.id === london.regionId) {
        continue;
      }
      expect(fillOf(builder, region.id).opacity).toBe(0);
    }
  });

  it("lights the selected city's region outline, with no fill and no other region (#1149)", () => {
    const builder = new OverworldSceneBuilder();
    builder.build(EARTH_MAP);
    const london = EARTH_MAP.cities.find((city) => city.id === "london");
    if (!london) throw new Error("fixture has no london");
    const outline = outlineOf(builder);
    expect(outline.visible).toBe(false);

    builder.setSelected("london");

    expect(builder.regionTerritories()?.selectedRegion()).toBe(london.regionId);
    expect(outline.visible).toBe(true);
    expect((outline.material as LineBasicMaterial).color.getHex()).toBe(
      SELECTION_COLOUR,
    );
    const coast = builder.root.getObjectByName(
      "territory-selection-coast",
    ) as LineSegments;
    expect(coast.visible).toBe(true);
    expect(
      outline.geometry.getAttribute("position").count / 2 +
        coast.geometry.getAttribute("position").count / 2,
    ).toBe(builder.regionTerritories()?.outlineSegmentCount(london.regionId));
    // Selection is an outline, not a wash: every fill stays clean.
    for (const region of EARTH_MAP.regions) {
      expect(fillOf(builder, region.id).opacity).toBe(0);
    }

    builder.setSelected(undefined);
    expect(outline.visible).toBe(false);
    expect(builder.regionTerritories()?.selectedRegion()).toBeUndefined();
  });

  it("update rebuilds when the set of cities changes", () => {
    const builder = new OverworldSceneBuilder();
    builder.build(EARTH_MAP);
    const london = markerOf(builder, "london");
    const fewer: EarthMap = {
      regions: EARTH_MAP.regions.map((region) => ({
        ...region,
        cityIds: region.cityIds.filter((id) => id !== "london"),
      })),
      cities: EARTH_MAP.cities.filter((city) => city.id !== "london"),
    };
    builder.update(stateOf(fewer));
    expect(builder.root.getObjectByName("city-london")).toBeUndefined();
    expect(builder.cityIds()).toHaveLength(EARTH_MAP.cities.length - 1);
    expect(london.parent).toBeNull();
  });

  it("picks the city whose marker sits under a projected point", () => {
    const builder = new OverworldSceneBuilder();
    builder.build(EARTH_MAP);
    const rig = makeCamera(builder);
    for (const cityId of ["london", "new-york", "sydney"]) {
      const world = builder.markerWorldPosition(cityId);
      if (!world) throw new Error(`missing ${cityId}`);
      const ndc = new Vector3(world.x, world.y, world.z).project(rig.camera);
      expect(builder.pickCity({ x: ndc.x, y: ndc.y }, rig.camera)).toBe(cityId);
    }
  });

  it("returns undefined when nothing is under the point", () => {
    const builder = new OverworldSceneBuilder();
    builder.build(EARTH_MAP);
    const rig = makeCamera(builder);
    expect(
      builder.pickCity({ x: -0.999, y: 0.999 }, rig.camera),
    ).toBeUndefined();
  });

  it("applies hover and selection to exactly one marker at a time", () => {
    const builder = new OverworldSceneBuilder();
    builder.build(EARTH_MAP);
    const body = (id: string): Object3D =>
      markerOf(builder, id).getObjectByName(`city-visual-${id}`)!;
    const ring = (id: string): boolean =>
      markerOf(builder, id).getObjectByName(`city-ring-${id}`)?.visible ??
      false;

    builder.setHovered("london");
    expect(body("london").scale.x).toBeGreaterThan(1);
    expect(body("new-york").scale.x).toBe(1);
    builder.setHovered("new-york");
    expect(body("london").scale.x).toBe(1);
    expect(body("new-york").scale.x).toBeGreaterThan(1);
    builder.setHovered(undefined);
    expect(body("new-york").scale.x).toBe(1);

    builder.setSelected("sydney");
    expect(builder.getSelected()).toBe("sydney");
    expect(ring("sydney")).toBe(true);
    expect(ring("london")).toBe(false);
    builder.setSelected("london");
    expect(ring("sydney")).toBe(false);
    expect(ring("london")).toBe(true);
  });

  it("keeps the selection across an update", () => {
    const builder = new OverworldSceneBuilder();
    builder.build(EARTH_MAP);
    builder.setSelected("london");
    builder.update(stateOf(withInfestation(EARTH_MAP, "london", 40)));
    const ring = markerOf(builder, "london").getObjectByName(
      "city-ring-london",
    );
    expect(ring?.visible).toBe(true);
  });

  it("dispose empties the root and forgets every city", () => {
    const builder = new OverworldSceneBuilder();
    builder.build(EARTH_MAP);
    builder.dispose();
    expect(builder.root.children).toHaveLength(0);
    expect(builder.cityIds()).toEqual([]);
    expect(builder.markerWorldPosition("london")).toBeUndefined();
  });
});
