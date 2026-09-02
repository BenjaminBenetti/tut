import type { Mesh, MeshStandardMaterial, Object3D } from "three";
import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { EARTH_MAP } from "../../overworld/data/earth-map";
import type { City } from "../../overworld/model/city";
import type { EarthMap } from "../../overworld/model/earth-map";
import { CAMERA_ZOOM } from "../model/camera-state";
import { INFESTATION_RAMP } from "../view/city-marker";
import { IsometricCameraRig } from "./isometric-camera-rig";
import { OverworldSceneBuilder } from "./overworld-scene-builder";

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

function makeCamera(builder: OverworldSceneBuilder): IsometricCameraRig {
  const rig = new IsometricCameraRig({
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
  it("builds an ocean, one plate per region and one marker per city", () => {
    const builder = new OverworldSceneBuilder();
    builder.build(EARTH_MAP);
    const names = builder.root.children.map((child) => child.name);
    expect(names.filter((name) => name === "ocean")).toHaveLength(1);
    expect(names.filter((name) => name.startsWith("region-"))).toHaveLength(
      EARTH_MAP.regions.length,
    );
    expect(names.filter((name) => name.startsWith("city-"))).toHaveLength(
      EARTH_MAP.cities.length,
    );
    expect(builder.cityIds()).toEqual(EARTH_MAP.cities.map((city) => city.id));
  });

  it("places markers inside the map plane and on top of the plates", () => {
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
      expect(position.y).toBeGreaterThan(0.15);
    }
    expect(builder.markerWorldPosition("atlantis")).toBeUndefined();
  });

  it("update recolours markers in place without rebuilding", () => {
    const builder = new OverworldSceneBuilder();
    builder.build(EARTH_MAP);
    const before = [...builder.root.children];
    const london = markerOf(builder, "london");
    const body = london.getObjectByName("city-body-london") as Mesh;
    const material = body.material as MeshStandardMaterial;
    expect(material.color.getHex()).toBe(INFESTATION_RAMP.clear);

    builder.update(withInfestation(EARTH_MAP, "london", 100));

    expect(material.color.getHex()).toBe(INFESTATION_RAMP.overrun);
    expect(builder.root.children).toEqual(before);
    expect(markerOf(builder, "london")).toBe(london);
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
    builder.update(fewer);
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
    const body = (id: string): Mesh =>
      markerOf(builder, id).getObjectByName(`city-body-${id}`) as Mesh;
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
    builder.update(withInfestation(EARTH_MAP, "london", 40));
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
